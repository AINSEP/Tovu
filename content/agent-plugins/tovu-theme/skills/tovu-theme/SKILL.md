---
name: tovu-theme
description: Build a Tovu theme — either make a NEW one (by default theme_duplicate an existing theme and restyle the copy; or scaffold one from scratch in the static, templated or declarative tier, hand-authored or compiled from a React/Vue/Angular build), or convert an existing static website (plain HTML/CSS/JS — no Tovu, no database, no admin) into a Tovu static-tier theme. or make a theme that MATCHES a reference site at a URL (rebuild its design system, then compare screenshots of the source and this site until they match). Encodes the theme-format rules a generic approach gets wrong — the apiVersion-2 folder layout, the manifest keys the live loader actually reads, which token file holds which color palette regardless of the source's own default, the publishedPages allow-list that leaves every non-index page unreachable until explicitly turned on, the narrow sentinel rewrite that a JS fetch() call slips straight past, and which binary assets an agent tool can bring in (fonts and images from a URL) versus which need a human copy. Use whenever asked to create, scaffold or start a theme, wrap a framework build as a theme, "Tovu-ize", import, migrate, or convert a static site/export/template into a theme, or make the site look like another site (also the theme step of a site-import).
argument-hint: "[new: theme id, tier static|templated|declarative, authored|compiled] or [convert: source folder] or [match: reference URL]"
---

# Tovu themes: make a new one, convert an existing static site, or match a reference site

This plugin covers three jobs that share one theme format:

- **Job A — a new theme** (Part A below): by default a `theme_duplicate` copy of a working
  theme that you then restyle; otherwise from scratch, or wrapping a framework build as a
  `compiled` theme.
- **Job B — convert an existing static site** (Part B below): someone has a plain HTML/CSS/JS
  site and wants it running as a Tovu theme. If they pointed you at a folder that looks like a
  website, this is the job.
- **Job C — match a reference site** (Part C below): the owner gives a URL (or `site-import`
  hands one over) and wants this site to LOOK like it. Rebuild its design system in a theme,
  then compare screenshots of the source and this site until they match.

Read the shared rules first either way — both jobs fail in the same places.

## The one thing to say before anything else

**This produces a THEME — a design, not content.** A theme gets you pages, styling, and scripts
an operator can pick as their active theme. It does not create Posts, Pages, menus, or any row
in the CMS. A theme page and a CMS-authored Page are different things that happen to render
through the same pipe — see `development/docs/themes/themes-guide.md` §6 ("Templates vs pages")
if a slug collision comes up. Say this before you start, not after the operator asks "where's
the content I can edit."

**Every theme page is UNREACHABLE (404) except `index` until you explicitly publish it.** This
is the single most consequential, easiest-to-miss step in both jobs — see Rule 4. A theme that
loads with `status: "valid"` and ships 15 real page files can still serve exactly one working
URL. Do not treat "the theme validated" as "the site works."

## Tools

