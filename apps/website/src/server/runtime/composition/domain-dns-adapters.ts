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
function dnsUnavailable(): ToolInputError { return new ToolInputError(DNS_UNAVAILABLE); }
/** Validates untrusted record shape and address class; bounded DNS strings are returned only as data. */
function readAnswer(answer: unknown): { type: number; value: string; ttl: number } {
  if (typeof answer !== "object" || answer === null) throw dnsUnavailable();
  const row = answer as Record<string, unknown>;
  if (typeof row.type !== "number" || typeof row.name !== "string" || typeof row.data !== "string" || row.data.length > 4096 || typeof row.TTL !== "number" || !Number.isInteger(row.TTL) || row.TTL < 0) throw dnsUnavailable();
  let value = row.data;
  if (row.type === 1 || row.type === 28) {
    if (isIP(row.data) !== (row.type === 1 ? 4 : 6)) throw dnsUnavailable();
    value = row.type === 28 ? new URL(`https://[${row.data}]/`).hostname.slice(1, -1) : row.data;
    if (classifyAddress(value) !== "public") throw new ToolInputError("domain_lookup_dns: public DNS returned a non-public address. Internal addresses cannot be inspected with this tool.");
  }
  return { type: row.type, value, ttl: row.TTL };
}
/** Parses a capped public DoH response. No-data/NXDOMAIN remain distinct from failures. O(answers). */
function readDnsResponse(bodyText: string, type: DnsRecordType): DnsQuery {
  let payload: unknown;
  try { payload = JSON.parse(bodyText); } catch { throw dnsUnavailable(); }
  if (typeof payload !== "object" || payload === null) throw dnsUnavailable();
  const body = payload as Record<string, unknown>;
  if (body.TC === true) throw dnsUnavailable();
  if (body.Status === 3) return { type, status: "not-found", records: [] };
  if (body.Status !== 0) throw dnsUnavailable();
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
export function createPublicDnsResolver(client: HttpClientPort, options: DiagnosticOptions = {}): PublicDnsResolver {
  return { query: async ({ domain, type }) => {
    const hostname = readPublicDnsName(domain, "domain_lookup_dns");
    let outcome: DiagnosticOutcome = "unavailable";
    try {
      const response = await client.send({ method: "GET", url: `https://cloudflare-dns.com/dns-query?${new URLSearchParams({ name: hostname, type })}`, headers: { Accept: "application/dns-json" }, timeoutMs: 15000, signal: options.createDeadline?.() ?? AbortSignal.timeout(15000), maxResponseBytes: 65536 });
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
    const hostname = readPublicDomain(domain, "domain_tls_status");
    let outcome: DiagnosticOutcome = "unavailable";
    try {
      const response = await client.send({ method: "HEAD", url: `https://${hostname}/`, headers: {}, timeoutMs: 15000, signal: options.createDeadline?.() ?? AbortSignal.timeout(15000), maxResponseBytes: 65536 });
      outcome = "verified";
      return { status: "verified", httpStatus: response.status };
    } catch (error) {
      if (error instanceof EgressRefusedError) {
        outcome = "refused";
        throw new ToolInputError(`domain_tls_status: ${error.callerSafeMessage}`);
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
    return readPublicDomain(url.hostname, "domain_check_dns");
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
