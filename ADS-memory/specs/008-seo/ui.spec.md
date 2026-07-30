# UI Contract Spec: seo

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-008`
- Feature: `FEAT-008-seo`
- Version: `1.0.0`
- Content Hash: `sha256:5647a1176b49a39923b174865ecebeec4115078ec0625c6a58087815c4e0e128`
- Last Edited: `2026-07-13T20:18:23Z`

## Purpose
Defines UI component contracts for the two admin surfaces this spec builds: a per-entry SEO panel embedded in the existing Post/Page editor, and a dedicated `/admin/seo` site-settings screen. Follows the same `useState`/`useEffect` + direct `api.*` call convention as `apps/admin/src/sections/Appearance.tsx` — no separate Redux-style orchestrator layer (hence `orchestrator.spec.md` is OMITTED, see `spec-manifest.md`).

## 1) Component Registry
| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `SeoEntryPanel` | Per-entry SEO override editor + effective-meta preview, embedded as a tab/section inside the existing Post/Page editor | Section 2.1 | Section 3.1 |
| `SeoMetaPreview` | Read-only rendering of the effective (resolved) `SeoMeta` — title/description/canonical/robots/OG/Twitter/JSON-LD summary | Section 2.2 | n/a |
| `SeoAnalysisPanel` | Displays `analyzeEntry` score + issues list (P2) | Section 2.3 | Section 3.3 |
| `SeoSettingsScreen` | Top-level `/admin/seo` screen — workspace-level `seo.*` settings form + sitemap regenerate action | Section 2.4 | Section 3.4 |
| `RobotsRuleEditor` | Add/edit/remove per-user-agent allow/disallow rules within `SeoSettingsScreen` | Section 2.5 | Section 3.5 |
| `SitemapRegenerateButton` | Triggers `SEO_POST_SITEMAP_REGENERATE` and shows in-flight/result state | Section 2.6 | Section 3.6 |
| `ErrorBanner` | Renders recoverable validation/authorization errors from either surface | Section 2.7 | Section 3.7 |

## 2) Input Contracts (Props/Inputs)

### 2.1 SeoEntryPanel
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `workspaceId` | yes | `string (uuid)` | none | |
| `entryId` | yes | `string (uuid)` | none | The post/page being edited |
| `entryTitle` | yes | `string` | none | Passed from the parent editor, used only for the "no override" preview hint text |

### 2.2 SeoMetaPreview
| Input | Required | Type | Notes |
|---|---|---|---|
| `effective` | yes | `SeoMeta` | Read-only; rendered as labeled fields, never editable here |
| `isLoading` | yes | `boolean` | Shows a loading skeleton while `SEO_GET_ENTRY_META` is in flight |

### 2.3 SeoAnalysisPanel
| Input | Required | Type | Notes |
|---|---|---|---|
| `workspaceId` | yes | `string (uuid)` | |
| `entryId` | yes | `string (uuid)` | |
| `autoFetch` | no | `boolean` | Default `true` — fetches `SEO_GET_ENTRY_ANALYZE` on mount, matching `Appearance`'s `useEffect`-on-mount convention |

### 2.4 SeoSettingsScreen
| Input | Required | Type | Notes |
|---|---|---|---|
| `workspaceId` | yes | `string (uuid)` | Top-level route component; no props beyond workspace context (mirrors `Appearance`, which takes no props at all) |

### 2.5 RobotsRuleEditor
| Input | Required | Type | Notes |
|---|---|---|---|
| `rules` | yes | `array<RobotsRule>` | |
| `onChange` | yes | `callback(rules: array<RobotsRule>)` | Fires on every add/edit/remove; parent owns the actual save action |
| `maxRules` | no | `integer` | Default `50` (matches `api.spec.md` §4 `maxItems`) — add control disables at the limit |

### 2.6 SitemapRegenerateButton
| Input | Required | Type | Notes |
|---|---|---|---|
| `workspaceId` | yes | `string (uuid)` | |
| `disabled` | no | `boolean` | Default `false` — set `true` while another save is in flight |

### 2.7 ErrorBanner
| Input | Required | Type | Notes |
|---|---|---|---|
| `error` | yes | `string \| null` | Human-readable message derived from the error envelope (`errors.spec.md` §1) |

## 3) Event Contracts (Outputs)

### 3.1 SeoEntryPanel
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onSaved` | `SeoEntryMetaResponse` | successful `SEO_PUT_ENTRY_META` | Panel re-renders `SeoMetaPreview` with the fresh `effective` value |
| `onSaveFailed` | `{code: string, message: string}` | failed `SEO_PUT_ENTRY_META` | `ErrorBanner` shows the message; none of the in-progress field edits are discarded (user can retry without re-typing) |

