import type { Response } from "express";

import type { PostRecord } from "#src/features/post/index";
import { getPresentationSettings } from "#src/features/presentation/index";
import { getPublishedPostBySlug, listPublishedPosts, PostNotFoundError } from "#src/features/post/index";
import { isPublicAssistantEnabled } from "#src/assistant/public-assistant-settings";
import {
  findTheme,
  renderStaticPage,
  injectPostEmbedId,
  injectPageContent,
  resolvePostTemplate,
  resolvePageTemplate,
  isEligibleForPostTemplateBranch,
  isEligibleForPageTemplateBranch,
  scanMenuEmbedIds,
  type DiscoveredTheme,
  type StaticMenuItem,
} from "#src/features/theme/index";
import {
  resolveHtmlPageEmbeds,
  resolvePageWidgets,
  type ResolveHtmlPageEmbedsResult,
  type ResolvePageWidgetsResult,
} from "#src/widgets/resolver-service";
import { runPostContentPhase, runPreContentPhase, urlFor } from "#src/routing/index";
import type { RouteTarget } from "#src/routing/index";
import { resolveMenuDoc } from "#src/navigation/index";
import type { NavTarget, ResolveTargetHrefFn } from "#src/navigation/index";
import { getLatestTransformDefinition } from "#src/media/index";
import { CORE_PUBLIC_TRANSFORM_NAME } from "#src/media/bootstrap";
import { foldPageHead, serializeHeadElements, type PageHeadContext } from "../../http/site/page-head";
import { renderSite, renderHtmlPageBody, type MediaAssetRenderMeta } from "../../http/site/render";
import type { RouteDeps, RouteRegistrar } from "../types";

/**
 * SPEC-008 T049 — builds the `PageHeadContext` for one render (home has no
 * `entry`; the post route's `entry` is a serializable snapshot per
 * `page-head.ts`'s own "by value, not a live PostRecord" contract) and folds
 * every registered `page.head` contributor's output into one escaped string
 * ready for `renderSite`'s `extraHead`. Never throws — `foldPageHead` itself
 * is fail-closed-per-contributor (a broken SEO lookup degrades to no extra
 * head tags, never a 500).
 */
