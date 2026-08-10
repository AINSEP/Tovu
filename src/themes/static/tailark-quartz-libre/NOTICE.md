# NOTICE — provenance, licensing, and decisions

## What this is

Ported from a design export located at `/Users/la/Downloads/tailark-quartz-libre-screenshots/`
(21 HTML files + PNG screenshots, `DESIGN-HANDOFF.md`, `DESIGN-MANIFEST.json`). Unlike Basic's
source ("relay"), **this export is not a synthetic Open Design mockup** — the captured HTML
contains real Next.js deployment IDs (`data-dpl-id`), real Sanity CDN image URLs, real canonical
paths (`/libre/blog-one/...`), and `data-theme="quartz"` — all consistent with a captured
snapshot of a real, live website: [Tailark Pro](https://pro.tailark.com)'s "Quartz" theme
showcase pages (`pro-pages.tailark.com`).

## LICENSE STATUS: OWNERSHIP CONFIRMED BY REPO OWNER — one open question remains

This was flagged as a live blocker mid-session and escalated before porting continued. Timeline:

- There **is** a free, MIT-licensed "Tailark Blocks" repo (`github.com/tailark/blocks`,
  `LICENCE.md` confirmed MIT, copyright "Irung" 2025) — verified directly via WebFetch against
  the raw file, not from memory.
- **"Quartz" is specifically the name of the *paid* "Tailark Pro" tier** (`pro.tailark.com`), a
  $249–$499 one-time-payment commercial product explicitly marketed as offering "hundreds of
  enhanced Shadcn blocks beyond what's available in the free version." This export is Quartz
  content, not the free repo.
- `pro.tailark.com` has a "Legal questions" FAQ section including *"Am I allowed to create a
  derived kit based on Tailark?"* and *"Can I use Tailark Pro for client projects?"* — the answer
  text itself was not extractable (JS-rendered accordion).
- This was raised to the repo owner before porting proceeded. **The owner confirmed they own /
  hold a license for Tailark Pro themselves** — so this is not an unauthorized-use situation, and
  porting resumed on that basis.

**Still open, and distinct from the "are they licensed to use it" question above (now resolved):**
Tailark Pro's own "Legal questions" FAQ includes a "derived kit" question whose answer text could
not be extracted (JS-rendered accordion, not present in the static export). Before this theme
ships to Tovu customers, **the owner should check their actual Tailark Pro purchase terms
specifically for white-labeling / reselling as a separate product** — owning a license to *use*
Tailark Pro for one's own sites is a different question from being permitted to *repackage and
resell* its design as a competing theme product. This is a one-line forward-looking flag, not a
blocker on the port itself.

## Real people and companies in the source — all replaced

This export goes well beyond "real company logos as placeholder social proof" (Basic's NORTHWIND
precedent). It contains testimonials and blog bylines attributed to **real, identifiable
individuals** — Adam Wathan (creator of Tailwind CSS), Patrick Collison (CEO of Stripe), Eric
Simons (CEO of Bolt.new/StackBlitz), Guillermo Rauch, and several real component-library creators
(Tailkits, MerakiUI, TailwindAwesome) — attached to fabricated marketing quotes, plus real company
names (Stripe, Hulu, Vercel, Bolt, OpenAI, Supabase) used as fake "trusted by" logos and one page
(`pricing-one.html`) whose nav literally rendered "Stripe" as its own site logo. All of these were
replaced with fictional people and companies throughout this port (see `NORTHFIELD`, `COASTLINE`,
`OPALINE`, `SILVERBROOK`, `FERNBRIDGE`, `GREYSTONE` as the fictional logo-cloud companies, and
fictional bylines/testimonial authors on every page). "Tailark" branding was replaced with the
proposed fictional name **Meridian** throughout (directory name kept as
`tailark-quartz-libre` regardless, per dispatch instructions — human owner should confirm the
name before it ships).

## Tailwind / stylesheet situation

The export's own `DESIGN-HANDOFF.md` reports "Stylesheets detected: 0." This is **not** a
Tailwind CDN `<script>` violation (grepped all 21 files for `cdn.tailwindcss.com` and similar —
zero matches). Instead, each page's `<head>` links compiled, hashed CSS files
(`/_next/static/immutable/chunks/*.css`) that live on Tailark's own live server and are **not**
included in the export — meaning the exported HTML would render completely unstyled if opened
standalone. `css/styles.css` in this theme is an original, hand-authored plain-CSS design system
(no build step, matching every other Tovu static theme), reconstructed from: (a) the Tailwind
utility class vocabulary visible in the HTML (`zinc` neutral palette, a `[--color-primary:...]`
custom-property pattern confirming Tailwind v4), and (b) direct pixel-sampling of
`landing-one.png` and `pricing-one.png` via Python/PIL for exact token values — the same
methodology Basic's `NOTICE.md` used for its light-mode tokens. Sampled values: `--bg #f4f4f5`,
`--surface #ffffff`, `--surface-2 #f8f8f8`, `--fg #09090b`, `--muted #52525c`,
`--border #e4e4e7`, `--accent #615fff` (sampled directly from the "Get Started" button fill on
`pricing-one.png`). `--success` (`#0f9d70`) is a derived Tailwind-emerald-family approximation,
not a directly sampled value — the checkmark glyphs in the compare-table screenshot were too thin
to sample reliably against anti-aliased edges.

This theme originally shipped **light mode only** (`modes: ["light"]`, no `tokens.light.json`,
no theme-toggle) — no dark-mode reference material exists in this export (the sibling `dusk` and
`quartz-dark` exports cover the family's dark themes), so a fabricated dark variant was not built
in the initial port. See "Dark variant added later" below for what changed and why.

## Dark variant added later: DESIGNED, not extracted — and it flips the theme's default appearance

A dark palette was added in a follow-up pass, at the owner's request, to give this theme a real
light/dark toggle like its siblings. **Read this section before assuming the toggle behaves like
`tailark-dusk`'s or `tailark-quartz-dark`'s.** Those two themes started dark (their real,
screenshot-sampled default) and gained an *additional*, clearly-labeled-as-designed light option
— the page a first-time visitor sees, with no toggle interaction, is unchanged from what shipped
before. **This theme is the opposite case, and the fix is not symmetric with theirs.**

### Why this isn't just "add a tokens.light.json in reverse"

The static-tier engine (`src/features/theme/theme.ts` / `static-render.ts`) has exactly one
override slot: an optional `tokens.light.json`, which the renderer always emits as the
`:root[data-theme="light"]` block layered **on top of** `tokens.json`, which is always emitted as
the unconditional `:root` block — i.e. the base/default. There is no reciprocal
`tokens.dark.json` mechanism for a theme whose `tokens.json` already holds light values to gain a
dark *override* while keeping light as the default. Given that hard constraint, there were only
two honest options:
1. Leave this theme light-only, permanently unable to have a working toggle without an engine
   change (out of scope for a content-authoring pass — that would touch `theme.ts`, not this
   theme's own files).
2. Make dark the new base (`tokens.json`) and move the original, real, screenshot-sampled light
   values into `tokens.light.json` as the new opt-in override — i.e. adopt the exact same
   base/override convention every other theme in this tier already uses, at the cost of changing
   what a first-time visitor with no saved preference sees.

**Option 2 was chosen.** `theme.json`'s `defaultMode` changed from `"light"` to `"dark"`, and
`modes` changed from `["light"]` to `["dark", "light"]`. This is a real, visible product decision,
not just an authoring detail — flagging it unambiguously rather than letting it read as "just
another light-mode addition" like the sibling themes' NOTICE.md entries. If the product owner
would rather this theme stay light-default with no toggle at all than have its default appearance
change, that's a real, valid alternative this pass did not have the authority to choose on its
own; revert `tokens.json`/`tokens.light.json`/`theme.json`'s `modes`/`defaultMode` to restore the
original light-only state.

### Deriving the dark palette

Same method as `tailark-dusk`'s and `tailark-quartz-dark`'s light additions, run in the opposite
direction (lightness-flipping a real, sampled palette rather than inventing one from nothing) —
every dark value below traces back to this theme's own real, pixel-sampled light tokens (see
above), not a guess:

- `--bg`/`--fg`: `#f4f4f5`/`#09090b` → `#0b0b0d`/`#f5f5f6`. Both source neutrals are already close
  to true gray, so the flip carries negligible hue risk.
- `--muted`/`--border`/`--border-strong`: the light set's cool cast (B slightly higher than R/G in
  `--muted`, `#52525c`) is preserved directionally in the dark value (`#9a9aa3`, same B-forward
  tilt). `--border` needed more than a lightness flip — the light tokens are **solid hex**
  (`#e4e4e7`), not an alpha overlay, because they only ever had to read against one fixed white-ish
  `--bg`. A dark theme's border conventionally uses a `rgba(255,255,255,alpha)` overlay instead
  (matches `tailark-dusk`/`tailark-quartz-dark`'s own dark tokens) — copying the light hex value
  unchanged would have produced a mid-gray border with no relationship to the new dark surfaces
  around it, so this one token changed *representation*, not just value.
- `--surface`/`--surface-2`: the light set already uses "elevate = go toward pure white"
  (`--surface #ffffff` is lighter than `--bg #f4f4f5`) — the *same direction* every dark theme in
  this session uses ("elevate = lighten toward gray," moving away from near-black). Because both
  conventions already point the same way, the dark values (`#131316`, `#1c1c20`) are a
  straightforward lightness-step continuation from the new `--bg`, not an inversion.
- `--accent` (the indigo/violet `#615fff`) and `--success` (`#0f9d70`) are both used directly as
  small text (`.kicker`, `.tag`, `.legal-card .go`, `.status-pill`, `.compare-table .yes` — grepped
  `css/styles.css` to confirm every real usage before deciding what needed to change). Computed
  WCAG contrast (Node script, standard relative-luminance formula, not eyeballed):
  `--success` unchanged (`#0f9d70` measures 5.69:1 against the new `#0b0b0d` bg — already fine).
  `--accent` needed adjustment: the untouched source value measured only 4.30:1 against the new
  bg — under the 4.5:1 AA threshold for the small text it's used as. Lightened along the same hue
  to `#706eff` (5.02:1 as page text). This value was chosen as a **deliberate balance point**
  between two different roles the one token serves: as text-on-page it needs ≥4.5:1 (small-text
  AA), but it is also used as a *fill* under white `--accent-fg` text (`.btn-solid`) — a lighter
  indigo (e.g. `#7d7bff`, which clears 5.76:1 as page text) drops the white-on-fill pairing to
  3.42:1, under AA-normal-text but still comfortably above the 3:1 threshold that applies to the
  large/bold text a filled button typically uses. `#706eff` was picked as the value where both
  roles clear their respective applicable threshold (5.02:1 as page text, 3.92:1 white-on-fill for
  the button case) rather than optimizing one role and breaking the other.
- `--accent-strong` (a hover/pressed emphasis color): the light set's value (`#5252d7`) is
  *darker* than `--accent` — darkening is how you add emphasis against a light background. Against
  a dark background the same *intent* (more emphasis) requires the opposite *direction*
  (lightening, since darkening a color against a dark bg moves it toward invisibility, not
  emphasis) — set to `#8886ff`, lighter than the new `--accent`. This is a polarity flip driven by
  what the token is *for*, not a value copy.
- `--accent-soft` (a soft fill behind accent-colored text/border, e.g. `.tag`'s background): the
  light set's value is a near-white lavender tint (`#f1f1fd`) — obviously wrong verbatim against a
  near-black page. Set to a dark, desaturated violet (`#1c1b3a`) that keeps `--accent` text
  legible against it (4.23:1, checked) while staying visually "soft" relative to the page's own
  `--surface`/`--surface-2`.

### Toggle wiring

Unlike `tailark-dusk`/`tailark-quartz-dark` (whose toggle button + `js/theme-toggle.js` were added
directly to this theme by the time this pass reached it), this theme had neither, so both were
added here: `js/theme-toggle.js` (identical mechanism to the sibling themes' copies —
`localStorage` key `tovu-theme:tailark-quartz-libre`, scoped per-theme so switching the active
theme doesn't leak a stale preference from a different theme) and a toggle button in `nav.html`,
plus the matching `.theme-toggle`/`.icon-stack`/`.icon-sun`/`.icon-moon` CSS (copied structurally
from `basic`'s already-established pattern, colors bound to this theme's own tokens). The script
tag (`<script src="../js/theme-toggle.js"></script>`) was added to the `<head>` of all 21 existing
page files plus the new `blog-post.html`, matching the sibling themes' per-page wiring rather than
a single shared point (this tier has no shared `<head>` — every page is a fully independent HTML
document).

### Verification performed

Same method as the sibling light-mode additions: real production `loadTheme()`/`renderStaticPage()`
(not the standalone preview builder, not the live dev server) confirmed `tokensLight` now
populates with all 16 keys (matching the new `tokens.json`'s own key set exactly — the richest key
set of any theme in this tier, including `--accent-strong`/`--accent-soft`/`--success` beyond the
baseline set), the rendered `index.html` contains a real `:root[data-theme="light"]` block, and
setting `data-theme="light"` on `<html>` changes computed `body` background/text color. Screenshots
of both modes were captured and checked visually — the `--accent-soft` tag pills, the `--success`
status pill, and the `.btn-solid` filled button all read correctly in both modes, not just the
plain text/background swap.

Motion (motion.dev, MIT) is reused from Basic's already-vendored, license-verified copy
(`js/vendor/motion.js` + `js/vendor/LICENSE.md`) rather than re-fetched, per the dispatch
instructions.

## Canonical routes vs. style variants

The export's `DESIGN-HANDOFF.md` names `blog-article-one.html` as its "Primary entry" file, but
this is the crawler's own analysis anchor, not a homepage designation — `DESIGN-MANIFEST.json`
separately marks `landing-one.html` / `landing-two.html` with `role: "landing-page"` and the
manifest's own `landingPage.requiredSections` (hero, value props, proof, CTA) match `landing-one`
exactly. **Judgment call:** `landing-one.html` → `pages/index.html` (home), not
`blog-article-one.html` — a single blog post is not a sensible homepage. Flagging this as a
deviation from a literal reading of the dispatch brief's "whatever the manifest's primary entry
designates as `pages/index.html`" clause.

All 21 source files were ported 1:1 (11 canonical routes + 10 style-variant pages), none
discarded:

| Canonical | Source | Variants ported as |
|---|---|---|
| `index.html` | `landing-one.html` | `landing-two.html` |
| `product.html` | `product-one.html` | `product-two.html` |
| `solution.html` | `solution-one.html` (Startups) | `solution-two.html` (Startups, cash-flow angle), `solution-three.html` (Enterprise, contact form) |
| `customers.html` | `customers-one.html` | — (only one in source) |
| `customer-story.html` | `customer-story-one.html` (Stripe→Fernbridge) | `customer-story-two.html` (same subject, alt single-column layout), `customer-story-three.html` (Bolt→Coastline) |
| `blog.html` | `blog-one.html` | `blog-two.html`, `blog-three.html` |
| `blog-article.html` | `blog-article-one.html` | `blog-article-two.html`, `blog-article-three.html` |
| `pricing.html` | `pricing-one.html` | — (only one in source) |
| `legal.html` | `legal-one.html` (hub/index) | — |
| `terms.html` | `legal-document-one.html` | — |
| `privacy.html` | `legal-document-two.html` | — |

**`legal-document-one/two` judgment call:** the brief's default pattern is "one canonical +
variant," but Terms of Service and Privacy Policy are two genuinely distinct, both-needed pages
(not stylistic variants of one conceptual page, unlike e.g. the three `blog-article` layouts) —
so both were kept as permanent, separately-routed pages (`terms.html`, `privacy.html`) rather than
one canonical + one discarded/renamed variant.

**Content-authorship deviations from "preserve real copy":** two blog-article pages
(`blog-article-one`/canonical "Blockchain in Modern Finance", and `blog-article-three.html`
"Sustainability in Tech") had a real title/body mismatch in the source — all three blog-article
files shared identical placeholder body text (a "remote work" essay) regardless of their distinct,
real `<title>`. Only `blog-article-two.html`'s title ("Embracing Remote Work Culture") actually
matched that body — its content was preserved verbatim. For the other two, new short,
substantive (non-filler) articles were written to match their real titles, since shipping the
literal mismatch would read as broken on this theme's two most content-forward pages. The four
repeated "Speed Is Everything / Tailark is a fast and efficient AI-powered code editor..." feature
cards in the source (same sentence copy-pasted 4× as placeholder loop data) were likewise given
light editorial variation rather than reproduced as an obvious 4× duplicate.

## Style-variant flag for the product

Multiple pages exist per conceptual route (blog listing ×3, blog article ×3, solution ×3,
customer story ×3, landing ×2, product ×2) with real internal variation — not near-duplicates.
These are plausible future candidates for the "per-page template picker" feature described as
unstarted in `ADS-memory/.local-artifacts/handoff/20260810-000000-handoff.md`'s Risks section.
Not decided here — product question for the human owner.

## Verification

Standalone static-file-server + private headless Playwright pass (not Tovu's live engine, per
dispatch instructions) — see final report for breakpoints, pages checked, and findings.
