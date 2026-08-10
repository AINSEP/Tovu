## Source

Adapted from an Open Design export (`gracious-timing-extraction/`) of
`gracious-timing-117906.framer.app`. The export's own `README.md` identifies this
directly: it is **not a bespoke brand site** — it's **"Agenciy," a Framer Marketplace
template by "nframe"** ("Modern Template for Creative Agencies"), captured while running
on Framer's free `*.framer.app` staging subdomain. Confirmed independently via
`<meta name="generator" content="Framer c9b3949">` and `<title>Agenciy – Modern Template
for Creative Agencies</title>` on every marketing page, plus a live Framer JS bundle
(`framerusercontent.com/sites/.../script_main.*.mjs`).

**License status: UNCONFIRMED — flagged prominently, not a blocker.** Framer Marketplace
templates are commercial products with their own per-template license terms set by the
template author (`nframe`), which are not contained anywhere in this export (no
`LICENSE` file, no terms text, nothing in `README.md`/`design-tokens.md`/
`DESIGN-HANDOFF.md` beyond identifying the product). Every prior `static`-tier theme
this session had at least a plausible MIT/original-tooling story (Basic: original Open
Design tooling output; the Tailark siblings and Fuel: checked against their own
marketplace license text). This one is the first where the source is a **named,
currently-sold commercial template** with no license terms available to verify at all.
Ported anyway per instruction — real copy, section architecture, and design language
were used as reference and rewritten/restructured, not copied byte-for-byte — but this
should be reviewed against Framer Marketplace's actual license terms for "Agenciy"
before this theme ships as a sellable Tovu product.

## Zero local image assets at first — superseded, real assets ported 2026-08-09

The paragraphs immediately below describe the *original* port state, when the export
had no local image files at all. **The owner re-downloaded the source export and it
now ships real `assets/` (54 files), `video/`, and `fonts/` directories that did not
exist in the first pass.** A follow-up pass (same day) went back through every
`.ph-img`/`.case-cover`/`.post-card-media` placeholder slot, matched the export's own
Framer content-hash filenames (`https://framerusercontent.com/images/<hash>.<ext>`)
directly against the newly-available local `assets/<hash>.<ext>` files — an exact
1:1 match, not fuzzy/visual matching, since Open Design's export tool preserves
Framer's own asset hashes verbatim — and did a real diligence pass (described below)
on every candidate before wiring it in. **10 of the 17 placeholder slots now carry
real images; 7 remain placeholders because the diligence pass excluded every
candidate that existed for them.** See "Real assets ported" further below for the
full mapping, exclusions, and the corrected font-family finding. The original
zero-assets narrative is kept as-is beneath this note since it documents real
decisions (the placeholder pattern, the excluded sports-car photo) that are still
accurate history, just no longer the *current* state for the slots covered below.

Unlike every prior `static`-tier export this session (Basic, the three Tailark themes,
Fuel, Portfolite), this export shipped **no local image files at all** — no `assets/`,
no `images/`, nothing. Every image referenced in the 8 source HTML files is a live
hotlink to `https://framerusercontent.com/...` (248 references across the page set).
Because of this:

- **No photography from the source was embedded in this port**, hotlinked or
  otherwise. Baking a third party's live CDN URLs into a theme sold as "self-hostable,
  your data on your machine" would both break the moment Framer takes the template
  preview down and use imagery this port has no license record for at all (see above).
- Every place the source used a real photo, product mockup, or 3D render (hero
  background art, the phone-mockup case-study covers, team portraits, blog cover
  images), this port used a styled placeholder block instead (`.ph-img`,
  `.case-cover`, `.post-card-media`) — the same pattern `basic`'s `NOTICE.md`
  already established for its own decorative-image slots. This is a slightly larger
  use of that pattern than `basic` needed (which had at least screenshots to sample
  real colors from), because there was nothing downloadable to sample or port here.
- One consequence worth flagging even though it never made it into the port: a
  phone-mockup screenshot inside "The News" case study cover (`screenshots/
  project-the-news-full.png`) shows what reads, at the screenshot's resolution, as a
  photograph of a car with a shape consistent with a known sports-car silhouette. It
  was never downloaded, inspected at full resolution, or used — flagging only because
  the brief asked to note anything identifiable found while auditing, even unused.
  **Resolved below: it is a real trademarked vehicle design, confirmed by direct
  inspection once the real file existed — excluded from the port, not just flagged.**

## Real assets ported (2026-08-09 follow-up)

