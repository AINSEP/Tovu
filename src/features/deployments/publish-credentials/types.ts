import type { ISODateTime, UUID } from "@jini-ai/cms/core";

import type { SealedSecret } from "../../webhooks/index.js";

/**
 * @file Domain types for named, workspace-scoped provider connections used to publish a static
 * export to GitHub Pages / Vercel / Netlify / Cloudflare Pages (`publish_credential_sets`,
 * `src/db/schema.ts`). Design: `ADS-memory/reports/external-audit/runs/
 * 2026-08-15-terra-xhigh-publish-credentials-design.md`.
 *
 * Purpose:
 * `PublishProviderId` is this codebase's ONE canonical 4-provider union — `../static-publish/
 * types.ts`'s `StaticPublishTargetId` is a type ALIAS of this union (not a second, independently
 * declared one), so the provider set can never drift between "what a credential can be saved for"
 * and "what a publish can target". This module owns the canonical declaration (not the other way
 * around) because a credential's provider identity is the more general, storage-shaped concept; a
 * one-shot publish operation borrows it, not the reverse.
 *
 * `PublishConnectionInput` is a CLOSED discriminated union on `providerId` — deliberately not an
 * open bag of optional fields, so a caller can never construct a connection with the wrong provider's
 * companion fields (e.g. `accountId` on a `vercel` connection) and have it silently ignored. Every
 * variant's required/optional split matches this dispatch's own verified requirements table: a bare
 * token is never enough for github-pages (needs `owner`/`repo`) or cloudflare-pages (needs
 * `accountId`, HARD required — see `store.ts`'s `validateConnection`), while vercel/netlify's
 * companion fields are genuinely optional.
 *
 * `siteId` (netlify) and `projectName` (cloudflare-pages) are accepted and stored here even though,
 * as of this pass, NEITHER has anywhere to go once decrypted: Jini's own `NetlifyDeployTarget`
 * constructor (`packages/devops/src/deploy/netlify.ts`) takes only `{token}` and always
 * find-or-creates its site from the publish call's `projectName` label, and
 * `CloudflarePagesDeployTarget` (`cloudflare-pages.ts`) derives its own project name the same way
 * from that same call-time label, not from any constructor config field. Storing them anyway keeps
 * this module's contract stable for whichever side (this store, or a future Jini adapter change)
 * ships second — see `../static-publish/adapter.ts`'s header for where this gap is flagged again at
 * the point it would actually matter (wiring a real publish).
 *
 * Architectural role:
 * Domain types only — no I/O, no sealer/keyring dependency. `store.ts` is the one place a
 * `PublishConnectionInput` is validated, serialized, and sealed; `repo.memory.ts`/
 * `../../../db/sqlite/publish-credential-repo.sqlite.ts` are the two `PublishCredentialSetRepoPort`
 * adapters (ADR-006 rule-of-two) that move `PublishCredentialSetRecord` in and out of storage.
 */

export type PublishProviderId = "github-pages" | "vercel" | "netlify" | "cloudflare-pages" | "s3-compatible";

/** No `owner`/`repo` here, deliberately — those are publish-TARGET fields, not credential fields:
 *  they already live on `../static-publish/types.ts`'s `GitHubPagesPublishConfig`, chosen per publish
 *  run (a saved connection can publish to more than one owner/repo over its lifetime, one run at a
 *  time). Duplicating them onto the credential would just be a second, driftable place either could be
 *  set — see `store.ts`'s `validateConnection` for the enforcement side of this contract, and this
 *  feature's admin UI (`AdminPublishConnectionInput` in `apps/admin/src/lib/api.ts`) for the client
 *  side, which never collects them on the credential form either. */
export interface GitHubPagesConnectionInput {
  readonly providerId: "github-pages";
  readonly token: string;
}

export interface VercelConnectionInput {
  readonly providerId: "vercel";
  readonly token: string;
  readonly teamId?: string;
}

/** `siteId` is currently inert — see this file's header. Stored so a future Jini adapter change has
 *  somewhere to read it from without a second migration. */
export interface NetlifyConnectionInput {
  readonly providerId: "netlify";
  readonly token: string;
  readonly siteId?: string;
}

/** `projectName` is currently inert — see this file's header. `accountId` IS wired: it maps directly
 *  to Jini's `CloudflarePagesDeployConfig.accountId` and is HARD required (never publishable without
 *  it — Cloudflare Pages has no account-scope-free API surface). */
