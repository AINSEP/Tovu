import { registerAdminPolicyCreateRoute } from "#src/server/inbound/admin-http/routes/users/create-policy";
import { registerAdminRoleCreateRoute } from "#src/server/inbound/admin-http/routes/users/create-role";
import { registerAdminUserCreateRoute } from "#src/server/inbound/admin-http/routes/users/create";
import { registerAdminUserAssignRoleRoute } from "#src/server/inbound/admin-http/routes/users/assign-role";
import { registerAdminUserAttachPolicyRoute } from "#src/server/inbound/admin-http/routes/users/attach-policy";
import { registerAdminPolicyListRoute } from "#src/server/inbound/admin-http/routes/users/list-policies";
import { registerAdminRoleListRoute } from "#src/server/inbound/admin-http/routes/users/list-roles";
import { registerAdminUserListRoute } from "#src/server/inbound/admin-http/routes/users/list";
import { registerAdminUserDisableRoute } from "#src/server/inbound/admin-http/routes/users/disable";
import { registerAdminUserEnableRoute } from "#src/server/inbound/admin-http/routes/users/enable";
import { registerAdminUserUpdateRoute } from "#src/server/inbound/admin-http/routes/users/update";
import { registerAdminUserResetPasswordRoute } from "#src/server/inbound/admin-http/routes/users/reset-password";
import { registerAdminRoleUpdateRoute } from "#src/server/inbound/admin-http/routes/users/update-role";
import { registerAdminRoleDeleteRoute } from "#src/server/inbound/admin-http/routes/users/delete-role";
import { registerAdminPolicyUpdateRoute } from "#src/server/inbound/admin-http/routes/users/update-policy";
import { registerAdminPolicyDeleteRoute } from "#src/server/inbound/admin-http/routes/users/delete-policy";
import { registerAdminPolicyWritePermissionRoute } from "#src/server/inbound/admin-http/routes/users/write-policy-permission";
import { registerAdminPolicyPermissionListRoute } from "#src/server/inbound/admin-http/routes/users/list-policy-permissions";
import { registerAdminPolicyPermissionRemoveRoute } from "#src/server/inbound/admin-http/routes/users/remove-policy-permission";
import type { UsersRouteDeps } from "#src/server/inbound/admin-http/routes/users/deps";
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
