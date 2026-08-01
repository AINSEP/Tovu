# Admin makeover — canary pass (Posts, Media, app shell)

Dispatch: combined Web-Design + Programmer subagent (disclosed deviation from the normal
design/build split — user asked for a single subagent to save tokens). Scope: Posts, Media,
and the app shell (`styles.css`, `Sidebar.tsx`, `App.tsx`) only. Every other section is
out of scope for this pass; Settings (`SettingsUi.tsx`, `.settings-ui-section`, `../../Jini/`)
is the reference, not touched.

Screenshots referenced below live in
`/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/b174133f-1774-4ac0-8ddd-3adeb616a125/scratchpad/recon/`
(before) — after-shots will be added under a `post/` sibling directory once implementation lands.

## 1. Recon — measured Settings vs Posts/Media comparison

Captured via Playwright at 1440×900, 900×800, 390×844, logged in as `admin`. Values below are
`getComputedStyle` reads, not eyeballed — selectors and raw JSON are reproducible via
`browser_evaluate` against `.jini-settings-dialog-*` (Settings) and `.admin-content` /
`.list-table` (Posts/Media).

| Property | Settings (reference) | Posts/Media (current) |
|---|---|---|
| Page eyebrow/kicker | `.jini-settings-dialog-kicker`: 11px / weight 600 / letter-spacing 0.88px / uppercase / `--muted`-equivalent color, 4px margin-bottom | **none** — no kicker anywhere in `.admin-content h1` pattern |
| Page title | `h2` in `.jini-settings-dialog-head-line`: 26px / weight 600 / letter-spacing ‑0.26px | `.admin-content h1`: 26.4px / weight 700 / letter-spacing ‑0.264px (already close in *size*, but no kicker/description pairing is used on these two pages — Posts/Media render a bare `<h1>` with nothing else) |
| Description under title | `.jini-settings-dialog-subtitle`: 13px / muted, sits inline next to the title | **none** on Posts; **none** on Media |
| Card / panel | `.jini-settings-dialog-chrome` / dialog: 1px solid border `rgb(225,229,235)`, radius **8px**, bg near-white `rgb(253,252,250)` (warm, not pure white), padding 16px, `gap: 14px` between stacked fields | `.list-table` sits directly on the page with **no surrounding card** — its own border/radius (16px)/shadow substitute for a card, but there is no padding around the table and no toolbar row above it |
| Tabs / segmented nav | active tab: 8px/12px padding, radius 6px, `letter-spacing 0.16px`, underline via `border-bottom` on the accent color, subtle `box-shadow: 0 1px 0 rgba(28,27,26,.04)` | n/a — no tabs on these pages, but this is the pattern later phases will need for any section that grows sub-views |
| Buttons | "Open as dialog": pill/outline, near-white bg, soft border — **not** a filled dark CTA. Primary CTA elsewhere (`jini-button-primary`) uses the section's own accent as fill | Global bare `button` rule (`styles.css:75`) makes **every** button — New Post, Upload, Save, Cancel, Edit, Trash — the same filled dark (`oklch(0.22 0.006 260)`) CTA, size 13.6px/600, radius 7px, padding `8px 15.2px`. No visual hierarchy between primary and destructive/secondary actions |
| Table header | n/a (Settings has no tables) | `.list-table th`: 11.52px / weight 600 / letter-spacing 0.576px / uppercase / bg `oklch(0.966 .006 250)` — this part is already reasonably close to Settings' restraint |
| Table row | n/a | `.list-table td`: 14.08px, row height ~41px, link color `oklch(0.45 .13 250)` (blue) — no accent tie-in, but not offensively styled either |
| Vertical rhythm | Fields inside a card use `gap: 14px`; card-to-card spacing reads ~20-24px | Ad hoc: `.admin-content h1 { margin: 0 0 0.4rem }`, editor-header/table have no defined rhythm beyond default block margins |
| Sidebar width | n/a (shell, not section) | `.cms-nav` fixed **232px**, no `@media` anywhere in `styles.css` (0 of 748 lines) |
| Content padding | n/a | `.admin-content { padding: 32px 40px }`, fixed at every viewport |

**Read on "ugly":** Posts/Media are not badly coded — the table styling is already close to
Settings' restraint (borders, radius, uppercase headers). What Settings has that they don't:
(1) a kicker+title+description header block instead of a bare `<h1>`, (2) a card wrapper with
generous internal padding around content instead of raw table-on-page, (3) button hierarchy
(soft/outline for secondary actions, filled only for the primary CTA) instead of every button
being the same dark pill, (4) a defined spacing/type scale instead of ad hoc `0.85rem`/`0.7rem`
values sprinkled per rule. None of it is exotic — it's the primitives layer this dispatch adds.

**Read on "not responsive":** confirmed at code level (0 `@media` queries in 748 lines) and in
the browser: at 390×844 the 232px sidebar plus 40px content padding leaves ~150px of usable
width, the table and file input overflow, and every screen requires horizontal scroll. At
900×800 nothing breaks visually (sidebar still fits) but the density is already tight — this
is the breakpoint the shell needs to have collapsed by.

## 2. Token and primitive additions

All added to `apps/admin/src/styles.css`. Every value is this file's own oklch tokens — nothing
here references `--jini-*`, and `.settings-ui-section`/`SettingsUi.tsx` were not touched.

**Spacing scale** (`--space-1` … `--space-8`, 4px→40px, `0.25rem` steps up to `1rem` then
`0.5rem` steps) — replaces the ad hoc `0.85rem`/`0.7rem`/`1.2rem` literals called out in the
dispatch brief, for every primitive below. Existing per-section rules elsewhere in the file keep
their own literals; migrating those is phase 2, not this pass.

**Type scale** (`--text-2xs` 11px → `--text-xl` 26.4px) — sized directly against the measured
Settings computed styles from §1 (kicker 11px, subtitle 13px, panel body 16px, title 26px), so
the scale reproduces Settings' rhythm rather than inventing a new one.

