/**
 * @file Posts + Pages' half of ADR-049 Decision 4: maps `agent-tools.ts`'s 6 catalog entries onto
 * `post.ts`'s `createPost`/`updatePost`/`deletePost`/`listAdminPosts`/`listAdminPages`/
 * `getAdminPostById` plus `search.ts`'s `searchAdminPosts`, as `ToolRegistration`s.
 *
 * Authorization shape: `createPost`/`updatePost` (`post.ts`) carry no `authorize()` call of their
 * own (confirmed by reading the whole file) — unlike Forms' write-service functions, which
 * self-enforce and let `ToolPolicy` stay a pure pass-through. So `content_post_create`/
 * `content_post_update` route through `core/commands`'s `executeCommand` directly, exactly the same
 * composition `posts/create.ts`/`posts/update.ts`/`pages/create.ts`/`pages/update.ts` already use
 * (same `content.write` permission, same command gateway) — mirroring `features/plugin-runtime/
 * tool-registrations.ts`'s identical precedent for a domain with no self-enforcing write-service
 * layer of its own. `content_post_list`/`content_post_get` have no service-layer gate either
 * (`listAdminPosts`/`listAdminPages`/`getAdminPostById` take no `authorize()` param at all), so
 * their handlers perform the same inline `content.read` check the admin GET routes perform
 * themselves — mirroring `features/entries/tool-registrations.ts`'s identical `collections_entry_list`
 * precedent. `content_post_search` is in that same group (`searchAdminPosts` takes no `authorize`
 * param either), with the one difference that it has no admin route to mirror at all — see
 * `agent-tools.ts`'s header for why that is deliberate rather than a gap in the mirroring rule.
 *
 * `publicUrl` (2026-08-30, closing a real capability gap surfaced by a production transcript —
 * `sites/tovu-com/content.db`, `ai_chat_messages` rowid 427): the agent had no tool that told it
 * where a post/page it just read or created is actually reachable on the live site, and fell back
 * to grepping route source to reverse-engineer the URL pattern. `content_post_get`/`content_post_list`/
 * `content_post_create` now resolve it through {@link resolvePublicUrl}, which calls
 * `platform/routing`'s {@link entryPublicPath} — the pure per-record half of the SAME `urlFor`
 * inverse resolver `routes/site/pages.ts`'s `buildExtraHead` already treats as the one source of
 * truth for a post's live path (SEO's canonical tag, menu active state); `urlFor`'s own
 * `resolveEntryRefTarget` calls this identical function after its `postRepo.findById`, so a caller
 * resolving from an id and a caller resolving from an already-held `PostRecord` (this file's own
 * case — the row is already sitting in the loop variable) always agree. Deliberately NOT added to
 * `content_post_update`/`content_post_delete`'s existing `toPostToolView(...)` call sites: those
 * return the row incidentally (to confirm what was just written/deleted/cancelled), not to answer
 * "where does this live", so there is no reason to pay for the extra resolution there — hence the
 * separate {@link PostToolViewWithPublicUrl}/{@link toPostToolViewWithPublicUrl} rather than
 * widening the shared `PostToolView`/`toPostToolView`.
 *
 * `content_post_list` scale (2026-08-30, H3): `resolvePublicUrl` used to call `urlFor` per row,
 * which re-fetched the exact record the list loop already held (an O(n) `postRepo.findById` fan-out
 * on top of the O(1) `postRepo.list()` that already produced every row) — see {@link entryPublicPath}
 * above for the fix. `content_post_list` also now caps its output at {@link DEFAULT_POST_LIST_LIMIT}
 * (raisable up to {@link MAX_POST_LIST_LIMIT} via the `limit` input) with `total`/`hasMore` in the
 * response, so a large workspace can no longer flood the agent's context with every row, and
 * truncation is never silent.
 */
import { isDeepStrictEqual } from "node:util";
import {
  AGENT_TOOL_PRINCIPAL_KIND,
  buildDomainRegistrations,
  indexCatalogById,
  optionalNumber,
  optionalString,
  requireInputRecord,
  requireObject,
  requireString,
  requireToolPermission,
  withSchemaOnRejection,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
  type EventBusPort,
  type JsonObject,
  type OutboxPort,
} from "@jini-ai/cms/core";
// Sourced from `assistant/` — an explicitly out-of-scope back-edge for this pass (see the dispatch
// notes this file's narrowing was reported under), not a field this file could re-source from a
// domain-owned port: the MCP-UI/exchange transport is genuinely assistant-owned.
// `ToolInputError` specifically — the marker `@jini-ai/daemon`'s `ToolExecutor` reads to tag a
// rejection `errorKind: 'validation'`. Everything else this file needs comes from `@jini-ai/cms/core`.
import { ToolInputError } from "@jini-ai/core";
import { resolveConfirmationDecision, type AssistantSurfaceDeps, type SurfaceExchange } from "../../contracts/core/tool-surface-exchanges.js";
import {
  forbiddenRule,
  withModelFacingErrors,
  type ModelFacingErrorRule,
} from "../../contracts/core/model-facing-tool-errors.js";
import type { UIResource } from "@jini-ai/ui/mcp-ui/surfaces";
import { executeCommand, type AuthorizeFn, type ChangeSetRepoPort } from "../../contracts/core/commands/index.js";
import { processOutbox } from "../../contracts/core/events/index.js";
import { entryPublicPath } from "#src/platform/routing/index";
import type { ToolContributor, DuplicateResourceHandlerContributor } from "#src/assistant/index";
import {
  postAgentToolCatalog,
  type AgentToolDefinition as PostAgentToolDefinition,
} from "./agent-tools.js";
import {
  buildDeleteConfirmationResource,
  CONTENT_POST_DELETE_TOOL_ID,
} from "./delete-confirmation-ui.js";
import {
  createPost,
  deletePost,
  getAdminPostById,
  isTrashed,
  listAdminPages,
  listAdminPosts,
  updatePost,
  DEFAULT_POST_LIST_LIMIT,
  MAX_POST_LIST_LIMIT,
  ROOT_SLUG,
  PostConflictError,
  PostNotFoundError,
  PostValidationError,
  PostVersionConflictError,
  restorePostForward,
  type PostKind,
  type PostRecord,
  type PostRepoPort,
  type PostStatus,
  type BeforeSaveHookPort,
  type ForgetRemovedPostFn,
  type RemovePostFn,
} from "./post.js";
// The SAME boundary `server/inbound/admin-http/routes/posts/update.ts` uses — imported, not copied.
// The two arms diverged in the first place because only one of them had this logic at all.
import { parseExpectedVersion, VERSION_CONFLICT_CODE } from "./expected-version.js";
import { searchAdminPosts, type PostSearchPort } from "./search.js";
import { copyBodyJsonWithFreshEmbedPlacements } from "./duplicate-embeds.js";
import { deriveDuplicateName } from "../content-duplication/derive-available-name.js";

const CATALOG_BY_ID = indexCatalogById(postAgentToolCatalog);

/**
 * Structural mirror of `features/pages/html-document-store.sqlite.ts`'s
 * `PagesHtmlDocumentStorePort`/`PagesHtmlDocumentStoreFactory` — declared locally rather than
 * imported. Importing the real type would add a `features/post -> features/pages` value-import
 * edge on top of the existing `features/pages -> features/post` one (`pages/tool-registrations.ts`
 * already imports `PostRepoPort` as `import type` from this domain), closing a module cycle
 * `check:architecture` would flag. Same Option-B-style injection this file's own `contributePostTools`
 * history already documents for `listPublishedPosts`/`extractGitHubLogin` (see that function's
 * trailing comment): depend on the shape, wire the real implementation only at the composition root.
 *
 * `server/routes/types.ts`'s `RouteDeps.pagesHtmlStore` already carries a real
 * `PagesHtmlDocumentStoreFactory`, and every `PostToolDeps` this repo actually constructs in
 * production is built from (or assignable from) that same `RouteDeps` object — so no composition-root
 * change is needed to wire this field; it is already present on the object that flows through.
 */
export interface DuplicatePagesHtmlStore {
  ensureHtmlFormat(seedHtml: string): Promise<void>;
  read(): Promise<string>;
  write(html: string): Promise<void>;
}
export type DuplicatePagesHtmlStoreFactory = (scope: { workspaceId: string; postId: string }) => DuplicatePagesHtmlStore;

/**
 * The exact slice of the route-deps bag Posts/Pages' tool handlers read. Declared structurally
 * (rather than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge
 * into the composition root for the `RouteDeps` god type specifically — the `assistant/mcp-ui`/
 * `assistant/pending-confirmations` imports above are separate, already-disclosed back-edges left
 * untouched per the dispatch's explicit out-of-scope list. `server/routes/*` satisfies this
 * structurally by passing its existing `RouteDeps` object; nothing there changes.
 */
