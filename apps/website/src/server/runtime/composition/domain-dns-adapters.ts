import { readFileSync } from "node:fs";
import path from "node:path";
import { bundledContributionSources } from "#src/features/agent-plugins/bundled-contribution-sources";
import { isIP } from "node:net";
import { ToolInputError } from "@jini-ai/core";
import { EgressRefusedError, type HttpClientPort, type EgressPolicy } from "#src/platform/http/index";
import { classifyAddress } from "#src/platform/http/client";
import { readPublicDomain, readPublicDnsName, type PublicDnsResolver, type DnsQuery, type DnsRecordType, type TlsStatus } from "#src/features/domain-dns/index";
import type { RouteDeps } from "../../routes/types.js";

/** Uses the existing pinned-public-peer guard, with no redirects, dev exemptions, or large bodies. */
export const DOMAIN_DNS_EGRESS_POLICY: EgressPolicy = {
  allowedSchemes: ["https"], denyPrivateAddresses: true, devHostAllowlist: [], maxRedirects: 0,
  connectTimeoutMs: 15000, maxResponseBytes: 65536, maxDecompressedBytes: 65536,
};
const TYPE_CODES: Record<DnsRecordType, number> = { A: 1, AAAA: 28, CNAME: 5, MX: 15, TXT: 16, NS: 2 };
const DNS_UNAVAILABLE = "domain_lookup_dns: the public DNS resolver could not answer. Try again later; no DNS conclusion was reached.";
/** Refusals contain no raw resolver response or internal transport error detail. */
function dnsUnavailable(): ToolInputError { return new ToolInputError({ message: DNS_UNAVAILABLE }); }
type DnsAnswer = { type: number; name: string; data: string; TTL: number };
/** Validate bounded record fields before interpreting address data; invalid shapes refuse. O(1). */
function readAnswerFields({ row }: { row: Record<string, unknown> }, _options = {}): DnsAnswer {
  if (typeof row.type !== "number" || typeof row.name !== "string" || typeof row.data !== "string" || row.data.length > 4096) throw dnsUnavailable();
  if (typeof row.TTL !== "number" || !Number.isInteger(row.TTL) || row.TTL < 0) throw dnsUnavailable();
  return row as DnsAnswer;
}
/** Validates untrusted record shape and address class; bounded DNS strings are returned only as data. */
function readAnswer(answer: unknown): { type: number; value: string; ttl: number } {
  if (typeof answer !== "object" || answer === null) throw dnsUnavailable();
  const valid = readAnswerFields({ row: answer as Record<string, unknown> });
  let value = valid.data;
  if (valid.type === 1 || valid.type === 28) {
    if (isIP(valid.data) !== (valid.type === 1 ? 4 : 6)) throw dnsUnavailable();
    value = valid.type === 28 ? new URL(`https://[${valid.data}]/`).hostname.slice(1, -1) : valid.data;
    if (classifyAddress(value) !== "public") throw new ToolInputError({ message: "domain_lookup_dns: public DNS returned a non-public address. Internal addresses cannot be inspected with this tool." });
  }
  return { type: valid.type, value, ttl: valid.TTL };
}
/** Preserve truncation/status precedence before inspecting answer records. O(1). */
function readDnsEnvelope({ payload }: { payload: unknown }, _options = {}): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null) throw dnsUnavailable();
  const body = payload as Record<string, unknown>;
  if (body.TC === true) throw dnsUnavailable();
  if (body.Status !== 3 && body.Status !== 0) throw dnsUnavailable();
  return body;
}
/** Parses a capped public DoH response. No-data/NXDOMAIN remain distinct from failures. O(answers). */
function readDnsResponse(bodyText: string, type: DnsRecordType): DnsQuery {
  let payload: unknown;
  try { payload = JSON.parse(bodyText); } catch { throw dnsUnavailable(); }
  const body = readDnsEnvelope({ payload });
  if (body.Status === 3) return { type, status: "not-found", records: [] };
  const raw = body.Answer ?? [];
  if (!Array.isArray(raw) || raw.length > 50) throw dnsUnavailable();
  const records = raw.map(readAnswer).filter(row => row.type === TYPE_CODES[type]).map(({ value, ttl }) => ({ value, ttl }));
  return { type, status: records.length ? "ok" : "no-data", records };
}
type DiagnosticOutcome = DnsQuery["status"] | TlsStatus["status"] | "refused";
interface DiagnosticOptions {
  /** Test seam for the whole-request deadline; production uses AbortSignal.timeout(15000). */
  createDeadline?: () => AbortSignal;
  /** Local outcome instrumentation; never includes domain names, record values, or certificate/error text. */
  observe?: (event: { operation: "dns" | "tls"; outcome: DiagnosticOutcome }) => void;
}
/** Creates a replaceable public-DNS resolver using only an injected guarded HTTP client. */
export function createPublicDnsResolver({ client, url }: { readonly client: HttpClientPort; readonly url: string }, options: DiagnosticOptions = {}): PublicDnsResolver {
  return { query: async ({ domain, type }) => {
    const hostname = readPublicDnsName({ value: domain, errorPrefix: "domain_lookup_dns" });
    let outcome: DiagnosticOutcome = "unavailable";
    try {
      const response = await client.send({ method: "GET", url: `${url}?${new URLSearchParams({ name: hostname, type })}`, headers: { Accept: "application/dns-json" }, timeoutMs: 15000, signal: options.createDeadline?.() ?? AbortSignal.timeout(15000), maxResponseBytes: 65536 });
      if (response.status !== 200 || response.bodyTruncated || Buffer.byteLength(response.bodyText) > 65536) throw dnsUnavailable();
      const result = readDnsResponse(response.bodyText, type);
      outcome = result.status;
      return result;
    } catch (error) {
      if (error instanceof ToolInputError) {
        outcome = error.message === DNS_UNAVAILABLE ? "unavailable" : "refused";
        throw error;
      }
      throw dnsUnavailable();
    } finally {
      options.observe?.({ operation: "dns", outcome });
    }
  } };
}
const CERTIFICATE_FAILURES = new Set(["CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "ERR_TLS_CERT_ALTNAME_INVALID", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_REVOKED", "CERT_SIGNATURE_FAILURE"]);
/** Classifies certificate errors by code, including wrapped causes, without reflecting raw messages. */
function isCertificateFailure(error: unknown): boolean {
  for (let depth = 0; depth < 4 && typeof error === "object" && error !== null; depth++) {
    const record = error as { code?: unknown; cause?: unknown };
    if (typeof record.code === "string" && CERTIFICATE_FAILURES.has(record.code)) return true;
    error = record.cause;
  }
  return false;
}
/** One HTTPS/443 HEAD validates trust/hostname/date through the existing TLS transport; never follows redirects. */
export function createTlsProbe(client: HttpClientPort, options: DiagnosticOptions = {}): (input: { domain: string }) => Promise<TlsStatus> {
  return async ({ domain }) => {
    const hostname = readPublicDomain({ value: domain, errorPrefix: "domain_tls_status" });
    let outcome: DiagnosticOutcome = "unavailable";
    try {
      const response = await client.send({ method: "HEAD", url: `https://${hostname}/`, headers: {}, timeoutMs: 15000, signal: options.createDeadline?.() ?? AbortSignal.timeout(15000), maxResponseBytes: 65536 });
      outcome = "verified";
      return { status: "verified", httpStatus: response.status };
    } catch (error) {
      if (error instanceof EgressRefusedError) {
        outcome = "refused";
        throw new ToolInputError({ message: `domain_tls_status: ${error.callerSafeMessage}` });
      }
      outcome = isCertificateFailure(error) ? "invalid" : "unavailable";
      return { status: outcome, httpStatus: null };
    } finally {
      options.observe?.({ operation: "tls", outcome });
    }
  };
}
/** Extracts safe HTTPS hostnames from saved URLs; credentials, ports, and private-name forms are discarded. */
function hostingHostname(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
    return readPublicDomain({ value: url.hostname, errorPrefix: "domain_check_dns" });
  } catch { return null; }
}
type SavedHostingDeps = Pick<RouteDeps, "workspaceId"> & {
  publishContentPeerRepo: Pick<RouteDeps["publishContentPeerRepo"], "listByWorkspace">;
  publishHistoryStore: Pick<RouteDeps["publishHistoryStore"], "list">;
};
/** Reads only workspace-scoped peer URLs and the latest confirmed publish per target in a bounded history window. O(r log r) time and O(r) space for r saved URLs. */
export async function listSavedHostingHosts(deps: SavedHostingDeps): Promise<string[]> {
  const peers = await deps.publishContentPeerRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  const history = await deps.publishHistoryStore.list({ workspaceId: deps.workspaceId, limit: 100 });
  const seen = new Set<string>();
  const urls = peers.map(peer => peer.baseUrl);
  for (const row of history) {
    if (!row.reachable || seen.has(row.target)) continue;
    seen.add(row.target);
    urls.push(row.url);
  }
  return [...new Set(urls.map(hostingHostname).filter((host): host is string => host !== null))].sort();
}