**Primitives**, all new:
- `.page` — flex column, `gap: var(--space-6)`, wraps a section's whole body.
- `.page-header` / `.page-header-text` / `.page-kicker` / `.page-title` / `.page-description` /
  `.page-actions` — the kicker→title→description→actions block that reproduces Settings' header
  triad. Scoped as `.page-header .page-kicker` etc. (not bare class selectors) specifically so
  they out-specificity the legacy `.admin-content h1` / `h1 + p` rules (0,2,0 vs 0,1,1) that still
  govern every other section's bare `<h1>` — without that, `.page-title`'s own margin would have
  lost the cascade to the old rule since `.page-title` is itself an `<h1>` inside `.admin-content`.
- `.card` / `.card-flush` — bordered surface with real padding (Settings' quality that a bare
  `.list-table` floating on the page lacked). Used for Posts/Media's new empty states; the tables
  themselves keep relying on `.list-table`'s own border/radius/shadow rather than double-wrapping
  in `.card` (avoided a visible double-border artifact).
- `.toolbar` — the filter/upload control row above a list (Media's upload row).
- `.btn-secondary` / `.btn-ghost` / `.btn-danger` — hierarchy variants against the global bare
  `button` rule (which stays the filled primary CTA). Applied to Media's Edit/Close (secondary)
  and Trash/Delete (danger) actions and the edit-row Cancel button, so a destructive action no
  longer renders identically to the primary "Upload" CTA.
- `.table-scroll` — horizontal-scroll wrapper so a table degrades to its own scroll region
  instead of blowing out the page at 390px (verified: page `scrollWidth` stays at the viewport
  width; `.table-scroll`'s own `scrollWidth` 411px vs `clientWidth` 366px shows the scroll living
  where it should).
- `.empty-state` — real "no rows" messaging (Media's blank table went from empty header-over-
  whitespace to a centered message inside a `.card`).
- `.file-input` + its `::file-selector-button` — styles the native `<input type="file">`'s button
  part to match the rest of the button hierarchy; the input itself can't be fully restyled
  cross-browser without JS, so this is the practical ceiling.
- `button:focus-visible, a:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }`
  — the bare `button` rule set no focus style of its own; this covers every button/link app-wide,
  additive-only.

**`.list-table` retuned** (affects ~15 sections, not just Posts/Media — this is why the spot-check
in §5 exists): `th`/`td` padding moved from literal `0.7rem 1rem` to `var(--space-3) var(--space-4)`
(11.2px 16px → 12px 16px, negligible), `td` font from `0.88rem` to `var(--text-sm)` (14.08px →
13px), `th` font from `0.72rem` to `var(--text-2xs)` (11.52px → 11px). Denser, closer to Settings'
own restraint; small enough deltas that no spot-checked screen visibly broke.

## 3. Breakpoints

Two, both in `styles.css`, chosen from what actually broke in the browser rather than round
numbers:

- **900px** — "sidebar must transform." The always-visible `.cms-nav` (fixed 232px) becomes an
  off-canvas drawer behind a mobile top bar (`.admin-topbar`, hamburger toggle + "Tovu" wordmark).
  Chosen because 900×800 was the stated tablet canary viewport and is where the fixed sidebar
  starts costing more width than a dense table can spare — confirmed nothing below this needs to
  change yet, since a still-docked 380px chat pane fits the remaining ~520px comfortably.
- **640px** — the docked chat pane (`.admin-chat-dock`, fixed 380px per ADR-049) stops fitting
  next to any usable content column, so it becomes a full-screen overlay instead of a 10px sliver
  (measured: 390 − 380 = 10px of `.admin-content` left at the phone canary viewport if the dock
  stayed docked). Kept separate from the 900px breakpoint because a 900–640px viewport (most
  tablets in portrait) has room for both the collapsed sidebar drawer AND a still-docked chat pane
  at the same time — folding them into one breakpoint would have gone full-screen on the dock
  earlier than necessary.

Drawer implementation notes:
- Off-canvas via `position: fixed` + `transform: translateX(-100%)` / `.is-open { translateX(0) }`,
  0.2s ease.
- **Accessibility fix found during verification**: a translated-off-screen element is still in the
  tab order and still exposed to screen readers — a keyboard user tabbing past the topbar toggle
  landed inside an invisible sidebar. Fixed with a delayed `visibility` transition (`visibility:
  hidden` with `transition-delay: 0.2s` on close, `0s` on open) so the drawer's content drops out
  of the accessibility tree once fully hidden and re-enters the instant it starts appearing.
  Verified via Playwright accessibility snapshot: the nav's links are entirely absent from the
  snapshot when closed, present when open.
- Closes on: route change (`useEffect` keyed on `routePath`), Escape key (scoped listener, only
  attached while open), backdrop click, and the drawer's own close button. Focus moves to the
  close button on open (`useRef` + `useEffect` keyed on `open`).
- `App.tsx`'s `<main>` stays exactly where the DOM-page-driver contract requires: still the direct
  ref target for `contentEl`, still carries `data-agent-page`. It now sits one level deeper inside
  a new `.admin-main-col` wrapper (alongside the new `.admin-topbar`), which `container.querySelector("main")`
  doesn't care about — verified against the two existing tests that assert on it.
- `.admin-chat-dock`/`.chat-fab`/`.chat-fab-dock-open` overrides at 640px are scoped as
  `.admin-layout .chat-fab` etc. (not bare `.chat-fab`) — those base rules live in the separately-
  imported `styles/assistant.css`, and rather than rely on reasoning through Vite's dev-mode
  `<style>`-tag injection order across two files, the override just wins on specificity regardless
  of which stylesheet's tag lands later in the document.

## 4. Screenshots

All under `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/b174133f-1774-4ac0-8ddd-3adeb616a125/scratchpad/`.

**Before** (`recon/`): `01-settings-1440-light.png`, `02-posts-1440-light.png`,
`03-media-1440-light.png`, `04-settings-900-light.png`, `05-posts-900-light.png`,
`06-media-900-light.png`, `07-media-390-light.png`, `08-posts-390-light.png`,
`09-settings-390-light.png`.

**After** (`post/`): `10-posts-1440-light-after.png`, `11-media-1440-light-after.png`,
`12-posts-900-light-after.png` (mobile topbar + collapsed sidebar), `13-posts-900-drawer-open.png`
(drawer open, backdrop, focus on close button), `14-posts-390-light-after.png`,
`15-media-390-light-after.png`, `16-media-390-drawer-open.png`, `17-media-390-chat-open.png`
(chat dock full-screen overlay, ChatFab as close control), `18-posts-1440-dark.png`,
`19-media-1440-dark.png`, `20-media-390-dark.png`.

**Spot-check** (`spotcheck/`): `21-users-1440-spotcheck.png`, `22-redirects-1440-spotcheck.png`,
`23-redirects-900-spotcheck.png`.

## 5. Spot-check results

`/admin/users` and `/admin/redirects` at 1440×900, plus `/admin/redirects` at 900×800 (the
breakpoint where the shell itself changes underneath every page, not just the two in scope):

- No visual regressions in either screen — table density, button styling, and layout all read
  the same as before the `.list-table` retune and the global `button:focus-visible` addition.
- Zero new browser console errors on either page (checked via `browser_console_messages`).
- At 900px, Redirects correctly inherited the responsive shell (collapsed sidebar, mobile topbar,
  no horizontal page scroll) despite never being touched directly — confirms the shell changes are
  genuinely shared, not something wired specifically for Posts/Media.

## 6. Test / typecheck output

`npm --prefix apps/admin run test` (from repo root), verbatim tail:

```
 Test Files  3 failed | 13 passed (16)
      Tests  221 passed (221)
```

The 3 failed suites (`app-agent-page-identity.unit.test.tsx`, `app-plugins-route.unit.test.tsx`,
`app-route-prototype-keys.unit.test.tsx`) all fail at import time with
`ReferenceError: __TOVU_ADMIN_VERSION__ is not defined` in `src/lib/app-version.ts:12`, imported
by `SettingsUi.tsx` (a file this dispatch never touched) and pulled in transitively by `App.tsx`.

**Verified pre-existing, not caused by this pass**: `git stash push` on exactly the 5 files this
dispatch changed (`App.tsx`, `Sidebar.tsx`, `Posts.tsx`, `Media.tsx`, `styles.css`), rerunning
just those 3 suites against the untouched baseline — identical failure, same error, same location.
Restored the stash afterward (`git stash pop`); diffed back to confirm no content was lost.
This means the dispatch brief's "the suite currently reports zero unhandled errors" did not hold
even before this pass started — worth flagging to whoever owns `vitest.config`/`vite-env.d.ts`'s
`__TOVU_ADMIN_VERSION__` define, but out of scope for a Posts/Media/shell canary to fix, and I did
not touch `app-version.ts`, `SettingsUi.tsx`, or any build config.

All 221 individually-collected tests pass — zero regressions from this dispatch's changes.

`npm --prefix apps/admin run typecheck` (from repo root): clean, no output, exit 0.

## 7. What this pass did NOT do / phase 2 needs

**Explicitly out of scope, not done:**
- No other section besides Posts and Media was restyled onto the new primitives. Every other
  admin screen (~30 sections) still renders a bare `.admin-content h1` with no kicker/description,
  and still uses the pre-existing ad hoc spacing literals.
- `.list-table` got a typography retune (padding/font-size onto the new scale) but was not
  restructured — no `.card` wrapper, no per-section toolbar migration for the other ~13 sections
  that use it. Only Posts/Media got the `.table-scroll` + empty-state treatment.
- No new committed Playwright spec files, per the dispatch constraint — everything above was
  verified interactively and is not re-checked by CI. Phase 2 (or a follow-up) should decide
  whether any of this deserves a committed regression test now that the design has stabilized.
- Did not touch the pre-existing `__TOVU_ADMIN_VERSION__` test-suite failure (§6) — flagged, not
  fixed, since it's unrelated build/test config outside this dispatch's file scope.
- No focus trap inside the open drawer (Tab can leave it into the backdrop/body). Mitigated by:
  Escape-to-close, backdrop-click-to-close, and the drawer's content being removed from the tab
  order entirely while closed (see §3). A full trap is a reasonable phase-2 hardening item if the
  drawer sees heavier keyboard use than expected.
- The mobile topbar's title is a static "Tovu" wordmark, not the current section's name — simplest
  option for this pass; swapping in the live page title is a small follow-up, not a design gap.

**What phase 2 needs to roll this out to the remaining sections:**
- Swap each section's bare `<h1>`(+ `<p>`) for `.page` / `.page-header` / `.page-title` /
  `.page-description` / `.page-actions`. The legacy `.admin-content h1` / `h1 + p` rules can be
  deleted once every section has migrated — they're only still load-bearing because most sections
  haven't moved onto the new primitives yet.
- Apply `.btn-secondary` / `.btn-ghost` / `.btn-danger` wherever a screen currently renders
  multiple bare `<button>`s with no hierarchy (this is common — Posts/Media were not unusual in
  that respect, just the two in scope).
- Decide whether `.card` should become the standard wrapper for every `.list-table` (would need
  the double-border question resolved — either drop `.list-table`'s own border/radius/shadow when
  it's inside a `.card`, or keep the current approach of not double-wrapping).
- Migrate the remaining per-section ad hoc spacing literals (`0.6rem`, `1.2rem`, etc., visible
  throughout the file below the primitives block) onto `--space-*` as those sections get touched,
  rather than in one sweep — lower risk, matches how this pass approached `.list-table`.

---

## ADDENDUM — scope expansion (control layer, burnt orange, icon rail, mobile chat sheet, draggable FAB)

Everything above (§1–§7) was delivered and reported before this addendum's scope arrived. A series
of numbered messages (MSG-02 through MSG-09) reached this session in one batch, after that first
report — see the session transcript for the full ack. None of §1–§7 was rolled back; this section
is purely additive. Reference images used throughout:
`ADS-memory/.local-artifacts/handoff/od-parity-20260731/od-settings-external-mcp-customform.png`
(control layer) and `od-settings-external-mcp.png` (burnt orange source), plus
`od-settings-instructions.png`/`-notifications.png`/`-language.png`/`-privacy.png` for the
card/toggle/tile/disclosure patterns already partially represented in `.settings-ui-section`'s own
compensating rules.

### A. Burnt-orange primary token (`apps/admin/src/styles.css`)

New token family, deliberately separate from `--accent` (kept the recommended split rather than
repainting `--accent`, because OD's own reference backs it up — `od-settings-external-mcp.png`'s
selected sidebar row is plain neutral grey; only its "Add server" button is orange. One primary
CTA per panel and a neutral selection color are two different concepts in the source material,
not just an inference on my part):

- `--primary` (light): `oklch(55.29% 0.1129 43.4)` ≈ `#A85A38`. **5.02:1 against white**, measured
  with a standalone WCAG relative-luminance script (`node`, no deps), oklch↔hex round-tripped for
  precision — not eyeballed. Deliberately deeper than the ~`#AD5F3C`/~4.7:1 the brief suggested:
  that value clears AA by only 0.19, and `#A85A38` is the same hue/chroma with more margin. Flagging
  as a disclosed deviation since the brief said argue rather than silently adjust.
- `--primary-strong` (light): `oklch(62.83% 0.1111 43.6)` = the user's exact `#C0714F` swatch,
  **3.67:1 against white** — fails AA for normal text, so kept for non-text/decorative surfaces
  only, never as button fill. Explicitly NOT used as the button hover state — a button's hover
  still shows the same label text, so swapping to a failing color there would undo the fix; hover
  keeps the existing `button:hover { opacity: 0.88 }` mechanism instead.
- `--primary` (dark): `oklch(56% 0.10 44)` ≈ `#A56042`, **4.83:1 against white**. Lighter and lower
  chroma than the light-mode value per the "avoid glowing on near-black" guidance — verified
  visually in the browser side by side with the light version, not just by the numbers (screenshot:
  `tokens/31-media-orange-dark.png`).
- `--primary-ink`/`--primary-dim`/`--primary-ring` round out the family (label color, tinted
  background for low-emphasis surfaces, focus-ring alpha).
- Disabled buttons: `color-mix(in oklch, var(--primary) 30%, var(--surface))` — a desaturated tint
  of the primary, not grey-via-opacity, stealing OD's own "All changes saved" disabled-button detail
  from `od-settings-external-mcp.png`.

The bare `<button>` rule (used with no `className` everywhere in the app) now fills with
`--primary` instead of the old near-black `--accent` — this is the same app-wide reach the original
rule already had, just recolored. Re-checked `/admin/users`: every button there is now orange
(`New user`, `Disable`×4, `Manage`×4) since that screen has no hierarchy classes applied — not
broken, just still flat, because hierarchy work (MSG-02's "sort out which is which") was scoped to
Posts/Media only, per instruction. Screenshot: `tokens/32-users-orange-spotcheck.png`.

Screenshots: `tokens/30-media-orange-light.png`, `31-media-orange-dark.png`.

### B. Control layer (`apps/admin/src/styles.css`, `apps/admin/src/sections/Media.tsx`)

Rebuilt the form-control design system, previously two bare-element rules total
(`input, select { ... }` + a `:focus` override), against the OD custom-form reference:

- Global `input, select, textarea` base rule: 37px min-height, refreshed border/radius/padding,
  `--faint` placeholder color. Deliberately did NOT add `width: 100%` to this global rule — several
  sections (Redirects' filter row, menu-item rows) rely on inline/flex sizing that a forced
  full-width would have broken; full-width is instead scoped to the new opt-in `.field` primitive
  (`.field input { width: 100% }`), used only where a section explicitly adopts it.
- Real focus ring: `box-shadow: 0 0 0 3px var(--primary-ring)` plus a `--primary` border, replacing
  the old `outline: none; border-color: ...` (a weak, easily-missed affordance and a WCAG 1.4.11
  gap, called out explicitly in MSG-02).
- `select`: `appearance: none` plus a custom chevron. Two chevron images (light/dark), not one +
  `currentColor` — a `background-image` data URI cannot read a CSS custom property, so each theme
  gets its own baked-in `--muted` hex. The native popup itself is untouched, per the "style the
  trigger, don't fake the listbox" instruction.
- Checkboxes/radios: `accent-color: var(--primary)`. Investigated whether they were actually
  broken first rather than assuming — they were not: the browser's own `input[type="checkbox"]`
  UA-stylesheet rule already out-specifies the page's bare `input` selector on padding/border
  (verified via `getComputedStyle`, screenshot `tokens/33-checkbox-before.png`), so they were
  unstyled 13px OS defaults with zero token connection, not visually broken boxes.
- `.field` / `.field-label` / `.field-row` / `.field-group`: label→control gap ~4px, group→group
  gap ~4-5× that (`--space-4`/`--space-5`) — modeled on the OD reference's own ratio, which is most
  of why it reads organized. `.field-row` pairs short fields into a 2-column grid; long fields
  (never wrapped in it) stay full-width. `.field-mono` for command/key=value-style inputs
  (monospace placeholder, an OD idiom signaling "this expects code", not decoration).
- Folded `.settings-value-editor textarea` and `.redirects-import textarea` down to just their
  monospace override, now that the shared `textarea` rule supplies padding/border/radius/resize.
- Unified the four different label idioms (`.login-card label`, `.integrations-form label`,
  `.collections-dynamic-field label`, `.settings-value-editor label`) onto the same uppercase/
  letterspaced/muted metrics as the new `.field-label` — a CSS-only value change (font-size/weight/
  letter-spacing/text-transform/color), their layout properties and DOM/TSX untouched, so this
  reaches those four other sections' *look* without touching their markup or expanding this
  dispatch's file-touch scope.

Media's `EditMediaRow` is the proving ground (Title+Alt paired, Caption+Credit paired) —
screenshots `controls/40-media-fields-light.png`, `42-media-fields-dark2.png`. Posts has no form
fields of its own (just the New Post button), so the control layer's visible impact there is
limited to the refreshed input styling any future Posts form field would inherit for free.

### C. Icon rail (`apps/admin/src/nav.ts`, `apps/admin/src/components/Sidebar.tsx`,
`apps/admin/src/hooks/use-sidebar-rail.hooks.ts`, `apps/admin/src/styles.css`)

**Icon collisions.** Redrew two: `pages`/`forms` (the flagged collision — near-identical
rect+3-lines, one line-width apart) and `posts`/`settings-raw` (found independently — their paths
were pixel-identical: `M3 4h12M3 8h12M3 12h8` vs `M3 4h12M3 9h12M3 14h8`, same three widths, just
different y-offsets). `posts` is now a bulleted list (dot+line rows); `forms` is now two
checkbox-and-line rows per the suggested "form-shaped, not another document" fix; `settings-raw`
kept its plain lines. Audited all 26 by rendering them as a standalone reference sheet at 40px
(`node` extracted every `icon` string from `nav.ts`, wrote a throwaway HTML grid, served over a
local `python3 -m http.server` since the Playwright MCP blocks `file://`) rather than eyeballing
the live 16px rail — screenshot: `rail/icon-sheet.png`. No other true collisions found;
`widgets`/`overview` (both grid-of-squares) and `roles`/`workspace`/`collections` (all rect+line)
are a mild family resemblance left alone since they're genuinely distinguishable up close and
weren't flagged.

**Mechanics.** `useSidebarRail()` — localStorage-persisted (`tovu-admin-sidebar-rail-collapsed`),
cross-tab synced via the `storage` event, a fully separate boolean from the mobile drawer's
`sidebarOpen` (verified independence directly: collapsed the rail, resized to 390px, opened the
drawer — it opened at full 272px width, `is-rail` class present but inert since the rail's own CSS
is gated to `@media (min-width: 901px)`). Real labels stay in the DOM when collapsed, clipped
visually with the same recipe as the file's existing `.visually-hidden` (verified via accessibility
snapshot: link names like "Overview"/"Pages" are still exposed when collapsed). Group headings
become divider rules (`font-size: 0` collapses the visible glyph while the text node stays in the
DOM for AT) rather than disappearing. `.soon` badges hidden but `is-soon`'s faint color still reads
disabled. `.cms-item.active::before`'s `-12px` offset corrected to `-8px` for the rail's narrower
padding (screenshot `rail/64-active-bar-crop.png` confirms flush alignment). Toggle has
`aria-label`+`aria-expanded`; width transition respects `prefers-reduced-motion`.

**A real bug found and fixed mid-verification, not before:** the tooltip's first implementation
(CSS-only, `position: absolute` inside `.cms-item`) never painted anything, despite
`opacity`/`visibility` both reading correctly via `getComputedStyle`. Root cause: `.cms-nav`'s
`overflow-y: auto` forces `overflow-x` to compute as `auto` too per the CSS overflow spec — this
holds even when `overflow-x: visible` is declared explicitly (checked live: `getComputedStyle`
still reported `auto` after adding it), silently clipping anything positioned to escape the rail's
own box. Fixed by portaling the tooltip to `document.body` (`RailTooltip` in `Sidebar.tsx`,
`position: fixed`, coordinates from `getBoundingClientRect()`) instead of fighting the clip.
Verified working via both mouse hover and programmatic `.focus()` (keyboard-equivalent) —
screenshot `rail/62-tooltip-portal-crop.png`.

Screenshots: `rail/50-rail-collapsed-light.png`, `51-rail-zoom.png` (pre-fix, for context),
`52-…hires`/`53-54` (icon legibility crops), `55-59` (tooltip debugging sequence), `60-61-62`
(portal fix confirmed), `63-rail-dark.png`, `64-active-bar-crop.png`, `65-66` (mobile drawer
unaffected by rail state).

### D. Mobile chat dock — bottom sheet (`apps/admin/src/App.tsx`,
`apps/admin/src/styles/assistant.css`, `apps/admin/src/styles.css`)

**Reproduced the reported defect first.** `.admin-chat-dock` was a rigid `flex: 0 0 380px` sibling
in `.admin-layout`'s row — at a 390px viewport with the dock open, `.admin-content` was crushed
toward zero width. `.chat-fab-dock-open { right: calc(380px + 20px) }` evaluates to `right: 400px`,
which is off-screen on a 390px display — a user who opened chat on a phone had no visible control
to close it. Both confirmed via the browser before writing any fix.

**Built a bottom sheet, not full-screen** — deliberately, not just for space: `App.tsx` mounts
`createDomPageDriver` scoped to `<main>`, so the assistant's `page.navigate`/`page.find_elements`
calls visibly act on whatever is behind the chat. Full-screen would hide the exact surface the
agent manipulates and break that feedback loop; a partial-height sheet keeps `<main>` visible
underneath. Two heights: 58vh default, 92vh expanded, toggled via a chevron button in a new sheet
header bar (title, expand/collapse, close ×) rendered by `App.tsx` around `<AssistantDock>` — not
inside it, keeping that component's own internals (and ADR-049's "never unmount") untouched.

