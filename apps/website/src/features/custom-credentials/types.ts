import type { ISODateTime, UUID } from "@jini-ai/cms/core";

import type { SealedSecret } from "../webhooks/index.js";

/**
 * @file Domain types for `custom_credential_sets` — the admin Access Tokens page's "Add custom
 * provider" capability (2026-08-17). Structurally the simplest of this codebase's three credential
 * tables: no `providerId` union (an operator-typed `label` IS the provider identity — see
 * `src/platform/db/schema.ts`'s `customCredentialSets` doc), no `isDefault` group invariant, no
 * `accountLabel` probe. Every row is already its own independent, standalone credential.
 *
 * Architectural role: domain types only — no I/O, no sealer/keyring dependency. `store.ts` is the
 * one place a {@link CustomProviderConnectionInput} is validated, serialized, and sealed;
 * `repo.memory.ts`/`../../db/sqlite/custom-credential-repo.sqlite.ts` are the two
 * `CustomCredentialSetRepoPort` adapters (ADR-006 rule-of-two).
 */

/** The Access Tokens page's own category-filter ids, minus `"all"` — mirrors
 *  `apps/admin/src/features/security/rules.ts`'s `AccessTokenRowCategoryId` exactly (that file is
 *  the source of truth for the UI's own copy; this is the server-side validation twin, since a
 *  category must be readable/filterable without ever decrypting a row — see this file's own header
 *  and `db/schema.ts`'s `customCredentialSets.category` doc). Kept as a plain literal union rather
 *  than importing from `apps/admin` (server code never depends on the admin app). */
export type CustomCredentialCategoryId = "source-control" | "hosting" | "media" | "ai" | "ops" | "general";

export const CUSTOM_CREDENTIAL_CATEGORIES: readonly CustomCredentialCategoryId[] = ["source-control", "hosting", "media", "ai", "ops", "general"];

/** The secret half of a custom credential — sealed as one ciphertext blob (this table's own
 *  connection object), same one-ciphertext-per-row discipline every sibling credential table here
 *  documents. `baseUrl`/`category`/`label` are NOT part of this object — they are plaintext columns
 *  (see `db/schema.ts`'s own doc for why), so they never round-trip through the sealer.
 *
 *  `username` is the one field here that is NOT a secret: it is an account identifier, and since
 *  2026-09-01 its authoritative home is the plaintext `custom_credential_sets.username` column. It
 *  stays on this input type because that is the shape a caller (and the admin form) supplies a
 *  connection in, and it is still sealed alongside the token until the migration's Pass 2 stops
 *  doing so — see `db/schema.ts`'s `customCredentialSets.username` doc for the two-pass plan. */
export interface CustomProviderConnectionInput {
  readonly token: string;
  readonly username?: string;
}

/** A `custom_credential_sets` row, decrypted-shape (`sealed` is the DB's opaque `SealedSecret` —
 *  the actual `CustomProviderConnectionInput` only exists in memory after a caller decrypts it;
 *  no caller does today — see `store.ts`'s own header). */
export interface CustomCredentialSetRecord {
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly label: string;
  readonly category: CustomCredentialCategoryId;
  readonly baseUrl: string;
  /** Extra allowed origins beyond `baseUrl` (e.g. fly.io needs both `api.fly.io` and
   *  `api.machines.dev`) — see `db/schema.ts`'s `customCredentialSets.additionalHostsJson` doc.
   *  Each entry is a normalized ORIGIN (`https://host[:port]`), never a full URL with a path.
   *  Empty, never `null` — `store.ts`'s read path normalizes the DB's nullable column to `[]`. */
  readonly additionalHosts: readonly string[];
  /** The credential's account login, plaintext (`db/schema.ts`'s `customCredentialSets.username`).
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
  readonly id: UUID;
  readonly label: string;
  readonly category: CustomCredentialCategoryId;
  readonly baseUrl: string;
  readonly additionalHosts: readonly string[];
  /** Omitted entirely (never `""`) when the credential has no saved username. */
  readonly username?: string;
  readonly configured: true;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
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
 *  reject it — see `store.ts`'s `isUniqueLabelViolation`. */
export interface CustomCredentialSetRepoPort {
  insert(record: CustomCredentialSetRecord): Promise<void>;
  /** Full-row replace by `(workspaceId, id)` — used for both a rename/re-categorize and a
   *  connection rotation. Same UNIQUE-violation possibility as `insert` (renaming into another
   *  row's label). */
  update(record: CustomCredentialSetRecord): Promise<void>;
  findById(input: { workspaceId: UUID; id: UUID }): Promise<CustomCredentialSetRecord | null>;
  /** Every credential set a workspace has saved — inherently small (bounded by how many an
   *  operator bothers to add through this exact form), so no pagination/cap is added here, same
   *  reasoning `PublishCredentialSetRepoPort.listByWorkspace` gives. */
  listByWorkspace(input: { workspaceId: UUID }): Promise<CustomCredentialSetRecord[]>;
  /** No-op (not an error) if no row exists for `(workspaceId, id)` — matches this feature's own
   *  `DELETE .../credentials/:id` route contract (204, idempotent). */
  delete(input: { workspaceId: UUID; id: UUID }): Promise<void>;
}
