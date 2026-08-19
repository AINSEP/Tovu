/**
 * @file Domain types for `vendor_credential_sets` (`../../db/schema.ts`) — see that table's own doc
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
 */

import type { ISODateTime, UUID } from "@jini-ai/cms/core";

import type { SealedSecret } from "../../webhooks/index.js";

/**
 * A company/protocol identity a saved credential authenticates to — as opposed to a PUBLISH
 * DESTINATION (`"github-pages"`), which is what a token is *used for*, not *who it is*. See
 * `../../db/schema.ts`'s `vendorCredentialSets` doc for the full reasoning.
 *
 * **`"s3-compatible"` is a KNOWN, DELIBERATE exception to "every member identifies one account"** —
 * flagged 2026-08-16 during Phase 1 review, kept rather than removed on purpose. Every other member
 * of this union names a single company you authenticate to; `s3-compatible` names a PROTOCOL that
 * multiple unrelated companies speak (AWS S3 itself, Backblaze B2, MinIO, Wasabi, DigitalOcean
 * Spaces, Cloudflare R2, ...). Two credentials for two entirely different companies can therefore
 * land in the SAME vendor group under this id, with no second signal to tell them apart —
 * `accountLabel` is always `null` for `s3-compatible` (no reviewed identity extractor exists for it,
 * `static-publish/verify.ts`'s own reasoning), so the user-typed `label` on
 * `vendor_credential_sets` is the ONLY thing distinguishing them. This was kept rather than split
 * further because there is no reliable way to derive the real company from an S3-compatible
 * endpoint URL — pattern-matching hostnames (`*.r2.cloudflarestorage.com`, `*.backblazeb2.com`, ...)
 * would be fragile, easily wrong, and itself a second, unreviewed identity-inference surface.
 *
 * A related ambiguity this creates: **Cloudflare R2 is itself S3-compatible.** An R2 credential
 * could legitimately be saved as EITHER `cloudflare` (Cloudflare Pages' own token, which is NOT
 * S3-compatible — it is Cloudflare's own REST API) OR `s3-compatible` (an R2 bucket accessed via its
 * S3-compatible endpoint) depending purely on which save path the user went through — two rows, the
 * same real underlying account, two unrelated vendor groups. Nothing in this codebase reconciles
 * that; a human choosing where to save an R2 credential must pick based on what they are actually
 * using it for (Cloudflare Pages deploys vs. an S3-style bucket), not on "which one is more correct."
 *
 * Any UI that groups credentials by `VendorId` (e.g. "these are your GitHub tokens") MUST NOT apply
 * the same "these all belong to one account" framing to the `s3-compatible` group — see whichever
 * slice builds that grouping UI for the concrete copy rule.
 */
export type VendorId = "github" | "gitlab" | "bitbucket" | "vercel" | "netlify" | "cloudflare" | "s3-compatible";

export const VENDOR_IDS: readonly VendorId[] = ["github", "gitlab", "bitbucket", "vercel", "netlify", "cloudflare", "s3-compatible"];

/**
 * `publish_credential_sets.provider_id` -> `VendorId`. A `Record` (not a `Map`/`Set`-based lookup)
 * so this mapping is exhaustively checked against `PublishProviderId` at compile time — a new
 * publish provider added to that union without a corresponding entry here is a `tsc` error, not a
 * runtime surprise the backfill script would otherwise discover only by throwing on an unmapped row.
 */
export const PUBLISH_PROVIDER_TO_VENDOR: Record<"github-pages" | "vercel" | "netlify" | "cloudflare-pages" | "s3-compatible", VendorId> = {
  "github-pages": "github",
  vercel: "vercel",
  netlify: "netlify",
  "cloudflare-pages": "cloudflare",
  "s3-compatible": "s3-compatible",
};

/** `source_control_credential_sets.provider_id` -> `VendorId`. Same exhaustiveness reasoning as
 *  {@link PUBLISH_PROVIDER_TO_VENDOR}. */
