import type { Request } from "express";

import { resolvePublicOrigin } from "#src/server/inbound/public-http/routes/oauth/public-origin";

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
 * Re-exported rather than moved-and-forgotten: `resolvePublicOrigin` moved to
 * `routes/oauth/public-origin.ts` on 2026-08-25 so the external-MCP OAuth callback resolves its
 * origin identically (the `X-Forwarded-Proto` and `TOVU_PUBLIC_URL` handling in it is exactly the
 * part a second implementation would get wrong). Existing importers of this module keep working.
 */
export { resolvePublicOrigin };

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
