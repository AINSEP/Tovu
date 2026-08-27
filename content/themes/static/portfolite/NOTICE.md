Source: an Open Design export named "portfolite-screenshots" — a single HTML file
(`index.html`), one screenshot (`index.png`), an `assets/` folder (78 files: 20
product/portrait images + fonts + a favicon), `DESIGN-HANDOFF.md`, and
`DESIGN-MANIFEST.json`. No LICENSE file shipped with the export (none has, for any
theme ported this session).

## What "Portfolite" actually is

Confirmed directly from the export's own `<head>`, not inferred:

- `<meta name="generator" content="Framer c9b3949">`
- `<title>Portfolite – Framer Portfolio Template</title>`
- `<meta name="description" content="Portfolite is a sleek and professionally
  designed portfolio template for Framer, built to help creatives and
  professionals showcase their work effortlessly...">`
- A "Design In [Framer]" attribution badge in the live footer, linking to
  `https://framer.link/framebase` — the actual template seller/author's Framer
  referral link.
- Contact email baked into the demo copy: `hello@framebase.design` — a real
  third-party business's contact address, not a Portfolite-specific placeholder.

This is a **real, currently-sold Framer Marketplace portfolio template**, not a
generic export — the description text is explicit marketing copy for the template
itself, not for the fictional designer persona inside it. This is a stronger,
more direct signal than any prior theme this session had (those were identified
by an isolated `generator` meta tag; this one names itself as a template product
in its own meta description).

**License status: UNCONFIRMED.** No LICENSE file, no explicit terms shipped in the
export. Framer Marketplace templates are typically sold under a per-purchase,
single-site license, not a redistribution/resale license — but that is
Framer-marketplace convention, not something confirmed for this specific listing.
Per the standing instruction for this session, this is **not** treated as a
blocker — the port proceeds — but this is flagged prominently and unambiguously:
**do not treat this theme as clear to resell without the human owner separately
confirming the actual Portfolite license terms.**

## Real branding found and replaced

