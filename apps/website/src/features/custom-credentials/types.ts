import type { CredentialTokenHint } from '../../contracts/core/credential-token.js';
import type { ISODateTime, UUID } from "@jini-ai/core/primitives";

import type { VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { SealedSecret } from "@jini-ai/platform/secrets";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";

/**
 * @file Custom API credential contracts over the unified vendor vault kind. Display labels name
 * credentials; explicit worksFor IDs declare compatibility independently of allowed API origins.
 * Jini owns sealing, persistence, defaults and copying; these DTOs preserve the custom permission
 * boundary and origin restrictions used by authenticated requests.
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
export interface CustomProviderConnectionInput {
  readonly token: string;
  readonly username?: string;
}

/** Historical sealed-row DTO retained for feature callers; private context carries vault CAS. */
export interface CustomCredentialSetRecord {
  readonly worksFor?: readonly string[];
  /** Non-enumerable adapter context; not part of any public summary. */
  readonly vaultRecord?: Parameters<VaultRepoPort["put"]>[0]["record"];
  readonly vaultExpectedRevision?: number | null;
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly label: string;
  readonly category: CustomCredentialCategoryId;
  readonly baseUrl: string;
  /** Extra allowed origins beyond `baseUrl` (e.g. a provider whose API spans two
   *  hosts for one account) — see `db/schema.sqlite.ts`'s `customCredentialSets.additionalHostsJson` doc.
   *  Each entry is a normalized ORIGIN (`https://host[:port]`), never a full URL with a path.
   *  Empty, never `null` — `store.ts`'s read path normalizes the DB's nullable column to `[]`. */
  readonly additionalHosts: readonly string[];
  /** The credential's account login, plaintext (`db/schema.sqlite.ts`'s `customCredentialSets.username`).
   *  `undefined` means the credential has no username — the DB's `NULL` normalizes to `undefined`
   *  here rather than `""`, so "absent" stays one value instead of two. */
  readonly username?: string;
  readonly sealed: SealedSecret;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}

/** The read model every route in this feature returns — see `store.ts`'s `toSummary`. NEVER
 *  contains `sealed` or a token — enforced by construction: this type has no field capable of
 *  carrying one. It DOES carry `username` as of 2026-09-01: that field stopped being part of the
 *  secret when it moved onto its own plaintext column, and the whole point of moving it was that
 *  the read model can return it without the sealer being opened. */
export interface CustomCredentialSummary {
  readonly credentialType: "custom";
  readonly worksFor: string[];
  readonly tokenHint?: CredentialTokenHint | null;
  readonly id: UUID;
  readonly label: string;
  readonly category: CustomCredentialCategoryId;
  readonly baseUrl: string;
  readonly additionalHosts: readonly string[];
  /** Omitted entirely (never `""`) when the credential has no saved username. */
  readonly username?: string;
  readonly configured: true;
  /** Where the row lives — present only where a project store is attached (local web + desktop):
   *  `"project"` is available for explicit site attachment, `"site"` is this site's own (an override). */
  readonly scope?: CustomCredentialScope;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}

/** This site's own vault, or the project store every site of the project shares (`project.db`). */
export type CustomCredentialScope = "site" | "project";

/**
 * The project store's half of the custom-credential store (owner 2026-10-25: keys save to the project
 * by default). The same repo shape over the project's own `secrets_vault`, opened with the project's
 * keyring and sealer, under the project's workspace id. Attached to a site's repo by the composition
 * root only where a project store opened; Fly/production has none (the project is the site there).
 */
export interface CustomCredentialProjectScope {
  readonly workspaceId: UUID;
  readonly repo: CustomCredentialSetRepoPort;
  /** Admin metadata inventory and explicit deletion, over the raw project vault with its usage guard.
   * Runtime credential resolution must continue to use the attachment-filtered `repo`. */
  readonly deletionRepo?: CustomCredentialSetRepoPort;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
}

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
 *  reject it — `store.ts` uses the storage kernel's `isUniqueViolation`. */
export interface CustomCredentialSetRepoPort {
  readonly vault?: VaultRepoPort;
  /** The project store this site's rows fall back to (`store.ts`'s scope rule: site first, then
   *  project; new rows go to the project unless saved "only for this site"). Absent = site only. */
  readonly project?: CustomCredentialProjectScope;
  insert(record: CustomCredentialSetRecord): Promise<void>;
  /** Full-row replace by `(workspaceId, id)` — used for both a rename/re-categorize and a
   *  connection rotation. Same UNIQUE-violation possibility as `insert` (renaming into another
   *  row's label). */
  update(record: CustomCredentialSetRecord): Promise<void>;
  findById(input: { workspaceId: UUID; id: UUID }): Promise<CustomCredentialSetRecord | null>;
  /** Every credential set a workspace has saved — inherently small (bounded by how many an
   *  operator bothers to add through this exact form), so no pagination/cap is added here, same
   *  reasoning `VendorCredentialSetRepoPort.listByWorkspace` gives. */
  listByWorkspace(input: { workspaceId: UUID }): Promise<CustomCredentialSetRecord[]>;
  /** No-op (not an error) if no row exists for `(workspaceId, id)` — matches this feature's own
   *  `DELETE .../credentials/:id` route contract (204, idempotent). */
  delete(input: { workspaceId: UUID; id: UUID }): Promise<void>;
}
