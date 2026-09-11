Tovu-ized port of the kUInetic animation library's own live demo/marketing site
(`kuinetic.com`, source checked out at `/Users/la/Programming/kUInetic/demo`, read-only —
nothing there was modified). Built as the proving case for the `tovuize-site` agent-plugin
skill (`content/agent-plugins/tovuize-site/`); this NOTICE records what actually happened
running that skill's procedure against a real, messy static site, not a description of an
idealized conversion.

**Scope of this pass: 3 of the source's 17 real pages** (`index`, `reveals`, `docs`) — enough
to prove the mechanism on three genuinely different shapes (a self-contained hero page, a
shared-chrome gallery page, and a client-side-routed docs viewer with a JS `fetch()` gotcha),
not a claim that the whole site is ported. The remaining 14 pages (`ambient-feedback`,
`data-hover`, `icons-transitions`, `interactive`, `motif-blueprint`, `motif-editorial`,
`motif-kinetic`, `motif-swiss`, `nav-forms`, `scroll`, `text`, `three-d`, `tween`,
`tween-advanced`) follow the same two mechanical patterns already proven here (either the
`reveals` pattern — shared nav/footer partial, `system.css` → `theme.css` — or `index`'s
fully self-contained-page pattern) and were not converted, for time, not because anything
about them is harder. `motif-*` load neither `system.css` nor the shared header/footer at
all (their own `motif-controller.js`-driven layout); each `motif-*.theme.json`
`publishedPages` entry would need the same hash-check `docs` got below, not an assumption.

## Skipped on purpose (not ported)

- `index.html.bak`, `docs.html.bak`, `index-old.html`, `markdown.js.bak`, `nav.js.bak`,
  `replay.js.bak` — dead snapshots, never linked from any live page.
- `.vercel/` — Vercel deployment metadata (project/org ids). Not content, and not something
  to leak into a theme package.
- `tailwind.css`/`tailwind-entry.css`/`style.css` — each used by exactly one unconverted page
  (`nav-forms.html`, and an unused leftover respectively); no page in this pass needs them.
- `kuinetic.all.js` — an alternate all-in-one bundle of the same library `kuinetic.js` +
  `kuinetic.css` already provide separately; the demo site itself never loads it (it only
  appears as a copy-paste CDN snippet inside `index.html`'s own install-instructions code
  sample — see below).
- `theme.js`, `motif-controller.js` — used only by pages outside this pass's scope.

## Design decisions this conversion made, and why

**`apiVersion: 2` throughout** (`render/pages/`, `render/partials/`, `css/theme.css`,
`scripts/`), not v1's flat `pages/`/`css/styles.css`/`js/`. All themes actually served by
this site today (`basic`) already use v2; `theme-authoring-guide-v2.md`'s own banner calling
v2 a "TARGET design that does not exist in the running system" is **stale** — `theme.ts`'s
`ThemeManifest.apiVersion` doc says v2 shipped repo-wide in the 2026-08-18 Milestone 3
migration, and `resolveThemeLayout()` (`theme-layout.ts`) is a real, tested, apiVersion-aware
function with both layouts implemented. Read the code, not the guide's banner, on this point.