| Found (real) | Where | Replaced with |
|---|---|---|
| "Portfolite" | `<title>`, meta description, og:title, og:description, twitter:title, twitter:description (6 occurrences), plus the nav/footer wordmark logo (an SVG, `Portfolite` spelled in vector paths, not text — confirmed by rendering the SVG directly) | "Folio" (proposed fictional name — see below) |
| "Design In [Framer]" attribution badge + `framer.link/framebase` | Footer | Removed entirely (real third-party promotional link, not Portfolite's own content) |
| `hello@framebase.design` | Contact section | `hello@folio.design` (fictional, tied to the new name) |
| Framer's own build/analytics chrome: `<!-- Made in Framer -->` comment, `events.framer.com` analytics script, `script_main....mjs` Framer runtime bundle loader | `<head>`/`<body>` | Stripped entirely — this is Framer's own editor/analytics infrastructure, not port-relevant content, consistent with every prior theme's "no builder chrome" rule |

**Proposed fictional product name: "Folio"** — not final, the human owner decides.
The working directory is `src/themes/static/portfolite/` regardless, per
instruction.

## Real people / brands found in `assets/`

Checked all 20 local images in `assets/images/` individually (visual inspection,
not just filenames):

- **One real, trademarked product photo found and NOT ported:**
  `GkhJfmw17Q5eehve51WR25Ijjnk.png` is a photograph of a Teenage Engineering TP-7
  field recorder (distinctive industrial design, "TP-7" visibly printed on the
  housing, exact button/dial layout) — used in the source with `alt="project img"`,
  i.e. presented as if it were the fictional designer's own work. This is the
  same category of issue a prior theme this session found with unused Nike
  photography, except here the image **is** used (in the live projects grid), so
  it was **excluded from the port** rather than merely flagged. It was not
  replaced with a substitute — the port ships 9 project images instead of the
  source's implied 10, since the remaining 9 clean generic product-mockup photos
  were already enough for a full grid.
- **All other 19 images** (portrait/testimonial photography, packaging/product
  mockups: soap dispensers, perfume bottles, a tote bag, coffee bags, skincare
  bottles) are generic, non-identifiable stock-style or AI-generated photography.
  None showed a recognizable real named public figure or a real company logo.
  One product mockup (the tote bag, `fsFDlU7CKq0E96MXMN9fUXrNw.png`, ported as
  `project-tote.png`) has printed text reading "CARTS CATARS" — garbled,
  non-dictionary text consistent with an AI-image-generation artifact, not a real
  brand; kept as-is.
- **The small "trusted by" logo strip** (5 wordmark SVGs, referenced in the
  export by external `framerusercontent.com` URLs — not present in the local
  `assets/` export at all) was fetched directly from those URLs for inspection
  (the URLs are literally present in the source file being ported, not guessed)
  and rendered via a private headless-Chromium screenshot rather than parsed
  blind from raw SVG path data. Confirmed: 4 of the 5 are short, generic,
  single-word invented placeholder brand names ("Oasis," "Dune," "Opal,"
  "Asterisk") — not real companies. The 5th was only partially legible at the
  resolution checked; rather than guess-transcribe it, the port uses a 5th
  invented placeholder in the same style ("Lumen") instead of reproducing it.
  None of these SVGs or their remote URLs are referenced by the shipped port —
  the strip is rebuilt as plain CSS pill elements.
- **Testimonial names and companies kept as-is** (Richards Johnson, June Lee /
  GreenRoots, Jona Carter / EcoLux, Sofia Toms / GreenK Studios; work-history
  entries GreenLeaf Co, UrbanFit Studio, GreenK Studio): generic-sounding
  placeholder names with no distinguishing signal tying them to real,
  identifiable individuals or companies — consistent with how this session's
  other themes have handled similar template demo content.
- **The "Meily" persona name was kept.** No dedicated avatar photo could be
  matched to the persona specifically (the "about" card in the source has no
  image directly adjacent to it in the DOM), and there is no other signal tying
  the name to a real, identifiable public figure.
- **A diligence finding that does not affect the port:** the raw export's HTML
  contains two `data-framer-name` attributes (Framer editor layer-name metadata,
  never rendered to a site visitor) that leak unrelated real-looking content: one
  is a full first-person bio ("Computer Engineering student at GESCOE, also
  pursuing Data Science at IIT Madras. Skilled in C++, Python, and exploring
  FastAPI...") and another references a *different* Framer template by name
  ("Using socio framer template now you can present your idea..."). Both are
  invisible Framer-editor internals from a component that was evidently reused
  across templates, not Portfolite content proper. Since this port strips all
  `data-framer-*` attributes as builder chrome regardless, neither string reaches
  `pages/index.html` — noted here only for the record, per the same
  verify-everything standard the rest of this session's diligence has followed.

## Styling: real CSS existed, contrary to `DESIGN-HANDOFF.md`

`DESIGN-HANDOFF.md` reports "Stylesheets detected: 0" — misleading, the same
finding pattern as every other theme ported this session. The actual styling
lives in inline `<style data-framer-css-ssr-minified>` (154,788 characters of real,
class-scoped compiled CSS) plus a small `<style data-framer-breakpoint-css>` block.
No Tailwind CDN, no other CDN stylesheet. Real design tokens were extracted
directly from this CSS (Framer emits them as `var(--token-<uuid>, <hex-fallback>)`
pairs) rather than pixel-sampled from the screenshot:

- `--bg` `#000`, `--surface` `#0d0d0d`, `--fg` `#fff`, muted text `#ffffffa6`
  (~65% white), border `#ffffff1a` (~10% white). **No accent hue anywhere in the
  token set** — this is a deliberately monochrome black/white/gray design,
  confirmed by the token extraction and consistent with the visibly
  black-and-white photography used throughout the source. `tokens.json` sets
  `--accent`/`--accent-fg` to white-on-black rather than inventing a color the
  source never uses.
- Real breakpoints extracted from `data-framer-breakpoint-css`: mobile
  ≤809.98px, tablet 810–1199.98px, desktop ≥1200px — used verbatim in
  `css/styles.css`'s media queries.

**Fonts:** the source declares four font-family names in its CSS (`Satoshi`,
120 uses — the primary display/heading font; `Plus Jakarta Sans`, 8 uses;
`Inter`/`Inter Display`, 52 uses combined). Checked each for an actual
`@font-face` backing: `Plus Jakarta Sans` and `Inter` are vendored locally in the
export's own `assets/fonts/`; **`Satoshi` has no local font file at all** — its
`@font-face` rules point to `framerusercontent.com` (Framer's own CDN), and
Satoshi is a Fontshare-exclusive font whose commercial-redistribution license
was not verified this session (same category of gap that got GSAP rejected for
a prior theme — unconfirmed license, don't vendor it). This port substitutes
`Plus Jakarta Sans` for `Satoshi` throughout (both are modern geometric sans
faces, visually close) and drops `Inter Display` in favor of plain `Inter`,
landing on two font families total, both Google Fonts (OFL-licensed, no
vendoring-license risk). Following this session's own established convention
(checked directly in `basic/css/styles.css` and `fuel/css/styles.css` — neither
actually loads its declared Google Font via `@import`/`@font-face`, both just
list it first in a system-font-stack `--font-display`/`--font-body` token and
rely on graceful fallback), this theme does the same: `theme.json`'s `fonts`
field is documentation-only, and `tokens.json`'s font stacks list
`'Plus Jakarta Sans'`/`'Inter'` first with system-font fallbacks, matching
precedent exactly rather than introducing a new loading mechanism.

## Structural decisions

- **This is genuinely one page.** The nav (`Services` / `Projects` /
  `Testimonials` / `Contact`) are in-page anchor links, not routes — confirmed
  via the source's own anchor hrefs and section structure
  (`data-framer-name` layer labels: hero, Companies, "about me section",
  Projects/"Projects Carousel", process, Services/"Services Bento",
  testimonials, "FAQ's", CTA, footer). Per the brief, this was kept as one
  `pages/index.html`, not split into invented extra pages.
- **No separate `nav.html`/`footer.html` partials.** Those exist in this
  session's other themes to avoid duplicating nav/footer markup across multiple
  pages (confirmed by reading `src/features/theme/theme.ts`: partials are
  optional — the engine only scans for `nav.html`/`footer*.html` if present, the
  only hard requirement is `pages/index.html`). With exactly one page, a partial
  buys nothing, so the nav and footer markup is inlined directly in
  `pages/index.html`.
- **FAQ answers:** the source's accordion has 9 questions but only the first
  ("What services do you provide?") ships a real static answer — the other 8
  render as an empty `<div style="display:contents">` in the raw export (checked
  directly; this is Framer CMS-collection binding that never resolves in a
  static export, the same category of "reference shows more than the shipped
  source" gap the Basic theme's own richer-screenshot-than-HTML finding
  documented). Since a functioning FAQ accordion with 8 empty answers would read
  as visibly broken rather than merely "a section not built," this port writes
  8 new, concise answers in the voice of the one real answer and the rest of the
  page's copy. These 8 are invented content, not sourced from the export —
  flagged here for the same reason the light-mode token derivation was flagged
  in the Basic theme's own `NOTICE.md`.
- **Originally dark mode only**, matching the source (no light-mode CSS, no
  toggle, no second reference screenshot exists for this export). A light
  variant was added in a later pass — see "Light mode added later" below;
  this bullet is kept for the historical record of the initial port.
- **Motion (motion.dev, MIT, v13.0.0)** was reused verbatim from
  `fuel/js/vendor/motion.js` + its `LICENSE.md` — the exact same
  already-verified-this-session file, not a fresh download, so no new license
  research was needed. `js/reveal.js` follows the same
  `[data-reveal]` + per-group `stagger()` pattern as `fuel`/`basic`.

## Assets shipped

`images/` (13 files, renamed from Framer's opaque hashes to descriptive names):
9 project/packaging mockups (`project-*.png`, one fewer than the source's
implied 10 — the TP-7 photo excluded per above) + 4 testimonial portraits
(`testimonial-*`). The "trusted by" logo strip is plain CSS text pills, not
image assets. No fonts were vendored (see Fonts section above — both fonts used
are Google Fonts referenced by name only, matching this session's established
convention).

## Light mode added later: DESIGNED, not extracted — read this distinction carefully

A `tokens.light.json` was added in a follow-up pass, at the owner's explicit
request. **This is not the same kind of artifact as this theme's dark
`tokens.json`.** The dark tokens were extracted directly from Framer's own
compiled CSS custom properties (see "Styling approach" above) — a measurement
of something that actually exists. No light-mode reference material of any
kind exists for this theme. The light palette below was **designed**: a
reasoned color choice with nothing to verify it against, not evidence
recovered from a source. Every value in `tokens.light.json` is an opinion, not
a fact.

This theme's dark palette is **pure monochrome** — `--bg`/`--fg` are true
black/white (`#000000`/`#ffffff`, no source screenshot to sample a tint from),
and `--accent`/`--accent-fg` are literally the same white/black pair used as
an "inverted button" (`.btn-solid`, `.step-badge` both set
`background: var(--accent); color: var(--accent-fg)` with no independent
brand hue anywhere in the CSS — confirmed by grepping every `var(--accent)`
usage in `css/styles.css`). This is a simpler case than `tailark-dusk`/
`tailark-quartz-dark`'s light-mode derivations (see their own NOTICE.md
sections for the general method this follows): there is no accent hue to
preserve or get wrong, just a lightness/polarity inversion of true neutrals.

Method:
1. **`--bg`/`--fg` inverted outright** (`#000000`↔`#ffffff`) — both are
   already true neutrals (R=G=B) in the dark set, so there is no hue to guess.
2. **`--accent`/`--accent-fg` inverted with the same semantic the dark set
   already uses**, not independently re-derived: `--accent` becomes the
   light-mode `--fg` equivalent (`#000000`) and `--accent-fg` becomes the
   light-mode `--bg` equivalent (`#ffffff`), preserving "the solid button
   always reads as the inverse of body text" rather than treating accent as
   a third, independent brand color it was never meant to be.
3. **`--muted` kept the same alpha-over-background technique**, base color
   flipped from white to black: `rgba(255,255,255,0.65)` → `rgba(0,0,0,0.65)`,
   same 0.65 alpha preserved.
4. **`--border`/`--border-strong` needed a polarity flip, not a literal
   copy.** Dark tokens are `rgba(255,255,255,alpha)`, invisible on a light
   background; flipped to `rgba(0,0,0,alpha)` with the same alpha values
   (`0.10`/`0.18`) kept.
5. **`--surface`/`--surface-2` elevation steps mirrored in direction**: dark
   steps `#000000 → #0d0d0d → #151515` get lighter per step; light steps
   `#ffffff → #f2f2f2 → #eaeaea` get darker per step (inverted, since
   light-mode elevation reads as "slightly greyer than the page"), by a
   comparable per-channel magnitude (13, then 21 units from `bg`).

**Verification performed**: a standalone Node script
(`contrast-check.mjs`, not committed with the theme — a throwaway WCAG
relative-luminance/contrast-ratio calculator, same class of tool the
`tailark-dusk`/`tailark-quartz-dark` derivations used) computed real contrast
ratios for the candidate palette rather than eyeballing it: `--muted`'s
effective flattened color (`rgb(89,89,89)`, `rgba(0,0,0,0.65)` over
`#ffffff`) measures **6.98:1** against the white background (AA normal-text
threshold is 4.5:1); `--fg` vs `--bg` and `--accent-fg` vs `--accent` both
measure the maximum possible **21:1** (true black on true white); `--fg`
against both `--surface` and `--surface-2` stay above 17:1. `--border`/
`--border-strong`'s low-alpha hairlines were **not** contrast-checked against
the 3:1 non-text threshold, same precedent `tailark-dusk`/`tailark-quartz-dark`
set: they're decorative dividers, not UI-component boundaries the 3:1
guideline is meant for, and the alpha values were kept identical to the dark
set's own (already-accepted) hairline visibility rather than independently
re-justified.

A working toggle (`js/theme-toggle.js`, copied from `basic`'s pattern with a
`portfolite`-specific `localStorage` key, `tovu-theme:portfolite`) was wired
into both `pages/index.html` and `pages/blog-post.html` — this theme has no
shared `nav.html` partial (see "No separate nav.html/footer.html partials"
above), so the toggle button markup and script tag were added to each page's
own inline header copy independently, not once in a partial. Verified against
the real `loadTheme()`/`renderStaticPage()` render path plus a real Playwright
click on the toggle button (not a programmatic `data-theme` set) — see the
session's verification report for the captured before/after computed colors.
