# UI Contract Spec: widgets

SPEC PACKAGE FILE: `ADS-memory/specs/043-widgets/ui.spec.md`

- Spec ID: `SPEC-043`
- Feature: `FEAT-043-widgets`
- Version: `1.0.0`
- Content Hash: not computed — this package's validator has not been run (see `spec-manifest.md`'s
  disclosed deviation; this file continues that same disclosed posture rather than inventing a hash)
- Last Edited: 2026-07-21T00:00:00Z
- Author: Coordinator (Claude Sonnet 5), dispatched sub-agent, direct — not a separate Spec Agent
  persona run with its own validator pass, consistent with how `feature.spec.md` and
  `spec-manifest.md` were authored in this same feature

**Disclosed deviation from this file's own template header convention:** the template at
`AI-Dev-Shop/framework/spec-providers/speckit/templates/spec-system/ui.spec.md` is framework-neutral
boilerplate (`FeatureContainer`/`ItemList`/`ItemCard`/…). This file follows its section structure
(1–7) exactly, but every component/table below is widgets-specific — the boilerplate names are not
reused.

## Purpose

Defines UI component contracts, interaction events, rendering conditions, and accessibility
requirements for the widgets admin UI — the widget library/list screen, the per-type widget instance
editor, the region/placement manager (with the reuse-vs-duplicate dialog REQ-33 requires), the
where-used disclosure REQ-34 requires, and the TipTap `widgetEmbed` inline-authoring surface (REQ-18).
Independent of frontend framework in principle; Section 0 below records the concrete conventions this
build must mirror in *this* codebase, per this dispatch's explicit instruction not to invent new
visual language.

Every requirement below cites its `feature.spec.md` REQ/AC. No requirement here invents product scope
beyond that file — see Section 8 for the one place this document had to make an explicit, disclosed
reading choice between two spec-family artifacts that read in tension (REQ-33/AC-23 vs. ADR-047's
Debate Fold-In Amendment 5 prose), and Section 9 for the one real open dependency gap this UI spec
does not attempt to paper over.

---

## 0) UI Conventions Baseline (mirrored, not invented)

Per this dispatch's scope limits (Programmer implements approved patterns; this UI spec may not invent
new visual direction), every component below is specified against conventions already shipped
elsewhere in `apps/admin/src/`, cited by file:

| Convention | Source | Applied to |
|---|---|---|
| List screen: `<table className="list-table">`, `status status-${status}` badge spans, header row with title + "Add New" action | `apps/admin/src/sections/Menus.tsx` | §2.1 `WidgetsLibraryScreen` |
| Full-page editor shell: `.editor-page` / `.editor-header` (back-link + `.editor-actions`) / `.editor-title` input / `.editor-slug` row / `.editor-shell` / `.editor-body` | `Menus.tsx`, `MenuEditor.tsx`, `PostEditor.tsx`, `CollectionEntryEditor.tsx` | §2.2 `WidgetInstanceEditorScreen`, §2.5 `RegionPlacementEditorScreen` |
| Whole-list reorder UX: recursive/flat row list with ↑ / ↓ move buttons operating on an in-memory array, saved as one whole-document write on explicit Save | `MenuEditor.tsx`'s `ItemRow`/`moveAtPath` | §2.6 `RegionPlacementList` |
| Free-text key-assignment row (no server-sourced "declared keys" list) | `Menus.tsx`'s location-assign `<input>` + `api.assignMenuLocation` | §2.4 `WidgetRegionsScreen`'s bind-new-region control (see Section 9) |
| Modal dialog idiom: `.settings-dialog-backdrop` (click-to-cancel) + `.settings-dialog` (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`, Escape-to-close via a `keydown` listener), form-shaped body, `.editor-actions` submit/cancel row | `Collections.tsx`'s `NewContentTypeDialog`/`EditFieldsDialog`, `Settings.tsx`'s reset dialog | §2.7 `WidgetPickerDialog` |
| Picker-over-list-API dropdown: `<select>` populated from an existing `list*` API call, `"Choose a …"` placeholder option | `Seo.tsx`'s `EntryPicker` (over `listPosts`/`listPages`) | §2.3.4 `MenuRefField`, §2.3.5 `ContactFormRefField` |
| Stale-version conflict copy: a fixed, reused sentence, not a per-screen invention | `Collections.tsx`'s `STALE_VERSION_MESSAGE` | §8 |
| Destructive-but-simple confirm: native `window.confirm(...)` for an unconditional trash/purge action (no referencing conflict expected) | `Menus.tsx`'s `trashOrPurge` | §2.1 `WidgetInstanceRow`'s trash action |
| Inline status/error surfaces: `<div className="notice">` / `<div className="notice error">` / `<span className="save-ok">` / `<span className="save-error" role="alert">` | Every editor screen listed above | All screens, §8 |
| TipTap wiring: `useEditor({ extensions: [...] })` called separately in each editor file (no shared extension-list module exists yet) | `PostEditor.tsx` (`[StarterKit, Image]`), `CollectionEntryEditor.tsx` (`[StarterKit]`) | §2.8 `WidgetEmbedNode`, addressed in the outline addendum (Section 2 there) |

No new component library, modal system, design token, or interaction pattern is introduced. Where a
widgets-specific need has no existing sibling to mirror (the reuse-vs-duplicate dialog's two-path
body, the where-used banner, the per-type config sub-forms), the closest structural sibling is named
in that component's row below and the new UI reuses its layout primitives (`<fieldset>`/`<label>`
pairs, `.editor-actions`, `.notice`) rather than inventing new ones.

---

## 1) Screen / Route Map

Mirrors `App.tsx`'s existing hash-route `switch` (see `Menus`/`MenuEditor`'s `#/menus`, `#/menus/new`,
`#/menus/:id` precedent) and `nav.ts`'s existing top-level entry list (`Menus` is a peer top-level
entry, not nested under another section — `Widgets` is added the same way, per ADR-047's framing of
widgets as menus' direct structural sibling).

