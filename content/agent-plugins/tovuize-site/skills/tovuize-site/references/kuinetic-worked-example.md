# Worked example: converting kUInetic's own demo site

Real conversion run, not a hypothetical — proves this skill's procedure against a genuinely
messy 223-file static site (`/Users/la/Programming/kUInetic/demo`, the live source for
kuinetic.com; read-only, never modified). Result lives at
`sites/tovu-com/themes/static/kuinetic-showcase/`, with its own `NOTICE.md` carrying the full
decision log — this file is the shorter "what broke on first contact" summary for reading
before your own conversion, not a duplicate of that NOTICE.

**Scope actually converted: 3 of 17 real pages** (`index`, `reveals`, `docs`), chosen to cover
three different shapes, not because the rest are harder — see the theme's own `NOTICE.md` for
exactly why the other 14 were left for a follow-up pass.

## The inventory step caught real, non-obvious structure

- 223 files: 18 `.html` (one of them, `index-old.html`, dead), 157 `.jpg`, 12 `.mp4`/7 `.webm`,
  12 `.js`, 5 `.css`, 3 `.md`, plus 5 `.bak` files and a `.vercel/` metadata folder. All `.bak`
  files, `index-old.html`, and `.vercel/` were left out — none are linked from any live page.
- Hashing every candidate page's `<header>`/`<footer>` block (not eyeballing the markup) found
  **11 pages share one byte-identical header+footer** — a real partial. `docs.html` looked like
  a member of that family from its CSS/JS includes alone, but its header hash differed: it's
  missing the nav's "Get started" CTA. Treating it as the same partial would have silently
  added a button the original page never had. It also has no `<footer>` element at all (hash of
  an empty range). Kept fully inline instead of forced onto the shared partial.
- The nav's actual links and the footer's actual content are both built entirely client-side
  by one vendored script (`nav.js`'s `NAV_GROUPS` array and `buildFooterContent()`) — there is
  no server-side link list to extract into a CMS menu marker. The two partials this produced
  are near-empty mount points (`<nav data-nav-panel>`, `<footer data-footer-mount>`); that is
  correct, not an incomplete port.
- `index.html` doesn't load the shared design-system stylesheet at all — it carries its own
  complete, self-contained inline `<style>` block with its own duplicated token values. Two
  genuinely different "families" existed side by side in what looked like one site.

## What a naive port would have gotten wrong

1. **Tokens, inverted.** The shared stylesheet groups its LIGHT palette under
   `:root, :root[data-theme='light']` (i.e. light is the bare default) and its DARK palette
   under the narrower `:root[data-theme='dark']`. Tovu's `tokens.json` is always the bare,
   unconditional block. Copying the source's own "default" (light) into `tokens.json` would
   have made dark mode render with light colors the moment anyone switched to it. Correct
   mapping: `tokens.json` = the source's dark values, `tokens.light.json` = the source's light
   values, `defaultMode: "light"` (matching the source's real boot-time default) — see the
   theme's `NOTICE.md` for the full reasoning. This is backwards from what "just copy the
   default block" would produce, and nothing about it errors or warns if you get it wrong.
2. **A page that would have 404'd forever.** `theme.json`'s `publishedPages` defaults every
   non-`index` page to unpublished. `reveals` and `docs` both needed explicit entries or they
   would have been unreachable despite loading with zero validation errors.
3. **A `fetch()` call the rewrite pass cannot see.** `docs.html` fetches its markdown content
   with `fetch('./docs/' + doc + '.md', ...)` — a two-path-segment relative reference that
   works on a real static host and has no route to land on under Tovu's flat single-segment
   static-page routing. `rewriteAssetPaths()` only rewrites `href=`/`src=` HTML attributes, so
   it never touches this string. Found by reading the actual JS the page runs, not by assuming
   "it's a fetch call, it'll probably resolve" — fixed by hand-editing the one line to
   `fetch('/theme-assets/kuinetic-showcase/assets/docs/' + doc + '.md', ...)`.
4. **A code sample almost got corrupted.** `index.html`'s real `<head>` has one
   `<link href="./kuinetic.css">`. A second, textually identical-looking occurrence later in
   the same file is HTML-entity-escaped text inside a `<pre><code>` "copy this onto your own
   site" install sample — the `href="..."` substring itself isn't escaped, only the surrounding
   `<`/`>`, so a whole-document find/replace would have rewritten a third party's install
   instructions to point at this theme's own internal asset path. Only the real, first,
   `<head>` occurrence was rewritten.
5. **A vendored script's NUL bytes are not evidence it's actually binary.** `markdown.js`
   trips `fs_read_file`'s binary/NUL-byte sniff — but the file is ordinary working JavaScript
   that uses literal NUL bytes as its own parser's placeholder-token sentinel
   (`'\x00' + i + '\x00'`, restored via a matching regex). It genuinely cannot go through
   `fs_read_file`/`theme_write_file` (no tool accepts a NUL byte or binary content either way),
   but the reason isn't "it's an image" — it's a real, working text file that happens to use
   one byte value a NUL-sniff can't distinguish from binary content. Copied at the filesystem
   level, same remedy as a true binary, different cause.
6. **A grep hit is not proof of use.** An early asset-usage check for "is `lightbox.js`
   referenced anywhere in the pages I'm converting" matched — but the actual `src=` value was
   `video-lightbox.js`, a different file that happens to contain the same substring. The real
   `lightbox.js` was vendored speculatively and turned out to be dead weight for this scope;
   removed once the exact attribute value (not a substring) was checked.

## What still needs a human

- **Every binary asset** (all `.jpg`/`.mp4`/`.webm` this scope references) was moved with a
  real filesystem `cp` outside any agent tool — there is no tool path in this product that can
  write binary content into a theme, at any size. An operator running this conversion through
  the actual product (not a coding-agent session with raw filesystem access) cannot do this
  step themselves either; say so plainly and name the exact source/destination paths rather
  than silently skipping it or guessing at placeholder content.
- **Whether `docs`'s bespoke header should someday be unified with the shared nav partial** is
  a product design call (do you want the "Get started" CTA on the docs page or not?), not
  something a conversion should decide.
- **Whether to self-host the Google Fonts CDN link** the converted pages still carry — kept
  as-is here because this is a standalone showcase theme with no compliance claim riding on it
  (contrast `basic`, which self-hosts specifically because Tovu's own Privacy Policy forbids
  third-party CDN fetches on that site). An operator's own privacy/compliance posture decides
  this, not the conversion.
- **The 14 unconverted pages** — same two mechanical patterns already proven (shared-partial
  family, or self-contained-page family), not attempted here for time. The `motif-*` family in
  particular loads neither the shared stylesheet nor the shared header/footer at all and would
  need its own hash-check pass before assuming it fits either existing pattern.

## Verification actually performed (not just claimed)

`loadTheme()` — the real production loader (`apps/website/src/features/theme/theme.ts`), not
a reimplementation — was run directly against the finished theme folder, outside the running
server: `status: "valid"`, `errors: []`, pages `["docs","index","reveals"]`, partials
`["footer","nav"]`. `rewriteAssetPaths()`/`findUnrewrittenAssetPaths()`
(`static-asset-contract.ts`) were run directly against all 3 converted pages' HTML: zero
unrewritten `../css/`/`../scripts/` references in any of them.