export interface PostToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  changeSets: ChangeSetRepoPort;
  outbox: OutboxPort;
  bus: EventBusPort;
  postRepo: PostRepoPort;
  postSearch: PostSearchPort;
  pluginBeforeSaveHook: BeforeSaveHookPort;
  /**
   * The pre-bound removal `content_post_delete` hands `deletePost` — see `post.ts`'s
   * {@link import("./post.js").RemovePostFn}. Structurally typed, so this file also imports nothing
   * from `features/trash`; a `RouteDeps` satisfies it by having the field.
   */
  removePost: RemovePostFn;
  /**
   * The undo half of {@link removePost}: both rollbacks in this file restore a post through
   * `restorePostForward`, and an undone delete must drop the Trash index row the removal wrote.
   * Structurally typed for the same reason — see `post.ts`'s
   * {@link import("./post.js").ForgetRemovedPostFn}.
   */
  forgetRemovedPost: ForgetRemovedPostFn;
  /**
   * OPTIONAL — `content_duplicate`'s `"post"`/`"page"` resource handlers
   * ({@link duplicatePostOrPage}) are the only consumers in this domain that need it. Kept optional
   * (rather than required, like `PagesToolDeps.pagesHtmlStore`) so every existing `PostToolDeps` test
   * double that predates this field keeps compiling unchanged; a real production caller always has
   * one (see this field's type doc above). When absent, duplicating an HTML-format page is refused
   * with an explicit, actionable error rather than silently dropping the page's body.
   */
  pagesHtmlStore?: DuplicatePagesHtmlStoreFactory;
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const postDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> searchAdminPosts (search.ts) -> PostSearchPort.search(): a SELECT against the FTS5 index
  //    joined back to `posts`. Read-only in both adapters — the durable one runs one prepared
  //    query, and the in-memory one's per-query mirror writes only to its own private `:memory:`
  //    scratch database, never to anything a caller can observe or that survives the process.
  ["content_post_search", "none"],
  // -> listAdminPosts/listAdminPages (post.ts): postRepo.list() only, no write.
  ["content_post_list", "none"],
  // -> getAdminPostById (post.ts): postRepo.findById() only, no write.
  ["content_post_get", "none"],
  // -> executeCommand -> createPost (post.ts): postRepo.save() + change-set record, plus an
  //    outbox-drained entry.published event when created directly as `status: "published"`.
  ["content_post_create", "mutates-durable-state"],
  // -> executeCommand -> updatePost (post.ts): postRepo.save() + change-set record, plus an
  //    outbox-drained entry.published/entry.updated/entry.unpublished event on a status transition.
  ["content_post_update", "mutates-durable-state"],
  // -> executeCommand -> deletePost (post.ts): postRepo.softDelete() + change-set record, plus an
  //    outbox-drained entry.unpublished event when the trashed row was published. Classified
  //    `deletes-durable-state` and NOT `mutates-durable-state`: what the handler calls makes the
  //    row vanish from listAdminPosts/listAdminPages/getAdminPostById/listPublishedPosts/
  //    getPublishedPostBySlug and from the public site — a different kind of consequence from an
  //    edit, and the whole reason this file's classification is derived from the call graph rather
  //    than read off the catalog. Note this entry describes the call's CONFIRMED outcome (the human
  //    clicked Delete); the SAME call's cancelled/expired/abandoned outcomes write nothing, so the
  //    classification here is the strictly worse of the outcomes, which is the conservative
  //    direction (ADR-055 Decision 2 — one held-open call, not a mint call plus a redeem call).
  ["content_post_delete", "deletes-durable-state"],
]);
// NOTE: no "content_post_duplicate" entry — duplication is no longer this domain's own bespoke
// tool. See `duplicatePostOrPage`/`contributePostDuplicateHandlers` below: this domain contributes
// its "post"/"page" copy capability to the cross-resource `content_duplicate` tool
// (`features/content-duplication/`) instead, via `assistant/duplicate-resource-registry.ts`.

/**
 * The only Posts/Pages rejection worth decorating with the published schema: `bodyJson`/`title`/
 * `slug`/`status` SHAPE problems (`PostValidationError`). A `PostNotFoundError` (including the
 * disclosed kind-mismatch 404) or a `PostConflictError` (slug taken) is not a shape problem —
 * retrying the SAME input would never resolve either.
 */
function isPostShapeRejection(error: unknown): boolean {
  return error instanceof PostValidationError;
}

/** Appended to a version conflict so the model knows the write did NOT happen and what to do next —
 *  a bare "expected version 1, current version 2" reads as an internal detail, not an instruction. */
const VERSION_CONFLICT_GUIDANCE =
  "Someone else saved this post after you read it, so your edit was NOT applied and nothing was overwritten. " +
  "Re-read the post with content_post_get, reapply your change on top of the body you get back, and resend with " +
  "that row's `version` as `expectedVersion`. Do not resend this call unchanged.";

/**
 * The Posts/Pages errors that reach the model with their real reason instead of a redacted
 * `INTERNAL_ERROR` — see `contracts/core/model-facing-tool-errors.ts` for the mechanism, for why a
 * whole-map wrap is used rather than a per-call-site reshape, and for why this list is an
 * ALLOWLIST: anything unlisted is returned unchanged and stays redacted.
 *
 * This replaces a `toModelFacingUpdateError` helper that handled exactly one class and was wired at
 * exactly one of six handlers — the correct-primitive/unwired-call-site shape this codebase keeps
 * reproducing. `content_post_delete`'s own version re-check threw the SAME class through an
 * unwrapped arm, so the identical conflict was actionable from update and a bare 500 from delete.
 *
 * ORDER IS LOAD-BEARING. `PostVersionConflictError extends PostConflictError` (deliberately — see
 * `post.ts`'s class doc for why that subclassing made the optimistic-concurrency guard additive at
 * every existing 409 call site), and `reclassifyToolError` takes the FIRST `instanceof` match.
 * Listed the other way round, every version conflict would be answered by the generic
 * slug-conflict arm and would lose the one thing the model most needs to hear — that its edit did
 * NOT land and that re-reading the row fixes it. Pinned directly by
 * `__tests__/tool-registrations.model-facing-errors.test.ts`'s ordering case.
 *
 * `VERSION_CONFLICT` keeps its bare, un-prefixed code on purpose: it is the shared discriminator
 * `entries/` and `content-types/` already publish for the identical condition
 * (`expected-version.ts`), a client branches on it, and
 * `__tests__/tool-registrations.optimistic-concurrency.test.ts` pins the exact wire message
 * byte-for-byte. The rest take a `CONTENT_POST_` prefix rather than `POST_` so the token names the
 * tool family the model actually calls (`content_post_update`, `content_read.content_post`) instead
 * of reading as the HTTP verb.
 *
 * `PostValidationError` is listed even though `content_post_search`/`_create`/`_update` already
 * convert it into a schema-decorated `ToolInputError` via `withSchemaOnRejection`: that decoration
 * covers three of the six handlers, and `reclassifyToolError` returns an already-`ToolInputError`
 * rejection untouched, so listing it here adds the real reason to the other three WITHOUT touching
 * the decorated ones or double-prefixing them.
 *
 * On disclosure: every message these classes carry is built from the caller's own input and this
 * domain's own vocabulary — an id or slug the caller itself sent, a field name, two version
 * integers, a reserved slug, or (for `ForbiddenError`) the permission string plus the `authorize()`
 * reason. Checked at each construction site rather than assumed (`post.ts` 473 / 720-766 / 825 /
 * 898-932 / 952 / 1003-1004 / 1055 / 1220-1294, `search.ts` 247 & 253, `expected-version.ts` 52,
 * and this file's own four throws): none interpolates post body content, a member or subscriber
 * email, a token, a SQL fragment, or an internal filesystem path.
 */
const POST_MODEL_FACING_ERRORS: readonly ModelFacingErrorRule[] = [
  // FIRST, and it must stay first — the subclass ahead of its superclass. See this list's doc.
  { error: PostVersionConflictError, code: VERSION_CONFLICT_CODE, guidance: VERSION_CONFLICT_GUIDANCE },
  { error: PostConflictError, code: "CONTENT_POST_CONFLICT" },
  { error: PostNotFoundError, code: "CONTENT_POST_NOT_FOUND" },
  { error: PostValidationError, code: "CONTENT_POST_VALIDATION_FAILED" },
  forbiddenRule("CONTENT_POST"),
];

