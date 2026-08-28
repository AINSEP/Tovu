import type { Request } from "express";

import { resolvePublicOrigin } from "../oauth/public-origin.js";

/**
 * @file The public mount point and absolute URL for the external-MCP OAuth callback.
 *
 * Mirrors `routes/admin/connectors/callback-url.ts` exactly, including WHY it exists as its own
 * module: the connect route and the callback route must never drift apart, and a mismatch would
 * send the authorization server to a URL nothing serves — a failure that looks like a provider
 * problem and is not.
 *
 * The path lives OUTSIDE `/api/admin` for the reason that file already documents: `tovu_session` is
 * `SameSite=Strict`, so a top-level redirect arriving from the provider's origin carries no cookie
 * and would be rejected by `requireAdminSession` before any handler ran. What authenticates the
 * request instead is the single-use, expiring, connection-bound `state`
 * (`oauth/pending-authorizations.ts`), plus a per-IP rate limiter in front as defence in depth.
 */

/** Public, non-admin mount point. */
export const EXTERNAL_MCP_OAUTH_CALLBACK_PATH = "/api/mcp-servers/oauth/callback";

/**
 * The absolute callback URL for one external MCP connection.
 *
 * The server id travels in the PATH rather than a query parameter because an authorization server
 * appends its own `state`/`code`/`error` parameters to whatever it is given; keeping Tovu's own
 * routing information in the path keeps the two namespaces from colliding.
 *
 * @complexity O(1).
 */
export function externalMcpOAuthCallbackUrl(req: Request, serverId: string): string {
  return `${resolvePublicOrigin(req)}${EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/${encodeURIComponent(serverId)}`;
}
