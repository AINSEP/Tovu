import { registerAdminPolicyCreateRoute } from "../routes/admin/users/create-policy";
import { registerAdminRoleCreateRoute } from "../routes/admin/users/create-role";
import { registerAdminUserCreateRoute } from "../routes/admin/users/create";
import { registerAdminUserAssignRoleRoute } from "../routes/admin/users/assign-role";
import { registerAdminUserAttachPolicyRoute } from "../routes/admin/users/attach-policy";
import { registerAdminPolicyListRoute } from "../routes/admin/users/list-policies";
import { registerAdminRoleListRoute } from "../routes/admin/users/list-roles";
import { registerAdminUserListRoute } from "../routes/admin/users/list";
import type { UsersRouteDeps } from "../routes/admin/users/deps";
import type { ServerModuleHandle } from "./types";

/**
 * @file ADR-046 Phase 3 (SPEC-040) — the `users` server module (users/roles/policies admin
 * CRUD, ADR-021/SPEC-006 identity RBAC).
 *
 * `UsersRouteDeps` (new this pass, `routes/admin/users/deps.ts`) is a genuine `Pick<RouteDeps,
 * ...>` narrowing — see that file's header for the confirmed field set, and for why
 * `identityReposFrom`/`identityServiceDepsFrom` (the pre-existing, unrelated helper functions in
 * the same file) were retyped from `RouteDeps` to this same narrow type rather than left
 * untouched: both already only ever read fields `UsersRouteDeps` includes, so the retype is pure
 * narrowing, needed so the 8 registrars below (now typed `UsersRouteRegistrar` instead of the
 * generic `RouteRegistrar`) can still call them.
 *
 * Owns all 8 registrations (4 users: list/create/assign-role/attach-policy; 2 roles:
 * list/create; 2 policies: list/create) — moved here verbatim from `app.ts`'s `createApp()`,
 * same registrar function bodies, no behavior change, same relative order.
 */
export function createUsersModule(deps: UsersRouteDeps): ServerModuleHandle {
  return {
    name: "users",
    registerRoutes: (app) => {
      registerAdminUserListRoute(app, deps);
      registerAdminUserCreateRoute(app, deps);
      registerAdminUserAssignRoleRoute(app, deps);
      registerAdminUserAttachPolicyRoute(app, deps);
      registerAdminRoleListRoute(app, deps);
      registerAdminRoleCreateRoute(app, deps);
      registerAdminPolicyListRoute(app, deps);
      registerAdminPolicyCreateRoute(app, deps);
    },
  };
}
