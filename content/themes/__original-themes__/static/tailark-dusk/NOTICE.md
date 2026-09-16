Adapted from a design export named `tailark-dusk-screenshots` — ten self-contained
landing-page variants captured from **Tailark** (https://tailark.com), a real, actively
maintained Tailwind/shadcn marketing-block product, specifically its "Dusk" colour
preset. The export's own pages carry the in-page badge text "Introducing Tailark Dusk
1.0" / "Introducing Tailark CRM 1.0" and a bare `© Tailark 2025 - Present` footer credit;
those strings are the attribution evidence, and they are the only licence-adjacent text
the export contained.

## Provenance — what is established, and from what evidence

Established directly from the export's own files during the original port (commit
`9c0c9c21`, 2026-08-09):

- The source is a genuine capture of one real, live Next.js production deployment, not a
  synthetic mockup: all ten pages reference the identical Vercel deployment ID
  `?dpl=dpl_7jEoBXmMCCxSxje5A3gCLCzkbcUY` on their JS/CSS chunk URLs.
- All ten pages carry `<meta name="robots" content="noindex, nofollow">` and page titles
  that read as internal demo labels ("Landing 8 - Tailark"), consistent with a gated
  preview deployment showcasing purchasable block variants.
- The export contained **no `LICENSE` file, no SPDX header, and no licence or attribution
  text** of any kind beyond the footer credit line above.

Not established, then or since: **which Tailark tier this particular export came from.**
The free `tailark/blocks` GitHub repository is MIT (`LICENCE.md`, copyright (c) 2025
Irung — verified first-party by an earlier session, not re-verified here). A sibling port
(`tailark-quartz-libre`) found strong evidence *its* export came from the separate, paid
**Tailark Pro** product. This export shows the same real-deployment-capture pattern but
**no** `cdn.sanity.io` references, **no** canonical URL and **no** `og:url` meta tag —
so free-vs-paid could not be confirmed or ruled out from these files alone.

## Licence status

The repository owner has confirmed that Tailark redistribution terms are settled, and
that they own/licence Tailark Pro themselves. That confirmation is recorded in commit
`6d83d212` (2026-08-10), which removed this theme's original internal risk-tracking
notes on exactly that basis.

**Stated plainly so it is not mistaken for a licence grant:** Tailark's actual terms —
a licence file, an SPDX identifier, or a terms URL — are **not recorded anywhere in this
repository**. What exists is the owner's confirmation, not the text it rests on. Anyone
relying on this theme's licence position should get that confirmation from the owner
rather than inferring it from this file.

Nothing in this NOTICE asserts a licence for Tailark's own material, and none is
implied by Tovu's Apache-2.0 grant in the root `LICENSE`.

## What did and did not come across

**No Tailark code ships in this theme.** The export was a production Next.js dump whose
real compiled CSS lived in hashed `/_next/static/chunks/*.css` files that were never
captured — so the ten HTML files carried thousands of Tailwind utility class names with
zero CSS backing any of them. There was no Tailwind CDN `<script>` either.

`css/theme.css` is therefore **hand-authored from scratch**, using semantic component
classes (`.hero`, `.workflow-tablist`, `.pricing-grid`, `.wall-card`, …) rather than a
reproduction of the source's utility-class output. Decorative micro-effects in the
original screenshots — layered radial-mask hero glows, backdrop-blur card stacks,
gradient logo marks — were deliberately not chased to pixel fidelity; content,
structure, typography scale, spacing rhythm and the colour system were.

Design tokens in `tokens.json` were **pixel-sampled** from the reference screenshot
`landing-eight.png` (Python/PIL histograms plus targeted crops): `--bg` `#080808`,
`--fg` `#fcfcfc`, `--muted` `#9c9ca8` (a blue-gray, not neutral gray), `--accent`
`#009664` sampled from a solid testimonial-card fill rather than the decorative
purple→teal logo gradient.

## Light mode added later: DESIGNED, not extracted

`css/theme.css`'s header comment points here. Read the distinction carefully.

This theme originally shipped **dark mode only** — the export contained ten dark
screenshots and no light-mode reference of any kind. `tokens.light.json` was added in a
later pass at the owner's request. Unlike `tokens.json`, **it is not a measurement of
anything that exists**: there was no light-mode artefact to sample. Treat every value in
it as a considered opinion, not evidence.

Method, so the reasoning stays checkable:

1. **Started from a lightness flip, not a hue reinvention.** The dark `--bg`/`--fg`
   (`#080808`/`#fcfcfc`) are true neutrals (R=G=B), so flipping to `#fafafa`/`#0a0a0a`
   preserves that character — there was no hue family to guess wrong.
2. **`--muted` kept its cool cast deliberately.** Dark `#9c9ca8` leans blue (B=168 vs
   R=G=156); the light `#5b5b66` preserves the same tilt (B=102 vs R=G=91) rather than
   flattening to a neutral gray.
3. **Borders needed a polarity flip, not a lightness flip.** The dark tokens are
   `rgba(255,255,255,α)`; the alphas (`0.08`/`0.14`) were kept but the base flipped to
   `rgba(0,0,0,α)`. A literal value copy would have rendered invisible borders.
4. **`--accent` was darkened because it failed contrast, not for taste.** The sampled
   `#009664` is used as text (`.stat .num`, `.trust-badge .stars`, checkmark glyphs) and
   measured **3.63:1** against `#fafafa` — under the 4.5:1 WCAG AA threshold. Darkened
   along the same hue to `#00744f`, which measures **5.57:1**.

## Real identities in the source — replaced

The export's testimonials paired invented quotes with what are very plausibly real
people's real GitHub avatar photos (`avatars.githubusercontent.com/u/68236786`,
`.../u/124599`) under names including "Théo Balick", "Shadcn" (the real public handle of
shadcn/ui's creator) and "Shekinah Tshiokufila". Every named individual across all ten
pages was replaced with an invented name (Owen Marsh, Priya Shah, Ines Calloway, Renee
Ackah, Callum Reyes, Marcus Diallo, Tobias Lund, Elin Vance, Noor Whitfield, Julian Cho,
Adrian Voss), and **no external image is hotlinked anywhere in this theme** — avatars are
CSS-generated initials-on-gradient fills (`.avatar-fill`) and decorative product panels
are gradient art (`.art-fill`) built from the theme's own tokens.

"Tailark" was rebranded to **"Northbound"** throughout (a working display name; the
directory keeps its `tailark-dusk` id).

## Third-party material vendored in this theme

- `scripts/vendor/motion.js` — [Motion](https://motion.dev) v13.0.0, MIT, Copyright (c)
  2024 Motion B.V. Licence text at `scripts/vendor/LICENSE.md`, retained as MIT requires.
  This is the only third-party code in the theme.
- **No fonts are vendored here.** `theme.json` declares `Inter` and `Geist Mono` by
  family name only; the host emits a Google Fonts `<link>` at render time
  (`apps/website/src/server/inbound/public-http/http/site/render.ts`). No font binary is
  redistributed by this theme.

## About this file

The original NOTICE.md written during the port was deleted in commit `6d83d212`, on the
basis that it was internal licensing-risk tracking rather than a licence file, and that
the underlying question was settled. This file is a deliberately narrower replacement: it
records **attribution and provenance**, which the theme needs and had been left without,
and it does not restore the risk-register framing that was removed. The full original text
remains retrievable at `git show 9c0c9c21:src/themes/static/tailark-dusk/NOTICE.md`.
