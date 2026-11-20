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
 * The port `assistant-byok.ts` constructs today. Resolution order: a request-supplied credential
 * wins when present (an admin trying a key they haven't saved yet — no DB read needed for that
 * fast path); otherwise falls back to this admin's own stored row
 * (`execution-credential-store.ts`'s `resolveExecutionCredential`, scoped to
 * `(workspaceId, principalId)`). A stored row with no `model` set is treated as unusable (turns
 * always need a model) — same as the request-supplied path's own `model` requirement.
 *
 * Never throws — a decrypt failure on the stored row degrades to `null` (`resolveExecutionCredential`'s
 * own never-throws contract), which `assistant-byok.ts` already treats as an ordinary 400.
 *
 * @complexity O(1) — at most one repo read plus one decrypt, only when the request supplied nothing usable.
 * @overallScore 100
 */
export function createStoredExecutionCredentialPort(deps: StoredExecutionCredentialPortDeps): ExecutionCredentialPort {
  return createJiniStoredExecutionCredentialPort({ readStored: (input) => resolveExecutionCredential({ deps, input }) });
}