export const SOURCE_CONTROL_PROVIDER_TO_VENDOR: Record<"github" | "gitlab" | "bitbucket", VendorId> = {
  github: "github",
  gitlab: "gitlab",
  bitbucket: "bitbucket",
};

// ---------------------------------------------------------------------------------------------
// Phase 2 — the real read/write contract. Everything below mirrors
// `../deployments/publish-credentials/types.ts` almost verbatim; see that file's header for the
// full "why a closed union, why one ciphertext per row" reasoning this section does not repeat.
// ---------------------------------------------------------------------------------------------

export interface GitHubVendorConnectionInput {
  readonly vendorId: "github";
  readonly token: string;
}

export interface GitLabVendorConnectionInput {
  readonly vendorId: "gitlab";
  readonly token: string;
}

/** Bitbucket authenticates the (token, username) pair, not the token alone — carried over verbatim
 *  from `../source-control/types.ts`'s `BitbucketSourceControlConnectionInput`. */
export interface BitbucketVendorConnectionInput {
  readonly vendorId: "bitbucket";
  readonly token: string;
  readonly username: string;
}

export interface VercelVendorConnectionInput {
  readonly vendorId: "vercel";
  readonly token: string;
  readonly teamId?: string;
}

/** `siteId` is currently inert (no Jini adapter reads it back yet) — carried over verbatim from
 *  `../deployments/publish-credentials/types.ts`'s own `NetlifyConnectionInput` doc. */
export interface NetlifyVendorConnectionInput {
  readonly vendorId: "netlify";
  readonly token: string;
  readonly siteId?: string;
}

/** `accountId` is HARD required — Cloudflare Pages has no account-scope-free API surface, same
 *  reasoning `CloudflarePagesConnectionInput` documents. `projectName` is currently inert. */
export interface CloudflareVendorConnectionInput {
  readonly vendorId: "cloudflare";
  readonly token: string;
  readonly accountId: string;
  readonly projectName?: string;
}

/** No `token` field, deliberately — this protocol authenticates with an access-key/secret-key PAIR.
 *  Carried over verbatim from `../deployments/publish-credentials/types.ts`'s own
 *  `S3CompatibleConnectionInput` — see that file's header for the full per-field reasoning (spec
 *  `custom-publish-provider-contract.md` §4). `token_tail`'s "primary secret" for this vendor is
 *  `secretAccessKey`, never `accessKeyId` — see `../../db/schema.ts`'s `vendorCredentialSets.
 *  tokenTail` doc. */
export interface S3CompatibleVendorConnectionInput {
  readonly vendorId: "s3-compatible";
  readonly endpoint?: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  /** SECRET — never echoed back by any route/tool, never logged. */
  readonly secretAccessKey: string;
  readonly publicUrl: string;
}

/** Closed discriminated union on `vendorId` — see this file's header and
 *  `../deployments/publish-credentials/types.ts`'s own header for why. This whole object is
 *  serialized to JSON and sealed as ONE ciphertext blob per credential set. */
export type VendorConnectionInput =
  | GitHubVendorConnectionInput
  | GitLabVendorConnectionInput
  | BitbucketVendorConnectionInput
  | VercelVendorConnectionInput
  | NetlifyVendorConnectionInput
  | CloudflareVendorConnectionInput
  | S3CompatibleVendorConnectionInput;

/** A `vendor_credential_sets` row, decrypted-shape (`sealed` is the DB's opaque `SealedSecret` — the
 *  actual `VendorConnectionInput` only exists in memory after `resolveForVendor`/
 *  `resolveDefaultForVendor` open it; see `store.ts`). */
