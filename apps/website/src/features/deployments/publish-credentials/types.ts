import type { ISODateTime, UUID } from "@jini-ai/cms/core";

import type { SealedSecret } from "../../webhooks/index.js";

/**
 * @file Domain types for named, workspace-scoped provider connections used to publish a static
 * export to GitHub Pages / Vercel / Netlify / Cloudflare Pages (`publish_credential_sets`,
 * `src/platform/db/schema.sqlite.ts`). Design: `ADS-memory/reports/external-audit/runs/
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

/** A deploy target id (`DeployTargetDescriptor.id`) that takes a saved credential. Open: which ids
 *  exist is the deploy registry's business, validated where a connection is written (`store.ts`). */
export type PublishProviderId = string;

/**
 * A saved connection: the target id plus the flat string fields that host's deploy-plugin descriptor
 * declares for its credential (`DeployTargetDescriptor.credential`), validated by `store.ts`. This
 * whole object is what gets serialized to JSON and sealed as ONE ciphertext blob per credential set
 * (never per-field columns — see `src/platform/db/schema.sqlite.ts`'s `publishCredentialSets` header
 * for why). The shape is byte-compatible with rows sealed before hosts moved into the plugin: same
 * `providerId`, same field names.
 *
 * Publish-TARGET settings (a repository, a team) are never credential fields: they are chosen per
 * publish run and live on the publish config.
 */
export type PublishConnectionInput = { readonly providerId: PublishProviderId } & Readonly<Record<string, string>>;

/** LEGACY (2026-09-29): publish credentials now live in `vendor_credential_sets` (`store.ts`). This
 *  record and {@link PublishCredentialSetRepoPort} remain only so `vendor-table-backfill.ts` can read
 *  the old rows it copies at boot; nothing else may read them.
 *
 *  A `publish_credential_sets` row, decrypted-shape (`sealed` is the DB's opaque
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
   *  `db/schema.sqlite.ts`'s `publishCredentialSets.isDefault` doc). `resolveDefaultForPublish` reads the
   *  row with `isDefault: true` for a provider instead of requiring a caller-supplied `id`. */
  readonly isDefault: boolean;
  /** Migration `0044` (2026-08-16) — the verified account's public login/username, held in the
   *  clear (never sealed) — see `db/schema.sqlite.ts`'s `publishCredentialSets.accountLabel` doc for the
   *  full reasoning and `store.ts`'s header for
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
  /** The host this row is shown under: the first deploy host declaring its vendor. */
  readonly providerId: PublishProviderId;
  /** The account the credential authenticates to (`vendor_credential_sets.vendor_id`). */
  readonly vendorId: string;
  readonly label: string;
  readonly configured: true;
  readonly isDefault: boolean;
  /** Last 4 characters of the token field — see `vendor_credential_sets.token_tail`'s own doc. */
  readonly tokenTail: string;
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
