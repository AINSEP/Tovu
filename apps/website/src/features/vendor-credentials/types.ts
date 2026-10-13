/** @file Host types for vendor credential sets — Tovu's extension of Jini's `VendorCredentialSetRecord`/
 * `VendorCredentialSetRepoPort` (Jini packages/platform/src/secrets/credential-sets/types.ts). Rows live in
 * the secrets vault (kind `vendor`); migration 0012 folded the legacy `vendor_credential_sets` and
 * `publish_credential_sets` rows into it, so no recurring backfill remains.
 *
 * Domain types only — no I/O, no sealer/keyring dependency. `../deployments/publish-credentials/store.ts`
 * is the one place a connection is validated, serialized, and sealed; `../deployments/publish-credentials/
 * repo.memory.ts` and `platform/db/repos/vendor-credential-repo.ts` are the two adapters (ADR-006
 * rule-of-two), both over `vault-adapter.ts`.
 *
 * Open: a deploy plugin's host declares its own vendor (`DeployTargetCredentialSpec.vendorId`).
 * `tokenTail` (last 4 characters of the primary secret, plaintext, always populated) is safe to show:
 * 4 characters of a long token are not meaningful secret material on their own. `accountLabel` is the
 * verified account's public login, held in the clear and `null` until a verify populates it.
 */
// Credential-contract rationale: Jini packages/platform/src/secrets/credential-sets/types.ts.
// Migration 0045 backfilled destination-based credentials into vendor groups; store.ts remains the
// validation/sealing boundary, with memory and SQLite repositories under ADR-006/ADR-007.
import type { VaultRepoPort, VendorCredentialSetRecord as JiniVendorRecord, VendorCredentialSetRepoPort as JiniVendorRepo } from "@jini-ai/platform/secrets/credential-sets";
import type { CredentialTokenHint } from "../../contracts/core/credential-token.js";
export type { VendorCredentialSetSummary } from "@jini-ai/platform/secrets/credential-sets";
export interface VendorCredentialSetRecord extends JiniVendorRecord { readonly tokenHint?: CredentialTokenHint | null }
/** Workspace-scoped persistence for {@link VendorCredentialSetRecord} (ADR-007 §1).
 *
 * `insert`/`update`/`delete` own the `isDefault` invariant: if the written `record.isDefault` is `true`,
 * `insert`/`update` atomically clear `isDefault` on every OTHER row sharing `(workspaceId, vendorId)` in
 * the SAME transaction as the write, and `delete` promotes the group's most-recently-updated remaining
 * row if the deleted row WAS the default. The store's write path decides the VALUE of `isDefault`
 * (e.g. "first row for a vendor auto-defaults"); this port only guarantees the group-wide invariant
 * once that value is decided. A `null` default is still treated as "no default" defensively (e.g. a
 * hand-edited row). `delete` is a no-op for a missing row (the route's 204, idempotent). Collections
 * are small (bounded by how many connections a human saves), so no pagination/cap.
 *
 * `updateAccountLabel` is a TARGETED single-field write, deliberately not `update()`'s full-row
 * replace: healing an account label after a verify must never disturb `sealed`, `isDefault`,
 * `tokenTail`, or `updatedAt` (a verify is a read of the provider, not a change to the credential).
 * No-op for a missing row: the human-gated verify route has no reason to treat a row that vanished
 * mid-request as anything but "nothing to heal". */
export interface VendorCredentialSetRepoPort extends JiniVendorRepo { readonly vault?: VaultRepoPort }
