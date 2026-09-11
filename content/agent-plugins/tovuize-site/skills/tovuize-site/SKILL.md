---
name: tovuize-site
description: Convert an existing static website (plain HTML/CSS/JS — no Tovu, no database, no admin) into a Tovu static-tier theme. Encodes the theme-format rules a generic "port this HTML into a CMS" approach gets wrong — the apiVersion-2 folder layout, which token file holds which color palette regardless of the source's own default, the publishedPages allow-list that leaves every converted page unreachable until explicitly turned on, the narrow sentinel rewrite that a JS fetch() call slips straight past, and the hard boundary around binary assets no agent tool in this product can cross. Use whenever asked to "Tovu-ize", import, migrate, or convert a static site/export/template into a theme.
---

# Converting a static site into a Tovu theme

## The one thing to say before anything else

**This produces a `static`-tier THEME — a design, not content.** Converting a site gets you
pages, styling, and scripts an operator can pick as their active theme. It does not create
Posts, Pages, menus, or any row in the CMS. A theme page and a CMS-authored Page are different
things that happen to render through the same pipe — see `theme-authoring-guide.md` §7.2 if a
slug collision comes up. Say this before you start converting, not after the operator asks
"where's the content I can edit."

**Every converted page is UNREACHABLE (404) except `index` until you explicitly publish it.**
This is the single most consequential, easiest-to-miss step in this whole procedure — see
Rule 4. A theme that loads with `status: "valid"` and ships 15 real page files can still serve
exactly one working URL. Do not treat "the theme validated" as "the site works."

## What this plugin does, and what it refuses to do

It converts a **static, no-build, no-server-logic site** — plain `.html`/`.css`/`.js`, the
kind you'd deploy by copying files to a bucket. It does **not** attempt to port a site with
its own backend, database, build step (React/Vue/Astro/Next output), or server-rendered
templating — that is a different, much larger job (a `build`-declared "compiled" theme,
`theme.ts`'s `ThemeBuildInfo`, or no theme at all). If the source has a `package.json` with a
real build script, a framework's dev server, or anything beyond static assets, say so and stop
rather than half-converting something this procedure was never built for.

**No new tools.** The whole conversion runs on tools that already exist: `fs_list_files` /
`fs_read_file` to survey and read the source tree, and `theme_write_file` / `theme_edit_file`
/ `theme_list_files` / `theme_read_file` to author the theme. If you hit something those
genuinely cannot do, say exactly what and why, and propose the tool **before** building it —
do not build against an assumed API. A new tool needs a `DERIVED_RISK_BY_TOOL_ID` entry or
`assertToolIsWirable` throws at composition-root boot; that is a real cost, not a formality.

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

**`development/docs/themes/theme-authoring-guide-v2.md`'s own banner says v2 "does not exist
in the running system" — that banner is stale.** Its worked examples and field reference are
still the right source for the schema itself; just don't stop reading because the top of the
file tells you to. `theme-authoring-guide.md` (v1, no such banner) is the one to read for how
the render pipeline actually behaves, but its own file-layout section and worked example are
v1-only — do not copy its bare `pages/`/`nav.html` example verbatim. `theme-layout.ts`
(`resolveThemeLayout()`) is the one pure, tested, apiVersion-aware source of truth for every
path name if the two docs seem to disagree with each other or with what you see on disk.

The only files `loadTheme()` cannot start without: `theme.json`, `tokens.json`,
`render/pages/index.html`. Everything else is optional or convention.

## Rule 2 — Survey before you touch anything: pages, families, and cruft

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

## Rule 3 — Map source CSS custom properties onto tokens.json / tokens.light.json correctly, even when the source's OWN default is "light"

Tovu always emits `tokens.json` as a bare, unconditional `:root { ... }` block — it wins
whenever `data-theme` is anything other than the literal string `"light"`. `tokens.light.json`
(optional) is emitted as `:root[data-theme="light"] { ... }` specifically. **There is no
override slot for any other mode name** — "dark" is never a filename, it's just "whatever
`tokens.json` says," selected by not being light.

A source site's own CSS may organize its two palettes the other way around — e.g. grouping
its light values under `:root, :root[data-theme='light']` together (meaning light is the
*bare* default) and its dark values under the narrower `:root[data-theme='dark']`. If you copy
the source's own "default" block into `tokens.json` because it looks like the natural mapping,
you will get the wrong file holding the wrong palette, and dark mode (or whatever the
non-light state is) will render with light colors. The correct rule, regardless of which state
the source treats as its own default:

- Whichever palette should show for **anything other than explicit light** → `tokens.json`.
- Whichever palette should show **only when `data-theme="light"`** → `tokens.light.json`.
- Set `defaultMode` to whatever the source's own boot logic actually defaults to (read its
  inline theme-detection script, don't guess) — that's what makes the server-stamped starting
  value match the source's real first-load appearance, independent of which file holds which
  palette.

Also current, not legacy: a slot's `theme.json` entry is `"honorsCurrentPage": true`, not the
older `"activeAttr": "data-nav-current"` string spelling. Both are accepted, but the guide's
own worked example still shows the retired one — copy what `content/themes/static/*/theme.json`
and `sites/*/themes/static/*/theme.json` actually write today, not the doc's example.

## Rule 4 — Publish the pages you convert. Absence of a file is not presence of a route.

`theme.json`'s `publishedPages` field defaults every candidate page (everything except `index`,
`404`, and a declared `templates` shell) to **unpublished** — `isStandaloneThemePage()` refuses
to serve it, and the request falls through to the ordinary 404 path, even though the page
file is right there on disk and the theme loaded with zero errors. This is retroactive and
absolute: it is not a v1-compatibility fallback, and there is no flag that restores "any file
in `render/pages/` is automatically a route."

