Adapted from an Open Design export named "tailark-dusk-screenshots" — ten
self-contained landing-page variants of a real component/template product
called "Tailark" (specifically its "Dusk" color preset, per the in-page badge
text "Introducing Tailark Dusk 1.0" / "Introducing Tailark CRM 1.0"), each
built with Next.js + a Tailwind/shadcn-style utility class system.

## License status: UNCONFIRMED — owner-authorized regardless of tier

The export carries no LICENSE file, no SPDX header, and no license/attribution
text anywhere in the ten HTML files — only a bare `© Tailark 2025 - Present`
credit line in each page's footer. No terms of redistribution, commercial use,
or derivative-work rights could be found or confirmed from the export itself.

A sibling porting session (`tailark-quartz-libre`) found strong evidence its
own Tailark export was captured from the **paid** "Tailark Pro" tier (Sanity
CDN image URLs, a real canonical URL, a "derived kit" legal FAQ on the paid
site). Checked this export for the same class of signal:
- **Real Vercel deployment ID** — every one of the ten pages references the
  identical `?dpl=dpl_7jEoBXmMCCxSxje5A3gCLCzkbcUY` query string on its JS/CSS
  chunk URLs, meaning this is a genuine capture of one real, live Next.js
  production deployment, not a generic/synthetic mock. Same class of evidence
  the sibling session found, though this export doesn't use the literal
  `data-dpl-id` HTML attribute they saw — confirmed absent here via direct grep.
- **No Sanity CDN references** (`cdn.sanity.io`) anywhere in any of the ten
  files — unlike the sibling's export.
- **No canonical URL, no `og:url` meta tag** — nothing pointing at a specific
  domain (`tailark.com` vs. `pro.tailark.com`), so tier could not be confirmed
  or ruled out from this export alone.
- **`<meta name="robots" content="noindex, nofollow">` on all ten pages**, and
  page titles/descriptions read as internal demo labels ("Landing 8 - Tailark"
  / "Tailark Dusk landing variant 8 page") — consistent with a gated preview/
  demo deployment showcasing purchasable block variants (which is exactly
  what "ten alternate landing pages built from one shared component system"
  looks like as a product), though this is circumstantial, not confirmed.

**Net finding: same real-deployment-capture pattern as the sibling session,
but this export's specific tier (free `tailark/blocks` vs. paid Tailark Pro)
could not be confirmed either way from what's in the files.** The repo owner
has since confirmed they own/license Tailark Pro themselves, so this is not
an unauthorized-use situation regardless of which tier this particular export
turns out to be — but the underlying **license terms for redistributing a
derived static theme built from it** are still unconfirmed and should be
checked against Tailark's actual terms before this ships as a sold Tovu
product, per this repo's own established bar (the same one GSAP failed last
session, for the same reason — unconfirmed terms, not a technical objection).

## No usable CSS existed in the export at all

`DESIGN-HANDOFF.md` reported "Stylesheets detected: 0," and inspection
confirmed why: this is a production Next.js export whose real compiled CSS
lives in hashed `/_next/static/chunks/*.css` files, referenced by `<link
rel="stylesheet">` but never captured by the export — so the ten HTML files
ship thousands of Tailwind utility class names (`bg-background`,
`text-muted-foreground`, `rounded-2xl`, arbitrary-bracket variants like
`in-data-[state=active]:rotate-180`) with **zero CSS backing any of them**.
There is no Tailwind CDN `<script>` either — worse than a CDN violation, the
export is simply incomplete as a standalone artifact.

`css/styles.css` here is hand-authored from scratch: real semantic component
classes (`.hero`, `.workflow-tablist`, `.pricing-grid`, `.wall-card`, …, the
same convention `basic/css/styles.css` already established), not a literal
reproduction of the Tailwind utility soup. Exotic decorative micro-effects
present in the original screenshots — layered radial-mask hero glows,
backdrop-blur card stacks, gradient logo marks — were **not** chased to pixel
fidelity; the real content, structure, typography scale, spacing rhythm, and
color system were. This mirrors `basic/NOTICE.md`'s own precedent of
transparently scoping down from full fidelity when the source is incomplete.

## Design tokens: pixel-sampled from the primary screenshot, dark-only

