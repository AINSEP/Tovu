# UI Contract Spec: Plugin System — Admin Plugins List + Enable/Disable Screen (1.1.0 amendment)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/ui.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-005 |
| feature_name | FEAT-005-plugin-system |
| version | 1.1.2 (adds REQ-18's per-row trust-tier badge, resolving Red-Team finding RT-010 — see feature.spec.md's `revision_note`; all other content byte-unchanged from 1.1.0) |
| content_hash | sha256:see feature.spec.md (package hash of record) |
| last_edited | 2026-07-28T00:00:00Z |

**Added in the 1.1.0 amendment** (this file did not exist in v1.0.0 — it was OMITTED, tracked as
OQ-02). It resolves OQ-02 for the list+enable/disable slice only. See `feature.spec.md`'s
`revision_note` for the full amendment rationale.

**Added in the 1.1.2 amendment:** §3.1's loaded-state shape and §5's rendering rules gain REQ-18's
per-row trust-tier badge, consuming REQ-10's new additive `tier` field. This resolves RT-010
(`reports/pipeline/005-plugin-system/red-team-findings-v1.1.1-amendment.md`) — the disclosed
ambiguity over whether the `plugin.tier` field (added to REQ-01 at 1.1.1) should be operator-visible,
given ADR-024 §1's stated purpose for it is exactly that. Owner decision 2026-07-28: show it.

## Purpose

Defines the UI component contracts, interaction events, rendering conditions, and accessibility
requirements for the admin **Plugins** screen: a list of every discovered plugin (REQ-12) with a
per-row enable/disable toggle (REQ-13), an empty state (REQ-14), loading/error states (REQ-15),
inline per-row error display (REQ-16), the nav/routing wiring that makes the screen reachable
(REQ-17), and a per-row trust-tier badge (REQ-18, **1.1.2**). Every requirement below cites its
`feature.spec.md` REQ/AC. This file consumes REQ-10's already-approved `PLUGINS_LIST` /
`PLUGIN_SET_ENABLED` HTTP contract (`api.spec.md` §1/§4/§5) as a black box at 1.1.0/1.1.1; **1.1.2**
extends that contract with exactly one additive field, `tier` (§3.1), consumed by REQ-18 — it invents
no other new backend surface and no config-surface display (see §9 for why the `capabilities` array
and any config surface remain explicitly out of scope here).

---

## 0) UI Conventions Baseline (mirrored, not invented)

Per this amendment's scope limits (a Spec Agent may not invent new visual direction — see
`AI-Dev-Shop/skills/spec-writing/SKILL.md`'s brownfield Rule 2: existing codebase patterns are
constraints, not subjects), every component below is specified against conventions already shipped
elsewhere in `apps/admin/src/`, cited by file:

