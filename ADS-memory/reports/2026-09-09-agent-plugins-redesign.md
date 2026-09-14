# Agent Plugins screen — redesign + live enable/disable toggle

**Agent:** Web Design Agent · **Date:** 2026-09-09 · **Branch:** `restructure/apps-website-phased`
**Surface:** `https://localhost:5173/admin/agent-plugins`

**Commits (3, in milestone order):**

| SHA | What |
|---|---|
| `34640b70` | `AGENT_PLUGIN_SET_ENABLED` route + composition wiring + 7 integration tests |
| `6d80192d` | admin API client, port, hook wiring + 5 hook tests |
| `d63d2cfd` | the visual redesign: rows, icons, switch, eye, uninstall affordance, marketplace state |

---

## Premise corrections up front

Three things in the dispatch were stale by the time I looked. None changed the plan, but the
report should say so rather than repeat them:

1. **Three plugins render, not two.** `site-compliance`, `tovu-deploy-fly`, and `ui-ux-design`.
   The third has no `version` and no `keywords` at all, which is why it was useful — it is the
   real case that proves the row degrades honestly rather than printing placeholders.
2. **`uninstallAgentPlugin()` now exists.** It landed in `features/agent-plugins/uninstall.ts`
   *during* this dispatch, from another agent in this tree. The dispatch said uninstall "only
   becomes real once install-from-url exists"; that is still true, and the new function agrees
   with it explicitly — see the Uninstall section.
3. **`setAgentPluginActivation()` had no production caller at all** before this work — only
   `recordBundledAgentPluginIfAbsent`'s boot seed. So a bundled plugin was stuck at its seeded
   `enabled: false` with no in-app way to turn it on. The toggle is not a nicety; it closed a
   hole.

---

## Before / after

**Before** — three bordered `.jini-settings-section-card`s, each a `<dl>` of stacked
VERSION / STATUS / KEYWORDS label-over-value pairs plus PORTABLE COMPONENTS and MCP SERVERS chip
lists, and a text "Inspect package files" button. **1275px of inner scroll for three plugins**
(measured live: `scrollHeight` 1275 in a 609px viewport). Every field at the same weight, so
nothing could be found by scanning. The owner's verdict was correct.

**After** — one bordered container, hairline dividers, one two-line row per plugin. **~200px.**

```
┌─────────────────────────────────────────────────┬──────────────────────────┐
│▌[shield]  Site Compliance  v1.0.0            ›  │  Enabled  (●══)  👁  🗑  │
│           Evidence-based privacy, cookie/con…   │                          │
├─────────────────────────────────────────────────┼──────────────────────────┤
│ [rocket]  Tovu Deploy Fly  v1.0.0            ›  │ Disabled  (══○)  👁  🗑  │
│           Deploys a Tovu instance to fly.io …   │                          │
└─────────────────────────────────────────────────┴──────────────────────────┘
   ▌ = accent rail, enabled only        ›=expander      │ = summary/action divider
```

Expanding a row reveals PORTABLE COMPONENTS / MCP SERVERS / KEYWORDS as chips, indented to the
row's text column.

**Nothing was dropped.** Every field the cards showed is still on the screen; the row carries what
an operator scans for (state, identity, version) and the rest is one click away.

Row anatomy and why each part is there:

| Element | Decision |
|---|---|
| Left rail | Applied state, signal 1 of 3. A rail rather than a row tint, which would fight the chips in its own expanded panel for contrast. |
| Glyph tile | Identity at a glance. Picks up the accent when enabled, so "on" reads as one state across the row rather than three unrelated details. |
| Name + version chip | Version rendered only when the package carries one — both are optional in the spec, and an invented `1.0.0` is worse than an absent chip. |
| Description | Clamped to one line. Four-line paragraphs per row are what made the cards unscannable. |
| Expander | **The row summary itself**, not a separate chevron. A fourth hit target would compete with the three real controls. |
| Divider | Added after seeing it rendered: without it the chevron read as a control floating between the description and the switch, belonging to neither. |
| State word | Signal 2 of 3, fixed-width so the switch column does not shift between an Enabled and a Disabled row while scanning. |
| Switch | Signal 3. Terracotta `--jini-accent`, the same token the active tab underline already uses for "active" — visual rhyming, not a new green. |

