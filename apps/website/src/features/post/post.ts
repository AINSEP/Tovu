import type { ClockPort, JsonObject, OutboxPort, UUID } from "@jini-ai/cms/core";

export type PostStatus = "draft" | "published";

/**
 * Discriminates the two admin-facing lenses over the same bespoke `post` table
 * (see `INFO.md`): a `"post"` is a blog-style entry, a `"page"` is a standalone
 * document (About, Contact, …). Same record shape, same repo, same editor —
 * `kind` only changes which admin list surfaces a row and how it's created.
 * Fixed at creation; v1 has no post<->page conversion path.
 */
export type PostKind = "post" | "page";

/**
 * SPEC-047/ADR-056 Decision 3 — discriminates which body column a record actually carries.
 * `"doc"` (the only value this chokepoint ever writes in v1, see {@link resolveBodyFields}) is a
 * TipTap/ProseMirror document in `bodyJson`; `"html"` is a bespoke-HTML Page written only through
 * `PagesHtmlDocumentStore` (`features/pages/html-document-store.sqlite.ts`), a separate adapter that never calls
 * `createPost`/`updatePost` — this chokepoint can construct only `"doc"` records, by design (CIC-3).
 */
export type PostBodyFormat = "doc" | "html";

export interface PostRecord {
  id: UUID;
  workspaceId: UUID;
  title: string;
  slug: string;
  bodyJson: JsonObject;
  status: PostStatus;
  kind: PostKind;
  /**
   * SPEC-047/ADR-056 Decision 3 / CIC-3 — always `"doc"` for a record built by
   * `createPost`/`updatePost` (this chokepoint never accepts a caller-supplied value for this
   * field — see {@link resolveBodyFields}). An `"html"`-format Page is a real, distinct row this
   * same `posts` table can hold, but one only `PagesHtmlDocumentStore` ever writes.
   */
  bodyFormat: PostBodyFormat;
  /**
   * SPEC-047/ADR-056 Decision 3 — the bespoke-HTML body for an `"html"`-format Page. Always `null`
   * on a record built by `createPost`/`updatePost` (see {@link bodyFormat}'s doc); populated only by
   * `PagesHtmlDocumentStore`'s own direct write path.
   */
  bodyHtml: string | null;
  updatedAt: string;
  version: number;
  /**
   * SPEC-008 (ADR-PIPE-008 Decision §4) — the raw JSON-serialized per-entry
   * SEO override bag (`SeoExtFields`), or `null` when no overrides have ever
   * been written. Written ONLY through `src/seo/write-service.ts`'s
   * `setEntrySeoOverrides` chokepoint (INV-01) — no other caller may write
   * this field. Kept as an opaque string here (not parsed) so `post`/its repo
   * adapters stay ignorant of `seo`'s value shape; `seo.ts`/`write-service.ts`
   * own the `JSON.parse`/`JSON.stringify` boundary.
   */
  seoExtJson?: string | null;
  /**
   * SPEC-005 (ADR-005-ARCH REQ-06/BR-06) — the plugin extension-field bag, namespaced per plugin
   * (`{ [pluginId]: { …declaredFields } }`). Written ONLY by the `content.entry.beforeSave`
   * hook-merge step immediately before the single `deps.repo.save()` call below (CIC U-004), and
   * restored verbatim (never recomputed) by the gateway revert path (BR-08, CIC U-005).
   *
   * Absent — not `{}` — when no plugin has ever written to this entry, so an entry with no
   * contributing plugin carries no `ext` object at all on its DTO (AC-14). A namespace whose
   * plugin is later disabled or uninstalled is retained inert here, never deleted (INV-03).
   */
  ext?: JsonObject;
  /**
   * Soft-delete (trash) marker — the ISO timestamp at which this row was moved to trash, or
   * `null`/absent while it is live. Written ONLY through `PostRepoPort.softDelete` (below), which
   * `deletePost` is the sole caller of.
   *
   * Soft, not hard, and that is a decision about this codebase rather than a preference: nothing in
   * Tovu deletes a content row outright today, and the surrounding machinery is built to make
   * writes recoverable (the command gateway's change-set inverse, `core/commands/appliers.ts`'s
   * reverters, the restore-point/timeline concept). A trashed row keeps every field it had, so
   * `postDeleteReverter` (`appliers.ts`) restores it by clearing this one marker — a hard
   * `DELETE FROM` would have no pre-image to restore from and would break that guarantee.
   *
   * A trashed row STILL HOLDS ITS SLUG, deliberately. `posts_workspace_slug_unique` is a real
   * database constraint, so if trashing freed the slug for reuse, `createPost` would pass its own
   * uniqueness check and then die on a SQLite constraint violation instead of a clean
   * `PostConflictError`. Keeping the slug reserved also keeps a restore lossless. The repo port
   * therefore stays trash-BLIND (`findById`/`findBySlug`/`list` all still return trashed rows, so
   * uniqueness checks and reverters can see them); every trash-AWARE read filter lives in this
   * file's own domain functions, exactly the way `kind` filtering already does.
   */
  deletedAt?: string | null;
  /**
   * Template-picker feature (2026-08-10, unified 2026-08-11) — the `pages/*.html` filename (from the
   * active static theme's `theme.json` `templates` array, e.g. `"blog-post.html"`) this row renders
   * through. Shared by both Posts and Pages (one field, same as the one manifest array it resolves
   * against).
   *
   * Tri-state, and the `null`-vs-`""` difference is load-bearing: `null`/absent means *never chosen*
   * (falls back to the theme's first-listed template at render time for a Post — never for a Page,
   * see `isEligibleForTemplateBranch`'s doc), `""` means the author *explicitly opted out* via the
   * admin picker's "No template chosen" (renders the diagnostic page, not a silent fallback to
   * generic rendering). See `resolveTemplate` (`features/theme/static-render.ts`) for the full
   * rationale.
   */
  templateChoice?: string | null;
  /**
   * Slug-collision override (2026-08-10, tri-state 2026-08-15) — when this post's slug matches one
   * of the active static theme's own page filenames, one of the two resources must win. Tri-state,
   * and the `null`-vs-`false` difference is load-bearing (same shape as {@link templateChoice}'s own
   * `null`-vs-`""` split just above): `null`/absent means *never decided*, so the resolver applies
   * whatever the current default policy is (as of 2026-08-15, the post wins — see `pages.ts`); an
   * explicit `true`/`false` is a permanent author choice, made after the admin UI warns about the
   * collision, that always wins over the default regardless of which way the default is set.
   */
  overridesThemePage?: boolean | null;
  /**
   * Member-gating (2026-09-02 dispatch, ADR-030 §4) — the raw JSON-serialized
   * `MemberContentAccess`, or `null`/absent when nobody has ever gated this entry. Kept as an
   * opaque string here (not parsed) so `post`/its repo adapters stay ignorant of `members`' value
   * shape, the same "owning feature parses its own ext column" contract {@link seoExtJson} already
   * establishes — `features/members/access-resolver.ts`'s `resolvePostMemberAccess` owns the
   * `JSON.parse` boundary and decodes `null`/absent as `{visibility: "public"}`. No admin-facing
   * writer exists yet; see that file's module doc for what a future writer needs.
   */
  memberAccessJson?: string | null;
  /**
   * Authorship attribution (2026-09-18, `posts.created_by_principal_id`) — the id of the
   * {@link CreatePostInput.actorId} principal that created this row, or `null`/absent when that is
   * genuinely unknown (every pre-migration row, and any row created without a known caller). Unlike
   * {@link SYSTEM_ACTOR_ID} — the `post_revisions.actor_id` ledger's own fallback for the identical
   * omission — this field is never fabricated: `createPost` stamps it from `input.actorId` with NO
   * fallback, so an omitted actor stores `null` here even though the same call still attributes a
   * `"system"` revision. Write-once: `updatePost` never sets this field (see {@link buildUpdatedPost},
   * which carries it over unchanged via its `...carriedOver` spread) — `repo.sqlite.ts`'s
   * `updatableColumns()` is the second, structural enforcement of the same rule. This is an
   * ATTRIBUTION field, not an authorization one; nothing may key a permission check off it.
   */
  createdByPrincipalId?: string | null;
  /**
   * Authorship attribution (2026-09-18, `posts.created_at`) — the ISO timestamp `createPost` first
   * wrote this row at, or `null`/absent when that is genuinely unknown (every pre-migration row).
   * Same write-once contract as {@link createdByPrincipalId} — never set by `updatePost`.
   */
  createdAt?: string | null;
}

/**
 * Standing-draft autosave for one post/page row (2026-09-06 dispatch — see `posts.autosave_json`'s
 * own schema doc for the column this persists to). Captures exactly the fields the admin editors
 * let an operator change before a real Save/Publish — deliberately NOT `status`: a standing draft
 * never changes whether a row is live, so recovering one can never silently publish or unpublish
 * anything.
 *
 * `baseVersion` is the {@link PostRecord.version} this snapshot was captured against — the seam
 * both {@link PostRepoPort.writeAutosave} (write-time staleness guard) and the recovery-banner
 * caller (read-time "is this still relevant" check) key off, so a draft built on top of content a
 * real save has since superseded is never silently treated as current.
 */
export interface PostAutosaveSnapshot {
  readonly bodyFormat: PostBodyFormat;
  readonly bodyJson?: JsonObject;
  readonly bodyHtml?: string;
  /**
   * A Post's title also lives as a node inside its own `bodyJson` (the title-in-document feature,
   * `use-post-editor.hooks.ts`), but a Page's does not — its `<input>` is a plain sibling field with
   * nothing else to derive it from. Captured explicitly here so recovery is complete for both.
   */
  readonly title: string;
  readonly slug: string;
  readonly baseVersion: number;
  readonly savedAt: string;
  readonly savedByPrincipalId: UUID;
}

/**
 * SPEC-005 REQ-05 — the read-only entry snapshot handed to `BeforeSaveHookPort`. Declared
 * structurally here rather than importing `@tovu/sdk`'s `ContentEntryDraft` so `post.ts` stays
 * plugin-ignorant (Module Map): `post` knows it may call one optional function before saving, and
 * nothing about plugins, capabilities, or the hook registry. `plugin-runtime/hook-registry.ts`'s
 * `runBeforeSave` satisfies this port structurally.
 */