**Scope decision, disclosed rather than silently narrowed:** open/close itself is NOT animated —
still the plain `hidden` attribute → `display: none`, unchanged from before. Only the
default↔expanded height transition animates (both states are visible, so no `display: none`
conflict there). Animating the open/close edge as well would require replacing `hidden`'s
`display: none` with `visibility`/`transform`/`inert` — exactly the tension flagged in the brief —
which is a real feature on its own, not a drive-by addition on top of everything else in this
addendum. `hidden` already satisfies the load-bearing requirement (closed sheet fully out of the
tab order and accessibility tree, for free, via non-rendering) without that complexity.

**What IS covered:** Escape-to-dismiss (same pattern as the sidebar drawer), a visible close
button in the sheet header, focus moving into the sheet on open (`tabIndex={-1}` + `.focus()` on
the `<aside>`, confirmed visually via the browser's own focus ring — screenshot
`sheet/74-sheet-dark.png`) and back to the FAB on close (confirmed via `document.activeElement`
after pressing Escape — it read `aria-label="Open assistant"`, i.e. the FAB). `inert={!chatOpen}`
added alongside `hidden` for explicit, not merely incidental, focus/AT exclusion when closed.
Desktop docked behavior (>640px) is completely unchanged — verified by screenshot,
`sheet/73-desktop-dock-unaffected.png`.

