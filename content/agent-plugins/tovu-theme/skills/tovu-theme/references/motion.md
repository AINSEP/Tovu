# Light kUInetic motion

Use this for every new theme, conversion and reference match unless the owner asks for no or
less motion. Replace heavier inherited effects with this recipe. Keep the source's layout and
appearance; do not add stats just to animate them.

## Load once

Reuse the theme's vendored `scripts/vendor/kuinetic.all.js` and its license. When starting from
scratch, copy them from an installed stock theme such as `tovu-starter`; never fetch a CDN copy.
Keep one plain synchronous tag at the end of the shared footer used by each page:

```html
<script src="/theme-assets/<theme-id>/scripts/vendor/kuinetic.all.js"></script>
```

Use the new theme's actual id. Each footer variant carries the tag, but a page includes only
one footer. Remove duplicate page tags and old manual initializers. This is the existing
[v2 contract](theme-v2-contract.md#directory-layout-v2--resolvethemelayout-theme-layoutts).
The bundle starts itself at `DOMContentLoaded`; do not create a second animator
(`kUInetic/src/browser/boot.ts:362–369,412–429`).

Since site-consent commit `9375c236e`, scripts referenced by the active theme under its own
`/theme-assets/<id>/` are necessary and run before consent. Remote/CDN copies remain gated.
Always vendor; do not change consent settings to enable motion.

## Recipe

These are theme defaults, overriding the library's longer durations and larger distances.
Apply effects to the hero heading, section headings and card shells only. Never animate a
paragraph, a whole section containing body text, or a page wrapper. Reveal a card as one unit;
do not animate its text separately.

| Target | Exact markup attribute | kUInetic source |
|---|---|---|
| Hero heading | `data-kui="fade-blur-in 320ms ease-out blur:3px on:load rm:disable"` | `src/core/attrs.ts:4`; `src/effects/catalog/core.ts:114–116,358` |
| Section heading or card shell | `data-kui="fade-up 280ms ease-out distance:8px on:enter rm:disable"` | `src/core/attrs.ts:4`; `src/effects/catalog/core.ts:20–33,293` |
| Group of headings/cards | `data-kui-stagger="spread:120ms"` on their existing parent | `src/core/attrs.ts:16`; `src/core/stagger-config.ts:75–94`; `src/core/stagger.ts:381–405` |
| Existing numeric stat (example: 1,200) | `data-kui="count-up 600ms ease-out from:0 to:1200 decimals:0 on:enter rm:disable"` | `src/core/attrs.ts:4`; `src/effects/catalog/numbers.ts:71–83,456–457` |

Paths in this table are relative to `/Users/la/Programming/kUInetic/`, checked 2026-10-23.
Shared tokens: duration/easing grammar `src/core/parse.ts:17–22,55–60`; `on:`
`src/core/parse.ts:713–720`; load/enter behavior `src/core/activation.ts:34–44`;
`rm:disable` `src/core/parse.ts:660–661,800–818`. `spread:120ms` caps the whole group's
stagger span at 120ms, rather than adding 120ms for each child. Use only relevant siblings;
never stagger all sections across the page.

`on:enter` without an exit partner plays once and stays (`src/core/activation.ts:259–272`).
The hero runs once on load. Keep the default single play; no replay/reset handlers, looping,
parallax, scroll scrubbing, long delays or intro screens. Content and controls remain usable
immediately; motion must never gate navigation or reading.

## Visible first, reduced motion always

Leave authored HTML/CSS fully visible. Do not ship a pre-JS cloak, `opacity:0`, hidden visibility
or a hidden utility class on motion targets. Use the vendored all-in-one runtime's injected CSS;
do not add a separate stylesheet that hides targets before JavaScript runs. The runtime alone
applies the initial animation state after it loads. Its reveal keyframes only affect opacity,
translate and filter (`src/css/entrance.css:25–29,251–255`), so they do not move layout boxes.

Keep the library's default respect for `prefers-reduced-motion` (`src/core/animator.ts:1626`).
Every effect above uses `rm:disable`: reduced motion leaves reveals at rest and never starts
the count, preserving its authored final number (`src/css/base.css:476–482`;
`src/core/animator.ts:853–863`). Never override this with an ignore setting.

Author a stat's real final value as its text, matching `to:`; keep labels and units outside
the number's leaf element (`src/effects/catalog/numbers.ts:287–325`). For example:

```html
<span class="stat-number" data-kui="count-up 600ms ease-out from:0 to:1200 decimals:0 on:enter rm:disable">1,200</span>
```

Reserve the number's final formatted width in theme CSS before JavaScript runs. For this example,
use `.stat-number { display: inline-block; inline-size: 5ch; white-space: nowrap;
font-variant-numeric: tabular-nums; }`; adjust the width for the actual font, value and format.
Keep its line height stable. This prevents changing digits from shifting nearby content.

Before delivery, check blocked/off JavaScript, reduced motion, first scroll and repeat scroll:
content stays readable, stats show their real totals, elements run once, and layout stays still.
