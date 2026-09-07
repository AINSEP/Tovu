# Admin UI visual polish — 2026-09-06

Agent: Web Design(Execution). Branch `restructure/apps-website-phased`. Dev admin `https://localhost:5173`.

Screenshots live in `ADS-memory/.local-artifacts/admin-visual-polish/` (gitignored, like every other
screenshot set under `.local-artifacts/`). Naming: `before-<screen>-<width>.png` / `after-<screen>-<width>.png`,
widths 1440 and 1280, full-page.

Written incrementally — sections below are appended as each concern lands.

## Baseline (before)

Captured at 1440 and 1280 for: `roles-policies`, `source-control`, `workspace`, `redirects`,
`database-timeline`, `sites-all`, `media`, `settings`.

Measured facts that shaped the decisions (live `getBoundingClientRect`/`getComputedStyle`, not read off the rules):

- The content column (`.admin-content`) is 1380px wide at 1440 with 40px side padding → a 1300px page column.
- Roles → Policies: `form.notice.integrations-form` is 1300px wide; its inputs are capped at 28rem (448px) by
  `.integrations-form label { max-width: 28rem }` → ~820px of dead box to the right.
- Workspace: `.workspace-page { max-width: 42rem }` (landed 2026-08-31, `c1886096`) already caps the page at
  672px, but the inputs inside stay at 448px and the Workspace ID / Created chips stack vertically because
  `.integrations-form { align-items: flex-start }` shrink-wraps the `auto-fit` grid to one column. So the box is
  still a third empty and the owner is right to flag it even after that cap.
- Redirects: the add form is a bare `form.card` (1300px) holding a 4-up `.field-row`; "Bulk import" is a
  `details.notice` 1300px wide around one word.
- Database → Timeline: `form.notice.database-filter-bar.toolbar`, 1300px, five controls that need ~815px.
- Source Control: `.source-control-rows` accordion rows run the full 1300px; the expanded token input is 1226px.
- Sites → All: `.site-card` 192×192; the head band is `--primary-dim` (burnt-orange at 10% → reads blush) under a
  green `Serving now` pill; the body stacks the name, a second amber `Not initialized` pill, and a disabled
  `Serve after restart` button painted by the global `button:disabled` peach tint.
- Media: `.media-tabs` is its own pill row (`media.css`, 2026-08-08) predating the shared `components/TabBar`
  (underline + optional icon) every other tab row now uses. No icons.
- Settings: `.jini-tabbed-dialog--inline` carries `border: 1px`, `border-radius: 8px`, `overflow: hidden`, and
  `--jini-bg-elevated` (`#fffefc` when `data-theme` is unset — the `settings.css` cream fix is scoped to
  `[data-theme="light"]`, so with the setting on `system` the cream is still there). Content is inset 24px
  (`--jini-modal-padding`) from the panel edge → header at x=125 vs x=100 on every other screen.
  `data-theme` was `null` (setting = `system`) in the verification browser, which renders light.

## 1. Long cards — the shared form measure

**Decision (one, applied everywhere):** a single-column form surface takes `--form-measure: 42rem` via one
utility class, `.form-measure`, and its controls fill that measure. Tables, grids and banners keep the full
column. The one flagged surface that is a toolbar rather than a form column (Database › Timeline's filter
bar) hugs its own row (`width: fit-content`) — same principle, "a box no wider than what it holds", for
controls that already have intrinsic widths.