async function buildExtraHead(
  deps: RouteDeps,
  route: "home" | "post",
  siteTitle: string,
  post: PostRecord | undefined
): Promise<string> {
  const canonical = post
    ? (await urlFor({ deps: { postRepo: deps.postRepo }, target: { kind: "entryRef", entryId: post.id, contentType: post.kind }, ctx: { workspaceId: deps.workspaceId } }))?.canonicalUrl
    : undefined;

  const ctx: PageHeadContext = {
    workspaceId: deps.workspaceId,
    route,
    siteTitle,
    canonicalUrl: canonical ?? (post ? `/${post.slug}` : "/"),
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

  const elements = await foldPageHead(ctx);
  return serializeHeadElements(elements);
}

/**
 * SPEC-009 (Redirects) REQ-18/19: run the registered `pre_content` phase
 * (redirect rules with `overrideContent: true`) before any content lookup,
 * and `post_content` (the default case) only after a content lookup has
 * failed — the exact `pre_content -> content-resolve -> post_content` order
 * ADR-039 §1 documents. Issues the redirect and returns `true` if a phase
 * matched; the caller falls through to its own content/404 handling on `false`.
 */
async function tryRedirectPhase(
  phase: "pre_content" | "post_content",
  path: string,
  workspaceId: string,
  res: Response
): Promise<boolean> {
  const outcome =
    phase === "pre_content"
      ? await runPreContentPhase(path, { workspaceId })
      : await runPostContentPhase(path, { workspaceId });
  if (!outcome || outcome.kind !== "redirect") return false;
  res.redirect(outcome.statusCode, outcome.location);
  return true;
}

const SITE_TITLE = "Tovu Demo Site";

/**
 * Resolve the theme to render with: the active theme when discovered and valid,
 * otherwise the first valid theme, otherwise the first discovered theme. This is
 * the render-time fallback that keeps the public site from 500-ing when the
 * active theme id is missing/invalid (SPEC-004 REQ-10, spike-level).
 */
function resolveActiveTheme(deps: RouteDeps, activeThemeId: string): DiscoveredTheme | null {
  const active = findTheme({ themes: deps.themes, id: activeThemeId });
  if (active && active.status === "valid") return active;
  return deps.themes.find((t) => t.status === "valid") ?? deps.themes[0] ?? null;
}

/**
 * SPEC-043/ADR-047 W-004 — resolves every widget placed in one of `theme.manifest.regions` (REQ-13)
 * ahead of `renderSite`, per REQ-23, PLUS (2026-08-05 fix) any inline `widgetEmbed` node in `post`'s
 * own `bodyJson` when rendering a real post. `render.ts` stays a pure "resolved data -> HTML"
 * renderer (it receives `posts`/`post` pre-resolved the exact same way); this is the one call site,
 * mirroring the outline's Wiring Map row W-004. `resolvePageWidgets` itself never throws (REQ-27) —
 * no extra try/catch needed beyond the route handler's own existing one.
 *
 * Was previously always omitted: `resolvePageWidgets` took a `pageEntryId` to fetch via
 * `EntryRepoPort.findById`, but `PostRecord` (`features/post`) is a separate, pre-ADR-022 table no
 * `entries` lookup can ever resolve, so no real caller ever supplied one and every `widgetEmbed`
 * node authored into a post's body rendered the REQ-28 placeholder forever (implementation-outline-
 * addendum.md Finding 1b). Fixed by having `resolvePageWidgets` accept the already-fetched
 * `post.bodyJson` directly (`pageBodyJson`) instead of an id to re-fetch — this route already holds
 * `post` by the time it calls this, so no extra lookup is needed either way.
 */
async function resolveWidgetsForRender(deps: RouteDeps, theme: DiscoveredTheme, post?: PostRecord): Promise<ResolvePageWidgetsResult> {
  return resolvePageWidgets({
    deps: { bindingRepo: deps.widgetBindingRepo, entryRepo: deps.entryRepo },
    input: { workspaceId: deps.workspaceId, pageBodyJson: post?.bodyJson, resolvedRegions: theme.manifest.regions ?? [] },
  });
}

/**
 * SPEC-047 Slice 2 — resolves an `"html"`-format Page's `data-embed-type`
 * placeholders ahead of `renderSite`, mirroring `resolveWidgetsForRender`'s own "route resolves,
 * `render.ts` stays I/O-free" split immediately above. `undefined` for a `"doc"` post (nothing to
 * resolve — `renderSite`'s `pageHtmlEmbeds` param is optional for exactly this case) so this is a
 * no-op call on every route/render that isn't an html Page.
 */
async function resolveHtmlEmbedsForRender(deps: RouteDeps, post: PostRecord | undefined): Promise<ResolveHtmlPageEmbedsResult | undefined> {
  if (!post || post.bodyFormat !== "html") return undefined;
  return resolveHtmlPageEmbeds({
    deps: { entryRepo: deps.entryRepo, mediaRepo: deps.mediaRepo, transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: deps.workspaceId, html: post.bodyHtml ?? "" },
  });
}

/** `NavTarget` (`navigation`) and `RouteTarget` (`routing`) are two independently-declared
 * discriminated unions with the same four kinds and matching fields (see `routing/types.ts`'s file
 * header: the vocabulary was "promoted from Menus-local to routing-owned" precisely so both domains
 * share it) — but they remain two separate type declarations, not one shared import, so this maps
 * explicitly per-kind rather than relying on structural assignability compiling by coincidence.
 */
function navTargetToRouteTarget(target: NavTarget): RouteTarget {
  switch (target.kind) {
    case "entryRef":
      return { kind: "entryRef", entryId: target.entryId };
    case "termRef":
      return { kind: "termRef", termId: target.termId, taxonomy: target.taxonomy };
    case "url":
      return { kind: "url", href: target.href };
    case "route":
      return { kind: "route", route: target.route, params: target.params };
  }
}

/**
 * Direct menu-embed wiring (2026-08-10, superseding the earlier `header`/`footer`
 * navLocationBindings scheme) — resolves every `data-embed-type="menu"` marker a `static`-tier
 * active theme's own pages/partials reference (`scanMenuEmbedIds`) into render-ready link data,
 * ahead of `renderSite`/`renderStaticPage`. Mirrors `resolveWidgetsForRender`'s own "route resolves,
 * render stays I/O-free" split (this is the one call site for this resolution).
 *
 * A theme marker now names a real stored menu `id` directly (e.g. `data-embed-id="menu-header-nav"`)
 * — the same `data-embed-type`/`data-embed-id` convention posts already use (`injectPostEmbedId`) —
 * rather than a theme-independent named location resolved through `nav_location_bindings`. This
 * intentionally leaves `resolveForLocation`, `navLocationBindingRepo`, and the Menus admin screen's
 * "Assign location" feature in place but UNUSED for static-tier header/footer rendering specifically:
 * they are not deleted (other tiers or a future deprecation may still want them), simply no longer
 * on this call path. `resolveMenuDoc` (`navigation`) is the doc-level building block
 * `resolveForLocation` itself composed on top of a location lookup — called directly here per
 * referenced menu id instead. It still needs the same injected `resolveTargetHref` seam `routing`'s
 * own `urlFor` backs, for exactly the same reason `resolveForLocation` needed it.
 *
 * Non-static themes never call this (checked by the caller); declarative/templated/handlebars themes
 * have their own, separate `menu` WIDGET type (`widgets/resolvers/menu.ts`, `resolveMenuDoc` over an
 * explicit per-instance `menuRef`) that already renders real menu content today — a different,
 * narrower mechanism (one specific menu placed by an author, not a theme marker naming a shared
 * site-wide menu), left untouched by this change.
 *
 * A referenced id absent from the returned map (no such menu, wrong workspace, or a theme-authoring
 * typo) is `renderStaticPage`'s own `injectMenuEmbed` treating "no entry" as "leave the theme's
 * authored fallback content untouched" — no caller-side branching needed for that case either.
 *
 * @complexity One `menuRepo.findById` + `resolveMenuDoc` pair per distinct menu id the theme's
 * markup references (bounded in practice to the small, fixed set an author wrote into the theme's
 * own files), run concurrently.
 */
async function resolveStaticMenusForRender(
  deps: RouteDeps,
  theme: DiscoveredTheme,
  currentPath: string
): Promise<Readonly<Record<string, readonly StaticMenuItem[]>>> {
  if (theme.manifest.tier !== "static") return {};

  const menuIds = scanMenuEmbedIds(theme);
  if (menuIds.length === 0) return {};

  const resolveTargetHref: ResolveTargetHrefFn = async (target) => {
    const resolved = await urlFor({
      deps: { postRepo: deps.postRepo },
      target: navTargetToRouteTarget(target),
      ctx: { workspaceId: deps.workspaceId },
    });
    return resolved ? { path: resolved.path, available: true } : null;
  };

  const entries = await Promise.all(
    menuIds.map(async (menuId): Promise<readonly [string, readonly StaticMenuItem[]] | undefined> => {
      // Resolved by SLUG first, id second. A theme marker is authored once and shipped to every
      // install, but `createMenu` mints a menu's id with `idGen.newId()` — so a hardcoded
      // `data-embed-id` could only ever match on the one install where that random id happened to
      // be generated. The slug is the stable machine handle the model already documents for exactly
      // this ("e.g. `primary-nav`", navigation/types.ts:161), so it is what a shipped theme can
      // actually name. The id lookup stays as the fallback for a marker pointing at a specific
      // stored menu, which is what the pre-2026-08-10 behavior did unconditionally.
      const menu =
        (await deps.menuRepo.findBySlug({ workspaceId: deps.workspaceId, slug: menuId })) ??
        (await deps.menuRepo.findById({ workspaceId: deps.workspaceId, id: menuId }));
      if (!menu) return undefined;
      const items = await resolveMenuDoc({
        doc: menu.doc,
        context: { workspaceId: deps.workspaceId, currentPath },
        resolveTargetHref,
      });
      return [menuId, items] as const;
    })
  );

  return Object.fromEntries(
    entries.filter((entry): entry is readonly [string, readonly StaticMenuItem[]] => entry !== undefined)
  );
}

/**
 * Post-template-picker feature (2026-08-10) — an explicit "not configured" page, in the owner's own
 * words from the design conversation, rather than a silent fallback to generic rendering. Reuses the
 * theme's own `.hero`/`.wrap` centering (proven correct this session — an earlier attempt at a
 * DIFFERENT centered page on this same theme used the wrong CSS class and silently rendered
 * left-aligned; `.hero` is the one already confirmed to center via real `margin: auto`, not just
 * `text-align: center` on a narrow box) and the same nav/footer/token-injection shell every static
 * page gets, via `renderStaticPage`'s `htmlOverride` — so this looks like a real page on the site,
 * not a bare error string.
 */
function buildMissingPostTemplateHtml(): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<title>Template not configured</title>",
    '<link rel="stylesheet" href="../css/styles.css" />',
    "</head>",
    "<body>",
    // Authored in the same marker vocabulary a theme file uses, because `renderStaticPage` resolves
    // this override through the exact same `resolveSlots` pass — the retired `data-tovu-slot`
    // spelling this carried until 2026-08-10 would have left two raw `<div>`s in the diagnostic
    // page, i.e. the error page telling an author something is misconfigured would itself have been
    // the most visibly broken page on the site.
    `<div data-embed-config='{"type":"partial","id":"nav","current":""}'></div>`,
    "<main>",
    '<section class="hero wrap">',
    '<div class="eyebrow-row"><span class="status-pill"><span class="dot"></span>Not configured</span></div>',
    "<h1>This page is missing a post id or the ability to render posts with a data-embed-* tag</h1>",
    '<p class="lede">This post has no template chosen, or its chosen template has no post slot to render into. Pick a template in the post editor to fix this.</p>',
    "</section>",
    "</main>",
    `<div data-embed-config='{"type":"partial","id":"footer"}'></div>`,
    "</body>",
    "</html>",
  ].join("\n");
}