**Mapping method:** every image in the 8 source HTML files resolves to
`https://framerusercontent.com/images/<hash>.<ext>`; the newly-available local
`assets/<hash>.<ext>` files use the identical hash as their filename, so each
placeholder's real counterpart was found by extracting the hash from the source
page's own markup (cross-checked via Framer's still-present `data-framer-name`
editor-layer attributes — e.g. `Team Card1`..`Team Card5`, `Cover Image`,
`Blog Cards` — which map directly to this theme's own section structure) rather than
by guessing from filenames or visual similarity alone. Where document order was
ambiguous (the blog grid), each candidate was cross-checked against its own heading
text and date in the source to get a verified, not assumed, order — this caught one
real mis-pairing from an initial quick pass (the position of `Hq0z...` corresponds to
"The Art of Visual Storytelling," not "UI Trends in Design" as first guessed from
truncated context).

**Diligence, same standard as Fuel's Nike photos and Portfolite's Teenage Engineering
photo — real/identifiable → excluded, generic/unidentifiable → used:**

| Slot | Candidate | Verdict | Why |
|---|---|---|---|
| `index.html` hero "featured work — reel" | `kJJrWRLfOnlr1d8RHlDLgRsGag.png` | **Excluded** | A phone-mockup UI for a fictional "+Swiss" transportation app, photographing what reads as a real, identifiable sports-car front fascia (round twin headlamps, Porsche-style nose/grille). This is the same image content that appears (larger) in The News case-study cover — see below. |
| `project.html` (The News) case-cover "app screens — before/after" | `SGmnjSNNpV26lmGtgNoOUn17n20.png` + `RDJZmdiaGLVTpwhaedCaa5J0nkM.png` | **Excluded** | Directly inspected at full resolution (previously only flagged as "reads as a silhouette" sight-unseen) — confirmed a real, identifiable sports-car design in both the case study's cover and banner image. Neither was ported. |
| `about.html`/`contact.html`/`projects.html` hero "studio — wide shot" | `TGcveslLFOoJEhB079jeYPrB8A.png` (nearest real photo-ish asset, from the source's About-Section) | **Left as placeholder** | Not actually a photo — a huge, near-white, low-opacity script-typography watermark (part of the source's own decorative background treatment), not usable as "studio" photography. No source page ever had a real hero photo behind these three headers; the wide placeholder frame was the sibling port's own invented spacing device, not a stand-in for lost source content. |
| `index.html` team portraits (5) | `uSHHVp64IbFCGv1iRvQ4mi47kU`, `xVgSCCsvizEBKn9olbCsvPejLbQ`, `dH3E745rPwqwvIEDowEWp3cpmC4`, `kMmJL8Lh388UlTu330n0AScPrbE`, `5oeaWFgXfxXfxP3JKNg5Xk6E` (`.png`) | **Used** | 5 generic studio headshot photos (Team Card1–5 in source order = Avery James, Ryan Adams, Ethan Chen, Riley Thompson, Jordan Miles in the port). None match a real, identifiable public figure — same "generic template demo persona" category this session's other themes' testimonial photos fell into. |
| `blog.html` cover — 01 "UI Trends in Design" | `RVLmaO34bMPHDCsPg29Yu1Z7z3M.png` | **Used** | Street scene, motion-blurred pedestrian (face not visible), no brands. |
| `blog.html` cover — 02 "Designing Trends" | `GeKWq48MviBuOjsjDVNLuNPEmTg.png` | **Used** | Dark gallery interior, backlit silhouettes viewing art (no faces visible), no brands. |
| `blog.html` cover — 03 "Sketch to Screen" | `tNPIeudfWFysveLQCUYwzWhavA.png` | **Left as placeholder** | Real, identifiable Apple hardware (iPhone + MacBook, both with unmistakable Apple industrial design) running the actual Apple Music app UI (visible Apple Music glyph/branding). Same category as the excluded Nike/Teenage Engineering photos in prior themes. |
| `blog.html` cover — 04 "Minimal is not Empty" | `4W2L9xcuAY2x0GvulaodBXRaIo.png` | **Used** | Generic minimalist desk/chair still life, no people, no visible brand marks. |
| `blog.html` cover — 05 "The Art of Visual Storytelling" | `Hq0z5PmupdlUZqiN8aLpkYczQ.png` | **Left as placeholder** | Literally a mockup-resource-site advertisement: the image itself reads "iPhone 15 mockups," "MOCKUPFREE.NET," "REALISTIC MOCKUPS" as on-image text — a real trademark reference plus a third party's own promotional watermark baked into the asset. Clear exclude on both counts. |
| `project-theo-agency-rebranding.html` case-cover | `vJgxuQXmVL8IeXPQpiqHg3acLw.png` | **Used** | An invented client wordmark/monogram ("Jr theo") on an abstract glossy black background — fictional brand-identity mockup art consistent with the case study's own "Theo Agency" fiction, not a real trademark. |
| `project-virtual-reality-encounter.html` case-cover | `Um8FB6BTwT1FeP2mHLTpOqDcXMU.png` | **Used** | A generic, unbranded clear-visor AR/VR goggle product render in a poster mockup labeled "MODERN AR HEADSET" — no visible real-product branding or distinguishing design that maps to a specific real device. |

