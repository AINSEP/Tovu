import { registerBuiltinRoleGrant } from "../identity/builtin-role-grants.js";

/**
 * @file The `fs_files.custom_root.manage` permission, and the grant that makes it real — gates
 * CHANGING the `fs-files` domain's `custom` root (`PUT`/`DELETE` on
 * `routes/fs-files/custom-root.ts`). Reading which folder is currently set stays on
 * `FS_FILES_READ_PERMISSION`, unchanged.
 *
 * ## Why changing it is a different capability from reading through it
 *
 * `content.read` gates `fs_list_files`/`fs_read_file`, i.e. reading files under a root someone else
 * chose. Setting the custom root is the decision of WHICH host directory those tools may reach:
 * `layout.ts` allows `/` and a home directory as values, so one `PUT` can re-point the assistant's
 * whole filesystem surface at the operator's entire machine. The denylist in `fs-files.ts` still
 * applies afterwards, but "which tree is in scope at all" is an operator decision, not a reader's.
 * Owner ruling (2026-09-15): owner AND admin may change it; reading stays where it was.
 *
 * ## Why a new string, and why NOT `workspace.manage`
 *
 * `workspace.manage` reads like the obvious fit and is the one string that must not be used here:
 * it is held by NO policy in the workspace this repo actually ships. `sites/tovu-com/content.db`'s
 * `admin-builtin-policy` carries 43 permissions and `workspace.manage` is not among them —
 * `features/pages/permissions.ts` documents that exact database as seeded before `theme.edit`,
 * `workspace.manage`, and `admin.assistant.manage` joined the admin seed list, and `seedIdentity`
 * early-returns once an owner user exists, so it can never gain them. Gating on it would pass every
 * unit test that stubs `authorize` and still refuse every admin in production, leaving `owner` (on
 * its `*` wildcard) as the only principal who could change the folder — the opposite of the ruling.
 *
 * ## Why a built-in-role grant, and no migration pair
 *
 * `registerBuiltinRoleGrant` writes one row onto the built-in `admin` role's own policy on every
 * boot, additive and idempotent, so it reaches already-seeded workspaces that `seedIdentity` will
 * never revisit. See `features/identity/builtin-role-grants.ts` for the mechanism and
 * `features/pages/permissions.ts` for the full reasoning this mirrors.
 *
 * Unlike those two precedents this file registers NO `registerPermissionMigration` pair. A fan-out
 * grants the new string to every policy already holding some anchor, including operator-created
 * ones; the ruling names owner and admin specifically, so the grant is stated against the role and
 * nothing else. The cost is recorded rather than hidden: a workspace that gave a CUSTOM policy
 * `content.read` could change the custom root before this change and cannot after it. That is the
 * narrowing the ruling asks for, and an operator can still grant this permission to such a policy
 * deliberately.
 *
 * ## Ordering
 *
 * The registration below is a module-evaluation side effect and must run before
 * `applyBuiltinRoleGrants` does. It does, by ES module semantics:
 * {@link FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION} is imported by
 * `server/inbound/admin-http/routes/fs-files/custom-root.ts`, which `composition/app.ts` imports
 * statically (`app.ts:217`) — the same "reached via its own consumer" mechanism
 * `features/identity/site-token-permission.ts` documents for itself.
 * `server/inbound/admin-http/routes/fs-files/__tests__/custom-root-permission.test.ts` pins the
 * resulting grant end-to-end through the real route against a workspace seeded the way the shipping
 * one was, so a regression surfaces as a failing privilege test rather than as a silent lockout.
 */

/**
 * The permission required to CHANGE the `fs-files` custom root (`PUT`/`DELETE`).
 *
 * Named once and imported by the route so the gate and the 403 body cannot drift apart.
 */
export const FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION = "fs_files.custom_root.manage";

registerBuiltinRoleGrant({
  role: "admin",
  permission: FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION,
  reason:
    "Owner ruling 2026-09-15: owner and admin may change which host directory the assistant's " +
    "filesystem tools are pointed at; reading through the currently-set folder stays on " +
    "content.read. Stated directly against the built-in admin role because this repo's own " +
    "content.db was seeded before several admin permissions existed and seedIdentity early-returns " +
    "once an owner user exists — a grant that depended on a seed row that workspace never got would " +
    "refuse every admin in the only installation that actually ships.",
});
