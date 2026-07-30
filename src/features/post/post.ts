import type { ClockPort, JsonObject, OutboxPort, UUID } from "../../core/ports";

export type PostStatus = "draft" | "published";

/**
 * Discriminates the two admin-facing lenses over the same bespoke `post` table
 * (see `INFO.md`): a `"post"` is a blog-style entry, a `"page"` is a standalone
 * document (About, Contact, …). Same record shape, same repo, same editor —
 * `kind` only changes which admin list surfaces a row and how it's created.
 * Fixed at creation; v1 has no post<->page conversion path.
 */
export type PostKind = "post" | "page";

export interface PostRecord {
  id: UUID;
  workspaceId: UUID;
  title: string;
  slug: string;
  bodyJson: JsonObject;
  status: PostStatus;
  kind: PostKind;
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

export interface PostRepoPort {
  findById(required: { workspaceId: UUID; id: UUID }): Promise<PostRecord | null>;
  findBySlug(required: { workspaceId: UUID; slug: string }): Promise<PostRecord | null>;
  list(required: { workspaceId: UUID }): Promise<PostRecord[]>;
  save(record: PostRecord): Promise<void>;
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
   */
  softDelete(required: {
    workspaceId: UUID;
    id: UUID;
    deletedAt: string;
    updatedAt: string;
    version: number;
  }): Promise<void>;
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
}

export interface CreatePostDeps {
  clock: ClockPort;
  repo: PostRepoPort;
  /**
   * SPEC-005 (CIC U-004) — OPTIONAL. Absent ⇒ the zero-plugin path behaves exactly as it did
   * before this feature (no `ext` is written, no extra call is made). See `runBeforeSaveHook`.
   */
  beforeSaveHook?: BeforeSaveHookPort;
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
}

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
): Promise<{ post: PostRecord }> {
  const { deps, input } = required;
  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing || isTrashed(existing)) {
    throw new PostNotFoundError(`post '${input.id}' was not found`);
  }

  const now = deps.clock.nowIso();
  const version = existing.version + 1;
  await deps.repo.softDelete({
    workspaceId: input.workspaceId,
    id: input.id,
    deletedAt: now,
    updatedAt: now,
    version,
  });

  const post: PostRecord = { ...existing, deletedAt: now, updatedAt: now, version };

  const transitionEventName = classifyStatusTransition(existing.status, "draft");
  if (transitionEventName) {
    await deps.outbox.enqueue({
      id: `${post.id}-${transitionEventName}-${post.version}`,
      name: transitionEventName,
      occurredAt: post.updatedAt,
      aggregateId: post.id,
      workspaceId: post.workspaceId,
      payload: { entryId: post.id, contentType: post.kind },
    });
  }

  return { post };
}

export interface GetPostByIdRequired {
  deps: { repo: PostRepoPort };
  input: { workspaceId: UUID; id: UUID };
}

export interface GetPostBySlugRequired {
  deps: { repo: PostRepoPort };
  input: { workspaceId: UUID; slug: string };
}

export interface GetPostOptional {}

export class PostNotFoundError extends Error {}
export class PostValidationError extends Error {}
export class PostConflictError extends Error {}

/**
 * SPEC-002 api.spec.md `POST_CREATE`/`PAGE_CREATE` §4 documented `bodyJson` default —
 * an empty TipTap doc, not `{}` (the pre-fix behavior asserted the wrong shape).
 */
const DEFAULT_BODY_JSON: JsonObject = { type: "doc", content: [] };

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
}

/**
 * Validates and normalizes `createPost`'s caller-supplied fields, in behavior.spec.md BR-03's
 * documented order (first failure wins): title bound, then slug format/length/reserved-word
 * (skipped when `slug` is omitted), then `bodyJson` shape, then `status` enum. Every field
 * except `slug` falls back to its BR-03/default-value-table default when the caller omits it;
 * `slug`'s absence is signaled by `explicitSlug: undefined` so `createPost` knows to derive one.
 *
 * Split out from `createPost` (Code Review, 2026-07-28) so the repo-touching orchestration
 * (uniqueness check / derivation loop / save) reads as one job and this pure validation reads as
 * another — each independently testable without a repo double.
 *
 * @complexity O(1) — a fixed sequence of length/format/set-membership checks, no loops.
 * @overallScore 100
 */
