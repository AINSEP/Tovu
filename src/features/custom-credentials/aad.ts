import type { UUID } from "@jini-ai/cms/core";

/**
 * @file The ONE place `custom_credential_sets`' AES-GCM additional authenticated data (AAD) string
 * is formatted — mirrors `features/source-control/aad.ts` exactly. Every `seal()`/`open()` call for
 * this table MUST go through this function so sealing and opening can never drift onto two
 * different formats (which would make every row in the table permanently unopenable, since AAD is
 * authenticated but never stored — see `integrations/secret-sealer.aesgcm.ts`'s file header).
 *
 * Format: `custom-credential-set:v1:${workspaceId}:${id}` — versioned (`v1`), and bound to both
 * scoping dimensions this table actually has (no `providerId` — see `types.ts`'s own header for
 * why this table has none to bind).
 */
const AAD_VERSION = "v1";

/**
 * Builds the AAD string for one `custom_credential_sets` row. Deterministic — the same
 * `(workspaceId, id)` always produces the same string, which is required: opening a sealed value
 * must re-derive the byte-identical value sealing used, with no separate storage of the AAD itself.
 *
 * @complexity O(1) — a fixed-shape string template.
 */
export function buildCustomCredentialAad(input: { workspaceId: UUID; id: UUID }): string {
  return `custom-credential-set:${AAD_VERSION}:${input.workspaceId}:${input.id}`;
}