export interface CloudflarePagesConnectionInput {
  readonly providerId: "cloudflare-pages";
  readonly token: string;
  readonly accountId: string;
  readonly projectName?: string;
}

/**
 * S3-compatible object storage (AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, Wasabi,
 * MinIO, ...). Design: `ADS-memory/specs/custom-publish-provider-contract.md` §4. No `token` field —
 * unlike the other four variants, this protocol authenticates with an access-key/secret-key PAIR, not
 * a single bearer token, so this variant intentionally does not share `token: string` with its
 * siblings (a shared field name here would invite a caller to read `.token` generically across the
 * union and silently miss the secret half of this pair).
 *
 * All six fields live on the CREDENTIAL, never on `../static-publish/types.ts`'s
 * `S3CompatiblePublishConfig` (which is empty) — an access-key/secret-key pair is provisioned for ONE
 * specific bucket in practice, so `endpoint`/`region`/`bucket`/`publicUrl` are properties of the
 * secret's own scope, not a per-run choice (spec §4b's placement rule, same reasoning already applied
 * to Cloudflare Pages' `accountId`).
 *
 * `publicUrl` is REQUIRED, unlike every other optional companion field on this union: an S3 `PUT`
 * response carries no public URL the way the other four providers' own APIs do, and
 * `../static-publish/types.ts`'s `StaticPublishOutcome`/`DeployPublishResult.url` are both
 * non-optional — nothing in this tuple can derive a reliable public URL (R2 has none by default, a
 * self-hosted MinIO often has no public DNS at all), so guessing wrong would produce a false
 * "Published" state pointing at a URL that 404s. Spec §4a.
 */
export interface S3CompatibleConnectionInput {
  readonly providerId: "s3-compatible";
  /** Blank/omitted means plain AWS S3 (a region-derived default host) — see
   *  `../static-publish/s3-compatible-target.ts` for the derivation. Non-blank for every other
   *  provider in scope (R2, B2, DigitalOcean Spaces, Wasabi, MinIO all require an explicit endpoint). */
  readonly endpoint?: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  /** SECRET — never echoed back by any route/tool, never logged. Sealed as part of this whole object
   *  (see this file's header on the closed-union / one-ciphertext-per-row design). */
  readonly secretAccessKey: string;
  readonly publicUrl: string;
}

/** Closed discriminated union — see this file's header. This whole object is what gets serialized to
 *  JSON and sealed as ONE ciphertext blob per credential set (never per-field columns — see
 *  `src/db/schema.ts`'s `publishCredentialSets` header for why). */
export type PublishConnectionInput =
  | GitHubPagesConnectionInput
  | VercelConnectionInput
  | NetlifyConnectionInput
  | CloudflarePagesConnectionInput
  | S3CompatibleConnectionInput;

/** A `publish_credential_sets` row, decrypted-shape (`sealed` is the DB's opaque
 *  `SealedSecret` — the actual `PublishConnectionInput` only exists in memory after
 *  `resolveForPublish` opens it; see `store.ts`). */
export interface PublishCredentialSetRecord {
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly providerId: PublishProviderId;
  readonly label: string;
  readonly sealed: SealedSecret;
  /** Migration `0041` (Contract v2 Correction B) — at most one `TRUE` per `(workspaceId,
   *  providerId)`, maintained by `store.ts`'s write path (never by a DB constraint — see
   *  `db/schema.ts`'s `publishCredentialSets.isDefault` doc). `resolveDefaultForPublish` reads the
   *  row with `isDefault: true` for a provider instead of requiring a caller-supplied `id`. */
  readonly isDefault: boolean;
  /** Migration `0044` (2026-08-16) — the verified account's public login/username, held in the
   *  clear (never sealed) — see `db/schema.ts`'s `publishCredentialSets.accountLabel` doc for the
   *  full reasoning (mirrors `composioConnectorCredentials.accountLabel`) and `store.ts`'s header for
   *  exactly which write paths are and are not allowed to populate it. */
  readonly accountLabel: string | null;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}

/** The read model every route/tool in this feature returns — see `store.ts`'s `toSummary`. NEVER
 *  contains `sealed`, a token, or any `PublishConnectionInput` field — enforced by construction: this
 *  type has no field capable of carrying one. */
export interface PublishCredentialSummary {
  readonly id: UUID;
  readonly providerId: PublishProviderId;
  readonly label: string;
  readonly configured: true;
  readonly isDefault: boolean;
  /** See `PublishCredentialSetRecord.accountLabel`'s own doc — carried through unchanged, never
   *  re-derived here (this is a read model, it never decrypts or verifies anything). */
  readonly accountLabel: string | null;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}