`tokens.json` was built by pixel-sampling `landing-eight.png` (Python/PIL —
global color histogram plus targeted crops of the nav buttons, hero text, a
testimonial card, and a divider line), the same method `basic/tokens.light.json`
used for its light mode. Measured: `--bg` #080808, `--fg` #fcfcfc, `--muted`
#9c9ca8 (a blue-gray, not neutral gray), `--accent` #009664 (sampled from a
solid testimonial-card fill, not the decorative purple→teal logo gradient,
which appears nowhere else in the UI). The primary CTA button is an inverted
white pill (`bg-primary` #fcfcfc / `text-primary-foreground` #0a0a0a), a
second, distinct color role from the green `--accent` — added as `--primary`/
`--primary-fg` keys beyond `basic/tokens.json`'s minimal shape, since the
source genuinely uses two different highlight colors for two different jobs
(default CTA vs. "Popular" pricing tier / active state).

**This theme originally shipped dark mode only** (`theme.json`
`"modes": ["dark"]`, no `tokens.light.json`) — a deliberate deviation from
`basic`'s dual-mode shape. Unlike `basic`'s source (which had real `-light`
reference screenshots to pixel-sample), this export has **no light-mode
reference of any kind** — only ten dark screenshots. `tokens.light.json` is
optional per the engine (`src/features/theme/theme.ts`'s static-tier
branch), so shipping without one was valid; inventing an ungrounded light
palette from nothing would have contradicted "match the exported pixels
first."

## Light mode added later: DESIGNED, not extracted — read this distinction carefully

A `tokens.light.json` was added in a follow-up pass, at the owner's explicit
request, to work around the exact constraint documented above. **This is
not the same kind of artifact as this theme's dark `tokens.json` or
`basic/tokens.light.json`.** Both of those were built by pixel-sampling a
real reference screenshot — a measurement of something that actually
exists. No light-mode screenshot, mockup, or any other reference material
exists for this theme. The light palette below was **designed**: a
deliberate, reasoned color choice with no source artifact to verify it
against, not evidence recovered from one. Treat every value in
`tokens.light.json` as an opinion, not a fact.

Method, so the reasoning is checkable rather than asserted:
1. **Starting point — an HSL/RGB lightness flip of the dark palette**, not a
   hue reinvention. `--bg`/`--fg` in the dark palette are already true
   neutrals (`#080808`/`#fcfcfc`, R=G=B in both) — unlike `basic`'s dark
   neutrals, which measured as a tinted `oklch(... 250)` blue-gray hue, this
   source has no colored neutral to preserve or get wrong. So flipping to
   `#fafafa`/`#0a0a0a` keeps the same "true neutral" character rather than
   guessing a hue family from nothing, which is the one part of `basic`'s
   documented light-mode risk (guessing the wrong hue family) that doesn't
   apply here — there was no hue to guess.
2. **`--muted` kept its subtle cool cast on purpose.** Dark `--muted`
   (`#9c9ca8`) measures blue-leaning (B=168 vs R=G=156); the light value
   (`#5b5b66`) preserves the same directional tilt (B=102 vs R=G=91) rather
   than flattening to a flat gray — a small thing, but it's the one place
   this port deliberately mirrored a hue relationship instead of just
   inverting lightness.
3. **`--border`/`--border-strong` needed a polarity flip, not just a
   lightness flip.** The dark tokens are `rgba(255,255,255,alpha)` — a
   white overlay, invisible-to-white-on-white on a light background. Kept
   the same alpha values (`0.08`/`0.14`) but flipped the base color to
   `rgba(0,0,0,alpha)`. This is the kind of adjustment "sanity-check the
   result visually" was meant to catch — a literal value copy would have
   produced borders that don't render at all.
4. **`--accent` was measurably too weak as body text on a light
   background and was darkened, not reused as-is.** The source accent
   `#009964`(sic, `#009664`) is used both as a decorative fill (badge,
   `.wall-card.accent`) and directly as text color (`.stat .num`,
   `.trust-badge .stars`, checkmark glyphs) — computed WCAG contrast against
   the candidate `#fafafa` background was **3.63:1**, under the 4.5:1 AA
   threshold for normal text (a Node script computing the standard relative-
   luminance contrast formula was used, not eyeballing). Darkened along the
   same hue to `#00744f`, which measures **5.57:1** against the same
   background — same green family, same brand identity, legible. This is
   the "preserve the accent hue but check actual contrast" step called for
   explicitly, not skipped.
5. **`--primary`/`--primary-fg` were inverted, not lightness-flipped,
   because of what they semantically mean.** In the dark palette,
   `--primary` (`#fcfcfc`, near-white) / `--primary-fg` (`#0a0a0a`,
   near-black) is the "high-contrast pill matching the page foreground
   color" — `.btn-solid` is effectively an inverted `--fg`/`--bg` pair, not
   an independent third brand color. A naive lightness flip would have kept
   `--primary` light, producing a near-invisible white button on a white
   page. Instead `--primary` was set to the *light-mode* `--fg` equivalent
   (`#0a0a0a`) and `--primary-fg` to the light-mode `--bg` equivalent
   (`#fafafa`), preserving the actual semantic (button always reads as the
   inverse of body text) rather than the literal old values.
6. **`--surface`/`--surface-2` elevation deltas were mirrored in
   direction and rough magnitude, not copied numerically.** Dark steps
   `bg → surface → surface-2` get lighter and slightly cooler by roughly
   6–10 units per channel per step; light steps `#fafafa → #f2f2f4 →
   #e9e9ec` get darker (inverted, since light-mode elevation reads as
   "slightly greyer than the page," not "slightly brighter") by a
   comparable per-channel magnitude, keeping the same cool-leaning tilt.

**Verification performed** (Playwright, headless Chromium, against the real
production `loadTheme()`/`renderStaticPage()` from
`src/features/theme/index.ts` — not the standalone `build-preview.mjs`
authoring script, and not the live dev server, which was left untouched):
`loadTheme()` reports `tokensLight` populated with all 15 keys (matching
`tokens.json`'s own key set exactly, no invented keys); the rendered
`index.html` contains a real `:root[data-theme="light"]` CSS block; setting
`data-theme="light"` on `<html>` changes the computed `body` background from
`rgb(8, 8, 8)` to `rgb(250, 250, 250)` and text color from `rgb(252, 252,
252)` to `rgb(10, 10, 10)` — a real, measured change, not an assumption.
Screenshots of both modes were captured and visually checked (cards, badges,
avatar gradients, and the accent-tinted glow behind the hero panel all read
correctly in both modes; no invisible text, no washed-out low-contrast
regions found).

**Real gap found, not fixed (out of scope for this pass):** this theme has
no `js/theme-toggle.js` and no toggle button anywhere in `nav.html` —
`basic`'s toggle-button/script pair, referenced in earlier planning
guidance as something this theme tier "already" has, is **not actually
present** here. `tokens.light.json` is real and the engine emits the light
CSS block correctly, but a real site visitor currently has no UI control to
switch into it. Verification above proved the mechanism works by setting
`data-theme` programmatically, standing in for the missing toggle — it does
not prove a user can reach light mode through the shipped page. Wiring a
toggle (copy `basic/js/theme-toggle.js` + its nav button markup, or an
equivalent) is a real follow-up, deliberately not done here since it would
have meant modifying page HTML/JS outside this pass's stated scope.

## Ten landing pages, not one site — ported as flagged by the dispatching brief

This export is ten distinct, self-contained landing-page variants of the same
underlying product concept (per its own `DESIGN-MANIFEST.json`
`screenFilePolicy`: "screen-file-first," each HTML file is its own screen).
`landing-eight.html` is the export's own designated primary entry (per
`DESIGN-HANDOFF.md`) and became `pages/index.html`; the other nine became
`pages/landing-{one,two,three,four,five,six,seven,nine,ten}.html`, keeping the
export's own filenames as slugs for traceability. All ten share one `nav.html`
/ `footer.html` pair and one `css/styles.css`, matching this theme tier's
"shared partials, not per-page duplication" convention.

**These are almost certainly future candidates for the per-page template
picker feature** described as unstarted in `basic`'s own handoff (Risks
item 3: a `theme.json` `post-template` array + admin dropdown + `data-embed-
type` marker, none of which exists yet) — that is a product decision for the
human owner, not one this port makes. Nothing here wires them into a picker;
they're just ten real, independently-viewable pages.