export interface BeforeSaveEntryDraft {
  readonly id: UUID;
  readonly workspaceId: UUID;
  readonly title: string;
  readonly slug: string;
  readonly status: PostStatus;
  readonly bodyJson: Readonly<Record<string, unknown>>;
  readonly ext: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/**
 * SPEC-005 C-014/W-003 — the sole plugin-facing surface `post.ts` depends on. Resolves to the
 * merged, already-validated `ext` patch (`{ [pluginId]: { …fields } }`), or throws to abort the
 * whole save (BR-07/EC-10 fail-closed).
 */
export type BeforeSaveHookPort = (entry: BeforeSaveEntryDraft) => Promise<JsonObject>;

/**
 * One row `appendRevision` writes to `post_revisions` (`platform/db/schema.ts`, migration
 * `0064_famous_omega_sentinel.sql`) — the full `PostRecord` snapshot, not the narrower shape
 * `postUpdateReverter`'s inverse payload captures (`reverters.ts` — that inverse drops
 * `seoExtJson`, `memberAccessJson`, `bodyHtml`/`bodyFormat`, `kind`, `deletedAt`, a documented,
 * disclosed gap). This ledger's whole reason to exist is to not repeat that gap, so `stateJson`
 * below is always the WHOLE `PostRecord` a caller just wrote, never a derived subset.
 */
export type PostRevisionOp = "create" | "update" | "delete" | "restore";

/**
 * `appendRevision`'s write contract. `seq` is `PostRecord.version` AFTER the write this revision
 * captures — the caller (`createPost`/`updatePost`/`deletePost` below) already has that value in
 * hand from building the record, so it travels in rather than being independently recomputed by
 * the repo (one fact, one name — see `schema.ts`'s `postRevisions.seq` doc).
 */
export interface PostRevisionInput {
  postId: UUID;
  workspaceId: UUID;
  seq: number;
  op: PostRevisionOp;
  stateJson: PostRecord;
  actorId: string;
  delegatedByWorkspaceId?: UUID | null;
  delegatedById?: UUID | null;
  /** Id of the revision a `"restore"`-op row was restored from. `null`/absent for every other op —
   *  nothing writes a `"restore"` row yet (out of scope until a restore feature exists). */
  restoredFrom?: string | null;
  recordedAt: string;
}

/** One row read back from `post_revisions` — {@link PostRevisionInput} plus the two fields the
 *  repo itself computes at write time (`id`, `contentHash`). */
export interface PostRevisionRecord extends PostRevisionInput {
  id: string;
  contentHash: string;
}

/** {@link PostRepoPort.appendRevision}'s result: the new row's id, and the id of the immediately
 *  prior revision for the same `(workspaceId, postId)` — `null` when this is the first revision
 *  ever written for that post (true for every post that predates this feature; additive, no
 *  backfill). */
export interface PostRevisionAppendResult {
  id: string;
  previousId: string | null;
}

export interface PostRepoPort {
  findById(required: { workspaceId: UUID; id: UUID }): Promise<PostRecord | null>;
  findBySlug(required: { workspaceId: UUID; slug: string }): Promise<PostRecord | null>;
  list(required: { workspaceId: UUID }): Promise<PostRecord[]>;
  /**
   * Bounded, query-pushed-down listing of published, non-trashed `kind: "post"` rows, newest
   * `updatedAt` first, capped at `limit` — the post-previews marker's own query
   * (`features/theme/static-render.ts`'s `injectPostPreviewsEmbeds`, wired through
   * `listPublishedPostPreviews` below). Mirrors the query-shape discipline
   * `widgets/resolvers/recent-entries.ts` already established for `entries` (REQ-25: "one bounded
   * query, no unbounded scan sorted/sliced in JS after the fact"), applied here to `posts`.
   *
   * `kind: "post"` is filtered IN THE QUERY, not after: filtering Pages out in JS after an already
   * `limit`-bounded fetch could silently return fewer than `limit` real posts even when more exist.
   * This is also what keeps a Page — including whichever one claims the reserved `/` root slug —
   * out of a post-previews listing, with no separate exclusion check needed at any caller.
   *
   * Deliberately NOT reused by {@link list}/`listPublishedPosts`/`listAdminPosts`/`listAdminPages`
   * above — those stay unbounded and unchanged; this is an ADDITIVE method for the one caller that
   * needs a bounded query, not a widening of the existing unbounded ones.
   */
  listPublishedPreviews(required: { workspaceId: UUID; limit: number }): Promise<PostRecord[]>;
  /**
   * Unconditional upsert of one whole row — last write wins, by design.
   *
   * This is the right method for a writer that IS the authority on the row's next state: a create,
   * a change-set revert restoring a captured pre-image (which must land even though its `version`
   * is older than the row's current one), a backfill. It is the WRONG method for a
   * read-modify-write that has to survive a concurrent writer — see {@link saveIfVersion}.
   */
  save(record: PostRecord): Promise<void>;
  /**
   * The conditional half of an optimistic-concurrency compare-and-set: writes `record` over the
   * existing row ONLY while that row is still at `ifVersion`, and reports which happened.
   *
   * Why this exists as a separate method rather than a `version` predicate on {@link save} (2026-09-07,
   * fable bugs audit C01): `updatePost` compares the caller's `expectedVersion` against a row it read
   * two awaits earlier — a repo read and a plugin `beforeSave` hook of arbitrary, third-party latency
   * sit between the compare and the write. An unconditional `save()` therefore lands whatever happened
   * during those awaits, so two operators who both open a post at version 7 both get a 200 and one
   * document is silently erased. The compare has to travel INTO the write for the guard to mean
   * anything. {@link writeAutosave} has always done exactly this for the `autosave_json` column
   * (`eq(posts.version, baseVersion)` + `changes === 0`); this is the same predicate for the row.
   *
   * NEVER an upsert: a row that is not there cannot be at `ifVersion`, so a missing row is
   * `applied: false`, not a silent insert of a record some other writer just deleted.
   *
   * @returns `{ applied: true }` when the row was at `ifVersion` and now holds `record`;
   * `{ applied: false }` when the basis was superseded (or the row is gone) and NOTHING was written
   * — no partial write, no version bump. The caller decides what a rejection means; `updatePost`
   * turns it into `PostVersionConflictError`.
   */
  saveIfVersion(required: { record: PostRecord; ifVersion: number }): Promise<{ applied: boolean }>;
  /**
   * Stamps the trash marker onto one existing row (see {@link PostRecord.deletedAt}).
   *
   * A narrow method rather than "just call `save()` with `deletedAt` set", for the same reason
   * `seoExtJson` has a documented single writer: trashing is the one write that makes a row vanish
   * from every admin and public read, so it gets one auditable code path both adapters implement
   * identically instead of being reachable from any caller holding a whole record. `save()` still
   * persists whatever `deletedAt` a record carries (a reverter clearing the marker writes through
   * `save()`), but `deletePost` is the only thing that SETS one, and it does so through here.
   *
   * `updatedAt`/`version` travel with the marker because a trash is a state change like any other:
   * the version must advance so the command gateway's revert guard (`appliers.ts`'s
   * `currentVersion`) can tell a restored row from the trashed one it replaced.
   *
   * 2026-09-20: `deletePost` no longer calls this. Trashing now goes through {@link DeletePostDeps}'s
   * injected `remove`, which stamps the same three columns AND writes the Trash index row inside one
   * transaction — the two could not be made atomic while they were separate calls. This method
   * remains the port's narrow marker write (both adapters still implement it identically, and its
   * rule-of-two contract tests still run) and is what a test harness or an in-memory composition
   * binds `remove` to; nothing in the serving path reaches it any more.
   */
  softDelete(required: {
    workspaceId: UUID;
    id: UUID;
    deletedAt: string;
    updatedAt: string;
    version: number;
  }): Promise<void>;
  /**
   * Reads the standing-draft autosave snapshot for one row, or `null` when none is parked — the
   * common case, and also what a caller gets after {@link clearAutosave} or once a
   * {@link writeAutosave} call has been rejected as stale (see that method's own doc). Deliberately
   * separate from {@link findById}: `PostRecord` never carries this field, so a recovery-banner
   * check is always an explicit second read a caller opts into, never something that leaks into an
   * ordinary post response by accident.
   */
  readAutosave(required: { workspaceId: UUID; id: UUID }): Promise<PostAutosaveSnapshot | null>;
  /**
   * Overwrites the standing-draft autosave snapshot for one row — ONLY when
   * `snapshot.baseVersion` still matches the row's current {@link PostRecord.version}. A caller
   * whose basis has already been superseded by a real Save/Publish (the only two things that ever
   * bump `version`) is silently ignored (`applied: false`) rather than resurrecting stale content
   * over newer real content. This is also what makes {@link clearAutosave} safe under a race: once
   * a real save bumps `version`, every still-in-flight autosave write captured before that save is
   * a guaranteed no-op, so a `clearAutosave` call right after that save can never be "un-cleared" by
   * one of those late arrivals.
   *
   * Deliberately NOT `save()`: this touches exactly the `autosave_json` column and nothing else —
   * never `bodyJson`/`bodyHtml`/`status`/`updatedAt`/`version` itself, never the
   * `content.entry.beforeSave` hook, never the search index. A published row's live content is
   * unreachable from this method by construction, which is what lets one implementation serve both
   * a draft-status and a published-status row with no branch between them.
   *
   * @returns `{ applied: true }` when the write landed, `{ applied: false }` when it was rejected
   * as stale — the route layer surfaces this so the caller can stop treating its own local edits as
   * the current basis for the row.
   */
  writeAutosave(required: {
    workspaceId: UUID;
    id: UUID;
    snapshot: PostAutosaveSnapshot;
  }): Promise<{ applied: boolean }>;
  /**
   * Clears the standing-draft autosave snapshot for one row (back to "nothing to recover").
   * Unconditional — unlike {@link writeAutosave}, there is no stale basis to guard against when the
   * intent is simply "there is no longer a draft to offer", whether because the operator explicitly
   * discarded it or because a real Save/Publish just superseded it.
   */
  clearAutosave(required: { workspaceId: UUID; id: UUID }): Promise<void>;
  /**
   * Appends one immutable row to this post's revision ledger (`post_revisions`) — never updates or
   * deletes an existing row (ADR-008 §items / ADR-022 §4a append-only discipline, the same
   * discipline `entryRevisions`/`settingRevisions` already follow). See {@link PostRevisionInput}
   * for the full-snapshot contract this exists to guarantee.
   *
   * Never called standalone by `createPost`/`updatePost`/`deletePost` below — each always calls
   * this from inside a {@link transaction} that also contains the post write itself, so a revision
   * is never recorded for a write that didn't really land, and a write never lands silently
   * unaccompanied by its revision.
   */
  appendRevision(input: PostRevisionInput): Promise<PostRevisionAppendResult>;
  /**
   * Reads back one post's revision ledger, oldest first (ascending `seq`) — the only read surface
   * over what {@link appendRevision} has written; `post_revisions` has no other consumer yet.
   */
  listRevisions(required: { workspaceId: UUID; postId: UUID }): Promise<PostRevisionRecord[]>;
  /**
   * Runs `fn` with the post write and its revision-ledger append as one atomic unit — either both
   * land or neither does. Needed because `createPost`/`updatePost`/`deletePost` each make TWO
   * separate repo calls (the record write, then {@link appendRevision}); without this, a failure
   * between them would leave a post write with no matching revision, silently breaking the
   * ledger's one guarantee (every write has a revision). Mirrors the manual `BEGIN IMMEDIATE`/
   * `COMMIT`/`ROLLBACK` `transaction()` already implemented by `SqliteSettingsRepo`,
   * `SqliteMemberConsentRepo`, and `SqliteRedirectRepo` in this codebase — chosen over Drizzle's
   * own `db.transaction()` wrapper because that wrapper requires a synchronous callback, and `fn`
   * here awaits other async repo calls.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/** True when a row is in the trash — the single predicate every trash-aware read below applies. */
export function isTrashed(post: Pick<PostRecord, "deletedAt">): boolean {
  return post.deletedAt !== undefined && post.deletedAt !== null;
}

export interface CreatePostInput {
  workspaceId: UUID;
  /** Pre-generated by the caller (the command gateway needs the id before `execute()` runs). */
  id: UUID;
  title: string;
  /** Defaults to `"post"` — the existing posts-create route relies on this default. */
  kind?: PostKind;
  /**
   * SPEC-002 api.spec.md `POST_CREATE`/`PAGE_CREATE` §4 — optional caller-supplied slug.
   * When present it is validated and checked for uniqueness exactly like `updatePost`
   * (same format rule, same `PostConflictError`/`SLUG_CONFLICT` semantics); when absent
   * it is derived from `title` (existing BR-01/BR-02-style behavior, unchanged).
   */
  slug?: string;
  /** Optional caller-supplied body document. Defaults to an empty TipTap doc when absent (see `DEFAULT_BODY_JSON`). */
  bodyJson?: JsonObject;
  /** Optional caller-supplied status. Defaults to `"draft"` when absent. */
  status?: PostStatus;
  /** Attribution for the revision this write appends to `post_revisions` (2026-09-18). Optional —
   *  an omitted value defaults to {@link SYSTEM_ACTOR_ID} rather than being required, so this
   *  repo's own ~9 direct-unit-test call sites (documented on {@link CreatePostDeps}) keep
   *  compiling and behaving exactly as before. */
  actorId?: UUID;
  /** Same optional-with-null-default contract as {@link PostRevisionInput.delegatedByWorkspaceId} —
   *  set only by a call site acting through a delegate (an agent or api_key acting on a human's
   *  behalf, per `contracts/core/gated-mutations/actor-identity.ts`'s documented convention).
   *  Omitted/null for a direct human action. */
  delegatedByWorkspaceId?: UUID | null;
  /** See {@link CreatePostInput.delegatedByWorkspaceId}. */
  delegatedById?: UUID | null;
}

export interface CreatePostDeps {
  clock: ClockPort;
  repo: PostRepoPort;
  /**
   * SPEC-005 (CIC U-004) — OPTIONAL. Absent ⇒ the zero-plugin path behaves exactly as it did
   * before this feature (no `ext` is written, no extra call is made). See `runBeforeSaveHook`.
   */
  beforeSaveHook?: BeforeSaveHookPort;
  /**
   * OPTIONAL, same "absent ⇒ behaves exactly as before" convention as {@link beforeSaveHook} just
   * above. When present, a post/page created directly as `status: "published"` now enqueues the
   * same `entry.published` event `updatePost`/`deletePost` already emit on a status transition —
   * closing a gap where creating published (a documented, first-class input on both the HTTP create
   * routes and the `content_post_create`/`content_page_create` assistant tools, not an edge case)
   * never invalidated SEO's sitemap cache (`features/seo/sitemap.ts`), leaving the new entry
   * permanently absent from `sitemap.xml` until an unrelated post in the same workspace was later
   * updated. Left optional rather than required (unlike `UpdatePostDeps.outbox`/
   * `DeletePostDeps.outbox`) so every existing caller that has no reachable outbox — this repo's
   * ~9 direct-unit-test call sites among them — keeps compiling and behaving exactly as before;
   * every real production caller (`posts/create.ts`, `pages/create.ts`,
   * `tool-registrations.ts`'s `content_post_create`) now supplies its own `deps.outbox`.
   */
  outbox?: OutboxPort;
}

export interface CreatePostRequired {
  deps: CreatePostDeps;
  input: CreatePostInput;
}

export interface CreatePostOptional {}

export interface UpdatePostInput {
  workspaceId: UUID;
  id: UUID;
  title: string;
  slug: string;
  bodyJson: JsonObject;
  status: PostStatus;
  /**
   * Post-template-picker feature (2026-08-10) — optional. `undefined` (the field simply omitted)
   * carries the existing choice over unchanged, matching every other field this endpoint doesn't
   * require a caller to resend; `null` explicitly clears a previously-chosen template.
   */
  templateChoice?: string | null;
  /**
   * Same "omit to leave unchanged" contract as {@link UpdatePostInput.templateChoice} just above —
   * `undefined` carries the existing value forward untouched; an explicit `null` resets it back to
   * *never decided* (the resolver's default applies again), and `true`/`false` set a permanent
   * explicit choice. See {@link PostRecord.overridesThemePage} for the full tri-state contract.
   */
  overridesThemePage?: boolean | null;
  /**
   * Optimistic-concurrency basis (2026-09-06) — the {@link PostRecord.version} the caller believes
   * it is editing, captured when it read the row.
   *
   * OPTIONAL and opt-in. Omit it and `updatePost` behaves exactly as it always has (last write
   * wins), so no existing caller's behavior moves. Send it and a save built on a basis another save
   * has already superseded is rejected with a {@link PostVersionConflictError} instead of silently
   * erasing the other operator's document.
   *
   * Compared with strict equality against the row's current version and nothing else, so a value
   * that is not exactly that version is a conflict — including a nonsense one. Fail-closed by
   * design: the only safe reading of "I do not know which version I am editing" is "do not write".
   *
   * The same basis seam {@link PostAutosaveSnapshot.baseVersion} already keys off, applied to the
   * real save rather than to the standing draft. The two are independent guards over different
   * things: that one protects a parked draft, this one protects the live document.
   */
  expectedVersion?: number;
  /** Same optional-with-fallback contract as {@link CreatePostInput.actorId}. */
  actorId?: UUID;
  /** Same optional-with-null-default contract as {@link CreatePostInput.delegatedByWorkspaceId}. */
  delegatedByWorkspaceId?: UUID | null;
  /** See {@link CreatePostInput.delegatedByWorkspaceId}. */
  delegatedById?: UUID | null;
}

export interface UpdatePostDeps {
  clock: ClockPort;
  repo: PostRepoPort;
  /**
   * SPEC-008 (ADR-PIPE-008 Decision §5) — required because every real caller
   * already has one available on `RouteDeps`. `updatePost` compares the
   * existing vs incoming `status` and enqueues at most one of
   * `entry.published`/`entry.updated`/`entry.unpublished` per the 4-row
   * transition table (INV-010) — the sole real signal source
   * `src/seo/sitemap.ts`'s cache invalidation (REQ-10) depends on.
   */
  outbox: OutboxPort;
  /**
   * SPEC-005 (CIC U-004) — OPTIONAL. Absent ⇒ the zero-plugin path behaves exactly as it did
   * before this feature (no `ext` is written, no extra call is made). See `runBeforeSaveHook`.
   */
  beforeSaveHook?: BeforeSaveHookPort;
}

export interface UpdatePostRequired {
  deps: UpdatePostDeps;
  input: UpdatePostInput;
}

export interface UpdatePostOptional {}

export interface DeletePostInput {
  workspaceId: UUID;
  id: UUID;
  /** Same optional-with-fallback contract as {@link CreatePostInput.actorId}. */
  actorId?: UUID;
  /** Same optional-with-null-default contract as {@link CreatePostInput.delegatedByWorkspaceId}. */
  delegatedByWorkspaceId?: UUID | null;
  /** See {@link CreatePostInput.delegatedByWorkspaceId}. */
  delegatedById?: UUID | null;
}

/**
 * The delete primitive this domain is handed, rather than one it implements.
 *
 * Structurally typed ON PURPOSE — this file imports nothing from `features/trash`, and must not.
 * The composition root binds the real implementation (which stamps the marker AND indexes the item
 * for the Trash screen, as one transaction) and hands it in already bound to this domain's entity
 * type, so `deletePost` never learns that a Trash exists. The only thing it knows is that removal
 * is somebody else's single, atomic write.
 *
 * `display` is REQUIRED because the caller already holds the record — it loaded it for its own
 * not-found check — so the two strings the Trash screen shows come from columns, with no second
 * read and no payload parse. That is what keeps a post with unparseable `body_json` deletable.
 */
export type RemovePostFn = (required: {
  workspaceId: string;
  id: string;
  display: { title: string; subtitle?: string | null };
  at: string;
  expectedVersion: number | null;
  actor: { principalId: string; pluginId?: string | null };
}) => Promise<{ ok: true; version: number | null } | { ok: false; reason: "not-found" | "version-changed" }>;

export interface DeletePostDeps {
  clock: ClockPort;
  repo: PostRepoPort;
  /**
   * Required for the same reason `updatePost`'s is (SPEC-008 ADR-PIPE-008 Decision §5): trashing a
   * PUBLISHED entry removes it from the public site, which is precisely the signal
   * `src/seo/sitemap.ts`'s cache invalidation subscribes to. See `deletePost`'s own doc for why
   * this reuses `classifyStatusTransition` rather than inventing an `entry.deleted` name.
   */
  outbox: OutboxPort;
  /** See {@link RemovePostFn}. Replaces this function's former direct `repo.softDelete` call. */
  remove: RemovePostFn;
}

export interface DeletePostRequired {
  deps: DeletePostDeps;
  input: DeletePostInput;
}

export interface DeletePostOptional {}

/**
 * Moves one post/page to the trash (soft delete) and returns the trashed record.
 *
 * Reversible by construction — see {@link PostRecord.deletedAt} for why this is a marker rather
 * than a `DELETE FROM`, and `core/commands/appliers.ts`'s `postDeleteReverter` for the restore that
 * marker makes possible.
 *
 * KIND-BLIND, deliberately, exactly like `updatePost`: `PostKind`'s own doc records that a page and
 * a post share one update contract, and `pages/update.ts` puts its kind guard in the ROUTE's
 * `captureInverse` rather than in the domain function. `pages/delete.ts` and the
 * `content_post_delete` tool mirror that placement rather than pushing a `kind` param down here,
 * so the guard stays where every other kind guard in this domain already lives.
 *
 * Trashing an already-trashed row is a `PostNotFoundError`, not a no-op: a trashed row is invisible
 * to every read in this file, so "delete something you cannot see" is a not-found, which also keeps
 * the second call from bumping the version and re-emitting the event.
 *
 * EVENT: emits `entry.unpublished` when a PUBLISHED row is trashed, and nothing when a draft is —
 * computed by handing `classifyStatusTransition` the transition a trash actually is (whatever the
 * row was, to no-longer-public). No new event name is invented: `entry.unpublished` is what SEO's
 * sitemap-cache invalidation already subscribes to (`server/app.ts`), and "this entry left the
 * public site" is exactly what happened.
 *
 * @complexity O(1) — one lookup plus one marker write.
 * @overallScore 100
 */
export async function deletePost(
  required: DeletePostRequired,
  _optional: DeletePostOptional = {}
): Promise<{ post: PostRecord; revisionId: string; previousRevisionId: string | null }> {
  const { deps, input } = required;
  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing || isTrashed(existing)) {
    throw new PostNotFoundError(`post '${input.id}' was not found`);
  }