function requirePostKind(input: Record<string, unknown>): PostKind {
  const value = input.kind;
  if (value !== "post" && value !== "page") {
    // `ToolInputError`, not a bare `Error` — see `toModelFacingUpdateError`'s doc a few lines up
    // for why this marker is load-bearing: `@jini-ai/daemon`'s `ToolExecutor` only tags a
    // rejection `errorKind: 'validation'` (→ 400 with this message intact) when it is
    // `instanceof ToolInputError`; anything else is `'internal'` and reaches the model as a
    // redacted 500. A wrong/missing `kind` is exactly the caller-input-was-the-problem case the
    // marker means, and `requireString` elsewhere in this same file already uses it correctly.
    throw new ToolInputError("'kind' must be exactly 'post' or 'page'");
  }
  return value;
}

function requirePostStatus(input: Record<string, unknown>): PostStatus {
  const value = input.status;
  if (value !== "draft" && value !== "published") {
    // Same reasoning as `requirePostKind` above.
    throw new ToolInputError("'status' must be exactly 'draft' or 'published'");
  }
  return value;
}

function optionalPostStatus(input: Record<string, unknown>): PostStatus | undefined {
  if (input.status === undefined) return undefined;
  return requirePostStatus(input);
}

/**
 * Clamps `content_post_list`'s optional `limit` into `[1, MAX_POST_LIST_LIMIT]`, flooring
 * fractions, defaulting to `DEFAULT_POST_LIST_LIMIT` when omitted — mirrors `search.ts`'s own
 * `clampLimit` for `content_post_search` (clamp rather than reject: an out-of-range `limit` is not
 * a shape problem worth a round trip to fix).
 *
 * @complexity O(1).
 */
function clampPostListLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_POST_LIST_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_POST_LIST_LIMIT);
}

/** `requireObject` (the kit's generic reader) returns `Record<string, unknown>` — this domain's
 * `bodyJson` is typed as `JsonObject` (`post.ts`), so this narrows the one field that differs.
 * `post.ts`'s own `isJsonObject` check (inside `createPost`/`updatePost`) is the actual runtime
 * shape gate — this cast does not weaken that, it only aligns the caller-facing TS type. */
function requireBodyJson(input: Record<string, unknown>, key: string): JsonObject {
  return requireObject(input, key) as unknown as JsonObject;
}

/** Optional counterpart to {@link requireBodyJson} — S7's partial-patch shape for
 *  `content_post_update`: a caller who omits `bodyJson` keeps the stored value (merged in by the
 *  handler, not here), but a caller who SENDS a non-object one is still rejected with the exact
 *  same "(object) is required" message `requireObject` always threw — a present-but-malformed
 *  `bodyJson` is a shape error whether or not the field is required. */
function optionalBodyJson(input: Record<string, unknown>, key: string): JsonObject | undefined {
  if (input[key] === undefined) return undefined;
  return requireBodyJson(input, key);
}

/** Shared dependency bag for `core/commands`'s `executeCommand` — identical shape to the one
 * `posts/create.ts`/`posts/update.ts`/`pages/create.ts`/`pages/update.ts` each build inline. */
/** See `trash/trash-item-tool.ts`'s identical constant's doc — duplicated here rather than
 *  imported, the same "structurally typed, no `features/trash` import" convention
 *  {@link RemovePostFn}'s own doc already follows. */
const ASSISTANT_ACTOR_PLUGIN_ID = "assistant";

function postCommandDeps(routeDeps: PostToolDeps) {
  return {
    clock: routeDeps.clock,
    idGen: routeDeps.idGen,
    changeSets: routeDeps.changeSets,
    outbox: routeDeps.outbox,
    authorize: routeDeps.authorize,
  };
}

/** What a Posts/Pages tool returns to the model — see {@link toPostToolView}. */
interface PostToolView {
  id: string;
  kind: PostKind;
  title: string;
  slug: string;
  bodyJson: unknown;
  status: PostStatus;
  updatedAt: string;
  version: number;
}

/** Projects a `PostRecord` into the explicit model-facing shape — `workspaceId` is dropped (the
 * agent is already scoped to one workspace it did not choose and cannot change), and the internal
 * `seoExtJson` sidecar (owned exclusively by `src/seo/write-service.ts`'s chokepoint, per `post.ts`'s
 * own field doc) is dropped too, mirroring `toHeadlessPost`'s own admin-facing projection. */
function toPostToolView(post: PostRecord): PostToolView {
  return {
    id: post.id,
    kind: post.kind,
    title: post.title,
    slug: post.slug,
    bodyJson: post.bodyJson,
    status: post.status,
    updatedAt: post.updatedAt,
    version: post.version,
  };
}

/** {@link PostToolView} plus the resolved public path and the in-admin edit path — see this file's
 *  header ("`publicUrl`") for why these are a separate type rather than fields added to the base
 *  shape, and {@link resolveAdminUrl}'s own doc for `adminUrl`. */
interface PostToolViewWithPublicUrl extends PostToolView {
  publicUrl: string | null;
  adminUrl: string;
}

/**
 * Resolves the root-relative public path for `post` through `platform/routing`'s
 * {@link entryPublicPath} — the same pure per-record half `urlFor`'s `resolveEntryRefTarget` calls
 * internally, so this stays the single inverse resolver this codebase treats as the source of truth
 * for where a post/page actually lives (see this file's header). Deliberately not composed by hand
 * as `/${post.slug}` here: that string is only correct for a published row, and re-deriving the
 * publish check next to the real one in `routing.ts` is exactly the kind of drift this exists to
 * remove. Takes the `PostRecord` the caller already holds rather than an id — unlike `urlFor`, this
 * makes no `postRepo.findById` call of its own (H3: the caller, e.g. `content_post_list` iterating
 * `postRepo.list()`'s own result, already has the row; a second fetch per row would be exactly the
 * N+1 this signature exists to avoid).
 *
 * @returns `null` for a draft, unpublished, or otherwise unresolvable row — never a link a visitor
 * would 404 on.
 * @complexity O(1).
 */
function resolvePublicUrl(routeDeps: PostToolDeps, post: PostRecord): string | null {
  const resolved = entryPublicPath(post, { workspaceId: routeDeps.workspaceId });
  return resolved?.canonicalUrl ?? null;
}

/**
 * Resolves the in-admin EDIT path for `post` — "where do I go to change this", as opposed to
 * {@link resolvePublicUrl}'s "where does a visitor see this". Added 2026-09-07
 * (`ADS-memory/reports/2026-09-07-page-tool-gap.md` §3) for the identical reason `publicUrl` was
 * added on 2026-08-30 (this file's header): the assistant had no tool that told it where a
 * post/page it just read or created is actually reachable, this time in the admin UI rather than
 * on the live site — the fallback was `assistant_admin_screen_link`, which needs the caller to
 * already know the right path shape.
 *
 * Re-implemented here rather than imported, mirroring the SAME cross-app boundary
 * `apps/admin/src/features/pages/rules.ts`'s own `pagePublicPath` already crosses in the opposite
 * direction (that file's own doc: "re-implemented here... because apps/admin is a separately
 * deployed SPA package with no dependency on apps/website's server source") — this server has none
 * on `apps/admin` either.
 *
 * Two real routes, both confirmed by reading `apps/admin/src/features/*` directly:
 * - `kind: "post"` -> `/admin/posts/{id}` — ALWAYS by id. `apps/admin/src/features/posts/rules.ts`'s
 *   own `buildPostAutosaveDraft` doc: "`PostEditor` is reached only via `/admin/posts/{id}`" (no
 *   slug-based route exists for a Post).
 * - `kind: "page"` -> `/admin/pages/{handle}`, mirroring `apps/admin/src/features/pages/rules.ts`'s
 *   `pageAdminPath` exactly: prefers `slug`, falling back to `id` only when the slug cannot be a
 *   path segment at all (today, only the literal root slug `ROOT_SLUG`/`"/"`, gated to `kind: "page"`
 *   — every other slug is `SLUG_FORMAT_PATTERN`-validated and can never contain `/`).
 * Both prefixed with `/admin`, `@jini-ai/admin/core`'s own `DEFAULT_ADMIN_BASE`
 * (`apps/admin/src/lib/router.ts`'s `ADMIN_BASE`) — the real, browser-visible admin URL, not the
 * SPA-router-relative path `pageAdminPath` itself returns before `adminHref()` prefixes it.
 *
 * @complexity O(1).
 */
function resolveAdminUrl(post: PostRecord): string {
  if (post.kind === "post") return `/admin/posts/${post.id}`;
  const handle = post.slug === ROOT_SLUG ? post.id : post.slug;
  return `/admin/pages/${handle}`;
}

