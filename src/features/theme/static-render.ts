import { DEFAULT_THEME_SLOTS, type DiscoveredTheme, type ThemeSlotDescriptor, type ThemeTokens } from "./theme";

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
  /** True when this item OR a descendant is current — what a sidebar uses to expand a section. */
  readonly isActive?: boolean | undefined;
  /** `NavItemAttrs` passthrough. Only the presentational fields this renderer emits are declared. */
  readonly attrs?: { readonly cssClass?: string | undefined; readonly description?: string | undefined; readonly icon?: string | undefined } | undefined;
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
 * Renders a resolved menu as a nested `<ul>`/`<li>` tree — the shape a docs sidebar needs and
 * {@link renderMenuLinks} cannot produce. **Opt-in per marker** via `data-embed-variant="tree"`, and
 * that is a hard requirement rather than a preference: every static theme's nav CSS today targets
 * direct `<a>` children of a flex container (`basic`'s own `.main-nav { display: flex }` with
 * `.main-nav a`, and the same shape in the other six), so unconditionally introducing a `<ul>` wrapper
 * would collapse each of those navs to a single flex child. Flat stays the default and stays
 * byte-identical; a theme opts a specific marker into the tree when its CSS is ready for one.
 *
 * Emitted hooks, all of which `renderMenuLinks` drops on the floor: `is-current` (this item is the
 * page), `is-active` (this item or a descendant is — what expands the right section), `has-children`,
 * a `depth-N` class, and the item's own authored `attrs.cssClass`. `description`/`icon` render as
 * child spans so a theme can style or ignore them without the renderer knowing an icon set.
 *
 * Availability rule, which differs from the flat renderer's on purpose: an unavailable **leaf** is
 * omitted entirely (the flat contract — never emit a dead link), but an unavailable **branch** is
 * kept as inert text so its available children are not deleted along with it. A trashed section
 * heading should not silently take its whole subtree off the page.
 */
function renderMenuTree(items: readonly StaticMenuItem[], depth = 0): string {
  const rendered = items
    .map((item) => {
      const linkable = item.available && item.href !== null;
      const children = item.children.length > 0 ? renderMenuTree(item.children, depth + 1) : "";
      if (!linkable && children === "") return "";

      const classes = [
        "menu-item",
        `depth-${depth}`,
        item.children.length > 0 ? "has-children" : "",
        item.isCurrent ? "is-current" : "",
        item.isActive ? "is-active" : "",
        item.attrs?.cssClass ?? "",
      ]
        .filter((c) => c !== "")
        .join(" ");

      const label = escapeHtml(item.label);
      const icon = item.attrs?.icon
        ? `<span class="menu-item-icon" data-icon="${escapeHtml(item.attrs.icon)}"></span>`
        : "";
      const description = item.attrs?.description
        ? `<span class="menu-item-desc">${escapeHtml(item.attrs.description)}</span>`
        : "";
      const body = linkable
        ? `<a href="${escapeHtml(item.href as string)}"${item.isCurrent ? ' aria-current="page"' : ""}>${icon}${label}${description}</a>`
        : `<span class="menu-item-label">${icon}${label}${description}</span>`;

      return `<li class="${classes}">${body}${children}</li>`;
    })
    .filter((li) => li !== "")
    .join("");

  return rendered === "" ? "" : `<ul class="menu-list depth-${depth}">${rendered}</ul>`;
}

/**
 * Parses a marker's `data-embed-config='...'` attribute (marker-spine unification, 2026-08-10 —
 * `data-embed-type`/`data-embed-id`/`data-embed-config` is now the one vocabulary every static-theme
 * marker (menu embeds, partial slots) authors against, replacing the separate `data-embed-variant`/
 * `data-tovu-slot`+`data-nav-current`+`data-slot-variant` attributes that drifted apart). Single-
 * quoted, deliberately: every real config so far is a JSON object whose values are themselves
 * double-quoted strings (`data-embed-config='{"variant":"tree"}'`), so single-quoting the attribute
 * means the author never has to escape an inner `"`.
 *
 * Malformed or absent JSON degrades to an empty config with a `console.warn`, mirroring
 * `resolver-service.ts`'s `resolveHtmlPageEmbeds` degrading an unknown embed type the same way:
 * never throws, never fails the render — a typo in a marker's config must not take the whole page
 * down, only silently lose that one marker's variant/current-page behavior.
 *
 * @complexity O(n) in `attrs`' length for the regex extract, plus `JSON.parse`'s own cost on the
 * (small, marker-scoped) matched string.
 */