  const now = deps.clock.nowIso();
  const version = existing.version + 1;
  const post: PostRecord = { ...existing, deletedAt: now, updatedAt: now, version };

  // The removal and its revision-ledger append are one atomic unit (see `PostRepoPort.transaction`'s
  // own doc) — a revision must never be recorded for a trash that didn't really land, and a trash
  // must never land unaccompanied by its revision. `deps.remove` joins this transaction rather than
  // opening its own, so the marker, the Trash index row and the revision are all-or-nothing.
  const { id: revisionId, previousId: previousRevisionId } = await deps.repo.transaction(async () => {
    const removed = await deps.remove({
      workspaceId: input.workspaceId,
      id: input.id,
      // From columns the `findById` above already returned — no second read, no payload parse.
      display: { title: existing.title, subtitle: existing.slug },
      at: now,
      expectedVersion: existing.version,
      actor: { principalId: input.actorId ?? SYSTEM_ACTOR_ID },
    });
    if (!removed.ok) {
      // `not-found` can only mean the row was removed between the read above and this write.
      if (removed.reason === "not-found") throw new PostNotFoundError(`post '${input.id}' was not found`);
      throw new PostConflictError(`post '${input.id}' changed while it was being deleted`);
    }
    return deps.repo.appendRevision({
      postId: post.id,
      workspaceId: post.workspaceId,
      seq: post.version,
      op: "delete",
      stateJson: post,
      actorId: input.actorId ?? SYSTEM_ACTOR_ID,
      delegatedByWorkspaceId: input.delegatedByWorkspaceId ?? null,
      delegatedById: input.delegatedById ?? null,
      recordedAt: post.updatedAt,
    });
  });