| Route | Screen | Notes |
|---|---|---|
| `#/widgets` | `WidgetsLibraryScreen` | Default view; lists every widget instance across all 5 types |
| `#/widgets/new?type={typeKey}` | `WidgetInstanceEditorScreen` (create mode) | `typeKey` is one of the 5 registered v1 types (REQ-09); chosen on the library screen before navigating here, not on this screen |
| `#/widgets/{id}` | `WidgetInstanceEditorScreen` (edit mode) | |
| `#/widgets/regions` | `WidgetRegionsScreen` | Lists every currently-bound `widget_area` region (from `widget_region_bindings`) + the bind-new-region control (Section 9) |
| `#/widgets/regions/{regionKey}` | `RegionPlacementEditorScreen` | The ordered placement-list editor for one region |

`nav.ts` gains one entry: `{ id: "widgets", label: "Widgets", href: "#/widgets" }`, positioned as a
peer of the existing `"menus"` entry (both are placement/composition concepts under the same
navigational tier in the current nav grouping).

---

## 2) Component Registry

| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `WidgetsLibraryScreen` | Lists all widget instances; hosts the type-picker "Add New" control and the link to `WidgetRegionsScreen` | §3.1 | §4.1 |
| `WidgetInstanceRow` | One row: title, type, status, version, where-used count, trash/purge action | §3.2 | §4.2 |
| `WidgetInstanceEditorScreen` | Create/edit one widget instance: title, slug (create-only), type-specific config sub-form, where-used banner, save | §3.3 | §4.3 |
| `TextConfigFields` | Config sub-form for `text` (REQ-09) | §3.4.1 | §4.4 (shared) |
| `SocialLinksConfigFields` | Config sub-form for `social-links` | §3.4.2 | §4.4 (shared) |
| `RecentEntriesConfigFields` | Config sub-form for `recent-entries` | §3.4.3 | §4.4 (shared) |
| `MenuConfigFields` | Config sub-form for `menu` (delegates ref selection to `MenuRefField`) | §3.4.4 | §4.4 (shared) |
| `ContactFormConfigFields` | Config sub-form for `contact-form` (delegates ref selection to `ContactFormRefField`) | §3.4.5 | §4.4 (shared) |
| `WhereUsedBanner` | REQ-34 disclosure: exact count + locations of an instance's placements | §3.5 | n/a (read-only) |
| `WidgetRegionsScreen` | Lists bound regions; hosts the bind-new-region control | §3.6 | §4.5 |
| `RegionPlacementEditorScreen` | One region's ordered placement list, editor shell + save | §3.7 | §4.6 |
| `RegionPlacementList` | The ordered list itself: add/remove/reorder rows | §3.8 | §4.7 |
| `WidgetPickerDialog` | REQ-33's explicit reuse-vs-duplicate modal | §3.9 | §4.8 |
| `WidgetEmbedNode` | TipTap node authoring surface: toolbar insertion trigger + the in-canvas node view for an existing embed | §3.10 | §4.9 |

