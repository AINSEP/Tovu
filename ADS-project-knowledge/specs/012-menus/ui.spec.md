# UI Contract Spec: Menus (Navigation)

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-012`
- Feature: `FEAT-012-menus`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Documents the two real admin UI components (`apps/admin/src/sections/Menus.tsx`,
`apps/admin/src/sections/MenuEditor.tsx`) as implemented — plain function components with
local `useState`, no shared design-system component library referenced beyond raw HTML
elements and ambient CSS classes (`notice`, `editor-header`, `list-table`, `status-*`, etc.).

## 1) Component Registry
| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `Menus` | List screen: fetch + render every menu, inline location-assign, trash/purge action | Section 2.1 | Section 3.1 |
| `MenuEditor` | Create/edit screen: title/slug fields + recursive tree editor + Save | Section 2.2 | Section 3.2 |
| `ItemRow` | One recursive row in the tree editor (label/target-kind/target-value + reorder/add/remove controls) | Section 2.3 | Section 3.3 |

There is no separate `EmptyState`, `ConfirmActionDialog`, or `ErrorBanner` component — those
responsibilities are inlined:
- Empty state: `Menus.tsx` renders the same `<table>` with zero `<tr>` rows when `menus` is an
  empty array (no dedicated "no menus yet" message).
- Confirm dialog: a native `window.confirm(...)` call, not a component
  (`Menus.tsx:40-42`), gates only the *force-purge* action (trashing has no confirmation).
- Error banner: a plain `<div className="notice error">{error}</div>` repeated inline in both
  components — not a shared component.

## 2) Input Contracts (Props/Inputs)

### 2.1 `Menus`
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| *(none — `Menus` takes no props)* | — | — | — | All state is internal (`useState` + `api.listMenus()` on mount via `useEffect(load, [])`) |

### 2.2 `MenuEditor`
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `menuId` | yes | `string \| null` | none | `null` selects create mode (empty form, no fetch); a non-null id triggers `api.getMenu(menuId)` on mount and on every `menuId` change |

### 2.3 `ItemRow`
| Input | Required | Type | Notes |
|---|---|---|---|
| `item` | yes | `AdminMenuItem` | The node this row renders |
| `path` | yes | `number[]` | Sibling-index path from the tree root to this node — the addressing scheme every mutation helper (`mapAtPath`, `removeAtPath`, `addChildAtPath`, `moveAtPath`) uses |
| `onChange` | yes | `(path, fn: (item) => item) => void` | Applies an immutable field update at `path` |
| `onRemove` | yes | `(path) => void` | Removes the node at `path` |
| `onAddChild` | yes | `(path) => void` | Appends a new blank child under `path` |
| `onMove` | yes | `(path, direction: -1 \| 1) => void` | Swaps the node at `path` with its previous/next sibling |

## 3) Event Contracts (Outputs)

### 3.1 `Menus` (internal handlers, not exposed as component props — there is no parent to notify)
| Handler | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `load()` | none | mount, and after every successful assign/delete | `GET`s the menu list, sets `menus`; on failure sets `error` and leaves `menus` as-is (does not clear a prior successful list) |
| `assign(menuId)` | reads `locationDrafts[menuId]`, trimmed | "Assign" button click | If the trimmed value is empty, no-ops (no error shown). Otherwise calls `api.assignMenuLocation(menuId, locationKey)`; on success clears that row's draft text and calls `load()`; on failure sets `error`, draft text is preserved |
| `trashOrPurge(menu)` | the row's `AdminMenu` | "Trash"/"Delete permanently" button click | If `menu.status === "trash"`, first shows `window.confirm(...)`; declining aborts with no call made. Otherwise (or on confirm) calls `api.deleteMenu(menu.id, force)` where `force = menu.status === "trash"`, then `load()` on success or sets `error` on failure |

### 3.2 `MenuEditor` (internal handlers)
| Handler | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `save()` | current `title`/`slug`/`items` state | "Save" button click | Create mode: calls `api.createMenu({ title, slug, items })`, then navigates to `#/menus/:newId` on success. Edit mode: calls `api.updateMenuTree(menu.id, { expectedVersion: menu.version, title, slug, items })`, then updates local `menu`/`items` state and sets a `"Saved · version N"` message. Either mode sets `error` on failure and leaves the form's unsaved edits in place (no reload, no discard) |
| `changeAt`, `removeAt`, `addChildAt`, `moveAt`, `addRootItem` | tree-path + edit fn | `ItemRow`'s corresponding callback, or the editor's own "+ Add item" button | Pure local `items` state transforms — no network call; only "Save" persists anything |

