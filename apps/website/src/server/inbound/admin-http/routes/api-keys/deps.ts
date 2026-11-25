import type { Express } from "express";

import { API_KEY_SESSION_CREDENTIAL_GATE } from "@jini-ai/user-management/admin-http/routes/api-keys/shared";
import type { IdentityRepos } from "@jini-ai/core/contracts/site/user-management";
import type { ApiKeyServiceDeps } from "@jini-ai/user-management/identity/api-key-service";
import type { AdminJsonRouteMountOptions, AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";
import type { IdentityRouteDepsSlice } from "#src/features/identity/wiring";

/**
 * @file `RouteDeps` -> `identity`/api-key service-deps mapping for the three api-keys admin routes,
 * plus the narrow `ApiKeysRouteDeps` type the `api-keys` server module's registrars need and the
 * two guards all three routes share.
 *
 * Purpose:
 * Mirrors `apps/website/src/server/inbound/admin-http/routes/users/deps.ts` exactly — same `Pick<RouteDeps, ...>` narrowing, same
 * "assemble the nested repo bag here so no route repeats the field mapping" role. The two extra
 * fields over `UsersRouteDeps` (`apiKeyRepo`, `apiKeySecretHasher`) are what `api-key-service.ts`
 * needs on top of the nine identity repos.
 *
 * Architectural role:
 * Composition-boundary glue plus this family's shared HTTP concerns — no business logic. The
 * transitions themselves live in `identity/api-key-service.ts` and know nothing about Express.
 *
 * Since the K1 move the guards are the Jini specs' mount options (`API_KEY_MOUNT_OPTIONS`) and the specs
 * live in `@jini-ai/user-management/admin-http/routes/api-keys/*`.
 */
export type ApiKeysRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "clock"
  | "idGen"
  | "principalRepo"
  | "userRepo"
  | "sessionRepo"
  | "roleRepo"
  | "policyRepo"
  | "policyPermissionRepo"
  | "rolePolicyRepo"
  | "principalRoleRepo"
  | "principalPolicyRepo"
  | "passwordHasher"
  | "apiKeyRepo"
  | "apiKeySecretHasher"
> & Pick<IdentityRouteDepsSlice, "transactions" | "tokens">;

/** Registrar signature for the api-keys route modules (mirrors `UsersRouteRegistrar`). */
export type ApiKeysRouteRegistrar = (required: { app: Express; deps: ApiKeysRouteDeps }, optional?: Record<string, never>) => void;

/** Assemble the `IdentityRepos` bag identity functions expect from `RouteDeps`'s flat fields. */
function identityReposFrom(deps: ApiKeysRouteDeps): IdentityRepos {
  return {
    transactions: deps.transactions,
    principals: deps.principalRepo,
    users: deps.userRepo,
    sessions: deps.sessionRepo,
    roles: deps.roleRepo,
    policies: deps.policyRepo,
    policyPermissions: deps.policyPermissionRepo,
    rolePolicies: deps.rolePolicyRepo,
    principalRoles: deps.principalRoleRepo,
    principalPolicies: deps.principalPolicyRepo,
  };
}

/** Assemble the `ApiKeyServiceDeps` bag `api-key-service.ts`'s transitions expect. */
export function apiKeyServiceDepsFrom(deps: ApiKeysRouteDeps): ApiKeyServiceDeps {
  return {
    repos: identityReposFrom(deps),
    hasher: deps.passwordHasher,
    clock: { nowMs: () => Date.parse(deps.clock.nowIso()) },
    idGen: deps.idGen,
    tokens: deps.tokens,
    apiKeys: deps.apiKeyRepo,
    secretHasher: deps.apiKeySecretHasher,
  };
}

/**
 * The port fields and mount options all three api-key mounts share. The no-escalation guard (why:
 * `API_KEY_SESSION_CREDENTIAL_GATE` in `@jini-ai/user-management/admin-http/routes/api-keys/shared`)
 * is the mount's `sessionCredentialOnly` gate, so it still answers before the body is read; an
 * unmapped failure is the same redacted 500 `sendApiKeyError` wrote under this operation.
 */
// Why the mount (not the spec) answers a gate or wiring throw, from the hand-written handler:
// Inside the try: requireAdminSession always sets res.locals before this route runs, but
// Express 4 doesn't catch a synchronous throw from an async handler outside try/catch (the
// request would otherwise hang instead of 500ing).
export const API_KEY_MOUNT_OPTIONS: AdminJsonRouteMountOptions = {
  sessionCredentialOnly: API_KEY_SESSION_CREDENTIAL_GATE,
  failure: { operation: "routes/api-keys/deps", code: "INTERNAL_ERROR" },
};

/**
 * The deps every api-key spec reads plus the two admin port fields. The specs never call the
 * `authorize` port — `apikey.manage` is enforced inside the identity services — so it is bound to a
 * deny-all: a future spec that started asking would fail closed instead of silently passing.
 * @complexity O(1).
 */
export function apiKeyMountDeps({ deps }: { deps: ApiKeysRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps & { apiKeyServices: () => ApiKeyServiceDeps } {
  return {
    workspaceId: deps.workspaceId,
    authorize: async () => ({ allowed: false, reason: "api-key routes authorize inside the identity services" }),
    apiKeyServices: () => apiKeyServiceDepsFrom(deps),
  };
}