/**
 * {@link toPostToolView} plus {@link resolvePublicUrl}/{@link resolveAdminUrl} — the shape
 * `content_post_get`/`content_post_list`/`content_post_create` return to the model (see this file's
 * header, "`publicUrl`", and {@link resolveAdminUrl}'s own doc). Also used by
 * {@link duplicatePostOrPage} (`content_duplicate`'s `"post"`/`"page"` resource handlers) to shape
 * its own response identically.
 */
function toPostToolViewWithPublicUrl(routeDeps: PostToolDeps, post: PostRecord): PostToolViewWithPublicUrl {
  return { ...toPostToolView(post), publicUrl: resolvePublicUrl(routeDeps, post), adminUrl: resolveAdminUrl(post) };
}

/**
 * Reads the row `content_post_delete` is about to gate on, applying the same not-found rules
 * `content_post_get` uses (kind mismatch and trashed rows both read as not-found — a second delete
 * cannot "succeed"). Throws `PostNotFoundError` rather than returning `null` because there is no
 * valid "keep going" path once this fails.
 */
async function loadDeletablePost(routeDeps: PostToolDeps, id: string, kind: PostKind): Promise<PostRecord> {
  const existing = await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id });
  if (!existing || isTrashed(existing) || (kind === "page" && existing.kind !== "page")) {
    throw new PostNotFoundError(`${kind} '${id}' was not found`);
  }
  return existing;
}

/**
 * Waits for the human's answer to `content_post_delete`'s confirmation dialog and turns it into
 * either "go ahead" or the exact not-confirmed result the tool call should return (ADR-055
 * Decision 6: no-answer is a result, not a thrown error).
 *
 * The ask-and-fail-closed-classify mechanics are shared (`resolveConfirmationDecision`, extracted
 * from this function plus its 3 forks in custom-credentials/source-control/deployments — see that
 * function's own doc); this wrapper only supplies this domain's own `deleted`/`cancelled`/`post`
 * result shape, unchanged from before the extraction.
 */
async function resolveDeleteDecision(
  exchange: SurfaceExchange,
  ui: UIResource,
  existing: PostRecord
): Promise<{ confirmed: true } | { confirmed: false; result: unknown }> {
  const outcome = await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
  if (outcome.confirmed) return { confirmed: true };

  if (outcome.reason === "declined") {
    return { confirmed: false, result: { deleted: false, cancelled: true, post: toPostToolView(existing) } };
  }
  return {
    confirmed: false,
    result: {
      deleted: false,
      cancelled: false,
      reason: outcome.reason,
      note:
        outcome.reason === "expired"
          ? "The user did not respond to the confirmation dialog before it expired. Nothing was deleted."
          : "The confirmation dialog was closed because the run ended. Nothing was deleted.",
    },
  };
}

/**
 * Refuses to write if the row moved since the confirmation dialog was shown. See the caller's own
 * inline history: this replaces `pending-confirmations.ts`'s old token-bound version check (ADR-055
 * Decision 3 removed the token, not the need for the check).
 */
function assertFreshVersion(current: PostRecord | null, existing: PostRecord, kind: PostKind): void {
  if (current && !isTrashed(current) && current.version !== existing.version) {
    // A `ToolInputError`, not a bare `Error`: that marker is the only thing keeping this out of the
    // `errorKind: 'internal'` bucket the delegated-tool transport SEC-005-redacts, and a model told
    // only "500" here cannot learn that nothing was deleted or that calling again fixes it. The code
    // goes in FRONT of the original wording, which is otherwise unchanged character for character —
    // `__tests__/agent-tools.delete-confirmation.test.ts` matches on `/stale-entity-version/`.
    throw new ToolInputError(
      `CONTENT_POST_STALE_CONFIRMATION: content_post_delete: the confirmation could not be honored ` +
        `(stale-entity-version). The ${kind} was edited after the confirmation dialog was shown. ` +
        `Nothing was deleted. Call content_post_delete again with { id, kind } to raise a fresh ` +
        `dialog against the current version.`
    );
  }
  // A missing or already-trashed `current` is not handled specially here: `deletePost` performs its
  // own fresh existence/trashed check and throws `PostNotFoundError`, the same outcome this handler
  // already produces for that case above.
}

/**
 * Builds this domain's registrations.
 *
 * @param routeDeps - The same bag the admin routes are built from.
 * @param surfaces - Assistant-transport machinery `content_post_delete` needs to hold its call open
 * across the human's confirmation (ADR-055 Decision 2). Must be the SAME `SurfaceExchangeStore`
 * instance `registerMcpUiToolCallsRoute` was mounted with in production — `agent-daemon-server.ts`
 * builds one and passes it to both; a mismatched instance means the human's click reaches a store
 * nobody is waiting on, and the call times out instead of resolving. Required, matching every other
 * surface-raising domain's `build*Registrations(routeDeps, surfaces)` shape
 * (`assistant/tool-registrations.ts`'s `DomainSlice.build`) — there is no reduced-functionality
 * fallback for a missing store the way there is for a missing `ctx.emitSurface` per call (see the
 * handler below), because a domain with no store at all could never wire this tool's gate.
 */