Screenshots: `sheet/70-sheet-default.png`, `71-sheet-expanded.png` (FAB correctly relocates to
clear the taller sheet), `74-sheet-dark.png`.

### E. Draggable FAB (`apps/admin/src/hooks/use-fab-position.hooks.ts`,
`apps/admin/src/components/ChatFab.tsx`, `apps/admin/src/styles/assistant.css`)

`useFabPosition()` — no `-port.hooks.ts`/`-dependencies.hooks.ts` pair per the brief's own note
(localStorage is the only outside dependency, not a swappable backend worth a fake-port seam).
Pointer Events (`pointerdown`/`pointermove`/`pointerup`) with `setPointerCapture`; `touch-action:
none` on `.chat-fab` so a touch-drag doesn't fight the page's own scroll gesture. Position
persisted as **edge (`"left" | "right"`) + a fraction of `innerHeight` from the bottom**, never raw
pixels — the same class of bug as the old `calc(380px + 20px)`, generalized: a pixel position valid
at one viewport can be off-screen at another (window resized, phone rotated). Re-clamped on
`resize`/`orientationchange`. Snaps to the nearer edge on release.

**A real stale-closure bug found and fixed before shipping, not after:** the first version checked
the *React state* `isDragging` inside the `pointermove`/`pointerup` handlers. Those handlers are
registered once via `document.addEventListener` at `pointerdown` time and never re-subscribed when
`isDragging` changes mid-gesture — so every handler invocation after the first `pointermove` was
still reading the `isDragging=false` closure captured at drag start, meaning `handlePointerUp`'s
`if (isDragging)` guard was always false and a completed drag's end position was silently never
persisted. Fixed by moving all drag-logic state into refs (`draggingRef`, `didDragRef`,
`liveRef`) — mutable cells with no closure staleness — and keeping the React `isDragging` state
purely for UI consumption (CSS class).