Why 42rem and not a new number: it is the measure the owner has already accepted on the two screens she asked to
fix most recently (`.workspace-page`, 2026-08-31; `/admin/seo`'s `--seo-measure`, 2026-09-06), and it sits in
the 40–46rem band every other deliberate form column here uses (`.onboarding`, `.access-tokens-row`,
`.settings-ui-section--page-flow`). A token so the screens cannot drift apart again; `.workspace-page` now
reads the token instead of its own literal.

Why a definite measure and not `fit-content`: `.integrations-form label` is `width: 100%`; a percentage in a
shrink-wrapped parent resolves against the children, so a fit-to-content box collapses to the input's intrinsic
~11rem. The container has to be the definite thing and the controls fill it.

Why controls fill (the 28rem input cap is lifted inside a measured form): a 42rem box around a 28rem input is the
same complaint at two-thirds scale — and Workspace was already exactly that when the owner flagged it.

Why `.field-row` goes two-up inside the measure: the shared `minmax(10rem, 1fr)` packs three columns into the
624px that remain and orphans Redirects' fourth field beneath them; `minmax(14rem, 1fr)` gives two 19rem columns.

Why not cap `.card`/`.notice` themselves: neither is "the form primitive" — both also wrap tables, banners and
side-by-side grids that want the whole column. The five screens render through four different containers
(`.notice.integrations-form`, `form.card`, `details.notice`, a per-tab wrapper), so the shared thing is the class
+ token, applied at each site.

Files: `apps/admin/src/styles.css` (token, `.form-measure` block, `.database-filter-bar`), `Roles.tsx` (both
create forms), `Workspace.tsx`, `Redirects.tsx` (add form + Bulk import), `ProvidersTab.tsx` (`.source-control-tab`).

Verified live (1440 and 1280): `.form-measure` = 672px on Roles/Policies, Workspace, Redirects, Source Control;
inputs 638px (598px inside the indented Source Control row); Workspace's ID/Created chips now side by side
(grid 638px); Redirects' four fields render 2×2 (303px each); Database filter bar 818px on one line.
Screenshots: `after-{roles-policies,source-control,workspace,redirects,database-timeline}-{1440,1280}.png`.

Tests: `env -u TOVU_ADMIN_PASSWORD npx vitest run` over Roles, Workspace, Redirects, SourceControl, Database unit
suites — 8 files, 184 tests, all passed. ESLint on the four TSX files: 0 errors (2 pre-existing warnings on
lines this pass did not touch).

Commit: `645f3221`.

## 2. Sites card — the head is the status strip

Commit: `fe0046dd`. Files: `styles.css` (appended "Sites — the card's status strip" block), `AllSitesTab.tsx`
(a glyph inside the existing flag span), new `sites-visuals.tsx` (`SiteFlagIcon`).

What was wrong, measured: the head band was `--primary-dim` (burnt orange at 10% → the blush) under a GREEN
`status-ok` pill — two colors making one statement and disagreeing; the "Not initialized" footnote rendered in the
same `.status` pill chrome as the state badge, so the two read as competing states; the disabled Activate button
was painted by the global `button:disabled` peach tint.

Redesign (visual only — same two facts from the same two functions, same words, same `title` tooltip, same
button and agent handle):
1. The head IS the status strip: the state badge keeps its tone class but drops the pill fill/padding and gains a
   `currentColor` dot; the band takes the tone (`--ok-bg` serving / `--warning-bg` pending restart / `--surface-2`
   otherwise). One statement, one color.
2. The registration flag is a footnote, not a peer: a small warning-colored line with a triangle glyph, no pill.
   Icon + text keeps the meaning off color alone.
3. The disabled Activate button goes quiet: transparent, faint text, hairline border — the same treatment the
   Deployment action rows already use for "this does not apply to this card".

Deliberately NOT changed: the 12rem square tracks and the name-in-body layout (both owner decisions from
2026-09-05), the button's presence on the serving card (removing a rendered control is a behavior/agent-contract
change, not styling), and any copy.

Verified live: head `--ok-bg` (`oklch(0.93 0.05 150)`), badge transparent with `--ok` text, flag transparent
with `--warning` text, button transparent with `--faint` text; card 203×203 at 1440, 215×215 at 1280.
Screenshots: `after-sites-all-{1440,1280}.png`, `after-site-card-zoom.png`. Tests: Sites suites (part of the
14-file / 205-test run with Media) all passed.

## 3. Media tabs — shared `TabBar`, with icons

Commit: `26985a2d`. Files: `Media.tsx` (renders `<TabBar>`), new `Media.hooks.tsx` (`resolveMediaTabs`,
`resolveMediaTabChange`, four icons — the `Roles.hooks.tsx` shape), `use-media-tabs.hooks.ts` (`resolveActiveTab`
exported, unchanged), `media.css` (retired `.media-tabs`/`.media-tab` rules removed with a note).

Media's strip was the last one in the admin not drawn by `components/TabBar` — an inline pill row from
2026-08-08 that predates the shared primitive. Migrating it (rather than bolting icons onto the pill row) is what
"match that" means: the row is now identical in idiom to Roles, Source Control, Database, Sites, Themes, Pages.

Nothing behavioral moved: same `MEDIA_TABS` source, same ids/order/translated labels, same `?tab=` deep-linking,
and the per-tab agent handles are byte-identical (verified on the rendered DOM:
`data-agent-element=media-tab-<id>`, `data-agent-role=button`, `data-agent-label="Switch to the <label> tab"`).

Verified live at 1440 and 1280: four `role=tab` buttons, each with a `.tab-bar-icon svg`. Screenshots:
`after-media-{1440,1280}.png`, `after-media-tabs-zoom.png`. Tests: Media suites all passed (14 files / 205
tests with Sites). ESLint: 0 errors (1 pre-existing warning at `Media.tsx:200`, untouched). `tsc --noEmit` for
`apps/admin` reports 5 pre-existing errors, all in test files this pass did not touch
(`users/__tests__/use-users`, `widgets/__tests__/use-widgets-library`, `lib/__tests__/api-endpoint-option-branches`);
none in any file changed here.

