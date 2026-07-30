# UI Contract Spec: forms

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-010`
- Feature: `FEAT-010-forms`
- Version: `1.0.0`
- Content Hash: `sha256:PENDING`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Defines the Forms admin UI's component contracts, interaction events, rendering conditions, and
accessibility requirements. Mirrors the existing `apps/admin/src/sections/{Members,Posts,
IntegrationDeliveries}.tsx` fetch/loading/error/table convention (`useState`/`useEffect`,
no Redux-style store in this admin app) — no new `orchestrator.spec.md` layer is warranted (see
`spec-manifest.md`).

## 1) Component Registry
| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `FormsList` | Lists all form definitions in the workspace | Section 2.1 | Section 3.1 |
| `FormEditor` | View/create/edit one form definition's name, fields, notify config, status | Section 2.2 | Section 3.2 |
| `FormFieldsEditor` | Structured (non-drag-drop) editor for the `fields[]` array, one row per field | Section 2.3 | Section 3.3 |
| `FormSubmissions` | Lists submissions for one form definition | Section 2.4 | Section 3.4 |
| `FormSubmissionDetail` | Shows one submission's full field values | Section 2.5 | Section 3.5 |

## 2) Input Contracts (Props/Inputs)

### 2.1 FormsList
| Input | Required | Type | Notes |
|---|---|---|---|
| (none — top-level route component) | | | Fetches `listFormDefinitions` on mount, mirrors `Posts.tsx`/`Members.tsx` |

### 2.2 FormEditor
| Input | Required | Type | Notes |
|---|---|---|---|
| `formId` | no | `string \| "new"` | `"new"` renders the create form; an id loads and edits an existing definition |

### 2.3 FormFieldsEditor
| Input | Required | Type | Notes |
|---|---|---|---|
| `fields` | yes | `array<FieldDescriptor>` | Current field list |
| `existingFieldIds` | no | `array<string>` | When editing (not creating), the set of ids that must not be removed (behavior.spec.md §1.2) |
| `onChange` | yes | `callback(fields: FieldDescriptor[])` | Fires on every add/edit/remove/reorder |

### 2.4 FormSubmissions
| Input | Required | Type | Notes |
|---|---|---|---|
| `formId` | yes | `string` | |

### 2.5 FormSubmissionDetail
| Input | Required | Type | Notes |
|---|---|---|---|
| `formId` | yes | `string` | |
| `submissionId` | yes | `string` | |

## 3) Event Contracts (Outputs)

### 3.1 FormsList Events
| Event | Payload | Trigger |
|---|---|---|
| `onFormSelect` | `formId` | row click — navigates to `FormEditor` |
| `onNewForm` | none | "New form" control activation — navigates to `FormEditor` with `formId="new"` |

### 3.2 FormEditor Events
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onSave` | full definition payload | Save control activation | `POST`/`PUT` call; on success, editor re-fetches and shows saved values (mirrors `Appearance.tsx` save-and-refetch convention) |
| `onStatusToggle` | `{status: "active" \| "disabled"}` | Status switch activation | `PUT` with only `status` in the patch |
| `onViewSubmissions` | `formId` | "Submissions" tab activation | navigates to `FormSubmissions` |

### 3.3 FormFieldsEditor Events
| Event | Payload | Trigger |
|---|---|---|
| `onAddField` | none | "Add field" control activation — appends a blank `text` field row |
| `onRemoveField` | `fieldId` | Remove-row control activation — disabled (see §4) when `fieldId ∈ existingFieldIds` |
| `onFieldTypeChange` | `{fieldId, type}` | Field-type select change |

### 3.4 FormSubmissions Events
| Event | Payload | Trigger |
|---|---|---|
| `onSubmissionSelect` | `submissionId` | row click — navigates to `FormSubmissionDetail` |
| `onLoadMore` | `cursor` | load-more control activation |

### 3.5 FormSubmissionDetail Events
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onDelete` | `submissionId` | Delete control activation, after an inline confirm | `DELETE` call; on success, navigates back to `FormSubmissions` |

## 4) Rendering and Interaction Rules
- [ ] `FormsList` shows an empty state ("No forms yet.") when `listFormDefinitions` returns `[]`.
- [ ] `FormEditor`'s slug field is editable only when `formId === "new"` — immutable on every
  subsequent edit (behavior.spec.md §1.1), rendered read-only/disabled otherwise.
- [ ] `FormFieldsEditor`'s remove-row control is disabled for any field whose `id` is in
  `existingFieldIds` (behavior.spec.md §1.2 — existing field ids cannot be removed from a
  definition once submissions may reference them), with a tooltip explaining why.
- [ ] `FormFieldsEditor`'s `maxLength` input is hidden/disabled when `type === "checkbox"`
  (behavior.spec.md §4).
- [ ] `FormSubmissions` shows an empty state ("No submissions yet.") when the list is empty
  (EC-08), distinct from its loading state.
- [ ] `FormSubmissionDetail`'s delete control requires an inline confirmation step before firing
  `onDelete` — mirrors this admin app's existing destructive-action confirm convention.
- [ ] Save/delete controls are disabled while their respective request is in flight.

## 5) Accessibility Requirements
| Area | Requirement |
|---|---|
| Semantic roles | Interactive elements use correct roles (`button`, `table`, `list`, etc.), matching the existing `list-table` convention used by `Members.tsx`/`IntegrationDeliveries.tsx`. |
| Labels | Every field-editor row control and every notify-recipient input has an accessible name. |
| Keyboard | Full keyboard operation with visible focus states, including the fields editor's add/remove controls. |
| Status updates | Save/delete success and failure are announced (e.g. via an ARIA live region or an inline banner matching `save-error` class usage elsewhere in this app). |
| Error clarity | Field-validation errors from `FORMS_FIELD_VALIDATION_ERROR`/`FORMS_SUBMISSION_VALIDATION_ERROR` are associated with the specific offending field, not shown only as a generic banner. |

## 6) Composition Rules
- `FormsList` and `FormEditor` are the two public entry routes (`#/forms`, `#/forms/:formId`).
- `FormFieldsEditor` is rendered only within `FormEditor`.
- `FormSubmissions` is reached only from `FormEditor`'s "Submissions" tab (a form must exist
  before its submissions can be viewed).
- `FormSubmissionDetail` is rendered only within `FormSubmissions`' navigation flow.
- No drag-and-drop reordering surface exists anywhere in this contract (out of scope, per
  `feature.spec.md` Scope).

## 7) Acceptance Checklist
- [x] Each public component has explicit input and event contracts.
- [x] Rendering conditions are deterministic.
- [x] Accessibility requirements are testable.
- [x] Entity names and statuses align with `state.spec.md` and `api.spec.md`.