**Measure widened 46rem → 58rem.** 46rem was measured for a *card*, whose controls sit under its
text. A row carries its controls to the right, and at 46rem the action cluster squeezed the
description into a two-line wrap on exactly the packages with the longest descriptions.

---

## The six asks

1. **Out of the card layout** — done, above.
2. **Tab icons** — `TabbedDialogTab` already accepts `icon: ReactNode`, and the admin's inline
   tab-strip CSS already reserved the cell (`grid-template-columns: auto auto`, plus an
   `.active svg { opacity: 1 }` rule). Two props, zero CSS.
3. **Per-plugin icons** — derived from the package's own vocabulary in **tiers** (id → keywords →
   skill names), never an id allowlist; an allowlist is exactly what `AGENT_PLUGINS_LIST` just
   replaced. **The tiering is load-bearing.** My first version merged all three into one bag and
   put the same shield on `site-compliance` and `ui-ux-design`, because the latter bundles a
   `frontend-accessibility` skill — the two rows the list most needs to tell apart rendered
   identically. Caught by looking at it rendered, then pinned with a regression test that asserts
   the three real packages get three *different* glyphs as a set (three separate equality
   assertions would pass against three identical-but-plausible glyphs).
4. **Enable/disable switch** — real, wired end to end. See the next section.
5. **Eye → existing modal** — reuses `AgentPluginDetailsModal`; no second modal. It replaced the
   text button and **kept that button's accessible name verbatim**
   (`Inspect package files — {name}`), so the three inspector tests are unchanged across the
   redesign, and the translated `Inspect package files` key (21 locales) survives.
6. **Marketplace empty state** — a designed nothing: glyph, headline "Nothing to browse yet", the
   same honest sentence about not fetching/installing/listing, and the one real destination it can
   offer (the format spec) on its own line. No mocked listings. A test asserts no switch and no
   Install/Enable/Run control got smuggled in with the artwork.

---

## The toggle, end to end

`PATCH /api/admin/v1/workspaces/:workspaceId/agent-plugins/:pluginId`.

**It is a real gate.** `resolveAgentPluginRefs()` re-reads `activations.json` on every run and
refuses a run pinning a disabled plugin; the dynamic per-plugin tool loader filters through the
same record. Both reads are fresh per call, so a toggle lands on the next assistant run with no
daemon restart (verified by reading those call sites, then by driving the real function in a test).

**Two deliberate divergences from `routes/plugins/set-enabled.ts`**, both documented in the new
file's header:

- **No `executeCommand` wrapper.** That family's activation is a DB row with a repo and a
  `plugin-activation` entity type, so it has a meaningful change-set/outbox/rollback story. An
  Agent Plugin activation is one small JSON file written atomically, with no repo, no entity type,
  and no inverse beyond the prior boolean the file already holds. **The cost is stated, not
  hidden:** this mutation does not enter change-set history and is not revertible through the
  admin's undo surface. Its audit trail is `activations.json`'s own `updatedAt`/`updatedBy`.
  Authorization is unchanged — `admin.plugins.enable`, checked explicitly via `authorizeOrRespond`.
- **`enabled` is validated, not coerced.** That route's `Boolean(req.body?.enabled)` turns an
  omitted or `"false"` value into a silent disable. For a flag whose off-state refuses runs, that
  is a 400 `VALIDATION_ERROR` here.

An id not actually installed is 404 `AGENT_PLUGIN_NOT_FOUND` and writes nothing, so no activation
record can be minted for a plugin that does not exist.

**Client shape** — the route answers with the single updated row in `listAgentPlugins`' exact
shape, so the hook replaces one entry rather than re-fetching. That also removes a stale-settlement
window the sibling screen's `reload()`-after-PATCH has. Row replacement uses `setAgentPlugins`'
functional updater, not the array the render closed over.

**No optimistic flip.** The switch only ever shows a server-confirmed position, because an
optimistic "on" for a plugin the server refused is a lie the operator would act on. In-flight state
is a `Set` of ids, not the sibling's single `rowSavingId`, so toggling a second row cannot
re-enable the first row's switch mid-request.

