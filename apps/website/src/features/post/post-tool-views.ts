import type { PostRecord } from "./post.js";
import type { PostKind } from "#src/contracts/core/post-kind";
import { ROOT_SLUG } from "./post.js";
import type { PostStatus } from "@jini-ai/cms/core";
import { entryPublicPath } from "#src/platform/routing/index";
import { currentIso, isScheduledAt } from "../../contracts/core/scheduled-publish.js";
import { resolveRuntimeMode } from "../../contracts/core/runtime-mode.js";
import type { PostToolDeps } from "./post-tool-deps.js";

/** What a Posts/Pages tool returns to the model — see {@link toPostToolView}. */
interface PostToolView {
  template?: string | null;
  author: string | null;
  showAuthor: boolean;
  id: string;
  kind: PostKind;
  title: string;
  slug: string;
  bodyJson: unknown;
  status: PostStatus;
  updatedAt: string;
  version: number;
  /** Present only when set, like on the record — see {@link scheduleView}. */
  publishAt?: string;
  featuredMediaId?: string;
  /** Present (always `true`) only while a published row waits for `publishAt`. */
  scheduled?: true;
}

/**
 * The schedule/featured-image keys of the tool view. Each is present only when set, so a row with
 * neither keeps the exact view shape it had before these fields existed. `scheduled` is computed
 * against the same wall clock routing's `isPublished` uses for `publicUrl`, so the model is told
 * the two facts together: `publicUrl` is null BECAUSE the post is waiting for `publishAt`.
 *
 * @complexity O(1).
 */
export function scheduleView(post: PostRecord): Pick<PostToolView, "publishAt" | "featuredMediaId" | "scheduled"> {
  return {
    ...(post.publishAt ? { publishAt: post.publishAt } : {}),
    ...(post.featuredMediaId ? { featuredMediaId: post.featuredMediaId } : {}),
    ...(isScheduledAt({ record: post, nowIso: currentIso() }) ? { scheduled: true as const } : {}),
  };
}

/** Projects a `PostRecord` into the explicit model-facing shape — `workspaceId` is dropped (the
 * agent is already scoped to one workspace it did not choose and cannot change), and the internal
 * `seoExtJson` sidecar (owned exclusively by `Jini/packages/cms/src/seo/write-service.ts`'s chokepoint, per `post.ts`'s
 * own field doc) is dropped too, mirroring `toHeadlessPost`'s own admin-facing projection. */
export function toPostToolView(post: PostRecord): PostToolView {
  return {
    id: post.id,
    kind: post.kind,
    title: post.title,
    slug: post.slug,
    bodyJson: post.bodyJson,
    status: post.status,
    updatedAt: post.updatedAt,
    version: post.version,
    author: post.author ?? null,
    showAuthor: post.showAuthor ?? false,
    ...(post.templateChoice !== undefined ? { template: post.templateChoice } : {}),
    ...scheduleView(post),
  };
}

/** {@link PostToolView} plus the resolved public path and the in-admin edit path — see this file's
 *  header ("`publicUrl`") for why these are a separate type rather than fields added to the base
 *  shape, and {@link resolveAdminUrl}'s own doc for `adminUrl`. */
