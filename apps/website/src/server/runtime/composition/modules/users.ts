import { userAssignRoleRoute } from "@jini-ai/user-management/admin-http/routes/users/assign-role";
import { userAttachPolicyRoute } from "@jini-ai/user-management/admin-http/routes/users/attach-policy";
import { userCreateRoute } from "@jini-ai/user-management/admin-http/routes/users/create";
import { userDeleteRoute } from "@jini-ai/user-management/admin-http/routes/users/delete";
import { userDisableRoute } from "@jini-ai/user-management/admin-http/routes/users/disable";
import { userEnableRoute } from "@jini-ai/user-management/admin-http/routes/users/enable";
import { userListRoute } from "@jini-ai/user-management/admin-http/routes/users/list";
import { userResetPasswordRoute } from "@jini-ai/user-management/admin-http/routes/users/reset-password";
import { userUpdateRoute } from "@jini-ai/user-management/admin-http/routes/users/update";
import {
  assertCallerHasAnyPermission, assignRole, attachPolicy, createUser, disablePrincipal, enablePrincipal, normalizeUsername, resetUserPassword, updateUser,
} from "@jini-ai/user-management/server";
import { assertUserAccountAction, SelfDeleteError, trashUser, UserInTrashError, userAccountProtection } from "#src/features/identity/delete-user-service";
import { UserDeleteUnsupportedError } from "#src/features/identity/user-purge-types";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { identityServiceDepsFrom, type UsersRouteDeps, type UsersRouteRegistrar } from "#src/server/inbound/admin-http/routes/users/deps";
import { registerAdminPolicyCreateRoute } from "#src/server/inbound/admin-http/routes/users/create-policy";
import { registerAdminRoleCreateRoute } from "#src/server/inbound/admin-http/routes/users/create-role";
import { registerAdminPolicyListRoute } from "#src/server/inbound/admin-http/routes/users/list-policies";
import { registerAdminRoleListRoute } from "#src/server/inbound/admin-http/routes/users/list-roles";
import { registerAdminRoleUpdateRoute } from "#src/server/inbound/admin-http/routes/users/update-role";
import { registerAdminRoleDeleteRoute } from "#src/server/inbound/admin-http/routes/users/delete-role";
import { registerAdminPolicyUpdateRoute } from "#src/server/inbound/admin-http/routes/users/update-policy";
import { registerAdminPolicyDeleteRoute } from "#src/server/inbound/admin-http/routes/users/delete-policy";
import { registerAdminPolicyWritePermissionRoute } from "#src/server/inbound/admin-http/routes/users/write-policy-permission";
import { registerAdminPolicyPermissionListRoute } from "#src/server/inbound/admin-http/routes/users/list-policy-permissions";
import { registerAdminPolicyPermissionRemoveRoute } from "#src/server/inbound/admin-http/routes/users/remove-policy-permission";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-040) — the `users` server module (users/roles/policies admin
 * CRUD, ADR-021/SPEC-006 identity RBAC).
 *
 * `UsersRouteDeps` (new this pass, `apps/website/src/server/inbound/admin-http/routes/users/deps.ts`) is a genuine `Pick<RouteDeps,
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
 * OQ-10 (2026-08-24) adds `list-policy-permissions`/`remove-policy-permission`, which together make
 * a policy's permission set editable rather than append-only — 19. The delete-user plan (2026-09-24)
 * adds `delete` (`DELETE_USER`) — 20 total.
 *
 * K1 (RT-K1-adm-users): the 9 user (principal) routes — list, create, update, disable, enable,
 * reset-password, delete, assign-role, attach-policy — are Jini route specs
 * (`@jini-ai/user-management/admin-http/routes/users/*`) mounted below behind the admin ports.
 * `UsersRouteDeps` is read only here, at registration: each mount builds that route's own small deps
 * object. The Tovu-owned collaborators the specs need are injected here too: the identity-deps
 * assembler, the Trash index and trash move, the account-protection guard/read and the host error
 * classes (as predicates). The identity services are bound from `@jini-ai/user-management/server`.
 */
/** The two port fields every users mount passes. `authorize` is read per request, as the hand-written
 *  routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function userPortDeps({ deps }: { deps: UsersRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** The unexpected-failure copy key (`sendAdminFailure`'s operation) each route had. Every users
 *  route is `"direct"`: none consulted the publishing-credential override — `list` called
 *  `deps.authorize` itself and the others are gated inside the identity services. */
function mountOptions(operation: string) {
  return { authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } };
}

/** The identity services' deps bag, assembled per request exactly as the hand-written routes did,
 *  plus the Trash index; both read lazily from `deps` so a later reassignment is honoured. */
function userServiceDeps({ deps }: { deps: UsersRouteDeps }, _optional: Record<string, never> = {}) {
  return {
    ...userPortDeps({ deps }),
    identityServices: () => identityServiceDepsFrom(deps),
    isInTrash: (required: { principalId: string }) => deps.isInTrash(required),
  };
}