/**
 * {@link buildMissingPostTemplateHtml}'s counterpart for a Page whose chosen template could not be
 * honored (Task 4, 2026-08-11) — same reused `.hero`/`.wrap` shell, same `renderStaticPage`
 * `htmlOverride` mechanism, different copy naming the Pages editor rather than the post editor.
 */
function buildMissingPageTemplateHtml(): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<title>Template not configured</title>",
    '<link rel="stylesheet" href="../css/styles.css" />',
    "</head>",
    "<body>",
    `<div data-embed-config='{"type":"partial","id":"nav","current":""}'></div>`,
    "<main>",
    '<section class="hero wrap">',
    '<div class="eyebrow-row"><span class="status-pill"><span class="dot"></span>Not configured</span></div>',
    "<h1>This page has no usable template</h1>",
    '<p class="lede">This page\'s chosen template has no content slot to render into, or the active theme declares no page templates. Pick a different template in the Pages editor to fix this.</p>',
    "</section>",
    "</main>",
    `<div data-embed-config='{"type":"partial","id":"footer"}'></div>`,
    "</body>",
    "</html>",
  ].join("\n");
}

/**
 * Post-template-picker feature (2026-08-10) — renders `post` through its chosen static-theme
 * template (`theme.json`'s `postTemplate` array), or the explicit diagnostic page above when
 * unresolvable. Only called when the active theme is `static` tier AND declares a non-empty
 * `postTemplate` array (checked by the caller) — a theme that doesn't declare this array simply
 * doesn't support the feature yet, which is a theme-capability gap, not a per-post misconfiguration,
 * so those themes fall through to the pre-existing generic post rendering unchanged, not this branch.
 *
 * Which template (or the diagnostic page) a post resolves to is decided by the pure
 * {@link resolvePostTemplate} — including the `templateChoice` tri-state, whose `null` vs `""`
 * distinction that function's own doc explains in full. This function owns only the embed-resolution
 * I/O that follows.
 */
