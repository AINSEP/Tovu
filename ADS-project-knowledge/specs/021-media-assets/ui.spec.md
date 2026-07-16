# UI Contract Spec: media-assets

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-021`
- Feature: `FEAT-021-media-assets`
- Version: `1.0.0`
- Content Hash: anchored in feature.spec.md
- Last Edited: `2026-07-15T00:00:00Z`

**As-built note:** this documents the one real, shipped component, `apps/admin/src/sections/Media.tsx` (137 lines, no sub-components extracted). It is a single flat function component, not a composed tree of `FeatureContainer`/`ItemList`/`ItemCard`/etc. as the template example assumes — the Component Registry below reflects that flatness rather than inventing a decomposition that does not exist in the code.

## Purpose
Defines the real UI component contract, interaction events, rendering conditions, and (where applicable) accessibility posture for the shipped admin Media screen.

## 1) Component Registry

| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `Media` | The entire screen: list + upload form + per-row trash/purge actions. No props (top-level route component, reads/writes via the module-level `api` client). | Section 2.1 | Section 3.1 |

No `ItemCard`/`ConfirmActionDialog`/`EmptyState`/`ErrorBanner` sub-components exist — their responsibilities are inlined directly in `Media`'s JSX (a native `window.confirm(...)` stands in for a dialog component; a plain `<div className="notice error">` stands in for an error banner; a plain string ("Loading media…") stands in for an empty/loading state component).

## 2) Input Contracts (Props/Inputs)

### 2.1 `Media`
| Input | Required | Type | Notes |
|---|---|---|---|
| *(none)* | — | — | `Media` takes no props; it is mounted directly by the admin app's router/nav (`apps/admin/src/App.tsx`/`nav.ts`) and owns all its state internally via `useState`/`useRef`. |

### Internal State (not props, but the real state shape driving rendering)
| State | Type | Initial | Notes |
|---|---|---|---|
| `media` | `AdminMedia[] \| null` | `null` | `null` = not yet loaded; drives the "Loading media…" branch. |
| `error` | `string \| null` | `null` | Set from any thrown `Error`'s `.message`, or a hardcoded fallback string per action. |
| `uploading` | `boolean` | `false` | Disables the Upload button and swaps its label to "Uploading…" while `true`. |
| `altDraft` | `string` | `""` | Controlled input value for the optional alt-text field; cleared after a successful upload. |
| `fileInputRef` | `HTMLInputElement` ref | — | Used to read the selected `File` and to clear the input's value after a successful upload. |

## 3) Event Contracts (Outputs / Handlers)

### 3.1 `Media`
| Handler | Trigger | Behavior |
|---|---|---|
| `load()` | Mount (`useEffect(load, [])`), and again after every successful upload/trash/purge | Calls `api.listMedia()`; on success sets `media`; on failure sets `error` (message or `"failed to load media"` fallback) — does NOT clear `media` to `null` on a reload failure, so a stale list stays visible under the new error banner. |
| `upload()` | Click on the "Upload"/"Uploading…" button | No-ops silently if no file is selected (`fileInputRef.current?.files?.[0]` falsy — `return` with no error shown). Otherwise: sets `uploading=true`, clears `error`, base64-encodes the file, calls `api.uploadMedia({filename, contentType, dataBase64, alt})`, clears `altDraft` and the file input's value, calls `load()`; on any throw, sets `error` (message or `"upload failed"` fallback); `finally` sets `uploading=false`. |
| `trashOrPurge(item)` | Click on a row's action button | Clears `error`. If `item.status === "trashed"`: shows a native `window.confirm(`Permanently delete "${item.title}"? This cannot be undone.`)`; if the user declines, returns without calling the API. Otherwise (or on confirm): calls `api.deleteMedia(item.id)` (if trashed) or `api.trashMedia(item.id)` (if active), then `load()`; on any throw, sets `error` (message or `"delete failed"` fallback). |

## 4) Rendering and Interaction Rules

- [x] `error && !media` renders ONLY the error banner (`<div className="notice error">{error}</div>`) and nothing else — this is the sole full-screen error state.
- [x] `!media` (and no error, or error co-exists with a loaded list) renders `<div className="notice">Loading media…</div>` — this branch is reached whenever `media === null`, regardless of whether an error is also set, UNLESS the error-only branch above already matched. There is no distinct "empty list" message: an empty-but-loaded `media` array (`[]`) falls through to the table, which renders zero `<tr>` rows (an implicit, not explicit, empty state).
- [x] Once `media` is non-null, the error banner (if any) renders ABOVE the upload form and table, not instead of them — errors from `upload()`/`trashOrPurge()` do not blank the screen.
- [x] The Upload button is `disabled={uploading}` and its label swaps between `"Upload"` and `"Uploading…"`.
- [x] Each row's action button label is computed per-row from that row's own `status` (`"Delete permanently"` if `"trashed"`, else `"Trash"`) — not a single global toggle.
- [x] The file input's `accept` attribute is hardcoded to `"image/jpeg,image/png,image/webp,image/gif"`, matching the server's `DEFAULT_ALLOWED_MIME_TYPES` allowlist exactly (client-side hint only — the server independently re-validates; a user can still bypass the `accept` filter via drag-drop or a file manager's "all files" option).
- [x] The sha256 column always renders a truncated 12-hex-character prefix + `"…"`, with the full hash available only via the `title` HTML attribute (hover tooltip) — never the full string inline.
- [x] **No `<img>` element or any other byte-rendering element appears anywhere in this component** — every row's visual identity is `item.title`/`item.alt` text only, even though `GET /m/{id}/original.v1/....` is a live, reachable route that could supply a real thumbnail (`feature.spec.md` REQ-42, GAP-UI-STALE). The component's own file-header comment claims this is because "this pass has no byte-serving HTTP route" — that specific justification is now stale (the route exists), though the resulting behavior (no `<img>`) is still accurately described.

## 5) Accessibility Requirements

| Area | Requirement (as shipped) |
|---|---|
| Semantic roles | Standard native HTML elements only (`<table>`, `<button>`, `<input>`) — no custom ARIA roles are added or needed for the plain controls used. |
| Labels | The alt-text `<input>` has a `placeholder` ("Alt text (optional)") but no associated `<label>` element or `aria-label` — placeholder-only labeling is a known weaker pattern (not remediated in this build). |
| Keyboard | All interactive elements are native `<button>`/`<input>` — standard tab order and keyboard activation work without additional wiring; no custom key handlers were added or are needed. |
| Status updates | No ARIA live region announces async state changes (list reload, upload completion, error text appearing) — a screen-reader user gets no explicit announcement beyond whatever the browser/AT infers from DOM mutation. This is a real, undisclosed-until-now gap, not a documented exception in the component's own comments. |
| Error clarity | The error `<div>` has no `role="alert"` or equivalent; it is a plain, unassociated block, not programmatically tied to the triggering control. |

## 6) Composition Rules

- `Media` is the only exported component from this file and the only public entry point for this admin section.
- No internal helper components are extracted — `trashOrPurge`/`upload`/`load` are plain closures, not components.

## 7) Acceptance Checklist
- [x] The one public component has an explicit input and event contract.
- [x] Rendering conditions are deterministic (documented in §4, including the co-existing-error-and-list case).
- [x] Accessibility posture is documented, including its real gaps (not assumed compliant).
- [x] Entity names (`AdminMedia`, `status` enum) align with `api.spec.md`/`state.spec.md`.