Nav links point to `index.html#workflow` / `#solutions` / `#pricing` /
`#customers` — real anchors to sections that exist on the primary page,
chosen because the source's own nav links were dummy `#link` anchors even in
the original (not something this port broke), and `DESIGN-MANIFEST.json`
itself instructs "derive missing behavior from visible controls... before
coding." Since `nav.html` is one shared partial referenced from all ten
pages, every page's nav consistently routes back to the canonical page's
real sections rather than dead-ending on nine different dummy targets.

## Rebrand

"Tailark" → **"Northbound"** (proposed working name, not final — pending the
human owner's confirmation, per the dispatching brief). The directory stays
`tailark-dusk` regardless, per that same brief — renaming a folder later is
cheap. Every "Tailark" mention (nav, footer, hero copy, inline body copy,
badge text) was swapped for "Northbound" throughout all ten pages.

Also swapped, beyond the literal brand-name instruction:
- **Real individual identities.** "Théo Balick," "Shadcn" (the actual public
  handle/brand of shadcn/ui's real creator), and "Shekinah Tshiokufila"
  appeared as fictional-testimonial names paired with what are very plausibly
  real people's real GitHub avatar photos (`avatars.githubusercontent.com/u/
  68236786`, `.../u/124599`) — using a real, identifiable person's photo
  against invented testimonial text they never gave is a real-identity
  misuse risk, not a "reuse a stock photo" one. All named individuals across
  all ten pages (team-grid names included) were replaced with a fresh set of
  invented names (Owen Marsh, Priya Shah, Ines Calloway, Renee Ackah, Callum
  Reyes, Marcus Diallo, Tobias Lund, Elin Vance, Noor Whitfield, Julian Cho,
  Adrian Voss), and **no external images are hotlinked anywhere in this
  theme** — avatars are CSS-generated initials-on-gradient fills
  (`.avatar-fill`), not photos, and decorative "product shot" panels are
  gradient art (`.art-fill`) built from the same design tokens. This also
  keeps the theme genuinely self-contained (no Unsplash/GitHub CDN
  dependency at runtime), consistent with this product line's "your content,
  your themes, your data, on your machine" promise — the human owner may
  still want to commission real photography before shipping; this port
  deliberately didn't invent a placeholder-photo dependency to get there.
- **Real third-party brand appropriation.** One testimonial's byline read
  "VP of Revenue, Claude" — literally Anthropic's product name used as a
  fictional customer's employer. Renamed to "Fernway." Real review-platform
  names (Google, Trustpilot, G2) backing fabricated star ratings were
  swapped for fictional platform names (Meridian, Havenly, Sparro) — showing
  specific numeric ratings against real review platforms for a product that
  doesn't exist reads closer to a fabricated-review claim than ordinary
  placeholder copy. Real tool names in the "integrates with" section
  (Gemini, Replit, Google PaLM, MagicUI, VSCodium, MediaWiki) — a genuine
  integration claim against six real products this theme has no actual
  integration with — were swapped for fictional tool names (Fluxline,
  Corelane, Pathwise, Driftboard, Nimbusly, Warmline), each given a fresh,
  distinct one-line description (the source repeated one identical, clearly-
  wrong description — "The AI model that powers Google's search engine" —
  across all six regardless of which tool, an obvious placeholder-copy bug
  in Tailark's own demo data, not real copy worth preserving).
- **"Get an AI summary of this page" + a "Gemini" footer chip** (a real,
  specific third-party AI-feature tie-in with no backing feature in this
  static theme) was dropped rather than genericized — there's no equivalent
  capability to rename it to.

## Content gaps filled, not discarded

- **FAQ answers do not exist anywhere in the export's DOM** — the five
  question titles are real (`How long does shipping take?`, etc., preserved
  as headings where sensible) but no answer text ships with a static-HTML
  accordion in a Radix-style unmount-when-closed pattern; there was nothing
  to extract. `DESIGN-MANIFEST.json` explicitly authorizes this: "If the
  prototype is static, derive missing behavior from visible controls and
  document it before coding." Answers were authored fresh, appropriate to a
  SaaS product.
- **The five original FAQ questions themselves were e-commerce boilerplate**
  ("How long does shipping take?", "Do you ship internationally?", "What is
  your return policy?") bolted onto a CRM/budgeting product that ships no
  physical goods — a leftover, unadapted demo-data mismatch in the source
  itself, not real copy describing this product. Preserving them verbatim
  would have shipped a visibly broken-looking FAQ. Replaced with five
  SaaS-appropriate equivalents (free plan, payment methods, plan changes,
  data export, refunds) that keep the same pattern (5 questions + a contact
  CTA) the source actually established.

## Known, disclosed scope limits

- Exotic Tailwind arbitrary-variant micro-effects (radial-mask hero glows,
  `in-data-*`/`has-data-*` state selectors, backdrop-blur layering) were not
  reproduced 1:1 — see "No usable CSS existed" above.
- The source copy itself mixes two different product framings across
  sections — the `index.html`/`landing-eight` hero is a personal-finance
  ("Family money, finally organized") pitch, while most other sections and
  pages are a B2B CRM pitch. This is a genuine inconsistency already present
  in Tailark's own demo export (confirmed across multiple pages reusing
  identical CRM-flavored paragraphs verbatim), not something this port
  introduced or was asked to reconcile — flagging it rather than silently
  picking one narrative and rewriting the other.