async function renderPostViaTemplate(
  deps: RouteDeps,
  theme: DiscoveredTheme,
  post: PostRecord,
  staticMenus: Readonly<Record<string, readonly StaticMenuItem[]>> | undefined
): Promise<string> {
  const resolution = resolvePostTemplate({ theme, templateChoice: post.templateChoice });
  if (resolution.kind === "diagnostic") {
    return (
      renderStaticPage({
        theme,
        pageId: "post-template-missing",
        htmlOverride: buildMissingPostTemplateHtml(),
        menus: staticMenus,
      }) ?? ""
    );
  }
  const { pageId, html: rawTemplate } = resolution;

  const withRealId = injectPostEmbedId(rawTemplate, post.id);
  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo: deps.entryRepo, postRepo: deps.postRepo },
    input: { workspaceId: deps.workspaceId, html: withRealId },
  });
  const bodyResolvedHtml = renderHtmlPageBody(withRealId, resolved);
  return renderStaticPage({ theme, pageId, htmlOverride: bodyResolvedHtml, menus: staticMenus }) ?? "";
}

/**
 * Pages template picker (Task 4, 2026-08-10 recon / 2026-08-11 build) — the `renderPostViaTemplate`
 * counterpart for a `kind: "page"`, `bodyFormat: "html"` record. Only called when
 * `isEligibleForPageTemplateBranch` already returned `true` for this `theme`/`post` pair (checked by
 * the caller, same convention as `renderPostViaTemplate`).
 *
 * Structurally simpler than `renderPostViaTemplate`: there is no id to substitute and no async
 * lookup to defer. `post.bodyHtml` is already the exact string to render — this function's whole
 * job is deciding WHICH template via {@link resolvePageTemplate}, splicing that body in via
 * {@link injectPageContent} (the `{"type":"content"}` marker, Task 3), then resolving whatever
 * `widget`/`media`/`post` markers exist in the COMBINED template+body string (the page's own
 * authored embeds included, not only the template's).
 */