function parseEmbedConfig(attrs: string, context: { themeId: string; marker: string }): Record<string, unknown> {
  const raw = /data-embed-config='([^']*)'/.exec(attrs)?.[1];
  if (raw === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[theme] ${context.themeId}: data-embed-config on ${context.marker} is not valid JSON — ignoring`, {
      raw,
      error: (err as Error).message,
    });
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.warn(`[theme] ${context.themeId}: data-embed-config on ${context.marker} is not a JSON object — ignoring`, { raw });
    return {};
  }
  return parsed as Record<string, unknown>;
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
function injectMenuEmbed(html: string, themeId: string, menuId: string, items: readonly StaticMenuItem[] | undefined): string {
  if (items === undefined) return html;
  const marker = new RegExp(
    `<([a-z]+)([^>]*data-embed-type="menu"[^>]*data-embed-id="${menuId}"[^>]*)>[\\s\\S]*?<\\/\\1>`
  );
  return html.replace(marker, (whole: string, tag: string, attrs: string) => {
    // The tree-vs-flat choice is read off the marker's own `data-embed-config` (marker-spine
    // unification, 2026-08-10 — this used to be a bare `data-embed-variant="tree"` attribute; that
    // spelling is retired outright, not kept alongside this one, since it shipped hours earlier the
    // same day and every real theme using it is migrated in this same pass). The choice of markup
    // shape belongs to whoever owns the CSS around it — see {@link renderMenuTree} for why this
    // cannot default to the tree.
    const config = parseEmbedConfig(attrs, { themeId, marker: `menu:${menuId}` });
    const tree = config.variant === "tree";
    const inner = tree ? renderMenuTree(items) : renderMenuLinks(items);
    // Unchanged contract: an empty render leaves the marker's own authored fallback content alone
    // rather than blanking the nav.
    return inner === "" ? whole : `<${tag}${attrs}>${inner}</${tag}>`;
  });
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

/** Escape a manifest-supplied string so it matches literally inside a constructed `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `nav.html` → `nav`; the partial-id key `loadStaticTierAssets` stores root partials under. */
function partialIdFromSource(source: string): string {
  return source.endsWith(".html") ? source.slice(0, -".html".length) : source;
}

/**
 * Resolves one already-matched slot marker's `{current, variant}` (whichever spelling produced them,
 * see {@link resolveSlots}) against a partial's source content — the part of the old, single-spelling
 * `resolveSlots` that both marker vocabularies still share verbatim: pick the source (`variants` map,
 * else the `<source-stem>-<variant>.html` convention), then splice `aria-current="page"` onto the
 * partial's own `data-nav-id="<current>"` anchor when the descriptor names an `activeAttr` at all —
 * `current` itself being present or absent is what decides whether anything is marked current, not
 * `activeAttr`'s exact configured name (see {@link resolveSlots}'s new-spelling branch for why the
 * config key is always the fixed string `"current"` regardless of that name).
 *
 * A marker whose resolved partial does not exist collapses to empty, matching the pre-2026-08-10
 * behavior's `?? ""` for the same case.
 */
function resolveSlotMarker(
  descriptor: ThemeSlotDescriptor,
  partials: Record<string, string>,
  normalized: { current: string | undefined; variant: string | undefined }
): string {
  const source =
    normalized.variant === undefined
      ? descriptor.source
      : descriptor.variants?.[normalized.variant] ?? `${partialIdFromSource(descriptor.source)}-${normalized.variant}.html`;
  let partial = partials[partialIdFromSource(source)] ?? "";

  if (descriptor.activeAttr !== undefined && normalized.current !== undefined) {
    const linkRe = new RegExp(`(<a href="[^"]+" data-nav-id="${escapeRegExp(normalized.current)}")(>)`);
    partial = partial.replace(linkRe, '$1 aria-current="page"$2');
  }
  return partial;
}

/**
 * Replace every partial-slot marker with the root partial the theme's `theme.json` `slots` block
 * maps that key to. Driven by the manifest rather than the hardcoded `nav`/`footer` pair this
 * function carried before 2026-08-10 — that pair now lives in {@link DEFAULT_THEME_SLOTS} and is
 * used verbatim for a theme declaring no `slots`, so a theme that never adopts the field renders
 * byte-identically to how it did.
 *
 * **Two accepted marker spellings** (marker-spine unification, 2026-08-10):
 *
 * - **New** — `<div data-embed-type="partial" data-embed-id="<key>" [data-embed-config='{"current":
 *   "<page>","variant":"<name>"}']></div>`. The one spelling every theme in this repo now authors
 *   (all 7 migrated in this same pass); `current`/`variant` are fixed config keys, not per-descriptor
 *   configurable names — `data-nav-current`'s old per-theme `activeAttr` name (`descriptor.activeAttr`)
 *   still decides WHETHER a slot honors a current-page marker at all, just no longer WHAT the JSON key
 *   is called.
 * - **Deprecated** — `<div data-tovu-slot="<key>" [data-nav-current="<page>"]
 *   [data-slot-variant="<name>"]></div>`, the pre-2026-08-10 spelling. Still accepted, not removed,
 *   so a site-authored theme outside this repo (which cannot be migrated in this pass) does not break
 *   the moment this ships — `console.warn`'d exactly once per `resolveSlots` call (i.e. once per page
 *   render that uses it at all), not once per occurrence, so a page with a dozen deprecated markers
 *   doesn't spam a dozen near-identical warnings.
 *
 * A theme may freely mix both spellings across different markers (verified live during the 7-theme
 * migration — a theme mid-migration is not a broken theme); each marker resolves independently. A
 * deprecated `data-tovu-slot` marker may ALSO carry `data-embed-config` — config wins over
 * `data-nav-current`/`data-slot-variant` when present — which is what lets Task 1's config migration
 * (`data-slot-variant="minimal"` → `data-embed-config`) land independently of Task 2's marker-identity
 * rename (`data-tovu-slot` → `data-embed-type="partial"`), rather than forcing both in lockstep.
 *
 * @complexity O(slots × html.length) — one full regex pass per declared slot key, times two (new +
 * deprecated spelling), same shape the pre-2026-08-10 single-spelling version already had.
 */
function resolveSlots(
  html: string,
  partials: Record<string, string>,
  slots: Readonly<Record<string, ThemeSlotDescriptor>> = DEFAULT_THEME_SLOTS,
  themeId = "unknown-theme"
): string {
  let warnedLegacySpelling = false;
  for (const [key, descriptor] of Object.entries(slots)) {
    const newMarker = new RegExp(
      `<div\\b(?=[^>]*\\bdata-embed-type="partial")(?=[^>]*\\bdata-embed-id="${escapeRegExp(key)}")([^>]*)></div>`,
      "g"
    );
    html = html.replace(newMarker, (_m, attrs: string) => {
      const config = parseEmbedConfig(attrs, { themeId, marker: `partial:${key}` });
      const current = typeof config.current === "string" ? config.current : undefined;
      const variant = typeof config.variant === "string" ? config.variant : undefined;
      return resolveSlotMarker(descriptor, partials, { current, variant });
    });

    const legacyMarker = new RegExp(`<div data-tovu-slot="${escapeRegExp(key)}"([^>]*)></div>`, "g");
    html = html.replace(legacyMarker, (_m, attrs: string) => {
      if (!warnedLegacySpelling) {
        console.warn(
          `[theme] ${themeId}: uses the deprecated data-tovu-slot/data-nav-current/data-slot-variant marker ` +
            `spelling — migrate to data-embed-type="partial" data-embed-id="<key>" (+ data-embed-config for ` +
            `current/variant)`
        );
        warnedLegacySpelling = true;
      }
      // A `data-tovu-slot` marker MAY also carry `data-embed-config` — an intermediate migration
      // state (Task 1 migrated `data-slot-variant`/`data-nav-current` to config independently of
      // Task 2's marker-identity rename, so the two attributes can land in either order across a
      // theme's files). Config wins when present; the dedicated old attributes are the fallback for
      // a marker that hasn't picked up config at all yet.
      const config = parseEmbedConfig(attrs, { themeId, marker: `partial:${key}(deprecated-spelling)` });
      const current =
        typeof config.current === "string"
          ? config.current
          : descriptor.activeAttr !== undefined
            ? new RegExp(`${escapeRegExp(descriptor.activeAttr)}="([^"]+)"`).exec(attrs)?.[1]
            : undefined;
      const variant = typeof config.variant === "string" ? config.variant : /data-slot-variant="([^"]+)"/.exec(attrs)?.[1];
      return resolveSlotMarker(descriptor, partials, { current, variant });
    });
  }
  return html;
}

