import { policyCreateRoute } from "@jini-ai/user-management/admin-http/routes/users/create-policy";
import { roleCreateRoute } from "@jini-ai/user-management/admin-http/routes/users/create-role";
import { policyDeleteRoute } from "@jini-ai/user-management/admin-http/routes/users/delete-policy";
import { roleDeleteRoute } from "@jini-ai/user-management/admin-http/routes/users/delete-role";
import { policyUpdateRoute } from "@jini-ai/user-management/admin-http/routes/users/update-policy";
import { roleUpdateRoute } from "@jini-ai/user-management/admin-http/routes/users/update-role";
import { policyPermissionWriteRoute } from "@jini-ai/user-management/admin-http/routes/users/write-policy-permission";
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
 * identity services' deps bag (it binds Tovu's rename port) and the permissions no role may be
 * granted (the publishing backstop).
 *
 * Every route here is authorized inside the identity service (`role.manage`), never by the route,
 * so the mount mode is `"direct"`: none of them ever consulted the publishing-credential override.
 * Not here yet (still hand-written under `inbound/admin-http/routes/users/`): the three list routes
 * (`list-roles`, `list-policies`, `list-policy-permissions`) — the authorize port always sends an
 * `entityType`, which their RBAC call never carried — and `remove-policy-permission`, whose 204 is
 * pinned as `res.send()` while the JSON mount answers it through `res.json()`.
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

export const registerAdminRoleCreateRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: roleCreateRoute, deps: accessDeps({ deps }) }, mountOptions("routes/users/create-role"));
};

export const registerAdminRoleUpdateRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: roleUpdateRoute, deps: accessDeps({ deps }) }, mountOptions("routes/users/update-role"));
};

export const registerAdminRoleDeleteRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: roleDeleteRoute, deps: accessDeps({ deps }) }, mountOptions("routes/users/delete-role"));
};

export const registerAdminPolicyCreateRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: policyCreateRoute, deps: accessDeps({ deps }) }, mountOptions("routes/users/create-policy"));
};

export const registerAdminPolicyUpdateRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: policyUpdateRoute, deps: accessDeps({ deps }) }, mountOptions("routes/users/update-policy"));
};

export const registerAdminPolicyDeleteRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: policyDeleteRoute, deps: accessDeps({ deps }) }, mountOptions("routes/users/delete-policy"));
};

export const registerAdminPolicyWritePermissionRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  const writeDeps = {
    ...accessDeps({ deps }),
    ungrantablePermissions: UNGRANTABLE_ROLE_PERMISSIONS, ungrantablePermissionRefusal: UNGRANTABLE_ROLE_PERMISSION_REFUSAL,
  };
  mountAdminJsonRoute({ app, spec: policyPermissionWriteRoute, deps: writeDeps }, mountOptions("routes/users/write-policy-permission"));
};