/** Reads the shipped public resolver declaration without activating or executing plugin code.
 * @param required Product-owned bundled root. @returns The single dns-json HTTPS endpoint.
 * @throws {ToolInputError} Missing, ambiguous or malformed resolver data; no fallback resolver. */
export function readBundledPublicDnsResolverUrl(required: { readonly sourceRoot: string }, _optional = {}): string {
  const urls: string[] = [];
  let sources;
  try { sources = bundledContributionSources({ ...required, filename: "plugin.json" }); } catch { throw dnsUnavailable(); }
  for (const plugin of sources) {
    let manifest: unknown;
    try { manifest = JSON.parse(readFileSync(path.join(plugin.packageRoot, "plugin.json"), "utf8")); }
    catch { continue; }
    const url = publicDnsDeclarationUrl({ manifest });
    if (url !== undefined) urls.push(url);
  }
  if (urls.length !== 1) throw dnsUnavailable();
  return urls[0]!;
}

/** Validate endpoint data while leaving request bounds, parsing and egress in the resolver. */
function publicDnsDeclarationUrl({ manifest }: { readonly manifest: unknown }, _optional = {}): string | undefined {
  const declaration = (manifest as { extensions?: { tovu?: { publicDnsResolver?: { format?: unknown; url?: unknown } } } } | null)?.extensions?.tovu?.publicDnsResolver;
  if (declaration === undefined) return undefined;
  return dnsJsonEndpointUrl({ declaration });
}

/** A shipped resolver must be an HTTPS dns-json endpoint without credentials or URL state. */
function dnsJsonEndpointUrl({ declaration }: { readonly declaration: { format?: unknown; url?: unknown } | null }, _optional = {}): string {
  if (declaration?.format !== "dns-json" || typeof declaration.url !== "string") throw dnsUnavailable();
  let url: URL;
  try { url = new URL(declaration.url); } catch { throw dnsUnavailable(); }
  if (!isBareHttpsEndpoint({ url })) throw dnsUnavailable();
  return declaration.url;
}

/** URL shape policy, independent of declaration shape and URL parsing. O(1). */
function isBareHttpsEndpoint({ url }: { url: URL }, _options = {}): boolean {
  return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
}

/** Resolve immutable shipped metadata once. A failure refuses DNS queries without breaking catalog boot. */
export function createBundledPublicDnsResolver(required: { client: HttpClientPort; sourceRoot: string }, options: DiagnosticOptions = {}): PublicDnsResolver {
  try { return createPublicDnsResolver({ client: required.client, url: readBundledPublicDnsResolverUrl({ sourceRoot: required.sourceRoot }) }, options); }
  catch { return { query: async () => { throw dnsUnavailable(); } }; }
}