export interface PostToolViewWithPublicUrl extends PostToolView {
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
export function resolvePublicUrl(routeDeps: PostToolDeps, post: PostRecord): string | null {
  const resolved = entryPublicPath({ post: post, ctx: { workspaceId: routeDeps.workspaceId } });
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
 *   `pageAdminPath` exactly: prefers `slug`, using `home` for the literal root slug `ROOT_SLUG`/`"/"`
 *   because `/` cannot be one path segment. The alias wins, so a real page with slug `home` uses
 *   its id to keep both pages accessible without reserving a public slug.
 * Both prefixed with `/admin`, `@jini-ai/admin/core`'s own `DEFAULT_ADMIN_BASE`
 * (`apps/admin/src/lib/router.ts`'s `ADMIN_BASE`) — the real, browser-visible admin URL, not the
 * SPA-router-relative path `pageAdminPath` itself returns before `adminHref()` prefixes it.
 *
 * @complexity O(1).
 */
export function resolveAdminUrl(post: PostRecord): string {
  if (post.kind === "post") return `/admin/posts/${post.id}`;
  if (post.slug === ROOT_SLUG) return "/admin/pages/home";
  const handle = post.slug === "home" ? post.id : post.slug;
  return `/admin/pages/${handle}`;
}

/**
 * {@link toPostToolView} plus {@link resolvePublicUrl}/{@link resolveAdminUrl} — the shape
 * `content_post_get`/`content_post_list`/`content_post_create` return to the model (see this file's
 * header, "`publicUrl`", and {@link resolveAdminUrl}'s own doc). Also used by
 * {@link duplicatePostOrPage} (`content_duplicate`'s `"post"`/`"page"` resource handlers) to shape
 * its own response identically.
 */
export function toPostToolViewWithPublicUrl(routeDeps: PostToolDeps, post: PostRecord): PostToolViewWithPublicUrl {
  return { ...toPostToolView(post), publicUrl: resolvePublicUrl(routeDeps, post), adminUrl: resolveAdminUrl(post) };
}

/** `publishedWhere` on a published write result when this instance is a local copy, not the live site. */
export const PUBLISHED_WHERE_LOCAL =
  "Published on this local site only, not on the live site. Say it is published on this site, not that it is live. " +
  "publish_content_publish sends it to the live site.";

/** `publishedWhere` on a published write result when this instance IS the live site (`TOVU_RUNTIME_MODE=production`). */
export const PUBLISHED_WHERE_LIVE = "Published on the live site (this instance is the live site).";

/**
 * `headerNavigation` on a `content_post_create` result for a page. Demo 2026-11-02: after creating
 * pages the chat's final summary named header links the live header did not show — the theme header
 * renders the site menu (the starter's `menu-header-nav` marker), not the page list, and nothing the
 * model saw said so. Static: the result names where header links come from and the tools that read
 * and change them, rather than this domain reading menus it does not own.
 */
export const PAGE_HEADER_NAVIGATION =
  "This page is not added to the site header automatically: the header shows the site menu (Admin → Menus), not the list of pages. " +
  "To link it from the header, add it with menus_update_menu_tree. Read the rendered menu’s record with content_read.menu. Never infer its links from the pages you created.";

/** {@link PAGE_HEADER_NAVIGATION} for a created page; posts are listed by the theme, not header-linked. @complexity O(1). */
export function headerNavigationView({ kind }: { kind: string }, _options = {}): { headerNavigation?: string } {
  return kind === "page" ? { headerNavigation: PAGE_HEADER_NAVIGATION } : {};
}

/**
 * Where a published write landed. Demo dry run 2026-10-05: a page created `status: "published"` on
 * the local site was reported as "Your page is live" — `status` + `publicUrl` alone read as the live
 * site, and nothing in the result said otherwise. Only the write results (create/update/duplicate)
 * carry it; reads and listings stay as they were.
 *
 * @complexity O(1).
 */
function publishedWhereView(routeDeps: PostToolDeps, post: PostRecord): { publishedWhere?: string } {
  if (post.status !== "published") return {};
  const mode = (routeDeps.runtimeMode ?? resolveRuntimeMode)();
  return { publishedWhere: mode === "production" ? PUBLISHED_WHERE_LIVE : PUBLISHED_WHERE_LOCAL };
}

/** {@link toPostToolViewWithPublicUrl} plus {@link publishedWhereView} — the create/update/duplicate result shape. */
export function toPostWriteResultView(routeDeps: PostToolDeps, post: PostRecord): PostToolViewWithPublicUrl & { publishedWhere?: string } {
  return { ...toPostToolViewWithPublicUrl(routeDeps, post), ...publishedWhereView(routeDeps, post) };
}
