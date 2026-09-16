Ported from a design export named `tailark-quartz-libre-screenshots` (21 HTML files plus
PNG screenshots, `DESIGN-HANDOFF.md`, `DESIGN-MANIFEST.json`), sourced from **Tailark**
(https://tailark.com), a real Tailwind/shadcn marketing-block product. The export captures
the "Quartz" theme showcase pages served from `pro-pages.tailark.com`.

## Provenance — what is established, and from what evidence

Established directly from the export's own files during the original port (commit
`9c0c9c21`, 2026-08-09). Unlike the `basic` theme's source, this is **not** a synthetic
design mockup — the captured HTML carries the marks of a real, live site:

- Real Next.js deployment IDs (`data-dpl-id`) on every page.
- Real Sanity CDN image URLs (`cdn.sanity.io`).
- Real canonical paths (`/libre/blog-one/...`) and `data-theme="quartz"`.

"Quartz" is specifically the name of the **paid Tailark Pro tier** (`pro.tailark.com`), a
one-time-payment commercial product marketed as offering enhanced shadcn blocks beyond the
free version. This export is Quartz content, so it is Tailark Pro material, not the free
`tailark/blocks` repository. That free repository is separately MIT (`LICENCE.md`,
copyright "Irung" 2025 — verified first-party by WebFetch against the raw file during the
original port, not re-verified here); **that MIT result does not cover this export.**

Not established, then or since: **Tailark Pro's own licence terms.** `pro.tailark.com`
carries a "Legal questions" FAQ that includes the questions *"Am I allowed to create a
derived kit based on Tailark?"* and *"Can I use Tailark Pro for client projects?"* — but
the answer text sits in a JS-rendered accordion and was never present in the static
export, so it was never read. It is not recorded anywhere in this repository.

## Licence status

The repository owner has confirmed that Tailark redistribution terms are settled, and that
they own/licence Tailark Pro themselves. That confirmation is recorded in commit
`6d83d212` (2026-08-10), which removed this theme's original internal risk-tracking notes
on exactly that basis.

**Stated plainly so it is not mistaken for a licence grant:** what this repository holds is
the owner's confirmation, not the terms it rests on. No Tailark licence file, SPDX
identifier or terms URL exists here, and the "derived kit" FAQ answer above was never
retrieved. Anyone relying on this theme's licence position should get that confirmation
from the owner rather than inferring it from this file.

Nothing in this NOTICE asserts a licence for Tailark's own material, and none is implied by
Tovu's Apache-2.0 grant in the root `LICENSE`.

## What did and did not come across

**No Tailark code ships in this theme.** `DESIGN-HANDOFF.md` reported "Stylesheets
detected: 0". This was not a Tailwind CDN situation — all 21 files were grepped for
`cdn.tailwindcss.com` with zero matches. Each page's `<head>` linked compiled, hashed
`/_next/static/immutable/chunks/*.css` files that live on Tailark's own server and were
never included, so the exported HTML renders completely unstyled on its own.

`css/theme.css` is an original, hand-authored plain-CSS design system, reconstructed from
(a) the Tailwind utility vocabulary visible in the HTML (a `zinc` neutral palette and a
`[--color-primary:...]` custom-property pattern confirming Tailwind v4) and (b) direct
**pixel-sampling** of `landing-one.png` and `pricing-one.png` via Python/PIL. Sampled
values: `--bg` `#f4f4f5`, `--surface` `#ffffff`, `--surface-2` `#f8f8f8`, `--fg`
`#09090b`, `--muted` `#52525c`, `--border` `#e4e4e7`, `--accent` `#615fff` (taken from the
"Get Started" button fill on `pricing-one.png`). `--success` (`#0f9d70`) is a derived
Tailwind-emerald-family approximation, **not** a sampled value — the compare-table
checkmark glyphs were too thin to sample reliably against anti-aliased edges.

## Dark variant added later: DESIGNED, not extracted — and it is not symmetric with its siblings

This theme originally shipped **light mode only**: the export carried no dark-mode
reference material, so no dark variant was invented at port time. A dark palette was added
in a later pass at the owner's request, giving the theme a real light/dark toggle.

Read this before assuming the toggle behaves like `tailark-dusk`'s or
`tailark-quartz-dark`'s. Those two started dark — their real, screenshot-sampled default —
and gained an additional, explicitly-designed light option, leaving what a first-time
visitor sees unchanged. **This theme is the opposite case.** Its measured, evidence-backed
palette is the light one; the dark palette is designed, not extracted, and treating it as
the theme's default inverts which of the two rests on evidence. Treat every value in the
dark token set as a considered opinion rather than a measurement.

Note for anyone reading `css/theme.css`: its header comment still says this theme "ships
light mode only (no `tokens.light.json`, no toggle)". That comment predates the pass
described above and is now **stale** — `tokens.light.json`, the toggle in
`render/partials/nav.html`, and `scripts/theme-toggle.js` all exist.

## Real people and companies in the source — all replaced

This export went well beyond placeholder social proof. It attributed fabricated marketing
quotes and blog bylines to **real, identifiable individuals** — Adam Wathan (creator of
Tailwind CSS), Patrick Collison (Stripe), Eric Simons (Bolt.new/StackBlitz), Guillermo
Rauch, and several real component-library creators (Tailkits, MerakiUI, TailwindAwesome) —
and used real company names (Stripe, Hulu, Vercel, Bolt, OpenAI, Supabase) as fake
"trusted by" logos. One page (`pricing-one.html`) rendered "Stripe" as its own site logo.

All of it was replaced with fictional people and companies throughout this port — the logo
cloud is NORTHFIELD, COASTLINE, OPALINE, SILVERBROOK, FERNBRIDGE, GREYSTONE, and every
byline and testimonial author is invented. "Tailark" was rebranded to **"Meridian"**
throughout (a working display name; the directory keeps its `tailark-quartz-libre` id).

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
basis that it was internal licensing-risk tracking rather than a licence file, and that the
underlying question was settled. This file is a deliberately narrower replacement: it
records **attribution and provenance**, which the theme needs and had been left without,
and it does not restore the risk-register framing that was removed. The full original text
remains retrievable at
`git show 9c0c9c21:src/themes/static/tailark-quartz-libre/NOTICE.md`.