### 3.3 SeoAnalysisPanel Events
| Event | Payload | Trigger |
|---|---|---|
| `onAnalyzed` | `SeoAnalysisResponse` | successful fetch |
| `onAnalyzeFailed` | `{code: string, message: string}` | failed fetch |

### 3.4 SeoSettingsScreen Events
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onSettingsSaved` | `SeoSettingsResponse` | successful `SEO_PUT_SETTINGS` | Form re-renders with saved values; success toast/notice shown |
| `onSettingsSaveFailed` | `{code: string, message: string}` | failed `SEO_PUT_SETTINGS` | `ErrorBanner` shows the message; form retains the user's unsaved edits |

### 3.5 RobotsRuleEditor Events
| Event | Payload | Trigger |
|---|---|---|
| `onChange` | `array<RobotsRule>` | any add/edit/remove interaction |

### 3.6 SitemapRegenerateButton Events
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onRegenerateStarted` | none | click | Button shows a busy state, disables itself |
| `onRegenerateSucceeded` | `SeoSitemapRegenerateResponse` | `202` response | Busy state clears; success confirmation shown |
| `onRegenerateFailed` | `{code: string, message: string}` | non-`2xx` response | Busy state clears; `ErrorBanner` shows the message |

### 3.7 ErrorBanner Events
None — display-only.

## 4) Rendering and Interaction Rules
- [ ] `SeoMetaPreview` renders a loading skeleton while `isLoading == true` and never shows stale data alongside the skeleton.
- [ ] `SeoEntryPanel`'s save control is disabled while a save is in flight (prevents duplicate concurrent `PUT`s from one panel instance).
- [ ] `SeoAnalysisPanel` renders only if the acting principal holds `admin.seo.manage` (same gate as the rest of the panel; a `403` from `SEO_GET_ENTRY_ANALYZE` hides the panel rather than showing an error banner, since absence of the permission is an expected state, not a failure).
- [ ] `RobotsRuleEditor`'s "add rule" control is disabled once `rules.length === maxRules`.
- [ ] `SitemapRegenerateButton` is disabled while `disabled == true` or while its own request is in flight.
- [ ] `ErrorBanner` displays the latest recoverable error and clears automatically on the next successful action of the same kind.

## 5) Accessibility Requirements
| Area | Requirement |
|---|---|
| Semantic roles | Form fields use native `<label>`/`<input>`/`<textarea>` associations; `RobotsRuleEditor`'s repeating rows use `role="group"` with an accessible name per row. |
| Labels | Every SEO override field and every settings field has a visible, associated label (no placeholder-only labeling). |
| Keyboard | All editor and settings interactions (add/remove rule, save, regenerate) are reachable and operable via keyboard alone, with visible focus states. |
| Status updates | Save/regenerate success and failure are announced via an ARIA live region (or equivalent), not color/icon alone. |
| Error clarity | Field-level validation errors (e.g. `SEO_FIELD_VALIDATION_ERROR` details) are associated with their specific field via `aria-describedby` or equivalent, not only surfaced in a top-level banner. |

## 6) Composition Rules
- `SeoEntryPanel` is the only public entry component for the per-entry surface; it is mounted only inside the existing Post/Page editor, never standalone.
- `SeoSettingsScreen` is the only public entry component for the site-level surface; it is mounted at `/admin/seo`.
- `SeoMetaPreview` is rendered only within `SeoEntryPanel`.
- `SeoAnalysisPanel` is rendered only within `SeoEntryPanel`, below `SeoMetaPreview`.
- `RobotsRuleEditor` and `SitemapRegenerateButton` are rendered only within `SeoSettingsScreen`.
- `ErrorBanner` may be rendered by either top-level component; it is not itself mounted standalone.

## 7) Acceptance Checklist
- [x] Each public component has explicit input and event contracts.
- [x] Rendering conditions are deterministic.
- [x] Accessibility requirements are testable.
- [x] Entity names and statuses align with `state.spec.md`.