(The VR case study's own unused `banner-image`, `zlyTvTfBOjREV2mBoFI5EOe58GE.png` — a
silhouette of a person wearing a VR headset with motion-blur light streaks, face not
visible — was also checked and is clean, but there's no second image slot on that
page to use it in.)

**Net result:** 10 of 17 original `.ph-img`/`.case-cover`/`.post-card-media` slots
now show real photography (`images/`, 10 files, copied from `assets/` and renamed
descriptively — `team-avery-james.png`, `blog-ui-trends.png`, `case-theo-agency.png`,
etc.). The other 7 (home hero, about/contact/projects hero, The News case-cover, 2 of
5 blog covers) remain the `.ph-img` diagonal-stripe placeholder, each for a
documented reason above, not an oversight.

**Asset-path convention:** `src/features/theme/static-render.ts`'s
`rewriteAssetPaths()` only rewrites `../css/` and `../js/` references (by design — see
its own file header) — **not** `../images/`. Following the exact convention
`portfolite/NOTICE.md`/`portfolite/pages/index.html` already established for this
same gap, every new `<img src="...">` in this port uses the final absolute path
directly — `/theme-assets/gracious-timing/images/<file>` — rather than a `../images/`
relative path that the live renderer would never rewrite. Verified live (see
Verification below), not just by inspection.

**Video (`video/hero-loop.mp4`, 4.1MB) — not ported.** Checked the 8 source HTML
files directly for `<video>` tags before deciding: 5 of them do have one, but it's
nested inside the `'3D Ball'` `data-framer-name` chain — the decorative floating-orb
hero element sitting behind the "Currently booking" pill on every page, using the
video as an animated liquid-metal texture inside an SVG-masked shape. **This port
never adopted the "3D Ball" decoration at all** — the ported hero is a plain
text+CTA+placeholder-frame layout with no floating orb, by the original port's own
design choice, not something this pass changed. Since there's no corresponding
element in the ported page structure for the video to attach to, porting it would be
inventing a new visual feature rather than filling an existing slot — left out per
the brief's own instruction not to do that. (Separately: `aR3TKcVMliXQPWIhQTclJhXcTMg.png`/`69auPD1YzLBCNcO5v9D5nks5aS4.png`/`YDnxl1a68JhgSkmG8E0skqnoFM.png`/`bUQhIsAv8wdGMuDZ6cBmNmLqJmc.png`,
a "Screenshot_1/2/3 + Cover" carousel found near the same position, was checked and
turned out to be Framer's own "NEW TEMPLATES" marketplace promo widget — linked
directly to `framer.com/@nframe/?tab=marketplace` — not template content at all;
correctly left unmapped.)

**Fonts — corrected, not just "unnecessary now."** The original port substituted
Instrument Serif for the accent italic face because `design-tokens.md`'s automated
extraction only reported "Inter Display Bold" + "Inter," and the real accent
typeface had to be inferred visually from screenshots. The new `fonts/` directory
made it possible to check the source's own raw `@font-face` CSS directly, and it
declares the real family name outright: **`font-family: "Playfair Display"`**,
italic, weights 400 and 700, sourced from `fonts.gstatic.com` (Google Fonts) — not a
guess or a stylistic substitute, the literal font in use. The exact two woff2 files
Google serves for those weights are present locally in `fonts/`
(`nuFRD-vYSZviVYUb_rj3ij__anPXDTnCjmHKM4nYO7KN_qiTbtPK-F2rA0s.woff2` = 400 italic,
`...k-UbtPK-F2rA0s.woff2` = 700 italic), confirming the identification rather than
just supplying it. `tokens.json`'s `--font-accent` and `theme.json`'s `fonts` array
were corrected from `Instrument Serif` to `Playfair Display` (still Google
Fonts/OFL, still referenced by name only per this session's established
no-vendoring convention for Google Fonts — see `portfolite/NOTICE.md`'s Fonts
section for that precedent — not a new decision to start vendoring). A fourth family,
**Urbanist**, is also declared via `@font-face` (weight 500, sourced from Fontshare)
but a direct search of the source found it never actually applied to any visible
element on any of the 8 pages — an unused/leftover declaration, not something this
port needs.

