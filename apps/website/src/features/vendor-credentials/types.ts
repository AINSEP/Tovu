/** Host type boundary retained for the excluded vendor credential repository adapters.
 *
 * Contract rationale for the Jini implementation and this host boundary:
 *
 * @file Domain types for `vendor_credential_sets` (`../../db/schema.sqlite.ts`) — see that table's own doc
 * comment for the full "destination vs. vendor" redesign this file is the center of.
 *
 * Two halves, added in two passes:
 * - `VendorId` plus the two OLD-to-NEW mapping tables (Phase 1, migration `0045`) —
 *   `backfill-vendor-credentials.ts` needs these to translate an existing `publish_credential_sets`/
 *   `source_control_credential_sets` row into a `vendor_credential_sets` one.
 * - `VendorConnectionInput`, `VendorCredentialSetRecord`, `VendorCredentialSetSummary`, and
 *   `VendorCredentialSetRepoPort` (Phase 2) — the real read/write contract on top of the table,
 *   mirroring `../deployments/publish-credentials/types.ts`'s own shape almost verbatim. Read that
 *   file's own header first; this one only documents where it DIFFERS.
 *
 * Architectural role (Phase 2): domain types only — no I/O, no sealer/keyring dependency. `store.ts`
 * is the one place a `VendorConnectionInput` is validated, serialized, and sealed; `repo.memory.ts`/
 * `../../db/sqlite/vendor-credential-repo.sqlite.ts` are the two `VendorCredentialSetRepoPort`
 * adapters (ADR-006 rule-of-two).
 *
 * A `vendor_credential_sets` row, decrypted-shape (`sealed` is the DB's opaque `SealedSecret` — the
 *  actual `VendorConnectionInput` only exists in memory after `resolveForVendor`/
 *  `resolveDefaultForVendor` open it; see `store.ts`).
 *
 * Open: a deploy plugin's host declares its own vendor (`DeployTargetCredentialSpec.vendorId`).
 *  {@link VendorId} names only the vendors `store.ts`'s own validators know.
 *
 * Last 4 characters of the connection's primary secret, plaintext — see `../../db/schema.sqlite.ts`'s
 *  `vendorCredentialSets.tokenTail` doc. Always populated (`NOT NULL`), unlike `accountLabel`.
 *
 * At most one `TRUE` per `(workspaceId, vendorId)`, maintained by `store.ts`'s write path — see
 *  `../../db/schema.sqlite.ts`'s `vendorCredentialSets.isDefault` doc.
 *
 * The verified account's public login/username, held in the clear — `null` until populated. See
 *  `../../db/schema.sqlite.ts`'s `vendorCredentialSets.accountLabel` doc.
 *
 * The read model every route/tool in this feature returns — see `store.ts`'s `toSummary`. NEVER
 *  contains `sealed`, a token, or any `VendorConnectionInput` field — enforced by construction: this
 *  type has no field capable of carrying one. `tokenTail` IS included, deliberately — see
 *  `../../db/schema.sqlite.ts`'s `vendorCredentialSets.tokenTail` doc for why 4 characters of a long token
 *  is not meaningful secret material on its own.
 *
 * Workspace-scoped persistence for {@link VendorCredentialSetRecord} (ADR-007 §1). Mirrors
 *  `PublishCredentialSetRepoPort`'s own contract exactly — see that interface's own header for the
 *  full `isDefault`-invariant reasoning (`insert`/`update` atomically clear `isDefault` on every
 *  OTHER row sharing `(workspaceId, vendorId)` in the same transaction; `delete` promotes the
 *  group's most-recently-updated remaining row) — `vendorId` stands in for `providerId` throughout,
 *  nothing else differs.
 *
 * Full-row replace by `(workspaceId, id)` — used for both a label rename and a connection
 *  rotation. Same UNIQUE-violation possibility as `insert` (renaming into another row's label).
 *
 * The current default row for one `(workspaceId, vendorId)` pair — `null` if that vendor has no
 *  rows at all for this workspace.
 *
 * Every row for one `(workspaceId, vendorId)` pair — used by `store.ts`'s write path to decide
 *  "is this the group's first row" (create-time auto-default) and, ahead of `delete`, to reason
 *  about the promotion candidate.
 *
 * Every credential set a workspace has saved, across all vendors — inherently small (bounded by
 *  how many connections a human bothers to save through this exact form), so no pagination/cap is
 *  added here.
 *
 * No-op (not an error) if no row exists for `(workspaceId, id)` — matches this feature's own
 *  `DELETE .../credentials/:id` route contract (204, idempotent).
 *
 * A TARGETED single-column write — never touches `sealed`, `isDefault`, `tokenTail`, or
 *  `updatedAt`. No-op (not an error) if no row exists for `(workspaceId, id)`. Mirrors
 *  `PublishCredentialSetRepoPort.updateAccountLabel`'s own contract exactly.
 */
// Credential-contract rationale: Jini packages/platform/src/secrets/credential-sets/types.ts.
// Migration 0045 backfilled destination-based credentials into vendor groups; store.ts remains the
// validation/sealing boundary, with memory and SQLite repositories under ADR-006/ADR-007.
export type { VendorCredentialSetRecord, VendorCredentialSetSummary, VendorCredentialSetRepoPort } from "@jini-ai/platform/secrets/credential-sets";