| Convention | Source | Applied to |
|---|---|---|
| List screen: `<table className="list-table">`, `<div className="notice">…</div>` / `<div className="notice error">…</div>` loading/error states, `"No … yet."` empty-state notice, plain `useState`/`useEffect` + a thin `api` client wrapper (no state-management library) | `apps/admin/src/sections/Roles.tsx`, `apps/admin/src/sections/Redirects.tsx` | §2.1 `Plugins` |
| Status badge: `<span className="status status-${status}">{status}</span>` | `Redirects.tsx` (`rule.status`), SPEC-043 `ui.spec.md` §5 (`WidgetInstanceRow`) | §2.2 `PluginRow` |
| Toggle-as-single-button: one button per row whose **label** reflects the action to take (`"Enable"` / `"Disable"`), not a checkbox/switch widget | `Redirects.tsx`'s `toggleStatus` button | §2.2 `PluginRow`, §4.2 |
| Row-scoped in-flight state (a specific row's control disables and shows an in-flight label while its own request is outstanding; sibling rows stay interactable) | `Roles.tsx`'s `rowSavingId` pattern | §5 |
| Await-then-reload mutation flow: call the API, await the result, on success re-fetch the full list from the server (the server response is the source of truth); no local speculative pre-flip of the mutated field ahead of confirmation | `Roles.tsx` (`onDeleteRole`, `onSaveRole`, …), `Redirects.tsx` (`toggleStatus`, `removeRule`) — **see §9 for why this file does not specify a true optimistic (pre-flip-then-rollback) toggle despite that shape appearing in `009-redirects/state.spec.md`'s aspirational client-action table** | §4.2, §5 |
| Error-message mapping: an `ApiError`-aware helper (`describeApiError`) turning `error.code` into a plain-English sentence, rendered in a shared `.notice.error` banner, not a per-field toast | `Roles.tsx`'s `describeApiError` | §5, §8 |
| Hiding (not just disabling) a control that is already known, from loaded list data, to be guaranteed to fail | `Roles.tsx`: built-in roles/policies show `—` instead of Rename/Delete buttons | §5 (invalid/incompatible rows' Enable control) |
| `nav.ts` entry + `App.tsx`'s `case "section":` ternary-chain dispatch (`route.sectionId === "<id>" ? <Screen /> : …`, falling through to `<Placeholder>` otherwise) | `apps/admin/src/nav.ts`, `apps/admin/src/App.tsx` (`"roles"`, `"redirects"` branches) | §1, REQ-17 |

No new component library, modal system, design token, or interaction pattern is introduced.

---

## 1) Screen / Route Map

| Route | Screen | Notes |
|---|---|---|
| `#/section/plugins` | `Plugins` | The only route this amendment adds. No create/edit sub-route exists — plugins are installed via the filesystem (REQ-02), never through this UI (see §9). |

Wiring (REQ-17):
- `apps/admin/src/nav.ts`'s existing `plugins` `NavItem` (currently `soon: true`, no `href`, in the
  "Design & System" group) gets `href: "#/section/plugins"` restored and `soon: true` removed.
- `apps/admin/src/App.tsx`'s `case "section":` ternary chain gains one new branch —
  `route.sectionId === "plugins" ? <Plugins /> : …` — inserted alongside its existing `"roles"` /
  `"redirects"` branches, so the route no longer falls through to `<Placeholder sectionId="plugins" />`.
- `activeSectionId()` needs no change: the generic `case "section": return route.sectionId;` branch
  already covers any `sectionId`, including `"plugins"`.

---

## 2) Component Registry

| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `Plugins` | Top-level screen: fetches and lists every discovered plugin; hosts the shared error banner | §3.1 | §4.1 |
| `PluginRow` | One row: name/version/source/tier badge/status badge/errors/enabled toggle. A logical unit, not necessarily a separate React component/file — `Redirects.tsx` inlines its equivalent row directly in a `.map()`, and this may be inlined identically | §3.2 | §4.2 |

No `EmptyState`/`ErrorBanner`/`LoadingSkeleton` sub-components are introduced — matching
`Roles.tsx`/`Redirects.tsx`, which render these states as inline conditional JSX (`<div
className="notice">…`), not as extracted components.

---

## 3) Input Contracts (Props/Inputs)

### 3.1 `Plugins` (screen)

| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| *(none — top-level route component, self-loading)* | — | — | — | Mirrors `Roles.tsx`/`Redirects.tsx`'s no-props, self-loading pattern; loads via a new `api.listPlugins()` client function |

Loaded state — **exactly** REQ-10's `PLUGINS_LIST` response shape (`api.spec.md` §5), no
client-synthesized fields added:

```yaml
plugins: array<{
  id: string
  name: string
  version: string            # semver
  source: 'built-in' | 'site'
  tier: 'tier-1' | 'tier-2' | 'tier-3'   # (1.1.2) additive — REQ-10/REQ-18; consumed by §5's badge rule
  status: 'valid' | 'invalid' | 'incompatible'
  enabled: boolean
  errors: array<{ code: string, file: string | null, message: string }>   # empty when valid
}>
```

### 3.2 `PluginRow`

| Input | Required | Type | Notes |
|---|---|---|---|
| `plugin` | yes | one entry of the shape in §3.1 | — |
| `onToggleRequest` | yes | `callback(pluginId: string, nextEnabled: boolean)` | Fired by the row's single toggle control |
| `isToggling` | yes | `boolean` | True only while **this row's own** toggle request is in flight (REQ-13's per-row scoping — see §0) |

---

## 4) Event Contracts (Outputs)

### 4.1 `Plugins` (screen-level)

No create/import/delete events exist for this screen — REQ-02's install path is filesystem-only and
no HTTP endpoint exists for uploading an artifact (`api.spec.md` §1 lists only `PLUGINS_LIST` and
`PLUGIN_SET_ENABLED`); there is nothing for a "create" affordance to call. `Plugins` fetches once on
mount and re-fetches after every successful toggle (§4.2).