**Verification:** real `loadTheme()`/`renderStaticPage()` (imported from
`src/features/theme/index.ts`, not the authoring-time `build-preview.mjs` pattern —
this theme doesn't have one) rendered `index`, `blog`,
`project-theo-agency-rebranding`, and `project-virtual-reality-encounter` inside a
throwaway `express` server that mounts `/theme-assets/gracious-timing` exactly the
way `theme-static-assets.ts` does, driven by a private headless Chromium (`playwright`
npm package, not the MCP/browser-extension tool). All 10 real `<img>` elements
reported nonzero `naturalWidth`/`naturalHeight` (checked via `page.evaluate`, not just
"the request didn't 404") after a 2.2s settle wait, and all 4 pages were re-screenshot
at 1440×900 for visual confirmation. The live dev server and its active theme were
never touched.

## Real people / brand names found — audit result

Checked nav/footer copy, all 8 pages' visible text, image `alt` attributes, and social
links for real, identifiable people or trademarked companies:

- **Testimonial and team-member names** (Sarah Coleman/NovaTech, Daniel Reyes/Clarity
  CRM, Rachel Lin/Driftly, Jason Ford/BrightChain; team: Avery James, Ryan Adams, Ethan
  Chen, Riley Thompson, Jordan Miles; About-page work history: Optivus Digital,
  Pixelnest Studio, Aura & Co.) do **not** match any real public figure or company I
  could identify — no hits against known tech/design-industry names the way prior
  themes this session found Adam Wathan, Patrick Collison, or Guillermo Rauch. Read as
  generic template demo personas. Kept as-is; this is a judgment call on unrecognized
  names, same category prior themes' `NOTICE.md`s used for similarly generic cases.
- **Contact-form placeholder** (`placeholder="karijackson123@gmail.com"`, First/Last
  Name pre-filled "Kari"/"Jackson" in the reference screenshot) is a generic demo
  persona, not a name that recurs anywhere else in the export as a real identity.
  Not reused in this port (the contact form ships with different placeholder text).
- **Social links** (Behance/Dribbble/Facebook/Instagram/X) are all bare, unconfigured
  domains with no handle — confirms an unconfigured template instance, matches
  `README.md`'s own read. Ported as `#` placeholders, same convention as `basic`.
- **Client/partner logo marks** ("hues", "venice", three more unlabeled) appear only
  as small SVGs near the hero art in `about.html`/`contact.html`; alt text is generic
  ("image"), not a recognizable brand. Not ported at all (no local asset to port —
  see above), so this is moot in the shipped theme either way.
- The one real third-party brand present in the export is **Framer's own platform
  chrome** — a "Made in Framer" watermark badge and a footer line ("Create a free
  website with Framer, the website builder loved by startups, designers and
  agencies.") on every page, plus a floating "NEW TEMPLATES" marketplace promo pill.
  This is Framer's own attribution injected into every free-tier preview, not part of
  the template's own design — **stripped entirely**, none of it appears in this port.

## Styling — inline Framer CSS, not "no stylesheet"

`DESIGN-HANDOFF.md` (Open Design's generic implementation-handoff boilerplate) says
"Stylesheets detected: 0" — the same misleading signal every prior theme this session
hit. Actual check: no Tailwind CDN `<script>`, but each page ships 5 inline `<style>`
blocks (~40–90KB each) — Framer's own SSR-minified CSS, keyed to hundreds of
`--token-<uuid>` custom properties and per-element `framer-*` utility classes. Not
hand-portable (the token names are opaque, per-build hashes with no semantic key), so
this port does **not** lift any of that CSS directly. Instead, real design values were
extracted from `design-tokens.md` (the export's own automated token-extraction pass —
see below) and cross-checked against the reference screenshots, then implemented as a
fresh, semantic `styles.css` following the same `var(--x)`-only, mode-agnostic
convention as every other `static`-tier Tovu theme.

## `README.md` and `design-tokens.md` — genuinely useful, partially wrong

Both were read first, per instruction, and both materially reduced the reconstruction
work — a first for this session (every prior theme had to pixel-sample screenshots
from a cold start for at least the color tokens). Specifics:

- `design-tokens.md` gave real, load-bearing values used directly in `tokens.json`:
  the monochrome ink/paper/muted/hairline-border scale, the dark-surface elevation
  ladder (`rgb(43,43,43)` / `rgb(38,38,38)` / `rgb(14,14,14)`), and — most useful — the
  single accent color, `rgb(0,153,255)` (electric blue), measured at 813 occurrences
  concentrated in link-text color. This matches the reference screenshots: the accent
  never appears as a large fill (no blue buttons anywhere in the actual UI), only as
  small text/marks — `styles.css` in this port keeps the accent to kickers, tags, and
  focus states for the same reason, not decorative fills.
- **`design-tokens.md`'s typography claim was checked against the actual screenshots
  and found incomplete.** It reports a single family ("Inter Display Bold" for
  headings, "Inter" for body) — true for most headings, but every reference
  screenshot (`home-full.png`, `about-full.png`, `contact-full.png`,
  `projects-full.png`) shows a second, clearly different **italic serif/script**
  display face used specifically on accent words ("Impactful", "Together", the
  "Agenciy" wordmark itself, "Projects" as a subtitle) — a deliberate two-face pairing
  the automated token extraction missed because it only decoded `font-selector`
  values, not rendered glyph shapes. This port keeps that real two-face pairing
  (`--font-display`/`--font-body`: Inter; `--font-accent`: originally substituted
  with Instrument Serif italic as a faithful OFL-licensed stand-in, since the accent
  face itself had to be inferred visually with no font name available at the time —
  **corrected 2026-08-09 to the real font, `Playfair Display` italic, once the
  source's own raw CSS became inspectable; see "Real assets ported" below**) rather
  than trusting the automated report as complete — the same "verify, don't just
  cite" discipline this session's memory record already flags as a recurring trap.
- `design-tokens.md`'s radius/spacing findings (sharp `0px` cards dominant, pill
  `100px`/`100%` for buttons and badges, `40–56px` reserved for a few large soft
  cards, no mid-range rounded-card default) were followed directly:
  `.service-grid-simple`/`.awards-grid`/`.blog-grid`/`.pricing-grid` cells are
  sharp-edged grid cells (no radius) inside a hairline-bordered grid, `.btn` and
  `.tag`/`.status-pill` are fully pilled, and `.hero-frame`/`.case-cover` (the two
  largest decorative frames) use a `40px` radius.
- `README.md`'s section-architecture table (Home: Hero → Service → About → Project →
  Process → Awards → Team → Pricing → Testimonial; About: Hero → About → Mission →
  Expertise; case-study template: Hero → Image → Context → Design/Frontend Approach →
  outcomes) was followed page-for-page in this port's section order.
- `README.md`'s motion note ("no scroll-gated reveal-on-enter animation... Framer
  Motion is present but likely driving hover/press micro-interactions, not
  choreography") was **not** blindly copied into this port having "no animation" —
  this port still ships a `[data-reveal]`/grid-stagger fade-in on scroll (via the
  session's already-vetted vendored Motion, reused verbatim from `basic`), matching
  every other `static`-tier theme's baseline interaction, since the absence of
  scroll-reveal in the *source* isn't a constraint on what a *Tovu theme* should ship.

## Case-study pages — same template, different content (not style variants)

Diffed the three project pages' extracted visible text directly rather than trusting
`README.md`'s claim that they're "the *same* template/copy with different hero
images." That's half right: **same template, structurally identical section order
and heading pattern** (Project Overview → Challenge → a named "Approach" section with
3 tag pills → a named "Outcome" section) confirmed via a real diff — zero heading
differences in structure — but the **copy itself is genuinely different** per case
study (different challenge narrative, different approach-section name, different
tags, different outcome narrative), not reused verbatim. So this is the "distinct
content in the same template" case flagged as a possibility in the brief, not a true
style-variant set.

Given that, `projects_the-news.html` was picked as the canonical `pages/project.html`
route (listed first in the source's own nav-adjacent ordering and in `README.md`'s
page-map table) and registered as a **`postTemplate` candidate** in `theme.json`
(`"postTemplate": ["project.html"]`) — exactly the mechanism this is for: one
template, multiple real content instances. The other two ported as their own routes
with clear slugs: `pages/project-theo-agency-rebranding.html` and
`pages/project-virtual-reality-encounter.html`.

## Rebrand pass

Renamed "Agenciy" → **"Atelier"** throughout (proposed, not final — the human owner
decides). Working directory kept as `gracious-timing` per instruction (the export
tool's own naming artifact, not a product name, so it doesn't need to match the
display name — same relationship `fuel/` has to its display name "Ember"). Contact
details (address, email domain, phone) changed to placeholder-consistent values under
the new name; footer legal/social links follow the same `#`-placeholder convention as
`basic`.

## Mode support: originally dark only

Unlike `basic` (which had real light-mode reference screenshots to pixel-sample) or
the Tailark siblings, this export provides **no light-mode source of any kind** — no
light screenshots exist in `screenshots/`, and `design-tokens.md` only *mentions* that
the live source technically supports both `color-scheme: light` and `dark` media
queries without providing a single light-mode value. Rather than fabricate a light
palette with zero source material to check it against, this theme originally shipped
**dark mode only** (`"modes": ["dark"]`, matching `fuel`'s light-only precedent in the
opposite direction) — no `tokens.light.json`, no theme-toggle button, no
`theme-toggle.js`. See "Light mode added later" below for what changed.

## Light mode added later: DESIGNED, not extracted — read this distinction carefully

A `tokens.light.json` was added in a follow-up pass, at the owner's request. **This is
not the same kind of artifact as this theme's dark `tokens.json`.** As stated above, no
light-mode reference material of any kind exists for this export. The light palette
below was **designed**: a reasoned color choice with nothing to verify it against, not
evidence recovered from a source screenshot. Every value in `tokens.light.json` is an
opinion, not a fact.

Method (same lightness-flip-then-sanity-check approach as `tailark-dusk`'s and
`tailark-quartz-dark`'s own light-mode NOTICE sections — see those for the fuller
methodology writeup):
- `--bg`/`--fg`: dark `#0e0e0e`/`#f5f5f5` → light `#fafafa`/`#0a0a0a`. The dark set is
  not a pure `#000`/`#fff` extreme (unlike `portfolite`'s monochrome design), so the
  light set mirrors that same slightly-softened convention rather than going pure white.
- `--muted`: dark `#808080` is a genuinely neutral gray (R=G=B, no hue tilt at all,
  unlike every other theme's `--muted` this session) — the light value (`#555555`) stays
  equally neutral rather than inventing a tint the source never had.
- `--border`/`--border-strong`: same alpha values (`0.10`/`0.18`) as the dark tokens,
  polarity-flipped from `rgba(255,255,255,·)` to `rgba(0,0,0,·)` — a literal copy would
  render invisible on a light page.
- `--accent` (bright blue `#0099ff`): measured **2.87:1** against the candidate `#fafafa`
  background (Node WCAG contrast script, not eyeballed) — fails AA 4.5:1 for normal text.
  Darkened along the same hue to `#0072bd`, which measures **4.86:1** — clears the
  threshold with a real margin while staying recognizably the same blue. `--accent-fg`
  (white) checked against the new `--accent`: 5.07:1, still solid.
- `--font-accent` (Playfair Display) is unchanged — a font choice, not a color, has no
  light/dark variant to derive.

A theme-toggle was also added in this pass (this theme had none before, same gap
`tailark-dusk`/`tailark-quartz-dark`/`tailark-quartz-libre` also had at various points
this session): `js/theme-toggle.js` (per-theme `localStorage` key
`tovu-theme:gracious-timing`), a toggle button in `nav.html`, matching
`.theme-toggle`/`.icon-stack` CSS, and the script tag added to all 8 page files.

**Real, pre-existing gap found, not fixed (out of scope for this pass):** `theme.json`
already declares `"postTemplate": ["project.html"]`, but `pages/project.html` has **no
`data-embed-type="post"` marker anywhere in it** (confirmed via grep — zero matches).
The post-template picker feature would let an admin pick this file as a post's
template, but nothing would actually render if they did — the page is a rich,
fully-hardcoded case-study layout (hero, "Project Overview," "The Challenge," "Design &
Frontend Approach," "Responsive Experience," a "More work" band, and an FAQ band), and
naively swapping its whole body for one embed div would destroy that illustrative
content wholesale. A real fix needs a design decision about which sections stay static
furniture (the "more work"/FAQ bands plausibly should) versus which become the one
embed slot (the four prose sections most plausibly collapse into it) — that's a
judgment call for whoever owns this theme's content design, not something to rush
through as a side effect of a light-mode/blog-post-template dispatch scoped to other
themes.