**Browser verification** (the real dev admin, real API, real file):
- Flipped `tovu-deploy-fly` ON → `sites/tovu-com/agent-plugins/ws/workspace-local/activations.json`
  became `"enabled": true`, `"origin": "bundled"` preserved, `updatedBy` the authenticated
  principal's UUID, fresh `updatedAt`.
- Full page reload → still Enabled.
- Flipped it OFF → file back to `"enabled": false`. **Workspace left exactly as I found it.**

---

## Uninstall — how I handled it

**An affordance in the row, honestly disabled**, with the reason in the accessible name
(`Uninstall Site Compliance — unavailable`) and in a section-level note every row points at via
`aria-describedby`. A disabled control is not focusable, so a per-row tooltip would never be read
by a keyboard or screen-reader user; the visible note is the accessible channel. Styled
`cursor: default`, not `not-allowed` — a "no" cursor invites the click that produces nothing.

**This is stronger than a judgment call now.** `uninstallAgentPlugin()` landed in this tree during
this dispatch and **refuses any package whose activation record says `origin: "bundled"`**, with
`AgentPluginNotUninstallableError` — precisely because `recordBundledAgentPluginIfAbsent` re-seeds
it on the next boot, so a delete would appear to succeed and silently reappear. Its own header
names *this screen's enable/disable switch* as the lever an operator actually has for a bundled
package. Every installed package today is bundled (`installAgentPluginFromUrl` exists but has zero
production callers, so nothing can arrive as `operator-installed`), and there is still no HTTP
uninstall route — the only wrapper is an assistant tool. **A live button would refuse on every row
that exists.** It becomes real when an install-from-url path ships.

I wrote a comment in `AgentPluginRow.tsx` claiming no `uninstallAgentPlugin` existed at all. That
was true when written and false an hour later; it is corrected in `d63d2cfd`.

---

## Accessibility — decided, not defaulted

- **Applied state has three signals, never colour alone**: `aria-checked`, the visible
  Enabled/Disabled word, and the left rail.
- **The summary button's accessible name is `aria-labelledby` the heading.** Caught by reading the
  rendered accessibility tree: it was otherwise the *entire 60-word manifest description*, read
  aloud on focus. The description stays visible and browse-reachable, just out of the name.
- **The `{" "}` between name and version chip is load-bearing.** Accessible-name computation
  concatenates adjacent inline elements with no separator and ignores flex `gap`, so it announced
  "Site Compliancev1.0.0". Found by a failing test, fixed in the markup rather than by loosening
  the assertion.