### 4.2 `PluginRow`

| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onToggleRequest` | `{ pluginId, nextEnabled }` | The row's toggle button activated | Parent calls `api.setPluginEnabled(pluginId, { enabled: nextEnabled })` → `PATCH …/plugins/:pluginId` (REQ-10/REQ-13). On 200: re-fetch the full list (`api.listPlugins()`) and replace state — the server response is authoritative, never a locally-patched value. On non-2xx: show the mapped error (§8) and leave the row's `enabled` value exactly as it was pre-click (nothing was spec­ulatively changed, so there is nothing to reconcile or roll back — see §9). |

The toggle button is **not offered in an enable-capable form** for a row where
`plugin.status !== 'valid' && plugin.enabled === false` (§5) — so `onToggleRequest({ nextEnabled:
true })` is never reachable for such a row from this UI. A row with `plugin.enabled === true` always
offers a working disable path regardless of `status` (BR-05: disable has no validity precondition).

---

## 5) Rendering and Interaction Rules

- [ ] `Plugins` shows a loading notice — `"Loading plugins…"` — while the initial `api.listPlugins()`
  call is in flight (REQ-15), matching the `"Loading roles & permissions…"` / `"Loading redirects…"`
  convention exactly.
- [ ] If the initial fetch rejects, `Plugins` renders `<div className="notice error">{message}</div>`
  **instead of** a table (REQ-15) — no partial/stale table is shown alongside the error. No dedicated
  retry control is rendered — matching `Roles.tsx`/`Redirects.tsx`, neither of which offers one; an
  operator retries by reloading the page.
- [ ] When the fetch succeeds and returns zero plugins, `Plugins` renders `"No plugins installed."`
  (REQ-14) instead of an empty `<table>`. (Unreachable in practice while `word-count` ships built-in
  per REQ-09 — this rule exists so the contract holds if that ever changes, not because the empty
  case is expected.)
- [ ] Rows render in exactly the order `PLUGINS_LIST` returns them (TB-01: built-ins first by id
  ascending, then site plugins by id ascending) — no client-side re-sort, re-group by `source`, or
  re-order by `status`/`enabled`.
- [ ] Table columns: Name, Version, Source, Tier, Status, Enabled/toggle, Errors (rendered inline
  **only** when that row's `errors` is non-empty — REQ-16 — never a placeholder dash for an empty
  array). **(1.1.2)** Tier sits next to Source (both are static, manifest-declared descriptive
  fields) rather than next to Status (a computed validity signal) — a cosmetic ordering call, not one
  any AC depends on.
- [ ] `status` renders as `<span className="status status-${plugin.status}">{plugin.status}</span>`
  (mirrors `Redirects.tsx`/SPEC-043's badge convention) — color is never the sole signal; the status
  string itself is always the visible text inside the badge (parity with SPEC-043 `ui.spec.md` §6's
  "not conveyed by color alone" rule).
- [ ] **(1.1.2)** `tier` renders as `<span className="tier tier-${plugin.tier}">{plugin.tier}</span>`
  (REQ-18) — mirrors the `status` badge convention immediately above, verbatim: one of `tier-1` /
  `tier-2` / `tier-3` (REQ-01/ADR-024 §1's own vocabulary) is rendered as the badge's visible text,
  color never the sole signal. No new label copy is invented — the literal manifest value already
  frozen by REQ-01 is shown as-is, exactly as `status` and `source` already are, rather than mapping
  it to a paraphrased description (e.g. "Trusted code"). This is the one plugin admin surface that
  exists in v1 for ADR-024 §1's stated install/trust-consent purpose of `plugin.tier` (AC-26).
- [ ] The toggle is a single button per row labeled `"Disable"` when `plugin.enabled === true` and
  `"Enable"` when `plugin.enabled === false` — one control whose label names the action, exactly
  mirroring `Redirects.tsx`'s `toggleStatus` button (not two separate buttons, not a checkbox/switch).
- [ ] While a row's own toggle request is in flight, that row's button is disabled and shows an
  in-flight label (e.g. `"…"`) — **scoped to that row only** (mirrors `Roles.tsx`'s `rowSavingId`,
  a deliberate choice over `Redirects.tsx`'s coarser single global `saving` flag, since freezing every
  row in a potentially-many-plugin list for one row's request is unnecessarily restrictive; picking
  the finer-grained sibling precedent is this file's one small, disclosed UX judgment call — not a
  behavior REQ-13's Given/When/Then depends on).
- [ ] A row where `plugin.status !== 'valid'` (i.e. `'invalid'` or `'incompatible'`) **and**
  `plugin.enabled === false` renders **no clickable control capable of requesting `enabled: true`** —
  mirrors `Roles.tsx`'s "built-in row shows `—` instead of a guaranteed-failing button" idiom: this UI
  already knows from the same list payload that such a request would 422 (`PLUGIN_INVALID` /
  `PLUGIN_INCOMPATIBLE`, REQ-13/AC-21), so it does not offer to send it. Render either a disabled
  button or a muted `—` in the toggle cell — either satisfies AC-21; this file does not mandate one
  over the other.
- [ ] A row where `plugin.enabled === true` **always** renders a working `"Disable"` control,
  regardless of `plugin.status` — BR-05 gates validity only on *enabling*, never on disabling, so a
  plugin that somehow became invalid/incompatible after being enabled must still be disableable from
  this screen (AC-21's second clause).
- [ ] A toggle failure (§8) surfaces in a single shared `.notice.error` banner near the top of the
  table (mirrors `Roles.tsx`'s shared `rowError` banner — the closer structural sibling for a
  many-row admin table with a per-row mutating action — rather than `Redirects.tsx`'s simpler
  single-screen inline error; either placement is defensible, this file picks the shared-banner
  convention for decisiveness, not because the alternative would fail any AC).
- [ ] Each row's own `errors[]` (REQ-16) renders inline **on that row** (e.g. a stacked list of
  `code: message` beneath the row, or an adjacent cell) — distinct from, and in addition to, the
  shared toggle-failure banner above. The two never collapse into one surface: `errors[]` is
  discovery-time validation state for *that plugin*; the toggle-failure banner is the outcome of *the
  operator's last action*.

---

## 6) Accessibility Requirements

| Area | Requirement |
|---|---|
| Semantic roles | Table markup (`<table className="list-table">`) for the plugin list; the toggle is a native `<button>` (matches `Redirects.tsx`, keyboard-operable by default, no bespoke ARIA widget needed for a label-reflects-action button). |
| Labels | The toggle button's visible text (`"Enable"`/`"Disable"`) *is* its accessible name — no separate `aria-label` needed since the label is already unambiguous per row (each row also shows the plugin's `name`, so screen-reader table navigation disambiguates which row a given button belongs to). |
| Keyboard | Full keyboard operation: the toggle button and any row-level error disclosure are plain focusable elements reachable via Tab, matching every existing list screen in this admin app. |
| Status updates | Toggle failure is announced via `.notice.error` with `role="alert"` on the message span — matches the existing `save-error`/`role="alert"` convention used across `Roles.tsx`/SPEC-043 screens, so a failed toggle is announced without a bespoke live-region mechanism. |
| Error clarity | A row's own `errors[]` (REQ-16) is associated with that specific row (rendered inside/adjacent to it), not only summarized in the shared banner — mirrors SPEC-043 `ui.spec.md` §6's "not surfaced only as a single top-of-form banner" rule. |

---

## 7) Composition Rules

- `Plugins` is the only public entry component for this amendment's route (`#/section/plugins`).
- `PluginRow` (or its inlined equivalent) is rendered only within `Plugins`'s table body.
- No dialog, modal, or secondary editor screen exists for plugins in v1 — there is nothing to create,
  edit, or delete through this UI beyond the enable/disable toggle (REQ-02's filesystem-only install
  path, §9).
