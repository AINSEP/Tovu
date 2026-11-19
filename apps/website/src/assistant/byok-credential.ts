/**
 * @file Tovu's stored BYOK credential binding. Resolution order and parsing live in
 * `@jini-ai/agent-runtime/providers/credentials` (`createStoredExecutionCredentialPort`); Tovu binds the
 * admin's own `(workspaceId, principalId)` row from `execution-credential-store.ts` (design:
 * `ADS-memory/reports/analysis/2026-08-05-admin-byok-keystore-design.md`, owner-approved). A request-
 * supplied key still wins, mirroring the `useStoredCredential` pattern of
 * `apps/admin/src/lib/execution-settings.ts` for the test-connection/list-models routes.
 */

import { createStoredExecutionCredentialPort as createJiniStoredExecutionCredentialPort, type ExecutionCredentialPort } from "@jini-ai/agent-runtime/providers/credentials";
import { resolveExecutionCredential, type AdminExecutionCredentialRepoPort } from "./execution-credential-store.js";
import type { SecretSealerPort } from "@jini-ai/integrations/webhooks";

export interface StoredExecutionCredentialPortDeps {
  repo: AdminExecutionCredentialRepoPort;
  sealer: SecretSealerPort;
}

/**
 * The port `assistant-byok.ts` constructs. A decrypt failure on the stored row degrades to `null`
 * (`resolveExecutionCredential`'s never-throws contract), which `assistant-byok.ts` treats as an ordinary 400.
 * @complexity O(1): at most one repo read plus one decrypt.
 */
export function createStoredExecutionCredentialPort(deps: StoredExecutionCredentialPortDeps): ExecutionCredentialPort {
  return createJiniStoredExecutionCredentialPort({ readStored: (input) => resolveExecutionCredential({ deps, input }) });
}
