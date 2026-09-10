import { hasPermission } from "@/lib/permissions";
import { useFetchQuery } from "@/lib/fetch-query";
import { SITE_TOKEN_MANAGE_PERMISSION } from "../rules";
import { defaultSecurityPermissionsPort } from "./security-permissions-dependencies.hooks";
import type { SecurityPermissionsPort } from "./security-permissions-port.hooks";

/**
 * @file `Security.tsx`'s own affordance-hiding controller: whether the current principal holds
 * `admin.security.tokens.manage` (`SITE_TOKEN_MANAGE_PERMISSION`), which decides whether the Site
 * Token tab is even offered. This is UX-only — `hasPermission`'s own header says so, and every
 * site-token route re-checks server-side regardless (`site-token-permission.ts`).
 *
 * `canManageSiteToken` is a plain `boolean`, never a tri-state: `hasPermission(undefined ?? [],
 * ...)` is `false` while the `/auth/me` read is still in flight, which is exactly the "treat
 * unknown as not-permitted" behavior the tab needs — there is no separate `loading` flag to
 * thread through `Security.tsx`'s render because the false-while-loading value already IS the
 * correct render (hidden), not a placeholder for one.
 */

export interface SecurityPermissionsController {
  /** `false` until the `/auth/me` read resolves AND the caller holds the permission — see this
   *  file's header for why loading and "confirmed absent" share the same value on purpose. */
  readonly canManageSiteToken: boolean;
}

// Namespaced under "security" — same convention `use-access-tokens.hooks.ts` uses for its own
// three list reads (`["security", "publish-credentials"]` etc.) and `comments/rules.ts`'s
// `KEYS.permissions` (`["comments", "permissions"]`) uses for this exact same `/auth/me` read.
const SECURITY_PERMISSIONS_KEY = ["security", "permissions"] as const;

export function useSecurityPermissions(port: SecurityPermissionsPort): SecurityPermissionsController {
  const query = useFetchQuery({ key: SECURITY_PERMISSIONS_KEY, fetch: () => port.me() });
  const canManageSiteToken = hasPermission(query.data?.effectivePermissions ?? [], SITE_TOKEN_MANAGE_PERMISSION);
  return { canManageSiteToken };
}

/**
 * Binds the real `/auth/me` client — the zero-argument half of the `useX(port)` / `useWiredX()`
 * pair, same shape `useWiredComments`/`useWiredExternalMcpAdmissions` document.
 */
export function useWiredSecurityPermissions(): SecurityPermissionsController {
  return useSecurityPermissions(defaultSecurityPermissionsPort);
}