export function buildPostRegistrations(routeDeps: PostToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    /**
     * Ranked search. Gated exactly like `content_post_list` — same `content.read` permission, same
     * inline check in the route's place, because `searchAdminPosts` (like `listAdminPosts`) takes no
     * `authorize` param of its own. No `entityId` on the check: the caller has not named a row yet,
     * which is the whole point of searching, so this authorizes the ACT of reading posts in this
     * workspace rather than access to any particular one.
     *
     * `withSchemaOnRejection` wraps it for the same reason the write handlers use it: the two things
     * that can go wrong here (a query with no searchable term, a non-numeric `limit`) are both
     * `PostValidationError`s a different input would fix, so publishing the schema alongside saves
     * the model a turn.
     */
    content_post_search: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "content.read", entityType: "post" });

      return withSchemaOnRejection({ toolId: "content_post_search", catalog: CATALOG_BY_ID, isShapeRejection: isPostShapeRejection }, async () => {
        const query = requireString(input, "query");
        const kind = input.kind !== undefined ? requirePostKind(input) : undefined;
        const status = optionalPostStatus(input);
        const limit = optionalNumber(input, "limit");

        const { hits } = await searchAdminPosts({
          deps: { search: routeDeps.postSearch },
          input: {
            workspaceId: routeDeps.workspaceId,
            query,
            ...(kind !== undefined ? { kind } : {}),
            ...(status !== undefined ? { status } : {}),
            ...(limit !== undefined ? { limit } : {}),
          },
        });

        // `hits` is already the model-facing shape (`PostSearchHit`), so unlike every other handler
        // here there is no `toPostToolView` projection to apply — and deliberately no `bodyJson` to
        // drop, because the search layer never loads one. See `search.ts`'s `PostSearchHit` doc.
        return { hits };
      });
    },

    content_post_list: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "content.read", entityType: "post" });

      const kind = requirePostKind(input);
      const limit = clampPostListLimit(optionalNumber(input, "limit"));
      const { posts: allPosts } =
        kind === "post"
          ? await listAdminPosts({ deps: { repo: routeDeps.postRepo }, input: { workspaceId: routeDeps.workspaceId } })
          : await listAdminPages({ deps: { repo: routeDeps.postRepo }, input: { workspaceId: routeDeps.workspaceId } });

      const total = allPosts.length;
      const posts = allPosts.slice(0, limit);
      return {
        posts: posts.map((post) => toPostToolViewWithPublicUrl(routeDeps, post)),
        total,
        hasMore: total > posts.length,
      };
    },

    content_post_get: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const id = requireString(input, "id");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "content.read", entityType: "post", entityId: id });

      const kind = requirePostKind(input);
      const { post } = await getAdminPostById({ deps: { repo: routeDeps.postRepo }, input: { workspaceId: routeDeps.workspaceId, id } });

      // Disclosed asymmetry (agent-tools.ts's own header): kind:"page" is guarded exactly like
      // pages/get-by-id.ts (a kind mismatch 404s identically to not-found); kind:"post" is NOT
      // guarded, exactly like posts/get-by-id.ts's own legacy, kind-blind lookup.
      if (kind === "page" && post.kind !== "page") {
        throw new PostNotFoundError(`page '${id}' was not found`);
      }

      return { post: toPostToolViewWithPublicUrl(routeDeps, post) };
    },

    content_post_create: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      return withSchemaOnRejection({ toolId: "content_post_create", catalog: CATALOG_BY_ID, isShapeRejection: isPostShapeRejection }, async () => {
        const kind = requirePostKind(input);
        const title = requireString(input, "title");
        const slug = optionalString(input, "slug");
        const bodyJson = input.bodyJson !== undefined ? requireBodyJson(input, "bodyJson") : undefined;
        const status = optionalPostStatus(input);
        const postId = routeDeps.idGen.newId();

        const { result } = await executeCommand<{ post: PostRecord }>({
          deps: postCommandDeps(routeDeps),
          command: {
            workspaceId: routeDeps.workspaceId,
            actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            summary: `Agent create ${kind} '${title}'`,
            permission: "content.write",
          },
          mutation: {
            entityType: "post",
            entityId: postId,
            operation: "create",
            captureInverse: async () => null,
            execute: () =>
              createPost({
                deps: {
                  repo: routeDeps.postRepo,
                  clock: routeDeps.clock,
                  beforeSaveHook: routeDeps.pluginBeforeSaveHook,
                  outbox: routeDeps.outbox,
                },
                input: {
                  workspaceId: routeDeps.workspaceId,
                  id: postId,
                  title,
                  kind,
                  slug,
                  bodyJson,
                  status,
                  actorId: ctx.principal.id,
                  // Every `tool-registrations.ts` handler is, by definition, reached only via
                  // `@jini-ai/daemon`'s agent-run path (see `AGENT_TOOL_PRINCIPAL_KIND`'s own doc
                  // in `@jini-ai/cms/core` — `ctx.principal.id` is already the real human's id here,
                  // the same id a direct admin-UI edit would carry). Stamping delegatedBy* is what
                  // makes an agent-run write distinguishable from a direct one in `post_revisions`,
                  // since `actorId` alone is identical either way.
                  delegatedByWorkspaceId: routeDeps.workspaceId,
                  delegatedById: ctx.principal.id,
                },
              }),
            captureEntityVersion: (r) => r.post.version,
          },
        });

        // Mirrors content_post_update's identical inline processOutbox call below — an agent
        // creating directly as `status: "published"` (the tool's own documented usage) now
        // enqueues `entry.published` (`createPost`'s `deps.outbox` doc); drained here so SEO's
        // sitemap-cache invalidation subscriber sees it without waiting for the serving process's
        // background drainer. On the BYOK path (serving process) this delivers at once; in the agent
        // daemon the outbox is enqueue-only, so this claims nothing and that drainer delivers instead
        // (`server/runtime/composition/agent-daemon-deps.ts`).
        await processOutbox({ outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock });

        return { post: toPostToolViewWithPublicUrl(routeDeps, result.post) };
      });
    },

    content_post_update: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      return withSchemaOnRejection({ toolId: "content_post_update", catalog: CATALOG_BY_ID, isShapeRejection: isPostShapeRejection }, async () => {
        const id = requireString(input, "id");
        const kind = requirePostKind(input);
        // S7 (fix-plan-tool-design-2026-09-24.md) — a PARTIAL patch: each of these four is now
        // independently optional. An omitted one is filled from the stored row inside
        // `captureInverse` below (the one place this handler already reads `existing`), not here —
        // a present-but-invalid value still rejects with the exact same message it always did.
        const title = optionalString(input, "title");
        const slug = optionalString(input, "slug");
        const bodyJson = optionalBodyJson(input, "bodyJson");
        const status = optionalPostStatus(input);
        if (title === undefined && slug === undefined && bodyJson === undefined && status === undefined) {
          throw new ToolInputError(
            "content_post_update: send at least one of title, slug, bodyJson or status. Nothing was changed."
          );
        }
        // Validated, not cast — see `expected-version.ts`. `expectedVersion` is optional on
        // `UpdatePostInput`, so anything this handler failed to recognize would coerce to "no basis
        // sent" and be written through as an unguarded save, re-opening the very clobber the guard
        // closes. `PostValidationError` reaches `withSchemaOnRejection` above, which turns it into a
        // schema-decorated `ToolInputError` — a 400 the model can act on, not a silent downgrade.
        const expectedVersion = parseExpectedVersion(input.expectedVersion);

        // Captured by `captureInverse` below, reused verbatim by `rollback` — mirrors
        // `posts/update.ts`/`pages/update.ts`'s identical unit-of-work compensation.
        let priorPost: PostRecord | null = null;
        // The merged, fully-populated values `execute` below actually sends to `updatePost` — set
        // inside `captureInverse`, the only place `existing` (the fill-in source for an omitted
        // field) is available. `basisVersion` starts as whatever the caller sent and is upgraded to
        // `existing.version` there too, but ONLY for a partial patch with no caller-sent
        // `expectedVersion` — see that comment for why a full four-field call must NOT gain a basis
        // it never asked for.
        let merged: { title: string; slug: string; bodyJson: JsonObject; status: PostStatus } | null = null;
        let basisVersion = expectedVersion;

        const { result } = await executeCommand<{ post: PostRecord }>({
          deps: postCommandDeps(routeDeps),
          command: {
            workspaceId: routeDeps.workspaceId,
            actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            summary: `Agent update ${kind} '${id}'`,
            permission: "content.write",
          },
          mutation: {
            entityType: "post",
            entityId: id,
            operation: "update",
            captureInverse: async () => {
              const existing = await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id });
              if (!existing) throw new PostNotFoundError(`post '${id}' was not found`);
              if (kind === "page" && existing.kind !== "page") {
                // Kind mismatch treated identically to not-found — mirrors pages/update.ts exactly
                // (see agent-tools.ts's disclosed asymmetry; kind:"post" carries no such guard,
                // mirroring posts/update.ts's own kind-blind captureInverse).
                throw new PostNotFoundError(`page '${id}' was not found`);
              }
              // S7 — fill every field the caller omitted from the stored row. This runs BEFORE the
              // html-body guard just below on purpose: an omitted `bodyJson` must merge in as
              // `existing.bodyJson` itself, so a title-only patch on an html Page compares equal
              // to itself and sails through that guard rather than being misread as a body change
              // it never made.
              merged = {
                title: title ?? existing.title,
                slug: slug ?? existing.slug,
                bodyJson: bodyJson ?? existing.bodyJson,
                status: status ?? existing.status,
              };
              // A partial patch (any of the four omitted) is a read-then-write on a basis the
              // caller did NOT necessarily pin with its own `expectedVersion`. Filling the gap from
              // `existing` and then writing unconditionally would silently clobber a human's save
              // landing between this read and `updatePost`'s write — so pin it to the row's own
              // version instead, exactly as if the caller had sent it. `updatePost`'s own
              // `assertExpectedVersion`/`saveIfVersion` CAS (already wired) does the actual
              // enforcement; this only supplies the basis for a caller who left it out. A FULL
              // four-field call is unaffected: `basisVersion` stays whatever the caller sent (or
              // `undefined`), the same opt-in last-write-wins behavior as before this slice.
              const isPartialPatch = title === undefined || slug === undefined || bodyJson === undefined || status === undefined;
              if (isPartialPatch && expectedVersion === undefined) {
                basisVersion = existing.version;
              }
              // S3 (fix-plan-web-high-2026-09-24.md row 6) — `updatePost` ignores `bodyJson` outright
              // on an html-format row (CIC-3: an html Page's body is written only by
              // `PagesHtmlDocumentStore`, never through this chokepoint). Without this guard, a caller
              // sending a changed `bodyJson` got back a 200 with its edit silently dropped. Reject it
              // here instead, before the write — the one place this handler already has `existing` in
              // hand. A caller round-tripping the SAME bodyJson it just read (the metadata-only edit
              // case) is unaffected: `isDeepStrictEqual` makes this opt-in, not a ban on ever sending
              // the field. Compares the MERGED value, not the raw (possibly-omitted) input — see the
              // merge comment just above for why that is what lets a title-only patch succeed.
              if (existing.bodyFormat === "html" && !isDeepStrictEqual(merged.bodyJson, existing.bodyJson)) {
                throw new ToolInputError(
                  `CONTENT_POST_HTML_BODY: page '${id}' is a bespoke-HTML page, so bodyJson can't change its body. ` +
                    `To edit its title, slug or status, send bodyJson back exactly as content_read returned it. ` +
                    `To change the body, use pages_write_html or pages_write_region.`
                );
              }
              priorPost = existing;
              return { title: existing.title, slug: existing.slug, bodyJson: existing.bodyJson, status: existing.status };
            },
            execute: () => {
              // `captureInverse` above always runs first (per `core/commands`'s own contract) and
              // either throws or sets `merged` — this branch is unreachable in practice, the same
              // guarantee `rollback`'s `if (!priorPost)` below relies on, kept here only to satisfy
              // the type checker without a forbidden non-null assertion.
              if (!merged) throw new PostNotFoundError(`post '${id}' was not found`);
              return updatePost({
                deps: {
                  repo: routeDeps.postRepo,
                  clock: routeDeps.clock,
                  outbox: routeDeps.outbox,
                  beforeSaveHook: routeDeps.pluginBeforeSaveHook,
                },
                // `title`/`slug`/`bodyJson`/`status` are the MERGED values (the caller's own field,
                // or the stored one for an omitted field) — never the raw, possibly-partial input.
                // `basisVersion` is `expectedVersion` forwarded exactly the way `posts/update.ts`
                // forwards it, EXCEPT for a partial patch with no caller-sent `expectedVersion`,
                // where `captureInverse` above upgraded it to `existing.version` so the merge stays
                // atomic. `undefined` (a full four-field call, caller sent nothing) is still what
                // keeps the guard opt-in, so that caller keeps the original last-write-wins save.
                input: {
                  workspaceId: routeDeps.workspaceId,
                  id,
                  title: merged.title,
                  slug: merged.slug,
                  bodyJson: merged.bodyJson,
                  status: merged.status,
                  expectedVersion: basisVersion,
                  actorId: ctx.principal.id,
                  // See content_post_create's identical delegatedBy* comment just above.
                  delegatedByWorkspaceId: routeDeps.workspaceId,
                  delegatedById: ctx.principal.id,
                },
              });
            },
            captureEntityVersion: (r) => r.post.version,
            rollback: async () => {
              if (!priorPost) return;
              await restorePostForward({
                deps: {
                  repo: routeDeps.postRepo,
                  clock: routeDeps.clock,
                  outbox: routeDeps.outbox,
                  forgetRemoved: routeDeps.forgetRemovedPost,
                },
                input: {
                  prior: priorPost,
                  actorId: ctx.principal.id,
                  // Same delegatedBy* attribution the forward write above records.
                  delegatedByWorkspaceId: routeDeps.workspaceId,
                  delegatedById: ctx.principal.id,
                },
              });
            },
          },
        });

        // Mirrors posts/update.ts's/pages/update.ts's identical inline processOutbox call — drains
        // updatePost's entry.published/entry.updated/entry.unpublished event (if any) to SEO's
        // sitemap-cache invalidation subscriber at once. In the agent daemon the outbox is
        // enqueue-only, so this claims nothing and the serving process's background drainer
        // delivers instead (`server/runtime/composition/agent-daemon-deps.ts`).
        await processOutbox({ outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock });

        return { post: toPostToolView(result.post) };
      });
    },

    /**
     * The MCP-UI-gated delete. See `delete-confirmation-ui.ts` for the surface itself and ADR-055
     * Decision 2 for why this holds its call open rather than returning and waiting for a second one
     * (superseding ADR-053 Decision 3, the token-redemption shape this handler used to implement).
     *
     * One call, blocking:
     *  1. Resolve and describe the row (same as before).
     *  2. Open an exchange, emit the confirmation surface through it, and park on the answer.
     *  3. The answer is the human's decision — confirm, cancel — or a `SurfaceMessage` saying nobody
     *     answered (`expired`/`abandoned`). Every branch returns a truthful result to the SAME call;
     *     none of them throw for "no answer", because the model is still alive to read the result
     *     (ADR-055 Decision 6).
     *  4. On confirm, re-check the entity's version against what the dialog described before writing
     *     — see the inline comment at that check for why this is now the handler's job.
     *
     * No fallback to the old two-call shape when `ctx.emitSurface` is unavailable: unlike a
     * non-destructive surface (`demo-choices-tool.ts`, ADR-055 Decision 1), degrading a DESTRUCTIVE
     * gate to "return the dialog and trust a second, ordinary call" is exactly the shape the removed
     * token existed to guard, and there is no token left to guard it with. An execution context that
     * cannot hold this call open cannot run this tool at all.
     */
    content_post_delete: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const id = requireString(input, "id");
      const kind = requirePostKind(input);

      // Gated exactly like content_post_get, and performed before opening anything so a caller with
      // no read access learns nothing and never causes a dialog to be raised.
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "content.read",
        entityType: "post",
        entityId: id,
      });

      // Kind guard applied inside the loader rather than in `deletePost`, mirroring `pages/delete.ts`/
      // `pages/update.ts` — and carrying the same disclosed asymmetry the rest of this catalog has:
      // kind:'page' rejects an actual 'post' row, kind:'post' is not guarded the other way.
      // A trashed row is not-found too (post.ts's own rule), so a second delete cannot "succeed".
      const existing = await loadDeletablePost(routeDeps, id, kind);

      // Fail closed rather than degrade — see this handler's own doc comment above.
      if (!ctx.emitSurface) {
        // `ToolInputError` for the same reason `webhooks_delete_subscription`'s identical guard uses
        // it: a redacted 500 here makes a model retry a delete that can never succeed in this
        // context. The message names no internals — only the missing capability and the fact that
        // nothing was deleted. Original wording preserved behind the code prefix.
        throw new ToolInputError(
          "CONTENT_POST_NO_CONFIRMATION_CHANNEL: content_post_delete: this execution context has no " +
            "interactive confirmation channel (no emitSurface), so a destructive delete cannot be " +
            "gated here. Nothing was deleted."
        );
      }

      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
        { toolId: CONTENT_POST_DELETE_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface
      );

      const ui = buildDeleteConfirmationResource({
        subject: {
          id: existing.id,
          kind: existing.kind,
          title: existing.title,
          slug: existing.slug,
          status: existing.status,
          version: existing.version,
        },
        exchangeId: exchange.id,
      });

      // A cancelled run must not leave a dialog holding a call nobody is listening to, nor hold this
      // handler open until the idle deadline — mirrors `demo-choices-tool.ts`'s identical guard.
      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        // ADR-055 Decision 6: the no-answer path is a result, not an exception. Nothing was deleted
        // either way, and the model is still alive to read this and say something sensible.
        const decision = await resolveDeleteDecision(exchange, ui, existing);
        if (!decision.confirmed) return decision.result;

        // Stale-version guard. This used to be `pending-confirmations.ts`'s job — a token bound to
        // `existing.version` at mint time and refused at redeem time if the row had moved. Removing
        // the token (ADR-055 Decision 3) removes that binding too, and nothing about a held-open
        // exchange implies it: the exchange's own binding is `{toolId, principalId}`, which says
        // nothing about which VERSION of the row the human was actually looking at. So this handler
        // re-reads and compares explicitly, in the same place `redeem()` used to run — right after
        // the human's answer arrives, before anything is written. `deletePost` itself has no
        // optimistic-concurrency check of its own (confirmed by reading it in full), so without this
        // an edit made while the dialog was open would go unnoticed.
        const current = await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id });
        assertFreshVersion(current, existing, kind);

        let priorPost: PostRecord | null = null;

        const { result } = await executeCommand<{ post: PostRecord }>({
          deps: postCommandDeps(routeDeps),
          command: {
            workspaceId: routeDeps.workspaceId,
            actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            // The human-approved summary, recorded verbatim, so the audit trail says what was
            // actually consented to rather than what the agent asked for. Built from `existing`
            // (the same read the dialog was shown from) rather than anything the delivered answer
            // carries — the human never sends a summary, only a decision.
            summary: `Agent delete (human-confirmed): Delete ${existing.kind} '${existing.title}' (${existing.slug})`,
            permission: "content.write",
          },
          mutation: {
            entityType: "post",
            entityId: id,
            operation: "delete",
            captureInverse: async () => {
              priorPost = existing;
              // The whole inverse of a soft delete is "clear the marker" — see
              // `core/commands/appliers.ts`'s `postDeleteReverter`.
              return { deletedAt: null };
            },
            execute: () =>
              deletePost({
                deps: { repo: routeDeps.postRepo, clock: routeDeps.clock, outbox: routeDeps.outbox, remove: routeDeps.removePost },
                input: {
                  workspaceId: routeDeps.workspaceId,
                  id,
                  actorId: ctx.principal.id,
                  actorPluginId: ASSISTANT_ACTOR_PLUGIN_ID,
                  // See content_post_create's identical delegatedBy* comment above.
                  delegatedByWorkspaceId: routeDeps.workspaceId,
                  delegatedById: ctx.principal.id,
                },
              }),
            captureEntityVersion: (r) => r.post.version,
            rollback: async () => {
              if (!priorPost) return;
              await restorePostForward({
                deps: {
                  repo: routeDeps.postRepo,
                  clock: routeDeps.clock,
                  outbox: routeDeps.outbox,
                  forgetRemoved: routeDeps.forgetRemovedPost,
                },
                input: {
                  prior: priorPost,
                  actorId: ctx.principal.id,
                  // Same delegatedBy* attribution the forward write above records.
                  delegatedByWorkspaceId: routeDeps.workspaceId,
                  delegatedById: ctx.principal.id,
                },
              });
            },
          },
        });

        // Drains deletePost's entry.unpublished event (published rows only) to SEO's sitemap-cache
        // invalidation subscriber — the same inline drain content_post_update and the routes perform.
        await processOutbox({ outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock });

        return { deleted: true, cancelled: false, post: toPostToolView(result.post) };
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
    },
  };

  // No `unwiredToolIds`: Posts/Pages wires its ENTIRE catalog, same tripwire discipline as
  // Forms/Entries/Widgets — a 7th catalog entry added without a handler fails the build.
  return buildDomainRegistrations({
    domain: "post",
    catalogModule: "features/post/agent-tools.ts",
    catalog: CATALOG_BY_ID as ReadonlyMap<string, PostAgentToolDefinition>,
    // The whole map at once, so no handler can be the one that forgot — which is precisely what
    // happened here before: `toModelFacingUpdateError` was correct and wired into `content_post_update`
    // alone while its five siblings sent the same classes straight into the SEC-005 redactor.
    // Composes with the three handlers' inner `withSchemaOnRejection` rather than competing with it:
    // a shape rejection is already a `ToolInputError` by the time it arrives, and
    // `reclassifyToolError` returns those untouched.
    handlers: withModelFacingErrors(handlers, POST_MODEL_FACING_ERRORS),
    derivedRisk: postDerivedRisk,
  });
}

