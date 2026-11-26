import { registerUserManagePermissionGrants } from "@jini-ai/user-management/identity/user-manage-permission";
import { registerFsFilesCustomRootPermissionGrants } from "@jini-ai/cms/fs-files/custom-root-permission";
import { createPermissionGrantRegistry, type PermissionGrantRegistry } from "@jini-ai/user-management/identity/permission-grants";
import { registerRoleManagePermissionGrants } from "@jini-ai/user-management/identity/role-manage-permission";
import { registerSiteKeyPermissionGrants } from "@jini-ai/user-management/identity/site-key-permission";
import { SITE_KEY_ENV_VAR_NAME } from "#src/features/webhooks/site-key-read-bindings";
import { registerPagesPermissionGrants } from "#src/features/pages/permissions";
import { registerPermission } from "@jini-ai/user-management";
import { registerPublishContentPermissionGrants } from "@jini-ai/cms/publish/content/permissions";
import { registerMailPermissionGrants } from "@jini-ai/user-management/mail/status/permissions";
import { registerVisitorToolsPermissionGrants } from "#src/features/settings/visitor-tools-permissions";

/** Host copy for the publish-content grants (audit reasons stored with each built-in `admin` grant). */
const PUBLISH_CONTENT_GRANT_COPY = {
  backstopDescription: "Send uncovered site items by hand (owner and built-in admins only).",
  backstopReason: "Owner B1 (2026-10-04): manual publish is available only to the owner and built-in admins; every route also enforces that role boundary.",
  readReason:
    "publish-content (Publish Content) Task 9: reading a workspace's exportable publish-content " +
      "data is a workspace-operator capability, not ordinary authoring — editor and viewer hold " +
      "neither publish_content.read nor publish_content.apply. Stated against the built-in admin " +
      "role directly (no existing permission's fan-out reaches this) so it lands on every " +
      "already-seeded workspace, not only a freshly-seeded one — same reasoning as " +
      "features/pages/permissions.ts's pages.edit_html grant.",
  applyReason:
    "publish-content (Publish Content) Task 9: applying an import can move any registered " +
      "publish-content type's data across workspace/instance boundaries and is guarded by a " +
      "restore-point capture precisely because it can be destructive — a workspace-operator " +
      "capability, not ordinary authoring. See the publish_content.read grant above for why a " +
      "direct role grant, not a fan-out, is the mechanism.",
} as const;

/**
 * @file Every permission grant this app reconciles at boot, registered explicitly.
 *
 * This is the single list. A feature that introduces a permission needing a boot-time grant exports
 * a `register*PermissionGrants` function and is added here; every composition root
 * (`app.ts`, `deps.ts`) and every standalone script that builds identity deps
 * (the admin-password reset backfill) calls this and passes the result to
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
  registerSiteKeyPermissionGrants({ registry, siteKeyName: SITE_KEY_ENV_VAR_NAME });
  registerPublishContentPermissionGrants({ registry, registerPermission, copy: PUBLISH_CONTENT_GRANT_COPY });
  registerFsFilesCustomRootPermissionGrants({ registry });
  registerRoleManagePermissionGrants({ registry });
  registerUserManagePermissionGrants({ registry });
  registerMailPermissionGrants({ registry });
  registerVisitorToolsPermissionGrants({ registry });
  return registry;
}
