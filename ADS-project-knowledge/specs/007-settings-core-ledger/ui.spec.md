# UI Contract Spec: Settings (Core-Only Layered Ledger)

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-007`
- Feature: `FEAT-007-settings-core-ledger`
- Version: `0.1.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-11T16:55:07Z`

## Purpose
Defines the Settings admin screen component contracts, events, rendering conditions, and
accessibility requirements independent of framework. The screen lives in `apps/admin` and consumes
the `api.spec.md` endpoints. It is the only settings UI in this subset (no plugin/theme sandboxed
panels — ADR-025, out of scope).

## 1) Component Registry
| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `SettingsContainer` | Top-level screen wiring; loads definitions + effective values | 2.1 | 3.1 |
| `NamespaceGroupList` | Lists definitions grouped by namespace | 2.2 | 3.2 |
| `SettingRow` | One setting: name, effective value, source-layer badge | 2.3 | 3.3 |
| `SettingDetailPanel` | Effective + per-layer values + default; scope editor | 2.4 | 3.4 |
| `ValueEditor` | Scope-aware value input validated against the schema | 2.5 | 3.5 |
| `ResetNamespaceDialog` | Confirms a namespace reset-to-defaults | 2.6 | 3.6 |
| `EmptyState` | Renders when no definitions exist | 2.7 | n/a |
| `ErrorBanner` | Renders recoverable errors + retry | 2.8 | 3.8 |

## 2) Input Contracts (Props/Inputs)
### 2.1 SettingsContainer
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `scopeContext` | yes | `object {workspaceId?: string, principalId?: string}` | `{}` | Which layers to resolve against |
| `canWriteScopes` | yes | `object {global: boolean, workspace: boolean, userSelf: boolean, userOther: boolean}` | all `false` | Derived from the operator's `settings.*` grants; gates editor affordances |
| `canManageDefinitions` | yes | `boolean` | `false` | Gates definition-lifecycle affordances |
| `canReset` | yes | `object {global: boolean, workspace: boolean, user: boolean}` | all `false` | Gates the reset control per scope |

### 2.2 NamespaceGroupList
| Input | Required | Type | Notes |
|---|---|---|---|
| `groups` | yes | `array<{namespace: string, settings: array<SettingSummary>}>` | empty list allowed |
| `isLoading` | yes | `boolean` | shows loading skeleton |
| `selectedKey` | no | `string|null` | selected row styling |

### 2.3 SettingRow
| Input | Required | Type | Notes |
|---|---|---|---|
| `summary` | yes | `SettingSummary` | `{namespace, key, effectiveValue, sourceLayer, status}` |
| `isSelected` | no | `boolean` | selected styling |

### 2.4 SettingDetailPanel
| Input | Required | Type | Notes |
|---|---|---|---|
| `detail` | yes | `object {effective, global, workspace, user, default, defVersion, scopes}` | per-layer values; `null` layer = not set |
| `editableScopes` | yes | `array<string>` | intersection of `definition.scopes` and `canWriteScopes` |

### 2.5 ValueEditor
| Input | Required | Type | Notes |
|---|---|---|---|
| `schema` | yes | `object` | the definition schema; drives the input control + client validation |
| `scope` | yes | `string` | `global | workspace | user` |
| `currentValue` | no | `object|null` | pre-fills the field; `null` = inherit |
| `disabled` | no | `boolean` | true when the operator cannot write this scope |

### 2.6 ResetNamespaceDialog
| Input | Required | Type | Notes |
|---|---|---|---|
| `namespace` | yes | `string` | shown in confirm copy |
| `scope` | yes | `string` | which layer will be cleared |

### 2.7 EmptyState / 2.8 ErrorBanner
| Input | Required | Type | Notes |
|---|---|---|---|
| `message` | yes | `string` | EmptyState copy / latest recoverable error |
| `onRetry` | no | `callback()` | ErrorBanner only |

## 3) Event Contracts (Outputs)
### 3.1 Container-Level
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onValueSaved` | `{key, scope, revisionSeq}` | successful set/clear | detail panel refreshes effective value once |
| `onNamespaceReset` | `{namespace, scope, clearedCount}` | successful reset | group refreshes to defaults once |

### 3.2 NamespaceGroupList / 3.3 SettingRow
| Event | Payload | Trigger |
|---|---|---|
| `onSelectSetting` | `key` | row click / Enter key |

### 3.4 SettingDetailPanel / 3.5 ValueEditor
| Event | Payload | Trigger |
|---|---|---|
| `onSubmitValue` | `{key, scope, valueJson}` | save control activation on a permitted scope |
| `onClearValue` | `{key, scope}` | clear control activation |

### 3.6 ResetNamespaceDialog / 3.8 ErrorBanner
| Event | Payload | Trigger |
|---|---|---|
| `onConfirmReset` | `{namespace, scope}` | confirm control activation |
| `onRetry` | none | retry control activation |

## 4) Rendering and Interaction Rules
- [ ] EmptyState renders when `groups.length == 0` and `isLoading == false`.
- [ ] Loading skeleton renders while the initial definitions+effective load is in-flight.
- [ ] The save control in `ValueEditor` is disabled when the scope is not in `editableScopes`.
- [ ] A scope not present in the definition's `scopes` bitmask is not offered as an editable scope.
- [ ] The reset control renders only when `canReset[scope]` is true.
- [ ] The source-layer badge on `SettingRow` reflects the resolved `sourceLayer` (user/workspace/global/default).
- [ ] `ValueEditor` shows an inline validation error (mapped from `VALUE_VALIDATION_FAILED`) and blocks submit until valid.
- [ ] `ErrorBanner` displays the latest recoverable error with a retry affordance.

## 5) Accessibility Requirements
| Area | Requirement |
|---|---|
| Semantic roles | Interactive elements use correct roles (`button`, `dialog`, `list`, `listitem`). |
| Labels | Every value input has an accessible name derived from the setting key/label. |
| Keyboard | Full keyboard operation; visible focus; dialog traps focus. |
| Status updates | Save/reset outcomes announced via an ARIA live region. |
| Error clarity | Validation and API errors are announced and associated with the offending field. |

## 6) Composition Rules
- `SettingsContainer` is the only public entry component.
- `SettingRow` is rendered only within `NamespaceGroupList`.
- `ResetNamespaceDialog` may be rendered only when a reset is pending confirmation.
- `ValueEditor` is rendered only within `SettingDetailPanel`.

## 7) Acceptance Checklist
- [ ] Each public component has explicit input and event contracts.
- [ ] Rendering conditions are deterministic.
- [ ] Accessibility requirements are testable.
- [ ] Entity names and statuses align with `state.spec.md` and `api.spec.md`.