/**
 * Derives `content_duplicate`'s default title for a post/page copy — see
 * `../content-duplication/derive-available-name.ts`'s header for the owner's numeric-suffix ruling
 * and the trailing-number rule. Only ever called when the caller supplied no explicit
 * `overrides.title` (see this function's one call site, guarded by `??`).
 *
 * Scoped to rows of the SAME `kind` as the source: a post and a page may legitimately share a title,
 * so a page named "About" must not be blocked by an unrelated post also named "About".
 *
 * @complexity One `postRepo.list()` scan (78 pages / 64 posts at current scale, read live
 * 2026-09-08 — see the shared module's own header for why this is an accepted O(n) scan rather than
 * a new port method), then {@link deriveDuplicateName}'s own bounded search.
 */
async function deriveDefaultDuplicateTitle(routeDeps: PostToolDeps, source: PostRecord): Promise<string> {
  const existingTitles = new Set(
    (await routeDeps.postRepo.list({ workspaceId: routeDeps.workspaceId }))
      .filter((post) => post.kind === source.kind)
      .map((post) => post.title)
  );
  return deriveDuplicateName(
    { sourceName: source.title },
    { isTaken: async (candidate) => existingTitles.has(candidate) }
  );
}

/**
 * Shared implementation behind `content_duplicate`'s `"post"` and `"page"` resource contributors
 * (see {@link contributePostDuplicateHandlers} below).
 *
 * This used to be `content_post_duplicate`'s own bespoke tool handler
 * (`ADS-memory/reports/2026-09-07-page-duplicate-tool.md`) — the owner's follow-up correction
 * (`ADS-memory/reports/2026-09-07-page-tool-gap.md`'s cross-resource redesign: "one tool per verb,
 * generic over resource" rather than one `*_duplicate` tool per resource) folded it behind
 * `content_duplicate` instead. The logic itself — including the widgetEmbed placement regeneration
 * and the bespoke-HTML fail-loudly path — is UNCHANGED; only how a caller reaches it moved.
 *
 * `guardKind` plays the disclosed-asymmetry disambiguation role `kind` played on the old bespoke
 * tool, and plays it identically for the `"post"`/`"page"` resource ids `content_duplicate` exposes:
 * `"page"` guards a mismatched actual `kind:"post"` source as not-found; `"post"` does not guard the
 * other way (`agent-tools.ts`'s own header). It is NOT the created row's own kind — that is always
 * the SOURCE's real kind, since kind is immutable once created.
 *
 * @complexity O(n) in the copied body's size (one `copyBodyJsonWithFreshEmbedPlacements` walk) plus
 * O(1) repo/command-gateway calls.
 */
