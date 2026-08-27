# Tovu Theme Authoring Guide

**Status:** descriptive — this documents the theme system as it exists in the codebase today, including its gaps. It does not propose new features. For the in-progress design of a parent/child template system, see the (separate, in-flight) design doc at `ADS-memory/.local-artifacts/design/theme-template-parent-child-design.md` — that is a *future* design; nothing in that direction has landed yet, and nothing here should be read as a spec for it.

**Audience:** a developer (human or agent) building a new Tovu theme, or trying to understand why an existing theme behaves the way it does.

Every claim below is grounded in a `path:line` citation. Where the codebase's *intent* (a doc comment, an ADR) diverges from what the code actually *does*, both are stated, and the divergence is called out explicitly — this repo has a standing finding that confident-sounding doc comments are sometimes inference dressed as observation, so nothing here is taken on a comment's word alone.

---

## 1. How the system works, end to end

Three phases, one request:

### 1.1 Discovery (server boot)

`builtInThemesDir()` resolves to `content/themes/` next to the compiled server code (never `process.cwd()`, so a globally-installed `tovu serve` still finds themes shipped with the package) — `src/server/deps.ts:143-145`. At boot, `discoverAllBuiltInThemes({ dir: builtInThemesDir(), source: "built-in" })` is called once and the result is held in `deps.themes` for the process lifetime (`src/server/deps.ts:617-618`, `src/server/app.ts:440-441`). There is no hot-reload: editing a theme file on disk does not change what a running server serves until the process restarts, *except* through the `theme_write_file` agent tool, which re-validates and effectively replaces the loaded theme content for that one theme after every write (`src/features/theme/agent-tools.ts:202`).

Discovery scans two kinds of location under the themes root (`src/features/theme/theme.ts:411-458`):

- **Top-level folders** — direct children of `content/themes/` that are not one of the reserved engine-subfolder names.
- **Engine subfolders** — `declarative/`, `templated/`, `handlebars/`, `static/` (`ENGINE_SUBFOLDERS`, `src/features/theme/theme.ts:442`). Each is scanned as a themes root in its own right. A subfolder that doesn't exist is simply skipped, not an error.

