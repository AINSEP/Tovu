Ported from an Open Design export named "tailark-quartz-dark-screenshots" (15
HTML files + PNG screenshots, `DESIGN-HANDOFF.md` / `DESIGN-MANIFEST.json`),
sourced from **Tailark** (tailark.com), a real, actively maintained open-source
Tailwind/shadcn marketing-block library. The export is a scraped Next.js
server-rendered dump of Tailark's own "Quartz" dark-mode demo pages.

## License

**Correction, added after initial porting:** the MIT verification below was
run against the free, open-source `tailark/blocks` GitHub repo. After
porting, a sibling agent working on a related export
(`tailark-quartz-libre-screenshots`) found strong evidence *that* export was
actually captured from **Tailark Pro**, a separate paid commercial product
($249–499, `pro.tailark.com`), not the free repo. Checking this export
(`tailark-quartz-dark-screenshots`) for the same signals turned up the same
result:

- The legal-document pages' "Get AI Explanation" links resolve to
  `https://pro-pages.tailark.com/dark/legal-one/terms-of-service` — present
  as plain, unencoded text in the raw HTML (`legal-document-one.html`,
  in the ChatGPT/Gemini/Claude explain-link hrefs). A subdomain literally
  named "pro".
- Every one of the 15 files shares one Vercel deployment ID
  (`data-dpl-id="dpl_Duj34U3JSk5CgDqMw8vTdHDyoVUE"`), consistent with a
  single hosted product deployment rather than a static open-source demo.
  `data-theme="quartz"` on the `<html>` tag matches the skin name (doesn't
  by itself distinguish free vs. paid).
- 9 of the 15 files pull blog/customer-story imagery from a live Sanity CMS
  (`cdn.sanity.io/images/6e6amfga/production/...`), which reads as a hosted
  product's real content backend, not the free repo's own static demo
  assets.

**So: the MIT verification below (real, first-party, via `gh api
repos/tailark/blocks/license`) is accurate for the free `tailark/blocks`
repo, but this export's own content most likely comes from the separate,
paid Tailark Pro product, whose license terms were not independently
verified.** The repo owner confirmed to the team lead mid-session that they
own/have licensed Tailark Pro themselves, so this is not a case of
unauthorized use — porting continued on that basis — but the provenance
below should be read as "owner-licensed Tailark Pro content," not "verified
MIT," until/unless Tailark Pro's own license terms are separately checked.

Original MIT verification (kept for the free-tier fact, now understood to
be a different product than the actual source):

Verified directly against the upstream GitHub repo via
`gh api repos/tailark/blocks/license`: `LICENCE.md`, SPDX `MIT`, copyright
(c) 2025 Irung. The name "Irung" also appears as `irung@tailark.com` inside
the export itself (a placeholder email used throughout the demo content),
corroborating that Tailark (the company/brand) is real and the same across
both tiers — it does not by itself prove which tier this export came from.

## What the export actually contained (and didn't)

