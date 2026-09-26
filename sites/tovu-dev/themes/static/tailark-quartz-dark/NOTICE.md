Ported from a design export named `tailark-quartz-dark-screenshots` (15 HTML files plus
PNG screenshots, `DESIGN-HANDOFF.md`, `DESIGN-MANIFEST.json`), sourced from **Tailark**
(https://tailark.com), a real, actively maintained Tailwind/shadcn marketing-block
product. The export is a capture of Tailark's own "Quartz" dark-mode demo pages
(`data-theme="quartz"` on every `<html>` tag).

## Provenance — what is established, and from what evidence

Established directly from the export's own files during the original port (commit
`9c0c9c21`, 2026-08-09):

- Every one of the 15 files carries the same Vercel deployment ID
  (`data-dpl-id="dpl_Duj34U3JSk5CgDqMw8vTdHDyoVUE"`) — one real hosted deployment, not a
  static open-source demo.
- The legal pages' "Get AI Explanation" links resolve to
  `https://pro-pages.tailark.com/dark/legal-one/terms-of-service`, present as plain
  unencoded text in the raw HTML. A subdomain literally named `pro`.
- 9 of the 15 files pull blog/customer-story imagery from a live Sanity CMS
  (`cdn.sanity.io/images/6e6amfga/production/...`) — a hosted product's real content
  backend.

**Best supported reading: this export came from Tailark Pro**, the separate paid product
at `pro.tailark.com`, not from the free `tailark/blocks` repository. That free repository
*is* MIT (`LICENCE.md`, SPDX `MIT`, copyright (c) 2025 Irung — verified first-party via
the GitHub API during the original port, not re-verified here), and an early pass on this
theme mistakenly recorded that MIT result as covering this export. It does not: the MIT
finding is accurate for a *different product* than the one these pages came from. That
correction is preserved here on purpose so the mistake is not made again.

Not established, then or since: **Tailark Pro's own licence terms.** They were never
extracted, never recorded, and are not present anywhere in this repository.

## Licence status

The repository owner has confirmed that Tailark redistribution terms are settled, and
that they own/licence Tailark Pro themselves. That confirmation is recorded in commit
`6d83d212` (2026-08-10), which removed this theme's original internal risk-tracking notes
on exactly that basis.

**Stated plainly so it is not mistaken for a licence grant:** what this repository holds
is the owner's confirmation, not the terms it rests on. No Tailark licence file, SPDX
identifier or terms URL exists here. Anyone relying on this theme's licence position
should get that confirmation from the owner rather than inferring it from this file, and
should not read the MIT result above as applying to this material.

Nothing in this NOTICE asserts a licence for Tailark's own material, and none is implied
by Tovu's Apache-2.0 grant in the root `LICENSE`.

## What did and did not come across

**No Tailark code ships in this theme.** `DESIGN-HANDOFF.md` reported "Stylesheets
detected: 0", and that was literally true: every page's `<link rel="stylesheet">` pointed
at `/_next/static/immutable/chunks/*.css` build chunks that the export never included.
The only three `<style>` tags in the export (all in `pricing-one.html`) are empty, and
grepping all 15 files for `cdn.tailwindcss.com` returned zero matches. The raw export
renders completely unstyled.

`css/theme.css` is therefore **hand-authored from scratch** in semantic component classes,
and the entire palette was **reverse-engineered by pixel-sampling the PNG screenshots**
(PIL global colour histograms quantised to suppress anti-aliasing, plus targeted crop
sampling on text rows and hue-filtered scans). Measured: background `#080808` (68–85% of
on-page pixels across two screenshots), foreground `#fcfcfc`, an emerald accent
≈`rgb(0,184,120)` used only for the small "All Systems Normal" footer status text.

One non-obvious measured finding worth keeping: **cards have no distinct surface fill at
all.** A sampled card region was 95.6% pure background colour — "cards" in this design are
border-only outlines on the same black, not elevated panels. `tokens.json` reflects that
(`--surface` is nearly identical to `--bg`).

Page copy was extracted from the server-rendered HTML rather than retyped from the
screenshots.

## Light mode added later: DESIGNED, not extracted

This theme originally shipped **dark mode only** — the export contained no light-mode
screenshot or any other light reference. `tokens.light.json` was added in a later pass at
the owner's request and, unlike `tokens.json`, **is not a measurement of anything that
exists**. Treat its values as a considered opinion rather than recovered evidence. The
dark palette remains the theme's real, screenshot-sampled default; the toggle adds an
option beside it and does not change what a first-time visitor sees.

## Real people quoted with fabricated endorsements — replaced throughout

The export attributes marketing quotes to **specific, identifiable real people**: Adam
Wathan (Tailwind CSS's creator), Patrick Collison (Stripe), Eric Simons (Bolt.new),
Guillermo Rauch (Vercel), Méschac Irung, plus eight further named individuals on the
customers page (Jonathan Yombo, Yves Kalume, Shekinah Tshiokufila, Zeki, Khatab Wedaa,
Rodrigo Aguilar, Roland Tubonge, Yucel Faruksahan) whose genuine testimonials for the real
Tailark/Tailus/TailsUI projects were repurposed as if endorsing an unrelated payments
product. Real company names (Stripe, Hulu, Vercel, Bolt, OpenAI, Supabase) were used as
"trusted by" logos.

Shipping any of that downstream would put fabricated words in real, named people's mouths.
**Every company name, quoted executive, blog byline and community testimonial name in this
port is fictional.** "Tailark" was rebranded to **"Onyx"** throughout (a working display
name; the directory keeps its `tailark-quartz-dark` id).

## Third-party material vendored in this theme

- `scripts/vendor/motion.js` — [Motion](https://motion.dev) v13.0.0, MIT, Copyright (c)
  2024 Motion B.V. Licence text at `scripts/vendor/LICENSE.md`, retained as MIT requires.
  This is the only third-party code in the theme.
- **No fonts are vendored here.** `theme.json` declares `Geist` and `Geist Mono` by family
  name only; the host emits a Google Fonts `<link>` at render time
  (`apps/website/src/server/inbound/public-http/http/site/render.ts`). No font binary is
  redistributed by this theme.
- **No external image is hotlinked.** The export's `cdn.sanity.io` imagery was not carried
  across.

## About this file

The original NOTICE.md written during the port was deleted in commit `6d83d212`, on the
basis that it was internal licensing-risk tracking rather than a licence file, and that
the underlying question was settled. This file is a deliberately narrower replacement: it
records **attribution and provenance**, which the theme needs and had been left without,
and it does not restore the risk-register framing that was removed. The full original text
remains retrievable at
`git show 9c0c9c21:src/themes/static/tailark-quartz-dark/NOTICE.md`.
