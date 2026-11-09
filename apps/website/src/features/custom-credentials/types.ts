import type { CredentialSetConnectionInput, CredentialSetProjectScope, CredentialSetRecord, CredentialSetRepoPort,
  CredentialSetScope, CredentialSetSummary } from "@jini-ai/core/contracts/credentials";

/**
 * @file Custom API credential contracts over the unified vendor vault kind. Display labels name
 * credentials; explicit worksFor IDs declare compatibility independently of allowed API origins.
 * Jini owns sealing, persistence, defaults and copying; these DTOs preserve the custom permission
 * boundary and origin restrictions used by authenticated requests. The shapes are the neutral
 * credential-set contracts in `@jini-ai/core/contracts/credentials`, specialized to Tovu's category
 * ids; the historical names stay exported here so every existing import keeps working.
 */

import type { CustomCredentialCategoryId } from "#src/contracts/core/custom-credential-categories";
export { CUSTOM_CREDENTIAL_CATEGORIES, type CustomCredentialCategoryId } from "#src/contracts/core/custom-credential-categories";

/** The secret half of a custom credential — sealed as one ciphertext blob (this table's own
 *  connection object), same one-ciphertext-per-row discipline every sibling credential table here
 *  documents. `baseUrl`/`category`/`label` are NOT part of this object — they are plaintext columns
 *  (see `db/schema.sqlite.ts`'s own doc for why), so they never round-trip through the sealer.
 *
 *  `username` is the one field here that is NOT a secret: it is an account identifier, and since
 *  2026-09-01 its authoritative home is the plaintext `custom_credential_sets.username` column. It
 *  stays on this input type because that is the shape a caller (and the admin form) supplies a
 *  connection in. Vault payloads contain only the token; boot normalization removes legacy copies. */
export type CustomProviderConnectionInput = CredentialSetConnectionInput;

/** Historical sealed-row DTO retained for feature callers; private context carries vault CAS.
 *  - `vaultRecord`: non-enumerable adapter context; not part of any public summary.
 *  - `additionalHosts`: extra allowed origins beyond `baseUrl` (e.g. a provider whose API spans two
 *    hosts for one account) — see `db/schema.sqlite.ts`'s `customCredentialSets.additionalHostsJson` doc.
 *    Each entry is a normalized ORIGIN (`https://host[:port]`), never a full URL with a path.
 *    Empty, never `null` — `store.ts`'s read path normalizes the DB's nullable column to `[]`.
 *  - `username`: the credential's account login, plaintext (`db/schema.sqlite.ts`'s `customCredentialSets.username`).
 *    `undefined` means the credential has no username — the DB's `NULL` normalizes to `undefined`
 *    here rather than `""`, so "absent" stays one value instead of two. */
export type CustomCredentialSetRecord = CredentialSetRecord<CustomCredentialCategoryId>;

/** The read model every route in this feature returns — see `store.ts`'s `toSummary`. NEVER
 *  contains `sealed` or a token — enforced by construction: this type has no field capable of
 *  carrying one. It DOES carry `username` as of 2026-09-01: that field stopped being part of the
 *  secret when it moved onto its own plaintext column, and the whole point of moving it was that
 *  the read model can return it without the sealer being opened. `scope`: where the row lives — present
 *  only where a project store is attached (local web + desktop): `"project"` is available for explicit
 *  site attachment, `"site"` is this site's own (an override). `username` is omitted entirely (never
 *  `""`) when the credential has no saved username. */
export type CustomCredentialSummary = CredentialSetSummary<CustomCredentialCategoryId>;

/** This site's own vault, or the project store every site of the project shares (`project.db`). */
export type CustomCredentialScope = CredentialSetScope;

/**
 * The project store's half of the custom-credential store (owner 2026-10-25: keys save to the project
 * by default). The same repo shape over the project's own `secrets_vault`, opened with the project's
 * keyring and sealer, under the project's workspace id. Attached to a site's repo by the composition
 * root only where a project store opened; Fly/production has none (the project is the site there).
 * `replaceRepo`: trusted human replacement retains the site-grant boundary. `inventoryRepo`:
 * owner-session inventory only; cannot resolve, open or mutate a credential.
 */
export type CustomCredentialProjectScope = CredentialSetProjectScope<CustomCredentialCategoryId>;

/** Every origin this credential's token may legitimately be sent to — `baseUrl`'s own origin plus
 *  `additionalHosts`, deduped. This IS the per-credential host allowlist
 *  `features/custom-credentials/credentialed-request.ts` checks a request's resolved URL origin
 *  against; derived from the credential's own saved state, never from tool input.
 *
 * @complexity O(n) in `additionalHosts.length`. */
export function allowedOriginsFor(record: { readonly baseUrl: string; readonly additionalHosts: readonly string[] }): readonly string[] {
  return [...new Set([new URL(record.baseUrl).origin, ...record.additionalHosts])];
}

/** Workspace-scoped persistence for {@link CustomCredentialSetRecord} (ADR-007 §1). `insert`
 *  assumes the caller already checked/accepted the `(workspaceId, label)` UNIQUE constraint may
 *  reject it — `store.ts` uses the storage kernel's `isUniqueViolation`.
 *  - `project`: the project store this site's rows fall back to (`store.ts`'s scope rule: site first, then
 *    project; new rows go to the project unless saved "only for this site"). Absent = site only.
 *  - `update`: full-row replace by `(workspaceId, id)` — used for both a rename/re-categorize and a
 *    connection rotation. Same UNIQUE-violation possibility as `insert` (renaming into another
 *    row's label).
 *  - `listByWorkspace`: every credential set a workspace has saved — inherently small (bounded by how many an
 *    operator bothers to add through this exact form), so no pagination/cap is added here, same
 *    reasoning `VendorCredentialSetRepoPort.listByWorkspace` gives.
 *  - `delete`: no-op (not an error) if no row exists for `(workspaceId, id)` — matches this feature's own
 *    `DELETE .../credentials/:id` route contract (204, idempotent). */
export type CustomCredentialSetRepoPort = CredentialSetRepoPort<CustomCredentialCategoryId>;