async function duplicatePostOrPage(
  routeDeps: PostToolDeps,
  guardKind: PostKind,
  input: { principalId: string; id: string; overrides: { title?: string; slug?: string; status?: string } }
): Promise<Record<string, unknown>> {
  const sourceId = input.id;

  // Upfront content.read check, mirroring content_post_delete's identical shape: gates LEARNING
  // anything about the source row (its title/bodyJson would otherwise leak to a caller with no read
  // access, since this read happens before executeCommand's own content.write gate below ever
  // runs). `content_duplicate`'s own handler ALSO checks this resource's declared permission
  // (content.write) before calling here at all — see `contributePostDuplicateHandlers` below — so
  // this is a second, narrower gate on top of that outer one, not a replacement for it.
  await requireToolPermission(routeDeps, {
    principalId: input.principalId,
    permission: "content.read",
    entityType: "post",
    entityId: sourceId,
  });

  const { post: source } = await getAdminPostById({
    deps: { repo: routeDeps.postRepo },
    input: { workspaceId: routeDeps.workspaceId, id: sourceId },
  });
  // Disclosed asymmetry (agent-tools.ts's own header, mirrored verbatim from content_post_get):
  // guardKind "page" guards a mismatched actual kind:"post" row as not-found; "post" does not guard
  // the other way.
  if (guardKind === "page" && source.kind !== "page") {
    throw new PostNotFoundError(`page '${sourceId}' was not found`);
  }

  const overrideStatus = input.overrides.status;
  if (overrideStatus !== undefined && overrideStatus !== "draft" && overrideStatus !== "published") {
    throw new PostValidationError("status must be 'draft' or 'published'");
  }

  const title = input.overrides.title ?? (await deriveDefaultDuplicateTitle(routeDeps, source));
  const slug = input.overrides.slug;
  const status: PostStatus = overrideStatus ?? "draft";

  // Resolved BEFORE the new row is created, not after: an HTML page whose body genuinely cannot be
  // copied must fail loudly with NOTHING written — never an orphaned draft row left behind for the
  // operator to notice and clean up (see agent-tools.ts's own tool doc, and
  // features/content-duplication/agent-tools.ts's `content_duplicate` catalog entry).
  let sourceHtml: string | undefined;
  let bodyJsonForCreate: JsonObject | undefined;
  if (source.bodyFormat === "html") {
    if (!routeDeps.pagesHtmlStore) {
      throw new Error(
        `content_duplicate: '${sourceId}' is a bespoke-HTML page, and this workspace has no HTML-body ` +
          "store wired for duplication. Nothing was copied — its content is never silently dropped."
      );
    }
    sourceHtml = await routeDeps.pagesHtmlStore({ workspaceId: routeDeps.workspaceId, postId: sourceId }).read();
  } else {
    // The one piece of real design work this tool exists for — see duplicate-embeds.ts's own header
    // for why widgetEntryId is kept and placementId is regenerated, never the reverse.
    bodyJsonForCreate = copyBodyJsonWithFreshEmbedPlacements(source.bodyJson, () => routeDeps.idGen.newId());
  }

  const newId = routeDeps.idGen.newId();

  const { result } = await executeCommand<{ post: PostRecord }>({
    deps: postCommandDeps(routeDeps),
    command: {
      workspaceId: routeDeps.workspaceId,
      actor: { id: input.principalId, kind: AGENT_TOOL_PRINCIPAL_KIND },
      summary: `Agent duplicate ${source.kind} '${source.title}' as '${title}'`,
      permission: "content.write",
    },
    mutation: {
      entityType: "post",
      entityId: newId,
      operation: "create",
      captureInverse: async () => null,
      execute: () =>
        createPost({
          deps: {
            repo: routeDeps.postRepo,
            clock: routeDeps.clock,
            beforeSaveHook: routeDeps.pluginBeforeSaveHook,
            outbox: routeDeps.outbox,
          },
          // kind is the SOURCE's real kind (see this function's own doc), never the caller's
          // disambiguation input. bodyJson is omitted (undefined) on the HTML branch — the new row
          // is born as an ordinary empty "doc" row and converted by ensureHtmlFormat below, exactly
          // like pages_write_html's own first-write sequence.
          input: {
            workspaceId: routeDeps.workspaceId,
            id: newId,
            title,
            kind: source.kind,
            slug,
            bodyJson: bodyJsonForCreate,
            status,
            actorId: input.principalId,
            // See content_post_create's identical delegatedBy* comment above.
            delegatedByWorkspaceId: routeDeps.workspaceId,
            delegatedById: input.principalId,
          },
        }),
      captureEntityVersion: (r) => r.post.version,
    },
  });

  let finalPost = result.post;
  if (sourceHtml !== undefined) {
    // Seeds the new row's HTML body — mirrors pages_write_html's own `ensureHtmlFormat` step.
    // `result.post` is stale after this (still "doc" format, version 1); re-read to return the row's
    // real, post-conversion state.
    await routeDeps.pagesHtmlStore!({ workspaceId: routeDeps.workspaceId, postId: newId }).ensureHtmlFormat(sourceHtml);
    const { post: reread } = await getAdminPostById({
      deps: { repo: routeDeps.postRepo },
      input: { workspaceId: routeDeps.workspaceId, id: newId },
    });
    finalPost = reread;
  }

  // Mirrors content_post_create's identical inline processOutbox call — only fires an event when
  // this copy was itself created directly as `status: "published"` (the default is "draft", so the
  // common case enqueues nothing).
  await processOutbox({ outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock });

  return { post: toPostToolViewWithPublicUrl(routeDeps, finalPost) };
}