As of this session (2026-08-10), every theme lives under an engine subfolder — the bare top-level layer is empty in practice, though still supported (`src/features/theme/theme.ts:427-435`'s comment documents that `declarative` themes moved off the bare top level this same day, and the `liquidjs/` folder was renamed to `templated/` to match the tier name).

Each candidate folder is loaded independently by `loadTheme()` (`src/features/theme/theme.ts:265-400`). A bad theme never breaks discovery for the others: `loadTheme` catches its own errors and returns `status: "invalid"` with a populated `errors` array instead of throwing (SPEC-004 REQ-10 "fault isolation", verified by the test at `src/features/theme/__tests__/theme.test.ts:162-175`).

`src/theme-archive/` (7 old themes — `tovu-official`, `dispatch`, `grayscale`, `clean-blog`, `ledger`, `column`, `minima`) is **not** under `content/themes/` and is never scanned. These are dead artifacts from before the tier/engine-subfolder restructure, not live themes — see §8.1.

### 1.2 Selection (per request, cheap)

Which theme is "active" is a per-workspace setting, `activeThemeId`, stored in the `presentation_settings` table and read fresh on every request (`src/features/presentation/repo.sqlite.ts:23`, `src/server/routes/site/pages.ts` calls `getPresentationSettings` inside every route handler). It is changed via `PATCH` to the admin presentation endpoint (`src/server/routes/admin/presentation/patch-active-theme.ts`), which an admin-UI theme picker calls.

Resolution never trusts the stored id blindly: `resolveActiveTheme()` (duplicated per route file — `src/server/routes/site/pages.ts:104-108`, `src/server/routes/site/products.ts:12-16`) looks the id up in the already-discovered `deps.themes`, and if it's missing or `status: "invalid"`, falls back to the first `valid` theme in the (alphabetically sorted) list, and failing that, the first theme of any status. This fallback is not a rare edge case in practice — see §8.2.

### 1.3 Render (per request)

The route layer (`src/server/routes/site/pages.ts`) does all I/O — fetching posts, resolving widgets, resolving menus, resolving media — and hands a fully-resolved `SiteRenderContext` to `renderSite()` (`src/server/http/site/render.ts:1154-1295`), which is a pure function: resolved data in, HTML string out. This "route resolves, render renders" split is deliberate and consistent across every resolved field on the render context (see the doc comments on `SiteRenderContext`, `src/server/http/site/render.ts:49-104`).

`renderSite()` branches on `theme.manifest.tier`:

| Tier | What happens |
|---|---|
| `static`, route `home` | Returns `renderStaticPage()`'s output directly — a complete `<!doctype html>` document — bypassing `pageShell()` entirely (`render.ts:1252-1255`). |
| `templated` | Resolves a `.liquid` template id, renders it inside an isolated `worker_threads` sandbox (`renderLiquidInSandbox`), wraps the result in `pageShell()`. Any render error (syntax, disallowed construct, timeout, OOM) degrades to `fallbackBody()` — never a 500 (`render.ts:1258-1270`). |
| `handlebars` | Same shape as `templated`, engine swapped: `.hbs`/`.handlebars` template, `renderHandlebarsInSandbox`, same degrade-never-500 contract (`render.ts:1271-1283`). |
| everything else (`declarative`, and `static` for non-home routes that don't otherwise resolve) | Resolves a JSON template id, walks its block tree with `renderBlock()`, wraps in `pageShell()` (`render.ts:1284-1287`). |

For a `static` theme, non-home routes (`GET /:slug`) are handled one level up, in `pages.ts` itself, **not** inside `renderSite()` — see §1.4.

### 1.4 The `GET /:slug` request path for a static theme (worked trace)

This is the path most real theme content takes today (all 7 live themes are `static`). Order of operations in `src/server/routes/site/pages.ts:457-579`:

1. Strip a trailing `.html` from the slug; reject slugs that aren't `[a-z0-9-]+` or that collide with `admin`/`api` (`pages.ts:461-466`).
2. Run the `pre_content` redirect phase (`pages.ts:471`).
3. Resolve the active theme and pre-resolve every menu the theme's markup references via a `data-embed-config` marker whose `type` is `"menu"` (`resolveStaticMenusForRender`, `pages.ts:489`, detailed in §6.2).
4. **Marketing-page check, before any post lookup:** if the theme is `static`, the slug isn't `index`, and `theme.pages[slug]` exists, this is one of the theme's own shipped pages (pricing, docs, blog index, …). Render it via `renderStaticPage()` and return — *unless* a real published Post exists at that exact slug **and** has `overridesThemePage: true` set (§7.2), in which case the post wins instead (`pages.ts:497-521`).
5. Otherwise, look up a published Post by slug. If found and it's a `bodyFormat: "doc"` post (not a `bodyFormat: "html"` Page) and the active theme declares a non-empty `postTemplate` array, render it through the post-template-picker path (§7.1, `pages.ts:527-535`).
6. Otherwise, fall through to the generic post-rendering path — resolve widgets/embeds/media, call `renderSite()` with `route: "post"` (`pages.ts:537-558`).
7. On `PostNotFoundError`: try the `post_content` redirect phase, then a themed `pages/404.html` if the theme ships one, then a bare inline 404 (`pages.ts:559-574`).

---

## 2. The four tiers

There are four theme-content tiers with live implementations, plus a fifth (`code`) that is declared in the type system but has zero implementation anywhere — not a stub, not a partial renderer, nothing. `ThemeTier = "declarative" | "templated" | "handlebars" | "static" | "code"` (`src/features/theme/theme.ts:33`).

| Tier | Format | Executes | Themes shipped today | Directory |
|---|---|---|---|---|
| `static` | Complete `.html` documents + CSS + JS, no templating language | Nothing server-side; theme's own client JS runs in the browser | **7** — `basic`, `fuel`, `gracious-timing`, `portfolite`, `tailark-dusk`, `tailark-quartz-dark`, `tailark-quartz-libre` | `content/themes/static/<id>/` |
| `declarative` | JSON block tree over a fixed component registry | Nothing — pure data | **1** — `basic-declarative`, explicitly labeled `"Reference only — not wired into any site"` in its own `theme.json` description | `content/themes/declarative/<id>/` |
| `templated` | LiquidJS templates | Sandboxed template logic, no JS (`eval`/`new Function` never used) | **1** — `storefront` | `content/themes/templated/<id>/` |
| `handlebars` | Handlebars templates | Sandboxed template logic, same isolation posture as `templated` | **0** | `content/themes/handlebars/` (directory exists, empty) |
| `code` | (undeclared — would be trusted, signed-plugin JS) | Not built | 0, and no loader path exists | n/a |

### 2.1 `static` — the tier that actually ships content

Every theme a visitor can currently see is `static`. A static theme is a small multi-page website: `pages/*.html` (complete documents), `nav.html`/`footer*.html` (partials), `css/styles.css`, `js/*.js`, `tokens.json` (+ optional `tokens.light.json`). No templating language at all — every byte in a `pages/*.html` file is exactly what gets served, modulo the mechanical rewrites `static-render.ts` performs (token injection, asset-path rewriting, slot/embed resolution, link rewriting — §6). This is the tier to choose when you want full design control and don't need per-request dynamic content beyond what slots/embeds already cover.

**Real limitation, not a hypothetical one:** the renderer only actually implements the `home` route inside `renderSite()` for static themes (`render.ts:1252-1255`); every other static-tier route (marketing pages, posts, 404) is handled by `pages.ts` calling `renderStaticPage()` directly, one level above `renderSite()`. If you're tracing "how does a static theme render X", look in `pages.ts` first, not `render.ts`.

### 2.2 `declarative` — implemented, essentially unused

A JSON block tree (`{"type": "doc", "content": [...]}`) referencing a fixed, core-owned component registry (`COMPONENTS` in `render.ts:614-627`: `tovu/site-header`, `tovu/entry-list`, `tovu/entry-content`, `tovu/site-footer`, `tovu/hero`, `tovu/section`, `tovu/feature-grid`, `tovu/media-placeholder`, `tovu/announcement`, `tovu/nav`, `tovu/cta`, `tovu/footer`). No executable code — the whole appeal (per ADR-010) is that this format can be installed from a stranger with zero code-review risk, and generated/edited by an AI with zero code-execution risk.

In practice this tier has exactly one theme, and its own `theme.json` description says it is a "reference only" port of the `basic` static theme's home/entry pages, "not wired into any site" (`content/themes/declarative/basic-declarative/theme.json`). If you want to see the JSON block-tree format, read that theme's `templates/home.json` and `templates/entry.json` — they're small and legible.

### 2.3 `templated` (LiquidJS) — implemented, one real theme

LiquidJS templates (`.liquid` files) rendered inside an isolated `worker_threads` sandbox (`src/server/http/site/liquid-worker.ts`, `liquid-sandbox.ts`), gated by a **tag/filter allowlist** enforced at load time (`src/features/theme/liquid-allowlist.ts`) — a template using a disallowed tag or filter fails theme validation with a specific per-file error naming the offending construct (verified by `src/features/theme/__tests__/theme.test.ts:45-58`). Themes can opt out of the allowlist per-theme via `theme.json`'s `skipLiquidAllowlist: true`, which trades the pre-flight lint for "this is a first-party/trusted artifact" — the worker isolation, filesystem lockdown, and render/parse limits still apply regardless (`theme.ts:66-85`).

Two seams bridge Liquid back to the trusted core (`render.ts:872-902`): `{% render_block component: "tovu/site-header", ... %}` renders a component from the *same* `COMPONENTS` registry the declarative tier uses, and `{{ post.content | raw }}` injects server-rendered, pre-sanitized TipTap HTML (the one value either tier is allowed to emit unescaped).

`storefront` (`content/themes/templated/storefront/`) is the one real theme here — a small Shopify-style product grid that reads live data from the sample store plugin. Its `templates/home.liquid` is a good, short worked example of loops/conditionals (`{% for product in products %}`, `{% if products.size == 0 %}`).

### 2.4 `handlebars` — fully wired, zero content

This is the gap most worth being precise about, because "empty directory" undersells how much is actually built:

- The `ThemeTier` type includes `"handlebars"` (`theme.ts:33`).
- `loadTheme()` reads `.hbs`/`.handlebars` files, lints them against a dedicated allowlist, and requires `home`/`entry` templates exactly like every other non-static tier (`theme.ts:340-360`, `366-374`).
- `src/features/theme/handlebars-allowlist.ts` (385 lines) is a real, tested allowlist that rejects disallowed helpers, partials, decorators, and raw `{{{output}}}` outside one sanctioned path — and unlike the Liquid tier, it has **no** opt-out flag (`skipLiquidAllowlist` explicitly does not apply — `theme.ts:76-83`, confirmed by the test at `theme.test.ts:151-160`).
- `src/server/http/site/handlebars-worker.ts` + `handlebars-sandbox.ts` render `.hbs` templates in an isolated worker exactly like the Liquid path, wired into `renderSite()`'s `handlebars` branch (`render.ts:1271-1283`).
- The `theme_list` agent tool's schema lists `"handlebars"` as a filterable tier value (`src/features/theme/agent-tools.ts:125-127`).
- The engine-subfolder scan includes `handlebars/` (`ENGINE_SUBFOLDERS`, `theme.ts:442`), and the folder exists on disk (`content/themes/handlebars/`) — but is empty.

So: **this is not dead code and not a half-built stub.** The render pipeline, the security allowlist, the worker isolation, and the discovery path are all complete and covered by tests (`src/features/theme/__tests__/handlebars-allowlist.test.ts`, and the handlebars sections of `theme.test.ts`). What's missing is purely content: no one has authored a `.hbs` theme. If you want to build one, the mechanism will take it — there's just no existing example to copy from inside this repo (copy the LiquidJS `storefront` theme's *structure*, not its syntax, as your starting point: same `home`/`entry`/`products`/`product` template-id vocabulary, same `theme.json` shape, Handlebars syntax instead of Liquid).

### 2.5 `code` — not built

No loader branch, no renderer branch, no validator, nothing. `ThemeTier` includes the string as a documented placeholder ("trusted signed-plugin JS (not built yet)", `theme.ts:30`) and the agent-tool schema mentions it as "reserved, no themes exist" (`agent-tools.ts:127`). Do not build against this tier; there is nothing to build against.

---

## 3. `theme.json` schema reference

Split deliberately into two tables, because this is a real (if now smaller) divergence, verified by grepping the whole `src/` tree for every field name: `loadTheme()`'s manifest construction (`theme.ts:358-372`) is the complete list of fields any code path consumes. As of 2026-08-10, `modes`, `defaultMode`, and `slots` are parsed and actually drive render-time behavior — §3.1 covers them alongside the fields that were already wired. `pages` remains the one field every static theme's `theme.json` authors that no loader, validator, or admin route reads (§3.2): `DiscoveredTheme.pages` is populated independently, by scanning the `pages/` directory on disk (`loadStaticTierAssets`, `theme.ts:305-339`).

### 3.1 Fields the loader actually reads and validates

| Field | Type | Tier | Required? | Behavior |
|---|---|---|---|---|
| `id` | string | all | yes (defaults to folder name if absent) | Must equal the folder name, or the theme fails validation (`theme.ts:289`). |
| `name` | string | all | no (defaults to `id`) | Display name. |
| `version` | string | all | no (defaults to `"0.0.0"`) | Free-form; not semver-validated. |
| `tier` | `"declarative" \| "templated" \| "handlebars" \| "static" \| "code"` | all | no (defaults to `"declarative"`) | Selects the entire loading/rendering branch. Unknown strings silently coerce to `"declarative"` (`parseTier`, `theme.ts:161-166`) — a typo here does not fail loudly, it just produces the wrong tier's validation rules. |
| `class` | `"declarative"` | all | no | Legacy pre-ADR-020 field, retained for back-compat only. Superseded by `tier`. |
| `engine` | number | all | no (defaults to `1`) | Read but not currently branched on anywhere observed. |
| `description` | string | all | no | Free text, shown in the `theme_list` agent tool and (presumably) an admin theme picker. |
| `fonts` | string[] | all | no | Google Fonts family specs (e.g. `"Fraunces:opsz,wght@9..144,400"`), injected as `<link>` tags in `pageShell()` (`render.ts:1052-1057`). SPEC-004 CSS sanitization is stated to forbid external `@import` in theme CSS, which is why fonts live here instead — see §8.4 for the sanitization caveat. |
| `regions` | string[] | all (declared, only meaningfully consumed outside `static`) | no | Widget-placement region keys (ADR-047 §2a) — see §6.4. **No live theme declares this field today** (verified: zero `"regions"` hits under `content/themes/`). |
| `skipLiquidAllowlist` | boolean | `templated` only | no (default `false`) | Opts a Liquid theme out of the tag/filter allowlist. Has no equivalent for `handlebars` — see §2.4. |
| `postTemplate` | string[] | `static` only | no | Ordered list of `pages/*.html` filenames a Post author can pick between (§7.1). First entry is the implicit default. |
| `modes` | string[] (e.g. `["dark","light"]`) | `static` only | no | The color-mode names this theme ships token overrides for. A mode name is nothing more than the value written into `data-theme` on `<html>` — it has no other effect on its own. See §3.3. |
| `defaultMode` | string | `static` only | no | Which of `modes` a freshly-served page starts in. Emitted as `data-theme="<defaultMode>"` on `<html>` (`injectColorMode`, `static-render.ts:231-234`). Declaring a `defaultMode` outside `modes` is a **hard manifest error** — the theme loads with `status: "invalid"` (`theme.ts:378-382`), not a silent fallback. Absent ⇒ no `data-theme` is emitted at all (the pre-2026-08-10 behavior, unchanged). See §3.3. |
| `slots` | `Record<string, { source, activeAttr?, variants? }>` | `static` only | no (defaults to `DEFAULT_THEME_SLOTS`, the legacy hardcoded `nav`/`footer` pair) | Maps a `data-embed-config='{"type":"partial","id":"<key>"}'` marker to the root partial file it renders, optionally naming the marker-side "current page" attribute for the deprecated spelling (`activeAttr`) and/or an explicit variant → filename map (`variants`) consulted via the marker's `data-embed-config`. See §6.1. |

### 3.2 Fields written by every theme, read by nothing

As of 2026-08-10 this table is down to one field — `modes`, `defaultMode`, and `slots` moved to §3.1 above once they were wired up.

| Field | Type | Present in | What it's for | Actual current effect |
|---|---|---|---|---|
| `pages` | string[] | every static theme | Documents which `pages/*.html` files exist | **None** — `DiscoveredTheme.pages` is populated by scanning the `pages/` directory on disk (`loadStaticTierAssets`, `theme.ts:305-339`), completely independent of this manifest array. The array can drift from the real directory contents with zero validation error. |

**Verified across all 7 static themes (not inferred from a sample):** no theme's `pages` array ever lists a filename it doesn't actually ship in `pages/*.html` — the "listed but not shipped" direction never happens. The drift runs the other way, and only for two reasons:

| Theme | Shipped but not listed in `pages` | Why |
|---|---|---|
| `basic` | `404`, `blog-post` | `pages/404.html` is the themed-404 fallback (`pages.ts` step 7, §1.4); `blog-post.html` is the post-template page (`postTemplate: ["blog-post.html"]`) |
| `tailark-dusk` | `blog-post` | same post-template reason |
| `tailark-quartz-dark` | `blog-post` | same post-template reason |
| `tailark-quartz-libre` | `blog-post` | same post-template reason |
| `fuel`, `gracious-timing`, `portfolite` | none | full agreement between `pages` and the directory |

The pattern isn't even consistently applied: `basic`, `tailark-dusk`, `tailark-quartz-dark`, and `tailark-quartz-libre` all omit their own `postTemplate` file from `pages`, but `portfolite` and `gracious-timing` list theirs (`blog-post`, `project` respectively) anyway. There's no rule enforcing either convention, because nothing reads the field either way.

**Practical implication:** `pages` is effectively author-facing documentation embedded in the manifest — useful for a human or an AI editing tool to get a quick inventory of a theme's pages, harmless to keep authoring for consistency with the other themes, but changing it does not change which routes actually resolve, and `DiscoveredTheme.pages` (the disk scan) is always what every render path actually reads.

### 3.3 Color modes: server-established starting value, client-owned toggle

As of 2026-08-10, `modes`/`defaultMode` are parsed and `defaultMode` drives one concrete thing: the starting value of `data-theme` on the page's `<html>` element. `injectColorMode()` (`static-render.ts:231-234`) stamps `data-theme="<defaultMode>"` onto `<html>` at render time — unless the page's own source already carries a `data-theme` attribute (left alone), or the manifest declares no `defaultMode` (nothing is emitted, same as before this wiring). This is also the exact selector `tokensToRootCss()` (`static-render.ts:16-23`) already emitted its `tokens.light.json` override block under (`:root[data-theme="light"] { ... }`) — before this wiring, that block was loaded and emitted into every page but structurally unreachable, because nothing ever set the attribute it keys off.

**A user-flippable toggle is still entirely the theme's own job.** The engine's responsibility ends at the server-rendered starting value; runtime switching is client-side, unchanged by this wiring: each static theme ships its own `js/theme-toggle.js`, which flips `data-theme` on `document.documentElement` in response to a `[data-theme-toggle]` button click (e.g. `content/themes/static/basic/js/theme-toggle.js:6-18`). A theme author who wants this needs exactly:

```html
<button data-theme-toggle>Toggle theme</button>
<script>
  document.querySelector('[data-theme-toggle]').addEventListener('click', () => {
    document.documentElement.dataset.theme =
      document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  });
</script>
```

**Same attribute name, different meaning, different tier — worth naming explicitly so it doesn't trip you up reading both render paths in one sitting:** on the `static` tier, `data-theme` on `<html>` is the *color mode* (`"dark"`/`"light"`, this section). On every other tier, `renderSite()` puts `data-theme="<theme.manifest.id>"` on a `<div class="site">` wrapper instead (`render.ts:1134`) — there `data-theme` names the *theme id* (`"storefront"`, `"basic-declarative"`, …), not a color mode. Different element, different tier, no runtime collision in practice — but the shared attribute name is a real trap for anyone skimming both paths at once.

---

## 4. Directory and file layout per tier

```
content/themes/
  static/<id>/
    theme.json
    tokens.json
    tokens.light.json      # optional — light-mode token overrides
    styles.css              # NOT here — see css/styles.css below (static is the one tier
                             # whose stylesheet is NOT at the theme root)
    css/styles.css
    js/*.js
    pages/*.html             # one file per route; index.html is required
    nav.html                 # optional partial
    footer.html              # optional partial
    footer-<variant>.html    # optional named footer variant(s)
    images/, screenshots/    # theme's own asset folders (convention, not enforced)

  declarative/<id>/
    theme.json
    tokens.json
    tokens.light.json        # optional (loader always supports this, but see caveat below)
    styles.css                # AT the theme root for this tier
    templates/
      home.json               # required
      entry.json               # required
      post.json, products.json, product.json   # optional specializations

  templated/<id>/
    theme.json
    tokens.json
    styles.css
    templates/
      home.liquid              # required
      entry.liquid              # required
      post.liquid, products.liquid, product.liquid   # optional

  handlebars/<id>/            # directory exists, currently empty
    theme.json
    tokens.json
    styles.css
    templates/
      home.hbs (or .handlebars)   # required
      entry.hbs (or .handlebars)   # required
```

Notes:

- **`css/styles.css` is `static`-only.** Every other tier keeps a single `styles.css` at the theme's own root (`theme.ts:377-383`'s comment states this explicitly: static "ships a whole small multi-file project instead" of the other tiers' flat, single-stylesheet shape).
- **`tokens.light.json` is documented as static-tier-only** in `DiscoveredTheme.tokensLight`'s own doc (`theme.ts:116-121`), but the *loading* logic (`readLightTokens`, `theme.ts:191-206`) is tier-agnostic — it's `loadStaticTierAssets` gating the call to only the `static` branch (`theme.ts:224-229`) that makes this true in practice, not something inherent to the file-reading function itself.
- **`nav.html`/`footer*.html` are matched by filename**, not by a manifest reference: `loadStaticTierAssets` scans every file at the theme root and picks up anything named exactly `nav.html` or starting with `footer` (`theme.ts:250-255`). `footer-minimal.html` becomes partial key `footer-minimal`.
- **`.hbs` and `.handlebars` are both accepted** and map to the same template-id namespace — if a theme ships both `home.hbs` and `home.handlebars`, whichever `readdirSync` happens to yield last silently wins (`theme.ts:340-351`, documented as a known footgun in that same comment — ship one extension, not both).

---

## 5. `styles.css` and CSS token conventions

Every render path injects the theme's design tokens as `:root` custom properties, then the theme's raw `styles.css`, verbatim, into the page `<style>` block (`tokensToCss`, `render.ts:1045-1050`; static tier's equivalent is `tokensToRootCss`, `static-render.ts:16-23`).

The convention — stated explicitly for AI-generated Page content in `src/features/pages/skeleton.ts:33-36` but equally applicable to hand-authored theme CSS — is: **reference a token with a literal fallback, never a bare hex**, e.g.

```css
color: var(--text-strong, #1b1b1b);
background: var(--surface-muted, #f6f5f3);
```

The fallback is what renders if the token is ever absent; the real value comes from the active theme's own `tokens.json`. This is how `DEFAULT_PAGE_SKELETON` (the markup a new AI-authored Page starts from) already looks correct against whatever theme is active before a model has touched it (`skeleton.ts:41-61`).

**Caveat, stated plainly rather than left implicit:** `DiscoveredTheme.css` is documented in its own field comment as *"Raw theme stylesheet (unsanitized in the spike)"* (`theme.ts:145`), and no CSS sanitizer exists anywhere in `src/` today (verified — no hits for a CSS-sanitization pass over theme stylesheets). ADR-010 states theme CSS should be "sanitized at install: no imports from foreign origins, no `javascript:` URLs, budgeted size" — that sanitizer has not been built. A theme's `styles.css` is currently trusted content, full stop.

---

## 6. Slots, partials, and embeds

**Marker-spine unification (2026-08-10), then fully collapsed onto ONE attribute (2026-08-11).** Slots and embeds used to be two genuinely different attribute vocabularies (`data-tovu-slot`/`data-nav-current`/`data-slot-variant` for partials vs. `data-embed-type`/`data-embed-id`/`data-embed-variant` for CMS-resolved content). The 2026-08-10 unification collapsed those into `data-embed-type`/`data-embed-id`/`data-embed-config` — still three separate attributes at that point. **Correction (2026-08-17): that three-attribute shape is itself now stale.** A further unification the next day (2026-08-11, the "unified `content` marker" change — `src/contracts/core/embeds/marker.ts`'s own file header) moved `type` and `id` OFF their own attributes and INTO the JSON blob, so the real, current mechanism is **one** attribute, `data-embed-config`, whose JSON object carries `type`/`id` as ordinary keys alongside everything else:

```html
<div data-embed-config='{"type":"partial","id":"nav","current":"index"}'></div>
```

Verified against the parser (`scanEmbedMarkers`, `src/contracts/core/embeds/marker.ts:133-163`, matching on `MARKER_PATTERN` at line 108, which locates exactly one `data-embed-config='...'` attribute per element) and against every live theme file (e.g. `content/themes/static/basic/pages/index.html:12`, `content/themes/static/basic/nav.html:7`). `type="partial"` is just another value of the `type` key, not a special attribute state — the real distinction was never the attribute names; it's what a `type` resolves against:

- **`type="partial"`** — fills the marker with a *partial file* (`nav.html`, `footer.html`) that lives inside the same theme. Purely local to the theme; no repo/database lookup. Resolved by `resolveSlots()`.
- **Every other `type`** (`menu`, `widget`, `form`, `media`, `post`, …) — fills the marker with *real content resolved from the CMS*. Requires a repo lookup by the route layer before rendering.

The whole JSON object inside `data-embed-config` is single-quoted (so an inner `"` needs no escaping) and carries whatever a marker used to need a bespoke attribute for — `{"current":"pricing"}`, `{"variant":"minimal"}`, or both, alongside the now-inlined `type`/`id`. Malformed/absent JSON degrades to an empty config with a `console.warn`, never a thrown error (`static-render.ts`'s `parseEmbedConfig`) — the same "never fail the render" contract §6.4's generic embed pipeline already followed for an unknown `type`.

For the settled TARGET manifest/folder redesign this attribute shape feeds into, see `theme-authoring-guide-v2.md §8` — not yet implemented, this section (§6) is what actually runs.

**Deprecated spelling, still accepted.** `data-tovu-slot="<key>"` / `data-nav-current="<page>"` / `data-embed-variant="tree"` are retired from every theme in this repo (all 7 migrated 2026-08-10) but `resolveSlots()` still recognizes `data-tovu-slot`/`data-nav-current`/`data-slot-variant` on a marker — with a `console.warn` (once per page render, not once per marker) — so a site-authored theme outside this repo doesn't break the moment it upgrades. `data-embed-variant` (the menu tree/flat choice) has NO such fallback — it shipped and was retired the same day, so there was no real installed base to protect; author `data-embed-config='{"variant":"tree"}'` instead. Do not author new theme content against the deprecated spelling — it exists for compatibility, not as a second supported convention.

### 6.1 Partials (`type="partial"`, `static` tier only)

A static page marks where a partial goes with an empty, self-closing-in-spirit div:

```html
<div data-embed-config='{"type":"partial","id":"nav","current":"pricing"}'></div>
...
<div data-embed-config='{"type":"partial","id":"footer"}'></div>
<div data-embed-config='{"type":"partial","id":"footer","variant":"minimal"}'></div>
```

`resolveSlots()` (`static-render.ts`) is driven by `theme.json`'s `slots` map (`theme.manifest.slots ?? DEFAULT_THEME_SLOTS`), not a hardcoded `nav`/`footer` pair. `DEFAULT_THEME_SLOTS` (`theme.ts`) reproduces that old hardcoded pair verbatim, so a theme that declares no `slots` renders byte-identically to before this wiring existed.

For each marker key present in the resolved slots map:

- **`source`** — the root partial filename the marker resolves to by default (e.g. `"footer.html"`).
- **`activeAttr`** (optional) — decides WHETHER this slot honors a current-page marker at all (`activeAttr: "data-nav-current"` on the `nav` slot, matching `DEFAULT_THEME_SLOTS`). The JSON config key is always the fixed string `"current"` regardless of this name — only its *presence* on the descriptor matters for the new spelling; the name itself is only consulted on the deprecated `data-tovu-slot` spelling, where it's still a real attribute name to read off the marker. Either way, the anchor side of the convention is **fixed, not configurable**: whichever `<a href="..." data-nav-id="<that value>">` exists inside the resolved partial gets `aria-current="page"` spliced onto it.
- **`variants`** (optional) — an explicit `{ "<variant-name>": "<filename>.html" }` map consulted when the marker's config carries `"variant":"<name>"`. A variant with no entry in this map falls back to the `<source-stem>-<variant>.html` naming convention `resolveSlots()` has always applied — e.g. a `footer` slot with variant `minimal` and no explicit map entry resolves to `footer-minimal.html`.

A theme declaring no `slots` at all gets exactly the legacy pair from `DEFAULT_THEME_SLOTS`: `nav` → `nav.html` with `activeAttr: "data-nav-current"`, `footer` → `footer.html` with no variants map (so any footer variant falls through to the naming convention). A marker whose resolved partial doesn't exist still collapses to empty.

**Worked example — `basic`** (`content/themes/static/basic/theme.json`, the only live theme with an explicit `variants` map):

```json
"slots": {
  "nav": { "source": "nav.html", "activeAttr": "data-nav-current" },
  "footer": {
    "source": "footer.html",
    "variants": { "minimal": "footer-minimal.html" }
  }
}
```

`pages/signin.html` (`content/themes/static/basic/pages/signin.html`) uses both: `<div data-embed-config='{"type":"partial","id":"nav","current":"signin"}'></div>` (line 12) and `<div data-embed-config='{"type":"partial","id":"footer","variant":"minimal"}'></div>` (line 36), the latter resolving via the explicit map to `footer-minimal.html`. **Worth being honest about:** `basic`'s explicit `minimal → footer-minimal.html` entry produces the exact same result the naming-convention fallback would have produced on its own — no live theme's `variants` map currently diverges from what the convention alone would resolve to, so this field's first real payload doesn't (yet) observably prove the explicit-map-over-convention precedence, even though that code path exists and is exercised.

### 6.2 Menu embeds (`type="menu"`, `static` tier)

A static theme's nav/footer partial can mark a real, CMS-managed menu instead of (or alongside) hand-written links:

```html
<nav class="main-nav" data-embed-config='{"type":"menu","id":"menu-header-nav"}'>
  <a href="pricing.html" data-nav-id="pricing">Pricing</a>
  ...
</nav>
```

The route layer scans every page/partial for a `data-embed-config` marker whose parsed `type` is `"menu"` (`scanMenuEmbedIds`, `static-render.ts`), fetches each referenced menu id, resolves it to real nav items (`resolveStaticMenusForRender`, `pages.ts`), and `injectMenuEmbed()` (`static-render.ts`) replaces the marker element's **entire inner content** with rendered `<a>` tags for each resolved item — but **only if** the menu resolves to at least one item; if the referenced menu id doesn't exist, or resolves to zero visible items, the marker's own authored fallback content (the hand-written `<a>` tags above) is left untouched. This "safe default" is deliberate: an active theme with no menu bound to a marker still looks exactly like it did before this feature existed.

**This is a marker-scoped, all-or-nothing replacement**, not a merge — the regex substitutes the whole `<tag ...>...</tag>` span between the marker's opening and its own closing tag, captured and backreferenced by the marker's own tag name.

**Nested rendering** (`docs-sidebar`-shaped nav, `basic/pages/blog-sidebar-template.html`): a marker opts into nested `<ul>/<li>` output instead of the default flat `<a>` list via a `"variant":"tree"` key in the same `data-embed-config` object — e.g. `<nav data-embed-config='{"type":"menu","id":"docs-themes-menu","variant":"tree"}'>` (`content/themes/static/basic/pages/blog-sidebar-template.html:32`). Opt-in per marker, not a theme-wide switch: every static theme's nav CSS today targets direct `<a>` children of a flex container, so unconditionally introducing a `<ul>` wrapper would collapse each of those navs to a single flex child.

### 6.3 The nav-embed gap: not every theme wires this

**Verified by inspecting every static theme's `nav.html` directly, not inferred from a comment:**

| Theme (id / display name) | Nav uses a `{"type":"menu"}` `data-embed-config` marker? |
|---|---|
| `basic` / Basic | Yes |
| `fuel` / Ember | **No — hardcoded `<a>` links, no embed marker at all** |
| `gracious-timing` / Atelier | Yes |
| `portfolite` / Folio | Yes |
| `tailark-dusk` / Northbound | Yes |
| `tailark-quartz-dark` / Onyx | Yes |
| `tailark-quartz-libre` / Meridian | Yes |

`fuel`'s `nav.html` (`content/themes/static/fuel/nav.html`) has a plain `<nav class="main-nav">` with four hand-written `<a>` tags and no `data-embed-config` attribute anywhere in the file. **This means: on `fuel`, editing the CMS menu in the admin UI has zero visible effect on the public nav.** Every other one of the 6 remaining static themes does wire it, so the same CMS menu edit is visible there. This is a per-theme authoring gap, not a platform limitation — nothing stops `fuel`'s `nav.html` from being edited to add the marker; it just hasn't been.

*Correction to a starting assumption:* the task that produced this doc assumed `fuel`/Ember is *currently* the active theme. As of this session, the local dev database (`infra/content.db`, `presentation_settings` table) actually has `activeThemeId = "basic"` — not `fuel`. `basic` does wire the menu embed. The seed default (`src/server/seed.ts:255`, §8.1) now hardcodes `"basic"` directly, resolving without a fallback on a fresh workspace — it used to hardcode the undiscoverable `tovu-official` and rely on `resolveActiveTheme()`'s fallback (§1.2) landing on `basic` anyway. Whichever theme is active is admin-mutable at any time; don't treat "the active theme" as a fixed fact — check `presentation_settings` (or the admin UI) for ground truth. The `fuel`-hardcodes-its-nav fact itself is independent of which theme happens to be active and remains true regardless.

### 6.4 Generic embeds (`type="widget|form|media|post"`, any `bodyFormat: "html"` content)

A separate, more general mechanism (`src/widgets/html-embeds.ts`) applies to any HTML-format Page/post body (not just static-theme partials): an empty, self-closing `<div data-embed-config='{"type":"TYPE","id":"ID"}'></div>` anywhere in `body_html` gets substituted with resolved markup. Four types are registered today (`HTML_EMBED_RESOLVERS`, `src/widgets/resolver-service.ts:540-545`): `widget`, `form`, `media`, `post`. `type` is a free string, not a closed union — adding a fifth type is a new resolver registration, not a scanner change (`html-embeds.ts:18-22`). An unknown type, a dead id, or a reference beyond the 50-embeds-per-page cap (`MAX_HTML_EMBEDS_PER_PAGE`, `html-embeds.ts:78`) all degrade identically to a safe placeholder div — never a crash, never raw unresolved markup reaching a visitor.

This is the mechanism the post-template-picker path reuses for a post's `data-embed-id="{{post}}"` slot (§7.1) — `injectPostEmbedId()` swaps the literal `{{post}}` placeholder for a real post id, then the exact same `resolveHtmlPageEmbeds`/`renderHtmlPageBody` pipeline runs (`static-render.ts:48-61`, `pages.ts:301-309`).

The `menu` embed described in §6.2 is **not** the same code path as this one — static-tier menu markers are resolved inline by `injectMenuEmbed()`, specifically because the generic pipeline only matches a self-closing div with *nothing* between the tags, which can't preserve a marker's own authored fallback content the way `nav.html`'s markers need to (`static-render.ts:118-120`).

### 6.5 Widget-placement regions (`theme.json`'s `regions` field — distinct from Page regions, §6.6)

A theme can declare region keys it supports for widget placement (ADR-047 §2a): `"regions": ["header", "footer"]` in `theme.json` (parsed onto `manifest.regions`, `theme.ts:285`). A declarative-tier template then references one with `{"type": "region", "key": "footer"}`, or a Liquid/Handlebars template with `{% render_block region: "footer" %}` — both resolve through the same `renderWidgetRegion()` function (`render.ts:862-870`). The route layer resolves what's actually placed in each region ahead of render (`resolvePageWidgets`, called from `resolveWidgetsForRender`, `pages.ts:126-131`).

**No live theme declares this field or uses this node type.** Verified: zero `"regions"` occurrences and zero `{"type": "region"...}` / `{% render_block region: ... %}` occurrences anywhere under `content/themes/`. The mechanism is fully implemented and tested (`theme.test.ts:186-226`) but has no real-world user yet.

### 6.6 Page authoring regions (`data-agent-element` / `data-agent-role`) — a different concept entirely

Do not confuse §6.5's widget-placement regions with this. `data-agent-element="page-hero"` / `data-agent-role="region"` (`src/features/pages/skeleton.ts:26-61`) is the addressable-editing vocabulary for AI-generated Page content — it marks the parts of a Page's own body HTML that an agent tool is allowed to rewrite, reusing `@jini-ai/agentic`'s existing handle convention (`region` is already a defined role there). `PAGE_SKELETON_REGIONS = ["page-hero", "page-body", "page-cta"]` is the starter set a new Page is seeded with. This has nothing to do with theme-declared widget regions, nothing to do with `theme.json`, and nothing to do with slots or embeds — it's purely about what an AI editing tool may touch inside one Page's own content, which the active theme's chrome (nav/header/footer) wraps around unchanged (`skeleton.ts:4-9`: "the active theme's template owns the page chrome for every entry, bespoke or not").

---

## 7. How posts/pages pick a template

Two genuinely different mechanisms live on a `Post` row. Conflating them caused a real production bug (§8.3) — treat them as unrelated fields that happen to sit next to each other in the schema.

### 7.1 `templateChoice` — which static-theme page template a Post renders through

`templateChoice: string | null` (`src/features/post/post.ts:97`, DB column `template_choice`, `src/db/schema.ts:107`) is a **tri-state**, and the difference between two of its values is the entire point:

| Value | Meaning | Render result |
|---|---|---|
| `null` / absent | *Never chosen* — the pre-feature default, and what every row written by any path unaware of this field (seed script, agent tool, direct insert) reads as | Falls back to the theme's `postTemplate[0]` (first-listed template) |
| `""` (empty string) | *Explicitly opted out* via the admin picker's "No template chosen" option | The diagnostic "Template not configured" page (`buildMissingPostTemplateHtml`, `pages.ts:246-269`) — deliberately not a silent fallback |
| `"blog-post.html"` (a real filename) | An explicit choice | Rendered as-is **if the currently active theme can honor it** (has a page by that name, and that page has a `data-embed-id="{{post}}"` slot) — otherwise treated exactly like the `null` case, i.e. falls back to `postTemplate[0]`, *not* to the diagnostic page |

The third row's "otherwise" behavior is the subtle part: a stored `templateChoice` is theme-relative but **not theme-scoped** — nothing on the row records which theme was active when it was picked. Switching the site's active theme therefore strands every explicit choice made under the old theme. `resolvePostTemplate()` (`static-render.ts:278-297`) deliberately treats "this theme has no such template" as "absence of a decision for this theme" (falls back) rather than as an opt-out (diagnostic page) — because reading it as opt-out would put every post on every theme switch back onto an HTTP-200 diagnostic page, unreachable by any backfill since the stored value is a real filename, not `null`. Only the literal `""` is theme-independent enough to mean "opt out."

This whole path only runs when the active theme is `static` **and** declares a non-empty `postTemplate` array in `theme.json` (`pages.ts:532`). A theme with no `postTemplate` array simply doesn't support this feature — those posts fall through to the ordinary `renderSite()` post path, unconditionally.

### 7.2 `overridesThemePage` — slug-collision tiebreak between a Post and a theme's own marketing page

`overridesThemePage: boolean` (default `false`, `src/db/schema.ts:117`) only matters when a real Post's slug happens to collide with one of the active static theme's own `pages/*.html` filenames (e.g. a post at slug `about` colliding with `pages/about.html`). By default, **the theme's page wins** — it's a reserved, reliable namespace. Setting `overridesThemePage: true` on the specific post (an explicit author action, made after the admin UI warns about the collision) flips that one post to win instead (`pages.ts:497-521`, schema comment `db/schema.ts:108-116`).

This has nothing to do with which template a post renders through (that's §7.1) — it only decides *whether the post gets to render at all* at a slug the theme also claims.

---

## 8. Gotchas and known limitations (verified, not inferred)

### 8.1 The seed default — fixed 2026-08-10, was `tovu-official`

Until 2026-08-10, `src/server/seed.ts:255` hardcoded `activeThemeId: "tovu-official"` as the default for a brand-new workspace. `tovu-official` lives only under `src/theme-archive/` (`src/theme-archive/tovu-official/`), which `builtInThemesDir()` never scans (`src/server/deps.ts:143-145` resolves to `content/themes/`, not `src/theme-archive/`) — on a fresh workspace that default never resolved to a real theme, and `resolveActiveTheme()`'s fallback silently picked the alphabetically-first valid discovered theme instead (which is also `basic`, so the *rendered result* never visibly changed — only the mechanism that produced it). The seed now hardcodes `activeThemeId: "basic"` directly (`content/themes/static/basic/`, a real, valid, currently shipping static theme), so `resolveActiveTheme()`'s direct-hit branch (`findTheme` + `status === "valid"`, `pages.ts:103-107`) resolves it on a fresh workspace without ever reaching the fallback line — verified by loading a fresh discovery pass and confirming `findTheme({ themes, id: "basic" })` returns `{ status: "valid", errors: [] }`.

### 8.2 Nested nav/submenus never render, on any static theme

`renderMenuLinks()` (`static-render.ts:97-105`) only emits top-level menu items as flat `<a>` tags. Its own comment states the reason plainly: every static theme's nav/footer markup this session is a flat link row/column with no dropdown/submenu CSS to hook a nested render into — rendering `children` would need chrome none of these themes ship. A `ResolvedNavItem.children` array is simply dropped, silently, for every static theme. A user can build a parent/child menu structure in the CMS's menu editor and see zero visual difference from a flat menu on the public site. This is disclosed in the code comment as "a real gap, not silently papered over," but it is still true that nothing in the rendered HTML tells a visitor or an author that nesting was lost — the only signal is the comment itself.

Contrast: the fully-declarative `siteNav`/`renderWidgetMenuItems` component paths (`render.ts:510-538`, `674-689`) *do* render nested children (`<ul class="nav-dropdown">` / recursive `<ul>`) — but those paths are only reachable through the `declarative`/`templated`/`handlebars` tiers' component registry or the widget `menu` type, not through any of the 7 live static themes.

### 8.3 `fuel`/Ember hardcodes its nav instead of embedding the CMS menu

Covered in full in §6.3. Restated here because it's easy to miss: this means CMS-side menu edits are invisible on that one theme specifically, while working correctly on the other six.

### 8.4 No CSS sanitization exists

Covered in §5. `DiscoveredTheme.css`'s own field comment says "unsanitized in the spike" (`theme.ts:145`), and there is no sanitizer anywhere in `src/`. ADR-010's stated intent (sanitize at install: no foreign `@import`, no `javascript:` URLs, size budget) has not been implemented for any tier.

### 8.5 The `handlebars` tier is empty, but not dead

Covered in full in §2.4. Restated because it's the most likely thing to be misjudged from the directory listing alone: `content/themes/handlebars/` being empty means "no one has authored a theme here," not "this code path doesn't work."

### 8.6 `theme.json`'s `pages` field is unread (the other three were wired 2026-08-10)

Covered in full in §3.2. `modes`, `defaultMode`, and `slots` used to sit in this same "authored, ignored" bucket — as of 2026-08-10 they're parsed and drive real render-time behavior (§3.1, §3.3, §6.1). `pages` is the one still-inert field: `DiscoveredTheme.pages` is populated by scanning the `pages/` directory on disk, completely independent of this manifest array, and the array can drift from the real directory contents with zero validation error (§3.2 has the verified per-theme drift table). If you're debugging "why doesn't changing `pages` in `theme.json` do anything," that's why.

### 8.7 `templateChoice`'s `null` vs `""` distinction is a real historical bug, not a hypothetical trap

The doc comment on `resolvePostTemplate()` (`static-render.ts:240-241`) discloses a real regression from 2026-08-09: 15 of 19 published posts served the diagnostic page at HTTP 200 because the two states were conflated in an earlier version of this logic. This is exactly the kind of thing a new theme's post-template feature can silently reintroduce if a future admin-UI or migration path writes `""` where it means "not yet decided" instead of `null`.

### 8.8 A `region` template node and a `data-agent-element` region attribute are unrelated, despite the shared word

Covered in §6.5/§6.6. Written out again because the name collision is the single easiest thing to get wrong when skimming this codebase for "region."

### 8.9 No hot reload

Theme files on disk are read once at process boot (`discoverAllBuiltInThemes`, called once in `deps.ts`/`app.ts`). Editing a theme file directly (not through the `theme_write_file` agent tool, which re-reads after writing) requires a server restart to take effect. This is easy to forget mid-session and mistake for a bug in whatever you just edited.

---

## 9. Worked example: the minimal file set for a new static theme

This is the smallest set of files that will actually render on the live site, assuming the theme becomes the active one (§1.2). Every field/mechanism used below is cited to the section that explains it.

```
content/themes/static/my-theme/
  theme.json
  tokens.json
  css/styles.css
  pages/index.html
  nav.html
  footer.html
```

**`theme.json`** (§3):

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "version": "0.1.0",
  "tier": "static",
  "description": "A minimal worked-example theme."
}
```

`id` must equal the folder name (`my-theme`) or the theme fails validation (§3.1). Every other field here is optional.

**`tokens.json`** (§5) — becomes `:root { --bg: ...; }` etc.:

```json
{
  "--bg": "#ffffff",
  "--fg": "#111111",
  "--accent": "#2f6fed",
  "--font-body": "system-ui, sans-serif"
}
```

**`css/styles.css`** — note the `css/` subfolder, static-tier-only (§4):

```css
body { background: var(--bg, #fff); color: var(--fg, #111); font-family: var(--font-body, sans-serif); }
.wrap { max-width: 960px; margin: 0 auto; padding: 0 1.5rem; }
```

**`nav.html`** — a partial, filename-matched (§6.1), with a real CMS-menu embed marker (§6.2) so this theme doesn't repeat `fuel`'s gap:

```html
<header class="site-header">
  <div class="wrap">
    <a href="index.html">My Theme</a>
    <nav data-embed-config='{"type":"menu","id":"menu-header-nav"}'>
      <a href="index.html" data-nav-id="index">Home</a>
    </nav>
  </div>
</header>
```

**`footer.html`** — a partial:

```html
<footer class="site-footer">
  <div class="wrap"><span>&copy; My Theme</span></div>
</footer>
```

**`pages/index.html`** — `pages/index.html` is the one file `loadStaticTierAssets` requires; its absence is a hard validation error (`theme.ts:245`). Note the `../css/`/`../js/` relative paths (rewritten at render time, §1.3/`rewriteAssetPaths`) and the slot markers (§6.1):

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>My Theme</title>
  <link rel="stylesheet" href="../css/styles.css" />
</head>
<body>
  <div data-tovu-slot="nav" data-nav-current="index"></div>
  <main class="wrap">
    <h1>Hello from My Theme</h1>
    <p>This is the home page.</p>
  </main>
  <div data-tovu-slot="footer"></div>
</body>
</html>
```

This alone is a valid, renderable theme. To add a marketing page, drop another file in `pages/` (e.g. `pages/about.html`) and it becomes reachable at `/about` automatically (`pages.ts:504`, §1.4 step 4) — no manifest entry needed for it to render, though listing it in `theme.json`'s `pages` array is the existing-theme convention even though nothing reads it (§3.2). To support the post-template picker, add a page with a `data-embed-id="{{post}}"` marker (§6.4/§7.1) and list its filename in `theme.json`'s `postTemplate` array.

---

## 10. Further reading

- `ADS-memory/reports/architecture/ADR-010-declarative-themes-by-default.md` — the original two-tier decision (declarative default, code as trusted escape hatch). Predates the `static` tier entirely; read it for the *why*, not for an accurate tier inventory.
- `ADS-memory/reports/architecture/ADR-020-theme-capability-tiers.md` — the three-tier (declarative/templated/code) capability model and the LiquidJS engine-selection rationale. Also predates `static` and `handlebars` as named tiers — those were added later, and this ADR should not be read as the complete tier list.
- `ADS-memory/reports/architecture/ADR-047-widgets-region-and-embed-placement.md` — the widget-region and generic-embed design (§6.4/§6.5 above).
- `ADS-memory/specs/004-declarative-theme-system/` — the original declarative-tier feature/behavior/error/state specs (SPEC-004).
- `ADS-memory/docs/architecture/tovu-architecture.md` — whole-repo architecture map.
- `src/features/theme/theme.ts`, `src/features/theme/static-render.ts`, `src/server/http/site/render.ts`, `src/server/routes/site/pages.ts` — the actual source of truth; this guide cites specific lines in all four, but they move, so re-check line numbers against current `HEAD` before trusting them verbatim in a future session.
