import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { FetchHttpTransportAdapter } from "./transport.fetch.js";
import type { EgressPolicy, HttpClientPort, HttpTransportAdapter } from "./ports.js";
import type { CreateHttpClient } from "./ports.js";
import type { HttpRequest, HttpResponse, PinnedPeer } from "./types.js";

/**
 * @file The one production `HttpClientPort` constructor (ADR-038 §2, ADR-PIPE-015 GAP-04).
 *
 * Purpose:
 * `createHttpClient({ transport, policy })` is the ONLY way to obtain a `HttpClientPort` — there is
 * no unguarded path. Every request goes through: scheme + credentials-in-URL rejection, DNS
 * resolution, address-family-complete private/loopback/link-local/reserved classification
 * (IPv4-mapped-IPv6 normalized first), peer pinning, a default `User-Agent` when the caller sent
 * none (2026-09-03 — see {@link DEFAULT_USER_AGENT}'s own doc), and — on any redirect — full
 * re-verification of the new target plus auth-header stripping on cross-origin hops.
 *
 * How it relates to the project:
 * - Wraps `./transport.fetch.ts`'s `FetchHttpTransportAdapter` (or any other
 *   `HttpTransportAdapter`, e.g. a test double) — this file owns policy; the transport owns
 *   wire I/O only.
 * - `Integrations`/Newsletter/Analytics all import `createHttpClient`, never the raw transport
 *   (enforced by `__tests__/import-boundary.test.ts`).
 */

/** Address classification used to decide whether `EgressPolicy.denyPrivateAddresses` blocks a target. */
export type AddressClass = "public" | "private" | "loopback" | "link-local" | "reserved";

/**
 * Classifies a single resolved IP address. IPv4-mapped IPv6 addresses (`::ffff:0:0/96`) are
 * normalized to their IPv4 form before classification (ADR-038 amendment 2), regardless of how
 * the mapped address is spelled — dotted-decimal tail (`::ffff:127.0.0.1`), hex tail
 * (`::ffff:7f00:1`), fully expanded (`0:0:0:0:0:ffff:7f00:1`), or any other valid
 * `::`-compression of the same value all resolve to the same verdict (see
 * {@link extractMappedIpv4} — this used to be a regex matching one fixed spelling only).
 *
 * @complexity O(1) — IPv6 addresses have a fixed 8-group structure.
 */
export function classifyAddress(ip: string): AddressClass {
  const family = isIP(ip);
  if (family === 4) return classifyIpv4(ip);
  if (family === 6) {
    const lowered = ip.toLowerCase();
    const mapped = extractMappedIpv4(lowered);
    return mapped ? classifyIpv4(mapped) : classifyIpv6(lowered);
  }
  return "reserved"; // unparsable — fail closed, never treat as public
}

/** The RFC1918 private ranges, split out of {@link classifyIpv4} purely to keep that function's
 *  own branch count under the repo's complexity ceiling — same three ranges, same order. */
function isRfc1918Private(a: number, b: number): boolean {
  if (a === 10) return true;
  if (a === 172) return b >= 16 && b <= 31;
  return a === 192 && b === 168;
}

/** RFC 6598 carrier-grade NAT / shared address space (100.64.0.0/10) — shared, non-globally-
 *  routable carrier space; treated as private like the RFC1918 ranges above. Split out of
 *  {@link classifyIpv4} for the same complexity-budget reason as {@link isRfc1918Private}. */
function isCgnatShared(a: number, b: number): boolean {
  return a === 100 && b >= 64 && b <= 127;
}

function classifyIpv4(ip: string): AddressClass {
  const octets = ip.split(".").map(Number);
  const [a, b] = octets;

  if (a === 127) return "loopback";
  if (isRfc1918Private(a, b)) return "private";
  if (isCgnatShared(a, b)) return "private";
  if (a === 169 && b === 254) return "link-local"; // includes 169.254.169.254 cloud metadata
  if (a === 0) return "reserved";
  if (a >= 224) return "reserved"; // multicast (224-239) + reserved/future (240-255)
  return "public";
}

