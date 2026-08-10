import type { Request } from "express";

/**
 * @file Builds the OAuth callback URL Composio redirects back to.
 *
 * The path is public and lives OUTSIDE `/api/admin`, deliberately: the admin session cookie is
 * `SameSite=Strict`, so a top-level redirect arriving from Composio's origin carries no cookie and
 * would be rejected by `requireAdminSession` before any handler ran. The callback authenticates on
 * the OAuth `state` token instead — single-use, expiring, and bound server-side to the connector
 * that issued it (`ComposioConnectorProvider.completeConnection` rejects a state whose recorded
 * `connectorId` does not match).
 */

/** Public, non-admin mount point. Kept here so the connect route and the callback route cannot
 *  drift apart — a mismatch would send Composio to a URL nothing serves. */
export const COMPOSIO_CALLBACK_PATH = "/api/connectors/composio/callback";

/**
 * Resolves the protocol (`"http"` or `"https"`) the ORIGINAL client used to reach this deployment,
 * honoring `X-Forwarded-Proto` when present.
 *
 * `req.protocol` alone is wrong behind any reverse proxy or load balancer that terminates TLS:
 * Express only derives it from `X-Forwarded-Proto` when `app.set('trust proxy', ...)` is
 * configured, and this app deliberately never sets that (see `rate-limit.ts`'s `resolveClientIp`
 * doc — the same `trust proxy` gap, for the same reason: no trusted-proxy config surface exists
 * here yet). Left unhandled, every callback URL built behind a TLS-terminating proxy would read
 * `http://...` — both broken (a client that only exposes the app over 443 has nothing listening on
 * 80 for Composio's redirect to land on) and a downgrade of a URL that is supposed to be HTTPS.
 *
 * Unlike `resolveClientIp`'s `X-Forwarded-For` handling, this does NOT require the immediate peer
 * to be an allow-listed trusted proxy before honoring the header. That asymmetry is deliberate, not
 * an oversight: trusting a spoofed `X-Forwarded-For` lets an attacker impersonate another client's
 * IP for rate-limit/audit purposes, a real security property. Trusting a spoofed
 * `X-Forwarded-Proto` only affects which scheme this string is built with; nothing here treats
 * `req.protocol` as an authentication or authorization signal, and a caller who can already reach
 * this route with a forged header cannot use it to reach anyone else's callback or forge a valid
 * `state` — the worst case is a self-inflicted broken redirect for that same caller. Only the first,
 * comma-separated hop is read, and only an exact `"http"`/`"https"` value is honored; anything else
 * falls back to `req.protocol` rather than trusting an unrecognized value.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function resolveProtocol(req: Request): string {
  const forwarded = req.headers["x-forwarded-proto"];
  const firstHop = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (firstHop === "http" || firstHop === "https") return firstHop;
  return req.protocol;
}

/**
 * Resolves the absolute origin the browser reaches this server on.
 *
 * Prefers `TOVU_PUBLIC_URL` and falls back to the request's own `Host` and (via
 * {@link resolveProtocol}) forwarded protocol. The env var exists because `Host` is
 * caller-controlled: a request routed through a proxy that forwards an attacker-chosen `Host`
 * would make this build a callback pointing at that origin, handing the `state` to whoever
 * controls it. The practical blast radius is small — the state is single-use, connector-bound, and
 * completion still re-validates the account against Composio, so the worst case is a third party
 * completing a connection the admin already started, not credential theft — but an operator behind
 * an untrusted proxy should be able to pin the origin, and now can.
 *
 * @throws {TypeError} `TOVU_PUBLIC_URL` is set but is not a valid http(s) URL — fail loudly at the
 *   first connect attempt rather than silently emitting a callback nothing can reach.
 * @complexity O(1).
 * @overallScore 100
 */
export function resolvePublicOrigin(req: Request): string {
  const configured = process.env.TOVU_PUBLIC_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError(`TOVU_PUBLIC_URL must be an http(s) URL, got "${configured}"`);
    }
    return url.origin;
  }
  return `${resolveProtocol(req)}://${req.get("host") ?? "localhost"}`;
}

/**
 * The absolute callback URL for one connector.
 *
 * The connector id travels in the PATH rather than a query parameter because Composio appends its
 * own query parameters (`state`, and depending on the flow a connection id and status) to whatever
 * it is given; keeping Tovu's own routing information in the path keeps the two namespaces from
 * colliding.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function composioCallbackUrl(req: Request, connectorId: string): string {
  return `${resolvePublicOrigin(req)}${COMPOSIO_CALLBACK_PATH}/${encodeURIComponent(connectorId)}`;
}
