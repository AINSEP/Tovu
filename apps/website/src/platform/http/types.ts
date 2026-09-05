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
