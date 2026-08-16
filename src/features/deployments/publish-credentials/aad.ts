import type { UUID } from "@jini-ai/cms/core";

import type { PublishProviderId } from "./types";

/**
 * @file The ONE place `publish_credential_sets`' AES-GCM additional authenticated data (AAD) string
 * is formatted — every `seal()`/`open()` call for this table MUST go through this function so sealing
 * and opening can never drift onto two different formats (which would make every row in the table
 * permanently unopenable, since AAD is authenticated but never stored — see
 * `integrations/secret-sealer.aesgcm.ts`'s file header).
 *
 * Format: `publish-credential-set:v1:${workspaceId}:${providerId}:${id}` — versioned (`v1`) so a
 * future format change is an explicit, reviewed migration path (bump to `v2`, re-seal every row under
 * the new AAD) rather than a silent redefinition that breaks every existing row without warning.
 * Binds all three scoping dimensions Terra's finding named: workspace, provider, and the specific
 * credential-set row — a ciphertext sealed under one credential set's AAD fails auth-tag verification
 * if presented as any other credential set's ciphertext, even within the same workspace/provider.
 */
const AAD_VERSION = "v1";

/**
 * Builds the AAD string for one `publish_credential_sets` row. Deterministic — the same
 * `(workspaceId, providerId, id)` always produces the same string, which is required: `open()` must
 * re-derive the byte-identical value `seal()` used, with no separate storage of the AAD itself.
 *
 * @complexity O(1) — a fixed-shape string template.
 * @overallScore 100
 */
export function buildPublishCredentialAad(input: { workspaceId: UUID; providerId: PublishProviderId; id: UUID }): string {
  return `publish-credential-set:${AAD_VERSION}:${input.workspaceId}:${input.providerId}:${input.id}`;
}
