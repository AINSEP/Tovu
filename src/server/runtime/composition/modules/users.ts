import { registerAdminPolicyCreateRoute } from "../../../routes/admin/users/create-policy.js";
import { registerAdminRoleCreateRoute } from "../../../routes/admin/users/create-role.js";
import { registerAdminUserCreateRoute } from "../../../routes/admin/users/create.js";
import { registerAdminUserAssignRoleRoute } from "../../../routes/admin/users/assign-role.js";
import { registerAdminUserAttachPolicyRoute } from "../../../routes/admin/users/attach-policy.js";
import { registerAdminPolicyListRoute } from "../../../routes/admin/users/list-policies.js";
import { registerAdminRoleListRoute } from "../../../routes/admin/users/list-roles.js";
import { registerAdminUserListRoute } from "../../../routes/admin/users/list.js";
import { registerAdminUserDisableRoute } from "../../../routes/admin/users/disable.js";
import { registerAdminUserEnableRoute } from "../../../routes/admin/users/enable.js";
import { registerAdminUserUpdateRoute } from "../../../routes/admin/users/update.js";
import { registerAdminUserResetPasswordRoute } from "../../../routes/admin/users/reset-password.js";
import { registerAdminRoleUpdateRoute } from "../../../routes/admin/users/update-role.js";
import { registerAdminRoleDeleteRoute } from "../../../routes/admin/users/delete-role.js";
import { registerAdminPolicyUpdateRoute } from "../../../routes/admin/users/update-policy.js";
import { registerAdminPolicyDeleteRoute } from "../../../routes/admin/users/delete-policy.js";
import { registerAdminPolicyWritePermissionRoute } from "../../../routes/admin/users/write-policy-permission.js";
import { registerAdminPolicyPermissionListRoute } from "../../../routes/admin/users/list-policy-permissions.js";
import { registerAdminPolicyPermissionRemoveRoute } from "../../../routes/admin/users/remove-policy-permission.js";
import type { UsersRouteDeps } from "../../../routes/admin/users/deps.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-040) — the `users` server module (users/roles/policies admin
 * CRUD, ADR-021/SPEC-006 identity RBAC).
 *
 * `UsersRouteDeps` (new this pass, `routes/admin/users/deps.ts`) is a genuine `Pick<RouteDeps,
 * ...>` narrowing — see that file's header for the confirmed field set, and for why
 * `identityReposFrom`/`identityServiceDepsFrom` (the pre-existing, unrelated helper functions in
 * the same file) were retyped from `RouteDeps` to this same narrow type rather than left
 * untouched: both already only ever read fields `UsersRouteDeps` includes, so the retype is pure
 * narrowing, needed so the registrars below (now typed `UsersRouteRegistrar` instead of the
 * generic `RouteRegistrar`) can still call them.
 *
 * Originally owned 8 registrations (4 users: list/create/assign-role/attach-policy; 2 roles:
 * list/create; 2 policies: list/create), moved here verbatim from `app.ts`'s `createApp()`. SPEC-006
 * 0.6.0 (the users/roles/policies CRUD-completion amendment) adds 9 more: `disable`/`enable`/
 * `update`/`reset-password` (users), `update-role`/`delete-role` (roles), `update-policy`/
 * `delete-policy`/`write-policy-permission` (policies) — 17 registrations total.
 *
 * OQ-10 (2026-08-24) adds the last two: `list-policy-permissions`/`remove-policy-permission`,
 * which together make a policy's permission set editable rather than append-only — 19 total.
 */
export function createUsersModule(deps: UsersRouteDeps): ServerModuleHandle {
  return {
    name: "users",
    registerRoutes: (app) => {
      registerAdminUserListRoute(app, deps);
      registerAdminUserCreateRoute(app, deps);
      registerAdminUserUpdateRoute(app, deps);
      registerAdminUserDisableRoute(app, deps);
      registerAdminUserEnableRoute(app, deps);
      registerAdminUserResetPasswordRoute(app, deps);
      registerAdminUserAssignRoleRoute(app, deps);
      registerAdminUserAttachPolicyRoute(app, deps);
      registerAdminRoleListRoute(app, deps);
      registerAdminRoleCreateRoute(app, deps);
      registerAdminRoleUpdateRoute(app, deps);
      registerAdminRoleDeleteRoute(app, deps);
      registerAdminPolicyListRoute(app, deps);
      registerAdminPolicyCreateRoute(app, deps);
      registerAdminPolicyUpdateRoute(app, deps);
      registerAdminPolicyDeleteRoute(app, deps);
      registerAdminPolicyWritePermissionRoute(app, deps);
      registerAdminPolicyPermissionListRoute(app, deps);
      registerAdminPolicyPermissionRemoveRoute(app, deps);
    },
  };
}
