import { Roles as RolesScreen } from "@jini-ai/admin/roles/Roles";
import type { RolesController } from "@jini-ai/admin/roles/hooks/use-roles.hooks";
import { useWiredRoles } from "./hooks/use-wired-roles.hooks";
import { goToRolesTab } from "./roles-host-binding";

/**
 * @file Public surface of the `roles` feature — and this host's binding of the Jini Roles screen.
 *
 * `panels.tsx` imports from HERE, never from a file inside this folder. That indirection is the
 * point of the feature boundary: everything below can be split, renamed, or grown a `hooks/`
 * directory without the router noticing. Adding a file to this feature is not an API change unless
 * it is exported from this line.
 */

/** This host's users-screen route, linked from the Roles page description. */
const USERS_HREF = "/admin/users";

/** The Roles screen with this host's collaborators bound in: the wired controller hook (live port,
 *  `ApiError` port, locale hook), the `?tab=` navigation and the users route. `useRolesHook` stays
 *  overridable so a test can drive the markup with a fake controller. */
export function Roles({ tabId, useRolesHook = useWiredRoles }: { tabId?: string | null; useRolesHook?: () => RolesController } = {}) {
  return <RolesScreen tabId={tabId} useRolesHook={useRolesHook} goToTab={goToRolesTab} usersHref={USERS_HREF} />;
}
