/**
 * @file Port contracts for the `http` core primitive (ADR-038).
 *
 * Purpose:
 * `HttpClientPort` — the single guarded outbound-HTTP seam. Structural enforcement: the only
 * production constructor returns a policy-enforcing decorator around a dumb transport, so a
 * consumer cannot obtain an unguarded client (ADR-038 §2 / amendment 3). Raw
 * `HttpTransportAdapter` implementations are module-private to this library + the composition
 * root (import-boundary CI canary) — declared here as a type for testability only, never
 * exported for outside use (see `index.ts`).
 *
 * Allowlists derive from `core/origin`'s `isAllowedEgressTarget` (ADR-040), never a
 * per-consumer host setting (ADR-038 amendment 6 / internal-verification F4).
 */
import type { HttpRequest, HttpResponse, PinnedPeer } from "./types";

/** The guarded port every consumer (Integrations, Newsletter, Analytics) imports and calls. */
export interface HttpClientPort {
  send(request: HttpRequest): Promise<HttpResponse>;
}

/**
 * SSRF / egress policy every outbound request is checked against before connecting
 * (ADR-038 amendments 1-2: address-family-complete deny list incl. IPv6/loopback/link-
 * local/metadata, IPv4-mapped-IPv6 normalization before classification, IDNA/punycode
 * normalization, credentials-in-URL rejection, redirect re-verification + auth-header
 * stripping on cross-origin redirect, decompressed-byte cap).
 */
export interface EgressPolicy {
  readonly allowedSchemes: readonly string[];
  readonly denyPrivateAddresses: boolean;
  /** Hosts exempt from `denyPrivateAddresses` — a named capability, never consumer code. */
  readonly devHostAllowlist: readonly string[];
  readonly maxRedirects: number;
  readonly connectTimeoutMs: number;
  readonly maxResponseBytes: number;
  readonly maxDecompressedBytes: number;
  /**
   * Reserved rate-limit descriptor slot (ADR-038 amendment 5, round-2 audit finding R2-003) — so
   * adding pacing later is not an ADR-005 breaking change. Untrusted fan-out consumers (e.g. a
   * bulk webhook re-broadcast) must supply a per-destination concurrency/budget limiter here
   * before production enablement; `undefined` means unlimited (acceptable for first-party,
   * low-fan-out callers only).
   */
  readonly rateLimit?: { readonly maxConcurrent: number; readonly maxPerMinute: number };
}

/**
 * The dumb transport a guarded `HttpClientPort` wraps. MODULE-PRIVATE (ADR-038 amendment 3) —
 * only `createHttpClient` (the composition root) may construct one; never imported by a
 * consumer. Connects only to the policy-pinned peer, never re-resolves the original URL
 * (amendment 4) — this is what makes "cannot obtain an unguarded client" true, not aspirational.
 *
 * **v0 disclosure (round-3 audit finding `fable-r3-001`):** this transport is buffered
 * (`Promise<HttpResponse>`, `bodyText` fully materialized), bounded by `EgressPolicy`'s
 * `maxResponseBytes`/`maxDecompressedBytes` caps — not the streamed `HttpResponseStream` shape
 * ADR-038 amendment 4 describes. The streamed shape is deferred to the real transport
 * implementation; this buffered v0 is module-private so the deferral has no consumer-visible
 * contract impact.
 */
export interface HttpTransportAdapter {
  requestPinned(req: HttpRequest, peer: PinnedPeer): Promise<HttpResponse>;
}

/**
 * The only production constructor (ADR-038 §2) — returns a policy-enforcing decorator; there
 * is no other way to obtain an `HttpClientPort`. Declared here as the documented factory
 * signature; the implementation lives in the composition root, guarded by the import-boundary
 * CI canary (ADR-038 amendment 3).
 */
export type CreateHttpClient = (
  required: { transport: HttpTransportAdapter; policy: EgressPolicy },
  optional?: Record<string, never>
) => HttpClientPort;
