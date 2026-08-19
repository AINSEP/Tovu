import type { UUID } from "@jini-ai/cms/core";

import type { VendorId } from "./types.js";

/**
 * @file The ONE place `vendor_credential_sets`' AES-GCM additional authenticated data (AAD) string
 * is formatted — mirrors `features/deployments/publish-credentials/aad.ts` and
 * `features/source-control/aad.ts` exactly, both of whose file headers this one repeats verbatim:
 * every `seal()`/`open()` call for this table MUST go through this function so sealing and opening
 * can never drift onto two different formats (which would make every row in the table permanently
 * unopenable, since AAD is authenticated but never stored — see
 * `integrations/secret-sealer.aesgcm.ts`'s file header).
 *
 * Format: `vendor-credential-set:v1:${workspaceId}:${vendorId}:${id}` — a FRESH `v1`, not a `v2` of
 * either predecessor table's own format. This table is a new table with its own AAD lineage, not a
 * versioned continuation of `publish-credential-set:v1:...`/`source-control-credential-set:v1:...`
 * (those formats stay exactly as they are, still governing whatever rows remain in the two
 * predecessor tables until they are cut over and dropped — see `../../db/schema.ts`'s
 * `vendorCredentialSets` doc). Binds all three scoping dimensions the predecessor tables' own AAD
 * already bound, with `vendorId` standing in for `providerId`: a ciphertext sealed under one
 * credential set's AAD fails auth-tag verification if presented as any other credential set's
 * ciphertext, even within the same workspace/vendor.
 */
const AAD_VERSION = "v1";

/**
 * Builds the AAD string for one `vendor_credential_sets` row. Deterministic — the same
 * `(workspaceId, vendorId, id)` always produces the same string, which is required: opening a
 * sealed value must re-derive the byte-identical value sealing used, with no separate storage of
 * the AAD itself.
 *
 * @complexity O(1) — a fixed-shape string template.
 */
export function buildVendorCredentialAad(input: { workspaceId: UUID; vendorId: VendorId; id: UUID }): string {
  return `vendor-credential-set:${AAD_VERSION}:${input.workspaceId}:${input.vendorId}:${input.id}`;
}