- This screen never renders a plugin's `capabilities`, `hooks`, `fields`, or any other
  `state.spec.md` §2 `PluginManifest` detail — REQ-10's `PLUGINS_LIST` response does not carry them,
  and this file does not invent a second, undeclared read path to fetch them (§9).

---

## 8) Error and Conflict Handling

Maps every error this screen's two API calls (`api.listPlugins()`, `api.setPluginEnabled()`) can
produce (per `errors.spec.md` §2) to a concrete UI surface:

| Error (HTTP) | Surfaces on | UI treatment |
|---|---|---|
| `PLUGIN_NOT_FOUND` (404) | toggle request | Shared error banner using `errors.spec.md`'s exact guidance: *"No plugin with that id is installed."* The row's `enabled` value is left unchanged; a subsequent successful list re-fetch will simply drop the row (it no longer exists in discovery) — this screen does not special-case that disappearance. |
| `PLUGIN_INVALID` (422) | enable attempt | Shared error banner using the guidance text *"This plugin failed validation and cannot be enabled."*; should rarely be reachable in practice because §5 already hides the enable control for a known-`invalid` row — this is the defensive path for a race (the plugin became invalid between list-load and click). |
| `PLUGIN_INCOMPATIBLE` (422) | enable attempt | Shared error banner: *"This plugin requires a different SDK version."* Same race-defensive framing as above. |
| `PLUGIN_HOOK_FAILED` (500) | *(not reachable from this screen)* | This code is produced only by the content-entry write path (`ENTRY_CREATE`/`ENTRY_UPDATE`, `errors.spec.md` §4), never by `PLUGINS_LIST`/`PLUGIN_SET_ENABLED`. No UI treatment is defined here because this screen cannot trigger it. |
| `VALIDATION_ERROR` (400) | malformed toggle body | Should be unreachable from this UI — the toggle only ever sends `{ enabled: boolean }` (REQ-13). Defensive shared-banner fallback if it somehow occurs, mirroring SPEC-043 `ui.spec.md` §8's `WidgetTypeUnregisteredError` "should be unreachable" precedent. |
| `DUPLICATE_COMMAND` (409) | replayed `Idempotency-Key` | Not reachable from this UI in v1 — this screen does not send an `Idempotency-Key` header on the toggle request (no admin screen in this codebase sends one today; see EC-11/§9). |
| `INTERNAL_ERROR` (500) | either call | Shared error banner with a generic failure message, matching existing convention. |

