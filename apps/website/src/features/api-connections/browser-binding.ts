/**
 * Hosted adapter for Jini's browser binding. The admin opens an actor-bound, one-use host link;
 * only that response gives its browser the binding. Forwarding the provider URL gives no cookie.
 * Jini owns expiry, capacity and consumption; this file owns Tovu's routes and cookie policy.
 */
import { serialize } from "cookie";
import type { Clock } from "@jini-ai/core/primitives";
import { createPendingAuthorizationStore, generateOAuthState, type OAuthRandomBytes } from "@jini-ai/oauth";

export const API_CONNECTION_OAUTH_CALLBACK_PATH = "/api/agent-plugins/connections/oauth/callback";
export const API_CONNECTION_BINDING_COOKIE = "__Secure-tovu_api_connection_binding";
export const API_CONNECTION_SIGN_IN_PATH = "/api/admin/v1/workspaces/:workspaceId/agent-plugins/connections/sign-in/:handoffId";
const COOKIE_OPTIONS = { path: API_CONNECTION_OAUTH_CALLBACK_PATH, httpOnly: true, secure: true, sameSite: "lax" as const };
const BINDING_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface SignInHandoff {
  readonly authorizationUrl: string;
  readonly browserBinding: string;
  readonly actorId: string;
  readonly expiresAt: string;
}

export interface SignInHandoffs {
  issue(required: SignInHandoff, optional?: Record<string, never>): string;
  take(required: { readonly handoffId: string; readonly actorId: string }, optional?: Record<string, never>): SignInHandoff | null;
}

/** Actor-bound handoffs over Jini's 256-entry, 10-minute cache. No timers or background processes.
 * @returns issue (opaque id) and take (consumes even on actor mismatch).
 * @example const handoffs = createSignInHandoffs({ clock, randomBytesFn }); // only host code may hold it
 * @complexity O(n) insertion sweep, O(1) take; O(256) bounded space.
 */
export function createSignInHandoffs(required: { readonly clock: Clock; readonly randomBytesFn: OAuthRandomBytes }, _optional: Record<string, never> = {}): SignInHandoffs {
  const pending = createPendingAuthorizationStore<SignInHandoff>({ clock: required.clock }, {
    expiry: ({ value }) => Date.parse(value.expiresAt),
  });
  return {
    /** Stores host-only proof; entropy errors propagate before anything is issued. */
    issue(input: SignInHandoff, _options: Record<string, never> = {}): string {
      const id = generateOAuthState({ randomBytesFn: required.randomBytesFn }, { stateBytes: 32 });
      pending.put({ state: id, value: { ...input } });
      return id;
    },
    /** Burns the id first; unknown, expired, used or foreign actors all return null. */
    take(input: { readonly handoffId: string; readonly actorId: string }, _options: Record<string, never> = {}): SignInHandoff | null {
      const entry = pending.consume({ state: input.handoffId });
      return entry?.actorId === input.actorId ? entry : null;
    },
  };
}

/** Build the host link without exposing either the provider state or browser binding. O(1) space/time. */
export function hostedSignInLink(required: { readonly callbackUrl: string; readonly workspaceId: string; readonly handoffId: string }, _optional: Record<string, never> = {}): string {
  const pathname = API_CONNECTION_SIGN_IN_PATH.replace(":workspaceId", encodeURIComponent(required.workspaceId)).replace(":handoffId", encodeURIComponent(required.handoffId));
  return new URL(pathname, required.callbackUrl).href;
}

/** Host-only (no Domain), callback-scoped cookie; newest sign-in wins and concurrent tabs fail closed. */
export function browserBindingCookie(required: { readonly browserBinding: string }, _optional: Record<string, never> = {}): string {
  if (!BINDING_PATTERN.test(required.browserBinding)) throw new TypeError("invalid browser binding");
  return serialize(API_CONNECTION_BINDING_COOKIE, required.browserBinding, { ...COOKIE_OPTIONS, maxAge: 600 });
}

/** Same cookie scope and security attributes when clearing it after completion or refusal. */
export function clearedBrowserBindingCookie(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): string {
  return serialize(API_CONNECTION_BINDING_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
}

/** Missing, malformed or duplicate cookies yield no proof. No fallback to the stored attempt.
 * @complexity O(h) header bytes, bounded by the HTTP server's header limit; O(h) space.
 */
export function readBrowserBinding(required: { readonly cookieHeader: string | undefined }, _optional: Record<string, never> = {}): string {
  const values = (required.cookieHeader ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${API_CONNECTION_BINDING_COOKIE}=`));
  const value = values[0]?.slice(API_CONNECTION_BINDING_COOKIE.length + 1) ?? "";
  return values.length === 1 && BINDING_PATTERN.test(value) ? value : "";
}