/** Workspace-scoped persistence for {@link PublishCredentialSetRecord} (ADR-007 §1). `insert`
 *  assumes the caller already checked/accepted the `(workspaceId, providerId, label)` UNIQUE
 *  constraint may reject it — see `store.ts`'s `isUniqueLabelViolation` for how that DB error is
 *  turned into `PublishCredentialDuplicateLabelError` rather than propagated as a raw driver error.
 *
 * `insert`/`update`/`delete` ALSO own the `isDefault` invariant (Contract v2 Correction B): if the
 * written `record.isDefault` is `true`, `insert`/`update` atomically clear `isDefault` on every OTHER
 * row sharing `(workspaceId, providerId)`, in the SAME transaction as the write (the SQLite adapter
 * wraps both statements in one `db.transaction()`; the in-memory adapter's plain synchronous
 * sequencing gets the same atomicity for free — no `await` ever separates the read from the write).
 * `delete` promotes the group's most-recently-updated remaining row to default if the deleted row WAS
 * the default. `store.ts`'s write path decides the VALUE of `isDefault` before calling these (e.g.
 * "first row for a provider auto-defaults"); this port only guarantees the GROUP-WIDE invariant once
 * that value is decided. */
export interface PublishCredentialSetRepoPort {
  insert(record: PublishCredentialSetRecord): Promise<void>;
  /** Full-row replace by `(workspaceId, id)` — used for both a label rename and a connection
   *  rotation. Same UNIQUE-violation possibility as `insert` (renaming into another row's label). */
  update(record: PublishCredentialSetRecord): Promise<void>;
  findById(input: { workspaceId: UUID; id: UUID }): Promise<PublishCredentialSetRecord | null>;
  /** The current default row for one `(workspaceId, providerId)` pair — `null` if that provider has
   *  no rows at all for this workspace. Once the write path's invariant holds, a provider with any
   *  rows always has exactly one default; a caller should still treat `null` as "no default"
   *  defensively rather than assume the invariant can never be violated (e.g. by a hand-edited row). */
  findDefaultByProvider(input: { workspaceId: UUID; providerId: PublishProviderId }): Promise<PublishCredentialSetRecord | null>;
  /** Every row for one `(workspaceId, providerId)` pair — used by `store.ts`'s write path to decide
   *  "is this the group's first row" (create-time auto-default) and, ahead of `delete`, to reason
   *  about the promotion candidate. Same small-collection reasoning as `listByWorkspace`. */
  listByProvider(input: { workspaceId: UUID; providerId: PublishProviderId }): Promise<PublishCredentialSetRecord[]>;
  /** Every credential set a workspace has saved, across all providers — this feature's own
   *  collection is inherently small (bounded by how many connections a human bothers to save through
   *  this exact form, not by any user-supplied N), so no pagination/cap is added here, unlike a
   *  service-backed collection whose size a caller could otherwise inflate. */
  listByWorkspace(input: { workspaceId: UUID }): Promise<PublishCredentialSetRecord[]>;
  /** No-op (not an error) if no row exists for `(workspaceId, id)` — matches
   *  `SiteAssistantCredentialRepoPort.clearKey`'s idempotent-delete posture and this feature's own
   *  `DELETE .../credentials/:id` route contract (204, idempotent). See this interface's own header
   *  for the default-promotion behavior this method also performs. */
  delete(input: { workspaceId: UUID; id: UUID }): Promise<void>;
  /** Migration `0044` (2026-08-16) — a TARGETED single-column write, deliberately not `update()`'s
   *  full-row replace: healing an account label after a verify must never disturb `sealed`,
   *  `isDefault`, or `updatedAt` (a verify is a read of the provider, not a change to the credential
   *  itself). No-op (not an error) if no row exists for `(workspaceId, id)` — same idempotent posture
   *  as `delete`; the caller (`static-publish/verify.ts`'s human-gated route) has no reason to treat a
   *  row that vanished mid-request as anything other than "nothing to heal." See `store.ts`'s own
   *  header for why this is the ONLY write path allowed to populate this column for THIS table (unlike
   *  `sourceControlCredentialSets`, whose sibling column is instead populated inline by `create`/
   *  `update` — see that table's own doc comment for why the two tables differ here). */
  updateAccountLabel(input: { workspaceId: UUID; id: UUID; accountLabel: string }): Promise<void>;
}
