import type { ThemeSlotDescriptor } from "../../contracts/core/theme-slots.js";
import type { JsonValue } from "@jini-ai/core/primitives";
import type { ThemeTemplateFor } from "./template-applicability.js";

/**
 * ADR-020 capability tier. `declarative` = data-only (safe from anyone),
 * `templated` = LiquidJS-rendered (sandboxed logic, no JS), `handlebars` =
 * Handlebars-rendered (sandboxed logic, no JS — a sibling of `templated` with
 * its own allowlist/worker pair, not a replacement for it), `static` = plain
 * HTML/CSS/JS, no template language at all — every byte editable, a whole
 * `pages/*.html` set instead of one `templates/` route map (see `pages` on
 * {@link DiscoveredTheme}), `code` = trusted signed-plugin JS (not built yet).
 * Absent in `theme.json` ⇒ `declarative`.
 */
export type ThemeTier = "declarative" | "templated" | "handlebars" | "static" | "code";

/**
 * `theme.json.build` — ADR-020 §5 (2026-08-12): declares which of the two lifecycle classes a
 * `static`-tier theme belongs to.
 *
 * **Authored** — this field absent, every theme on disk today. The working copy on disk IS the
 * source: full per-file edit, reset, and `theme_write_file` AI-authorability, exactly as before this
 * field existed.
 *
 * **Built** (`source: "compiled"`) — the shipped `pages/`, `css/`, `js/` were produced by a framework's
 * own build (React/Vue/Angular) rather than authored directly. Settled by the debate: *the author or
 * publisher CI builds; Tovu never runs the build* — this field records provenance/contract for a build
 * that already happened elsewhere, it never triggers one. A built theme's SOURCE (`sourceDir`) keeps
 * everything an authored theme has today — per-file edit, reset, AI-authorability
 * ({@link import("./theme-files.js").resolveThemeFileWriteScope}). Only its GENERATED tree — everything
 * outside `sourceDir` plus `theme.json` — loses that per-file granularity: it is read-only from every
 * per-file surface, and is restored, when it is, only as one complete release, never file-by-file.
 *
 * `source: "compiled"` requires `tier: "static"` (enforced in {@link loadTheme}) — a compiled theme's
 * RUNTIME is a `static` theme; there is no server-executing `code` tier this maps onto (`code` stays
 * reserved and unbuilt — see {@link ThemeTier}'s own doc).
 */
export interface ThemeBuildInfo {
  /**
   * `"compiled"` marks this theme as a built release (see this interface's own doc). Any other or
   * absent value — including a `build` object present in `theme.json` with no `source` key at all, or
   * an unrecognized string — is treated as `"authored"` rather than failing the theme. This is a
   * descriptive default for an optional field, not {@link parseTier}'s fail-closed contract: that
   * exists because a wrong TIER silently applies a different tier's validation rules with no error;
   * defaulting an ambiguous `build.source` to "this is just an ordinary authored theme" has no
   * equivalent silent-wrong-behavior risk.
   */
  source: "authored" | "compiled";
  /** `compiled` only — which framework produced the source. Purely descriptive: nothing in Tovu's
   * request-time branches reads this field; it exists for the editor UI and support. */
  framework?: "react" | "vue" | "angular";
  /**
   * `compiled` only, REQUIRED — the authored source tree's root, relative to the theme folder (e.g.
   * `"src"`). Everything under this path, plus `theme.json` itself, stays per-file editable exactly
   * like an authored theme; everything outside it is this build's generated output and is read-only
   * through every per-file surface (see {@link import("./theme-files.js").resolveThemeFileWriteScope}).
   * An author-DECLARED path rather than an assumed `src/` convention: a hardcoded prefix would either
   * lock a real source tree named something else out of editing entirely, or (looser) let a generated
   * folder that merely starts with the same letters (`src-legacy/`) slip through as writable.
   */
  sourceDir?: string;
  /** `compiled` only — the tool and version that produced the artifact (e.g. `"astro@4.15.2"`),
   * recorded for support/reproducibility. Never parsed or version-checked by Tovu. */
  builderVersion?: string;
  /** `compiled` only — sha256 of the lockfile the build ran against. Provenance only; Tovu never reads
   * the lockfile's own contents. */
  lockfileHash?: string;
  /**
   * `compiled` only, REQUIRED (non-empty) — sha256 hex digest of each generated file's bytes, keyed by
   * path relative to the theme folder. Verified against the real files on disk by
   * {@link checkBuiltThemeConformance} (`build-conformance.ts`) before the theme is accepted as
   * `status: "valid"` — this is what backs "immutable, versioned, integrity-verified," not a UI label.
   * A file not listed here is not integrity-checked — a documented gap (`build-conformance.ts`'s own
   * header), not a silent one.
   */
  artifactHashes?: Record<string, string>;
}