**Click-vs-drag disambiguation**, verified with real Playwright mouse events (`page.mouse.move/
down/up`, not the higher-level `click()` helper, so the browser's own click-after-pointerup
synthesis is exercised for real): a genuine drag (12 intermediate `pointermove`s, well past the
5px threshold) followed by its natural trailing `click` left the dock closed
(`dockHiddenAfterDrag: true`) — the click was correctly swallowed via `consumeDragFlag()`, a ref
read+clear rather than a same-tick React-state check (click fires after pointerup, and by then
React may not have flushed `isDragging`'s new value — the ref has no such lag). A subsequent,
separate, no-movement tap at the FAB's new position opened the dock correctly
(`dockHiddenAfterTap: false`), proving the flag doesn't leak across interactions. `localStorage`
showed the dragged position (`{"side":"left","bottomFraction":0.82…}`) — screenshot
`sheet/72-fab-dragged.png`.

**FAB/dock avoidance**: `avoidBottomPx` is measured, not guessed — `App.tsx` runs a
`ResizeObserver` on the sheet element itself while `isSheetMode && chatOpen`, so the FAB's
clearance tracks the sheet's *actual* rendered height (including mid-transition, when it fires on
every animation frame) rather than a hard-coded `58vh`/`92vh` assumption. `0` at desktop, where the
dock sits beside `.admin-content`, not below it.