## 4. Settings — out of the card (light rendering)

Commit: `9f13f0e3`. File: `apps/admin/src/styles/settings.css` only.

What the card was, measured: `.jini-tabbed-dialog--inline` (Jini's `SettingsDialogShell` in inline mode) with a
1px border, 8px radius, `overflow: hidden`, `--jini-bg-elevated` fill, and a further 24px (`--jini-modal-padding`)
inset on the head, the tab strip and the content — kicker at x=125/y=62 vs x=100/y=39 on every other screen.

Change: the same four-property chrome removal `styles.css`'s "Flat variant" already applies to the AI Assistant tab
(`background: transparent; border: none; border-radius: 0; box-shadow: none`) plus `overflow: visible`, the head's
padding → `0 0 12px`, `padding-inline: 0` on the tab strip, the content's inset → a 4px scroll gutter
(`padding-inline: 4px; margin-inline: -4px`, so Jini's `outline-offset: 2px` focus rings are not clipped by the
content's own `overflow: auto`), and the chrome (save status + "Open as dialog") at the column's top-right.
Applied in `settings.css` rather than by adding `--page-flow` to `SettingsUi.tsx`, because that modifier also
releases the fixed height and hides the head — and the head IS this screen's page header.

**Scoped to the light rendering, deliberately.** `core.appearance.theme` themes this panel; in dark, light-on-dark
text needs its dark ground, so de-carding there is a theming decision — (a) a borderless dark rectangle still
floating on the page, or (b) the dark ground bleeding across the whole content column, which changes what
"Dialog appearance" scopes. Per the dispatch I raised it to the coordinator (message sent before this commit)
and left dark untouched. "Renders light" is written the way `tabbed-dialog.css` resolves it: `data-theme="light"`
explicitly, or no `data-theme` (`system`) under `prefers-color-scheme: light`; each rule is duplicated once per
branch because a media query cannot join a selector list.

Adjacent, same file and mechanism: the cream `--jini-bg-panel`/`--jini-bg-elevated` re-point from the earlier
peach fix was scoped to `data-theme="light"`; with the setting on `system` (what the verification browser had —
`data-theme=null`) the shell still measured `#fffefc`. Now also covered for system-on-light, since with the box
gone those cream cards would sit directly on the page's white. Jini declares both tokens on `:root` for that
case, so a declaration on the section inherits past it.

Verified live at 1440 and 1280: shell `border 0`, `radius 0`, `bg transparent`, `overflow visible`; kicker and
`h2` at x=100 (y=37); first tab at x=100; content box at x=96 with 4px padding so the segmented control and the
first agent card sit at x=100; agent card fill `oklch(1 0 none)` (the cream is gone); chrome at right edge x=1400
/ 1240. **Dark left as-is, verified**: with `prefers-color-scheme: dark` emulated and `data-theme` unset, the
shell still measures `border 1px`, `radius 8px`, fill `rgb(42, 40, 37)`, `overflow hidden`, kicker at
x=125/y=62 — Jini's own values, unchanged. Screenshots: `after-settings-{1440,1280}.png`,
`after-settings-system-dark-untouched-1440.png`. Tests: SettingsUi, settings rules, styles suites — 3 files,
58 tests, all passed.

## Adjacent instances (same defects, screens the owner did not list)

- **Users and Integrations create forms** — same `.notice.integrations-form` 1300px box; both sit behind a
  "New user" / "Add webhook" toggle so they were not in the screenshots. `form-measure` added to both.
  Verified with each form open: 672px box, 638px inputs. Users + Integrations suites pass.
- **Database and Sites tab rows** — the brief named Database as a row that already had icons; it did not, nor
  did Sites. After the Media pass these were the last two bare `TabBar` rows. Icons added
  (`database-visuals.tsx`, `sites-visuals.tsx`, wired in `Database.tsx` and `resolveSitesTabs`). Verified: every
  tab renders a `.tab-bar-icon svg`. Database + Sites suites pass. Screenshots:
  `adjacent-after-{users,integrations}-1440.png`, `adjacent-after-{database-tabs,sites-tabs}-zoom.png`.

Combined test run for these: 17 files, 277 tests, all passed. ESLint: 0 errors; 3 pre-existing warnings on
untouched lines (`Database.tsx:64`, `Users.tsx:674`).

## Chose NOT to touch, and why

- **Settings in dark** — see §4; a theming decision the dispatch said to stop on. Raised to the coordinator
  with two concrete options; no answer had arrived by the time this report closed.
- **`.card` / `.notice` primitives and `.page`** — capping them would reach tables, banners and side-by-side
  grids that want the full column (~39 `.page` call sites).
- **Empty-state cards** (`.card > .empty-state` at full width on Integrations, Roles, Redirects, Database) — a
  different idiom from the flagged form boxes; not flagged, so left alone.
- **De-carding the five form surfaces outright** (the `/admin/seo` treatment from earlier today) — the owner
  framed item 1 as a width problem and offered two remedies (a measure, or two columns); removing frames is a
  third, larger change and was not asked for.
- **The Sites card's 12rem square, name-in-body layout, and the always-rendered Activate button** — all
  owner decisions from 2026-09-05, or a behavior/agent-contract change rather than styling.
- **Copy** — no string changed anywhere; every i18n key is intact.
- **The inline row editors** inside the Users table and the Roles policy-permission row (also
  `.notice.integrations-form`) — they live inside a table cell and take the cell's width; not the same defect.
- **Pre-existing `tsc` errors** in `users/__tests__/use-users`, `widgets/__tests__/use-widgets-library`,
  `lib/__tests__/api-endpoint-option-branches` — untouched test files, not from this pass.

## Commits (one per concern, each reverts independently)

| SHA | Concern |
|---|---|
| `645f3221` | Shared form measure — token, `.form-measure`, Roles/Policies, Workspace, Redirects, Source Control, Database filter bar |
| `fe0046dd` | Sites card — head as status strip, flag as footnote, quiet disabled Activate |
| `26985a2d` | Media tab strip — shared `TabBar` with icons |
| `9f13f0e3` | Settings out of the card (light rendering only; dark untouched) |
| `bc22ff14` | Adjacent: form measure on the Users and Integrations create forms |
| `933c69e9` | Adjacent: icons on the Database and Sites tab rows |

Not pushed; no PR opened. Nothing was left unverified in the browser except the dark-mode Settings variant,
which was deliberately not changed (and was verified unchanged under a dark color-scheme emulation).

## 4 (addendum). Settings — owner's decision: pinned to light, fully de-carded

Commit: (see the commit list below). Files: `SettingsUi.tsx`, `rules.ts`, `__tests__/rules.unit.test.ts`,
`styles/settings.css`.

The coordinator relayed the owner's call: **take dark mode off the Settings page entirely** — neither (a) nor (b)
from §4. So `data-theme` on the wrapper is a literal `"light"` again (it had been pinned before, then made to
follow the setting once `reconcileDefinitionDefault` fixed the stuck default; this is the third, deliberate flip and
the comment block now records all three). The de-card is one unconditional treatment; the `prefers-color-scheme`
branch and its token re-point from `9f13f0e3` are gone. `resolveDialogDataTheme` and its two tests are deleted —
nothing calls it, and a resolver documented as driving the panel's theme would be a false comment.

Verified live at 1440 under BOTH a light and a dark OS color scheme: identical result — `data-theme=light`, shell
`border 0 / radius 0 / bg transparent / overflow visible`, kicker at x=100, y=37. Screenshots:
`after-settings-pinned-1440.png`, `after-settings-pinned-dark-os-1440.png`.

**Consequence the owner must decide on (not implemented here):** the "Dialog appearance" tab's **Dark** and
**System** options now save but change nothing — on this page or in the "Open as dialog" overlay. They are a dead
control. Recommendation: **remove the two options from that tab** (keep the accent-color control, which still
works), rather than disabling them — a disabled option implies a coming state, and an admin-wide dark mode is
explicitly out of scope; if one is planned, leave them and add a one-line note under the control. Either way the
tab's own copy ("Theme and accent color for this settings surface") is now half true and is an i18n key, so it
should change with the decision, not before it.

**Scoping defect in my own `9f13f0e3`, found on re-read and fixed here:** its selector keyed on
`.settings-ui-section[data-theme="light"]`, and five screens share that wrapper + attribute (Settings, Agent
Plugins, Authentication, `PlaceholderTabs`, AI Assistant). It had de-carded all five. The rules now key on a
Settings-only class (`settings-page`, added to the wrapper in `SettingsUi.tsx`). Verified live: Agent Plugins and
Authentication are back to Jini's own card (`border 1px`, `radius 8px`, kicker x=125); AI Assistant is on its own
`--page-flow` flat variant as before. Screenshots: `scope-check-{agent-plugins,authentication,ai-assistant}-1440.png`.

The measurements the coordinator asked to keep verbatim: `.jini-tabbed-dialog--inline` — `border: 1px`,
`border-radius: 8px`, `overflow: hidden`, `--jini-bg-elevated` fill; 24px (`--jini-modal-padding`) content inset
putting the kicker at **x=125, y=62** against **x=100, y=39** on every other screen. After: x=100, y=37.

| `89c8c380` | Settings pinned to light + full unconditional de-card; scoping defect from `9f13f0e3` fixed; `resolveDialogDataTheme` removed |
| `ea8c660b` | Report addendum for the above |