/** `theme.json` — static theme identity. */
export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  /**
   * Schema version this manifest declares (`theme-authoring-guide-v2.md` §5/§11). `2` means the
   * theme's on-disk shape uses v2 paths (`css/theme.css`, `scripts/`, `render/pages/`) — read by
   * `static-asset-contract.ts`'s `tokenStylesheetSentinel`/`rewriteAssetPaths`/
   * `findUnrewrittenAssetPaths` (via `static-render.ts` and `build-conformance.ts`), and by
   * `resolveThemeLayout` (`theme-layout.ts`, 2026-08-19 architecture audit findings 1 & 2 — the one
   * apiVersion-aware source of truth every other consumer routes through) to pick the matching
   * sentinel/folder names at request/install time. As of the 2026-08-18 Milestone 3 migration, all
   * seven built-in static themes (`content/themes/static/*`) declare `2` — this is the live, common case,
   * not a forward-looking one. Absent (or any value other than `2` — still fully supported for a
   * site-authored or third-party theme) means v1's flat `css/styles.css`/`js/` shape, preserved
   * exactly, the only behavior this field had before Milestone 3 introduced `2`.
   */
  apiVersion?: 2;
  /** ADR-020 capability tier (defaults to `declarative` when omitted). */
  tier: ThemeTier;
  /** Legacy pre-ADR-020 field; retained for back-compat, superseded by `tier`. */
  class?: "declarative";
  engine: number;
  /**
   * ADR-020 §5 (2026-08-12) — free-text credit for who produced this theme, e.g. "Aurora Themes Co.".
   * Absent for every theme on disk today; `loadTheme` never parsed this field before this change, and
   * nothing in the engine branches on it. Independent of {@link ThemeBuildInfo}: `build` is about HOW
   * the static output was produced, `author` is about WHO produced it — a hand-authored theme can
   * still declare an `author`.
   */
  author?: string;
  /** ADR-020 §5 (2026-08-12) — declares which lifecycle class this theme belongs to. See
   * {@link ThemeBuildInfo}'s own doc for the authored-vs-built distinction and what each keeps/loses. */
  build?: ThemeBuildInfo;
  description?: string;
  /**
   * Legacy font family specs resolved through the shipped URL template for older manifests.
   * SPEC-004 CSS sanitization forbids external font @import in theme CSS, so
   * fonts live in the manifest, not the stylesheet.
   */
  fonts?: string[];
  /** HTTPS stylesheet URLs or root-relative paths, in link order. An empty list disables fonts. */
  fontStylesheets?: string[];
  /**
   * SPEC-043/ADR-047 §2a — the region keys (e.g. `["header","footer"]`) this theme declares for
   * widget placement, the same way it already declares templates/slots. Additive, optional field:
   * absent/undefined means "no declared regions" (unchanged behavior for every existing `theme.json`
   * on disk today — no back-compat migration needed). `resolvePageWidgets`'s `resolvedRegions` input
   * (`Jini/packages/cms/src/widgets/resolver-service.ts`) is sourced directly from this field at render time
   * (`server/http/site/render.ts::renderSite`) — this fulfills what ADR-047 §2a's own framing already
   * assumed existed ("themes declare region keys the same way they already declare template
   * slots/regions") rather than a hardcoded core constant.
   */
  regions?: string[];
  /**
   * `static` tier only — the ordered list of `pages/*.html` filenames (e.g. `["blog-post.html",
   * "page-shell.html"]`) a Post OR a Page can pick between, "ordered to nudge the right choice"
   * (first entry is the implicit default in the Post editor's picker). Absent/undefined means this
   * theme ships no templates — a row's `templateChoice` then has nothing to resolve against, which
   * the render path treats as "misconfigured", not "fall back to generic rendering" (see
   * `pages.ts`'s template branch).
   *
   * ONE array for both kinds (2026-08-11 unification), superseding the earlier separate
   * `postTemplate`/`pageTemplate` split (2026-08-10/11 design docs) — that split existed only
   * because the OLD marker vocabulary made a template's slot type kind-specific
   * (`{"type":"post","id":"{{post}}"}"` vs `{"type":"content"}"`), so the wrong array could offer a
   * Post-shaped template to a Page. The unified `content` marker (`{"type":"content"}"`, optional
   * `id`) removed that distinction at the source: the resolver reads the referenced row's
   * `bodyFormat` at RENDER time and dispatches, so a template file no longer declares which kind it
   * is for. One array is therefore no longer a hazard, and keeping two would just be two
   * independently-maintained copies of the same list to keep in sync — the same "duplicated logic
   * regresses" argument `resolveTemplate`'s own history already made once (2026-08-09
   * null-vs-`""`-conflation).
   *
   * **What this does NOT solve**: which templates make SENSE for a Post vs a Page (a blog template's
   * byline/date/next-post chrome does not belong on Privacy Policy) is a template-APPLICABILITY
   * question this field is silent on — see `ADS-memory/reports/implementation/
   * 2026-08-11-unified-content-marker.md` for why marker-based applicability inference (the design
   * doc's own "interim" proposal) has no signal left to key off now that every template's primary
   * slot carries the identical `{"type":"content"}"` marker, and both admin pickers therefore offer
   * this one flat list unfiltered, same as they always effectively did within their own kind.
   * `templateFor` now declares that applicability explicitly without inferring it from markers.
   */
  templates?: string[];
  /** Optional template -> content kinds. An unlisted template applies to both posts and pages. */
  templateFor?: ThemeTemplateFor;
  /**
   * `static` tier only — the allow-list of {@link isPublishableThemePageCandidate} page ids this
   * theme currently serves publicly (2026-08-30, owner ask: a static theme's public routing was
   * pure file presence with no draft/unpublished concept at all — the gap an agent worked around by
   * moving a live page into an invented `_unpublished/` folder and dropping it from `theme.json`,
   * outside every audited write path. This field is the real mechanism that replaces it).
   *
   * **Absent (no recorded decision — applies RETROACTIVELY to every theme on disk, not only ones
   * touched after this date): off by default.** {@link isStandaloneThemePage} treats every eligible
   * candidate page as unpublished until a decision is recorded. This reverses this field's own
   * first-day default (absent originally meant "everything published", for backward compatibility
   * with pure file-presence routing) per the owner's explicit correction, in their own words: "The
   * pages are not published by default. They shouldn't be... because then they would have wrong
   * information because they're generic themes." Only `index`, `404`, and a declared {@link templates}
   * shell stay live regardless — {@link isPublishableThemePageCandidate} excludes those from this
   * field's reach entirely; they were never "published", they are structurally load-bearing.
   *
   * **Present (a theme where the publish toggle has been used at least once): an explicit allow-list.**
   * A candidate page id NOT in this array is unpublished, same meaning as the absent case — the array
   * only ever records what has been turned ON. The publish route (`explore.ts`'s
   * `registerAdminThemePagePublishRoute`) is the only writer: because the default is already "off",
   * the first toggle on a theme with no recorded array needs no backfill — it simply starts from an
   * empty array and applies the one requested change.
   *
   * Entries are candidate page ids (`pricing`, matching {@link DiscoveredTheme.pages}' own keys), not
   * filenames — `index`/`404` and a declared {@link templates} shell can never appear meaningfully
   * here even if listed: {@link isStandaloneThemePage} excludes them before this array is ever
   * consulted, the same way it always has.
   */
  publishedPages?: string[];
  /**
   * `static` tier only — the color modes this theme ships token sets for, e.g. `["dark", "light"]`.
   * A mode name is just the value written into the page's root `data-theme` attribute, which is the
   * selector `tokensToRootCss` (`static-render.ts`) already emits its `tokens.light.json` override
   * block under (`:root[data-theme="light"]`). Absent/undefined means the theme declares nothing, and
   * {@link renderStaticPage} then emits no `data-theme` at all — the pre-2026-08-10 behavior, where
   * the base `:root` block always won because no attribute existed for an override block to match.
   */
  modes?: string[];
  /**
   * `static` tier only — which of {@link modes} a freshly-served page starts in. Emitted as
   * `data-theme="<defaultMode>"` on the page's `<html>` element, so it selects between the token
   * blocks above. A theme wanting a user-flippable toggle owns that itself: static themes are plain
   * HTML/JS, so their own script sets `document.documentElement.dataset.theme`, and the engine's job
   * ends at establishing the initial value. Declaring a `defaultMode` outside `modes` is a manifest
   * error (the theme loads `invalid` with a message), not a silent fallback.
   */
  defaultMode?: string;
  /**
   * `static` tier only — the `{"type":"partial","id":"<key>"}` `data-embed-config` markers this
   * theme's pages embed, mapped to the root partial file each one pulls in. Read by `resolveSlots`
   * (`static-render.ts`); before this was wired, that function hardcoded exactly the `nav`/`footer`
   * pair every theme on disk happens to declare, so the field was authored but never parsed.
   * {@link DEFAULT_THEME_SLOTS} reproduces that hardcoded pair for a theme that declares no `slots`,
   * which is why wiring this changed no existing theme's output.
   */
  slots?: Record<string, ThemeSlotDescriptor>;
}