async function renderPageViaTemplate(
  deps: RouteDeps,
  theme: DiscoveredTheme,
  post: PostRecord,
  staticMenus: Readonly<Record<string, readonly StaticMenuItem[]>> | undefined
): Promise<string> {
  const resolution = resolvePageTemplate({ theme, templateChoice: post.templateChoice });
  if (resolution.kind === "diagnostic") {
    return (
      renderStaticPage({
        theme,
        pageId: "page-template-missing",
        htmlOverride: buildMissingPageTemplateHtml(),
        menus: staticMenus,
      }) ?? ""
    );
  }
  const { pageId, html: rawTemplate } = resolution;

  const withContent = injectPageContent(rawTemplate, post.bodyHtml ?? "");
  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo: deps.entryRepo, postRepo: deps.postRepo },
    input: { workspaceId: deps.workspaceId, html: withContent },
  });
  const bodyResolvedHtml = renderHtmlPageBody(withContent, resolved);
  return renderStaticPage({ theme, pageId, htmlOverride: bodyResolvedHtml, menus: staticMenus }) ?? "";
}

/**
 * ADR-027 §4 — resolves the latest registered version of the one core transform NAME a
 * ref-based `{assetId, transformName}` image node can use today
 * (`CORE_PUBLIC_TRANSFORM_NAME`, `media/bootstrap.ts`), ahead of `renderSite`. Mirrors
 * `resolveWidgetsForRender`'s "route resolves, `render.ts` stays I/O-free" split — this is the
 * ONE call site for media resolution, same shape as that function's own doc.
 *
 * Deliberately does NOT scan `post.bodyJson` for every distinct `transformName` an author's doc
 * might reference (the way `resolveHtmlPageEmbeds` scans a Page's `body_html` for embed ids):
 * `registerTransform` has exactly one caller anywhere in this codebase
 * (`ensureCoreMediaTransform`, `server/deps.ts`'s boot chain), which only ever registers
 * `CORE_PUBLIC_TRANSFORM_NAME` — there is no OTHER registered name a real ref could resolve
 * against yet, so a single-name lookup is behavior-identical to a full scan at today's real
 * scale. A second core-declared transform (`thumb`, `hero`, ...) would need this widened to a
 * real scan, same as the widget/html-embed resolvers already do for their own multi-id case —
 * disclosed here rather than silently assumed permanent.
 *
 * Returns an empty map (not a thrown error) when the transform is not yet registered (a
 * mid-boot race, or a workspace this hasn't run for) — `renderDocNode`'s `image` case already
 * treats a missing map entry as "not resolvable" and degrades to the placeholder, so this
 * function never needs its own try/catch beyond the route handler's existing one.
 */