---

## 3) Input Contracts (Props/Inputs)

### 3.1 `WidgetsLibraryScreen`

| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| (none — top-level route component, loads its own data via `api.listWidgets()`) | — | — | — | Mirrors `Menus.tsx`'s no-props, self-loading pattern |

Loaded state per instance: `{ id, title, slug, widgetType, status, version, whereUsedCount }`.
`whereUsedCount` is derived client-side by calling the where-used read surface (REQ-34's disclosure
data, the same `entry_refs`-backed source `WhereUsedBanner` uses) per visible row, or, if the admin
list route batches it server-side, consumed directly — either is REQ-34-compliant; batching server-
side is the cheaper N+1-avoiding choice and is flagged as a Programmer implementation preference in
the outline addendum, not a UI contract requirement.

### 3.2 `WidgetInstanceRow`

| Input | Required | Type | Notes |
|---|---|---|---|
| `instance` | yes | `{ id, title, slug, widgetType, status: 'active'\|'trash'\|'purged', version, whereUsedCount }` | |
| `onTrashRequest` | yes | `callback(instanceId)` | |
| `onPurgeRequest` | yes | `callback(instanceId, force: boolean)` | `force: true` only reachable when the principal holds `widgets.delete.force` (REQ-40) and a prior non-force purge returned `WidgetReferencedError` (§8) |

### 3.3 `WidgetInstanceEditorScreen`

| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `mode` | yes | `'create' \| 'edit'` | — | Derived from the route (§1) |
| `widgetType` | yes in create mode | `WidgetTypeKey` (one of the 5 v1 keys) | — | From the `?type=` query param; not editable once an instance exists (no REQ authorizes changing an instance's type post-creation) |
| `instanceId` | yes in edit mode | `string (UUID)` | — | |

Loaded state (edit mode, via `api.getWidget(instanceId)`): `{ id, title, slug, widgetType, status,
version, config }` — `config`'s shape is one of §3.4.1–3.4.5 keyed by `widgetType`.

### 3.4 Per-Type Config Sub-Forms

Each sub-form's field set is read directly off `registry.ts`'s five `WidgetTypeRegistration.configSchema`
records (REQ-01/02) — no field here is invented; the schema is the closed, ground-truth source.

#### 3.4.1 `TextConfigFields` (`text`)

| Input | Required | Type | Notes |
|---|---|---|---|
| `body` | yes | `string` | Free-form rich text field; a plain `<textarea>` is sufficient — `text` is the `static` capability type with no structured sub-fields (REQ-10) |

#### 3.4.2 `SocialLinksConfigFields` (`social-links`)

| Input | Required | Type | Notes |
|---|---|---|---|
| `links` | yes | `Array<{ platform: string; url: string }>`, max 20 items | Repeatable row list, mirrors `Collections.tsx`'s `fields`-array-of-rows pattern (add row / remove row per index) |

#### 3.4.3 `RecentEntriesConfigFields` (`recent-entries`)

| Input | Required | Type | Notes |
|---|---|---|---|
| `maxItems` | yes | `integer`, 1–20 | Number input; client-side max is a UX courtesy (AC-02/REQ-02 enforcement is server-side; a value above 20 must still be rejectable by the server, not silently clamped client-side before submit — see §5) |
| `categoryTermId` | no | `string` (taxonomy term id) | REQ-32/EC-03: a documented soft reference — plain text input for v1 (no taxonomy-term picker component exists yet in `apps/admin/src/sections/`; adding one is out of this feature's scope) |

#### 3.4.4 `MenuConfigFields` (`menu`)

| Input | Required | Type | Notes |
|---|---|---|---|
| `menuRef` | yes | `string (menu entry id)`, via `MenuRefField` | `MenuRefField` is a `<select>` sourced from `api.listMenus()`, mirroring `Seo.tsx`'s `EntryPicker` exactly (dropdown over an existing `list*` call, `"Choose a menu…"` placeholder option, `value`/`onChange` pair) |

#### 3.4.5 `ContactFormConfigFields` (`contact-form`)

| Input | Required | Type | Notes |
|---|---|---|---|
| `formDefinitionId` | yes | `string (form definition id)`, via `ContactFormRefField` | Same `EntryPicker`-shaped dropdown, sourced from `api.listForms()`; each option shows the form's name and, per REQ-38, its `status` (`active`/`disabled`) inline in the option label (e.g. `"Contact — active"`) so an operator isn't surprised later by the placeholder-render behavior |
| `successMessage` | no | `string` | Plain text input |

### 3.5 `WhereUsedBanner`

| Input | Required | Type | Notes |
|---|---|---|---|
| `references` | yes | `Array<{ kind: 'region' \| 'embed'; label: string; href: string }>` | Sourced from the same `entry_refs`-backed where-used read `EntryRefsRepoPort.findByTarget` exposes (REQ-34); `label`/`href` are resolved server-side or client-side from each `sourceEntryId` (a region's `widget_area` → its region key + `#/widgets/regions/{regionKey}`; an embedding entry → its title + its own editor route) so the banner is actionable, not just a bare id list |

### 3.6 `WidgetRegionsScreen`

| Input | Required | Type | Notes |
|---|---|---|---|
| (none — self-loading via a region-bindings list read) | — | — | Loaded state per row: `{ regionKey, areaEntryId, status: 'active' \| 'inactive', placementCount }` |

### 3.7 `RegionPlacementEditorScreen`

| Input | Required | Type | Notes |
|---|---|---|---|
| `regionKey` | yes | `string` | From the route |

Loaded state (via the area entry for this region): `{ areaEntryId, version, placements:
Array<{ placementId, widgetEntryId, widgetTitle, widgetType }> }`.

### 3.8 `RegionPlacementList`

| Input | Required | Type | Notes |
|---|---|---|---|
| `placements` | yes | `Array<{ placementId, widgetEntryId, widgetTitle, widgetType }>` | In-memory working copy, mirrors `MenuEditor.tsx`'s `items` state exactly — mutated locally, saved as one whole-document write on explicit Save (INV-03) |
| `isLoading` | yes | `boolean` | |

### 3.9 `WidgetPickerDialog`

| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `widgetType` | yes | `WidgetTypeKey` | — | The type being placed (chosen by the caller before opening this dialog — see §5 for exactly where) |
| `existingInstances` | yes | `Array<{ id, title }>` | `[]` | Every non-trashed, non-purged instance of `widgetType`, loaded before the dialog opens |
| `onCancel` | yes | `callback()` | — | |

### 3.10 `WidgetEmbedNode`

Framework-neutral authoring-surface contract (realized as a TipTap node + node view — see the outline
addendum for the concrete extension registration).

| Input | Required | Type | Notes |
|---|---|---|---|
| `widgetInstanceId` | yes | `string (UUID)` | The node's sole attribute (REQ-18) |
| `widgetTitle` | no | `string` | Resolved client-side for display (fetched once per distinct id present in the doc, not per-node) |
| `widgetType` | no | `string` | Resolved alongside `widgetTitle` |
| `isBroken` | no | `boolean`, default `false` | True when the referenced instance can't be resolved (trashed/purged/missing) — mirrors the REQ-28 failure-isolation framing at the *authoring* surface, not the public render (see §5) |

---

## 4) Event Contracts (Outputs)

### 4.1 `WidgetsLibraryScreen`

| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onCreateRequest` | `{ widgetType }` | "Create" pressed next to the inline type `<select>` | Navigates to `#/widgets/new?type={widgetType}` |
| `onRegionsLinkActivate` | none | "Regions" link/button activated | Navigates to `#/widgets/regions` |

### 4.2 `WidgetInstanceRow`

| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onTrashRequest` | `instanceId` | Trash control activated, `status === 'active'` | `window.confirm`-free — trash is REQ-42/EC-07 unconditional (never blocked by references), so no confirmation dialog is required by any AC; a lightweight `window.confirm("Trash <title>?")` is still acceptable UX polish, matching `Menus.tsx`'s own trash-vs-purge split, but is not a correctness requirement here the way the purge confirmation is (see next row) |
| `onPurgeRequest` | `{ instanceId, force }` | Purge control activated, `status === 'trash'` | First attempt is `force: false`; on `WidgetReferencedError` (§8), a distinct **confirmation surface naming every referencing location** appears before a `force: true` retry is offered — a bare `window.confirm("Permanently delete?")` alone does not satisfy REQ-42's "reject the request with... the referencing list" being surfaced to the operator |

### 4.3 `WidgetInstanceEditorScreen`

| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onSave` | `{ title, slug? (create only), config }` | Save pressed | Create mode: `api.createWidget(...)` (REQ-01); edit mode: `api.updateWidget(id, { baseVersion: version, config, title })` (REQ-05/06) |
| `onConfigChange` | `config: Record<string, unknown>` | Any config sub-form field change | Updates local working state only — no network call until `onSave` |

### 4.4 Config Sub-Forms (shared shape, all 5)

| Event | Payload | Trigger |
|---|---|---|
| `onChange` | The sub-form's own config object shape (§3.4.1–3.4.5) | Any field edit — bubbles to `WidgetInstanceEditorScreen.onConfigChange` |

### 4.5 `WidgetRegionsScreen`

| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onBindRegion` | `{ regionKey }` | The bind-new-region free-text control submitted (Section 9) | `api.bindWidgetRegion({ regionKey })` (REQ-11/13's manual-trigger equivalent — see Section 9), then navigates to `#/widgets/regions/{regionKey}` |
| `onRegionSelect` | `regionKey` | A listed region row activated | Navigates to `#/widgets/regions/{regionKey}` |

### 4.6 `RegionPlacementEditorScreen`

| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onSave` | `{ placements }` (whole list) | Save pressed | `api.mutateWidgetAreaPlacements(areaEntryId, { baseVersion: version, placements })` (REQ-15) — one whole-document call, never per-row |

### 4.7 `RegionPlacementList`

| Event | Payload | Trigger |
|---|---|---|
| `onAddWidgetRequest` | none | "+ Add widget" activated → opens a type-choice step, then `WidgetPickerDialog` (§5) |
| `onRemove` | `placementId` | Row's remove control activated |
| `onMove` | `{ placementId, direction: -1 \| 1 }` | Row's ↑/↓ control activated — mirrors `MenuEditor.tsx`'s `moveAtPath` exactly, flattened (no nesting; a region's placement list has no parent/child structure, unlike a menu tree) |
| `onDisableToggle` | `{ placementId, disabled: boolean }` | Row's enable/disable control activated (REQ-15's "add, remove, reorder, **or disable** an entry") |

### 4.8 `WidgetPickerDialog`

| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onUseExisting` | `{ widgetInstanceId }` | "Use existing" path: an instance selected from `existingInstances` and confirmed | The caller (region placement add, or embed insertion) receives a plain reference — no new instance is created. Maps 1:1 to the `widgets.place` operation (REQ-35) |
| `onCreateNew` | `{ title, config }` | "Create new" path: the inline create-and-place form submitted | The caller creates a new instance (`api.createWidget`) then places/embeds the returned id. Maps 1:1 to the `widgets.create` operation (REQ-35) |
| `onCancel` | none | Backdrop click, Escape, or explicit Cancel | Dialog closes, no placement/embed change |

### 4.9 `WidgetEmbedNode`

| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onInsertRequest` | none | Toolbar "Insert widget" button activated | Opens a type-choice step, then `WidgetPickerDialog`; on resolution, a new `widgetEmbed` node is inserted into the document at the current cursor position (client-side ProseMirror transaction — REQ-19/20's real enforcement is server-side at Save, per §5) |
| `onRemove` | `widgetInstanceId` (the node being removed) | Node view's remove control activated | Removes the node from the document (client-side transaction) |
| `onChangeInstance` | none | Node view's "change" control activated | Re-opens `WidgetPickerDialog` scoped to the same `widgetType`, replacing this node's `widgetInstanceId` attribute on resolution |

---

## 5) Rendering and Interaction Rules

- [ ] `WidgetsLibraryScreen` shows a loading notice while `api.listWidgets()` is in flight, matching
  every other list screen's `<div className="notice">Loading …</div>` convention.
- [ ] The type `<select>` next to "Create" is populated from the five closed v1 type keys (REQ-09)
  as a client-side constant — no server round-trip to "list widget types" is required for v1, mirroring
  `MenuEditor.tsx`'s equally-closed, equally-hardcoded `AdminMenuTargetKind` `<select>` options.
- [ ] `WidgetInstanceEditorScreen` renders exactly one of the five config sub-forms (§3.4.1–3.4.5),
  selected by `widgetType` — never more than one, never a generic/dynamic schema-driven form (unlike
  `CollectionEntryEditor.tsx`'s `DynamicField`, which exists because content types are operator-defined
  at runtime; widget types are a closed, code-level registry, REQ-07/09, so a fixed per-type form is the
  correct mirror of `MenuEditor.tsx`'s fixed target-kind switch, not of `CollectionEntryEditor.tsx`'s
  dynamic-schema approach).
- [ ] `WhereUsedBanner` renders whenever `references.length > 0`, positioned at the top of
  `WidgetInstanceEditorScreen`'s body, before the config form — "before or alongside the edit surface"
  per REQ-34/AC-24, not buried below the fold.
- [ ] `WhereUsedBanner` does not render (no empty-state banner) when `references.length === 0` — an
  unplaced instance is not an error state (ADR-047 §7), so nothing is shown, not an empty "used in 0
  places" line.
- [ ] `WidgetPickerDialog`'s "Use existing" path renders **only when `existingInstances.length > 0`**;
  with zero existing instances of the chosen type, the dialog renders the "Create new" form alone, with
  no "Use existing" tab/section at all — REQ-33 governs the case of "a type with one or more existing
  instances"; a type with zero has nothing to choose between, so this is not a REQ-33 violation, it's
  the requirement's own precondition not being met.
- [ ] When `existingInstances.length > 0`, both "Use existing" and "Create new" render as explicit,
  equally-weighted options (e.g., two tabs or two stacked sections) with **no pre-selected default** —
  neither happens without an explicit operator action (REQ-33, AC-23 verbatim). See §8 for this
  document's reading of REQ-33 against ADR-047 Amendment 5's "default to reuse" prose.
- [ ] `RegionPlacementList` renders each placement row with its resolved `widgetTitle`/`widgetType`,
  not a bare id — an operator must be able to identify what's placed without a second lookup.
- [ ] A placement row whose `widgetEntryId` can no longer be resolved (the referenced instance is
  trashed/purged after being placed — REQ-16 only blocks this at *mutation* time, not for a placement
  that decays after the fact, EC-06/EC-07) renders a visibly distinct "broken reference" state inline —
  this is the admin-side counterpart to REQ-28's public-facing placeholder, giving the operator a way to
  *see and remove* a dangling placement rather than only having it silently placeholder-render on the
  public site.
- [ ] `WidgetEmbedNode`'s node view renders `isBroken: true` the same visibly-distinct way (icon/border/
  label — implementation detail, not a new design language; reuse whatever the placement-row broken-
  state treatment already establishes, so the two surfaces read as one system).
- [ ] Client-side config-field constraints (e.g. `RecentEntriesConfigFields`'s `maxItems` 1–20 range,
  `SocialLinksConfigFields`'s 20-item cap) are UX guidance only — every save still round-trips through
  the real server-side validator (REQ-02); a client-side cap must never be presented as if it were the
  authoritative validation, and a server-side `WidgetConfigValidationError` must still be handled and
  displayed (§8) even when the client-side constraint appears satisfied, since the two are allowed to
  diverge (e.g., a future registry change) without a client redeploy.
- [ ] Inserting a `widgetEmbed` node via the editor toolbar performs a **client-side, in-memory
  ProseMirror transaction only** — REQ-19/20's guardrails (no recursion, count clamp) are UX-level
  affordances at insertion time (e.g., disabling "Insert widget" while editing a widget instance's own
  body — N/A today since no widget type's config includes a rich-text body field beyond `text`'s plain
  string, so recursion is not reachable from this UI at all in v1) but are **not** the authoritative
  enforcement; the real guardrail (`validateWidgetEmbedMutation`, C-008) runs server-side at the next
  Save through the existing entries chokepoint. A save that trips a `WidgetEmbedGuardrailError` (§8)
  must still be handled and clearly attributed to the specific embed that caused it.

---

## 6) Accessibility Requirements

| Area | Requirement |
|---|---|
| Semantic roles | `WidgetPickerDialog` uses `role="dialog"` + `aria-modal="true"` + `aria-labelledby`, matching `Collections.tsx`'s dialog convention exactly (not a bespoke ARIA pattern). |
| Labels | Every config sub-form field has an associated `<label htmlFor>`, matching `Collections.tsx`'s `DynamicField`/`ct-*` id convention. |
| Keyboard | `WidgetPickerDialog` closes on `Escape` (matches `EditFieldsDialog`'s `keydown` listener); `RegionPlacementList`'s ↑/↓ move controls and remove/disable controls are plain `<button>` elements, keyboard-operable by default (matches `MenuEditor.tsx`'s `ItemRow`). |
| Status updates | Save success/failure surfaces via `.save-ok` / `.save-error[role="alert"]`, matching every existing editor screen — `role="alert"` on the error span is what makes a save failure announced without a new live-region mechanism. |
| Error clarity | `WidgetConfigValidationError`'s `fieldErrors` (§8) are associated with their specific config field (inline, adjacent to the offending `<label>`/`<input>` pair), not surfaced only as a single top-of-form banner. |
| Broken-reference indicators | The broken-reference visual treatment (§5) is not conveyed by color alone — an icon or text label accompanies it, consistent with `status status-${status}` badges elsewhere already pairing color with a text label. |

---

## 7) Composition Rules

- `WidgetsLibraryScreen` and `WidgetRegionsScreen` are the only two public entry components reachable
  directly from `nav.ts` (one nav entry, "Widgets," landing on `WidgetsLibraryScreen`; `WidgetRegionsScreen`
  is reached via an in-screen link, mirroring how `MenuEditor` is reached from `Menus` rather than having
  its own nav entry).
- `WidgetInstanceRow` is rendered only within `WidgetsLibraryScreen`.
- Exactly one of `TextConfigFields` / `SocialLinksConfigFields` / `RecentEntriesConfigFields` /
  `MenuConfigFields` / `ContactFormConfigFields` is rendered within `WidgetInstanceEditorScreen` at a
  time, selected by `widgetType` (§5).
- `WhereUsedBanner` is rendered only within `WidgetInstanceEditorScreen`, and only in edit mode (a
  not-yet-created instance cannot be referenced anywhere).
- `RegionPlacementList` is rendered only within `RegionPlacementEditorScreen`.
- `WidgetPickerDialog` may be rendered only when a placement or embed-insertion action is pending —
  from exactly two call sites: `RegionPlacementList.onAddWidgetRequest` and `WidgetEmbedNode.onInsertRequest`/
  `onChangeInstance`. No third call site is authorized by this spec; a future call site is a spec change,
  not a Programmer judgment call.
- `WidgetEmbedNode`'s node view is rendered only inside a TipTap editor instance (`PostEditor.tsx`,
  `CollectionEntryEditor.tsx`, and any future TipTap-bodied editor) — never as a standalone
  React component elsewhere in the admin app.
- Internal helper components (e.g. a single repeatable row inside `SocialLinksConfigFields`) are
  implementation detail and excluded from this contract, matching the template's own composition-rules
  framing.

---

## 8) Error and Conflict Handling

Maps every typed error `src/widgets/errors.ts` defines to a concrete UI surface, so no error class is
left for the Programmer to invent handling for ad hoc.

| Error (HTTP) | Surfaces on | UI treatment |
|---|---|---|
| `WidgetConfigValidationError` (400) | `WidgetInstanceEditorScreen` save | Inline, per-field messages from `fieldErrors` next to each offending config field; top-level `.save-error` also shows a summary line |
| `WidgetTypeUnregisteredError` (400) | `WidgetInstanceEditorScreen` save | Should be unreachable from this UI (the type `<select>` only offers the 5 registered keys) — defensive top-level `.save-error` banner if it somehow occurs |
| `WidgetVersionConflictError` (409) | `WidgetInstanceEditorScreen` save | Reuses `Collections.tsx`'s exact stale-version copy pattern: *"This widget changed since you loaded it, refresh and try again."* — no silent merge, no auto-retry |
| `WidgetAreaConflictError` (409) | `RegionPlacementEditorScreen` save | Same stale-version copy pattern, region-scoped wording (EC-02) |
| `WidgetReferencedError` (409) | `WidgetInstanceRow`'s non-force purge attempt | Surfaces the exact `referencingLocations` list (kind + entry) inline, then offers a `force: true` retry gated on the principal holding `widgets.delete.force` (REQ-40) — this is the same underlying data `WhereUsedBanner` displays, reused, not a second implementation of where-used rendering |
| `WidgetEmbedGuardrailError` (400) | `WidgetInstanceEditorScreen`/`PostEditor.tsx`/`CollectionEntryEditor.tsx` save (whichever entry hosts the offending embed) | `.save-error` banner naming the specific guardrail tripped (`recursion` vs `count-exceeded`) in plain language, and — where feasible — scrolling/highlighting the offending embed node in the editor canvas |
| `WidgetForbiddenError` (403) | Any mutating action | `.save-error` banner using the existing server message shape (`"principal '<id>' is not authorized for '<permission>'"`, per `routes/admin/menus/create.ts`'s convention) — mutating controls are not proactively hidden for a lacking-permission principal in v1 (no existing section in this admin app conditionally hides controls by permission; attempt-then-explain matches the established pattern) |
| `WidgetInstanceNotFoundError` / `WidgetAreaNotFoundError` (404) | Direct navigation to a stale/bad id | `<div className="notice error">Widget not found.</div>` / `"Region not found."`, matching `CollectionEntryEditor.tsx`'s `"Entry not found."` pattern |

**On REQ-33 vs. ADR-047 Amendment 5 (disclosed reading, not a blocking ambiguity):** ADR-047's Debate
Fold-In Amendment 5 narrative says placement should "default to reuse... a bare 'always ask' modal on
every placement is the wrong friction point." `feature.spec.md`'s ratified REQ-33/AC-23 — the later,
approved, ground-truth artifact this UI spec is required to build against — states the opposite in
unambiguous Given/When/Then terms: both options must always be presented explicitly, with no default,
whenever ≥1 existing instance exists. This document follows REQ-33/AC-23 literally (§5's rule above)
because it is the approved spec text and is independently, mechanically testable; it does not raise
this as `[NEEDS CLARIFICATION]` because there is no ambiguity in what to build — only a note, for the
human reviewer, that the ADR's prose and the spec's requirement do not read identically, in case that
divergence was unintentional and worth a future spec correction.

---

## 9) Open Dependency Gap (disclosed, not papered over)

`WidgetRegionsScreen`'s bind-new-region control (§3.6/§4.5) assumes a live admin route that calls
`bindWidgetArea({ regionKey })` (already implemented, `src/widgets/region-area-service.ts`) directly
from an operator-supplied `regionKey` string — mirroring `Menus.tsx`'s free-text location-assign
control exactly. This is a deliberate, low-invention choice, **not** a claim that REQ-13's "seed a
`widget_area` entry for every region a theme declares, on theme activation" is implemented by this UI.
Investigation during this dispatch (see the implementation-outline addendum, Section 3) confirmed
`ThemeManifest` (`src/features/theme/theme.ts`) has no `regions` field today — there is no live,
theme-declared "list of region keys" data source anywhere in the codebase to build a dropdown/picker
against. Manually typing a region key (this section) and automatically seeding one on theme activation
(REQ-13, a separate, currently-unwired mechanism) are complementary, not competing — this UI works
correctly today via the manual path and will continue to work unchanged once REQ-13's automatic
trigger is wired by a future dispatch (any pre-seeded region simply already appears in
`WidgetRegionsScreen`'s list, no UI change required). Flagged here rather than silently assuming a
"theme declares regions" API this UI spec would otherwise have had to invent.

No other `[NEEDS CLARIFICATION]` markers remain in this file.

---

## Acceptance Checklist

- [x] Each public component has explicit input and event contracts (§3/§4).
- [x] Rendering conditions are deterministic (§5).
- [x] Accessibility requirements are testable (§6).
- [x] Entity names and statuses align with `feature.spec.md` (widget instance `status`:
      `active`/`trash`/`purged` per the implementation report's Gap 3 fix; region binding `status`:
      `active`/`inactive` per REQ-14) — no `orchestrator.spec.md`/`state.spec.md` exist for this
      package to additionally cross-check against (both disclosed `OMITTED` in `spec-manifest.md`).
- [x] Every REQ this file's scope touches (REQ-01..06, REQ-09, REQ-10, REQ-11, REQ-13, REQ-14,
      REQ-15, REQ-16, REQ-18, REQ-19, REQ-20, REQ-28, REQ-31, REQ-32, REQ-33, REQ-34, REQ-35, REQ-36,
      REQ-38, REQ-40, REQ-41, REQ-42) is cited against a concrete component/rule above.
- [x] Every typed error class in `src/widgets/errors.ts` has an explicit UI treatment (§8).
- [x] One disclosed reading choice (REQ-33 vs. Amendment 5 prose) and one disclosed open dependency
      gap (theme-declared regions) are surfaced, not hidden (§8, §9).
