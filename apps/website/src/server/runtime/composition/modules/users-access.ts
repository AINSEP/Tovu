import {
  createPolicy, createRole, deletePolicy, deleteRole, removePolicyPermission, updatePolicy, updateRole, writePolicyPermission,
} from "@jini-ai/user-management/server";
import { policyListRoute } from "@jini-ai/user-management/admin-http/routes/users/list-policies";
import { policyPermissionListRoute } from "@jini-ai/user-management/admin-http/routes/users/list-policy-permissions";
import { roleListRoute } from "@jini-ai/user-management/admin-http/routes/users/list-roles";
import { policyPermissionRemoveRoute } from "@jini-ai/user-management/admin-http/routes/users/remove-policy-permission";
import { policyCreateRoute } from "@jini-ai/user-management/admin-http/routes/users/create-policy";
import { roleCreateRoute } from "@jini-ai/user-management/admin-http/routes/users/create-role";
import { policyDeleteRoute } from "@jini-ai/user-management/admin-http/routes/users/delete-policy";
import { roleDeleteRoute } from "@jini-ai/user-management/admin-http/routes/users/delete-role";
import { policyUpdateRoute } from "@jini-ai/user-management/admin-http/routes/users/update-policy";
import { roleUpdateRoute } from "@jini-ai/user-management/admin-http/routes/users/update-role";
import { policyPermissionWriteRoute } from "@jini-ai/user-management/admin-http/routes/users/write-policy-permission";
import { assertActiveOwnerFloor, principalHoldsOwnerWildcard } from "@jini-ai/user-management/identity/delete-user-service";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { identityServiceDepsFrom, type UsersRouteDeps, type UsersRouteRegistrar } from "#src/server/inbound/admin-http/routes/users/deps";

/**
 * @file The `users` server module's role/policy half (K1, RT-K1-adm-users): the role and policy
 * write routes and a policy's permission-row routes, as Jini route specs
 * (`@jini-ai/user-management/admin-http/routes/users/*`) mounted behind the admin ports.
 *
 * `createUsersModule` (`modules/users.ts`) keeps the registration order and imports these
 * registrars by their old names. `UsersRouteDeps` is read only here, at registration: each mount
 * builds that route's own small deps object. What the specs need from Tovu is injected here: the
 * identity services' deps bag (it binds Tovu's rename port), the permissions no role may be
 * granted (the publishing backstop), and each route's one identity service function, bound from
 * the `@jini-ai/user-management/server` node entry (the specs only see its type).
 *
 * Every write here is authorized inside the identity service (`role.manage`), never by the route,
 * so the mount mode is `"direct"`: none of them ever consulted the publishing-credential override.
 * The three read routes (`list-roles`, `list-policies`, `list-policy-permissions`) are the
 * exception: they asked `authorizeOrRespond` for `role.manage` themselves (no entity type, no
 * entity id — the port forwards neither key when the spec names none), so they mount `"guarded"`.
 * `remove-policy-permission` answers its 204 as a bodiless `routeReply` (a bare `send()`, as before);
 * the host owner guards it calls (`principalHoldsOwnerWildcard`, `assertActiveOwnerFloor`) are
 * Tovu's own and are injected here.
 */

/** Manual publishing is reserved for the owner and built-in admins: no custom role may carry it. */
const UNGRANTABLE_ROLE_PERMISSIONS: readonly string[] = ["publish.backstop", "publish_content.backstop"];
const UNGRANTABLE_ROLE_PERMISSION_REFUSAL = "Manual publishing is reserved for the owner and built-in admins; it cannot be granted to another role.";

/** The port fields plus the identity services' deps bag every role/policy mount passes. `authorize`
 *  and the bag are read per request, as the hand-written routes read `deps`, so a later
 *  reassignment of a `deps` field is still honoured. */