/** A template is a JSON block tree (doc nodes + slot + component nodes). */
export type TemplateNode = JsonValue;

/**
 * SPEC-004 REQ-03 fallthrough chain, keyed by route, trimmed to the spike's routes: `home` and
 * `products`/`product` are own-named only (no fallthrough — a theme that doesn't declare one
 * simply has no such page, REQ-10 spirit); `post` tries `post` first, then falls through to
 * `entry` (built-ins ship `entry`; `post` is an optional override a theme may add to specialize
 * posts — AC-07). One candidate list per route rather than a route-shaped if/else chain, so
 * {@link resolveRouteTemplateId} stays a single loop instead of re-deriving this same shape three
 * times (once per source-map type below).
 */
type TemplateRoute = "home" | "post" | "products" | "product";
const ROUTE_TEMPLATE_CANDIDATES: Readonly<Record<TemplateRoute, readonly string[]>> = {
  home: ["home"],
  post: ["post", "entry"],
  products: ["products"],
  product: ["product"],
};

/**
 * Shared REQ-03 resolution core behind `resolveTemplateId`/`resolveLiquidTemplateId`/
 * `resolveHandlebarsTemplateId` — the three differ only in which source-map type they resolve
 * against (declarative block trees, raw `.liquid` source, raw `.hbs` source), never in the
 * fallthrough logic itself, so that logic lives here once. `templates` is read generically
 * (presence/truthiness only, via `Record<string, unknown>`) because none of the three callers'
 * value types matter to this decision — only whether a given template id exists.
 */
