/**
 * Hosted adapter for Jini's browser binding. The admin opens an actor-bound, one-use host link;
 * only that response gives its browser the binding. Forwarding the provider URL gives no cookie.
 * Jini owns expiry, capacity and consumption; this file owns Tovu's routes and cookie policy.
 */
import { serialize } from "cookie";
export { createSignInHandoffs, type SignInHandoffs } from "@jini-ai/integrations/api-connections";

export const API_CONNECTION_OAUTH_CALLBACK_PATH = "/api/agent-plugins/connections/oauth/callback";
export const API_CONNECTION_BINDING_COOKIE = "__Secure-tovu_api_connection_binding";
export const API_CONNECTION_SIGN_IN_PATH = "/api/admin/v1/workspaces/:workspaceId/agent-plugins/connections/sign-in/:handoffId";
const COOKIE_OPTIONS = { path: API_CONNECTION_OAUTH_CALLBACK_PATH, httpOnly: true, secure: true, sameSite: "lax" as const };
const BINDING_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Host cookie scope; security attributes stay shared across sign-in routes. */
interface BrowserBindingScope {
  readonly cookieName?: string;
  readonly callbackPath?: string;
}

export const EXTERNAL_MCP_BROWSER_BINDING = {
  cookieName: '__Secure-tovu_mcp_binding', callbackPath: '/api/mcp-servers/oauth/callback',
} as const;
export const EXTERNAL_MCP_SIGN_IN_PATH = '/api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId/oauth/sign-in';

/** The authenticated host entry point; provider state and browser proof never appear in this link.
 * @returns A same-origin link for one workspace/connection; no I/O.
 * @complexity O(p) in the bounded URL path bytes.
 */
export function hostedMcpSignInLink(required: { readonly callbackUrl: string; readonly workspaceId: string; readonly serverId: string }, _optional: Record<string, never> = {}): string {
  const path = EXTERNAL_MCP_SIGN_IN_PATH.replace(':workspaceId', encodeURIComponent(required.workspaceId)).replace(':serverId', encodeURIComponent(required.serverId));
  return new URL(path, required.callbackUrl).href;
}

/** Build the host link without exposing either the provider state or browser binding. O(1) space/time. */
export function hostedSignInLink(required: { readonly callbackUrl: string; readonly workspaceId: string; readonly handoffId: string }, _optional: Record<string, never> = {}): string {
  const pathname = API_CONNECTION_SIGN_IN_PATH.replace(":workspaceId", encodeURIComponent(required.workspaceId)).replace(":handoffId", encodeURIComponent(required.handoffId));
  return new URL(pathname, required.callbackUrl).href;
}

/** Host-only (no Domain), callback-scoped cookie; newest sign-in wins and concurrent tabs fail closed. */
export function browserBindingCookie(required: { readonly browserBinding: string }, scope: BrowserBindingScope = {}): string {
  if (!BINDING_PATTERN.test(required.browserBinding)) throw new TypeError("invalid browser binding");
  return serialize(scope.cookieName ?? API_CONNECTION_BINDING_COOKIE, required.browserBinding, { ...COOKIE_OPTIONS, path: scope.callbackPath ?? COOKIE_OPTIONS.path, maxAge: 600 });
}

/** Same cookie scope and security attributes when clearing it after completion or refusal. */
export function clearedBrowserBindingCookie(_required: Record<string, never> = {}, scope: BrowserBindingScope = {}): string {
  return serialize(scope.cookieName ?? API_CONNECTION_BINDING_COOKIE, "", { ...COOKIE_OPTIONS, path: scope.callbackPath ?? COOKIE_OPTIONS.path, maxAge: 0 });
}

/** Missing, malformed or duplicate cookies yield no proof. No fallback to the stored attempt.
 * @complexity O(h) header bytes, bounded by the HTTP server's header limit; O(h) space.
 */
export function readBrowserBinding(required: { readonly cookieHeader: string | undefined }, scope: BrowserBindingScope = {}): string {
  const cookieName = scope.cookieName ?? API_CONNECTION_BINDING_COOKIE;
  const values = (required.cookieHeader ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${cookieName}=`));
  const value = values[0]?.slice(cookieName.length + 1) ?? "";
  return values.length === 1 && BINDING_PATTERN.test(value) ? value : "";
}
