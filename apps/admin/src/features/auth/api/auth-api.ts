import { request, requestOnce } from "../../../lib/admin-http/request";
import type { AdminUser } from "@jini-ai/core/contracts/site/user-management-react";

/** The admin API calls of the auth feature. */
export const authApi = {
  login: ({ username, password }: { username: string; password: string }, _options: Record<string, never> = {}) =>
    request<{ user: AdminUser } | { mfaRequired: true; pendingToken: string }>({ path: "/auth/login" }, { init: {
      method: "POST",
      body: JSON.stringify({ username, password }),
      // Signing in twice is harmless, so a login sent while the dev server restarts waits and retries.
    }, onOk: undefined, options: { retryWrites: true } }),
  completeMfa: (input: { pendingToken: string; code: string }) => requestOnce<{ user: AdminUser }>({
    path: "/auth/mfa/login", init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), cache: "no-store" },
  }),
  logout: () => request<{ ok: boolean }>({ path: "/auth/logout" }, { init: { method: "POST" } }),
  /**
   * Exchanges a single-use loopback boot token (the zip launcher's `#boot=<token>` sign-in link,
   * run-from-zip plan S2) for a real admin session cookie — the SAME route the desktop shell already
   * redeems (`server/inbound/admin-http/dev-auth.ts`'s `POST /auth/boot-session`; no new server
   * route). `apps/admin/src/App.hooks.ts`'s boot effect calls this with whatever `takeBootToken` read off the URL
   * fragment, then runs its existing `api.me()` chain unchanged — a rejected redemption (invalid,
   * spent, or absent) is swallowed by that caller and falls through to the normal `<Login>` screen.
   */
  redeemBootSession: ({ token }: { token: string }, _optional: Record<string, never> = {}) =>
    request<{ user: { id: string } }>({ path: "/auth/boot-session" }, { init: {
      method: "POST",
      body: JSON.stringify({ token }),
    } }),
  /** Local dev bootstrap exchanges a server-only one-time boot token for an ordinary cookie.
   * The server refuses production, deployment, LAN listeners and cross-origin callers.
   */
  signInLocalOwner: (_required: Record<string, never>, _optional: Record<string, never> = {}) =>
    request<{ user: { id: string } }>({ path: "/auth/local-boot-session" }, { init: { method: "POST" } }),
  me: () =>
    request<{
      user: AdminUser;
      effectivePermissions?: string[];
      canManageUserTrash?: boolean;
      /** `false` on the live site (`publish-availability.store.ts`); absent on older servers. */
      canPublishToLive?: boolean;
    }>({ path: "/auth/me" }),
  /** Password-banner plan (2026-09-24), Slice 2: whether the SIGNED-IN caller's own stored
   *  credential still verifies against the default. Separate from `me()` since only the dashboard
   *  needs it and the server-side check costs a real argon2id verify. */
  getPasswordStatus: () =>
    request<{ usesDefaultPassword: boolean }>({ path: "/auth/me/password-status" }),
};
