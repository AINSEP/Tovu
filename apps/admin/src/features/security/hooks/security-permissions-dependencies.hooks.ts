import { authApi } from "@/features/auth/api/auth-api";
import type { SecurityPermissionsPort } from "@jini-ai/admin/security/host/hooks/security-permissions-port.hooks";

/**
 * @file The only place `use-security-permissions.hooks.ts` reaches `lib/api` — see
 * `@jini-ai/admin/security/host/hooks/security-permissions-port.hooks` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `comments-dependencies
 *  .hooks.ts`'s `defaultCommentsPort`. */
export const defaultSecurityPermissionsPort: SecurityPermissionsPort = {
  me: () => authApi.me(),
};
