# UI Contract Spec: redirects

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-009`
- Feature: `FEAT-009-redirects`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-12T00:00:00Z`

## Purpose
Defines the admin UI component contracts for the Redirects section, following the existing
convention in `apps/admin/src/sections/Menus.tsx` + `MenuEditor.tsx`: a plain list screen
(`useState`/`useEffect` + a thin `api` client wrapper, no state-management library) plus a
dedicated edit screen, hash-routed (`#/redirects`, `#/redirects/:id`, `#/redirects/new`).

## 1) Component Registry
| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `Redirects` | List screen: table of rules + filters + add/tombstone actions | Section 2.1 | Section 3.1 |
| `RedirectRow` | Presents a single rule row within the list table | Section 2.2 | Section 3.2 |
| `RedirectEditor` | Create/edit form for a single rule | Section 2.3 | Section 3.3 |
| `RedirectHitBadge` | Read-only display of a rule's aggregate hit stats | Section 2.4 | n/a |
| `RedirectImportDialog` | Confirms + submits a batch import (REQ-26) | Section 2.5 | Section 3.5 |
| `ErrorBanner` | Renders recoverable errors from any list/form action | Section 2.6 | Section 3.6 |

## 2) Input Contracts (Props/Inputs)

### 2.1 `Redirects` (list screen)
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `workspaceId` | yes | `string (uuid)` | none | passed to the `api` client |
| `statusFilter` | no | `'active' \| 'disabled' \| null` | `null` | client-side filter |
| `sourceFilter` | no | `'manual' \| 'auto_slug_change' \| 'import' \| null` | `null` | client-side filter |

### 2.2 `RedirectRow`
| Input | Required | Type | Notes |
|---|---|---|---|
| `rule` | yes | `RedirectRecord` | — |
| `onTombstone` | yes | `callback(ruleId)` | fires the tombstone action |
| `onEdit` | yes | `callback(ruleId)` | navigates to `#/redirects/:id` |

### 2.3 `RedirectEditor`
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `ruleId` | no | `string (uuid) \| null` | `null` | `null` = create mode |
| `initialValues` | no | `Partial<RedirectRecord>` | `{}` | prefilled when editing |
| `onSaved` | no | `callback(rule)` | none | navigates back to list |
| `onCancel` | no | `callback()` | none | discards and navigates back |

### 2.4 `RedirectHitBadge`
| Input | Required | Type | Notes |
|---|---|---|---|
| `stats` | yes | `RedirectHitStats \| null` | `null` renders "no hits yet" |

### 2.5 `RedirectImportDialog`
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `open` | yes | `boolean` | `false` | dialog visibility |
| `onConfirm` | yes | `callback(rules: CreateRedirectInput[])` | none | submits the batch |
| `onCancel` | yes | `callback()` | none | closes without submitting |

### 2.6 `ErrorBanner`
| Input | Required | Type | Notes |
|---|---|---|---|
| `message` | yes | `string \| null` | `null` renders nothing |

## 3) Event Contracts (Outputs)

### 3.1 `Redirects` (list-level)
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| navigate-to-new | none | "Add redirect" button click | route to `#/redirects/new` |
| navigate-to-edit | `ruleId` | row edit click | route to `#/redirects/:id` |
| tombstone-request | `ruleId` | row tombstone button click | confirm dialog (matches `Menus.tsx`'s `window.confirm` pattern for destructive actions), then API call + list reload |

### 3.2 `RedirectRow` Events
| Event | Payload | Trigger |
|---|---|---|
| `onEdit` | `ruleId` | row click / edit control activation |
| `onTombstone` | `ruleId` | tombstone control activation |

### 3.3 `RedirectEditor` Events
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onSaved` | saved `RedirectRecord` | successful create/update | parent navigates to list, shows updated row |
| `onCancel` | none | cancel button / navigate-away | discard unsaved changes, no API call |
| validation-error | field-level message from `REDIRECT_VALIDATION_ERROR`/`REDIRECT_TARGET_NOT_ALLOWED` | failed save | inline error shown next to the offending field (`fromPattern` or `toTarget`), form remains editable |

### 3.5 `RedirectImportDialog` Events
| Event | Payload | Trigger |
|---|---|---|
| `onConfirm` | parsed rule array | confirm button click |
| `onCancel` | none | cancel button / dialog dismiss |

### 3.6 `ErrorBanner` Events
None — display-only.

## 4) Rendering and Interaction Rules
- [ ] The match-type select in `RedirectEditor` renders exactly three options in v1:
  `exact`, `prefix`, `wildcard` — `regex` is never rendered as a selectable option
  (REQ-24), even though the underlying type vocabulary includes it.
- [ ] The `source` field is read-only display, never an editable form control — `manual`
  is implied for anything created through `RedirectEditor`; `auto_slug_change` and
  `import` rows can only be viewed/tombstoned, never created via this form (REQ-25).
- [ ] `override` renders as a checkbox with an inline warning ("this rule will intercept a
  live URL") since it requires `admin.redirects.manage` and has user-visible traffic
  impact.
- [ ] The status-code select offers all four values (`301, 302, 307, 308`) per OQ-03's
  assumption; `301` is the pre-selected default on create.
- [ ] A rule row for an `auto_slug_change` source shows a distinct badge/label
  distinguishing it from `manual`/`import` rows.
- [ ] `RedirectHitBadge` renders "no hits yet" when `stats` is `null` or `hitCount === 0`.
- [ ] Loading skeleton renders while the initial rule-list fetch is in-flight.
- [ ] `ErrorBanner` displays the latest recoverable error from list or form actions.

## 5) Accessibility Requirements
| Area | Requirement |
|---|---|
| Semantic roles | Table markup for the rule list; form controls use native `input`/`select`/`button`; the tombstone confirmation uses a native `confirm()` dialog (matches existing `Menus.tsx` convention) or an accessible `dialog` role if replaced with a custom component. |
| Labels | Every form field (`matchType`, `fromPattern`, `toTarget`, `statusCode`, `override`, `priority`) has an associated accessible label. |
| Keyboard | Full keyboard operation for the list (row actions reachable via Tab) and the editor form. |
| Status updates | Save success/failure and tombstone success/failure are announced via a visible, non-modal status message (matches the existing `notice`/`notice error` class pattern in `Menus.tsx`). |
| Error clarity | Field-level validation errors (`REDIRECT_VALIDATION_ERROR`, `REDIRECT_TARGET_NOT_ALLOWED`) are associated with their specific input, not only shown in the global `ErrorBanner`. |

## 6) Composition Rules
- `Redirects` is the only public entry component for the list route.
- `RedirectRow` is rendered only within `Redirects`'s table body.
- `RedirectEditor` is the only public entry component for the create/edit route
  (`#/redirects/new`, `#/redirects/:id`).
- `RedirectImportDialog` may be rendered only when an import action is pending
  confirmation.
- `RedirectHitBadge` is rendered within `RedirectRow` and/or `RedirectEditor`'s read-only
  detail view; it is never a standalone route.

## 7) Acceptance Checklist
- [x] Each public component has explicit input and event contracts.
- [x] Rendering conditions are deterministic.
- [x] Accessibility requirements are testable.
- [x] Entity names and statuses align with `state.spec.md` and `api.spec.md`.