export interface VendorCredentialSetRecord {
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly vendorId: VendorId;
  readonly label: string;
  readonly sealed: SealedSecret;
  /** Last 4 characters of the connection's primary secret, plaintext — see `../../db/schema.ts`'s
   *  `vendorCredentialSets.tokenTail` doc. Always populated (`NOT NULL`), unlike `accountLabel`. */
  readonly tokenTail: string;
  /** At most one `TRUE` per `(workspaceId, vendorId)`, maintained by `store.ts`'s write path — see
   *  `../../db/schema.ts`'s `vendorCredentialSets.isDefault` doc. */
  readonly isDefault: boolean;
  /** The verified account's public login/username, held in the clear — `null` until populated. See
   *  `../../db/schema.ts`'s `vendorCredentialSets.accountLabel` doc. */
  readonly accountLabel: string | null;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}

/** The read model every route/tool in this feature returns — see `store.ts`'s `toSummary`. NEVER
 *  contains `sealed`, a token, or any `VendorConnectionInput` field — enforced by construction: this
 *  type has no field capable of carrying one. `tokenTail` IS included, deliberately — see
 *  `../../db/schema.ts`'s `vendorCredentialSets.tokenTail` doc for why 4 characters of a long token
 *  is not meaningful secret material on its own. */
export interface VendorCredentialSetSummary {
  readonly id: UUID;
  readonly vendorId: VendorId;
  readonly label: string;
  readonly configured: true;
  readonly isDefault: boolean;
  readonly tokenTail: string;
  readonly accountLabel: string | null;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}

/** Workspace-scoped persistence for {@link VendorCredentialSetRecord} (ADR-007 §1). Mirrors
 *  `PublishCredentialSetRepoPort`'s own contract exactly — see that interface's own header for the
 *  full `isDefault`-invariant reasoning (`insert`/`update` atomically clear `isDefault` on every
 *  OTHER row sharing `(workspaceId, vendorId)` in the same transaction; `delete` promotes the
 *  group's most-recently-updated remaining row) — `vendorId` stands in for `providerId` throughout,
 *  nothing else differs. */
export interface VendorCredentialSetRepoPort {
  insert(record: VendorCredentialSetRecord): Promise<void>;
  /** Full-row replace by `(workspaceId, id)` — used for both a label rename and a connection
   *  rotation. Same UNIQUE-violation possibility as `insert` (renaming into another row's label). */
  update(record: VendorCredentialSetRecord): Promise<void>;
  findById(input: { workspaceId: UUID; id: UUID }): Promise<VendorCredentialSetRecord | null>;
  /** The current default row for one `(workspaceId, vendorId)` pair — `null` if that vendor has no
   *  rows at all for this workspace. */
  findDefaultByVendor(input: { workspaceId: UUID; vendorId: VendorId }): Promise<VendorCredentialSetRecord | null>;
  /** Every row for one `(workspaceId, vendorId)` pair — used by `store.ts`'s write path to decide
   *  "is this the group's first row" (create-time auto-default) and, ahead of `delete`, to reason
   *  about the promotion candidate. */
  listByVendor(input: { workspaceId: UUID; vendorId: VendorId }): Promise<VendorCredentialSetRecord[]>;
  /** Every credential set a workspace has saved, across all vendors — inherently small (bounded by
   *  how many connections a human bothers to save through this exact form), so no pagination/cap is
   *  added here. */
  listByWorkspace(input: { workspaceId: UUID }): Promise<VendorCredentialSetRecord[]>;
  /** No-op (not an error) if no row exists for `(workspaceId, id)` — matches this feature's own
   *  `DELETE .../credentials/:id` route contract (204, idempotent). */
  delete(input: { workspaceId: UUID; id: UUID }): Promise<void>;
  /** A TARGETED single-column write — never touches `sealed`, `isDefault`, `tokenTail`, or
   *  `updatedAt`. No-op (not an error) if no row exists for `(workspaceId, id)`. Mirrors
   *  `PublishCredentialSetRepoPort.updateAccountLabel`'s own contract exactly. */
  updateAccountLabel(input: { workspaceId: UUID; id: UUID; accountLabel: string }): Promise<void>;
}
