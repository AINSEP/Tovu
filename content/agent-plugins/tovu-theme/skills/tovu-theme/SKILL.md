---
name: tovu-theme
description: Build a Tovu theme — either scaffold a NEW one (static, templated or declarative tier; hand-authored, or compiled from a React/Vue/Angular build), or convert an existing static website (plain HTML/CSS/JS — no Tovu, no database, no admin) into a Tovu static-tier theme. Encodes the theme-format rules a generic approach gets wrong — the apiVersion-2 folder layout, the manifest keys the live loader actually reads, which token file holds which color palette regardless of the source's own default, the publishedPages allow-list that leaves every non-index page unreachable until explicitly turned on, the narrow sentinel rewrite that a JS fetch() call slips straight past, and the hard boundary around binary assets no agent tool in this product can cross. Use whenever asked to create, scaffold or start a theme, wrap a framework build as a theme, or "Tovu-ize", import, migrate, or convert a static site/export/template into a theme.
argument-hint: "[new: theme id, tier static|templated|declarative, authored|compiled] or [convert: source folder]"
---

# Tovu themes: make a new one, or convert an existing static site

This plugin covers two jobs that share one theme format:

- **Job A — a new theme** (Part A below): from scratch, from a copy of a working theme, or
  wrapping a framework build as a `compiled` theme.
- **Job B — convert an existing static site** (Part B below): someone has a plain HTML/CSS/JS
  site and wants it running as a Tovu theme. If they pointed you at a folder that looks like a
  website, this is the job.

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

## Tools: no new ones

Everything runs on tools that already exist: `fs_list_files` / `fs_read_file` to survey and
read a source tree, and `theme_write_file` / `theme_edit_file` / `theme_list_files` /
`theme_read_file` to author the theme, `theme_rescan` to make a new theme folder show up (it
also returns each invalid theme's errors), and `theme_set_page_published` to publish a page
(Rule 4). If you hit something those genuinely cannot do, say exactly what and why, and propose
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

# Shared rules (both jobs)

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

A copied theme has the mirror-image problem: every hardcoded `/theme-assets/<old-id>/` path
keeps loading the ORIGINAL theme's logo and icons. Replace each with the new id.

## Assets: the hard boundary these tools cannot cross

`fs_read_file` refuses anything that trips its binary/NUL-byte sniff, and caps every read at
1MB. `theme_write_file`/`theme_edit_file` accept **UTF-8 text only** — there is no base64 or
binary path through either tool, at any size. Put together: there is currently **no agent-tool
path in this product that can move a binary asset — image, video, font, icon — into a theme.**
This is not a gap in this skill; it's a gap in the tool surface, and no clever encoding trick
closes it (asking a model to reproduce image bytes as text is not a real option).

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
- **True binaries — images, video, fonts, icons, favicons** — cannot go through any agent tool
  today, full stop. **Say this plainly to the operator, by name, with the exact source and
  destination paths**: "copy `<source>/assets/` to `<site>/themes/static/<theme-id>/assets/`
  yourself (Finder, `cp -r`, your own script) — no tool in this session can move binary files."
  Then continue with everything that IS text-portable, rather than blocking the whole task on
  the one part that needs a human's hands. Do not guess at image dimensions/content to "fill
  in" a placeholder instead — say what's missing and why.

# Part A — A new theme

## A1 — Gather the essentials

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

## A2 — Start from a working theme when you can

The fastest correct path (themes-guide §4): copy a working theme of the same tier — e.g.
`themes/static/basic` — to `themes/<tier>/<id>/`, set `theme.json`'s `id` and `name`, replace
every `/theme-assets/<old-id>/` path (Rule 5), then `theme_rescan`. Starting from something that
already loads is much faster than starting from nothing, and every rule above is already
satisfied in it.

## A3 — Or scaffold the folder tree

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

Always close with a plain-language recap, not just "done": where the theme is, whether
`theme_rescan` loaded it clean, which pages are published (Rule 4), and what's left for them —
Activate it in Admin → Themes, copy any binary assets (Assets section), and Publish to send the
theme to the live site.

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

# Reporting rules (both jobs)

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