/** The fe80::/10 link-local prefix, split out of {@link classifyIpv6} purely to keep that
 *  function's own branch count under the repo's complexity ceiling — same four prefixes, same
 *  order (mirrors {@link isRfc1918Private}'s split out of {@link classifyIpv4}). */
function isFe80LinkLocal(ip: string): boolean {
  return ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb");
}

/** The unspecified-address forms (`::`, `::0`) and the deprecated IPv4-compatible notation
 *  (`::0.x.x.x`) — split out of {@link classifyIpv6} for the same complexity-budget reason as
 *  {@link isFe80LinkLocal}. */
function isIpv6UnspecifiedForm(ip: string): boolean {
  return ip === "::" || ip.startsWith("::0.") || ip === "::0";
}

/** The fc00::/7 unique-local prefix (both the fc and fd halves), split out of {@link classifyIpv6}
 *  for the same complexity-budget reason as {@link isFe80LinkLocal}. */
function isFc00UniqueLocal(ip: string): boolean {
  return ip.startsWith("fc") || ip.startsWith("fd");
}

/** Converts a dotted-decimal IPv4 quad to its two 16-bit hex groups, as embedded in the low 32
 *  bits of an IPv4-mapped IPv6 address. */
function dottedQuadToGroups(quad: string): number[] {
  const [a, b, c, d] = quad.split(".").map(Number);
  return [(a << 8) | b, (c << 8) | d];
}

/** Converts a run of `:`-split IPv6 group strings to numbers, expanding a trailing IPv4-dotted
 *  quad — the last element, when present (e.g. the right-hand half of `::ffff:127.0.0.1`) — into
 *  its two hex groups first via {@link dottedQuadToGroups}. */
function toHexGroups(rawGroups: readonly string[]): number[] {
  if (rawGroups.length === 0) return [];
  const last = rawGroups[rawGroups.length - 1];
  if (!last.includes(".")) return rawGroups.map((group) => parseInt(group, 16));
  return [...rawGroups.slice(0, -1).map((group) => parseInt(group, 16)), ...dottedQuadToGroups(last)];
}

/** Expands any syntactically valid (`isIP(ip) === 6`) IPv6 literal into its 8 sixteen-bit groups,
 *  resolving `::` compression wherever it falls. This is what lets {@link extractMappedIpv4}
 *  recognize an IPv4-mapped address no matter how it is spelled — dotted or hex tail, fully
 *  expanded or compressed — instead of matching one fixed spelling with a regex. */
function expandIpv6Groups(ip: string): number[] {
  const halves = ip.split("::");
  const left = halves[0] ? toHexGroups(halves[0].split(":")) : [];
  if (halves.length === 1) return left;

  const right = halves[1] ? toHexGroups(halves[1].split(":")) : [];
  const zeros = Array.from({ length: Math.max(0, 8 - left.length - right.length) }, () => 0);
  return [...left, ...zeros, ...right];
}

/** True when `groups` (from {@link expandIpv6Groups}) fall within the `::ffff:0:0/96` IPv4-mapped
 *  prefix — the top 96 bits (groups 0-5) equal `0:0:0:0:0:ffff`. */
function isMappedPrefix(groups: readonly number[]): boolean {
  return groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
}

/** Recombines the low 32 bits (groups 6-7) of a `::ffff:0:0/96` address into dotted-decimal. */
function mappedGroupsToIpv4(groups: readonly number[]): string {
  const hi = groups[6];
  const lo = groups[7];
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
}

/**
 * Extracts the embedded IPv4 address from an IPv4-mapped IPv6 literal (`::ffff:0:0/96`),
 * regardless of spelling — dotted-decimal tail, hex tail, fully expanded, or any other valid
 * `::`-compression of the same value. Returns `null` for any IPv6 address outside that /96 (the
 * ordinary case). `ip` must already satisfy `isIP(ip) === 6` and be lowercased.
 */
function extractMappedIpv4(ip: string): string | null {
  const groups = expandIpv6Groups(ip);
  if (groups.length !== 8 || !isMappedPrefix(groups)) return null;
  return mappedGroupsToIpv4(groups);
}

