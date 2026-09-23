import type { UUID } from "@jini-ai/cms/core";

/**
 * @file The ONE place `media_provider_credentials`' AES-GCM additional authenticated data (AAD)
 * string is formatted — mirrors `features/vendor-credentials/aad.ts`/`features/custom-credentials/
 * aad.ts`/`features/source-control/aad.ts`/`features/deployments/publish-credentials/aad.ts`
 * exactly, all four of whose file headers this one repeats verbatim: every `seal()`/`open()` call
 * for this table MUST go through this function so sealing and opening can never drift onto two
 * different formats (which would make every row in the table permanently unopenable, since AAD is
 * authenticated but never stored — see `webhooks/secret-sealer.aesgcm.ts`'s file header).
 *
 * Format: `media-provider-credential:v1:${workspaceId}:${providerId}` — this table has no surrogate
 * `id` column (`(workspace_id, provider_id)` IS the row's own primary key, per `db/schema.sqlite.ts`'s
 * `mediaProviderCredentials` doc), so the AAD binds that composite PK directly rather than a third
 * `id` component the row does not have. Binds both scoping dimensions this table actually has: a
 * ciphertext sealed under one provider's AAD fails auth-tag verification if presented as any other
 * provider's ciphertext, even within the same workspace.
 *
 * This table's rows predate AAD entirely (2026-09-02 gap closure) — see `media_provider_
 * credentials.aad_version`'s own doc in `db/schema.sqlite.ts` and `development/scripts/backfill-media-
 * provider-credential-aad.ts` for how existing rows are migrated without becoming unreadable.
 */
const AAD_VERSION = "v1";

/**
 * Builds the AAD string for one `media_provider_credentials` row. Deterministic — the same
 * `(workspaceId, providerId)` always produces the same string, which is required: opening a sealed
 * value must re-derive the byte-identical value sealing used, with no separate storage of the AAD
 * itself.
 *
 * @complexity O(1) — a fixed-shape string template.
 */
export function buildMediaProviderCredentialAad(input: { workspaceId: UUID; providerId: string }): string {
  return `media-provider-credential:${AAD_VERSION}:${input.workspaceId}:${input.providerId}`;
}