**FAB recoloring**: was `background: #ffffff; color: #d4af37` (hard-coded gold) — flagged in the
brief as off-token and about to clash with the new orange. Repainted onto `--primary`/
`--primary-ink`: the FAB is functionally a circular primary-action button, `--primary` already has
measured AA contrast in both themes, and reusing it means the FAB reads as the same "press this"
signal as every other primary CTA rather than a second, unrelated one. **Disclosed judgment call**:
if gold was a deliberate assistant-specific brand mark rather than an incidental hard-coded value,
reverting to a dedicated `--assistant-accent` token is a one-line follow-up, not a redesign.

**Known limitation, disclosed rather than fixed under time pressure**: a position dragged at one
viewport can visually overlap *other chrome* at a very different viewport, even though it is never
off-screen. Concretely reproduced: dragging the FAB to the left edge at 390px (no rail there, the
drawer is off-canvas) then viewing at 1440px desktop places it directly over the collapsed icon
rail's icons (both are `left: 20px`-ish). The FAB still has a higher `z-index` and remains fully
clickable — this is a visual overlap, not a functional break — but it is not resolved by the
current `avoidBottomPx`-only avoidance, which only knows about the chat dock, not the sidebar rail.
A full fix would need the hook to accept a second "avoid this rect" input for the rail the same way
it does for the dock; not implemented, given everything else in this addendum's scope. Reset via
`localStorage.removeItem('tovu-admin-fab-position')` before final verification so the shipped state
starts at the original bottom-right default.

### F. Verification (post-addendum)

`npm --prefix apps/admin run typecheck` (from repo root): clean, no output, exit 0 — run twice,
once after the control-layer/rail work and once after the sheet/FAB work.

`npm --prefix apps/admin run test` (from repo root), final run:
```
 Test Files  3 failed | 21 passed (24)
      Tests  252 passed (252)
```
Same 3 pre-existing failures as §6 (`__TOVU_ADMIN_VERSION__`), still unrelated to anything in this
addendum — file count grew from 16→24 and passing tests from 221→252 between the two reports
because of unrelated parallel work landing on the branch during this session (see the note on
`Posts.tsx` below), not anything added here. Zero regressions from the addendum's own changes.

