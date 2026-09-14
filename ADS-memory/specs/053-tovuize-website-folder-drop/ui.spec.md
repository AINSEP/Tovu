# UI Contract Spec: tovuize-website-folder-drop

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-053`
- Feature: `FEAT-053-tovuize-website-folder-drop`
- Version: `1.0.0`
- Content Hash: `sha256:0000000000000000000000000000000000000000000000000000000000000`
- Last Edited: `2026-09-13T00:00:00Z`

## Purpose

This feature adds exactly one new visible UI element (a confirmation indicator that the dropped folder is now readable by the agent) on top of the existing, unmodified `WorkspaceChatPane`/`onDropCapture` behavior in `apps/desktop/src/renderer/App.tsx`. It does not touch the admin's existing `FsFolderIndicator` component, which continues to serve the manual/browser-driven path unchanged.

## 1) Component Registry

| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `FolderDropConfirmation` | Brief, dismissible confirmation that a dropped folder is now the workspace's readable "custom" root | Section 2.1 | Section 3.1 |
| `FolderDropError` | Error state when the custom-root call fails (path missing, not a directory, endpoint unreachable) | Section 2.2 | Section 3.2 |

## 2) Input Contracts (Props/Inputs)

### 2.1 FolderDropConfirmation

| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `path` | yes | `string` | none | The absolute path just set as the `custom` root |
| `replacedPreviousPath` | no | `string \| null` | `null` | Set when this drop replaced an already-active `custom` root (REQ-05); used to word the confirmation as a replacement rather than a first-time set |
| `autoDismissMs` | no | `integer` | `4000` | The confirmation is transient, not a persistent banner |

### 2.2 FolderDropError

| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `path` | yes | `string` | none | The path that failed to become the `custom` root |
| `reason` | yes | `"not-a-directory" \| "does-not-exist" \| "endpoint-unreachable"` | none | Drives the exact message text; never a raw server error string |

## 3) Event Contracts (Outputs)

### 3.1 FolderDropConfirmation Events

| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onDismiss` | none | Auto-timeout or explicit dismiss | Confirmation is removed from view; no state change |

### 3.2 FolderDropError Events

| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onRetry` | `{ path }` | Retry control activation | Re-attempts the custom-root call with the same path |
| `onDismiss` | none | Explicit dismiss | Error is removed from view; folder path text the drop already inserted (REQ-01) remains in the composer regardless |

## 4) Rendering and Interaction Rules

- [ ] `FolderDropConfirmation` renders only after the `custom`-root call this feature adds actually succeeds — it must never render optimistically before the server confirms.
- [ ] `FolderDropError` renders only when the `custom`-root call fails; the existing folder-path-insertion behavior (REQ-01) still happens regardless of whether this call succeeds or fails — a failed custom-root set must never roll back or block the path text already inserted into the composer.
- [ ] At most one of `FolderDropConfirmation` or `FolderDropError` is visible at a time for a given drop.
- [ ] Neither component blocks the chat composer from being used immediately after a drop.

## 5) Accessibility Requirements

| Area | Requirement |
|---|---|
| Semantic roles | Both components use `role="status"` (confirmation) or `role="alert"` (error) so assistive technology announces them without requiring focus. |
| Labels | The retry control in `FolderDropError` has an accessible name that includes the word "retry", not just an icon. |
| Keyboard | The dismiss control on both components is reachable and activatable by keyboard. |
| Status updates | Both are announced via the roles above; no separate live region is needed since `role="status"`/`role="alert"` already provide this. |
| Error clarity | `FolderDropError`'s message is one of three fixed, plain-language strings keyed by `reason` — never a raw server error string surfaced to the user. |

## 6) Composition Rules

- Both components render inside the desktop `WorkspaceChatPane`, adjacent to the composer — never inside the message list, since they describe composer-level state, not a chat message.
- Neither component is rendered on the browser (non-desktop) admin surface — that surface does not receive folder-drop-to-path events at all (see `feature.spec.md` EC-05).
- The existing admin `FsFolderIndicator` component is not modified, extended, or reused by either new component — they are visually and functionally independent, per Scope.

## 7) Acceptance Checklist

- [x] Each public component has explicit input and event contracts.
- [x] Rendering conditions are deterministic (Section 4).
- [x] Accessibility requirements are testable (Section 5).
- [x] No state/orchestrator contract file exists for this feature (see `spec-manifest.md`); field names (`path`, `reason`) are cross-checked against `errors.spec.md`'s error codes instead, and match.
