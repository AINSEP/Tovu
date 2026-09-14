import type { Express, Response } from "express";

import {
  GrantExceedsIssuerError,
  IdentityForbiddenError,
  IdentityNotFoundError,
  IdentityValidationError,
  type IdentityRepos,
} from "@jini-ai/cms/identity";
import type { ApiKeyServiceDeps } from "#src/features/identity/api-key-service";
import { rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file `RouteDeps` -> `identity`/api-key service-deps mapping for the three api-keys admin routes,
 * plus the narrow `ApiKeysRouteDeps` type the `api-keys` server module's registrars need and the
 * two guards all three routes share.
 *
 * Purpose:
 * Mirrors `routes/admin/users/deps.ts` exactly — same `Pick<RouteDeps, ...>` narrowing, same
 * "assemble the nested repo bag here so no route repeats the field mapping" role. The two extra
 * fields over `UsersRouteDeps` (`apiKeyRepo`, `apiKeySecretHasher`) are what `api-key-service.ts`
 * needs on top of the nine identity repos.
 *
 * Architectural role:
 * Composition-boundary glue plus this family's shared HTTP concerns — no business logic. The
 * transitions themselves live in `identity/api-key-service.ts` and know nothing about Express.
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
>;

/** Registrar signature for the api-keys route modules (mirrors `UsersRouteRegistrar`). */
export type ApiKeysRouteRegistrar = (app: Express, deps: ApiKeysRouteDeps) => void;

/** Assemble the `IdentityRepos` bag identity functions expect from `RouteDeps`'s flat fields. */
function identityReposFrom(deps: ApiKeysRouteDeps): IdentityRepos {
  return {
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
    clock: deps.clock,
    idGen: deps.idGen,
    apiKeys: deps.apiKeyRepo,
    secretHasher: deps.apiKeySecretHasher,
  };
}

/**
 * **The no-escalation guard.** All three operations in this family are `security:
 * [{ adminSessionCookie: [] }]` in `openapi/006-identity-and-authorization.yaml`: a human admin
 * session mints, issues, and revokes keys — an API key may not. Without this, any key holding
 * `apikey.manage` could issue itself a successor, and revoking the original would not end the
 * caller's access; key issuance would be a privilege-escalation primitive rather than a delegation
 * of authority a human can withdraw.
 *
 * Runs BEFORE the request body is read and before any existence check, so an api_key caller learns
 * nothing about whether a target exists.
 *
 * @returns `true` when the request may proceed. On `false` the 403 has already been sent.
 * @complexity O(1).
 * @overallScore 100
 */
export function rejectApiKeyCredential(res: Response): boolean {
  return rejectUnlessSessionCredential(res, {
    message: "api-key credentials may not manage api keys; use an admin session",
    permission: "apikey.manage",
  });
}

/**
 * Maps this family's thrown error types onto the admin error envelope. Shared by all three routes
 * because all three throw from the same service module and errors.spec.md gives them the same
 * codes (mirrors `users/attach-policy.ts`'s `sendAttachPolicyError`, one level up).
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function sendApiKeyError(res: Response, err: unknown): void {
  if (err instanceof IdentityForbiddenError) {
    res.status(403).json({
      error: err.message,
      code: "FORBIDDEN",
      details: { permission: err.permission, reason: err.reason },
    });
    return;
  }
  if (err instanceof GrantExceedsIssuerError) {
    res.status(403).json({
      error: err.message,
      code: "GRANT_EXCEEDS_ISSUER",
      details: { offendingPermissions: err.offendingPermissions },
    });
    return;
  }
  if (err instanceof IdentityValidationError) {
    res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
    return;
  }
  if (err instanceof IdentityNotFoundError) {
    res.status(404).json({ error: err.message, code: "RESOURCE_NOT_FOUND" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}
