import { createSeoPageHeadHook } from "#src/features/seo/page-head-contributor";
import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import { postPublicPath, urlFor } from "#src/platform/routing/index";
import { resolveWorkspaceOrigin, toAbsoluteUrl } from "@jini-ai/cms/seo";
import { foldPageHead, serializeHeadElements, type PageHeadContext } from "../../../http/site/page-head.js";
import type { RouteDeps } from "#src/server/routes/types";
import { resolveSiteTitleForRender } from "./render-context/site-title.js";

/**
 * SPEC-008 T049 — builds the `PageHeadContext` for one render (home/page have
 * no `entry`; the post route's `entry` is a serializable snapshot per
 * `page-head.ts`'s own "by value, not a live PostRecord" contract) and folds
 * every registered `page.head` contributor's output into one escaped string
 * ready for `renderSite`'s `extraHead`. Never throws — `foldPageHead` itself
 * is fail-closed-per-contributor (a broken SEO lookup degrades to no extra
 * head tags, never a 500).
 *
 * `"page"` (2026-08-19, SPEC-008 T045 gap fix part 2) — a static theme's own
 * marketing page (`theme.pages[slug]`) has no backing `PostRecord` at all, so
 * it folds the same entry-less shape `"home"` always has (site-level title +
 * canonical only, per `createSeoPageHeadHook`'s `!ctx.entry` branch — there is
 * no per-page SEO metadata to resolve without an entry, a disclosed limit of
 * today's SEO data model, not something this fix invents). The one thing that
 * DOES differ from `"home"` is the canonical path: `"/"` is only correct for
 * the home route itself, so `canonicalFallbackPath` lets a `"page"` caller
 * supply its own (`/${slug}`) instead of silently reusing home's `"/"`.
 * Ignored whenever `post` is provided (its own resolved/derived slug path
 * always wins), so every pre-existing `"home"`/`"post"` call site is
 * unaffected by this parameter's addition.
 *
 * `canonicalUrl` (2026-09-03, absolute-URL fix) — was a bare path (`/`, `/docs`) on every route,
 * reproduced on both production and local via `curl`. Joined onto the workspace's verified origin
 * via `toAbsoluteUrl`/`resolveWorkspaceOrigin` (`features/seo`'s own seam — see `absolute-url.ts`'s
 * file header for why this lives there and not in `platform/routing`), same fix and same
 * degradation contract (no verified origin yet -> stays relative) as `seo.ts`'s `resolveCanonical`.
 */
export async function buildExtraHead({ deps, route, siteTitle, post }: { deps: RouteDeps; route: "home" | "post" | "page"; siteTitle: string; post: PostRecord | undefined }, { canonicalFallbackPath = "/" }: { canonicalFallbackPath?: string } = {}): Promise<string> {
  const canonical = post
    ? (await urlFor({ deps: { postRepo: deps.postRepo }, target: { kind: "entryRef", entryId: post.id, contentType: post.kind }, ctx: { workspaceId: deps.workspaceId } }))?.canonicalUrl
    : undefined;
  const origin = deps.seoDeps.renderBaseUrl ? undefined : await resolveWorkspaceOrigin({ originRegistry: deps.originRegistry, workspaceId: deps.workspaceId, runtimeMode: deps.seoDeps.runtimeMode }, {});

  const ctx: PageHeadContext = {
    workspaceId: deps.workspaceId,
    route,
    siteTitle,
    canonicalUrl: toAbsoluteUrl({ origin, baseUrl: deps.seoDeps.renderBaseUrl, path: canonical ?? (post ? postPublicPath({ slug: post.slug }) : canonicalFallbackPath) }, {}),
    entry: post
      ? {
          id: post.id,
          type: post.kind,
          slug: post.slug,
          title: post.title,
          status: post.status,
          updatedAt: post.updatedAt,
          ext: {},
        }
      : undefined,
  };

  // Contributors close over this render only; another app/export cannot replace their dependencies.
  const seoHook = createSeoPageHeadHook({
    deps: deps.seoDeps,
    rootSlug: deps.seoDeps.rootSlug,
    siteTitle: () => resolveSiteTitleForRender(deps, { preserveAuthoredFallback: true }),
  });
  const elements = await foldPageHead(ctx, { contributors: [seoHook, ...(deps.pageHeadContributors ?? [])] });
  return serializeHeadElements({ elements });
}
