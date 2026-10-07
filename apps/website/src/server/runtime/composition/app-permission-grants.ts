import { registerUserManagePermissionGrants } from "#src/features/identity/user-manage-permission";
import { registerFsFilesCustomRootPermissionGrants } from "#src/features/fs-files/custom-root-permission";
import { createPermissionGrantRegistry, type PermissionGrantRegistry } from "#src/features/identity/permission-grants";
import { registerRoleManagePermissionGrants } from "#src/features/identity/role-manage-permission";
import { registerSiteKeyPermissionGrants } from "#src/features/identity/site-key-permission";
import { registerPagesPermissionGrants } from "#src/features/pages/permissions";
import { registerPublishContentPermissionGrants } from "#src/features/publish-content/permissions";

/**
 * @file Every permission grant this app reconciles at boot, registered explicitly.
 *
 * This is the single list. A feature that introduces a permission needing a boot-time grant exports
 * a `register*PermissionGrants` function and is added here; every composition root
 * (`app.ts`, `deps.ts`) and every standalone script that builds identity deps
 * (`development/scripts/backfill-reset-admin-password.ts`) calls this and passes the result to
 * `create*IdentityRouteDeps` as `permissionGrants`. Which grants exist therefore never depends on
 * which modules a process imported, or in what order.
 *
 * @complexity O(g) where g = grants registered across the features below.
 */
export function createAppPermissionGrants(
  _required: Record<string, never> = {},
  _optional: Record<string, never> = {}
): PermissionGrantRegistry {
  const registry = createPermissionGrantRegistry({});
  registerPagesPermissionGrants({ registry });
  registerSiteKeyPermissionGrants({ registry });
  registerPublishContentPermissionGrants({ registry });
  registerFsFilesCustomRootPermissionGrants({ registry });
  registerRoleManagePermissionGrants({ registry });
  registerUserManagePermissionGrants({ registry });
  return registry;
}
