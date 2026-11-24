import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { authApi } from "@/features/auth/api/auth-api";
import { useSecurityPermissions, type SecurityPermissionsController } from "@jini-ai/admin/security/host/hooks/use-security-permissions.hooks";
import type { SecurityPermissionsPort } from "@jini-ai/admin/security/host/hooks/security-permissions-port.hooks";
import { SITE_KEY_MANAGE_PERMISSION } from "../rules";

/**
 * @file The only place `useSecurityPermissions` reaches `lib/api` — see
 * `@jini-ai/admin/security/host/hooks/security-permissions-port.hooks` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `comments-dependencies
 *  .hooks.ts`'s `defaultCommentsPort`. */
export const defaultSecurityPermissionsPort: SecurityPermissionsPort = {
  me: () => authApi.me(),
};

/** The Security page's permissions hook wired to this host's auth request and its site-key
 *  management permission, which is host policy. */
export function useWiredSecurityPermissions(): SecurityPermissionsController {
  return useSecurityPermissions({ port: defaultSecurityPermissionsPort, permission: SITE_KEY_MANAGE_PERMISSION, useFetchQuery });
}
