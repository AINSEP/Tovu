import type { UUID } from "@jini-ai/cms/core";

/**
 * @file The ONE place `composio_connector_credentials`' AES-GCM additional authenticated data
 * (AAD) string is formatted — same convention as `features/vendor-credentials/aad.ts` and its
 * siblings: every `seal()`/`open()` call for this table MUST go through this function so sealing
 * and opening can never drift onto two different formats (which would make every row in the table
 * permanently unopenable, since AAD is authenticated but never stored — see
 * `webhooks/secret-sealer.aesgcm.ts`'s file header).
 *
 * Format: `composio-connector-credential:v1:${workspaceId}:${connectorId}` — this table has no
 * surrogate `id` column (`(workspace_id, connector_id)` IS the row's own primary key, per
 * `db/schema.ts`'s `composioConnectorCredentials` doc), so the AAD binds that composite PK
 * directly. Binds both scoping dimensions this table actually has: a ciphertext sealed under one
 * connected account's AAD fails auth-tag verification if presented as any other connector's
 * ciphertext, even within the same workspace.
 *
 * This table's rows predate AAD entirely (2026-09-02 gap closure) — see
 * `composio_connector_credentials.aad_version`'s own doc in `db/schema.ts` and
 * `development/scripts/backfill-connector-credential-aad.ts` for how existing rows are migrated
 * without becoming unreadable.
 */
const AAD_VERSION = "v1";

/**
 * Builds the AAD string for one `composio_connector_credentials` row. Deterministic — the same
 * `(workspaceId, connectorId)` always produces the same string, which is required: opening a
 * sealed value must re-derive the byte-identical value sealing used, with no separate storage of
 * the AAD itself.
 *
 * @complexity O(1) — a fixed-shape string template.
 */
export function buildConnectorCredentialAad(input: { workspaceId: UUID; connectorId: string }): string {
  return `composio-connector-credential:${AAD_VERSION}:${input.workspaceId}:${input.connectorId}`;
}