**`tokens.json` holds the DARK palette; `tokens.light.json` holds the LIGHT one — inverted
from which one the source treats as its own default.** `system.css` groups its light values
under `:root, :root[data-theme='light']` and its dark values under the narrower
`:root[data-theme='dark']`. Tovu's engine always emits `tokens.json` as a bare, unconditional
`:root {}` (so it wins whenever `data-theme` is anything other than `"light"`) and
`tokens.light.json` as `:root[data-theme="light"]` specifically — there is no equivalent
override slot for any other mode name. A naive "copy the source's own default block into
tokens.json" port would put light values in `tokens.json` and get dark mode wrong the moment
anyone switches away from light. `defaultMode: "light"` (matching the source's own real
default, from its inline boot script's fallback) is what makes the server-stamped starting
value match anyway on first load.

**`honorsCurrentPage: true`, not `activeAttr`.** `theme-authoring-guide.md` §6.1's own worked
example still shows `"activeAttr": "data-nav-current"` — that spelling is legacy (still
accepted, `theme.ts:296-304`), but every real theme on disk today (`basic`, `basic-2`,
`tailark-dusk`) writes the current boolean form. Followed the code and the shipped themes,
not the guide's example.

**No CMS menu embed on the nav.** The source's nav (`nav.js`'s `NAV_GROUPS`) and footer
(`nav.js`'s `buildFooterContent()`) are both entirely client-rendered from a hardcoded JS
array — there is no server-side link list to extract into a `{"type":"menu"}` marker the way
`basic`'s theme does. Vendoring `nav.js` unmodified reproduces the exact original behavior
with zero markup changes; wiring a real CMS menu here would mean rewriting the site's own
navigation architecture, which is out of scope for a port. `render/partials/nav.html` and
`footer.html` are therefore near-empty mount points (`<nav data-nav-panel>`,
`<footer data-footer-mount>`) — correct, not incomplete.

**`docs` does NOT use the shared nav partial, even though it looked like a candidate.** A
byte-hash compare of every page's `<header>...</header>` block (not a visual skim) showed
`docs.html`'s header hash differs from the other 10 "main family" pages — it is missing the
"Get started" nav-CTA `<a>` and the `data-od-id="header"` attribute that every other page
carries. Forcing it onto the shared partial would silently add a button the original page
never had. Left inline instead, byte-for-byte from source (chrome-relevant asset paths
rewritten the same way every other page's are). `docs.html` also ships no `<footer>` element
at all (confirmed: an `awk`/`md5` scan over its footer range hashes to the empty string), so
no footer marker was added either. Whether these two pages' chrome *should* someday be
unified is a product decision, not a conversion mechanics one — left to the operator.

**The one hand-edit this port could not avoid: `docs.html`'s inline `fetch()` call.**
Source line: `fetch('./docs/' + doc + '.md', { cache: 'no-store' })`. On the real static
site this resolves against the page's own real directory (`kuinetic.com/docs.html` sibling
`docs/*.md`) and just works. Under Tovu, `docs.html` is served at the single-segment virtual
route `/docs` — there is no two-segment route `/docs/getting-started.md` for a relative fetch
from that page to land on. `rewriteAssetPaths()` (`static-asset-contract.ts`) only rewrites
`href=`/`src=` attribute values matching the literal `../css/`/`../scripts/` sentinels; it
never touches a string inside a `<script>` body, so this was never going to be caught or
fixed automatically. Fixed by hand-editing the copied page's inline script to the real
absolute path the markdown files were placed at:
`fetch('/theme-assets/kuinetic-showcase/assets/docs/' + doc + '.md', ...)`. This bakes the
theme's own id into the page — same trade-off `basic`'s own vendored kUInetic fetch calls and
self-hosted-font `url()`s already accept, disclosed the same way here: renaming this theme's
folder without updating this one line would break the docs tab specifically, silently (a
console 404, not a visibly broken page — the markdown viewer just renders nothing).

**`markdown.js` (vendored unmodified) contains 4 literal NUL bytes** — not corruption: its
own code brackets protected inline-code spans with `'\x00' + index + '\x00'` sentinel tokens
in `catalog.md`'s own parse pass, then restores them via `/\x00(\d+)\x00/g`. This is real,
working, plain-UTF-8 JavaScript that happens to embed the one byte value the platform's
`fs_read_file` tool refuses to serve at all (its binary-content sniff is a NUL check, not a
"is this mostly text" heuristic) — proof that "binary-looking" and "actually binary" are not
the same question, and a file can trip the refusal for a reason that has nothing to do with
images/video/fonts. Copied at the filesystem level, same as this theme's real binary assets;
see the plugin's `SKILL.md` "Assets" section for why no in-product tool path exists for
either case.

**Duplicate `<link rel="stylesheet" href="./kuinetic.css">` in `index.html`'s real `<head>`
vs. its own copy-paste install snippet.** The source's `<head>` has exactly one real link;
a second, textually-identical-looking `href="./kuinetic.css"` later in the same file is
HTML-entity-escaped text inside a `<pre><code>` "copy this tag onto your own site" sample —
not a second live stylesheet link. A naive whole-document find/replace over `href="./kuinetic.css"`
would have rewritten that sample to point at this theme's own `/theme-assets/...` path,
turning correct third-party install instructions into copy-pasteable garbage for anyone who
actually tried it. Only the real `<head>` link was rewritten; the code sample was left
untouched, exactly as authored.

**Google Fonts CDN links kept as-is** (`fonts.googleapis.com`/`fonts.gstatic.com`, all 3
converted pages). Unlike `basic`, which self-hosts Geist specifically because Tovu's own
published Privacy Policy forbids third-party CDN fetches on that site, this is a standalone
demo/showcase theme with no such compliance claim attached — self-hosting was a live option
(see `basic`'s own NOTICE.md for the exact recipe) but is an operator call, not something
this conversion should decide silently either way.

**Verified, not just reasoned about.** `loadTheme()` (the real production loader,
`apps/website/src/features/theme/theme.ts`) was run directly against this theme's folder
outside the app (no server started): `status: "valid"`, zero errors, all 3 pages and both
partials discovered. `rewriteAssetPaths()`/`findUnrewrittenAssetPaths()`
(`static-asset-contract.ts`) were also run directly against all 3 converted pages: zero
unrewritten `../css/`/`../scripts/` references left in any of them.

## Assets carried over

`assets/modeling/*`, `assets/webdesign/*`, `assets/futurism/goldface.jpg`, and 6 top-level
`assets/*.jpg` — every binary file the 3 converted pages actually reference, copied at the
filesystem level (`cp`, not through any Tovu agent tool — see `SKILL.md`). `assets/docs/*.md`
(the 3 real doc-content files `docs.html` fetches) are plain UTF-8 text and would go through
`fs_read_file`/`theme_write_file` fine; copied at the filesystem level here only for speed,
alongside the true binaries.