/** The host's own error classes, handed to the specs as predicates (the engine cannot `instanceof` them). */
const isSelfDeleteError = ({ err }: { err: unknown }) => err instanceof SelfDeleteError;
const isUserInTrashError = ({ err }: { err: unknown }) => err instanceof UserInTrashError;
const isUserDeleteUnsupportedError = ({ err }: { err: unknown }) => err instanceof UserDeleteUnsupportedError;

export const registerAdminUserListRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  const listDeps = {
    ...userServiceDeps({ deps }), decidePermission: (params: Parameters<UsersRouteDeps["authorize"]>[0]) => deps.authorize(params),
    ownerPrincipalId: deps.ownerPrincipalId, userAccountProtection,
  };
  mountAdminJsonRoute({ app, spec: userListRoute, deps: listDeps }, mountOptions("routes/users/list"));
};

export const registerAdminUserCreateRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: userCreateRoute, deps: { ...userServiceDeps({ deps }), createUser, normalizeUsername } }, mountOptions("routes/users/create"));
};

export const registerAdminUserUpdateRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: userUpdateRoute, deps: { ...userServiceDeps({ deps }), updateUser, isUserInTrashError } }, mountOptions("routes/users/update"));
};

export const registerAdminUserDisableRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  const disableDeps = { ...userServiceDeps({ deps }), disablePrincipal, ownerPrincipalId: deps.ownerPrincipalId, assertUserAccountAction, isSelfDeleteError };
  mountAdminJsonRoute({ app, spec: userDisableRoute, deps: disableDeps }, mountOptions("routes/users/disable"));
};

export const registerAdminUserEnableRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: userEnableRoute, deps: { ...userServiceDeps({ deps }), enablePrincipal, assertCallerHasAnyPermission, isUserInTrashError } }, mountOptions("routes/users/enable"));
};

/** The reset-password mount's deps; exported so a wire test can swap only the account guard. */
export function userResetPasswordRouteDeps({ deps }: { deps: UsersRouteDeps }, _optional: Record<string, never> = {}) {
  return { ...userServiceDeps({ deps }), resetUserPassword, ownerPrincipalId: deps.ownerPrincipalId, assertUserAccountAction, isUserInTrashError, isSelfDeleteError };
}

export const registerAdminUserResetPasswordRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: userResetPasswordRoute, deps: userResetPasswordRouteDeps({ deps }) }, mountOptions("routes/users/reset-password"));
};

/** The trash move is host-local (`features/identity/delete-user-service.ts`), bound here to this
 *  request's identity deps; `removeUser` is read per request (absent → its 501). */
export const registerAdminUserDeleteRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  const deleteDeps = {
    ...userPortDeps({ deps }), ownerPrincipalId: deps.ownerPrincipalId, isSelfDeleteError, isUserDeleteUnsupportedError,
    trashUser: (input: Parameters<typeof trashUser>[0]["input"]) =>
      trashUser({ deps: { identity: identityServiceDepsFrom(deps), removeUser: deps.removeUser, isInTrash: deps.isInTrash }, input }),
  };
  mountAdminJsonRoute({ app, spec: userDeleteRoute, deps: deleteDeps }, mountOptions("routes/users/delete"));
};

export const registerAdminUserAssignRoleRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: userAssignRoleRoute, deps: { ...userServiceDeps({ deps }), assignRole } }, mountOptions("routes/users/assign-role"));
};

export const registerAdminUserAttachPolicyRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: userAttachPolicyRoute, deps: { ...userServiceDeps({ deps }), attachPolicy } }, mountOptions("routes/users/attach-policy"));
};

export function createUsersModule(deps: UsersRouteDeps): ServerModuleHandle {
  return {
    name: "users",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminUserListRoute({ app, deps });
      registerAdminUserCreateRoute({ app, deps });
      registerAdminUserUpdateRoute({ app, deps });
      registerAdminUserDisableRoute({ app, deps });
      registerAdminUserEnableRoute({ app, deps });
      registerAdminUserResetPasswordRoute({ app, deps });
      registerAdminUserDeleteRoute({ app, deps });
      registerAdminUserAssignRoleRoute({ app, deps });
      registerAdminUserAttachPolicyRoute({ app, deps });
      registerAdminRoleListRoute({ app, deps });
      registerAdminRoleCreateRoute({ app, deps });
      registerAdminRoleUpdateRoute({ app, deps });
      registerAdminRoleDeleteRoute({ app, deps });
      registerAdminPolicyListRoute({ app, deps });
      registerAdminPolicyCreateRoute({ app, deps });
      registerAdminPolicyUpdateRoute({ app, deps });
      registerAdminPolicyDeleteRoute({ app, deps });
      registerAdminPolicyWritePermissionRoute({ app, deps });
      registerAdminPolicyPermissionListRoute({ app, deps });
      registerAdminPolicyPermissionRemoveRoute({ app, deps });
    },
  };
}