function resolveRouteTemplateId(
  route: TemplateRoute,
  templates: Readonly<Record<string, unknown>>
): string | null {
  for (const candidateId of ROUTE_TEMPLATE_CANDIDATES[route]) {
    if (templates[candidateId]) return candidateId;
  }
  return null;
}

/**
 * Resolve a page route to a template id — see {@link ROUTE_TEMPLATE_CANDIDATES} for the REQ-03
 * fallthrough chain this applies.
 * @complexity O(1) time and space — at most two candidate lookups.
 */
export function resolveTemplateId(
  required: { route: TemplateRoute; templates: Record<string, TemplateNode> },
  _optional: Record<string, never> = {}
): string | null {
  return resolveRouteTemplateId(required.route, required.templates);
}

/**
 * Templated-tier (LiquidJS) analogue of `resolveTemplateId`: same REQ-03 fallthrough over the raw
 * `.liquid` source map.
 * @complexity O(1) time and space — at most two candidate lookups.
 */
export function resolveLiquidTemplateId(
  required: { route: TemplateRoute; liquidTemplates: Record<string, string> },
  _optional: Record<string, never> = {}
): string | null {
  return resolveRouteTemplateId(required.route, required.liquidTemplates);
}

/**
 * Handlebars-tier analogue of `resolveTemplateId`: same REQ-03 fallthrough over the raw `.hbs`
 * source map.
 * @complexity O(1) time and space — at most two candidate lookups.
 */