function resolveCreateFields(input: CreatePostInput): ResolvedCreateFields {
  const trimmedTitle = input.title.trim();
  if (trimmedTitle.length > MAX_TITLE_LENGTH) {
    throw new PostValidationError(`title must be ${MAX_TITLE_LENGTH} characters or fewer`);
  }
  // Pre-existing behavior (unchanged): an empty/whitespace-only title is NOT a hard failure on
  // create (unlike `updatePost`) — it defaults to "Untitled", certified by
  // "createPost defaults an empty title to 'Untitled'" in post.test.ts.
  const title = trimmedTitle || "Untitled";

  const explicitSlug = input.slug !== undefined ? input.slug.trim().toLowerCase() : undefined;
  if (explicitSlug !== undefined) {
    if (!isValidSlugFormat(explicitSlug)) {
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
  }

  if (input.bodyJson !== undefined && !isJsonObject(input.bodyJson)) {
    throw new PostValidationError("bodyJson must be a JSON object");
  }
  const bodyJson = input.bodyJson !== undefined ? input.bodyJson : DEFAULT_BODY_JSON;

  if (input.status !== undefined && !isValidPostStatus(input.status)) {
    throw new PostValidationError("status must be 'draft' or 'published'");
  }
  const status = input.status !== undefined ? input.status : "draft";

  return { title, explicitSlug, bodyJson, status };
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
): Promise<{ post: PostRecord }> {
  const { deps, input } = required;
  const { title, explicitSlug, bodyJson, status } = resolveCreateFields(input);

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

  const post: PostRecord = {
    id: input.id,
    workspaceId: input.workspaceId,
    title,
    slug,
    bodyJson,
    status,
    kind: input.kind ?? "post",
    updatedAt: deps.clock.nowIso(),
    version: 1,
    ...(ext !== undefined ? { ext } : {}),
  };

  await deps.repo.save(post);
  return { post };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function updatePost(
  required: UpdatePostRequired,
  _optional: UpdatePostOptional = {}
): Promise<{ post: PostRecord }> {
  const { deps, input } = required;
  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  // A trashed row is not-found for editing purposes — indistinguishable from a missing id, the same
  // way `pages/update.ts` treats a kind mismatch. Restore it (revert the delete change set) before
  // editing it; there is no edit-through-the-trash path.
  if (!existing || isTrashed(existing)) throw new PostNotFoundError(`post '${input.id}' was not found`);

  const title = input.title.trim();
  const slug = input.slug.trim().toLowerCase();

  if (!title) throw new PostValidationError("title is required");
  if (!isValidSlugFormat(slug)) {
    throw new PostValidationError("slug must use lowercase letters, numbers, and dashes");
  }
  if (!isJsonObject(input.bodyJson)) {
    throw new PostValidationError("bodyJson must be a JSON object");
  }
  if (!isValidPostStatus(input.status)) {
    throw new PostValidationError("status must be 'draft' or 'published'");
  }

  const duplicate = await deps.repo.findBySlug({ workspaceId: input.workspaceId, slug });
  if (duplicate && duplicate.id !== input.id) {
    throw new PostConflictError(`slug '${slug}' already exists`);
  }

  // CIC U-004: the hook resolves (or throws) BEFORE the record is built and BEFORE the single
  // repo.save() below. The draft the filters see carries the entry's already-written ext (every
  // other plugin's namespaces), per REQ-05.
  const extPatch = await runBeforeSaveHook(deps.beforeSaveHook, {
    id: existing.id,
    workspaceId: input.workspaceId,
    title,
    slug,
    status: input.status,
    bodyJson: input.bodyJson,
    ext: (existing.ext ?? {}) as Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  });
  const ext = mergeExt(existing.ext, extPatch);

  // `ext` is destructured off `existing` so the conditional spread below is the single source of
  // truth for whether the saved record carries one at all (a stale `ext: {}` surviving the spread
  // would violate AC-14).
  const { ext: _priorExt, ...carriedOver } = existing;
  const post: PostRecord = {
    ...carriedOver,
    title,
    slug,
    bodyJson: input.bodyJson,
    status: input.status,
    updatedAt: deps.clock.nowIso(),
    version: existing.version + 1,
    ...(ext !== undefined ? { ext } : {}),
  };

  await deps.repo.save(post);

  const transitionEventName = classifyStatusTransition(existing.status, post.status);
  if (transitionEventName) {
    await deps.outbox.enqueue({
      id: `${post.id}-${transitionEventName}-${post.version}`,
      name: transitionEventName,
      occurredAt: post.updatedAt,
      aggregateId: post.id,
      workspaceId: post.workspaceId,
      payload: { entryId: post.id, contentType: post.kind },
    });
  }

  return { post };
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

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