**List every page you convert (other than `index`) in `publishedPages`, or it will 404.**
There is no warning for this anywhere in the load/validate pipeline — a "successfully
converted, fully valid" theme can still be a one-page site in production. Verify by checking
the array against your own page inventory before calling the conversion done, not by trusting
that writing the file was enough.

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
If the source's own JS does something like `fetch('./data/' + id + '.json')`, that resolves
fine on a real static host (the page and the fetched file are real sibling files) but breaks
under Tovu: every static-tier page is served at a flat, single-segment virtual route
(`/whatever`, never a real directory), so a *single-segment* relative reference
(`./other-page.html`) still resolves correctly (Tovu's router strips a trailing `.html` from
the slug, so even an unmodified `<a href="other-page.html">` just works), but a *multi-segment*
relative fetch (`./data/x.json`, two path segments) has no route to land on and 404s silently
in the console — nothing renders, and nothing tells you why. **Find every fetch/XHR/dynamic-
import call in every script you vendor and check whether its URL has more than one path
segment relative to the page.** If it does, hand-edit that one line to the real absolute
`/theme-assets/<theme-id>/...` path the referenced file was actually placed at. This is a
by-hand fix, not something the conversion can do generically — flag it to the operator rather
than silently leaving it broken or silently "fixing" it into something unverified.

## Assets: the hard boundary this procedure cannot cross with tools alone

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
  Then continue converting everything that IS text-portable, rather than blocking the whole
  task on the one part that needs a human's hands. Do not guess at image dimensions/content to
  "fill in" a placeholder instead — say what's missing and why.

## Procedure

1. **Survey** (Rule 2). Produce a page inventory grouped by family (shared chrome + shared
   stylesheet set), and a cruft list (what you are NOT porting, and why).
2. **Scaffold**: `theme.json` (`apiVersion: 2`, `tier: "static"`, `id` = folder name), an empty
   `tokens.json`/`tokens.light.json` to fill in next.
3. **Tokens** (Rule 3): find the source's real `:root` custom-property declarations (may live
   in one shared stylesheet, or be duplicated inline per page for a self-contained "family" —
   check both). Map to `tokens.json`/`tokens.light.json` per Rule 3's rule, not by assumption.