Everything runs on tools that already exist: `fs_list_files` / `fs_read_file` to survey and
read a source tree, `theme_duplicate` to start a new theme as a full copy of an existing one
(Part A2), and `theme_write_file` / `theme_edit_file` / `theme_list_files` /
`theme_read_file` to author the theme, `theme_rescan` to make a hand-built theme folder show up
(it also returns each invalid theme's errors), `theme_set_page_published` to publish a page
(Rule 4), and `theme_set_active` to switch the live site to a theme — only once the owner has
approved it. Part C adds `web_fetch_page` (read the source's HTML and CSS), `web_screenshot_page`
(see the source, and this site through any installed theme with `themeId`), `content_read.menu` (the header menu's id) and
`media_import_from_url` (raster logos and images into the media library) and
`theme_import_file_from_url` (a font or image file from a URL, saved into the theme folder). If you hit something those genuinely cannot do, say exactly what and why, and propose
the tool **before** building it — do not build against an assumed API. A new tool needs a
`DERIVED_RISK_BY_TOOL_ID` entry or `assertToolIsWirable` throws at composition-root boot; that
is a real cost, not a formality.

The one part that needs more than these tools is a **compiled** theme (Part A): its build runs
a framework's own toolchain and its hashes are computed in a shell, so it needs a Tovu checkout
or the operator's own machine. Say so up front if that's what they want.

## Where themes live, and which docs to trust

Themes live in the site folder under `themes/<tier>/<id>/` (e.g. `<site>/themes/static/<id>/`);
the built-ins ship from `content/themes/<tier>/<id>/` and a new site gets a copy on first start.
The folder name must equal `theme.json`'s `id`.

`development/docs/themes/themes-guide.md` is the one source of truth for themes (it superseded
`theme-authoring-guide.md` (v1) and `theme-authoring-guide-v2.md` on 2026-09-24 — both are kept
only as history, and parts of them are wrong about today). `theme-layout.ts`
(`resolveThemeLayout()`) is the one pure, tested, apiVersion-aware source of truth for every
path name if a doc and what you see on disk seem to disagree.

# Shared rules (every job)

## Rule 1 — Build as apiVersion 2. The v1 flat layout is legacy, not a safe default.

Every theme actually served by a real site today (`sites/*/themes/static/basic`, and every
built-in in `content/themes/static/*`) declares `"apiVersion": 2` and uses the nested layout:

```
theme.json
tokens.json
tokens.light.json        # optional
css/theme.css             # NOT css/styles.css — that's v1
scripts/                  # NOT js/ — that's v1
render/pages/*.html        # NOT a bare pages/ — that's v1
render/partials/*.html     # NOT bare nav.html/footer.html at theme root — that's v1
assets/, icons/, screenshots/, manifest.webmanifest   # convention, not enforced
```

The only files `loadTheme()` cannot start without: `theme.json`, `tokens.json`,
`render/pages/index.html`. Everything else is optional or convention. Every page file keeps the
exact stylesheet line `<link rel="stylesheet" href="../css/theme.css" />` in its `<head>` —
Tovu injects the tokens right before it and matches it character for character.

There is no "v1 or v2?" question to ask anyone any more: v2 is the live format (an older
version of this skill told you v2 didn't load yet and to offer v1 instead — that was true on
2026-08-17 and stopped being true the next day).

## Rule 2 — `theme.json`: write the keys the live loader reads, not the planned ones

Some v2 manifest keys were designed but never built. The validator flags them as
unimplemented, and the runtime ignores them — a theme that uses them looks right and renders
wrong. Write these, as `content/themes/static/*/theme.json` and `sites/*/themes/static/*/theme.json`
actually do today:

- `apiVersion: 2`, `id` (= folder name), `name`, `version`, `tier`, `description`.
- `modes` and `defaultMode` as **flat** top-level fields. `defaultMode` MUST be listed in
  `modes`, or the theme fails to load. NOT a nested `tokens: { defaultMode, modes }` object —
  that restructure was never built.
- `slots` (NOT `partials`) — `{ "<key>": { "source": "<file>.html", "honorsCurrentPage"?: true,
  "variants"?: {...} } }`. The runtime reads `slots`, never `partials`: a `partials` block
  validates and then renders with every partial unresolved. Use `"honorsCurrentPage": true`,
  not the older `"activeAttr": "data-nav-current"` string spelling — both are accepted, but only
  the boolean is current.
- `templates` — page files a Post/Page's template picker can choose; each must exist and
  contain at least one `content` marker. Only if this theme should render CMS content through it.
- `publishedPages` — see Rule 4.
- `regions: string[]` — real and wired, a flat array of region-key strings, e.g.
  `["header", "footer"]`. Only add if the theme actually places widgets in a region; don't
  cargo-cult it onto every theme.
- `license: { spdx, file }` — accepted, and required by `tovu theme validate --profile
  publish`. Still create the `LICENSE` file itself if you declare it.
- `build` — compiled themes only, see Part A.
- Skip entirely: `partials`, `renderer`, nested `tokens`, object-valued `engine`, `ai`,
  `scripts.entries`, `assets.previewGallery`, `authors`/`attributions` — no runtime consumer.
  `pages` appears in the built-ins but does nothing (Tovu finds pages by scanning
  `render/pages/`); harmless to keep in sync, pointless to fill in as if required. `fonts` is
  **inert for `static` tier** — only `pageShell()` reads it, and a static theme's own complete
  `<head>` never reaches it; `<link>` or self-host a web font directly in each page's `<head>`.

## Rule 3 — Map CSS custom properties onto tokens.json / tokens.light.json correctly, even when the source's OWN default is "light"

Tovu always emits `tokens.json` as a bare, unconditional `:root { ... }` block — it wins
whenever `data-theme` is anything other than the literal string `"light"`. `tokens.light.json`
(optional) is emitted as `:root[data-theme="light"] { ... }` specifically. **There is no
override slot for any other mode name** — "dark" is never a filename, it's just "whatever
`tokens.json` says," selected by not being light.

A source site's own CSS (or a design you're handed for a new theme) may organize its two
palettes the other way around — e.g. grouping its light values under
`:root, :root[data-theme='light']` together (meaning light is the *bare* default) and its dark
values under the narrower `:root[data-theme='dark']`. If you copy the source's own "default"
block into `tokens.json` because it looks like the natural mapping, you will get the wrong file
holding the wrong palette, and dark mode (or whatever the non-light state is) will render with
light colors. The correct rule, regardless of which state the source treats as its own default:

- Whichever palette should show for **anything other than explicit light** → `tokens.json`.
- Whichever palette should show **only when `data-theme="light"`** → `tokens.light.json`.
- Set `defaultMode` to whatever the source's own boot logic actually defaults to (read its
  inline theme-detection script, don't guess) — that's what makes the server-stamped starting
  value match the source's real first-load appearance, independent of which file holds which
  palette.

## Rule 4 — Publish the pages you write. Absence of a file is not presence of a route.

`theme.json`'s `publishedPages` field defaults every candidate page (everything except `index`,
`404`, and a declared `templates` shell) to **unpublished** — `isStandaloneThemePage()` refuses
to serve it, and the request falls through to the ordinary 404 path, even though the page
file is right there on disk and the theme loaded with zero errors. This is retroactive and
absolute: it is not a v1-compatibility fallback, and there is no flag that restores "any file
in `render/pages/` is automatically a route."

**List every page you write (other than `index`) in `publishedPages`, or it will 404** — by
writing the array into `theme.json`, or one page at a time with `theme_set_page_published`.
There is no warning for this anywhere in the load/validate pipeline — a "successfully
converted, fully valid" theme can still be a one-page site in production. Verify by checking
the array against your own page inventory before calling the work done, not by trusting that
writing the file was enough.

## Rule 5 — CSS/script paths get a narrow rewrite; almost nothing else does

`rewriteAssetPaths()` only rewrites an `href=` or `src=` attribute whose value starts with the
literal sentinel `../css/` or `../scripts/` (`../js/` for a v1 theme) — written verbatim in
your authored HTML regardless of the page's real folder depth; it is a fixed string the
rewriter matches, not a real relative path. Everything else you reference from a page —
`<img>`/`<video>`/`<source>` `src`, `<link rel="icon">`, `manifest.webmanifest`'s `icons[].src`
— gets **no** rewrite at all. Author those with the real, absolute path directly:
`/theme-assets/<theme-id>/<path-relative-to-theme-root>`. (A plain CSS file's own `url(...)`
references, e.g. a `@font-face` pointing at `../assets/fonts/x.woff2` from inside
`css/theme.css`, are the one exception that doesn't need this: the stylesheet is served as a
real static file at its real location, so an ordinary relative URL from *there* just works —
this only applies to page-level `href`/`src` attributes, which are injected into a virtual
route, not served from a real path.)

**A `fetch()`/`XMLHttpRequest` call inside a `<script>` — inline or in a vendored `.js` file
— is invisible to `rewriteAssetPaths()` entirely.** It only touches parsed HTML attributes.
If a script does something like `fetch('./data/' + id + '.json')`, that resolves fine on a real
static host (the page and the fetched file are real sibling files) but breaks under Tovu: every
static-tier page is served at a flat, single-segment virtual route (`/whatever`, never a real
directory), so a *single-segment* relative reference (`./other-page.html`) still resolves
correctly (Tovu's router strips a trailing `.html` from the slug, so even an unmodified
`<a href="other-page.html">` just works), but a *multi-segment* relative fetch (`./data/x.json`,
two path segments) has no route to land on and 404s silently in the console — nothing renders,
and nothing tells you why. **Find every fetch/XHR/dynamic-import call in every script you write
or vendor and check whether its URL has more than one path segment relative to the page.** If
it does, hand-edit that one line to the real absolute `/theme-assets/<theme-id>/...` path the
referenced file was actually placed at. This is a by-hand fix, not something a conversion can
do generically — flag it to the operator rather than silently leaving it broken or silently
"fixing" it into something unverified.

A duplicated theme has the mirror-image problem: `theme_duplicate` rewrites only `theme.json`,
so every hardcoded `/theme-assets/<old-id>/` path keeps loading the ORIGINAL theme's logo and
icons. Replace each with the new id.

## Assets: what can and cannot reach a theme folder

`fs_read_file` refuses anything that trips its binary/NUL-byte sniff, and caps every read at
1MB. `theme_write_file`/`theme_edit_file` accept **UTF-8 text only** — there is no base64 or
binary path through either tool, at any size. The one binary door is
`theme_import_file_from_url`: it downloads a font (woff2/woff/ttf/otf) or image
(png/jpg/gif/webp/avif/ico) from an https URL into the theme folder, byte for byte. A binary that
exists only on a local disk has **no agent-tool path into a theme**, and no encoding trick
closes that (asking a model to reproduce image bytes as text is not a real option).

The one exception is `theme_duplicate`: it copies the source theme's folder on the server,
binaries included, so a duplicated theme already has every image, font and icon its source had.
It cannot bring in a NEW binary.

**Batch repeated calls.** `theme_read_file`, `theme_write_file`, `theme_edit_file`,
`theme_import_file_from_url`, `web_fetch_page` and `media_import_from_url` take
`items: [{...}, ...]`: several files or URLs in ONE call (fields such as `themeId` set once at the
top level), never one call per file. Each item reports its own `ok` / `result` / `error`.

What this means in practice:

- **Text files** (`.html`, `.css`, `.js`, `.json`, `.md`, `.svg`, `.webmanifest`) — read with
  `fs_read_file`, transform, write with `theme_write_file`. A large minified `.js` (500-700KB)
  still fits the 1MB cap; check the byte size before assuming a big file needs special handling.
- **A file that "should" be text but trips the binary refusal anyway** — check *why* before
  concluding it's unconvertible. A JS file can legitimately contain a literal NUL byte as part
  of its own algorithm (a sentinel/placeholder token, e.g. a markdown parser protecting code
  spans) and still be perfectly ordinary, working source — `fs_read_file`'s sniff can't tell
  the difference. Either way, the fix is the same as for a true binary: it needs a real
  filesystem copy, not a tool call.
- **From a URL (Part C)** — a font, or an image the theme itself uses (logo, icon, favicon,
  background): `theme_import_file_from_url` into `assets/…`. A content image an editor should manage:
  `media_import_from_url`, then its `publicUrl`. An SVG: `web_fetch_page` with `format: "raw"`, then
  `theme_write_file`.
- **Local-only binaries — images, video, fonts, icons, favicons with no URL** — cannot go through
  any agent tool today, full stop. **Say this plainly to the operator, by name, with the exact source and
  destination paths**: "copy `<source>/assets/` to `<site>/themes/static/<theme-id>/assets/`
  yourself (Finder, `cp -r`, your own script) — no tool in this session can move binary files."
  Then continue with everything that IS text-portable, rather than blocking the whole task on
  the one part that needs a human's hands. Do not guess at image dimensions/content to "fill
  in" a placeholder instead — say what's missing and why.

# Part A — A new theme

## A1 — Gather the essentials

For the default path (A2, duplicate and restyle) you need only a **name** for the new theme and
**which theme to start from** — the theme the site uses now unless the owner says otherwise. The
copy keeps its source's tier, and its id is derived from the name. The questions below are for
building from scratch (A3).

Ask (batch into one question if more than one is missing):

1. **Theme id** — lowercase, hyphenated, must equal the folder name.
2. **Tier** — `static`, `templated`, `declarative`, or `handlebars` (supported, no example theme
   ships). Recommend `static` unless they need loops/conditionals over live data (`templated`)
   or a pure-data theme (`declarative`). `code` is reserved and unbuilt — refuse it.
3. **Authored or compiled?** Only `static` tier supports `compiled` (`build.source: "compiled"`
   requires `tier: "static"` — enforced by `loadTheme()`).
   - **Authored**: hand-written HTML/Liquid/JSON, no framework build.
   - **Compiled**: the theme is generated by a framework build (React/Vue/Angular). Needs a
     `sourceDir` with the framework-native source.
4. **Name, description, one-line purpose.**

## A2 — Default: duplicate a working theme, restyle the copy

Starting from something that already loads is much faster than starting from nothing, and every
rule above is already satisfied in it (themes-guide §4).

1. **Pick the source.** Use the theme the site runs now unless the owner names another.
   `site_get_profile { sections: ["theme"] }` exposes the configured id and installed active row
   (the exact fields and unavailable/disabled cases are in C1). A bundled stock theme
   (e.g. `tovu-starter`, the default for a new site) works too. `content_read.theme` gives the roster's ids.
2. **Duplicate it:** `theme_duplicate { sourceThemeId, newName }` (add `newId` only if the owner
   asked for a specific folder id). It copies every file — binaries included — into a new folder,
   gives the copy its own `id`/`name`, resets `version` to `1.0.0`, records `lineage.from`, and
   returns the new `themeId` with its load `status`/`errors`. The source is never touched. Leave
   `activate` at its default `false`.
3. **Restyle the COPY**, never the source: `theme_edit_file` / `theme_write_file` on the new
   `themeId` — tokens (Rule 3), `css/theme.css`, pages, partials — and replace every
   `/theme-assets/<old-id>/` path with the new id (Rule 5).
4. **Show it to the owner** and wait for an explicit yes. Only then switch the live site with
   `theme_set_active { themeId }` (or Admin → Themes). Report the previous theme id it returns so
   the switch can be undone.

## A3 — Or scaffold the folder tree from scratch

### Authored (any tier)

```
<id>/
  theme.json
  tokens.json
  LICENSE                    # only if you declare `license` — see Rule 2
  css/theme.css
  render/
    pages/index.html         # (.liquid for templated, .json for declarative)
    partials/nav.html
    partials/footer.html
```

Add `render/layouts/`, `scripts/` (skip for `declarative` — that tier runs no code at all),
`assets/`, `locales/` only if the theme actually needs them — don't scaffold empty dirs nobody
asked for.

Do NOT create `ai/`, `tests/`, or a root `AGENTS.md` — they are approved folder names with
**zero** implementation behind them, not even a stub format worth pre-filling.

A minimal page (themes-guide §4):

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>{{title}}</title>
<link rel="stylesheet" href="../css/theme.css" />
</head>
<body>
<div data-embed-config='{"type":"partial","id":"nav","current":"team"}'></div>
<main>
  <h1>Our team</h1>
</main>
<div data-embed-config='{"type":"partial","id":"footer"}'></div>
<script src="../scripts/main.js"></script>
</body>
</html>
```

`{{title}}` is the only placeholder of its kind, and only works inside `<title>`.

### Compiled (`static` tier only)

```
<id>/
  theme.json                 # build.source: "compiled" — see A4
  <sourceDir>/                # e.g. "authoring/" — framework-native, untouched by these rules
  css/theme.css               # GENERATED — from the framework build, adapted into this shape
  render/pages/index.html     # GENERATED — from the framework build, adapted into this shape
```

Two things not to gloss over:

- **The framework build's output has to be brought into `render/`/`css/` shape.** From a Tovu
  checkout, `tovu theme normalize-build <dir> --primary-stylesheet <file>` (wraps
  `code-tier-asset-normalizer.ts`) does it; otherwise the generated tree has to be hand-adapted.
- **`build.artifactHashes` is REQUIRED and actually enforced** (`loadTheme()`'s compiled-build
  checks) — a theme missing it loads `status: "invalid"`. After the generated tree is final,
  compute hashes:
  ```bash
  cd <site>/themes/static/<id>
  find css render -type f -exec sh -c 'echo "\"$1\": \"sha256:$(shasum -a 256 "$1" | cut -d" " -f1)\""' _ {} \;
  ```
  Paste the output into `build.artifactHashes` in `theme.json`.

## A4 — Write `theme.json`

Fill only the fields the tier needs, per Rule 2. For a compiled theme add `build`:
`source: "compiled"`, `framework`, `sourceDir`, `artifactHashes`. `framework` is a **closed
union** — only `"react"|"vue"|"angular"` parse; anything else silently drops. If the real source
framework isn't one of those three, say so in `NOTICE.md` and still pick the closest of the
three for `framework` (or omit it) rather than inventing a fourth value.

Then the tokens (Rule 3), the pages, and `publishedPages` for every page except `index`
(Rule 4).

## A5 — Check it

`theme_rescan` loads the folder and returns `invalid: [{ themeId, errors }]` for anything that
fails — a theme that isn't in the list or shows errors is not done. From a Tovu checkout,
`tovu theme validate <dir>` runs the full validator. Either way, check by hand too:

- [ ] Folder name === `theme.json` `id`
- [ ] `declarative` tier has no `scripts/`
- [ ] compiled theme: `tier === "static"`, `build.sourceDir` non-empty, `build.artifactHashes`
      non-empty and covers every generated file with a correct hash
- [ ] `build.sourceDir` does not collide with a reserved generated dir name like `preview`
- [ ] no `data-agent-element` attribute anywhere in theme markup (admin-only, not theme markup —
      the validator rejects it)
- [ ] every `templates` entry resolves to a real `render/pages/` file with at least one
      `content` marker
- [ ] every page except `index` is in `publishedPages`

## A6 — Tell the user what they actually have

Always close with a plain-language recap, not just "done": where the theme is (and, for a
duplicate, which theme it was copied from), whether it loaded clean, which pages are published
(Rule 4), and what's left for them — approve it so it can be activated (never activate it
yourself without that approval), copy any binary assets the copy doesn't already have (Assets
section), and Publish to send the theme to the live site.

# Part B — Convert an existing static site

## What this job converts, and what it refuses to

It converts a **static, no-build, no-server-logic site** — plain `.html`/`.css`/`.js`, the
kind you'd deploy by copying files to a bucket. It does **not** attempt to port a site with
its own backend, database, build step (React/Vue/Astro/Next output), or server-rendered
templating — that is a different, much larger job (a `build`-declared "compiled" theme — Part
A — or no theme at all). If the source has a `package.json` with a real build script, a
framework's dev server, or anything beyond static assets, say so and stop rather than
half-converting something this procedure was never built for.

## Survey before you touch anything: pages, families, and cruft

1. `fs_list_files` the source tree (or, working from a real filesystem checkout outside the
   product, list it directly). Bucket every file: `.html` → candidate pages, `.css`/`.js` →
   candidate stylesheets/scripts, everything else → candidate assets.
2. **Recognize cruft and leave it out** — do not port it "to be faithful":
   - `*.bak`, `*-old.*`, `*.orig`, editor swap files.
   - `.vercel/`, `.netlify/`, `.git/`, `node_modules/`, lockfiles, deploy-platform metadata —
     none of it is content, and some of it (project/org ids) shouldn't ship in a theme package.
   - A CSS/JS file zero surviving page actually `<link>`s or `<script src>`s. Check this with a
     real reference scan per file you're about to vendor, not by assuming "it was in the repo
     so it must be used" — an all-in-one bundle sitting next to the split files it duplicates,
     or a script only an unconverted page needs, are both easy to drag in by accident.
   - **A substring match on a filename is not evidence.** `grep -l lightbox` matches both
     `lightbox.js` and `video-lightbox.js`. Confirm the exact `src="..."`/`href="..."` value
     before deciding a file is used or unused.
3. **Group pages into families by what they actually load**, not by folder position — grep
   every page's `<link href>`/`<script src>` set and diff the sets. Two pages that both look
   like "marketing pages" can load completely different stylesheets (a page with its own fully
   self-contained inline `<style>` + tokens vs. one that depends on a shared system stylesheet)
   or completely different chrome. Do not assume one nav/footer/token-set serves the whole
   site until the file sets actually agree.
4. **Verify a shared header/footer/nav is really byte-identical before extracting it as a
   partial — hash it, don't eyeball it.** `awk '/<header/,/<\/header>/' page.html | md5` across
   every candidate page. Two pages can look the same on a skim and differ by one attribute or
   one missing CTA — forcing them onto the same partial silently changes the page that had less
   in it. A page whose hash doesn't match the rest almost always means its whole layout family
   is different (different template, different section of the site, e.g. a docs viewer vs. the
   marketing pages) — treat it as its own family, not a partial to fix later.
5. **A relative-URL grep over raw HTML will match text that isn't a real reference.** A
   `<pre><code>` "copy this snippet" install sample commonly contains literal
   `href="./whatever.css"`-looking text, HTML-entity-escaped (`&lt;link href="./x.css"&gt;`) —
   the `href="..."` part itself is *not* entity-escaped, so a naive find/replace over the whole
   document will "fix" a code sample into something that no longer works if a visitor copies
   it. Anchor rewrites to the real `<head>`/`<body>` occurrence (first match, or a line-range
   check), not a document-wide substitution, whenever a page contains copy-pasteable code.

## Procedure

1. **Survey** (above). Produce a page inventory grouped by family (shared chrome + shared
   stylesheet set), and a cruft list (what you are NOT porting, and why).
2. **Scaffold**: `theme.json` (`apiVersion: 2`, `tier: "static"`, `id` = folder name — Rule 2),
   an empty `tokens.json`/`tokens.light.json` to fill in next.
3. **Tokens** (Rule 3): find the source's real `:root` custom-property declarations (may live
   in one shared stylesheet, or be duplicated inline per page for a self-contained "family" —
   check both). Map to `tokens.json`/`tokens.light.json` per Rule 3's rule, not by assumption.
4. **Partials**: for each family sharing byte-identical chrome (survey step 4), extract the
   fragment into `render/partials/<name>.html` and replace it in every page of that family with
   `<div data-embed-config='{"type":"partial","id":"<name>"}'></div>` (add `"current":"<page>"`
   if the nav honors a current-page state). A family with no shared chrome stays fully inline,
   page by page — do not force a partial where the source doesn't actually share one.
5. **Pages**: for each source `.html` file you're converting, write `render/pages/<id>.html`
   with the partial markers substituted in and every asset/script/stylesheet path fixed per
   Rules 3/5. Preserve everything else byte-for-byte — a theme page's job is to be a faithful,
   working copy, not a rewrite.
6. **Vendor scripts/stylesheets** the pages actually load (survey step 2's usage check) into
   `scripts/`/`css/` (or a `vendor/` subfolder for a clearly third-party library, matching
   `basic`'s own `scripts/vendor/kuinetic.all.js` precedent) — copy via `fs_read_file`/
   `theme_write_file` for anything under the size/binary limits, flag anything that isn't
   (Rule 5's fetch-path check, and the Assets section).
7. **`publishedPages`** (Rule 4): list every converted page id except `index`. Do this as its
   own explicit step, not a thing you remember while writing `theme.json` in step 2 — it's easy
   to write the manifest before the page inventory is final and forget to come back to it.
8. **Verify, don't just assert**: `theme_list_files` the finished theme and diff it against
   your own inventory — every page and partial you meant to write should be there and nothing
   else. Then `theme_rescan` and check the theme is not in its `invalid` list. If you have
   access to run the real loader directly (`loadTheme()` from
   `apps/website/src/features/theme/theme.ts`, outside the running server — no daemon restart
   needed for this), do it: `status: "valid"`, an empty `errors` array, and the right page/
   partial ids are real, checkable facts, not something to take on faith. If you don't have
   that access, say so, and say what you verified instead (e.g. re-reading every written file
   back and manually checking the required-file list).
9. **Report**: what converted clean, what needed a by-hand fix and why (name the exact line),
   what you deliberately left out and why, and what a human still has to do (binary asset
   copy, at minimum) before this theme is genuinely done. A "so, this is finished" report that
   skips the by-hand fixes and the asset gap is not an honest report of this procedure.

# Part C — Match a reference site

**Copy the source verbatim.** Use the source's real text, images, logo, brand names and fonts
exactly as they are: the header wordmark, nav labels, button labels, footer lines and any copy
written into the theme's partials or pages. Never substitute placeholder or rewritten copy, never
comment on who owns the content, and never ask about rights. Ask the owner nothing during Part C:
build the copy, run the compare loop, and report; switching the live site to it is the only
thing left for them to decide.

Goal: this site looks like the source, at desktop and mobile. A recolour is not a match: the
Luvira import (2026-10-08) duplicated the starter, changed tokens, never looked at its own page,
and shipped the starter's header, 720px column and fonts. Copy anything that helps: the source's
CSS rules, fonts, SVGs, markup patterns.

**Modular, not a flat copy.** Break the source into the theme's parts. The header and footer are
partials (`render/partials/nav.html`, `render/partials/footer.html`), and page sections reuse the
theme's page templates and partials instead of repeating markup per page. Every link list (the
header nav, each footer column, the legal links) is a menu: create it with `menus_create_menu`
from the source's links, then render it through a menu marker in the partial. Never hard-code a list of links into a partial: the
owner edits links in Admin → Menus, and hard-coded ones never show there (Luvira import,
2026-10-08: its footer's Explore and Legal links were baked into `footer.html`). Static themes
have no site-profile fields to render yet, so the site name, tagline and contact lines are written
once, in the header and footer partials, never repeated in page templates.

A caller (`site-import`) hands over: the source URL, the values it already extracted, the
imported main menu's id, and the header call-to-action (label + href). Re-extract anything
missing.

## C1 — Scaffold

1. `site_get_profile { sections: ["theme"] }` → check `sections.theme.status` is `"ok"`, then read
   `sections.theme.data.activeThemeId` (the configured id) and `sections.theme.data.active`
   (the installed theme's row). Use `active.id` when that row is a valid static theme. If
   `themeDisabled` is true, the active id is null, or the active row is missing, invalid or another
   tier, select a valid static theme from the roster instead. If the section is `"forbidden"` or
   `"unavailable"`, report that the active theme could not be read; do not guess which one is active.
   `content_read.theme` returns `{ themes: [...] }`, a roster, not the active id; use it to choose
   a valid static scaffold when needed. If none is available, use Part A's from-scratch path.
   Duplicate the selected theme with
   `theme_duplicate { sourceThemeId: <selected id>, newName: "<Source> match" }` (`activate` stays
   `false`). Use the `theme_duplicate` copy as a scaffold only — a file layout that loads — and
   replace its look. Never edit the live theme.
2. The compare loop (C4) sees the copy with `web_screenshot_page { sitePath, themeId: <copy id> }`,
   which renders this site's page through the copy WITHOUT activating it. Do not activate the copy
   to compare; visitors keep the live theme until the owner approves the switch.

## C2 — Extract the design system (read only)

1. `web_fetch_page { url, format: "html" }` → markup, `stylesheets`, `meta` (favicon,
   theme-color, og:image).
2. Every same-host stylesheet and font stylesheet, in ONE call:
   `web_fetch_page { format: "raw", items: [{ url: <stylesheet> }, ...] }` (up to 10 per call).
3. `web_screenshot_page { url, viewport: "desktop", fullPage: true }` and the same with
   `viewport: "mobile"`. These are the target.
4. Write the values down (hex, px, names) before touching a file:
   - **Palette**: page background, surfaces/cards, borders, body text, muted text, accent,
     accent hover, text on accent, links. `:root` custom properties first; else the rules on
     `body`, `a`, `button`, `h1`. `meta theme-color` confirms the brand colour.
   - **Fonts**: display (and its italic, if emphasis words are italic), body, nav; how they load
     (Google Fonts link, `@font-face` URLs, a provider kit).
   - **Type scale**: h1–h6, body, small; weights, line-heights; letter-spacing and uppercase
     (nav, eyebrows, section labels).
   - **Layout**: container max-width, gutters, section padding, grid columns, radius, shadows.
   - **Components**: header (logo or wordmark, nav style, CTA button, sticky, divider), buttons,
     pills/tags, cards, section labels ("01 •"), feature strips, footer columns.

Role → token (names the themes and the page-HTML contract use; do not invent others):

| Source role | Token |
|---|---|
| page background | `--bg` |
| card / panel; stronger | `--surface`; `--surface-2` |
| body text; secondary text | `--fg`; `--muted` |
| borders; strong borders | `--border`; `--border-strong` |
| brand / link / primary button; text on it | `--accent`; `--accent-fg` |
| heading font; body font | `--font-display`; `--font-body` |
| content max-width | `--container` |

## C3 — Write the theme (the copy only)

1. **Tokens** (Rule 3): palette, fonts and `--container` into `tokens.json` /
   `tokens.light.json`, colours exactly as the source wrote them. Light-only source: palette in
   `tokens.light.json`, `"defaultMode": "light"` in `theme.json`; keep the other mode readable
   (base palette with the source accent) and say so.
2. **Fonts**: `theme.json` `fonts` is inert for static themes (Rule 2). Import each font file the
   source loads (every `@font-face` `src`, and the files a provider stylesheet such as Google Fonts
   points at), all in ONE call:
   `theme_import_file_from_url { themeId, items: [{ path: "assets/fonts/<name>.woff2", url: <font file URL> }, ...] }`.
   Then copy the source's `@font-face` rules into `css/theme.css`, each pointing at its import:
   `@font-face { … src: url("../assets/fonts/<name>.woff2") }`. Include the italic face when the
   source uses italic emphasis. If an import is refused, fall back to linking: the provider stylesheet as the first
   line (`@import url("https://fonts.googleapis.com/css2?family=...")`) or the `@font-face` rule with
   its absolute `src: url("https://<source host>/...")`, and say which fonts are linked.
3. **CSS** (`css/theme.css`): set the base rules to the source's values — `body` background,
   colour, font, size; `h1`–`h6` family, size, weight, line-height; links; `.wrap` (the container);
   buttons. Then append the source's component styles, copied where they fit, in one block at the
   end: `/* ===== reference: <host> ===== */`. Later rules win.
4. **Header** — rewrite `render/partials/nav.html` from the source header:
   - Logo: SVG → `web_fetch_page` `format: "raw"` → `theme_write_file` `assets/logo.svg`;
     raster → `media_import_from_url` → its `publicUrl`; text wordmark → markup + CSS.
   - Menu: `<nav class="main-nav" data-embed-config='{"type":"menu","id":"<menu id>","variant":"tree"}'>`
     with the imported menu's id (`content_read.menu`). A static theme resolves a menu by the
     marker's id; `menus_assign_location` does not place a menu in a static theme.
   - CTA: `<a class="btn btn-solid nav-cta" href="<source CTA href>">label</a>`, styled like the
     source button.
   - Keep the classes the theme's scripts query (`site-header`, `nav-row`, `brand`, `main-nav`,
     `nav-actions`, `nav-toggle`, the `mnav` dialog) or edit the script to match. Remove the
     light/dark toggle when the source has none.
5. **Footer** — rewrite `render/partials/footer.html`: the source's columns and small print.
   Each link column is its own menu,
   `menus_create_menu { title: "Footer — <column heading>", slug: "footer-<heading>", items }`
   (reuse the menus `site-import` already made), rendered under the column's own heading:
   `<h4>Explore</h4><div data-embed-config='{"type":"menu","id":"footer-explore"}'>…</div>`. A static
   theme resolves the marker's `id` as a menu slug first, then as an id; links inside the marker
   are only a fallback until the menu has items. `theme_write_file` and `theme_edit_file` return a
   `warning` when a header, nav or footer partial still hard-codes a list of links.
6. **Page shell** — `render/pages/pages-default.html` wraps every Page, including imported
   pages: set its content wrapper to the source's container width (the starter's `post-detail`
   is a 720px reading column) and remove its `data-kui` reveal unless the source animates the
   same way. If the homepage renders through `render/pages/index.html`, do the same there.
7. Replace every `/theme-assets/<old-id>/` path (Rule 5). Read each write's `status`; fix
   `invalid` before the next file.

## C4 — Compare loop (mandatory)

One round:

1. `web_screenshot_page { sitePath: "/", themeId: <copy id>, viewport: "desktop", fullPage: true }`
   and `web_screenshot_page { sitePath: "/", themeId: <copy id>, viewport: "mobile", fullPage: true }`
   (plus any other page the owner cares about, at the same viewport as its source capture).
2. Compare with the source captures. List concrete differences, most visible first: header
   (logo, nav case and spacing, CTA), page background, accent, display font and italics,
   container width and hero layout, type scale, cards and pills, spacing, footer.
3. Fix the theme (or the page's HTML), then capture again.

Up to 3 rounds; stop early when nothing visible differs.
Never report the theme done without a capture of its own page.
If `web_screenshot_page` says this server cannot take screenshots, compare the theme's HTML and
CSS with the source's instead (`theme_read_file`, `web_fetch_page`), and report the match as
unverified.

## C5 — Report

- Theme id, copied from, and that it is NOT active yet (visitors still see the current theme;
  one `theme_set_active` call switches after the owner approves).
- Rounds run, and the captures behind the verdict: the `savedFiles` paths of each
  `web_screenshot_page` call (source and copy, per viewport, last round at least). Every capture is
  saved under the site folder's `.captures/<date>/`.
- Remaining differences, one line each, and why each is left (a missing asset, a source feature
  Tovu has no equivalent for).
- What the owner decides: activate the new theme (`theme_set_active`), or keep the current one.

**After activating** (the owner approved, or asked for the switch up front): the C4 captures used
`themeId`, which bypasses the live site, so they prove nothing about what visitors get. Check the
live site:
1. `theme_set_active { themeId: <copy id> }`. It refuses, and restores the previous theme, when the
   public render would not resolve the theme. Fix what it names; never report the switch as done.
2. `fetch_published_page { path: "/" }` (no `themeId`). The HTML must load `/theme-assets/<copy id>/`
   CSS, with no `/theme-assets/<previous id>/` left.
3. `web_screenshot_page { sitePath: "/", viewport: "desktop", fullPage: true }` WITHOUT `themeId`
   (and `viewport: "mobile"`). It must match the last C4 copy capture, not the old theme or an
   unstyled page. Report both `savedFiles` paths.

# Reporting rules (every job)

- **Say the page-publish state explicitly.** "Converted 6 pages" (or "scaffolded 6 pages") is
  not the same claim as "6 pages are reachable" — always report both the page count and the
  `publishedPages` list.
- **Never claim an asset "was migrated" if it went through a description rather than a real
  copy.** If binaries still need a human's filesystem access, say that plainly, with paths.
- **Name every by-hand fix with its file and line**, the way this plugin's own worked example
  does — "fixed the fetch path" without the line is not verifiable.

# References

- `references/theme-v2-contract.md` — condensed, code-verified field/path reference for the
  apiVersion-2 static-tier shape (the load-bearing facts from `theme.ts`/`theme-layout.ts`/
  `static-asset-contract.ts`, kept short on purpose — read the source files themselves for
  anything this condenses too far).
- `references/kuinetic-worked-example.md` — the real conversion Part B was proven against
  (kUInetic's own demo site), what broke on first contact, and the exact fixes. Read this
  before converting something with a docs-viewer-style client-side router, a JS-driven nav, or
  a site whose light/dark default doesn't match Tovu's own bare-`:root`-is-non-light
  assumption — all three showed up for real, not hypothetically.
- `development/docs/themes/themes-guide.md` — the one source of truth for themes: layout,
  markers, `theme.json`, styling, publishing, common mistakes.
- `apps/website/src/features/theme/theme-layout.ts` — the actual apiVersion-aware path
  resolver. The single most reliable source when a doc and reality seem to disagree.