async function resolveMediaTransformVersionsForRender(deps: RouteDeps): Promise<ReadonlyMap<string, number>> {
  const definition = await getLatestTransformDefinition({
    deps: { transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: deps.workspaceId, name: CORE_PUBLIC_TRANSFORM_NAME },
  });
  return definition ? new Map([[CORE_PUBLIC_TRANSFORM_NAME, definition.version]]) : new Map();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Walks a TipTap-shaped `bodyJson` tree collecting every ref-based `image` node's `assetId`
 * (ADR-027 §4's `{assetId, transformName}` shape) — same walk shape as `resolver-service.ts`'s
 * `collectWidgetEmbeds`, kept as a separate local copy since this module has no dependency on
 * that one. A legacy `image` node (only `attrs.src`/`attrs.title`, no `assetId`) is simply never
 * added — `render.ts`'s `image` case never reads `src`/`title` at all (see that case's own
 * comment), so there is nothing for a sizing override to key off for that shape anyway. */
function collectImageAssetIds(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectImageAssetIds(child, out);
    return;
  }
  if (!isPlainObject(node)) return;
  if (node.type === "image" && isPlainObject(node.attrs) && typeof node.attrs.assetId === "string") {
    out.add(node.attrs.assetId);
  }
  if (Array.isArray(node.content)) collectImageAssetIds(node.content, out);
}

/**
 * Quick-and-dirty public-render sizing fix (owner-directed skip-the-ADR fix, 2026-08-05) —
 * resolves each ref-based image node's `MediaRecord.width`/`height`/`cssClass` override ahead of
 * `renderSite`, mirroring `resolveWidgetsForRender`/`resolveMediaTransformVersionsForRender`'s own
 * "route resolves, `render.ts` stays I/O-free" split (this is the one call site for this
 * resolution, same shape as those functions' own doc).
 *
 * Unlike `resolveMediaTransformVersionsForRender`, there is no single-name shortcut available here
 * — width/height/class are genuinely PER-ASSET values, not a property of `(workspaceId,
 * transformName)` alone — so this scans `post.bodyJson` for every distinct `assetId` a ref-based
 * `image` node references (mirroring `resolveHtmlPageEmbeds`'s own per-id scan for a Page's
 * `body_html`), then batch-fetches each one. `MediaRepoPort` (`@jini-ai/cms/media`) has no
 * `findByIds`/batch-by-id primitive — only `findById` — the same frozen-contract situation
 * `resolvePageWidgets`'s own file header discloses for `EntryRepoPort`; one `findById` per
 * distinct `assetId`, run concurrently, is the available primitive at today's real scale (a post
 * body with dozens of distinct images would need this widened to a real batch query, same as the
 * widget/html-embed resolvers already disclose for their own multi-id case).
 *
 * Never throws — a lookup that resolves to `null` (deleted, wrong workspace, or an id that was
 * never a real asset) is skipped, not thrown; the caller's `image` case already treats an
 * `assetId` absent from the returned map as "no override" (omit the attribute), never a crash.
 *
 * @complexity O(a) over the distinct `assetId`s referenced, each behind one `findById` call
 * (run concurrently via `Promise.all`, not serially).
 */
async function resolveMediaAssetMetadataForRender(
  deps: RouteDeps,
  post: PostRecord | undefined
): Promise<ReadonlyMap<string, MediaAssetRenderMeta>> {
  if (!post) return new Map();
  const assetIds = new Set<string>();
  collectImageAssetIds(post.bodyJson, assetIds);
  if (assetIds.size === 0) return new Map();

  const entries = await Promise.all(
    Array.from(assetIds).map(async (assetId): Promise<readonly [string, MediaAssetRenderMeta] | undefined> => {
      const record = await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: assetId });
      if (!record) return undefined;
      return [assetId, { width: record.width, height: record.height, cssClass: record.cssClass }] as const;
    })
  );
  return new Map(entries.filter((entry): entry is readonly [string, MediaAssetRenderMeta] => entry !== undefined));
}