- **Zero compiled CSS.** `DESIGN-HANDOFF.md` reported "Stylesheets detected:
  0" — true, but not because of inline `<style>` tags (only 3 empty `<style>`
  tags exist, in `pricing-one.html`, all empty) or a Tailwind CDN `<script>`
  (grepped for `cdn.tailwindcss.com` across all 15 files: zero matches, so
  the no-CDN rule wasn't even in tension here). The real reason: every page's
  `<link rel="stylesheet">` points at `/_next/static/immutable/chunks/*.css`
  — Next.js build chunks that were never included in the export. The HTML
  does carry real Tailwind/shadcn utility class names (`text-muted-foreground`,
  `bg-background`, etc.), but with no stylesheet to interpret them, opening
  the raw export files renders completely unstyled.
- **Design tokens were reverse-engineered from the PNG screenshots**, the
  same pixel-sampling technique the "Basic" theme used for its light tokens,
  but applied here to the *entire* palette since no CSS existed at all.
  Method: `PIL`-based global color histograms (quantized to suppress
  anti-aliasing) plus targeted crop sampling on text rows and hue-filtered
  scans (see `/Users/la/.claude/harness-tmp/.../scratchpad/sample_colors.py`,
  `sample_crop.py`, `find_hue.py` used during this session — not shipped
  with the theme). Findings: background `#080808` (68–85% of on-page pixels
  in two different screenshots), foreground `#fcfcfc`, an emerald accent
  `~rgb(0,184,120)` (matches Tailwind's `emerald-500` `#10b981` closely) used
  only for the small "All Systems Normal" footer status text, and — a real,
  non-obvious finding — **cards have no distinct surface fill at all**: a
  card region sampled at 95.6% pure background color, meaning "cards" in
  this design are border-only outlines on the same black, not an elevated
  panel color. `tokens.json` reflects this (`--surface` is nearly identical
  to `--bg`). No light-mode screenshots exist in this export (unlike
  "Basic"'s source), so this theme originally shipped **dark mode only** — no
  `tokens.light.json`, no toggle. That was a deliberate scope decision, not
  an oversight: `tokens.light.json` is optional per the engine (per
  `src/features/theme/theme.ts`), and inventing a light palette with zero
  screenshot evidence would have violated this repo's own
  evidence-over-invention norm. See "Light mode added later" below for what
  changed and why that norm wasn't actually violated when it was.
- **Real page content was extracted from the server-rendered HTML**, not
  typed from the screenshots. A small Python `html.parser` script stripped
  `<script>`/`<style>`/`<svg>` and dumped the remaining visible text/structure
  per file — this is how the exact blog post titles, legal document text,
  pricing tiers, and case-study prose below were recovered faithfully.
- **The header's "Product ▾" / "Solutions ▾" dropdown menu items, clearly
  visible in every screenshot, do not exist anywhere in the exported HTML —
  not even in the React Server Component JSON payload inside the `<script>`
  tags.** Grepped the full raw HTML of `landing-one.html` for the literal
  string `Solutions`: zero matches, in any script or markup. That label text
  is compiled into the live site's client-side JS bundle, which isn't part
  of this export. This mirrors "Basic"'s own finding that its reference
  screenshot showed content beyond what the shipped HTML/CSS/JS source
  actually contained — same honesty rule applied: the shipped nav here links
  only to real, evidenced destinations (the theme's own pages + a real
  "Sign In" CTA), and does **not** fabricate dropdown contents for
  Product/Solutions that have zero source evidence.

## Real people quoted with fabricated endorsements — fictionalized throughout

Beyond the top-level "Tailark" brand name, several sections of the export
quote **specific, identifiable real people** with what would become
fabricated product endorsements once rebranded and shipped as a Tovu
product:

- The landing-page testimonial is attributed to "Adam Wathan, CEO, Tailwind
  Labs" (the real creator of Tailwind CSS).
- The "Bolt" customer story quotes "Eric Simons, CEO" (Bolt.new's real CEO).
- The "Stripe" customer story quotes "Patrick Collison, CEO" (Stripe's real
  CEO) at length, plus a second Adam-Wathan-attributed pull-quote.
- Blog posts are attributed to "Guillermo Rauch" (Vercel's real CEO) and
  "Méschac Irung" (a real developer) as authors.
- The customers page's "Loved by the Community" wall names eight more real
  people (Jonathan Yombo, Yves Kalume, Shekinah Tshiokufila, Zeki, Khatab
  Wedaa, Rodrigo Aguilar, Roland Tubonge, Yucel Faruksahan) — genuine past
  testimonials for the real Tailark/Tailus/TailsUI projects, repurposed here
  as if they endorsed an unrelated "payments infrastructure" product.

This goes beyond this repo's existing "never substitute real company names
into placeholder content" rule (which was written for the inverse situation
— don't replace an already-fictional export's names with real ones). Here
the *source itself* ships real names, and shipping them downstream in a
commercial Tovu theme would put fabricated words in real, named individuals'
mouths. Every company name, quoted executive, blog byline, and community
testimonial name in this port is fictional:

| Real (source) | Fictional (this port) |
|---|---|
| Tailark (brand) | Onyx |
| Bolt / Eric Simons, CEO | Ridewell / Marcus Feld, CEO |
| Stripe / Patrick Collison, CEO | Fintra / Dana Whitfield, CEO |
| Adam Wathan, CEO Tailwind Labs (landing testimonial) | Dana Whitfield, CEO Fintra (reused, for internal consistency) |
| Shadcn, Guillermo Rauch, Méschac Irung (blog bylines) | Priya Anand, Devon Marsh, Jules Kwan |
| Stripe, Hulu, Vercel, Supabase, OpenAI (logo wall) | Fintra, Streamvault, Corevault, Nimbus Cloud, Verdant AI (Beacon kept — already generic) |
| 8 named community testimonials | 8 fictional names (see `pages/customers.html`) |

Blog post titles/excerpts, pricing tiers, legal document text, and the
general narrative arc of the two case studies were preserved as real copy
(per this repo's "preserve real copy, don't replace with generic filler"
convention) — only identifying names/companies were swapped.

## Light mode added later: DESIGNED, not extracted — read this distinction carefully

A `tokens.light.json` was added in a follow-up pass, at the owner's explicit
request, specifically to work around the constraint documented above (no
light-mode screenshot exists for this export). **This is not the same kind
of artifact as this theme's own dark `tokens.json`.** The dark tokens were
pixel-sampled from real screenshots — a measurement of something that
actually exists. No light-mode reference material of any kind exists for
this theme. The light palette below was **designed**: a reasoned color
choice with nothing to verify it against, not evidence recovered from a
source. Every value in `tokens.light.json` is an opinion, not a fact —
treat it accordingly, and don't cite it as if it came from the same kind of
evidence the dark tokens did.

Method, so the reasoning is checkable rather than asserted:
1. **Starting point — an HSL/RGB lightness flip of the dark palette.**
   `--bg`/`--fg` are already true neutrals in the dark set (`#080808`/
   `#fcfcfc`, R=G=B), so flipping to `#fafafa`/`#0a0a0a` preserves that
   "true neutral" character rather than guessing a hue family — there is no
   colored hue in the source neutrals to get wrong, unlike `basic`'s dark
   set (a tinted `oklch(... 250)` blue-gray), so the one risk `basic`'s own
   handoff flagged for a naive lightness flip doesn't apply here.
2. **`--muted`'s cool cast was preserved by direction, not by number.**
   Dark `--muted` (`#a3a3ad`) is blue-leaning (B=173 vs R=G=163); the light
   value (`#55555f`) keeps the same directional tilt (B=95 vs R=G=85)
   instead of flattening to a neutral gray.
3. **`--border`/`--border-strong` needed a polarity flip.** Dark tokens are
   `rgba(255,255,255,alpha)` — a white overlay that would be invisible on a
   light background. Same alpha values (`0.12`/`0.20`) kept, base color
   flipped to `rgba(0,0,0,alpha)`. A literal copy of the dark values would
   have produced borders that render as nothing.
4. **`--surface`/`--surface-2` preserved this theme's own documented
   "cards have no distinct surface fill" finding** (§ above — a card region
   measured at 95.6% pure background color in the source screenshots,
   meaning this design uses border-only outlines, not elevated panels).
   Light `--bg` → `--surface` is a small, deliberately subtle step
   (`#fafafa` → `#f5f5f6`), mirroring the near-imperceptible dark-mode step
   (`#080808` → `#0a0a0b`) rather than introducing a visibly "lifted card"
   look this theme's design language doesn't use. `--surface-2` (`#ececee`,
   used by `.avatar`) steps further, matching the dark set's own two-tier
   pattern (`--surface-2` is more distinct from `--bg` than `--surface`
   is).
5. **`--accent` (the emerald `#10b981`) measured as too weak for text on
   a light background and was darkened, not reused as-is.** This is used
   directly as text color (`.status-ok`, `.status-dot`, pricing checkmarks,
   `.compare-table .yes`) as well as a fill in some contexts. Computed WCAG
   contrast of the original emerald against the candidate `#fafafa`
   background: **2.43:1** — well under the 4.5:1 AA threshold for normal
   text (verified with a Node script computing the standard relative-
   luminance contrast formula, not eyeballed). Darkened along the same hue
   to `#047850`, which measures **5.28:1** against the same background —
   same brand green, legible where the original wasn't.
6. **`--accent-fg` (`#04140d` in the dark set) is not actually used
   anywhere in `css/styles.css`** (checked directly — zero matches). It
   exists in the token set for API completeness/future use, not because
   anything currently renders it. Rather than leave it untouched (which
   would pair a very dark, near-black text color against the new, also
   fairly dark `#047850` accent fill — a real contrast risk if it's ever
   wired up as text-on-accent-fill), it was set to a light near-white
   (`#f4fdf9`), which measures **5.32:1** against `#047850` — a defensible
   choice for a token that isn't load-bearing today but should be correct
   if it becomes load-bearing later.

**Verification performed** (Playwright, headless Chromium, against the real
production `loadTheme()`/`renderStaticPage()` from
`src/features/theme/index.ts`, not the standalone authoring script and not
the live dev server, which was left untouched): `loadTheme()` reports
`tokensLight` populated with all 13 keys (matching `tokens.json`'s own key
set exactly); the rendered `index.html` contains a real
`:root[data-theme="light"]` CSS block; setting `data-theme="light"` on
`<html>` changes the computed `body` background from `rgb(8, 8, 8)` to
`rgb(250, 250, 250)` and text color from `rgb(252, 252, 252)` to `rgb(10,
10, 10)` — a real, measured change. Screenshots of both modes were captured
and visually checked: the hero's decorative radial-gradient glow, the
flat/border-only "product illustration" panel, and the `Get
Started`/`Watch Demo`/`Sign In` buttons (which invert correctly because
`.btn-solid` ties directly to `var(--fg)`/`var(--bg)` rather than a
separate primary token — no special-casing was needed here the way
`tailark-dusk`'s separate `--primary`/`--primary-fg` pair required) all
read correctly in both modes.

**Real gap found, not fixed (out of scope for this pass):** this theme has
no `js/theme-toggle.js` and no toggle button anywhere in `nav.html`.
`tokens.light.json` is real and the engine emits the light CSS block
correctly, but a real site visitor currently has no UI control to reach it.
Verification above proved the mechanism works by setting `data-theme`
programmatically, standing in for the missing toggle — it does not prove a
visitor can reach light mode through the shipped page as-is. Wiring a
toggle is a real follow-up, deliberately not done here since it would have
meant modifying page HTML/JS outside this pass's stated scope (this pass
was scoped to `tokens.light.json` + this NOTICE only).

## Structure

```
tailark-quartz-dark/
  theme.json, tokens.json         (dark), tokens.light.json (DESIGNED, see above — not extracted)
  nav.html, footer.html           (shared partials, data-tovu-slot convention)
  pages/*.html                    (15 files — see canonical-route table below)
  css/styles.css                  (hand-authored from sampled tokens + real class-name hints
                                    in the source markup, e.g. "text-muted-foreground" told us
                                    a paragraph was muted text even without its color value)
  js/main.js                      (scroll shadow + mobile nav toggle)
  js/reveal.js, js/vendor/motion.js, js/vendor/LICENSE.md
                                   (copied verbatim from src/themes/static/basic/ — same
                                    already-vendored, already-verified MIT Motion v13.0.0
                                    build; not re-fetched)
```

## Canonical routes vs. style variants

The export's 15 files span multiple page *categories*, each with 1–3 real
layout variants (confirmed by actually reading each variant's structure, not
assumed from filename). One variant per category was chosen as the
canonical route; the rest were ported as extra pages with clear slugs, not
discarded:

| Category | Canonical (`pages/`) | Variants ported |
|---|---|---|
| Home / landing | `index.html` ← `landing-one.html` (only file tagged `role: "landing-page"` in `DESIGN-MANIFEST.json`; the manifest's own `entryFile` field says `blog-article-one.html`, which is a blog post, not a plausible home page — used judgment per the task brief rather than following that field literally) | — |
| Blog listing | `blog.html` ← `blog-one.html` (2-col + 3-col card grid) | `blog-two.html` (single-column list layout), `blog-three.html` (compact dense list) — same real post catalog, genuinely different layout treatment, not copy-paste duplicates |
| Blog article | `blog-article.html` ← `blog-article-one.html` (centered, no sidebar; also `DESIGN-MANIFEST.json`'s designated `entryFile`) | `blog-article-two.html` (two-column with sticky "On this page" TOC + "Written by" sidebar — a real, structurally distinct template found in the source, not invented), `blog-article-three.html` (centered, image directly under h1, meta row below image — real header-order variant found in the source) |
| Customer story | `customer-story.html` ← `customer-story-one.html` (stacked, full-width; Ridewell/Bolt) | `customer-story-two.html` (two-column with sticky sidebar company-info card — same Ridewell/Bolt case study, genuinely different template, confirmed by comparing the two files' real DOM structure), `customer-story-three.html` (stacked template again, but a *different* case study — Fintra/Stripe, the long-form narrative) |
| Customers index | `customers.html` ← `customers-one.html` (only variant) | — |
| Legal index | `legal.html` ← `legal-one.html` (only variant) | — |
| Legal document | `legal-document.html` ← `legal-document-one.html` (Terms of Service; back-link only, no sidebar) | `legal-document-two.html` (Privacy Policy; full sticky sidebar nav listing every legal doc — a real, distinct template) |
| Pricing | `pricing.html` ← `pricing-one.html` (only variant) | — |

**Flag for the product owner:** multiple real style variants exist per
category (2–3 each for blog listing, blog article, and customer story). This
theme ships all of them as separate static pages rather than picking one and
discarding the rest, but there is currently no way for a real Tovu site
editor to *choose* which variant renders for a given post/page short of
manually linking to the right file — this is the same gap the "Basic" theme
handoff flagged as an unstarted feature ("a per-post template picker",
`theme.json` `post-template` array + `data-embed-type="post"` marker). Not
attempted here — out of scope for a single theme port, but directly relevant
now that a second theme also has multiple real template variants worth
picking between.

## Deliberate deviations from "Basic"'s conventions

- **Combined `class="section wrap"` was avoided.** Basic's own CSS has
  `.wrap { padding: 0 24px; }` (line 22) followed later by rules like
  `.hero { padding: 96px 0 72px; }` (line 167) — when both classes land on
  the same element, the CSS cascade means whichever rule appears later in
  file order wins the *entire* `padding` shorthand, silently dropping the
  side padding from the earlier rule. This theme avoids the collision
  entirely by nesting: `<section class="hero"><div class="wrap">...`. Not a
  claim that Basic is visibly broken (its inner elements happen to be
  centered with their own `max-width`, which masks it on wide viewports) —
  just a real cascade conflict this port's structure sidesteps rather than
  inherits.
- **FAQ accordion uses native `<details>/<summary>`**, not JS — zero-JS,
  matches the "no build step" spirit of a static theme better than a click
  handler for something this simple.