/**
 * Stamp the theme's declared `defaultMode` onto the page's `<html>` element as `data-theme`, which is
 * the selector `tokensToRootCss` emits the `tokens.light.json` override block under. Without this the
 * light token set was authored, loaded, and emitted into the page — but unreachable, because nothing
 * ever set the attribute its block keys off.
 *
 * No-ops when the manifest declares no `defaultMode`, and leaves an `<html>` that already carries a
 * `data-theme` alone, so a theme hand-authoring its own value keeps it. A theme wanting the mode to be
 * user-switchable ships its own toggle script against `document.documentElement.dataset.theme`; this
 * only establishes the server-rendered starting value.
 */
function injectColorMode(html: string, defaultMode: string | undefined): string {
  if (defaultMode === undefined) return html;
  return html.replace(/<html(?![^>]*\sdata-theme=)([^>]*)>/i, `<html$1 data-theme="${escapeHtml(defaultMode)}">`);
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
  html = injectColorMode(html, theme.manifest.defaultMode);
  html = resolveSlots(html, theme.partials, theme.manifest.slots ?? DEFAULT_THEME_SLOTS, theme.manifest.id);
  for (const [menuId, items] of Object.entries(menus ?? {})) {
    html = injectMenuEmbed(html, theme.manifest.id, menuId, items);
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