/**
 * Public site: server-rendered home and post pages through the active
 * declarative theme. Registered LAST — GET /:slug is a catch-all for
 * single-segment paths.
 */
export const registerSiteRoutes: RouteRegistrar = (app, deps) => {
  app.get("/", async (req, res) => {
    try {
      if (await tryRedirectPhase("pre_content", req.path, deps.workspaceId, res)) return;

      const [{ posts }, settings, siteAssistantEnabled] = await Promise.all([
        listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
        getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
        // ADR-054 — the visitor-chat master switch. `render.ts` never reads settings itself; every
        // route that calls `renderSite` resolves this the same way (see `pages.ts`'s other handler
        // and `products.ts`'s two handlers).
        isPublicAssistantEnabled({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId }),
      ]);

      const theme = resolveActiveTheme(deps, settings.settings.activeThemeId);
      if (!theme) {
        res.status(500).type("html").send("<h1>No themes installed</h1>");
        return;
      }

      const [widgets, mediaTransformVersions, extraHead, staticMenus] = await Promise.all([
        resolveWidgetsForRender(deps, theme),
        resolveMediaTransformVersionsForRender(deps),
        buildExtraHead(deps, "home", SITE_TITLE, undefined),
        resolveStaticMenusForRender(deps, theme, "/"),
      ]);
      res.type("html").send(
        await renderSite({
          theme,
          route: "home",
          siteTitle: SITE_TITLE,
          posts,
          widgets,
          mediaTransformVersions,
          extraHead,
          siteAssistantEnabled,
          staticMenus,
        }),
      );
    } catch {
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });

  app.get("/:slug", async (req, res, next) => {
    // A trailing .html is accepted and stripped so /blog.html resolves identically to /blog — a
    // static theme's own page files are still named foo.html on disk, and someone can always type
    // or bookmark the literal filename even though rewritePageLinks() only ever emits clean routes.
    const slug = String(req.params.slug ?? "").replace(/\.html$/, "");
    // Not a site page — let API/static/404 handling continue.
    if (!slug.match(/^[a-z0-9-]+$/) || slug === "admin" || slug === "api") {
      next();
      return;
    }

    let theme: DiscoveredTheme | null = null;
    let staticMenus: Readonly<Record<string, readonly StaticMenuItem[]>> | undefined;
    try {
      if (await tryRedirectPhase("pre_content", req.path, deps.workspaceId, res)) return;

      const [settings, { posts }, siteAssistantEnabled] = await Promise.all([
        getPresentationSettings({ deps: { repo: deps.presentationRepo }, input: { workspaceId: deps.workspaceId } }),
        listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
        isPublicAssistantEnabled({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId }),
      ]);

      theme = resolveActiveTheme(deps, settings.settings.activeThemeId);
      if (!theme) {
        res.status(500).type("html").send("<h1>No themes installed</h1>");
        return;
      }

      // Resolved once per request (not just for the marketing-page branch below) — the requested
      // path is the correct `currentPath` for `isCurrent` regardless of whether this request ends up
      // rendering a marketing page, a post-template page, or the themed 404 below; all three share
      // this one resolve rather than re-querying the same two locations per branch.
      staticMenus = await resolveStaticMenusForRender(deps, theme, req.path);

      // Fixed routes for a static theme's own marketing pages (pricing/docs/blog/…), checked before
      // the post lookup below — a static theme page is never expected to also be a Post row, so this
      // must resolve before `getPublishedPostBySlug` gets a chance to throw `PostNotFoundError` for a
      // slug that was never meant to be a post in the first place (it used to run inside the same
      // `Promise.all` as the post lookup, so that throw short-circuited straight past this check).
      //
      // Slug-collision override (2026-08-10) — the theme page still wins by default (reserved,
      // reliable namespace), UNLESS a real post at this exact slug has explicitly opted to override
      // it (`overridesThemePage`, set via the admin UI's collision warning). Checked with its own
      // lookup here, swallowing `PostNotFoundError` locally rather than letting it reach the outer
      // catch — "no post at this slug" is the overwhelmingly common case for a marketing-page route
      // and must NOT 404 the theme page that's about to render fine.
      let overridingPost: PostRecord | undefined;
      if (theme.manifest.tier === "static" && slug !== "index" && theme.pages[slug] !== undefined) {
        const candidate = await getPublishedPostBySlug({
          deps: { repo: deps.postRepo },
          input: { workspaceId: deps.workspaceId, slug },
        }).catch((err) => {
          if (err instanceof PostNotFoundError) return null;
          throw err;
        });
        if (candidate?.post.overridesThemePage) {
          overridingPost = candidate.post;
        } else {
          const staticHtml = renderStaticPage({ theme, pageId: slug, menus: staticMenus });
          if (staticHtml) {
            res.type("html").send(staticHtml);
            return;
          }
        }
      }

      const { post } = overridingPost
        ? { post: overridingPost }
        : await getPublishedPostBySlug({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, slug } });

      // Post-template-picker feature (2026-08-10) — a `bodyFormat: "doc"` post ("formulaic" content,
      // the owner's own term) renders through its chosen theme template instead of the generic
      // post-rendering path below, whenever the active theme actually supports templates.
      //
      // `kind: "page"` rows with `bodyFormat: "doc"` DO also flow through this branch, but only on an
      // explicit `templateChoice` (see `isEligibleForPostTemplateBranch`'s doc) — NOT on the "never
      // chosen, fall back to the theme's first template" arm that Posts rely on. That arm is safe for
      // Posts (an author genuinely had no opinion) but was firing for legacy Pages that have never had
      // any admin surface to set `template_choice` at all, which is how `terms-of-service` et al. were
      // rendering under the theme's first Post template (`<title>Blog post — Basic</title>`) on the
      // live site — fixed here by gating on `kind`, not just `bodyFormat`.
      if (isEligibleForPostTemplateBranch({ theme, post })) {
        res.type("html").send(await renderPostViaTemplate(deps, theme, post, staticMenus));
        return;
      }

      // Pages template picker (Task 4, 2026-08-11) — the `"html"`-format counterpart to the branch
      // just above. A `kind: "page"`, `bodyFormat: "html"` row with an EXPLICIT `templateChoice`
      // renders through its chosen template via `renderPageViaTemplate` (the `{"type":"content"}`
      // marker, Task 3) instead of the generic `resolveHtmlEmbedsForRender` path below. There is no
      // "never chosen" fallback arm here at all (see `isEligibleForPageTemplateBranch`'s doc) — a
      // Page that has never picked a template keeps rendering its own body directly, exactly as
      // every `"html"`-format Page already did before this feature existed.
      if (isEligibleForPageTemplateBranch({ theme, post })) {
        res.type("html").send(await renderPageViaTemplate(deps, theme, post, staticMenus));
        return;
      }

      const [widgets, pageHtmlEmbeds, mediaTransformVersions, mediaAssetMetadata, extraHead] = await Promise.all([
        resolveWidgetsForRender(deps, theme, post),
        resolveHtmlEmbedsForRender(deps, post),
        resolveMediaTransformVersionsForRender(deps),
        resolveMediaAssetMetadataForRender(deps, post),
        buildExtraHead(deps, "post", SITE_TITLE, post),
      ]);
      res.type("html").send(
        await renderSite({
          theme,
          route: "post",
          siteTitle: SITE_TITLE,
          posts,
          post,
          widgets,
          pageHtmlEmbeds,
          mediaTransformVersions,
          mediaAssetMetadata,
          extraHead,
          siteAssistantEnabled,
        }),
      );
    } catch (err) {
      if (err instanceof PostNotFoundError) {
        if (await tryRedirectPhase("post_content", req.path, deps.workspaceId, res)) return;

        // A static theme that ships its own pages/404.html gets a themed not-found page instead of
        // the bare fallback below — same renderStaticPage path the marketing-page routes above use.
        if (theme && theme.manifest.tier === "static" && theme.pages["404"] !== undefined) {
          const staticHtml = renderStaticPage({ theme, pageId: "404", menus: staticMenus });
          if (staticHtml) {
            res.status(404).type("html").send(staticHtml);
            return;
          }
        }

        res.status(404).type("html").send("<h1>404 — page not found</h1><p><a href='/'>Home</a></p>");
        return;
      }
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });
};
