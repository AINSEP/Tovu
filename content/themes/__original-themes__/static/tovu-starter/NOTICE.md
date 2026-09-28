# Tovu Starter

Created 2026-09-27 as a neutral copy of Tovu's own site theme, with the branding
removed. Edit anything.

## Third-party components

- **Geist + Geist Mono** — SIL Open Font License 1.1. Licence text vendored at
  `assets/fonts/geist-LICENSE.txt`.
- **kUInetic 0.1.4** — MIT. Licence text vendored at
  `scripts/vendor/kuinetic-LICENSE.md`.
- **lightbox.js** — MIT, from kuinetic.com. Credited in its own header comment
  (`scripts/vendor/lightbox.js`).

---

**Why the page wrappers carry no `threshold:`** (2026-09-04 — regression fix, and the
rule that prevents its return). `threshold` is a fraction of the OBSERVED ELEMENT's own
area, never of the viewport. The largest ratio an element of height `H` can reach in a
viewport of height `V` is `min(1, V / H)`, so an element taller than `V / threshold` can
never satisfy it — at `threshold:0.15` that ceiling is `6.67 x V`, roughly 4.8k CSS
pixels on a laptop. Combined with the paused-`from`-frame correction to (2) above, an
element past that height does not merely skip its reveal: it sits at `opacity: 0` with
`data-kui-state="ready"` for the life of the page.

The migration put `threshold:0.15` on the full-page content wrappers, whose height is
whatever the author wrote. Measured on a `/sample-xai` render before the fix: article
height 4879px, viewport 723px, peak achievable ratio 0.148 against a demanded 0.15 — nav
and footer painted, everything between them blank white. Every page long enough was
affected identically.

The rule: **an element whose height the template does not bound gets no `threshold:`
token.** `0` (unset) is the only value satisfiable at every height, and it costs nothing
visually — `on:enter` at threshold 0 fires the moment the element's first pixel
intersects the viewport, which is still a scroll entrance for anything below the fold.
Applied here to every wrapper holding a `{"type":"content"}` embed, to the static
`.docs-main` body, and to the `.faq-list` container, whose length the template likewise
does not fix. Every remaining `threshold:0.15` in this theme sits on a design-bounded box
— hero, feature card, value, changelog entry, plan card, photo tile, auth form — that
cannot approach `6.67 x V`, and those were left as they are.

## Self-hosted Geist (2026-09-05)

`tokens.json`/`tokens.light.json` have always named `'Geist'` as the display and body face
and `'Geist Mono'` as the mono face, and `theme.json` declared
`"fonts": ["Geist:wght@400;500", "Geist+Mono:wght@400;500"]` — but **nothing ever fetched
them**, so every page rendered in the fallback stack (`-apple-system`/`BlinkMacSystemFont`
/`system-ui`). The typography on screen was not the typography specified.

Root cause: that `fonts` array is consumed by exactly one function, `fontLink()`, called
from exactly one place — `pageShell()`, the declarative document shell in
`apps/website/src/server/inbound/public-http/http/site/render.ts`. A `static`-tier theme
supplies its own complete `<head>` and never reaches `pageShell()`, so the declaration was
inert. Verified by resource timing, not by `document.fonts.check()`, which returns `true`
for any string including a font that does not exist.

**Fixed by self-hosting, not by adding a Google Fonts link.** The site's published Privacy
Policy states plainly that no third-party resource loads and no visitor data reaches any
CDN; a `fonts.googleapis.com` stylesheet would have falsified a live compliance claim. Same
vendored-not-CDN rationale already recorded above for Motion and kUInetic, now applied to
type.

- **Files**: `assets/fonts/geist-var.woff2` (69,832 bytes) and
  `assets/fonts/geist-mono-var.woff2` (71,220 bytes) — 141 KB for the full 100-900 weight
  range of both families. Served by the ordinary theme-asset mount
  (`registerThemeStaticAssets`, `express.static` over the whole theme folder) at
  `/theme-assets/tovu-theme/assets/fonts/...`; no server change was needed.
- **Source**: the official `geist` npm package v1.7.2
  (`registry.npmjs.org/geist/-/geist-1.7.2.tgz`, shasum
  `96f6e5d2b3305fd27eacbd5ae4dcfbc5a15e6939`, repository `github.com/vercel/geist-font`).
- **Licence**: SIL Open Font License 1.1, copyright (c) 2023 Vercel, in collaboration with
  basement.studio. The verbatim licence text is vendored beside the fonts as
  `assets/fonts/geist-LICENSE.txt`, which is what OFL §2 requires of a redistributed copy
  ("each copy contains the above copyright notice and this license"). Bundling unmodified
  fonts with software is expressly permitted. The copyright statement declares **no**
  Reserved Font Name, so OFL §3 does not constrain use of the family name "Geist".
- **Modification disclosed**: the npm package ships TTF only. Both files here are the
  upstream variable TTFs (`Geist-Variable.ttf`, `GeistMono-Variable.ttf`, `wght` axis
  100-900) losslessly re-flavoured to WOFF2 with fontTools 4.64.0 — a container format
  port, explicitly contemplated by OFL's definition of a Modified Version ("by changing
  formats"), with no subsetting, no glyph edits and no metric changes. 169,056 -> 69,832
  bytes and 171,200 -> 71,220 bytes.
- **Variable, not static instances.** `theme.json` declared only weights 400 and 500, but
  `css/theme.css` also uses 600 (`.post-detail-body th`, `.post-detail-body .post-mention`).
  Static 400/500 files would have left every 600 rule synthesising a faux bold. One variable
  file per family covers 100-900 and is smaller than two static instances would have been.
- **Wiring**: two `@font-face` rules at the top of `css/theme.css`, with **relative**
  `url('../assets/fonts/...')`. This stylesheet is served at
  `/theme-assets/tovu-theme/css/theme.css`, so the relative path resolves on its own with no
  rewriting — the same self-resolving arrangement `apps/site-chat/public/remixicon.css`
  uses for its own woff2. Relative is also the only form that survives a base-path static
  export: `platform/export/site-exporter.ts` follows one hop into a fetched stylesheet's own
  `url()` references (so these files are discovered and exported) but deliberately does not
  rewrite them, so an absolute URL would 404 under any non-root base path.
- **`theme.json`'s `fonts` array was removed** rather than left in place. Its only consumer
  emits Google Fonts `<link>` tags; keeping it meant this theme still carried a live trigger
  for the exact CDN fetch the Privacy Policy forbids, on any route that falls through to
  `pageShell()`. The declaration that is actually honoured now lives in `css/theme.css`.
  `development/docs/themes/theme-authoring-guide-v2.md` §5 specifies a future manifest shape
  — `"fonts": [{ "family": "Geist", "weights": [400,500], "files": ["assets/fonts/geist-var.woff2"] }]`
  — that is self-hosted and theme-relative; these files were placed at that exact documented
  path so that seam, when built, consumes them where they already are.

## kUInetic now loads from jsDelivr first (2026-09-27)

Every page now loads `https://cdn.jsdelivr.net/npm/kuinetic@0/dist/kuinetic.all.min.js` (major
range `@0`, so new 0.x releases arrive without a hand re-vendor), then an inline
`window.kuinetic||document.write(...)` loads the vendored `scripts/vendor/kuinetic.all.js` only when
the CDN script did not run (offline desktop app, self-hosted site without internet). The
`document.write` fallback is synchronous, so load order and self-init timing match the old single
tag. The vendored copy is now the offline fallback, not the primary source. No SRI hash: a range
URL cannot carry one.
