# UI Contract Spec: backups-recovery

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-019`
- Feature: `FEAT-019-backups-recovery`
- Version: `1.1.0`
- Content Hash: `sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d`
- Last Edited: `2026-07-14T23:30:00Z`

## Purpose
Defines the Recovery screen's component contracts, per ADR-045 §3's screen structure: the
capability/status bar, the restore-points list, and the five-step restore flow (plan → disclosure →
confirm → execute → completion), independent of frontend framework.

## 1) Component Registry
| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `RecoveryScreen` | Top-level screen wiring, route `/admin/recovery` | Section 2.1 | Section 3.1 |
| `CapabilityStatusBar` | Renders `costClass` + in-flight/degraded indicators | Section 2.2 | n/a |
| `RestorePointList` | Presents restore-point rows, newest-first | Section 2.3 | Section 3.3 |
| `RestorePointRow` | Presents a single restore point | Section 2.4 | Section 3.4 |
| `DegradedStateBanner` | Renders `unavailable`/`PENDING_MIGRATION`/`migration.interrupted` banners | Section 2.5 | Section 3.5 |
| `RestorePlanPreview` | Renders Step 1 plan output | Section 2.6 | n/a |
| `DiscardedWindowDisclosure` | Renders Step 2's blocking, itemized disclosure | Section 2.7 | Section 3.7 |
| `ConfirmRestoreDialog` | Step 3 human-confirm control | Section 2.8 | Section 3.8 |
| `RestoreProgressPanel` | Step 4 non-dismissable live progress | Section 2.9 | n/a |
| `RestoreCompletionView` | Step 5 completion + deep-link to Storage | Section 2.10 | Section 3.10 |

## 2) Input Contracts (Props/Inputs)
### 2.1 RecoveryScreen
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `deepLinkEnvelope` | no | `StorageContextEnvelope \| null` | `null` | Carried, untrusted (REQ-20) |
| `onNavigateToStorageTimeline` | yes | `callback(correlationId)` | none | Used by completion view and PENDING_MIGRATION banner |

### 2.2 CapabilityStatusBar
| Input | Required | Type | Notes |
|---|---|---|---|
| `costClass` | yes | `'cheap'\|'expensive'\|'unavailable'` | REQ-03 |
| `operationInFlight` | yes | `boolean` | REQ-03, REQ-13 |
| `operationInFlightKind` | no | `'restore'\|'migration'\|null` | disambiguates the in-flight label |

### 2.3 RestorePointList
| Input | Required | Type | Notes |
|---|---|---|---|
| `items` | yes | `array<RestorePointSummary>` | empty list allowed |
| `isLoading` | yes | `boolean` | shows loading skeleton |
| `costClass` | yes | `'cheap'\|'expensive'\|'unavailable'` | drives per-row restorability (INV-01) |
| `operationInFlight` | yes | `boolean` | drives per-row restorability (INV-03) |
| `focusedRestorePointId` | no | `string \| null` | pre-focus from a deep link (REQ-20) |

### 2.4 RestorePointRow
| Input | Required | Type | Notes |
|---|---|---|---|
| `restorePoint` | yes | `RestorePointSummary` | see `state.spec.md` §2 |
| `canRestore` | yes | `boolean` | `false` whenever `costClass === 'unavailable'` or an operation is in flight |
| `isFocused` | no | `boolean` | visual highlight from a deep-link arrival |

### 2.5 DegradedStateBanner
| Input | Required | Type | Notes |
|---|---|---|---|
| `kind` | yes | `'cost-unavailable'\|'watermark-unavailable'\|'operation-in-flight'\|'pending-migration'\|'migration-interrupted'` | one banner kind at a time per Section 4 |
| `onPrimaryAction` | yes | `callback()` | for `pending-migration`/`migration-interrupted`, deep-links to Storage (REQ-17, REQ-19, INV-07); for `cost-unavailable`, opens the runbook pointer |

### 2.6 RestorePlanPreview
| Input | Required | Type | Notes |
|---|---|---|---|
| `plan` | yes | `BackupRestorePlanResponse` | REQ-07 |

### 2.7 DiscardedWindowDisclosure
| Input | Required | Type | Notes |
|---|---|---|---|
| `coveredCategories` | yes | `array<string>` | REQ-09 |
| `counts` | yes | `Record<string, integer \| 'unknown'>` | REQ-09, REQ-11 |
| `partial` | yes | `boolean` | always `true` when present (REQ-09) — component renders nothing else if this is ever `false` |
| `watermarkBaselineAvailable` | yes | `boolean` | `false` triggers the "could not be computed" copy path (REQ-11) |
| `acknowledged` | yes | `boolean` | bound to `restoreFlow.disclosureAcknowledged` |
| `onAcknowledge` | yes | `callback(boolean)` | fires only on an explicit operator interaction with the caveat-text control (REQ-10) |

### 2.8 ConfirmRestoreDialog
| Input | Required | Type | Notes |
|---|---|---|---|
| `disclosureAcknowledged` | yes | `boolean` | gates the confirm control's enabled state (REQ-08, INV-02) |
| `planId` / `planHash` | yes | `string` | forwarded to `confirm()` unchanged |

### 2.9 RestoreProgressPanel
| Input | Required | Type | Notes |
|---|---|---|---|
| `state` | yes | `'QUIESCING'\|'SNAPSHOTTING'\|'RESTORING'\|'RESTORED'\|'RESTORE_FAILED'` | polled live (REQ-14) |
| `isDismissable` | yes | `boolean` | `false` for non-terminal states (REQ-15) |

### 2.10 RestoreCompletionView
| Input | Required | Type | Notes |
|---|---|---|---|
| `finalState` | yes | `'RESTORED'\|'RESTORE_FAILED'` | |
| `onNavigateToStorageTimeline` | yes | `callback()` | REQ-16 |

## 3) Event Contracts (Outputs)
### 3.1 RecoveryScreen
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onDeepLinkResolved` | `RecoveryContextResponse` | server re-lookup of `deepLinkEnvelope` completes | list pre-focuses the resolved restore point, or falls back to unfocused (REQ-21) |

