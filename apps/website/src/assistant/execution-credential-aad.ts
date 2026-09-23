import type { UUID } from "@jini-ai/cms/core";

/**
 * @file The ONE place `admin_execution_credentials`' AES-GCM additional authenticated data (AAD)
 * string is formatted — same convention as `features/vendor-credentials/aad.ts` and its siblings:
 * every `seal()`/`open()` call for this table MUST go through this function so sealing and opening
 * can never drift onto two different formats (which would make every row in the table permanently
 * unopenable, since AAD is authenticated but never stored — see
 * `../features/webhooks/secret-sealer.aesgcm.ts`'s file header).
 *
 * Format: `admin-execution-credential:v1:${workspaceId}:${principalId}` — this table has no
 * surrogate `id` column (`(workspace_id, principal_id)` IS the row's own primary key, per
 * `db/schema.sqlite.ts`'s `adminExecutionCredentials` doc), so the AAD binds that composite PK directly.
 * Binds both scoping dimensions this table actually has: a ciphertext sealed under one admin's own
 * BYOK key fails auth-tag verification if presented as any other admin's ciphertext, even within
 * the same workspace — which is exactly the property this table's own header requires ("two admins
 * on the same install already carry independent keys").
 *
 * This table's rows predate AAD entirely (2026-09-02 gap closure, `SecretSealerPort`'s own header
 * used to name this table by number among the callers with no AAD at all) — see
 * `admin_execution_credentials.aad_version`'s own doc in `db/schema.sqlite.ts` and
 * `development/scripts/backfill-execution-credential-aad.ts` for how existing rows are migrated
 * without becoming unreadable.
 */
const AAD_VERSION = "v1";

/**
 * Builds the AAD string for one `admin_execution_credentials` row. Deterministic — the same
 * `(workspaceId, principalId)` always produces the same string, which is required: opening a
 * sealed value must re-derive the byte-identical value sealing used, with no separate storage of
 * the AAD itself.
 *
 * @complexity O(1) — a fixed-shape string template.
 */
export function buildExecutionCredentialAad(input: { workspaceId: UUID; principalId: UUID }): string {
  return `admin-execution-credential:${AAD_VERSION}:${input.workspaceId}:${input.principalId}`;
}
