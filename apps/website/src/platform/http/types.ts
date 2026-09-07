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
   * `true` when the egress policy's size cap actually CLIPPED **either** body shape — the difference
   * between "the response was 900 KB" and "the response was 90 MB and you are holding the first 1 MB
   * of it".
   *
   * Added alongside `bodyBytes` (2026-09-06) because silent truncation is a genuine failure mode: a
   * clipped image is not a smaller image, it is a corrupt file that would still hash, still store,
   * and still produce a media row whose bytes render as nothing; a clipped JSON body has always been
   * a parse failure with no explanation attached.
   *
   * **This is the OR of the two shapes, so it is the wrong field for a consumer that reads only ONE
   * of them** (2026-09-06, MI-01). `bodyText` and `bodyBytes` are capped in the units each is
   * measured in, and a lossy UTF-8 decode is strictly larger than the bytes it came from — every
   * invalid byte becomes a 3-byte U+FFFD, so compressed image data expands about 1.8x. A complete,
   * well-under-cap image therefore routinely trips the cap on its TEXT half alone. Byte truncation
   * always implies text truncation but not the reverse, which makes this field exactly "the text half
   * was clipped, or the producer reported an unshaped truncation". A binary consumer must read
   * {@link HttpResponse.bodyBytesTruncated} instead; reading this one refused whole images for their
   * decode's byte distribution rather than their size.
   *
   * OPTIONAL for the same reason `bodyBytes` is: absent means "this response's producer does not
   * report truncation", which a consumer must not read as a positive "it was not truncated".
   */
  bodyTruncated?: boolean;
  /**
   * `true` when the egress policy's size cap actually clipped {@link HttpResponse.bodyBytes} — the
   * byte half's own verdict, independent of what happened to the text half.
   *
   * Added 2026-09-06 (MI-01) because `bodyTruncated` is the OR of both shapes and `features/media-import`
   * reads only the bytes. This is the field a binary consumer checks: it answers "are the bytes I am
   * holding the whole payload?" and nothing else.
   *
   * OPTIONAL, and absent exactly when `bodyBytes` is — there is no byte half to report on, so a value
   * here would be an invented answer. When a producer reports only the coarse `bodyTruncated`, naming
   * no shape, `client.ts`'s `capResponse` propagates that into this field too: an unshaped "incomplete"
   * has to count against both halves, because downgrading it to "the bytes are fine" would reintroduce
   * the silent-corruption failure the flags exist to prevent.
   */
  bodyBytesTruncated?: boolean;
  /**
   * The URL that actually served this response — the last hop after redirect resolution, normalized
   * by the WHATWG parser. Equal to the requested URL when nothing redirected.
   *
   * Added 2026-09-06 (MI-02): `sendWithPolicy` follows up to `EgressPolicy.maxRedirects` hops, and
   * before this field the caller had no way to learn which one answered. A consumer recording
   * provenance (`features/media-import` writes it as an imported asset's `sourceUrl`, and derives the
   * stored filename from it) was therefore recording the URL it asked for as though it were the URL
   * that replied.
   *
   * Every value this field can carry has already been through the FULL per-hop guard — scheme,
   * credentials-in-URL, DNS resolution, address classification, re-pinning — because `sendWithPolicy`
   * re-runs all of it before following. On a 3xx that was NOT followed (`maxRedirects` exhausted, or
   * no `Location`), this names the hop that returned the 3xx, never the location it pointed at: the
   * bytes in hand came from the former, and naming the latter would be a fabricated provenance.
   *
   * OPTIONAL for the same reason the two body fields are: a hand-written `HttpTransportAdapter` or
   * `HttpClientPort` double predating it still satisfies the interface, and a consumer must fall back
   * to the URL it requested rather than treat absence as a blank source.
   */
  finalUrl?: string;
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