/**
 * `content_duplicate`'s resource contributors for `"post"` and `"page"` — see
 * `assistant/duplicate-resource-registry.ts` for the contract each entry satisfies. Both resolve to
 * `content.write`, the SAME permission `content_post_create`/`content_post_update` already declare
 * in this domain's own catalog (`agent-tools.ts`) — no new permission invented for the generic tool,
 * per the owner's explicit instruction to resolve each resource's permission from what it already
 * declares.
 *
 * Called from the composition root (`server/runtime/composition/tool-catalog-manifest.ts`'s
 * `installFirstPartyToolContributors`), NOT from within this domain — see
 * `duplicate-resource-registry.ts`'s own header for why a `features/post -> assistant` VALUE edge to
 * call `registerDuplicateResourceHandler` directly from here would reopen the exact module cycle
 * this domain's own `contributePostTools` history already fought to close. This function only
 * returns data; it imports the registry's TYPE, never its register function.
 */
export function contributePostDuplicateHandlers(): DuplicateResourceHandlerContributor[] {
  return [
    {
      resource: "post",
      build: (routeDeps) => ({
        permission: "content.write",
        duplicate: (input) => duplicatePostOrPage(routeDeps, "post", input),
      }),
    },
    {
      resource: "page",
      build: (routeDeps) => ({
        permission: "content.write",
        duplicate: (input) => duplicatePostOrPage(routeDeps, "page", input),
      }),
    },
  ];
}

// 2026-08-17: Post was briefly converted to the tool-contribution registry (`contributePostTools`,
// registered via `#src/assistant/index`'s `registerToolContributor`) alongside Comments/Newsletter,
// then reverted the same night — `check:architecture --list` showed it opened a NEW, larger module
// cycle: `assistant -> widgets` (still a static `DOMAIN_SLICES` import) + `widgets ->
// features/post` (`widgets/resolver-service.ts` imports `findPublishedPostById`) +
// `features/post -> assistant` (the reverted edge) closed a 3-cycle that pulled `export`,
// `features/deployments`, `features/source-control`, and `features/vendor-credentials` into one
// 7-module SCC — worse than the 4-module one this registry exists to remove. Unlike Comments/
// Newsletter (which import nothing else and nothing else imports), Post is depended on by other
// modules (`widgets`, `export`), so it cannot convert safely until either those edges are relocated
// or the still-static `widgets`/`deployments`/`source-control`/`vendor-credentials` DOMAIN_SLICES
// entries above convert too.
//
// RETRIED 2026-08-17 (same day, later pass) after `widgets` (Stage 2 batch 2) and `source-control`
// (this same later pass) both converted off `DOMAIN_SLICES`. Empirically wired
// `registerToolContributor` here and ran `check:architecture --list`: the `widgets`/`source-control`
// half of the original 7-module SCC is gone, but a NEW, smaller one remains — `[assistant, export,
// features/deployments, features/post, features/vendor-credentials]` (5 modules; "module cycles
// (mutual pairs)" read 1, "largest strongly-connected component" grew 0 -> 5, which
// `check-architecture.ts`'s own gate treats as a regression on the combined "module cycles / SCC"
// hard-constraint metric regardless of the mutual-pairs count). This is the SAME cluster that blocks
// `deployments`/`static-publish` (a previously-undocumented `features/vendor-credentials/store.ts`
// value import of `extractGitHubLogin` from `features/deployments/static-publish/index.ts` — see
// `features/deployments/tool-registrations.ts`'s own header) and `themes` (same cluster, `export`
// depends on both `features/theme` and, transitively via this domain, `features/post`). The exact
// edge chain linking `export`/`features/post` into this cluster was not fully re-traced beyond
// confirming the SCC membership above — out of scope for this dispatch. Reverted cleanly instead;
// still needs `deployments`'s own blocker fixed first (Option-B-style injection of
// `extractGitHubLogin` into `store.ts`) before a future retry has a chance.
//
// RETRIED 2026-08-17 (same session, later pass) after `deployments`/`static-publish` (the
// `vendor-credentials/store.ts` `extractGitHubLogin` fix) AND `themes` all converted off
// `DOMAIN_SLICES` — the exact fix the paragraph above called for, plus one more. That cleared the
// 5-module `[assistant, export, features/deployments, features/post, features/vendor-credentials]`
// cluster (confirmed: with `themes` converted the same way and its own SCC landing at 0, the shared
// `export` path was genuinely gone). But `check:architecture --list` still found a NEW, SMALLER
// cycle after wiring `registerToolContributor` here: `[assistant, features/post]` (2 modules; largest
// strongly-connected component 0 -> 2) — a previously-undocumented edge unrelated to the
// `export`/`vendor-credentials` cluster entirely. Root cause: `assistant/site/tools.ts` and
// `assistant/site/client-directives.ts` (the Site Assistant's own public/visitor-facing runtime, see
// `assistant/index.ts`'s "Section A" header) both value-import `listPublishedPosts` from
// `../../features/post` — a genuine, load-bearing dependency (the same predicate
// `routes/site/pages.ts` uses to resolve a slug into a live page), not a grep-visible import INTO
// `tool-registrations.ts` itself. `check:architecture`'s module graph is per-directory: `assistant`
// is ONE module spanning every file under `src/assistant/`, so this edge exists independent of
// anything `tool-registrations.ts` does, and `features/post -> assistant` (this file's own
// `registerToolContributor` call) closes the cycle directly against it — no chain through `export`
// or `vendor-credentials` required this time. Reverted cleanly instead. Safe conversion needs
// `listPublishedPosts` either relocated off `features/post`'s barrel into something `assistant/site/`
// can depend on without closing this loop, or injected into `assistant/site/tools.ts`/
// `client-directives.ts` the same Option-B-style way `vendor-credentials/store.ts` now takes
// `extractGitHubLogin` — not attempted here, new design work beyond this dispatch's scope (execute
// the recommended fix, don't re-litigate/extend the design).
//
// RETRIED AND LANDED HERE (2026-08-17, same day, final pass) after a Software Architect investigation
// (`ADS-memory/reports/architecture/2026-08-17-post-listpublishedposts-design-options.md`) confirmed
// the exact edge the paragraph above named and recommended Option A: inject `listPublishedPosts` into
// `assistant/site/tools.ts`'s `SiteAssistantToolDeps` and `assistant/site/client-directives.ts`'s
// `resolvePublicTarget` deps, both typed with a locally-declared structural `ListPublishedPosts`
// signature rather than an imported function type, and wire the real `features/post` function in
// ONLY at the one production composition root, `server/modules/site-assistant.ts`. That removed both
// value-import edges closing the cycle while leaving the actual function called at runtime
// byte-identical — the same Option-B-style technique `vendor-credentials/store.ts`'s
// `extractGitHubLogin` and `dual-read.ts`'s legacy-table imports already used. That report's Option B
// (moving `listPublishedPosts` itself out of `features/post`) and Option C (pushing the filter into
// `PostRepoPort`) were both considered and rejected — see its §4/§5. Rejecting Option C matters
// specifically: this codebase already tried pushing the predicate into the port layer once (the old
// `entries`/`EntryListPort` model `tools.ts` used before) and moved deliberately away from it, so
// reopening that shape to solve a graph-shape problem would trade a solved correctness risk for
// convenience — see `tools.ts`'s own header. `check:architecture --list` confirms 0 module cycles /
// largest SCC 0 with `post` wired this way — the last of the 25-domain rollout to convert. No
// production `assistant/site/*` file value-imports `features/post` anymore; both keep only their
// `import type` lines.
export function contributePostTools(): ToolContributor {
  return { domain: "post", build: buildPostRegistrations, risk: postDerivedRisk };
}