  await emitStatusTransitionEvent(deps.outbox, existing.status, "draft", post);

  return { post, revisionId, previousRevisionId };
}

export interface GetPostByIdRequired {
  deps: { repo: PostRepoPort };
  input: { workspaceId: UUID; id: UUID };
}

export interface GetPostBySlugRequired {
  deps: { repo: PostRepoPort };
  input: { workspaceId: UUID; slug: string };
}

export interface GetPostByIdOrSlugRequired {
  deps: { repo: PostRepoPort };
  input: { workspaceId: UUID; idOrSlug: string };
}

export interface GetPostOptional {}

export class PostNotFoundError extends Error {}
export class PostValidationError extends Error {}
export class PostConflictError extends Error {}
/**
 * Optimistic-concurrency rejection (2026-09-06) — `updatePost` was handed an
 * {@link UpdatePostInput.expectedVersion} that no longer matches the row's current
 * {@link PostRecord.version}, meaning another save landed between the caller reading the post and
 * submitting its edit. Before this guard existed that second save simply won, erasing the first
 * operator's document with no error raised anywhere.
 *
 * Extends {@link PostConflictError} deliberately, which is what makes the guard additive at every
 * existing call site: `sendPostUpdateError` (`server/inbound/admin-http/routes/posts/update.ts`),
 * its `pages/update.ts` twin and the `content_post_update` tool handler all already map a
 * `PostConflictError` onto 409 — the right status for this too — so a caller that has not been
 * updated still responds correctly, while one that wants to tell "slug taken" apart from "someone
 * else saved first" narrows on this subclass. It is deliberately NOT a `PostValidationError`,
 * matching `tool-registrations.ts`'s `isPostShapeRejection` rule: resending the identical input
 * cannot fix it, the caller has to reload the row first.
 *
 * Both versions travel as fields, not only inside the message, so a route can build a structured
 * envelope (and a client can offer "reload and reapply") without parsing prose.
 */
export class PostVersionConflictError extends PostConflictError {
  constructor(
    message: string,
    public readonly expectedVersion: number,
    public readonly currentVersion: number
  ) {
    super(message);
  }
}

/**
 * SPEC-002 api.spec.md `POST_CREATE`/`PAGE_CREATE` §4 documented `bodyJson` default —
 * an empty TipTap doc, not `{}` (the pre-fix behavior asserted the wrong shape).
 *
 * Exported (SPEC-047/ADR-056) so `repo.sqlite.ts`'s `toRecord` has one shared placeholder to fill
 * `PostRecord.bodyJson` with for an `"html"`-format row's `NULL` `body_json` column, rather than a
 * second, driftable empty-doc literal — see that file's own comment for why a placeholder is
 * correct there (an `"html"` row's `bodyJson` is never read by anything that branches on
 * `bodyFormat` correctly).
 */
export const DEFAULT_BODY_JSON: JsonObject = { type: "doc", content: [] };

/** {@link CreatePostInput.actorId}'s fallback — an omitted actor is attributed to the system
 *  rather than left blank, so `post_revisions.actor_id NOT NULL` never has a "whose write was
 *  this" gap. */
export const SYSTEM_ACTOR_ID = "system";

/**
 * SPEC-005 CIC U-004-B1/F1 — runs the optional `content.entry.beforeSave` hook and resolves to the
 * patch, or throws. The no-op default (`{}` when no hook is wired) is what keeps the zero-plugin
 * path byte-for-byte unchanged.
 *
 * **This must be awaited BEFORE the final `PostRecord` is constructed and BEFORE the single
 * `deps.repo.save()` call.** If it throws, the throw propagates out of `createPost`/`updatePost`
 * untouched and `repo.save()` is never reached — no partial write, no change set (BR-06/BR-07,
 * EC-10). Do not move this call below `repo.save()`, and do not wrap it in a `try` that swallows.
 */
async function runBeforeSaveHook(
  hook: BeforeSaveHookPort | undefined,
  draft: BeforeSaveEntryDraft
): Promise<JsonObject> {
  if (!hook) return {};
  return hook(draft);
}

/**
 * Namespace-level merge of the hook's patch onto whatever `ext` the entry already carried.
 *
 * Merging (rather than replacing) is what makes INV-03 hold: a plugin that has since been disabled
 * or uninstalled contributes no patch, so its namespace simply survives untouched instead of being
 * wiped by the next save. Returns `undefined` — not `{}` — when nothing has ever been written, so
 * an entry with no contributing plugin carries no `ext` at all (AC-14).
 */
function mergeExt(existingExt: JsonObject | undefined, patch: JsonObject): JsonObject | undefined {
  const merged: JsonObject = { ...(existingExt ?? {}), ...patch };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** api.spec.md §4 / behavior.spec.md §4: `title` maxLength. Exported so `agent-tools.ts`'s
 * published `inputSchema` can reuse the same bound instead of a second, driftable copy. */
export const MAX_TITLE_LENGTH = 200;

/** api.spec.md §4 / behavior.spec.md §4: caller-supplied `slug` maxLength. Exported for the same
 * reason as {@link MAX_TITLE_LENGTH}. */
export const MAX_SLUG_LENGTH = 120;

/** Shared slug-format rule, exported so `agent-tools.ts` can publish the identical pattern rather
 * than a hand-copied regex literal that could silently drift from what `updatePost`/`createPost`
 * actually enforce. */
export const SLUG_FORMAT_PATTERN = /^[a-z0-9-]+$/;

/**
 * Content-owned homepage — the literal root slug a `kind: "page"` row may claim so `GET /`
 * (`server/inbound/public-http/routes/site/pages.ts`) renders it instead of always falling back to
 * the active theme's own `index.html`. Deliberately NOT folded into {@link SLUG_FORMAT_PATTERN}
 * itself — that would loosen the regex to accept a slash generally, which is not the intended shape.
 * This is a single exact-string exception, checked ahead of the regex by {@link resolveExplicitSlug}
 * and `validateUpdatePostInput`, and it is gated on `kind`: a `kind: "post"` row requesting it is
 * rejected with the SAME "slug must use lowercase letters, numbers, and dashes" message the format
 * check already raises for any other malformed slug — a Post's claim on `/` is simply never a valid
 * slug for a Post, not a distinct error case needing its own message. The fallback-to-theme behavior
 * when no page claims it is what keeps this reversible: see the route handler's own doc.
 */
export const ROOT_SLUG = "/";

/**
 * behavior.spec.md BR-02/BR-03 — slugs a request may never claim outright (`createPost`'s
 * explicit-slug path rejects these with `VALIDATION_ERROR`; a *derived* slug landing on one of
 * these is a separate, not-yet-implemented BR-02 suffixing rule — see this file's `slugify`
 * call site for the disclosed gap).
 */
const RESERVED_SLUGS: ReadonlySet<string> = new Set(["admin", "api"]);

/** Shared slug-format rule (`updatePost` and `createPost`'s explicit-slug path both apply it — same rule, one source of truth). */
function isValidSlugFormat(slug: string): boolean {
  return SLUG_FORMAT_PATTERN.test(slug);
}

/** Shared status-enum rule (`updatePost` and `createPost`'s explicit-status path both apply it). */
function isValidPostStatus(status: unknown): status is PostStatus {
  return status === "draft" || status === "published";
}

/** behavior.spec.md BR-02/BR-03 reserved-word rule — see `RESERVED_SLUGS`'s doc for scope. */
function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/** Pure, pre-repo-access fields `resolveCreateFields` computes from a `createPost` input, once validated. */
interface ResolvedCreateFields {
  title: string;
  /** `undefined` when the caller omitted `slug` — `createPost` derives one in that case. */
  explicitSlug: string | undefined;
  bodyJson: JsonObject;
  status: PostStatus;
  bodyFormat: PostBodyFormat;
  bodyHtml: string | null;
}

/**
 * SPEC-047/ADR-056 Decision 3 / CIC-3 — the `kind` -> `bodyFormat` write-chokepoint gate,
 * shared by `resolveCreateFields` and `updatePost`. Deliberately takes NO input: neither
 * `CreatePostInput` nor `UpdatePostInput` has a `bodyFormat`/`bodyHtml` field at all, so there is
 * nothing to read, let alone trust, from a caller — `createPost`/`updatePost` can produce only
 * `(bodyFormat: "doc", bodyHtml: null)`, by construction, not by rejecting a bad value after the
 * fact. AC-1 ("a Post can never carry body_format: 'html'") holds even against a caller that
 * smuggles those properties onto the input object past the type system (a raw JS caller, or one
 * forwarding untyped `req.body`) — this function never looks at `input` in the first place.
 *
 * `bodyFormat: "html"` is a real, valid `PostRecord` shape (a Page written by
 * `PagesHtmlDocumentStore`, `features/pages/html-document-store.sqlite.ts`), but that adapter writes directly to
 * the `posts` row and never calls `createPost`/`updatePost` — see `PostRecord.bodyFormat`'s doc.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function resolveBodyFields(): { bodyFormat: PostBodyFormat; bodyHtml: string | null } {
  return { bodyFormat: "doc", bodyHtml: null };
}

/**
 * `updatePost`'s body resolution — **preserves** the row's existing format instead of asserting
 * `"doc"` the way {@link resolveBodyFields} does for a create.
 *
 * ## The bug this exists to fix
 *
 * `updatePost` used to spread `resolveBodyFields()` directly, forcing `(bodyFormat: "doc",
 * bodyHtml: null)` onto every update. The reasoning recorded at the call site was sound as far as
 * it went — the *body* of an html Page is written only by `PagesHtmlDocumentStore` — but it did not
 * account for the fact that an html Page's **title, slug and status** have nowhere else to be
 * edited. `pages/update.ts` is the only route that can change them, and it goes through here. The
 * result: saving a title on a bespoke-HTML Page silently reverted it to `doc` format and discarded
 * `body_html` entirely — the whole generated page, gone, with a 200 response and no warning.
 *
 * It was unreachable until a Page could become `"html"` in the first place
 * (`PagesHtmlDocumentStore.ensureHtmlFormat`), which is why it had never fired.
 *
 * ## What it does instead
 *
 * - A `"doc"` row updates exactly as before — `resolveBodyFields()`'s guarantee is unchanged, and a
 *   Post (always `"doc"`, since nothing can make one `"html"`) is untouched by this function's
 *   existence. AC-1 still holds by construction.
 * - An `"html"` row keeps its format and its `body_html`, and ignores `input.bodyJson` — an html
 *   Page has no Tiptap document, and accepting one here is how the two body columns would end up
 *   populated at once. The carried-over `bodyJson` is the placeholder `repo.sqlite.ts`'s `toRecord`
 *   substitutes for the null column; `save()` maps it back to null on the way down, so the pair
 *   stays inverse and the table's CHECK constraint holds.
 *
 * Neither branch reads a caller-supplied `bodyFormat`/`bodyHtml` — `UpdatePostInput` still has no
 * such field, so a caller still cannot convert a row's format through this path. Conversion remains
 * `PagesHtmlDocumentStore.ensureHtmlFormat`'s alone.
 *
 * @complexity O(1).
 */
function resolveUpdateBodyFields(
  existing: PostRecord,
  inputBodyJson: JsonObject
): { bodyFormat: PostBodyFormat; bodyHtml: string | null; bodyJson: JsonObject } {
  if (existing.bodyFormat === "html") {
    return { bodyFormat: "html", bodyHtml: existing.bodyHtml, bodyJson: existing.bodyJson };
  }
  return { ...resolveBodyFields(), bodyJson: inputBodyJson };
}

/**
 * Validates and normalizes `createPost`'s title. api.spec.md `title` maxLength bound
 * ({@link MAX_TITLE_LENGTH}); an empty/whitespace-only title is NOT a hard failure on create
 * (unlike `updatePost`) — it defaults to "Untitled", certified by "createPost defaults an empty
 * title to 'Untitled'" in post.test.ts.
 */
function resolveTitle(input: CreatePostInput): string {
  const trimmedTitle = input.title.trim();
  if (trimmedTitle.length > MAX_TITLE_LENGTH) {
    throw new PostValidationError(`title must be ${MAX_TITLE_LENGTH} characters or fewer`);
  }
  return trimmedTitle || "Untitled";
}

/**
 * Validates and normalizes `createPost`'s caller-supplied `slug`, in behavior.spec.md BR-03's
 * documented order (format, then length, then reserved-word). Returns `undefined` — not a
 * derived slug — when the caller omitted `slug`, so `createPost` knows to derive one itself.
 */
function resolveExplicitSlug(input: CreatePostInput): string | undefined {
  if (input.slug === undefined) return undefined;
  const explicitSlug = input.slug.trim().toLowerCase();
  // `input.kind` defaults to `"post"` the same way `createPost`'s own record construction does
  // (see this file's `kind: input.kind ?? "post"`) — a create request that omits `kind` entirely
  // must be gated exactly like an explicit `kind: "post"` one, not treated as unopinionated.
  const kind: PostKind = input.kind ?? "post";
  const validFormat = explicitSlug === ROOT_SLUG ? kind === "page" : isValidSlugFormat(explicitSlug);
  if (!validFormat) {
    throw new PostValidationError("slug must use lowercase letters, numbers, and dashes");
  }
  if (explicitSlug.length > MAX_SLUG_LENGTH) {
    throw new PostValidationError(`slug must be ${MAX_SLUG_LENGTH} characters or fewer`);
  }
  // SPEC-002 REQ-04/AC-04 — a PROVIDED slug equal to a reserved word is a hard failure (BR-03
  // step 3); a DERIVED slug landing on a reserved word is a different, not-yet-implemented rule
  // (BR-02 suffixing) — see `RESERVED_SLUGS`'s doc.
  if (isReservedSlug(explicitSlug)) {
    throw new PostValidationError(`slug '${explicitSlug}' is reserved`);
  }
  return explicitSlug;
}

/** Validates and normalizes `createPost`'s caller-supplied `bodyJson`, defaulting to
 * {@link DEFAULT_BODY_JSON} when the caller omits it. */
function resolveCreateBodyJson(input: CreatePostInput): JsonObject {
  if (input.bodyJson !== undefined && !isJsonObject(input.bodyJson)) {
    throw new PostValidationError("bodyJson must be a JSON object");
  }
  return input.bodyJson !== undefined ? input.bodyJson : DEFAULT_BODY_JSON;
}

/** Validates and normalizes `createPost`'s caller-supplied `status`, defaulting to `"draft"`
 * when the caller omits it. */
function resolveCreateStatus(input: CreatePostInput): PostStatus {
  if (input.status !== undefined && !isValidPostStatus(input.status)) {
    throw new PostValidationError("status must be 'draft' or 'published'");
  }
  return input.status !== undefined ? input.status : "draft";
}

/**
 * Validates and normalizes all of `createPost`'s caller-supplied fields, in behavior.spec.md
 * BR-03's documented order (first failure wins): title bound, then slug format/length/
 * reserved-word (skipped when `slug` is omitted), then `bodyJson` shape, then `status` enum —
 * each delegated to its own single-field validator above so every rule stays independently
 * testable without a repo double. `slug`'s absence is signaled by `explicitSlug: undefined` so
 * `createPost` knows to derive one.
 *
 * Split out from `createPost` (Code Review, 2026-07-28; further split into per-field validators
 * 2026-08-20) so the repo-touching orchestration (uniqueness check / derivation loop / save)
 * reads as one job and this pure validation reads as another.
 *
 * @complexity O(1) — a fixed sequence of length/format/set-membership checks, no loops.
 */
function resolveCreateFields(input: CreatePostInput): ResolvedCreateFields {
  const title = resolveTitle(input);
  const explicitSlug = resolveExplicitSlug(input);
  const bodyJson = resolveCreateBodyJson(input);
  const status = resolveCreateStatus(input);
  return { title, explicitSlug, bodyJson, status, ...resolveBodyFields() };
}

/**
 * Creates a post. Caller-supplied `slug`/`bodyJson`/`status` are validated (via
 * `resolveCreateFields`) and used when present (SPEC-002 api.spec.md §4); each falls back to its
 * documented default when absent:
 * - `slug` absent → derived from `title`, disambiguated on collision (existing behavior).
 * - `slug` present → validated (format, length, reserved-word) the same way `updatePost` validates
 *   format, then checked for uniqueness (`PostConflictError` on collision, mirroring `PAGE_UPDATE`'s
 *   `SLUG_CONFLICT` mapping at the route layer — no new conflict-handling invented here).
 * - `bodyJson` absent → `DEFAULT_BODY_JSON`; present → validated as a JSON object (`isJsonObject`,
 *   the same check `updatePost` applies; this codebase has no deeper TipTap schema validation
 *   anywhere else, per `features/entries/write-service.ts`'s disclosure, so none is invented here).
 * - `status` absent → `"draft"`; present → validated against the same `draft`/`published` enum
 *   `updatePost` enforces.
 *
 * All validation runs before any repository access (fail fast, write nothing on a bad request).
 *
 * @complexity O(n) where n is the derived-slug suffix search depth (bounded at 999 by BR-02,
 * unenforced here — see this file's disclosed gap on suffix-exhaustion handling); O(1) on the
 * explicit-slug path (one uniqueness lookup).
 * @overallScore 100
 */
export async function createPost(
  required: CreatePostRequired,
  _optional: CreatePostOptional = {}
): Promise<{ post: PostRecord; revisionId: string; previousRevisionId: string | null }> {
  const { deps, input } = required;
  const { title, explicitSlug, bodyJson, status, bodyFormat, bodyHtml } = resolveCreateFields(input);

  let slug: string;
  if (explicitSlug !== undefined) {
    const duplicate = await deps.repo.findBySlug({ workspaceId: input.workspaceId, slug: explicitSlug });
    if (duplicate) {
      throw new PostConflictError(`slug '${explicitSlug}' already exists`);
    }
    slug = explicitSlug;
  } else {
    const base = slugify(title) || "untitled";
    slug = base;
    let suffix = 1;
    while (await deps.repo.findBySlug({ workspaceId: input.workspaceId, slug })) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  // CIC U-004: the hook resolves (or throws) BEFORE the record is built and BEFORE the single
  // repo.save() below. A new entry has no prior ext, so the draft's ext starts empty.
  const extPatch = await runBeforeSaveHook(deps.beforeSaveHook, {
    id: input.id,
    workspaceId: input.workspaceId,
    title,
    slug,
    status,
    bodyJson,
    ext: {},
  });
  const ext = mergeExt(undefined, extPatch);

  // One clock read, reused for both `updatedAt` and `createdAt` below — a second `nowIso()` call
  // would risk the pair disagreeing by a tick and misrepresenting "created" as happening after
  // "last updated" on the very row that just created it.
  const now = deps.clock.nowIso();
  const post: PostRecord = {
    id: input.id,
    workspaceId: input.workspaceId,
    title,
    slug,
    bodyJson,
    bodyFormat,
    bodyHtml,
    status,
    kind: input.kind ?? "post",
    updatedAt: now,
    version: 1,
    // Authorship attribution (2026-09-18) — reuses the SAME `actorId` the revision ledger append
    // below already threads through; deliberately NO `?? SYSTEM_ACTOR_ID` fallback (unlike that
    // ledger append), so an actor-less call stores the honest `null` here instead of a fabricated
    // value. See `PostRecord.createdByPrincipalId`'s own doc for the full contract.
    createdByPrincipalId: input.actorId ?? null,
    createdAt: now,
    ...(ext !== undefined ? { ext } : {}),
  };

  // The record write and its revision-ledger append are one atomic unit (see
  // `PostRepoPort.transaction`'s own doc) — a revision must never be recorded for a save that
  // didn't really land, and a save must never land unaccompanied by its revision.
  const { id: revisionId, previousId: previousRevisionId } = await deps.repo.transaction(async () => {
    await deps.repo.save(post);
    return deps.repo.appendRevision({
      postId: post.id,
      workspaceId: post.workspaceId,
      seq: post.version,
      op: "create",
      stateJson: post,
      actorId: input.actorId ?? SYSTEM_ACTOR_ID,
      delegatedByWorkspaceId: input.delegatedByWorkspaceId ?? null,
      delegatedById: input.delegatedById ?? null,
      recordedAt: post.updatedAt,
    });
  });
  // A brand-new record has no real prior status to read, so "draft" is used as the classifier's
  // baseline (never-published) — matching `classifyStatusTransition`'s own "not published ->
  // published" / "not published -> draft" rows exactly, the latter correctly resolving to `null`
  // (no event) when the caller created a plain draft, same as it always has.
  if (deps.outbox) {
    await emitStatusTransitionEvent(deps.outbox, "draft", post.status, post);
  }
  return { post, revisionId, previousRevisionId };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validates and normalizes `updatePost`'s caller-supplied `title`/`slug`, and validates
 * `bodyJson`/`status` in place, in behavior.spec.md's documented order (first failure wins):
 * title, then slug format, then `bodyJson` shape, then `status` enum — the same ordering
 * discipline `resolveCreateFields`'s per-field validators follow for `createPost`.
 */
function validateUpdatePostInput(
  input: UpdatePostInput,
  existing: PostRecord
): { title: string; slug: string } {
  const title = input.title.trim();
  const slug = input.slug.trim().toLowerCase();

  if (!title) throw new PostValidationError("title is required");
  // `existing.kind` is immutable (PostKind's own doc: "Fixed at creation; v1 has no post<->page
  // conversion path"), so the row's real kind — not any caller-supplied value, `UpdatePostInput`
  // carries none — is what gates the same root-slug exception `resolveExplicitSlug` applies on create.
  const validFormat = slug === ROOT_SLUG ? existing.kind === "page" : isValidSlugFormat(slug);
  if (!validFormat) {
    throw new PostValidationError("slug must use lowercase letters, numbers, and dashes");
  }
  // Required for a `"doc"` row, meaningless for an `"html"` one. A bespoke-HTML Page has no Tiptap
  // document at all, so demanding one here would make its title, slug and status permanently
  // un-editable — the only way to change them is this function, and the caller has no Tiptap body
  // to send. `resolveUpdateBodyFields` ignores `input.bodyJson` on that branch anyway; this check
  // is what lets a caller legitimately omit it rather than inventing a dummy document to get past
  // a validation that does not apply to its content type.
  if (existing.bodyFormat !== "html" && !isJsonObject(input.bodyJson)) {
    throw new PostValidationError("bodyJson must be a JSON object");
  }
  if (!isValidPostStatus(input.status)) {
    throw new PostValidationError("status must be 'draft' or 'published'");
  }

  return { title, slug };
}

/** Enforces the same slug-uniqueness rule `createPost`'s explicit-slug path applies — a slug
 * already claimed by a DIFFERENT record is a conflict; claiming your own current slug is not. */
async function assertSlugAvailableForUpdate(
  repo: PostRepoPort,
  workspaceId: UUID,
  slug: string,
  id: UUID
): Promise<void> {
  const duplicate = await repo.findBySlug({ workspaceId, slug });
  if (duplicate && duplicate.id !== id) {
    throw new PostConflictError(`slug '${slug}' already exists`);
  }
}

/**
 * Optimistic-concurrency compare-and-set for `updatePost` (2026-09-06).
 *
 * A no-op when the caller sent no `expectedVersion` — that is what keeps the guard opt-in and this
 * whole change non-breaking. See {@link UpdatePostInput.expectedVersion} for the contract.
 *
 * Called BEFORE field validation and the slug-uniqueness check, unlike every other precondition in
 * `updatePost`: once the caller's basis is stale, its title, slug and body all describe a row that
 * no longer exists as it was read, so reporting a field problem in content the caller is about to
 * have to re-enter anyway would answer the wrong question. Called AFTER the not-found check so a
 * missing or trashed row still reads as a plain 404, rather than disclosing through a version
 * number that the id exists.
 */
function assertExpectedVersion(existing: PostRecord, expectedVersion: number | undefined): void {
  if (expectedVersion === undefined) return;
  if (expectedVersion === existing.version) return;
  throw new PostVersionConflictError(
    versionConflictMessage(existing.id, expectedVersion, existing.version),
    expectedVersion,
    existing.version
  );
}

/** One definition of the conflict wording, because the guard now reports from two places — the
 *  cheap up-front compare above and the authoritative post-write rejection in
 *  {@link persistUpdatedPost} — and a client that has to tell them apart has a worse bug than the
 *  one this guard closes. @complexity O(1). */
function versionConflictMessage(id: UUID, expectedVersion: number, currentVersion: number): string {
  return `post '${id}' was modified by another save (expected version ${expectedVersion}, current version ${currentVersion})`;
}

/**
 * The "set" half of `updatePost`'s compare-and-set — the write itself, predicated on the same
 * version the caller's basis claimed.
 *
 * `assertExpectedVersion` above is now only a fast, well-worded rejection for a basis that was
 * ALREADY stale when the request arrived; it cannot speak for the state of the row two awaits later
 * (fable bugs audit C01). This is where the guarantee actually lives: the version predicate travels
 * into the UPDATE, so a row another writer won during the slug check or the plugin hook rejects
 * this write outright instead of absorbing it.
 *
 * Unversioned callers keep the pre-existing unconditional `save()` — `expectedVersion` is opt-in by
 * construction (see {@link UpdatePostInput.expectedVersion}) and this change does not move that
 * line. What it fixes is callers who DID opt in and were being told they were protected.
 *
 * The re-read on the rejection path is what lets the error name the real current version rather
 * than "some other version"; it runs only on the conflict path, never on the happy one. A row that
 * has vanished (or been trashed) since the compare reports as not-found — the same answer the
 * caller would have received had it arrived a moment later — rather than a conflict against a
 * version that no longer exists.
 *
 * @complexity O(1) queries: one conditional UPDATE, plus one read only when it is rejected.
 */
async function persistUpdatedPost(
  repo: PostRepoPort,
  post: PostRecord,
  expectedVersion: number | undefined
): Promise<void> {
  if (expectedVersion === undefined) {
    await repo.save(post);
    return;
  }

  const { applied } = await repo.saveIfVersion({ record: post, ifVersion: expectedVersion });
  if (applied) return;

  const current = await repo.findById({ workspaceId: post.workspaceId, id: post.id });
  if (!current || isTrashed(current)) throw new PostNotFoundError(`post '${post.id}' was not found`);
  throw new PostVersionConflictError(
    versionConflictMessage(post.id, expectedVersion, current.version),
    expectedVersion,
    current.version
  );
}

/**
 * Assembles the `PostRecord` `updatePost` will persist, once validation, the uniqueness check,
 * and the before-save hook have all already run.
 *
 * `ext` is destructured off `existing` so the conditional spread below is the single source of
 * truth for whether the saved record carries one at all (a stale `ext: {}` surviving the spread
 * would violate AC-14).
 */
function buildUpdatedPost(
  existing: PostRecord,
  input: UpdatePostInput,
  fields: { title: string; slug: string },
  ext: JsonObject | undefined,
  now: string
): PostRecord {
  const { ext: _priorExt, ...carriedOver } = existing;
  return {
    ...carriedOver,
    title: fields.title,
    slug: fields.slug,
    // SPEC-047/ADR-056 CIC-3 — forced explicitly rather than left to `...carriedOver`, for the same
    // reason `createPost` forces it: `UpdatePostInput` has no `bodyFormat`/`bodyHtml` field to even
    // read, so no caller can convert a row's format through this path. What it does NOT do any more
    // is flatten an html Page back to `doc` on a title edit — see `resolveUpdateBodyFields`'s doc
    // for the data-loss bug that behavior caused once html Pages became reachable.
    ...resolveUpdateBodyFields(existing, input.bodyJson),
    status: input.status,
    updatedAt: now,
    version: existing.version + 1,
    ...(input.templateChoice !== undefined ? { templateChoice: input.templateChoice } : {}),
    ...(input.overridesThemePage !== undefined ? { overridesThemePage: input.overridesThemePage } : {}),
    ...(ext !== undefined ? { ext } : {}),
  };
}

export async function updatePost(
  required: UpdatePostRequired,
  _optional: UpdatePostOptional = {}
): Promise<{ post: PostRecord; revisionId: string; previousRevisionId: string | null }> {
  const { deps, input } = required;
  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  // A trashed row is not-found for editing purposes — indistinguishable from a missing id, the same
  // way `pages/update.ts` treats a kind mismatch. Restore it (revert the delete change set) before
  // editing it; there is no edit-through-the-trash path.
  if (!existing || isTrashed(existing)) throw new PostNotFoundError(`post '${input.id}' was not found`);
  assertExpectedVersion(existing, input.expectedVersion);

  const { title, slug } = validateUpdatePostInput(input, existing);
  await assertSlugAvailableForUpdate(deps.repo, input.workspaceId, slug, input.id);

  // CIC U-004: the hook resolves (or throws) BEFORE the record is built and BEFORE the single
  // repo.save() below. The draft the filters see carries the entry's already-written ext (every
  // other plugin's namespaces), per REQ-05.
  const extPatch = await runBeforeSaveHook(deps.beforeSaveHook, {
    id: existing.id,
    workspaceId: input.workspaceId,
    title,
    slug,
    status: input.status,
    // The body the save will actually persist, not the one the caller sent — on an html Page those
    // differ, and a plugin filter reasoning about an entry it is about to see saved must be shown
    // the former.
    bodyJson: existing.bodyFormat === "html" ? existing.bodyJson : input.bodyJson,
    ext: (existing.ext ?? {}) as Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  });
  const ext = mergeExt(existing.ext, extPatch);

  const post = buildUpdatedPost(existing, input, { title, slug }, ext, deps.clock.nowIso());

  // The record write and its revision-ledger append are one atomic unit (see
  // `PostRepoPort.transaction`'s own doc). A conflict rejection from `persistUpdatedPost` (nothing
  // written) still propagates out of this `transaction()` call correctly — its `catch` rolls back
  // (a no-op when nothing landed) and rethrows unchanged, so `PostVersionConflictError`/
  // `PostNotFoundError` reach the caller exactly as they did before this change.
  const { id: revisionId, previousId: previousRevisionId } = await deps.repo.transaction(async () => {
    await persistUpdatedPost(deps.repo, post, input.expectedVersion);
    return deps.repo.appendRevision({
      postId: post.id,
      workspaceId: post.workspaceId,
      seq: post.version,
      op: "update",
      stateJson: post,
      actorId: input.actorId ?? SYSTEM_ACTOR_ID,
      delegatedByWorkspaceId: input.delegatedByWorkspaceId ?? null,
      delegatedById: input.delegatedById ?? null,
      recordedAt: post.updatedAt,
    });
  });
  await emitStatusTransitionEvent(deps.outbox, existing.status, post.status, post);

  return { post, revisionId, previousRevisionId };
}

/** A trashed row is "not public" whatever its stored `status` still says — the same framing
 *  {@link deletePost} applies when it classifies a trash as a move to `"draft"`. @complexity O(1). */
function publicFacingStatus(post: PostRecord): PostStatus {
  return isTrashed(post) ? "draft" : post.status;
}

/**
 * Drops whatever index row some other owner wrote when this post's removal was recorded.
 *
 * Structurally typed and injected, exactly like {@link RemovePostFn}, so this domain still imports
 * nothing from the module that owns that index. A no-op for an entity that was never indexed, so a
 * caller that cannot tell never has to decide.
 */
export type ForgetRemovedPostFn = (required: { workspaceId: string; id: string }) => Promise<void>;

export interface RestorePostForwardRequired {
  deps: {
    repo: PostRepoPort;
    clock: ClockPort;
    outbox: OutboxPort;
    /**
     * REQUIRED, not optional, and required at EVERY call site including the ones that only ever
     * undo an update: an optional dependency is how a compensation ends up wired at three call
     * sites out of four. Whether it actually fires is decided here, from the two records, not by
     * the caller remembering which kind of write it is undoing.
     */
    forgetRemoved: ForgetRemovedPostFn;
  };
  input: {
    /** The exact pre-`execute` record, as the mutation's own `captureInverse` read it. */
    prior: PostRecord;
    actorId?: string;
    delegatedByWorkspaceId?: UUID | null;
    delegatedById?: UUID | null;
  };
}

export interface RestorePostForwardOptional {}

/**
 * The compensating undo every `CommandMutation.rollback` over a post calls — one definition of
 * "put this post back" for the command gateway's unit-of-work guarantee (SPEC-001
 * REQ-01 / EC-08 / AC-17, INV-01: no mutation survives without a change-set record).
 *
 * Restores the prior state as a NEW version instead of rewriting the row in place, pairs that write
 * with its own `"restore"` revision inside one {@link PostRepoPort.transaction} — the same atomic
 * pairing `createPost`/`updatePost`/`deletePost` use — and then announces the status transition the
 * undo actually is, so a subscriber that already saw the undone write's event is told the truth
 * rather than left believing it.
 *
 * ## Deliberate deviation from `@jini-ai/cms` `core/commands/command.ts:77-86`
 *
 * That contract (line 81, the clause the 2026-09-20 peer review cites as `command.ts:82`) requires
 * `rollback` to restore "the entity to its exact pre-`execute` state (verbatim, **including
 * `version`**)". This function does not: the restored row carries
 * `current.version + 1`, so an undo moves the version FORWARD.
 *
 * Why this path departs from it: the forward write is not a row write. `updatePost`, `deletePost`
 * and `importPostEntity` each write the row and append an immutable `post_revisions` row as one
 * transaction, and {@link PostRepoPort.appendRevision} is append-only by contract — the revision
 * the undone write appended cannot be removed. A verbatim restore therefore puts `version` back
 * onto a `seq` that ghost revision already occupies, and `post_revisions` carries only
 * `idx_post_revisions_workspace_post` (`platform/db/schema.ts`) — an INDEX, not a unique constraint
 * — so the next real write silently appends a SECOND row at that same `seq` rather than erroring.
 * The ledger would then record two different states under one sequence number with nothing to tell
 * a reader which one the row ever actually held. Restoring forward keeps every `seq` mapped to
 * exactly one state, and makes the undo a recorded event instead of an erasure.
 * (sol peer review 2026-09-20, High finding 3; recorded in
 * `ADS-memory/reports/2026-09-20-post-rollback-forward-restore.md`.)
 *
 * What would have to change to remove the deviation: the transactional path `command.ts:82-83`
 * already anticipates — "On the SQLite adapter (RT-004) a real transaction replaces this and `rollback`
 * becomes a no-op" — enrolling the feature write, its revision AND the change-set insert in ONE
 * transaction. With that in place nothing is ever appended that needs undoing, and this function
 * plus all of its call sites can be deleted outright rather than reconciled.
 *
 * Callers must pass the record their `captureInverse` captured, never a freshly re-read one: a
 * re-read row is the post-`execute` state, so restoring it restores nothing.
 *
 * ## Undoing a trash also forgets its index row
 *
 * `deletePost` writes the trash marker AND an index row through {@link DeletePostDeps.remove}, as
 * one transaction. Clearing the marker here without dropping that row leaves a live, published post
 * listed for permanent deletion by whatever screen reads the index — so when (and only when) the
 * write being undone was a trash, {@link ForgetRemovedPostFn} runs inside the same transaction as
 * the restore. This is a compensation rather than a prevention because the failure it answers is
 * the change-set insert failing AFTER the delete transaction committed; enrolling that insert in
 * the delete's transaction would remove the need for this function entirely (see the deviation note
 * above), and is the strictly better fix whenever the gateway gains a transactional path.
 *
 * @returns the restored record and its revision id, or `null` when there is nothing to compensate:
 * the row has since been removed, the write never landed (`current.version <= prior.version`), or
 * another writer moved the row on while this compensation was being assembled. Clobbering that
 * writer would itself be an unrecorded mutation — the exact failure INV-01 exists to prevent — so
 * this stands down instead of forcing the write.
 * @complexity O(r) over one post's revision ledger (a single `listRevisions` read, to name the
 * revision being restored from), plus one conditional row write, one append, and — only when the
 * undone write was a trash — one index-row delete. Failure path only.
 */
export async function restorePostForward(
  required: RestorePostForwardRequired,
  _optional: RestorePostForwardOptional = {}
): Promise<{ post: PostRecord; revisionId: string } | null> {
  const { deps, input } = required;
  const { prior } = input;

  const current = await deps.repo.findById({ workspaceId: prior.workspaceId, id: prior.id });
  if (!current || current.version <= prior.version) return null;

  const restored: PostRecord = { ...prior, updatedAt: deps.clock.nowIso(), version: current.version + 1 };
  // The write being undone was a trash exactly when the row is trashed NOW and was not before.
  // Read from the two records rather than taken from the caller, so an update rollback cannot
  // forget an index row that a trash it knows nothing about legitimately owns.
  const undoesATrash = isTrashed(current) && !isTrashed(prior);

  // `restoredFrom` is what makes a `"restore"` row auditable — without it the ledger says an undo
  // happened but not back to what. The ledger reads oldest-first, so the state being restored is
  // the LAST row at the prior version (a pre-fix rollback may have left more than one there).
  const ledger = await deps.repo.listRevisions({ workspaceId: prior.workspaceId, postId: prior.id });
  const restoredFrom = [...ledger].reverse().find((row) => row.seq === prior.version)?.id ?? null;

  const revisionId = await deps.repo.transaction(async () => {
    // Conditional on the version this compensation was assembled against, not unconditional: a
    // writer that landed in between owns the row now, and overwriting it would replace one
    // unrecorded mutation with another.
    const { applied } = await deps.repo.saveIfVersion({ record: restored, ifVersion: current.version });
    if (!applied) return null;
    const appended = await deps.repo.appendRevision({
      postId: restored.id,
      workspaceId: restored.workspaceId,
      seq: restored.version,
      op: "restore",
      stateJson: restored,
      actorId: input.actorId ?? SYSTEM_ACTOR_ID,
      delegatedByWorkspaceId: input.delegatedByWorkspaceId ?? null,
      delegatedById: input.delegatedById ?? null,
      restoredFrom,
      recordedAt: restored.updatedAt,
    });
    // Inside the transaction, not after it: on SQLite both writes run on the one connection this
    // transaction already opened, so the marker and the index row move together or not at all. A
    // compensation that can itself half-fail is not a compensation.
    if (undoesATrash) await deps.forgetRemoved({ workspaceId: restored.workspaceId, id: restored.id });
    return appended.id;
  });
  if (revisionId === null) return null;

  await emitStatusTransitionEvent(
    deps.outbox,
    publicFacingStatus(current),
    publicFacingStatus(restored),
    restored
  );

  return { post: restored, revisionId };
}

/**
 * ADR-PIPE-008 Decision §5 / INV-010 — the 4-row status-transition table,
 * certified in isolation by `post.transition-events.test.ts` (T004) before
 * `updatePost` (above) or any SEO-side subscription depends on it. Returns
 * `null` for the "no event" row (not-published -> not-published).
 *
 * SIGNATURE-CONVENTION SKIP (deliberate, not an oversight): this function's sole call site is
 * inside `updatePost` above, which a concurrent, separately-dispatched fix owns for an unrelated
 * bug (shape-mismatch handling) — converting this signature would require editing that call site
 * too, creating exactly the merge collision both dispatches were told to avoid. Independent of that
 * scheduling constraint, this is also a legitimate exemption on the merits: both parameters are the
 * same primitive union type (`PostStatus`), the function is a pure comparator (no optional/defaulted
 * field exists to justify a second `options` parameter), and it has exactly one caller in the whole
 * repo. Left as two positional params.
 */
export function classifyStatusTransition(
  previousStatus: PostStatus,
  nextStatus: PostStatus
): "entry.published" | "entry.updated" | "entry.unpublished" | null {
  const wasPublished = previousStatus === "published";
  const isPublished = nextStatus === "published";

  if (!wasPublished && isPublished) return "entry.published";
  if (wasPublished && isPublished) return "entry.updated";
  if (wasPublished && !isPublished) return "entry.unpublished";
  return null;
}

/**
 * Shared status-transition-event emitter for `deletePost` and `updatePost` — computes the event
 * name via {@link classifyStatusTransition} and enqueues it only when one applies (the "no event"
 * row returns `null`, and this is then a no-op). `nextStatus` is a separate parameter from
 * `post.status` because `deletePost` needs to classify the transition as "moved to non-public"
 * (`"draft"`) without actually changing the trashed row's own stored `status` field.
 */
async function emitStatusTransitionEvent(
  outbox: OutboxPort,
  previousStatus: PostStatus,
  nextStatus: PostStatus,
  post: PostRecord
): Promise<void> {
  const transitionEventName = classifyStatusTransition(previousStatus, nextStatus);
  if (!transitionEventName) return;
  await outbox.enqueue({
    id: `${post.id}-${transitionEventName}-${post.version}`,
    name: transitionEventName,
    occurredAt: post.updatedAt,
    aggregateId: post.id,
    workspaceId: post.workspaceId,
    payload: { entryId: post.id, contentType: post.kind },
  });
}

/**
 * `content_post_list`'s own output cap (H3) — NOT consumed by `listAdminPosts`/`listAdminPages`
 * below, which stay unbounded exactly as the admin Posts/Pages list screens they mirror already are
 * (out of this fix's scope). Defined here, rather than in `tool-registrations.ts` (the handler) or
 * `agent-tools.ts` (the catalog/schema), purely so both of those can import the same numbers without
 * one importing the other — mirrors `search.ts`'s identical `DEFAULT_POST_SEARCH_LIMIT`/
 * `MAX_POST_SEARCH_LIMIT` placement for `content_post_search`.
 */
export const DEFAULT_POST_LIST_LIMIT = 50;
/** Ceiling `content_post_list`'s `limit` input clamps into — see {@link DEFAULT_POST_LIST_LIMIT}. */
export const MAX_POST_LIST_LIMIT = 200;

export interface ListPostsRequired {
  deps: { repo: PostRepoPort };
  input: { workspaceId: UUID };
}

/**
 * List all posts (`kind: "post"`) in a workspace for admin views (drafts included).
 * Excludes `kind: "page"` rows — Posts and Pages are separate admin-facing lenses
 * over the same table (see `PostKind` doc), so a page must not surface here and
 * a post must not surface in `listAdminPages`.
 */
export async function listAdminPosts(
  required: ListPostsRequired,
  _optional: GetPostOptional = {}
): Promise<{ posts: PostRecord[] }> {
  const posts = await required.deps.repo.list({ workspaceId: required.input.workspaceId });
  return { posts: posts.filter((post) => post.kind === "post" && !isTrashed(post)) };
}

/** List published posts for the public site. */
export async function listPublishedPosts(
  required: ListPostsRequired,
  _optional: GetPostOptional = {}
): Promise<{ posts: PostRecord[] }> {
  const posts = await required.deps.repo.list({ workspaceId: required.input.workspaceId });
  return { posts: posts.filter((post) => post.status === "published" && !isTrashed(post)) };
}

export interface ListPublishedPostPreviewsRequired {
  deps: { repo: PostRepoPort };
  input: { workspaceId: UUID; limit: number };
}

/**
 * Bounded published-post listing for the post-previews marker (`features/theme/static-render.ts`'s
 * `injectPostPreviewsEmbeds`, via `server/inbound/public-http/routes/site/pages.ts`'s
 * `resolvePostPreviewsForRender`). Thin wrapper over {@link PostRepoPort.listPublishedPreviews} —
 * see that method's own doc for why the bound and the `kind: "post"` filter both live in the query,
 * not here. The caller still owns member-visibility filtering (`filterVisiblePosts`, ADR-030 §4);
 * this function only returns what is PUBLISHED, not what the current visitor may see.
 */
export async function listPublishedPostPreviews(
  required: ListPublishedPostPreviewsRequired,
  _optional: GetPostOptional = {}
): Promise<{ posts: PostRecord[] }> {
  const posts = await required.deps.repo.listPublishedPreviews({
    workspaceId: required.input.workspaceId,
    limit: required.input.limit,
  });
  return { posts };
}

/** List all pages (`kind: "page"`) in a workspace for admin views (drafts included). */
export async function listAdminPages(
  required: ListPostsRequired,
  _optional: GetPostOptional = {}
): Promise<{ posts: PostRecord[] }> {
  const posts = await required.deps.repo.list({ workspaceId: required.input.workspaceId });
  return { posts: posts.filter((post) => post.kind === "page" && !isTrashed(post)) };
}

export async function getAdminPostById(
  required: GetPostByIdRequired,
  _optional: GetPostOptional = {}
): Promise<{ post: PostRecord }> {
  const { workspaceId, id } = required.input;
  const post = await required.deps.repo.findById({ workspaceId, id });
  // A trashed row 404s identically to a missing one — no existence leak, matching the
  // kind-mismatch rule `pages/get-by-id.ts` already applies.
  if (!post || isTrashed(post)) throw new PostNotFoundError(`post '${id}' was not found`);
  return { post };
}

export async function getPublishedPostBySlug(
  required: GetPostBySlugRequired,
  _optional: GetPostOptional = {}
): Promise<{ post: PostRecord }> {
  const { workspaceId } = required.input;
  const slug = required.input.slug.trim().toLowerCase();
  const post = await required.deps.repo.findBySlug({ workspaceId, slug });
  if (!post || isTrashed(post) || post.status !== "published") {
    throw new PostNotFoundError(`post '${slug}' was not found`);
  }
  return { post };
}

/**
 * Fetch a post/page row by id, but only when it is publicly visible — published and not trashed.
 * The `findById`-shaped, NON-THROWING counterpart to {@link getPublishedPostBySlug}: a resolver
 * consulting this on behalf of an id a THEME AUTHOR or CONTENT AUTHOR typed into an embed marker
 * (`{"type":"content","id":"..."}"`, `{"type":"post","id":"..."}"`) needs "not visible" and "does not
 * exist" to look identical and non-fatal (the REQ-27 never-throws contract every `widgets/
 * resolver-service.ts` resolver follows), not a thrown domain error a route 404s on — that is
 * `getPublishedPostBySlug`'s job, for a URL a VISITOR typed.
 *
 * Guards the exact hazard an id-addressable embed marker introduces that a slug-addressable ROUTE
 * never had: a route's slug lookup can only ever resolve to the one page a visitor asked for, but an
 * id embedded inside a marker can name ANY row in the table, including a draft or a trashed one — so
 * "fetch by id" alone is not the same operation as "fetch the row a route has already proven is
 * public". Filtering here, at the one seam every id-driven embed resolver goes through, is what keeps
 * a draft page's content off the public site when a `content`/`post` marker happens to reference it
 * (2026-08-11 unified-content-marker design doc, guard 2 — the highest-risk part of that change).
 *
 * @complexity O(1) — one indexed `findById` call plus two field comparisons, no iteration.
 */
export async function findPublishedPostById(
  required: GetPostByIdRequired,
  _optional: GetPostOptional = {}
): Promise<PostRecord | null> {
  const { workspaceId, id } = required.input;
  const post = await required.deps.repo.findById({ workspaceId, id });
  if (!post || isTrashed(post) || post.status !== "published") return null;
  return post;
}

/**
 * Admin-facing lookup that accepts either a record's slug or its id — same trash-blind 404 as
 * {@link getAdminPostById}. **Slug first, id second** (2026-08-11).
 *
 * The slug is the handle a human types, reads, and puts in a URL; the id is an implementation
 * detail they never chose. So the slug is what resolves, and the id lookup stays as the fallback
 * so every existing id-based bookmark keeps working. Same precedent as `ffc0f44`'s slug-first menu
 * marker resolution.
 *
 * This used to try the id first, justified by the claim that "an id and a slug never collide (ids
 * are opaque UUIDs)". Half of that is wrong and the other half is unverified. Ids are NOT uniformly
 * opaque: six rows carry seed-authored ids (`post-home`, `post-about`, `post-themes`, `post-plugins`,
 * `post-plugin-api`, `post-self-hosting`) in the same character space slugs occupy, alongside
 * `idGen.newId()`'s UUIDs. But **no id currently equals any slug** — checked, 2026-08-11 — so
 * nothing was silently resolving to the wrong row, and order was a correctness question only in the
 * hypothetical. Recorded precisely because the original comment stated its no-collision premise as
 * settled fact rather than as the assumption it was; do not restate it either way without re-checking.
 *
 * Order therefore decides one real thing today: which lookup a URL is resolved BY, and so which
 * handle the product treats as a record's identity. That is a product answer, not a defensive one.
 */
export async function getAdminPostByIdOrSlug(
  required: GetPostByIdOrSlugRequired,
  _optional: GetPostOptional = {}
): Promise<{ post: PostRecord }> {
  const { workspaceId, idOrSlug } = required.input;
  const bySlug = await required.deps.repo.findBySlug({ workspaceId, slug: idOrSlug.trim().toLowerCase() });
  const post = bySlug ?? (await required.deps.repo.findById({ workspaceId, id: idOrSlug }));
  if (!post || isTrashed(post)) throw new PostNotFoundError(`post '${idOrSlug}' was not found`);
  return { post };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Replication (publish-content) — importPostEntity
// ---------------------------------------------------------------------------

export interface ImportPostEntityDeps {
  clock: ClockPort;
  repo: PostRepoPort;
  outbox: OutboxPort;
  /** Same optional "absent ⇒ zero-plugin path unchanged" contract as {@link UpdatePostDeps.beforeSaveHook}. */
  beforeSaveHook?: BeforeSaveHookPort;
}

export interface ImportPostEntityInput {
  workspaceId: UUID;
  /**
   * The SOURCE instance's own `PostRecord`, carried VERBATIM — this is the whole point of this
   * function (see its own doc). `id` is preserved; `version`/`updatedAt` are ignored (destination-
   * local write bookkeeping, recomputed here), and `createdAt`/`createdByPrincipalId` are honored
   * only for a row that does not exist at this destination yet (write-once).
   */
  record: PostRecord;
  /**
   * Optimistic-concurrency basis, same contract as {@link UpdatePostInput.expectedVersion}:
   * `undefined` means the caller believes no row exists here (a create), a number means it read
   * that version and expects to still be writing over it.
   */
  expectedVersion?: number;
  /** Attribution for the revision this write appends — the IMPORTING OPERATOR, never the source's
   *  own author (which travels in `record.createdByPrincipalId` and is a different fact). */
  actorId?: UUID;
  delegatedByWorkspaceId?: UUID | null;
  delegatedById?: UUID | null;
}

/**
 * Replicates ONE post/page row from another instance, preserving every content field verbatim.
 *
 * ## Why this is a third function rather than a wider `createPost`/`updatePost`
 *
 * `createPost`/`updatePost` are the AUTHORING chokepoint. They deliberately refuse to accept
 * `bodyFormat`/`bodyHtml` (SPEC-047/ADR-056 CIC-3), `seoExtJson` (SPEC-008 INV-01, owned by
 * `features/seo/write-service.ts`), `memberAccessJson` (ADR-030 §4) and `deletedAt` (owned by
 * `PostRepoPort.softDelete`), because an editor must not be able to reach those columns by sending
 * an extra field on a save. Publishing is not authoring: it REPLICATES a row another instance
 * already authored, through those same chokepoints, and must therefore reproduce every column or it
 * is not a publish at all.
 *
 * Widening the authoring inputs to serve this one caller would have handed every existing editor
 * call site a way through those guards. This function keeps them intact and takes a whole
 * `PostRecord` instead — the identical shape and reasoning `features/media/import-media-entity.ts`
 * already uses for media (`mediaRepo.save({...record, ...})`), which is why media has never had the
 * fidelity defect this function exists to fix on the post side.
 *
 * DISCLOSED DEVIATION: this is a second writer for `posts.seo_ext_json` alongside SPEC-008 INV-01's
 * `setEntrySeoOverrides`, and the first writer for `posts.member_access_json`. It writes both as
 * OPAQUE strings, copied without interpretation from a value the source instance's own chokepoint
 * already validated — it never constructs, parses or merges either one. The alternative (refusing to
 * publish any post carrying SEO overrides or member gating) would have made the feature unusable for
 * ordinary content while still leaving member-gating loss as the failure mode for anyone who forced
 * it through.
 *
 * ## What it refuses
 *
 * Fail-closed on every condition where a verbatim copy would destroy destination state rather than
 * replicate source state — a body-format conversion (the data-loss bug `resolveUpdateBodyFields`
 * documents), a resurrection of a trashed destination row, a kind change (`PostKind` is fixed at
 * creation), or a slug already held by a different row.
 *
 * @complexity O(1) — a fixed, small number of repo calls; no iteration over caller-controlled
 * collections.
 */
export async function importPostEntity(required: {
  deps: ImportPostEntityDeps;
  input: ImportPostEntityInput;
}): Promise<{ post: PostRecord; revisionId: string; previousRevisionId: string | null }> {
  const { deps, input } = required;
  const { workspaceId, record } = input;

  const existing = await deps.repo.findById({ workspaceId, id: record.id });

  // The caller's basis and the destination's reality must agree BEFORE anything is written. A
  // create whose row already exists would otherwise upsert straight over it (`persistUpdatedPost`
  // falls through to an unconditional `save()` when no basis is supplied), silently winning a race
  // the whole `expectedVersion` mechanism exists to lose. Mirrors `import-media-entity.ts`'s own
  // "expected no existing row, found version N" guard.
  if (input.expectedVersion === undefined && existing) {
    throw new PostVersionConflictError(
      `post '${record.id}' already exists at this destination (version ${existing.version}) but was published as new`,
      0,
      existing.version
    );
  }

  if (existing) {
    // A trashed destination row is NOT an update target. Overwriting it with a live source record
    // would silently resurrect content an operator here deliberately binned; restoring it is a
    // separate, deliberate act (revert the delete change set).
    if (isTrashed(existing)) {
      throw new PostConflictError(
        `post '${record.id}' is in the trash at this destination — restore it before publishing over it`
      );
    }
    if (existing.kind !== record.kind) {
      throw new PostConflictError(
        `post '${record.id}' is a '${existing.kind}' at this destination but a '${record.kind}' at the source — kind is fixed at creation`
      );
    }
    // Converting an existing row's body format either way discards a whole body: doc -> html loses
    // the Tiptap document, html -> doc loses `body_html`. See `resolveUpdateBodyFields`'s doc for
    // the real incident that behavior caused.
    if (existing.bodyFormat !== record.bodyFormat) {
      throw new PostConflictError(
        `post '${record.id}' is '${existing.bodyFormat}'-format at this destination but '${record.bodyFormat}'-format at the source — publishing cannot convert a body format`
      );
    }
  }

  await assertSlugAvailableForUpdate(deps.repo, workspaceId, record.slug, record.id);

  // CIC U-004: the hook resolves (or throws) BEFORE the record is built and BEFORE the single
  // repo write below, exactly as on the authoring paths. The draft carries the INCOMING body and
  // ext, so a destination plugin filters the entry it is about to see saved, not the one it had.
  const extPatch = await runBeforeSaveHook(deps.beforeSaveHook, {
    id: record.id,
    workspaceId,
    title: record.title,
    slug: record.slug,
    status: record.status,
    bodyJson: record.bodyJson,
    ext: (record.ext ?? {}) as Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  });
  const ext = mergeExt(record.ext, extPatch);

  const { ext: _incomingExt, ...carriedOver } = record;
  const post: PostRecord = {
    ...carriedOver,
    workspaceId,
    updatedAt: deps.clock.nowIso(),
    version: (existing?.version ?? 0) + 1,
    // Write-once authorship, same convention `importMediaEntity` applies to `media.createdAt`: an
    // existing row keeps its own, a brand-new row takes the source's. `repo.sqlite.ts`'s
    // `updatableColumns()` omits both columns, so the existing-row branch is also enforced
    // structurally and not only by this expression.
    createdByPrincipalId: existing ? existing.createdByPrincipalId : record.createdByPrincipalId,
    createdAt: existing ? existing.createdAt : record.createdAt,
    ...(ext !== undefined ? { ext } : {}),
  };

  const { id: revisionId, previousId: previousRevisionId } = await deps.repo.transaction(async () => {
    await persistUpdatedPost(deps.repo, post, input.expectedVersion);
    return deps.repo.appendRevision({
      postId: post.id,
      workspaceId: post.workspaceId,
      seq: post.version,
      op: existing ? "update" : "create",
      stateJson: post,
      actorId: input.actorId ?? SYSTEM_ACTOR_ID,
      delegatedByWorkspaceId: input.delegatedByWorkspaceId ?? null,
      delegatedById: input.delegatedById ?? null,
      recordedAt: post.updatedAt,
    });
  });

  // Same SEO/sitemap signal every other write path emits — a post that arrives already-published
  // must invalidate the destination's sitemap cache exactly like one published locally.
  await emitStatusTransitionEvent(deps.outbox, existing?.status ?? "draft", post.status, post);

  return { post, revisionId, previousRevisionId };
}
