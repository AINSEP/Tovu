import type { UUID } from "@jini-ai/cms/core";

import type { SourceControlProviderId } from "./types.js";

/**
 * @file The ONE place `source_control_credential_sets`' AES-GCM additional authenticated data
 * (AAD) string is formatted — mirrors `features/deployments/publish-credentials/aad.ts` exactly.
 * Every `seal()`/`open()` call for this table MUST go through this function so sealing and opening
 * can never drift onto two different formats (which would make every row in the table permanently
 * unopenable, since AAD is authenticated but never stored — see
 * `integrations/secret-sealer.aesgcm.ts`'s file header).
 *
 * Format: `source-control-credential-set:v1:${workspaceId}:${providerId}:${id}` — versioned (`v1`)
 * so a future format change is an explicit, reviewed migration path rather than a silent
 * redefinition that breaks every existing row without warning. Binds all three scoping dimensions:
 * a ciphertext sealed under one credential set's AAD fails auth-tag verification if presented as
 * any other credential set's ciphertext, even within the same workspace/provider.
 */
const AAD_VERSION = "v1";

/**
 * Builds the AAD string for one `source_control_credential_sets` row. Deterministic — the same
 * `(workspaceId, providerId, id)` always produces the same string, which is required: opening a
 * sealed value must re-derive the byte-identical value sealing used, with no separate storage of
 * the AAD itself.
 *
 * @complexity O(1) — a fixed-shape string template.
 */
export function buildSourceControlCredentialAad(input: { workspaceId: UUID; providerId: SourceControlProviderId; id: UUID }): string {
  return `source-control-credential-set:${AAD_VERSION}:${input.workspaceId}:${input.providerId}:${input.id}`;
}