---

## 9) Disclosed Reading and Scope Notes

**On "optimistic-update" (disclosed reading, not a blocking ambiguity).** The dispatch that produced
this file asked for the toggle's "optimistic-update/error-handling behavior." Two things could be
meant: (a) a literal client-side optimistic mutation — flip `enabled` in local state immediately on
click, then reconcile or roll back on the server's response — or (b) the toggle's overall
in-flight/success/failure behavior, loosely described as "optimistic" in the everyday sense of
"responsive." This file specifies **(b)**, grounded in evidence, not invention:

- Every existing toggle-shaped admin mutation actually shipped in this codebase (`Roles.tsx`'s
  role/policy rename/delete, `Redirects.tsx`'s `toggleStatus`) uses the same pattern: disable the
  control, await the API call, on success re-fetch from the server, on failure show an error with the
  displayed value untouched. None of them pre-flip a value ahead of confirmation.
- `009-redirects/state.spec.md` §3.2 *does* describe an `"optimistic patch in list / reconcile /
  rollback"` client-action shape for its own toggle-like transitions — but `012-menus/state.spec.md`
  §"state" explicitly discloses, for that spec family, that **"No optimistic updates, no rollback, no
  request de-duplication exist in either component"** in the real, as-built screens; reading
  `Redirects.tsx`'s actual source confirms it — the shipped code is the plain await-then-reload
  pattern above, not the state-contract's more aspirational language.
- Per the brownfield spec-writing rule ("existing codebase patterns are constraints, not subjects"),
  this file follows the pattern that is actually built and working across every sibling admin screen,
  rather than introducing a new interaction paradigm (true pre-flip-with-rollback) that no screen in
  this app uses today. Because the toggle's displayed value is never mutated ahead of confirmation, a
  failed request has nothing to roll back — the "recovery" is automatic by construction, which is
  arguably a simpler and equally responsive shape than genuine optimistic UI for a single-field toggle
  with a fast round-trip.

This is a disclosed reading choice, not a `[NEEDS CLARIFICATION]` — the behavior above is fully
specified and testable (§5, AC-19/AC-20) regardless of which reading was originally intended.

**On the two things intentionally NOT built here.** The task that produced this amendment (SPEC-045's
Option A framing) originally described the ask as covering "capability tier, any config surface" in
addition to list+toggle. Neither is in scope for this file, and this is not an oversight. **(1.1.2)
note:** "capability tier" below means the `capabilities` array only — it is a distinct thing from the
`tier` field (`tier-1`/`tier-2`/`tier-3`, added to REQ-01 at 1.1.1), which this section did **not**
address before 1.1.2 (see RT-010, resolved just below the two deferred items):

1. **Capability list (the `capabilities` array — distinct from the `tier` field, resolved separately
   below).** REQ-10's approved `PLUGINS_LIST` response (`api.spec.md` §5) does not include a
   `capabilities` field — only `id`/`name`/`version`/`source`/`tier`/`status`/`enabled`/`errors`
   (**1.1.2**: `tier` added, see below; `capabilities` still absent). Adding `capabilities` would mean
   changing REQ-10's already-approved contract further, which remains out of scope here. Displaying a
   plugin's declared `capabilities` (`state.spec.md` §2's `PluginManifest.capabilities`) would require
   a new backend field or read path that does not exist today — tracked as **OQ-11** in
   `feature.spec.md`, not built here.
