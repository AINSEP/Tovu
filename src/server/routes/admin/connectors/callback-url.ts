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
 * Resolves the absolute origin the browser reaches this server on.
 *
 * Prefers `TOVU_PUBLIC_URL` and falls back to the request's own `Host`. The env var exists because
 * `Host` is caller-controlled: a request routed through a proxy that forwards an attacker-chosen
 * `Host` would make this build a callback pointing at that origin, handing the `state` to whoever
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
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
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
