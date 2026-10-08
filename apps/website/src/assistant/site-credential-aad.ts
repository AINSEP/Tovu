import type { UUID } from "@jini-ai/core/primitives";

/**
 * @file The ONE place `site_assistant_credentials`' AES-GCM additional authenticated data (AAD)
 * string is formatted — same convention as `features/vendor-credentials/aad.ts` and its siblings:
 * every `seal()`/`open()` call for this table MUST go through this function so sealing and opening
 * can never drift onto two different formats (which would make every row in the table permanently
 * unopenable, since AAD is authenticated but never stored — see
 * `../features/webhooks/secret-sealer.aesgcm.ts`'s file header).
 *
 * Format: `site-assistant-credential:v1:${workspaceId}` — this table is single-row-per-workspace
 * (`workspace_id` is the bare primary key, `db/schema.sqlite.ts`'s `siteAssistantCredentials` doc), so
 * `workspaceId` is the whole row identity there is to bind. That single binding is still
 * load-bearing: without it, an attacker (or a bad migration) with DB write access could copy one
 * workspace's sealed visitor-assistant key onto another workspace's row and have it decrypt
 * cleanly, since the underlying AES key is shared app-wide (`secret-sealer.aesgcm.ts`'s own
 * header).
 *
 * Legacy no-AAD rows remain readable via `site_assistant_credentials.aad_version`; see its schema contract
 * and the owning backfill script. Opening must use the version the row was sealed under.
 */
const AAD_VERSION = "v1";

/**
 * Builds the AAD string for one `site_assistant_credentials` row. Deterministic — the same
 * `workspaceId` always produces the same string, which is required: opening a sealed value must
 * re-derive the byte-identical value sealing used, with no separate storage of the AAD itself.
 *
 * @complexity O(1) — a fixed-shape string template.
 */
export function buildSiteAssistantCredentialAad(input: { workspaceId: UUID }): string {
  return `site-assistant-credential:${AAD_VERSION}:${input.workspaceId}`;
}