2. **Config surface.** No manifest field, table, or endpoint anywhere in this spec package defines a
   per-plugin settings/config surface (`state.spec.md` §2's `adminSurfaces` field is explicitly
   "parsed-and-stored, UNUSED in v1"). There is nothing for a config screen to read or write. Also
   tracked under **OQ-11**.

**On the `tier` field — now built, not deferred (1.1.2, resolves RT-010).** Unlike `capabilities`
above, the `tier` field (`tier-1`/`tier-2`/`tier-3`, REQ-01/ADR-024 §1) is **not** deferred to OQ-11.
Red-Team's `red-team-findings-v1.1.1-amendment.md` (RT-010) flagged that this section's original
"Capability tier" heading was drafted before `tier` existed on the manifest at all (§9 was written at
1.1.0, `tier` landed at 1.1.1) and never disclosed, one way or the other, whether the *new* `tier`
field would be operator-visible — even though ADR-024 §1 states `plugin.tier` exists specifically to
"drive onboarding and install consent, exactly as `theme.json.tier` does." **Owner decision
(2026-07-28): show it.** REQ-10's response now carries an additive `tier` field (§3.1), and REQ-18/§5
render it as a per-row badge — the one admin surface this system has is no longer silent about the
one field ADR-024 designed specifically to inform an operator's trust decision.

**On plugin installation.** This screen has no upload/add-plugin affordance. REQ-02 installs a plugin
by placing its unpacked artifact at `<install-dir>/plugins/<id>/<version>/` — a filesystem operation,
not an HTTP one. `api.spec.md` §1's endpoint registry lists only `PLUGINS_LIST` and
`PLUGIN_SET_ENABLED`; there is no `POST` for uploading an artifact. A newly-installed plugin simply
appears in this screen's list on the next `GET …/plugins` call (discovery re-scans on every call per
`api.spec.md` §4's `PLUGINS_LIST` request contract) — no UI action is needed to "register" it.

No `[NEEDS CLARIFICATION]` markers remain in this file.

---

## Acceptance Checklist

- [x] Each public component has explicit input and event contracts (§3/§4).
- [x] Rendering conditions are deterministic (§5).
- [x] Accessibility requirements are testable (§6).
- [x] Entity names and statuses (`valid`/`invalid`/`incompatible`, `built-in`/`site`) align exactly
      with `feature.spec.md` REQ-10 and `api.spec.md` §5/§6 — no `orchestrator.spec.md`/`state.spec.md`
      field is introduced or renamed by this file.
- [x] Every REQ this file's scope touches (REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18) is
      cited against a concrete component/rule above.
- [x] Every error code reachable from this screen's two API calls has an explicit UI treatment (§8).
- [x] Two disclosed reading/scope notes are surfaced, not hidden (§9): the optimistic-vs-pessimistic
      toggle reading, and the capability-list/config-surface/install-upload items intentionally not
      built.
- [x] **(1.1.2)** REQ-18/AC-26 (the tier badge, §5) is cited against a concrete rendering rule,
      grounded in ADR-024 §1's own tier vocabulary and the existing `status`-badge display convention
      (`Redirects.tsx`) — not invented copy; §9 discloses this as the resolution of RT-010, not a
      silent scope change.
