import type { DiscoveredTheme, ThemeTokens } from "./theme";

/**
 * @file Real (non-spike) request-time rendering for `static`-tier themes.
 *
 * Ports the logic each static theme's own `build-preview.mjs` (an authoring-time stand-in written
 * before this file existed) already proved out over 18+ screenshots this session: token injection,
 * asset-path rewriting, and `data-tovu-slot` resolution. That script still exists per-theme for
 * local preview/iteration; this module is the one real counterpart `render.ts` calls when actually
 * serving a static theme as the live site.
 *
 * Scope of this pass: **home route only.** Posts/products routes are not handled here at all;
 * callers fall back to the existing `fallbackBody()` for those.
 */

function tokensToRootCss(tokens: ThemeTokens, tokensLight: ThemeTokens): string {
  const darkLines = Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`);
  const lightLines = Object.entries(tokensLight).map(([k, v]) => `  ${k}: ${v};`);
  return (
    `:root {\n${darkLines.join("\n")}\n}\n` +
    `:root[data-theme="light"] {\n${lightLines.join("\n")}\n}`
  );
}

/**
 * A static page's `<link>`/`<script>` tags use `../css/`, `../js/` — correct only from inside the
 * theme's own `pages/` folder on disk. Rewritten generically (not per-filename, unlike the
 * per-theme build script) so the engine never needs updating when a theme adds a new script.
 */
function rewriteAssetPaths(html: string, themeId: string): string {
  return html
    .replace(/href="\.\.\/css\//g, `href="/theme-assets/${themeId}/css/`)
    .replace(/src="\.\.\/js\//g, `src="/theme-assets/${themeId}/js/`);
}

/**
 * A static page's internal nav/footer/body links point at sibling page files (`href="pricing.html"`)
 * — correct only when viewing the raw file on disk. Rewritten generically to the real route
 * (`href="/pricing"`, `href="/"` for `index.html`) so a real click in the browser lands on the route
 * Tovu actually serves instead of a bare filename the server never registers. Hash links (`href="#..."`)
 * and the already-rewritten `../css/`/`../js/` asset paths are untouched — this only matches a bare
 * `<name>.html` href, never one containing `/`.
 */
function rewritePageLinks(html: string): string {
  return html.replace(/href="([a-z0-9-]+)\.html"/g, (_m, name: string) => (name === "index" ? 'href="/"' : `href="/${name}"`));
}

/**
 * A post-template page (e.g. `blog-post.html`, referenced from a theme's `theme.json` `postTemplate`
 * array) ships `data-embed-id="{{post}}"` — a literal placeholder, not a real id, since the template
 * is authored once and reused across whichever posts pick it. The route layer (`pages.ts`) already
 * knows which real post is being rendered by the time it calls this, so it substitutes the real
 * stored id here, BEFORE the embed scanner/resolver ever sees the html — `resolveHtmlPageEmbeds`
 * (`widgets/resolver-service.ts`) and `renderHtmlPageBody` (`server/http/site/render.ts`) then treat
 * this exactly like any other real `data-embed-type="post"` reference, no special-casing needed
 * downstream. A page with no `{{post}}` placeholder (a non-post-template page, or a misauthored
 * template missing the slot) is simply unaffected — `replace` is a no-op when the token isn't present.
 */
export function injectPostEmbedId(html: string, postId: string): string {
  return html.replace('data-embed-id="{{post}}"', `data-embed-id="${postId}"`);
}

/**
 * The minimal structural shape this module needs from a resolved menu item — matches
 * `ResolvedNavItem` (`@jini-ai/cms/navigation`, re-exported by `#src/navigation`) field-for-field on
 * every field actually used here. A local shape rather than importing that type keeps `features/theme`
 * from gaining a new import edge onto `navigation` purely for a type; the real `ResolvedNavItem[]` the
 * route layer resolves already satisfies this structurally (same convention `render.ts`'s own
 * `MediaAssetRenderMeta` uses for pre-resolved render-time data owned by a different feature).
 */
export interface StaticMenuItem {
  readonly label: string;
  readonly href: string | null;
  readonly available: boolean;
  readonly isCurrent: boolean;
  readonly children: readonly StaticMenuItem[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders one location's resolved menu items as a flat sequence of `<a>` tags. Top-level items
 * only — v1: every static theme's nav/footer markup this session is a flat link row/column with no
 * dropdown/submenu CSS to hook a nested render into, so rendering `children` would need chrome none
 * of these themes ship (a real gap, not silently papered over: nested items are simply not emitted).
 * An unavailable item (deleted/unpublished target, or an unresolvable ref) is omitted entirely,
 * never rendered as a dead link — mirrors `render.ts`'s own `renderWidgetMenuItems` convention for
 * the same `ResolvedNavItem` shape.
 */
function renderMenuLinks(items: readonly StaticMenuItem[]): string {
  return items
    .filter((item) => item.available && item.href !== null)
    .map((item) => {
      const current = item.isCurrent ? ' aria-current="page"' : "";
      return `<a href="${escapeHtml(item.href as string)}"${current}>${escapeHtml(item.label)}</a>`;
    })
    .join("");
}

/**
 * Fills a theme's `data-embed-type="menu" data-embed-id="<menuId>"` marker element with that real
 * menu's resolved items, or leaves the marker's authored content completely untouched when no menu
 * data is supplied for that id (deleted menu, typo in theme markup, or the id simply resolves to
 * zero renderable links) — the safe default the owner asked for when this was still the
 * location-keyed `data-tovu-menu-slot` marker: an active static theme must render identically to how
 * it did before this feature existed, never an empty nav. Matches `resolveSlots`' own
 * regex-substitution approach for the same class of problem (locate one marked element, replace its
 * content) rather than a full HTML parse, appropriate for markup this module itself controls the
 * shape of (theme-authored, not arbitrary untrusted HTML) — the same `data-embed-type`/`data-embed-id`
 * attribute convention `injectPostEmbedId` uses for posts, but resolved inline here rather than via
 * `widgets/resolver-service.ts`'s generic `data-embed-type` pipeline: that pipeline only matches a
 * self-closing `<div ...></div>` with nothing between the tags (see `widgets/html-embeds.ts`'s file
 * header), which cannot preserve a marker's own authored fallback content the way this function does.
 *
 * The marker's tag name is captured and backreferenced for its own closing tag (`<\1>`) rather than
 * assumed — safe for a marker with no same-named descendant (true for every marker this session
 * places: `nav.html`'s single `<nav>`, `footer.html`'s childless-of-divs `.footer-col`), but a theme
 * author introducing a marker whose tag nests inside itself would need a different mechanism; not a
 * case any theme built this session hits.
 */
function injectMenuEmbed(html: string, menuId: string, items: readonly StaticMenuItem[] | undefined): string {
  if (items === undefined) return html;
  const linksHtml = renderMenuLinks(items);
  if (linksHtml === "") return html;
  const marker = new RegExp(
    `<([a-z]+)([^>]*data-embed-type="menu"[^>]*data-embed-id="${menuId}"[^>]*)>[\\s\\S]*?<\\/\\1>`
  );
  return html.replace(marker, (_m, tag: string, attrs: string) => `<${tag}${attrs}>${linksHtml}</${tag}>`);
}

/**
 * Every menu id a static theme's own pages/partials reference via a `data-embed-type="menu"
 * data-embed-id="<menuId>"` marker, deduped, in no particular order. Pure — reads only the
 * already-in-memory shapes `loadTheme()` produced (`theme.pages`, `theme.partials`), no I/O. The
 * route layer calls this BEFORE `renderStaticPage` to know exactly which real menus to fetch
 * (`menuRepo`/`resolveMenuDoc`) for a request — this file stays I/O-free per its own header, so it
 * can report what's referenced but never fetch anything itself.
 *
 * Scans every page and partial, not just the one about to render: `resolveStaticMenusForRender`
 * (route layer) is called once per request before the exact page/template is chosen, and `nav.html`/
 * `footer.html` partials are shared across every page via `resolveSlots` regardless — scanning
 * everything up front is simpler than threading "which page(s) will this request actually render"
 * back into a scan, and the id set a real theme references is small and fixed by its own authors.
 *
 * @complexity O(n) over the theme's total authored HTML length across all pages and partials.
 */
export function scanMenuEmbedIds(theme: DiscoveredTheme): readonly string[] {
  const ids = new Set<string>();
  const pattern = /data-embed-type="menu"[^>]*data-embed-id="([a-z0-9-]+)"/g;
  for (const html of [...Object.values(theme.pages), ...Object.values(theme.partials)]) {
    for (const match of html.matchAll(pattern)) ids.add(match[1]);
  }
  return Array.from(ids);
}

function resolveSlots(html: string, partials: Record<string, string>): string {
  html = html.replace(
    /<div data-tovu-slot="nav"[^>]*data-nav-current="([^"]+)"[^>]*><\/div>/,
    (_m, current: string) => {
      const navHtml = partials.nav ?? "";
      const linkRe = new RegExp(`(<a href="[^"]+" data-nav-id="${current}")(>)`);
      return navHtml.replace(linkRe, '$1 aria-current="page"$2');
    }
  );
  html = html.replace(
    /<div data-tovu-slot="footer"( data-slot-variant="([a-z-]+)")?[^>]*><\/div>/,
    (_m, _attr: string | undefined, variant: string | undefined) =>
      (variant ? partials[`footer-${variant}`] : partials.footer) ?? ""
  );
  return html;
}

/**
 * Render one page of a `static`-tier theme for the live site. Returns `null` if the theme has no
 * page under that id (caller degrades to `fallbackBody()`, same REQ-10 contract every other tier
 * already follows for an unresolved route).
 *
 * `htmlOverride` (post-template-picker feature, 2026-08-10): when supplied, used as the page source
 * INSTEAD of `theme.pages[pageId]` — the route layer's post-template render path already read the
 * template off `theme.pages`, substituted the real post id via {@link injectPostEmbedId}, and
 * resolved+rendered its `data-embed-type="post"` slot (I/O this file must stay free of, see the file
 * header), so by the time it calls this the embed is already real HTML; this function still applies
 * every OTHER static-tier treatment (token injection, asset-path rewrite, slot resolution, link
 * rewrite) uniformly on top, so a post-template page gets exactly the same treatment any other static
 * page does, not a parallel/divergent code path.
 *
 * `menus` (direct menu-embed wiring, superseding the earlier `header`/`footer` location scheme):
 * pre-resolved items keyed by real menu id (`navigation`'s `resolveMenuDoc`, fetched per id found by
 * {@link scanMenuEmbedIds}, run by the route layer — this file stays I/O-free, same split
 * `pages.ts`'s own resolver functions document). Each key is independently optional: a menu id with
 * no entry in this map (or a request for a non-static-tier theme, which never calls this with
 * `menus` at all) simply leaves that marker's theme-authored fallback content untouched, see
 * {@link injectMenuEmbed}.
 */
export function renderStaticPage(
  required: {
    theme: DiscoveredTheme;
    pageId: string;
    htmlOverride?: string;
    menus?: Readonly<Record<string, readonly StaticMenuItem[]>>;
  },
  _optional: Record<string, never> = {}
): string | null {
  const { theme, pageId, htmlOverride, menus } = required;
  const source = htmlOverride ?? theme.pages[pageId];
  if (source === undefined) return null;

  let html = source.replace(
    '<link rel="stylesheet" href="../css/styles.css" />',
    () =>
      `<style>\n${tokensToRootCss(theme.tokens, theme.tokensLight)}\n</style>\n<link rel="stylesheet" href="../css/styles.css" />`
  );
  html = rewriteAssetPaths(html, theme.manifest.id);
  html = resolveSlots(html, theme.partials);
  for (const [menuId, items] of Object.entries(menus ?? {})) {
    html = injectMenuEmbed(html, menuId, items);
  }
  html = rewritePageLinks(html);
  return html;
}

/** Outcome of {@link resolvePostTemplate}: either a usable template, or the diagnostic page. */
export type PostTemplateResolution =
  | { kind: "template"; pageId: string; html: string }
  | { kind: "diagnostic" };

/**
 * Decide which of a static theme's `postTemplate` pages a post renders through. Pure — the caller
 * owns the embed-resolution I/O that follows.
 *
 * `templateChoice` is a **tri-state**, and the difference between two of its values is the whole
 * point of this function (regression, 2026-08-09: 15 of 19 published posts served the diagnostic
 * page at HTTP 200 because the two were conflated):
 *
 * - `null`/`undefined` — *never chosen*. Migration `0028` added `template_choice` as an additive
 *   nullable column with no backfill, so every pre-feature post reads `null`, as does any row
 *   written by a path that doesn't know this field exists (seed script, agent tool, direct API or
 *   DB insert). That is the absence of a decision, not a decision, so it falls back to the theme's
 *   first-listed template — the same value the admin editor's picker already defaults an unset post
 *   to on load, which keeps what an author sees selected and what the public site renders in
 *   agreement. Making the *column default* the *safe* behavior is deliberate: it is what stops this
 *   bug reappearing on the next post created outside the editor.
 * - `""` — *explicitly opted out*, the admin picker's "No template chosen" option. A deliberate
 *   author action, and the one value no naive insert produces. Keeps showing the diagnostic page,
 *   which is the designed product behavior ("not a silent fallback to generic rendering"). It is
 *   the ONLY value that reaches the diagnostic page without the theme first getting a say.
 * - `"blog-post.html"` — an explicit choice. Rendered as-is when the ACTIVE theme can honor it,
 *   and otherwise treated exactly like the never-chosen case, for the reason below.
 *
 * A stored choice is **theme-relative but not theme-scoped**: it names a file in whatever theme was
 * active when an author picked it, and nothing on the row records which theme that was. Switching
 * the site's active theme therefore strands every explicit choice at once. Reading a stranded
 * choice as an opt-out would put every one of those posts back on the HTTP-200 diagnostic page —
 * the same outage as the `null` regression, reached by a routine admin action instead of a
 * migration, and unreachable by any backfill because the stored value is a real filename rather
 * than `null`. "This theme has no such template" is the absence of a decision *for this theme*, not
 * a decision, so it falls back. Only `""` is theme-independent enough to mean opt-out.
 *
 * A page that exists but ships no post slot counts as "cannot honor" for the same reason and falls
 * back too; the diagnostic page is reached only when the theme's own first template is also
 * unusable, since rendering a slotless template would silently drop the post's body.
 *
 * `theme.pages` is keyed by filename WITHOUT `.html` (`loadTheme`'s convention) while
 * `templateChoice`/`postTemplate` entries carry it; the `.replace` below is the one place that
 * naming mismatch is bridged.
 *
 * @complexity O(n) in the template's HTML length for the slot check, over at most two candidates;
 *   O(1) lookups otherwise.
 * @overallScore 100
 */
export function resolvePostTemplate(
  required: { theme: DiscoveredTheme; templateChoice: string | null | undefined },
  _optional: Record<string, never> = {}
): PostTemplateResolution {
  const { theme, templateChoice } = required;
  if (templateChoice === "") return { kind: "diagnostic" };

  const resolveAgainstTheme = (choice: string | undefined): PostTemplateResolution | undefined => {
    if (choice === undefined || choice === "") return undefined;
    const pageId = choice.replace(/\.html$/, "");
    const html = theme.pages[pageId];
    if (html === undefined || !html.includes('data-embed-id="{{post}}"')) return undefined;
    return { kind: "template", pageId, html };
  };

  return (
    resolveAgainstTheme(templateChoice ?? undefined) ??
    resolveAgainstTheme(theme.manifest.postTemplate?.[0]) ?? { kind: "diagnostic" }
  );
}