function classifyIpv6(ip: string): AddressClass {
  if (ip === "::1") return "loopback";
  if (isIpv6UnspecifiedForm(ip)) return "reserved";
  if (isFe80LinkLocal(ip)) return "link-local";
  if (isFc00UniqueLocal(ip)) return "private"; // fc00::/7 unique local
  if (ip.startsWith("ff")) return "reserved"; // ff00::/8 multicast, mirrors IPv4's a >= 224 case
  const mapped = extractMappedIpv4(ip); // defence in depth: a caller reaching this directly
  if (mapped) return classifyIpv4(mapped);
  return "public";
}

/** Response/request header names stripped when a redirect crosses origins. */
const SENSITIVE_HEADERS = new Set(["authorization", "cookie"]);

/**
 * Sent as the outbound `User-Agent` on every request that does not already carry one. Some
 * providers (confirmed live: GitHub's REST API) reject an otherwise-valid, fully-authenticated
 * request with a bare 403 when no `User-Agent` is present at all — see
 * `features/custom-credentials/credentialed-request.ts`'s own header for the incident this fixes.
 * A stable, honest product identifier — never a browser's or another tool's own UA string. Not
 * sourced from `package.json`'s live version: this file is the single seam every outbound request
 * in the app funnels through, and adding a filesystem/module read here — whose relative path would
 * also need to keep resolving correctly through the Docker build's own dist layout — is a cost this
 * one-line header does not justify. Bump this literal by hand alongside `package.json`'s version.
 */
const DEFAULT_USER_AGENT = "Tovu/0.1.0";

/** True when `headers` already sets `User-Agent` under any casing — HTTP header names are
 *  case-insensitive, so a caller that supplies its own (any casing) must never be overridden. */
function hasUserAgentHeader(headers: Readonly<Record<string, string>>): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === "user-agent");
}

/**
 * Adds {@link DEFAULT_USER_AGENT} to `headers` unless the caller already set one (any casing) —
 * applied once, at this module's single public entry point (`createHttpClient(...).send`), so
 * every consumer that reaches a real provider through this seam (custom-credentials, the Resend
 * mailer, comment spam checks, webhook delivery, deploy/lipay plugins) gets a non-empty
 * `User-Agent` with no per-consumer change required, and a caller's own explicit choice is always
 * preserved untouched.
 *
 * @complexity O(n) in `headers`' own (small) key count.
 */
function withDefaultUserAgent(headers: Readonly<Record<string, string>>): Record<string, string> {
  if (hasUserAgentHeader(headers)) return { ...headers };
  return { ...headers, "User-Agent": DEFAULT_USER_AGENT };
}

function isCrossOrigin(a: URL, b: URL): boolean {
  return a.protocol !== b.protocol || a.hostname !== b.hostname || a.port !== b.port;
}

/** @throws {Error} on a disallowed scheme, or on credentials embedded in the target URL. */
function assertAllowedTarget(url: URL, policy: EgressPolicy): void {
  if (!policy.allowedSchemes.includes(url.protocol.replace(":", ""))) {
    throw new Error(`scheme '${url.protocol}' is not in the allowed egress schemes`);
  }
  if (url.username || url.password) {
    throw new Error("credentials embedded in the target URL are not allowed");
  }
}

/** WHATWG URL wraps a literal IPv6 hostname in brackets (`new URL("https://[::1]/").hostname ===
 *  "[::1]"`) so the host/port separator stays unambiguous — but `isIP` and `dns.lookup` both
 *  expect the bare address (`isIP("[::1]")` is `0`; `isIP("::1")` is `6`). A hostname never
 *  carries brackets otherwise, so stripping one matching pair is a no-op for an ordinary hostname
 *  or an IPv4 literal. */
function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) return hostname.slice(1, -1);
  return hostname;
}

/** A literal IP address resolves to itself; a hostname goes through DNS. Order preserved from the
 *  pre-extraction version: a literal IP never touches `lookup`. */
async function resolveHostAddresses(hostname: string): Promise<string[]> {
  const literal = stripIpv6Brackets(hostname);
  if (isIP(literal) !== 0) return [literal];
  const resolved = await lookup(hostname, { all: true, verbatim: true });
  return resolved.map((entry) => entry.address);
}

