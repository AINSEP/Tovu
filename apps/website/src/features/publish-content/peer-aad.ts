import type { UUID } from "@jini-ai/cms/core";

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 10.
 *
 * The ONE place `publish_content_peers`' AES-GCM additional authenticated data (AAD) string is
 * formatted — every `seal()`/`open()` call for this table MUST go through this function, exactly as
 * `features/deployments/publish-credentials/aad.ts` does for `publish_credential_sets`. AAD is
 * authenticated but never stored, so if sealing and opening ever drift onto two different formats
 * every row in the table becomes permanently unopenable.
 *
 * Format: `publish-content-peer:v1:${workspaceId}:${id}` — binds both scoping dimensions this table
 * has (there is no `providerId` analogue here: a peer is identified by URL + credential, never by a
 * platform identifier, per plan §0b's vendor-neutrality constraint). A ciphertext sealed under one
 * peer's AAD fails auth-tag verification if presented as any other peer's ciphertext, even within
 * the same workspace.
 *
 * Unlike the `publish_credential_sets` precedent, the version is ALSO persisted, in the table's own
 * `aad_version` integer column — {@link PUBLISH_CONTENT_PEER_AAD_VERSION} is what a write stamps
 * there. That makes a future `v2` a readable, row-by-row migration ("re-seal every row whose
 * `aad_version` is 1") rather than a flag day, which is why the column exists.
 */

/** The AAD format version every row written by this feature is stamped with (`aad_version`). */
export const PUBLISH_CONTENT_PEER_AAD_VERSION = 1;

/**
 * Builds the AAD string for one `publish_content_peers` row. Deterministic — the same
 * `(workspaceId, id)` always produces the same string, which is required: `open()` must re-derive
 * the byte-identical value `seal()` used, with no separate storage of the AAD itself.
 *
 * @param input.aadVersion - The version stamped on the row being opened; defaults to the current
 * {@link PUBLISH_CONTENT_PEER_AAD_VERSION} for a fresh seal. Passing the row's OWN stored value is
 * what lets a future `v2` writer coexist with `v1` rows that have not been re-sealed yet.
 * @complexity O(1) — a fixed-shape string template.
 */
export function buildPublishContentPeerAad(input: { workspaceId: UUID; id: UUID; aadVersion?: number }): string {
  const version = input.aadVersion ?? PUBLISH_CONTENT_PEER_AAD_VERSION;
  return `publish-content-peer:v${version}:${input.workspaceId}:${input.id}`;
}