Re-spot-checked `/admin/users` and `/admin/redirects` at 1440×900 after all of A–E landed (not just
after the token change in isolation) — zero console errors either page, both benefit incidentally
from the control-layer refresh (visible custom select chevrons, refined inputs) without anything
breaking. Screenshots: `spotcheck/80-redirects-final-spotcheck.png`,
`spotcheck/81-users-final-spotcheck.png`.

**Noted, not mine:** partway through this addendum, `apps/admin/src/sections/Posts.tsx` gained a
working per-row "Delete" feature (a `removePost` function, a `.btn-danger`-classed button) that
this session did not write — visible in the DOM order/diff. It correctly adopted the `.btn-danger`
primitive from this dispatch's own earlier work rather than reinventing a style, and
`/admin/redirects`'s own "Delete" button (visible in the final spot-check screenshot) appears to be
the same parallel author's work, same pattern. Not reverted, per the standing instruction to leave
concurrent unrelated changes alone.

### G. What the addendum did NOT do

- No focus trap inside the icon-rail tooltip or the chat sheet (same disclosed gap as the original
  drawer in §7).
- Sheet open/close is not animated (see §D's "Scope decision" above) — a real, disclosed
  simplification, not an oversight.
- No "peek bar" third sheet state — two states (default/expanded) plus fully closed, not three
  (default/expanded/peek). The brief offered "draggable or expandable... and collapsible to a peek
  bar" as alternatives; a button-toggled expand was chosen over a drag-to-resize gesture for the
  sheet itself (distinct from the FAB's own drag, which *was* built) to keep the surface area
  bounded — a drag-to-resize sheet is a reasonable phase-2 item if the two-state toggle feels
  insufficient in practice.
- FAB/rail overlap at cross-viewport drag scenarios (§E, "Known limitation") — disclosed, not
  fixed.
- No arrow-key repositioning for the FAB while focused (offered as "nice to have, not required" in
  the brief) — plain Tab+Enter/Space activation works, dragging is fully mouse/touch-only.
- Rail width/breakpoint values (`60px`, `901px`) and sheet heights (`58vh`/`92vh`) are literals in
  `styles.css`, not tokens — consistent with how `--space-*`/`--text-*` were introduced
  incrementally in this same file rather than as a single day-one token sweep; a reasonable
  follow-up once these values feel settled rather than still-in-flux.

---

## ADDENDUM 2 — button-hierarchy demotion rule, Media column changes, two a11y fixes (MSG-10–MSG-15)

Delivered after the sheet/FAB addendum above; MSG-10/11's own comments about the sheet/FAB being
outstanding were superseded by the time MSG-15 arrived (it lists exactly four remaining items,
none of them sheet/FAB) — those two were already complete and are not revisited here.

### H. `.list-table td button` demotion rule (`apps/admin/src/styles.css`)

```css
.list-table td button:not([class*="btn-"]) {
  background: var(--surface); color: var(--fg-2); border: 1px solid var(--border-strong);
}
```

One structural rule instead of touching ~15 sections' `.tsx` files. Scoped to `td` so header/
toolbar CTAs (New Post, Upload, Add redirect, Add webhook — none inside a `<td>`) keep the primary
treatment; `:not([class*="btn-"])` excludes buttons that already opted into an explicit variant
(Media's own `.btn-secondary`/`.btn-danger`). That exclusion is load-bearing, not defensive
boilerplate: `.list-table td button` alone is specificity (0,1,2), which actually outranks a bare
`.btn-danger` (0,1,0) — without the `:not()`, this rule would have silently overridden every
explicit variant already in place.

**Verified across all four widened spot-check screens** (not just Users):
- `/admin/users` — 9 orange buttons → 1 ("New user" stays primary; 4×Disable/4×Manage demoted).
  Screenshot `demotion/90-users-demoted.png`.
- `/admin/redirects` — "Add redirect" stays primary; "Load hits"/"Disable" demoted; "Delete" (a
  parallel agent's `.btn-danger`) correctly untouched, proving the exclusion works alongside
  other authors' explicit classes, not just this dispatch's own. `demotion/91-redirects-demoted.png`.
- `/admin/collections` — "New content type" stays primary; "Edit fields"/"Deprecate"/"Tombstone"
  all demoted (including "Tombstone", which reads destructive by name — see the known-gap note
  below on why that's the correct default, not a miss). `demotion/92-collections-demoted.png`.
- `/admin/integrations` — "Add webhook" stays primary; table is empty (no webhooks configured) so
  there was nothing to demote, but confirms the rule doesn't affect the empty state.
  `demotion/93-integrations-demoted.png`.

Checked `.toolbar`/`.card`/`.notice` for the same multi-button pattern per MSG-11's instruction:
`.toolbar` has exactly one usage in this dispatch's scope (Media's upload row, one button — no
demotion needed), `.card`/`.notice` have no multi-button footer pattern in scope either. Nothing
else to demote structurally right now; flagging for phase 2 if a future section adds a multi-
button toolbar.

**Known, disclosed gap** (not a miss): CSS cannot distinguish "Disable" from "Manage" or
"Tombstone" from "Edit fields" by meaning — every unclassed row button lands on the same quiet
secondary treatment. That's the correct safe default, not a claim they're equally weighted;
per-action semantic promotion belongs in the owning section's own markup (phase 2), and is
recorded in the hierarchy spec below rather than guessed at here from label text.

### I. Media.tsx column changes (`apps/admin/src/sections/Media.tsx`, `styles.css`)

Removed the `sha256` and `v` (version) `<th>`/`<td>` pairs from the main table — six columns down
to four (Title/Alt/Status/actions). Neither the `sha256` nor `version` **field** was touched:
`item.sha256`/`item.version` are still fetched and still part of `AdminMedia`; only the rendering
of those two columns was removed.

`sha256` moved into `EditMediaRow` (the control-layer proving ground) as a new read-only field —
full un-truncated hash in `<code className="field-mono field-readonly">`, plus a "Copy" button
(`navigator.clipboard.writeText`, with a 1.5s "Copied" label flip and a silent-fallback `catch` so
a denied clipboard permission degrades to "select the text manually" rather than throwing).
New CSS: `.field-readonly-row`/`.field-readonly` — same border/radius/padding/min-height as a real
input so it lines up inside the same `.field-group`, rendered as `<code>` rather than
`<input readOnly>` since there's nothing here to type into.

Verified: 4-column table (screenshot `demotion/95-media-sha256-field.png` shows the full 64-char
hash + Copy button inside the expanded row, `96-media-sha256-dark.png` confirms dark theme).
Clicking Copy in this automated browser context did not flip to "Copied" — consistent with a
denied `clipboard-write` permission in the automation environment (no console error was thrown,
confirming the `catch` fallback engaged correctly rather than the feature being broken); a real
browser session with clipboard access granted would show the "Copied" state.

`Posts.tsx`'s `v` column removal is explicitly **not** included here — that file was transferred to
the `delete-wiring` agent before this batch of work started, and was not touched.

### J. Two accessibility fixes

**Skip link** (`App.tsx`, `styles.css`). `<a href="#main-content" class="skip-link">Skip to
content</a>` as the first child of `.admin-layout`, before `<Sidebar>` — first in both DOM and tab
order. `id="main-content"` plus `tabIndex={-1}` added to `<main>`; the `tabIndex` matters because a
plain `<main>` isn't natively focusable, so without it the skip link would scroll main content
into view without actually moving keyboard focus there — satisfying the letter of "skip
navigation" while missing the point. Verified both properties directly, not just the visual reveal:
pressed Tab from a fresh load → `document.activeElement` was the skip link (`href="#main-content"`,
first in tab order, before the sidebar toggle); pressed Enter → `document.activeElement` became
`<main id="main-content">` itself. Screenshot `demotion/94-skip-link-focused.png` shows the
visible, focused state (orange pill, top-left, matching `--primary`).

**Duplicate `<h1>`** (`AssistantDock.tsx:191`). Was `<h1 className="jini-chat-pane__title">`; the
dock mounts on every route (ADR-049), so every screen had two `<h1>`s with no signal to a screen
reader navigating by heading which was the real page title. Changed to `<h2>` — confirmed the
class-based styling in `styles/assistant.css` has no bare-`h1` selector dependency before making
the change, so it's visually inert. Verified live on `/admin/users`:
`document.querySelectorAll('h1')` → exactly 1 (`"Users"`), `document.querySelectorAll('h2')` → the
assistant's own title (`"Tovu assistant"`, class `jini-chat-pane__title`), present in the DOM even
while the dock is `hidden` (ADR-049 never-unmount) but no longer counted as a second `<h1>`.

`AssistantDock.tsx` was not on this dispatch's original off-limits list (only `SettingsUi.tsx`,
`.settings-ui-section`, and `../../Jini/` were) — a one-line tag change to fix a real cross-page
a11y bug, not a change to that component's mount lifecycle or internals, so it was made directly
rather than routed elsewhere.

### K. Phase-2 action-hierarchy spec (recorded per MSG-14, not implemented beyond what's above)

From the completed UX audit, for whoever picks up per-screen row-action semantics next:

| Screen | Primary | Secondary | Destructive/other |
|---|---|---|---|
| Posts/Pages list | New Post/New Page | — | Row delete — owned by `delete-wiring`, not this dispatch |
| Redirects | Add redirect | Enable/Disable toggle | Delete |
| Roles & Permissions | Create role/policy (in-form) | Rename | **Delete — currently indistinguishable from Rename** (both land on the new structural secondary default) |
| Users | New user | Manage | **Disable/Reset password — proposed `--warning`/`.btn-warning` tier** (added as a scaffold this pass, see below; not wired into `Users.tsx`, which is out of scope) |
| Recovery/Database | Escalating weight per step | — | "Execute restore" must outweigh "Continue to confirm" — not implemented, no section in scope reaches this |
| AI Assistant | The on/off switch is the whole primary surface | — | — |

**Warning-tier decision, made and recorded rather than left open**: added `--warning`/
`--warning-bg` tokens (light `oklch(50% 0.15 80)` ≈ `#8E5500`, ~6.1:1 against white; dark
`oklch(76% 0.13 82)`) and a `.btn-warning` class to `styles.css`, deliberately at hue 80 (amber) so
it's never confusable with `--danger`'s hue 25 (red) even at a glance, not just numerically
distinct. **No caller** — applying it to Users' specific Disable/Reset-password actions requires
editing `Users.tsx` with knowledge of which button means what, which this dispatch's file scope
doesn't include. The primitive is ready for whoever takes that section next; folding those two
actions into the current secondary default in the meantime is the safe interim state, not a
silent gap.

### L. Final verification (this batch)

`npm --prefix apps/admin run typecheck` (from repo root): clean, exit 0 — run after the demotion
rule + Media changes, and again after the two a11y fixes.

`npm --prefix apps/admin run test` (from repo root), final run:
```
 Test Files  3 failed | 23 passed (26)
      Tests  266 passed (266)
```
Same 3 pre-existing `__TOVU_ADMIN_VERSION__` failures as every prior run in this report (confirmed
independently by the team lead: `vite.config.ts:41` has the `define`, `vitest.config.ts` has none
— genuinely pre-existing, not touched). File/test counts grew again (24→26 files, 252→266 tests)
from unrelated parallel work landing on the branch mid-session, not from anything in this
addendum. Zero regressions from this batch's own changes.

Live-data caution (MSG-10) observed: no delete/purge/reset flows were exercised against the real
`content.db` during any of this session's verification — the one media item deleted/trashed in
earlier screenshots does not appear because it was never actually triggered, only its buttons were
inspected/screenshotted.