### 3.3 RestorePointList Events
| Event | Payload | Trigger |
|---|---|---|
| `onRestorePointSelect` | `restorePointId` | row click / Enter key, only when `canRestore` is true for that row |
| `onCreateRestorePointRequest` | none | "Create restore point" control activation (`backup.create`) |

### 3.4 RestorePointRow Events
| Event | Payload | Trigger |
|---|---|---|
| `onRestoreRequest` | `restorePointId` | "Restore" control activation — only rendered when `canRestore` is true |

### 3.5 DegradedStateBanner Events
| Event | Payload | Trigger |
|---|---|---|
| `onPrimaryActionActivate` | none | banner's single action control activation |

### 3.7 DiscardedWindowDisclosure Events
| Event | Payload | Trigger |
|---|---|---|
| `onAcknowledgeToggle` | `boolean` | operator interacts with the caveat-text acknowledge control (REQ-10) |

### 3.8 ConfirmRestoreDialog Events
| Event | Payload | Trigger |
|---|---|---|
| `onConfirm` | `{planId, planHash, disclosureAcknowledged}` | confirm control activation — only enabled when `disclosureAcknowledged === true` |
| `onCancel` | none | cancel control activation |

### 3.10 RestoreCompletionView Events
| Event | Payload | Trigger |
|---|---|---|
| `onNavigateToStorageTimelineActivate` | `correlationId` | deep-link control activation (REQ-16) |

## 4) Rendering and Interaction Rules
- [x] `RestorePointRow`'s restore control renders only when `canRestore === true`; when `costClass ===
      'unavailable'` or an operation is in flight, no restore control renders at all — not a disabled one
      (REQ-12, INV-01, INV-03).
- [x] `DegradedStateBanner` renders at most one banner kind at a time; when both `migration-interrupted`
      and `pending-migration` conditions are true, `migration-interrupted` takes visual precedence (EC-06).
- [x] `ConfirmRestoreDialog`'s confirm control is disabled whenever `disclosureAcknowledged === false`
      (REQ-08, INV-02).
- [x] `RestoreProgressPanel` renders no close/dismiss control while `state` is `QUIESCING`, `SNAPSHOTTING`,
      or `RESTORING` (REQ-15).
- [x] `DiscardedWindowDisclosure` never renders a category not present in `coveredCategories`, even if the
      caller-supplied `counts` object contains extra keys (REQ-09, INV-05 — the component itself enforces
      this as a defense-in-depth rendering rule, not only a server-side one).
- [x] `RestorePointList` never renders an "empty" state that hides the `CapabilityStatusBar` — the status
      bar is always visible regardless of list content, since it carries the degraded-mode signal.

## 5) Accessibility Requirements
| Area | Requirement |
|---|---|
| Semantic roles | `ConfirmRestoreDialog` uses `role="alertdialog"`; `RestoreProgressPanel` uses `aria-live="assertive"` while non-terminal. |
| Labels | The disclosure's acknowledge control has an accessible name that includes the partial-coverage caveat text, not just "Acknowledge." |
| Labels | `DegradedStateBanner`'s `migration-interrupted` kind has an accessible name/text that includes the literal substring `"planned downtime"` (REQ-19, AC-29) — the same string-anchoring pattern as the disclosure's caveat-text rule above, so "accepted downtime vector, not an apology" is testable rather than a tone judgment call. |
| Keyboard | Full keyboard operation through all five restore-flow steps; the confirm control is not reachable by keyboard focus until the acknowledge control is checked. |
| Status updates | `RestoreProgressPanel` state transitions are announced via an ARIA live region. |
| Error clarity | `PLAN_STALE`/`TOKEN_EXPIRED`/`RESTORE_OPERATION_IN_FLIGHT` are announced and associated with the relevant step's control. |

## 6) Composition Rules
- `RecoveryScreen` is the only public entry component, mounted at `/admin/recovery`.
- `RestorePointRow` is rendered only within `RestorePointList`.
- `DiscardedWindowDisclosure` may render only between `RestorePlanPreview` and `ConfirmRestoreDialog` in the
  restore flow — it is never skipped and never rendered after `ConfirmRestoreDialog` (REQ-08).
- `ConfirmRestoreDialog` may render only when `disclosureAcknowledged` has already been surfaced to the
  operator at least once (it may still be `false`, gating the dialog's own confirm control, but the dialog
  itself does not appear before the disclosure has rendered).
- `RestoreProgressPanel` may render only after a successful `execute()` call.
- `DegradedStateBanner` renders above `RestorePointList` whenever any degraded condition (Section 4) is
  true; it never replaces `CapabilityStatusBar`.

## 7) Acceptance Checklist
- [x] Each public component has explicit input and event contracts.
- [x] Rendering conditions are deterministic.
- [x] Accessibility requirements are testable.
- [x] Entity names and statuses align with `orchestrator.spec.md` and `state.spec.md`.