4. **Partials**: for each family sharing byte-identical chrome (Rule 2 step 4), extract the
   fragment into `render/partials/<name>.html` and replace it in every page of that family with
   `<div data-embed-config='{"type":"partial","id":"<name>"}'></div>` (add `"current":"<page>"`
   if the nav honors a current-page state). A family with no shared chrome stays fully inline,
   page by page — do not force a partial where the source doesn't actually share one.
5. **Pages**: for each source `.html` file you're converting, write `render/pages/<id>.html`
   with the partial markers substituted in and every asset/script/stylesheet path fixed per
   Rules 3/5. Preserve everything else byte-for-byte — a theme page's job is to be a faithful,
   working copy, not a rewrite.
6. **Vendor scripts/stylesheets** the pages actually load (Rule 2's usage check) into
   `scripts/`/`css/` (or a `vendor/` subfolder for a clearly third-party library, matching
   `basic`'s own `scripts/vendor/kuinetic.all.js` precedent) — copy via `fs_read_file`/
   `theme_write_file` for anything under the size/binary limits, flag anything that isn't
   (Rule 5's fetch-path check, and the Assets section above).
7. **`publishedPages`** (Rule 4): list every converted page id except `index`. Do this as its
   own explicit step, not a thing you remember while writing `theme.json` in step 2 — it's easy
   to write the manifest before the page inventory is final and forget to come back to it.
8. **Verify, don't just assert**: `theme_list_files` the finished theme and diff it against
   your own inventory — every page and partial you meant to write should be there and nothing
   else. If you have access to run the real loader directly (`loadTheme()` from
   `apps/website/src/features/theme/theme.ts`, outside the running server — no daemon restart
   needed for this), do it: `status: "valid"`, an empty `errors` array, and the right page/
   partial ids are real, checkable facts, not something to take on faith. If you don't have
   that access, say so, and say what you verified instead (e.g. re-reading every written file
   back and manually checking the required-file list).
9. **Report**: what converted clean, what needed a by-hand fix and why (name the exact line),
   what you deliberately left out and why, and what a human still has to do (binary asset
   copy, at minimum) before this theme is genuinely done. A "so, this is finished" report that
   skips the by-hand fixes and the asset gap is not an honest report of this procedure.

## Reporting rules

- **Say the page-publish state explicitly.** "Converted 6 pages" is not the same claim as
  "6 pages are reachable" — always report both the page count and the `publishedPages` list.
- **Never claim an asset "was migrated" if it went through a description rather than a real
  copy.** If binaries still need a human's filesystem access, say that plainly, with paths.
- **Name every by-hand fix with its file and line**, the way this document's own worked
  example does — "fixed the fetch path" without the line is not verifiable.

## References

- `references/theme-v2-contract.md` — condensed, code-verified field/path reference for the
  apiVersion-2 static-tier shape (the load-bearing facts from `theme.ts`/`theme-layout.ts`/
  `static-asset-contract.ts`, kept short on purpose — read the source files themselves for
  anything this condenses too far).
- `references/kuinetic-worked-example.md` — the real conversion this skill was proven against
  (kUInetic's own demo site), what broke on first contact, and the exact fixes. Read this
  before converting something with a docs-viewer-style client-side router, a JS-driven nav, or
  a site whose light/dark default doesn't match Tovu's own bare-`:root`-is-non-light
  assumption — all three showed up for real, not hypothetically.
- `development/docs/themes/theme-authoring-guide.md` (v1) — the render pipeline as it actually
  runs. Trust this over `-v2.md`'s framing, but not over its own file-layout section (v1-only).
- `development/docs/themes/theme-authoring-guide-v2.md` — the apiVersion-2 field/schema
  reference. Ignore its "not yet built" banner; verify anything it claims against
  `theme.ts`/`theme-layout.ts` directly if in doubt.
- `apps/website/src/features/theme/theme-layout.ts` — the actual apiVersion-aware path
  resolver. The single most reliable source when the two guides and reality seem to disagree.