function accessDeps({ deps }: { deps: UsersRouteDeps }, _optional: Record<string, never> = {}) {
  const ports: AdminJsonRoutePortDeps = { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
  return { ...ports, identityServiceDeps: () => identityServiceDepsFrom(deps) };
}

/** The unexpected-failure copy key each route passed `sendAdminFailure`. */
function mountOptions(operation: string) {
  return { authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } };
}

/** The read routes' mount: `authorizeOrRespond`'s decision source (`"guarded"`, the default). */
function readMountOptions(operation: string) {
  return { authorization: "guarded" as const, failure: { operation, code: "INTERNAL_ERROR" } };
}

export const registerAdminRoleListRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  const listDeps = { ...accessDeps({ deps }), roleRepo: { list: (required: { workspaceId: string }) => deps.roleRepo.list(required) } };
  mountAdminJsonRoute({ app, spec: roleListRoute, deps: listDeps }, readMountOptions("routes/users/list-roles"));
};

export const registerAdminPolicyListRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  const listDeps = { ...accessDeps({ deps }), policyRepo: { list: (required: { workspaceId: string }) => deps.policyRepo.list(required) } };
  mountAdminJsonRoute({ app, spec: policyListRoute, deps: listDeps }, readMountOptions("routes/users/list-policies"));
};

export const registerAdminPolicyPermissionListRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  const listDeps = {
    ...accessDeps({ deps }),
    policyRepo: { findById: (required: { workspaceId: string; id: string }) => deps.policyRepo.findById(required) },
    policyPermissionRepo: { listByPolicyId: (required: { workspaceId: string; policyId: string }) => deps.policyPermissionRepo.listByPolicyId(required) },
  };
  mountAdminJsonRoute({ app, spec: policyPermissionListRoute, deps: listDeps }, readMountOptions("routes/users/list-policy-permissions"));
};

/** The transaction and the row read are bound per request, as the hand-written route read `deps`. */
export const registerAdminPolicyPermissionRemoveRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  const removeDeps = {
    ...accessDeps({ deps }), removePolicyPermission, principalHoldsOwnerWildcard, assertActiveOwnerFloor,
    transactions: { run: <T>(required: { workspaceId: string; execute: () => Promise<T> }) => deps.transactions.run(required) },
    policyPermissionRepo: { listByPolicyId: (required: { workspaceId: string; policyId: string }) => deps.policyPermissionRepo.listByPolicyId(required) },
  };
  mountAdminJsonRoute({ app, spec: policyPermissionRemoveRoute, deps: removeDeps }, mountOptions("routes/users/remove-policy-permission"));
};

export const registerAdminRoleCreateRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: roleCreateRoute, deps: { ...accessDeps({ deps }), createRole } }, mountOptions("routes/users/create-role"));
};

export const registerAdminRoleUpdateRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: roleUpdateRoute, deps: { ...accessDeps({ deps }), updateRole } }, mountOptions("routes/users/update-role"));
};

export const registerAdminRoleDeleteRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: roleDeleteRoute, deps: { ...accessDeps({ deps }), deleteRole } }, mountOptions("routes/users/delete-role"));
};

export const registerAdminPolicyCreateRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: policyCreateRoute, deps: { ...accessDeps({ deps }), createPolicy } }, mountOptions("routes/users/create-policy"));
};

export const registerAdminPolicyUpdateRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: policyUpdateRoute, deps: { ...accessDeps({ deps }), updatePolicy } }, mountOptions("routes/users/update-policy"));
};

export const registerAdminPolicyDeleteRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: policyDeleteRoute, deps: { ...accessDeps({ deps }), deletePolicy } }, mountOptions("routes/users/delete-policy"));
};

export const registerAdminPolicyWritePermissionRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  const writeDeps = {
    ...accessDeps({ deps }), writePolicyPermission,
    ungrantablePermissions: UNGRANTABLE_ROLE_PERMISSIONS, ungrantablePermissionRefusal: UNGRANTABLE_ROLE_PERMISSION_REFUSAL,
  };
  mountAdminJsonRoute({ app, spec: policyPermissionWriteRoute, deps: writeDeps }, mountOptions("routes/users/write-policy-permission"));
};
