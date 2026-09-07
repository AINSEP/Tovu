/**
 * @file Shared types for the `http` core primitive (ADR-038).
 *
 * Purpose:
 * The one `HttpClientPort` + `EgressPolicy` shape every consumer (Integrations/webhooks,
 * Newsletter's `HttpApiMailerAdapter`, Analytics' `ForwardingSink`) imports — resolves
 * `HttpClientPort` being declared only inside Integrations (036) with an SSRF guard that
 * didn't extend to the other two consumers.
 */

export interface HttpRequest {
  method: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Readonly<Record<string, string>>;
  /** Raw request body exactly as signed/sent — no re-serialization between sign and send. */
  body?: string;
  /** Hard per-attempt timeout (ms). The caller, not the adapter, owns retry/backoff. */
  timeoutMs: number;
}

export interface HttpResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  /** Truncated response body, bounded by the egress policy. */
  bodyText: string;
  /**
   * The SAME response body as `bodyText`, undecoded — the raw bytes exactly as they arrived (after
   * `Content-Encoding` decompression), bounded by the same egress-policy cap.
   *
   * Added 2026-09-06 for `features/media-import`: `bodyText` is `Buffer.concat(chunks).toString("utf8")`,
   * which is LOSSY for any non-UTF-8 payload — every invalid byte sequence in a PNG/JPEG/WebP becomes
   * U+FFFD, so a binary body round-tripped through `bodyText` is corrupt, not merely re-encoded. A
   * consumer that needs the actual bytes (importing an image into the media library) therefore cannot
   * use `bodyText` at all, and the alternative — reaching past this port to `fetch` directly — would
   * bypass the whole ADR-038 SSRF guard (DNS resolution, address classification, peer pinning,
   * redirect re-verification). This field is what lets a binary consumer stay behind the guard.
   *
   * OPTIONAL, additive: every pre-existing `HttpResponse` literal (test doubles included) still
   * satisfies this interface unchanged, and every pre-existing consumer still reads `bodyText`. The
   * production transport (`transport.fetch.ts`) always populates it; a hand-written double may not.
   */
  bodyBytes?: Uint8Array;
  /**
   * `true` when the egress policy's size cap actually CLIPPED this body — the difference between "the
   * response was 900 KB" and "the response was 90 MB and you are holding the first 1 MB of it".
   *
   * Added alongside `bodyBytes` (2026-09-06) because silent truncation is a genuine failure mode for
   * a binary consumer: a clipped image is not a smaller image, it is a corrupt file that would still
   * hash, still store, and still produce a media row whose bytes render as nothing. `features/media-import`
   * refuses a truncated response outright rather than persisting it. Text consumers may keep ignoring
   * this field (their pre-existing behavior is unchanged), but it is equally real for them — a clipped
   * JSON body has always been a parse failure with no explanation attached.
   *
   * OPTIONAL for the same reason `bodyBytes` is: absent means "this response's producer does not
   * report truncation", which a consumer must not read as a positive "it was not truncated".
   */
  bodyTruncated?: boolean;
}

/** A DNS-resolved, policy-vetted peer the guarded transport connects to (ADR-038 amendment 4). */
export interface PinnedPeer {
  ip: string;
  port: number;
  authority: string;
  /**
   * SNI hostname for the TLS handshake, or `undefined` when the target is an IP literal (IPv4 or
   * IPv6, bracket-stripped) — RFC 6066 §3's `server_name` extension is only valid for a hostname,
   * never an IP address; `undefined` here means "send no SNI extension at all", not "send the IP".
   */
  tlsServerName: string | undefined;
}