- **The detail panel is always rendered and toggled with `hidden`**, so `aria-controls` always
  resolves — with the explicit `[hidden] { display: none }` guard that `.cms-section-items[hidden]`
  already documents in this stylesheet (a `display` rule on the element outranks the UA sheet's).
- `role="switch"` for assistive tech; `agentHandle` role `checkbox`, because
  `AgentElementRole` has no `switch` member and `checkbox` is the two-state control a page driver
  already knows how to flip. Two different vocabularies, both correct.
- Visible `:focus-visible` ring on every control; every transition stops under
  `prefers-reduced-motion`.

---

## Other changes worth flagging

- **`humanizeAgentPluginId` now uppercases acronym segments** (closed list, not a heuristic). The
  screen read "Ui Ux Design" — a name to decode rather than recognize, on the one screen whose
  whole job is recognition. Now "UI UX Design".
- **`AgentPlugins` was split** into `InstalledPanel` / `AgentPluginsStatus` / `AgentPluginList` /
  `MarketplacePanel`. As one function it measured **complexity 13** against the ceiling of 9.
- **The installed panel's lede is no longer `.settings-ui-inert-note`.** That dashed grey box means
  "this control does nothing yet" everywhere else in this admin, which is now the opposite of true
  on this screen.
- **Icons are inline SVG** on the established `*-visuals.tsx` pattern (shared `LINE_ICON`, 24px
  grid, 1.5 stroke, round joins), matching `database-visuals.tsx` / `source-control-visuals.tsx`.
  **No icon dependency added**, so no Vite cache clear needed.
- **Removed CSS classes** (`.agent-plugin-meta`, `.agent-plugin-skills*`,
  `.agent-plugins-format-note`) have **zero remaining source references** — verified; the only hits
  are in a stale `apps/admin/dist/` build artifact.

---

## Tests — exact commands, file counts, pass/fail

**Website route tests** (from repo ROOT; `env -u TOVU_ADMIN_PASSWORD` or `loginAsOwner` 401s):

```
env -u TOVU_ADMIN_PASSWORD node --import tsx --test --experimental-test-module-mocks \
  "apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled.integration.test.ts" \
  "apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugins-http.integration.test.ts"
```
**2 paths → 10 tests, 10 pass, 0 fail.** 7 are new (`agent-plugin-set-enabled`), 3 pre-existing
(`AGENT_PLUGINS_LIST`), still green.

**Admin tests** (from `apps/admin`):

```
cd apps/admin && env -u TOVU_ADMIN_PASSWORD npx vitest run src/features/plugins/__tests__/
```
**12 files → 98 tests, 98 pass, 0 fail.**

The three files this work owns:

| File | Tests | New |
|---|---|---|
| `AgentPlugins.unit.test.tsx` | 16 | rewritten (was 6) |
| `use-agent-plugins.hooks.unit.test.ts` | 9 | 5 new |
| `agent-plugin-rules.unit.test.ts` | 9 | new file |

**Type checks:**
- `cd apps/admin && npx tsc --noEmit` → **0 errors** (baseline held; admin tsc does check test files).
- `npx tsc -p tsconfig.json --noEmit` (website/root) → **0 errors**.

**Complexity gate:** `npm run check:admin-complexity-drift` → **zero new violations from this
work**. Four remain (`media/Media.tsx`, `media/rules.ts`, `pages/hooks/use-page-editor.hooks.ts`,
`themes/hooks/use-theme-explore.hooks.ts`) — all in files this change never touches, all unmodified
in `git status`, i.e. pre-existing tree debt.

**Both mutations were proven RED, not assumed:**
- Removing the route's `setAgentPluginActivation` call → **3 of 7** route tests fail (the three
  write-path ones); the four guard tests correctly stay green.
- Replacing the hook's functional updater with the closed-over array → **exactly** the
  out-of-order-settlement test fails, 8 others green.

Both mutations were reverted from a scratchpad backup and the suites re-run green.

---

## One assertion I deliberately inverted

`AgentPlugins.unit.test.tsx` used to assert the screen offered **no** `Enable` control at all. That
was correct while the screen was read-only and is now exactly wrong. I replaced it with assertions
that the switch exists, reports server state, and calls the controller — and **kept the other half
verbatim** (no `Install`, no `Run`), because that half is still true. Flagging it explicitly rather
than letting a silently-deleted assertion pass for a green suite.

---

## Left undone / not mine

- **Sentence-length new copy is untranslated** and falls back to English. I added the three new
  single-word keys (`Disabled`, `Uninstall`, `unavailable`) plus `failed to update agent plugin`
  across **all 21 locales**, and renamed/removed **no** existing translated key. But I did not
  machine-translate ~8 new sentences × 21 locales unreviewed — that would be 168 unverified strings
  in a 34KB dictionary. Every other sentence on this screen is already English-only, so this is
  consistent with the file's current state, not a regression. **Wants a translation pass.**
- **No `origin` on the wire.** `AGENT_PLUGINS_LIST` does not return the activation record's
  `origin`, so the UI cannot distinguish bundled from operator-installed. Adding it is a one-field
  change to `list.ts` — outside the server files this dispatch authorized me to write. **It is the
  prerequisite for making uninstall conditionally live** rather than uniformly disabled.
- **No uninstall HTTP route.** `uninstallAgentPlugin()` is reachable only as an assistant tool. The
  admin cannot call it.
- **Dark mode.** The screen stays pinned `data-theme="light"`; I designed for light as instructed
  and did not touch the theme system. Pre-existing note in `styles.css` about `.btn-secondary`
  leaking a root-dark value into this light-pinned island is now moot for this screen — the button
  it referred to is gone.
- **The 4 pre-existing complexity violations** listed above.