### 3.3 `ItemRow` (bubbled to `MenuEditor` via the props in 2.3)
| Event | Payload | Trigger |
|---|---|---|
| target-kind change | new `kind` string | `<select>` `onChange` — `targetForKind` preserves the previous target's overlapping fields (e.g. switching `url → route` keeps nothing, since the two shapes share no field name) where a shared field exists |
| field edits (label/href/route/entryId/termId/taxonomy) | new string value | Corresponding `<input>` `onChange` |
| move up / move down | `-1` / `1` | ↑ / ↓ buttons — no-ops silently at either end of the sibling list (`moveAtPath` returns the input unchanged if the target index is out of range) |
| add child | none | "+ child" button |
| remove | none | "✕" button — **no confirmation** on removing an item (unlike the list screen's purge confirm) |

## 4) Rendering and Interaction Rules
- [x] `Menus` renders `"Loading menus…"` while `menus === null` (initial fetch in flight);
  renders the error banner alone (no table) only when `error` is set *and* `menus` is still
  `null` (i.e., the very first load failed).
- [x] Once `menus` is non-null, the table always renders (even with zero rows) — there is no
  dedicated zero-state message distinct from an empty `<tbody>`.
- [x] `MenuEditor` renders `"Loading menu…"` while `loading === true`; renders the error banner
  alone only when `error` is set *and* not in create mode *and* `menu` is still `null` (the
  initial fetch failed). A save-time error after a successful load instead renders inline next
  to the Save button (`<span className="save-error">`), alongside the still-editable form.
- [x] The list screen's delete button label is fully deterministic from `menu.status`:
  `"Delete permanently"` iff `status === "trash"`, else `"Trash"` — this is also what decides
  whether `window.confirm` fires and what `force` value is sent.
- [x] Reorder controls (`↑`/`↓`) are always rendered, even at a list boundary — they simply
  no-op rather than being disabled/hidden when there is no sibling to swap with.

## 5) Accessibility Requirements
**As shipped, not as recommended.** Neither component sets ARIA roles, live regions, or
explicit accessible names beyond what native HTML elements (`<button>`, `<input>`, `<select>`,
`<table>`) provide implicitly. Specifically:
| Area | Actual State |
|---|---|
| Semantic roles | Relies entirely on native element semantics (`<table>`, `<button>`, `<select>`) — no explicit `role` attributes anywhere in either file |
| Labels | Inputs use `placeholder` text (e.g. `"e.g. primary"`, `"Label"`) as the only hint — no `<label>` elements or `aria-label` attributes |
| Keyboard | Native tab order and native button/input keyboard activation only — no custom key handling |
| Status updates | No ARIA live region — the `message`/`error` `<span>`/`<div>` elements are plain DOM text with no `aria-live` attribute, so a screen reader does not announce a save confirmation or error automatically |
| Error clarity | Errors are a plain string near the action, not associated with a specific field via `aria-describedby` or similar |

This is recorded as a real, present gap — not a spec requirement being waived. Any future
accessibility pass has a concrete, file-grounded punch list here rather than a generic "improve
a11y" note.

## 6) Composition Rules
- `Menus` and `MenuEditor` are both top-level, hash-route-driven screens (`#/menus`,
  `#/menus/new`, `#/menus/:id`) — the routing glue itself lives outside these two files and was
  not read for this pass.
- `ItemRow` is rendered only from within `MenuEditor` (both the top-level list and recursively
  from within itself for `children`) — it has no other consumer.
- There is no shared `FeatureContainer`-style wrapper; each screen owns its own data fetching.

## 7) Acceptance Checklist
- [x] Each real component has explicit input and event contracts, cited to file/line.
- [x] Rendering conditions are deterministic and quoted from the actual conditionals in the code.
- [x] Accessibility requirements are documented as the real (minimal) current state, not aspirational.
- [x] Entity names (`AdminMenu`, `AdminMenuItem`, `AdminMenuTarget`) align with `api.spec.md`'s DTOs and `state.spec.md`.