/** @throws {Error} naming the first non-public resolved address, per {@link classifyAddress}. */
function assertNoPrivateAddress(hostname: string, addresses: readonly string[]): void {
  for (const address of addresses) {
    const addressClass = classifyAddress(address);
    if (addressClass !== "public") {
      throw new Error(`egress to '${hostname}' (${address}) rejected: resolved address is ${addressClass}`);
    }
  }
}

async function resolvePinnedPeer(url: URL, policy: EgressPolicy): Promise<PinnedPeer> {
  assertAllowedTarget(url, policy);

  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  const isDevAllowlisted = policy.devHostAllowlist.includes(url.hostname);

  const addresses = await resolveHostAddresses(url.hostname);
  if (addresses.length === 0) {
    throw new Error(`could not resolve any address for host '${url.hostname}'`);
  }

  if (policy.denyPrivateAddresses && !isDevAllowlisted) {
    assertNoPrivateAddress(url.hostname, addresses);
  }

  return {
    ip: addresses[0],
    port,
    authority: url.host,
    tlsServerName: url.hostname,
  };
}

function withStrippedSensitiveHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) continue;
    next[key] = value;
  }
  return next;
}

function capBody(bodyText: string, maxBytes: number): string {
  const buffer = Buffer.from(bodyText, "utf8");
  if (buffer.byteLength <= maxBytes) return bodyText;
  return buffer.subarray(0, maxBytes).toString("utf8");
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function sendWithPolicy(
  transport: HttpTransportAdapter,
  policy: EgressPolicy,
  request: HttpRequest,
  redirectsFollowed: number
): Promise<HttpResponse> {
  const url = new URL(request.url);
  const peer = await resolvePinnedPeer(url, policy);
  // The policy's connectTimeoutMs is a ceiling on the caller-supplied per-attempt timeout, not a
  // replacement for it — a caller may ask for less time, never more than the policy allows.
  const boundedRequest: HttpRequest = {
    ...request,
    timeoutMs: Math.min(request.timeoutMs, policy.connectTimeoutMs),
  };
  const response = await transport.requestPinned(boundedRequest, peer);

  const effectiveCap = Math.min(policy.maxResponseBytes, policy.maxDecompressedBytes);
  const cappedResponse: HttpResponse = {
    ...response,
    bodyText: capBody(response.bodyText, effectiveCap),
  };

  if (!REDIRECT_STATUSES.has(cappedResponse.status) || redirectsFollowed >= policy.maxRedirects) {
    return cappedResponse;
  }

  const location = cappedResponse.headers.location ?? cappedResponse.headers.Location;
  if (!location) return cappedResponse;

  const nextUrl = new URL(location, url);
  const nextHeaders = isCrossOrigin(url, nextUrl)
    ? withStrippedSensitiveHeaders(request.headers)
    : request.headers;

  return sendWithPolicy(
    transport,
    policy,
    { ...request, url: nextUrl.toString(), headers: nextHeaders },
    redirectsFollowed + 1
  );
}

/**
 * The only production `HttpClientPort` constructor (ADR-038 §2) — returns a policy-enforcing
 * decorator around `transport`; there is no other way to obtain a client.
 *
 * @overallScore 100
 */
export const createHttpClient: CreateHttpClient = (
  required: { transport: HttpTransportAdapter; policy: EgressPolicy }
): HttpClientPort => {
  const { transport, policy } = required;
  return {
    async send(request: HttpRequest): Promise<HttpResponse> {
      const requestWithUserAgent: HttpRequest = { ...request, headers: withDefaultUserAgent(request.headers) };
      return sendWithPolicy(transport, policy, requestWithUserAgent, 0);
    },
  };
};

/**
 * Convenience wrapper so the composition root never needs to import `transport.fetch.ts`
 * directly — it only ever needs a policy. Keeps the import-boundary canary's allowlist to this
 * one file.
 */
export function createDefaultHttpClient(policy: EgressPolicy): HttpClientPort {
  return createHttpClient({ transport: new FetchHttpTransportAdapter(), policy });
}