export function resolveHandlebarsTemplateId(
  required: { route: TemplateRoute; handlebarsTemplates: Record<string, string> },
  _optional: Record<string, never> = {}
): string | null {
  return resolveRouteTemplateId(required.route, required.handlebarsTemplates);
}

/**
 * Fixed placeholder origin {@link safeHref} resolves a claimed same-origin-relative href against —
 * mirrors `server/inbound/public-http/http/site/render.ts`'s identically-named constant byte-for-byte.
 */
const SAFE_HREF_RESOLUTION_BASE = new URL("https://tovu-safehref.invalid/");
// Parsing only: preserve HTTP's default-port normalization for the existing origin
// comparison. This reserved placeholder is never a network destination.
SAFE_HREF_RESOLUTION_BASE.protocol = "http:";
const SAFE_HREF_RESOLUTION_ORIGIN = SAFE_HREF_RESOLUTION_BASE.origin;

/**
 * Sanitize a menu item's `href` before it reaches public HTML: allow only in-page (`#…`),
 * same-origin relative (`/…`), `http(s)://`, and `mailto:` targets. Everything else — notably
 * `javascript:`, `data:`, and any other scheme — collapses to `"#"` so a menu link can never smuggle
 * script into the page. A menu item's `href` is operator-authored (the admin menu editor, or an
 * agent tool acting on an operator's behalf) and reaches every visitor of the public site, including
 * an authenticated admin — the same "content is data, so a link is an untrusted string" posture
 * `render.ts`'s own `safeHref` doc already states for post-body links.
 *
 * **This is a deliberate DUPLICATE, not a shared import, of
 * `server/inbound/public-http/http/site/render.ts`'s `safeHref` (confirmed byte-identical logic,
 * including its `/…` branch's 2026-08-20 protocol-relative-URL fix — see that function's own doc for
 * the full attack-shape writeup this mirrors).** `render.ts` sits in `server/inbound/`, a layer
 * `features/theme` must never reach into (`check:boundaries`' no-deep-import rule; a feature pulling
 * from an inbound-transport module is backwards), and importing it would open a runtime import cycle
 * back into the file that pulls in widgets/Liquid/Handlebars. (`escapeHtml` had the same problem
 * until it moved to the import-free leaf `platform/html/escape.ts`.) If this logic changes, the `render.ts` copy
 * must change too — that file does not yet cross-reference this one; flagged for whoever next edits
 * either copy to add the reciprocal comment there.
 *
 * **KNOWN GAP, not fixed here (out of this pass's scope):** `render.ts`'s own `announcement`,
 * `siteNav`, and `siteFooterRich` widget renderers build `<a href>` from operator-authored widget
 * props via `escapeHtml(str(o.href, "#"))` alone, with NO `safeHref` call — the exact same class of
 * gap this function closes for static-tier menus, still live in that file's widget-IR path.
 *
 * @returns the original value when it passes the allowlist, otherwise `"#"` — never a malformed or
 *   unsafe href, matching this codebase's "degrade, don't disappear" convention for a link target.
 *
 * Takes `string`, not `string | null` — matching `escapeHtml`'s own signature (`platform/html/escape.ts`).
 * `render.ts`'s `safeHref` accepts `JsonValue | undefined` because ITS callers hand it raw,
 * attacker-shaped widget-prop JSON; both of THIS function's callers already narrow `StaticMenuItem`'s
 * `href: string | null` to a real string before calling (the same `available && href !== null` gate
 * `renderMenuLinks`'s `.filter()` and `renderMenuItem`'s `linkable` both already apply) — adding a
 * second, always-false null guard here would be untestable dead code, not defense in depth.
 */
export function safeHref(value: string): string {
  const href = value.trim();
  if (href.startsWith("#")) return href;
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return href;
  if (href.startsWith("/")) {
    let resolved: URL;
    try {
      resolved = new URL(href, SAFE_HREF_RESOLUTION_BASE);
    } catch {
      return "#";
    }
    return resolved.origin === SAFE_HREF_RESOLUTION_ORIGIN ? href : "#";
  }
  return "#";
}
