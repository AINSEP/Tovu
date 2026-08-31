import type { Request } from "express";

/**
 * @file The absolute origin an OAuth callback URL is built from — extracted from
 * `routes/admin/connectors/callback-url.ts`, which still re-exports it, so both OAuth flows resolve
 * the same origin the same way.
 *
 * Two things here are load-bearing and both were got right once already in the connectors flow;
 * neither should be re-derived by a second caller.
 */

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
 * 80 for the provider's redirect to land on) and a downgrade of a URL that is supposed to be HTTPS.
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
 */
export function resolveProtocol(req: Request): string {
  const forwarded = req.headers["x-forwarded-proto"];
  const firstHop = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (firstHop === "http" || firstHop === "https") return firstHop;
  return req.protocol;
}

/**
 * True when {@link resolveProtocol} resolves this request as HTTPS — exported so any route that
 * conditionally sets a cookie's `Secure` attribute (e.g. `routes/site/forms-submit.ts`'s validation
 * flash cookie) uses the SAME "honor `X-Forwarded-Proto` without a `trust proxy` config" logic this
 * file already got right for OAuth callback URLs, rather than re-deriving it (and re-risking the
 * `req.protocol`-behind-a-TLS-terminating-proxy mistake {@link resolveProtocol}'s own doc describes).
 * Unlike `dev-auth.ts`'s/`complete-sign-in.ts`'s session cookies (both gate a real login, so an
 * always-on `Secure` is the right call there), a cookie with no auth purpose should not force
 * `Secure` unconditionally — that would silently break on a plain `http://localhost` dev/test run.
 * @complexity O(1).
 */
export function isHttpsRequest(req: Request): boolean {
  return resolveProtocol(req) === "https";
}

/**
 * Resolves the absolute origin the browser reaches this server on.
 *
 * Prefers `TOVU_PUBLIC_URL` and falls back to the request's own `Host` and (via
 * {@link resolveProtocol}) forwarded protocol. The env var exists because `Host` is
 * caller-controlled: a request routed through a proxy that forwards an attacker-chosen `Host`
 * would make this build a callback pointing at that origin, handing the `state` to whoever
 * controls it. The practical blast radius is small — the state is single-use and connection-bound —
 * but an operator behind an untrusted proxy should be able to pin the origin, and can.
 *
 * @throws {TypeError} `TOVU_PUBLIC_URL` is set but is not a valid http(s) URL — fail loudly at the
 *   first connect attempt rather than silently emitting a callback nothing can reach.
 * @complexity O(1).
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
