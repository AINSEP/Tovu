import type { UUID } from "@jini-ai/cms/core";

/**
 * @file The ONE place `composio_config`'s AES-GCM additional authenticated data (AAD) string is
 * formatted — same convention as `features/vendor-credentials/aad.ts` and its three siblings: every
 * `seal()`/`open()` call for this table MUST go through this function so sealing and opening can
 * never drift onto two different formats (which would make every row in the table permanently
 * unopenable, since AAD is authenticated but never stored — see
 * `webhooks/secret-sealer.aesgcm.ts`'s file header).
 *
 * Format: `composio-config:v1:${workspaceId}` — this table is single-row-per-workspace
 * (`workspace_id` is the bare primary key, `db/schema.sqlite.ts`'s `composioConfig` doc), so `workspaceId`
 * is the whole row identity there is to bind. That single binding is still load-bearing: without it,
 * an attacker (or a bad migration) with DB write access could copy one workspace's sealed Composio
 * project key onto another workspace's row and have it decrypt cleanly, since the underlying AES key
 * is shared app-wide (`secret-sealer.aesgcm.ts`'s own header).
 *
 * This table's rows predate AAD entirely (2026-09-02 gap closure) — see
 * `composio_config.aad_version`'s own doc in `db/schema.sqlite.ts` and `development/scripts/backfill-
 * composio-config-aad.ts` for how existing rows are migrated without becoming unreadable.
 */
const AAD_VERSION = "v1";

/**
 * Builds the AAD string for one `composio_config` row. Deterministic — the same `workspaceId`
 * always produces the same string, which is required: opening a sealed value must re-derive the
 * byte-identical value sealing used, with no separate storage of the AAD itself.
 *
 * @complexity O(1) — a fixed-shape string template.
 */
export function buildComposioConfigAad(input: { workspaceId: UUID }): string {
  return `composio-config:${AAD_VERSION}:${input.workspaceId}`;
}
