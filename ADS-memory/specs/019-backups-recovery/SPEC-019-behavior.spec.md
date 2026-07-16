# Behavior Rules Spec: backups-recovery

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-019 |
| feature_name | FEAT-019-backups-recovery |
| version | 1.1.0 |
| content_hash | sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d |
| last_edited | 2026-07-14T23:30:00Z |

**Purpose:** Captures the deterministic, rule-based behavior of the Recovery screen that is not fully
expressed by the acceptance criteria alone — banner precedence when multiple degraded conditions are true,
the ordering between disclosure-acknowledgment and confirm-reachability, the defaults for the restore-flow
wizard, and the boundary conditions around `costClass` transitions mid-flow. This file does not restate
SPEC-016's own precedence/ordering rules (`authorize()` vs. idempotency, watermark vs. sidecar mirror) —
see `SPEC-016-behavior.spec.md` for those.

---

## EARS Syntax Guide

All behavior rules below use EARS (Easy Approach to Requirements Syntax) format.

---

## 1. Precedence Rules

### 1.1 Degraded-state banner precedence

**Situation:** More than one degraded condition (`costClass: 'unavailable'`, watermark-baseline-unavailable,
operation-in-flight, `PENDING_MIGRATION`, `migration.interrupted`) is true at the same time.

**Sources in precedence order (highest to lowest):**
1. `migration.interrupted` — an incomplete, blocking operation; always shown first (EC-06).
2. `PENDING_MIGRATION` — a deferred-but-known condition with its own resolution path.
3. `operation-in-flight` — a currently-running operation (restore or migration).
4. `costClass: 'unavailable'` — a standing capability limitation.
5. watermark-baseline-unavailable — affects only the disclosure's content, not the whole screen's banner.

**Example:**
- Scenario: the site has both a `migration.interrupted` boot event and is in `PENDING_MIGRATION`.
- Input: both flags true.
- Result: the interrupted-run unblock action renders at the top of the screen; the `PENDING_MIGRATION`
  banner remains visible beneath it (EC-06) — neither is suppressed, but only one occupies the primary
  banner position.

**Test requirement:** The TDD Agent must write a test proving the interrupted-run banner renders above the
`PENDING_MIGRATION` banner when both are true simultaneously.

### 1.2 Disclosure-acknowledgment vs. confirm-reachability

**Situation:** The operator has a returned plan and is deciding whether to proceed to `confirm()`.

**Sources in precedence order (highest to lowest):**
1. `restoreFlow.disclosureAcknowledged === true` — the sole gate on the confirm control's enabled state.
2. Everything else about the plan (cost estimate, quiesce note) — informational, not gating.

**Example:**
- Scenario: the operator has read the plan preview but has not yet interacted with the disclosure's
  acknowledge control.
- Input: `restoreFlow.step === 'disclosure-pending'`, `disclosureAcknowledged === false`.
- Result: the confirm control renders but is disabled; no client or server code path can invoke `confirm()`
  (REQ-08, INV-02).

**Test requirement:** The TDD Agent must write a test proving `confirm()` is unreachable via any UI
affordance while `disclosureAcknowledged === false`, independent of whether the server would also reject
the call.

---

## 2. Ordering Rules

### 2.1 Restore-flow step ordering

**Sequence:** `plan()` → disclosure rendered and acknowledged → `confirm()` → `execute()` → completion. This
is the same non-negotiable ordering SPEC-016 `behavior.spec.md` §2.1 states for the generic gateway,
concretized here as the Recovery screen's five UI steps (ADR-045 §3).

**Stability:** Absolute — REQ-26 forbids any abbreviated path for `costClass: 'cheap'`.

**When overridden:** Never, per REQ-26 and SPEC-016 `behavior.spec.md` §2.1.

**Invariant:** A restore observed to have run without the disclosure having been rendered and acknowledged
for that exact plan is a UI/product defect, not a variant flow.

### 2.2 `onBeforePlanRestore` vs. `costClass` re-check ordering

**Context:** `RecoveryOrchestrator.planRestore` performs a `costClass` check before delegating to
`GatedMutationGateway.plan`.

**Order:** `costClass` re-check (fresh, not cached from the capability bar's last render) → delegate to
`GatedMutationGateway.plan` → `authorize()` (evaluated inside the gateway per SPEC-016 §2.2) → return.

**Tie-break:** Not applicable — sequential gate checks.

**Invariant:** `plan()` never reaches the gateway's own `authorize()` evaluation when `costClass ===
'unavailable'` has already been freshly re-checked as true (REQ-12's degraded mode fully replaces the
restore affordance, it does not merely disable it after an authorization check).

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `restoreFlow.step` | client wizard state | `'idle'` | No restore is in progress until an operator explicitly selects a restore point. |
| `capabilities.operationInFlight` | screen load | `false` (optimistic until first fetch resolves) | Avoids blocking the screen's initial render on a capability round-trip; the first `FETCH_CAPABILITIES` corrects this immediately. |
| `restoreFlow.disclosureAcknowledged` | client wizard state | `false` | The disclosure must be explicitly acknowledged every time a new plan is fetched — never carried over from a prior plan (REQ-08). |
| Restore-point creation `trigger` | `CREATE_RESTORE_POINT` payload | `'manual'` | Only a human/agent-initiated creation goes through this route; `pre-migration-auto` and `template-upgrade` triggers are system-originated and never caller-supplied. |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| Restore-points list page size | default 20, max 100 | API (`RECOVERY_LIST_RESTORE_POINTS`) | Matches ordinary admin list-endpoint conventions; not a value ADR-045 itself specifies, a Spec Agent `SAFE DEFAULT`. |
| Concurrent in-flight restore/migration operations | exactly 1, site-wide | API (`onBeforeCreateOrExecute` hook) | REQ-13 — enforced across both Storage and Recovery, not per-screen. |
| Confirmation token TTL for the restore action | exactly 600 seconds (10 minutes), no jitter | Inherited from SPEC-016 `behavior.spec.md` §4 (re-synced 2026-07-14 against SPEC-016 v1.1.0, which pinned this from "~10 minutes" to an exact figure) | Not re-specified here — this spec does not vary SPEC-016's fixed value (Agent Directives, "Ask before" clause). |

---

## 5. Deduplication Rules

N/A — this domain spec does not deduplicate restore points or restore runs. A restore point is uniquely
identified by its `restorePointId`; nothing about this spec merges or collapses restore-point records.

---

## 6. Tie-Break Logic

N/A beyond Section 1.1's banner precedence, which is already an explicit ordered list, not a tie-break
between equally-weighted candidates.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| `costClass` transitions from `'cheap'` to `'unavailable'` between the restore-points list load and the operator opening the restore flow | `planRestore`'s fresh `costClass` re-check (behavior 2.2) catches this; `plan()` is never delegated to the gateway, and the screen shows the degraded state instead (EC-05) | Yes |
| A `migration.interrupted` event and a `PENDING_MIGRATION` state are both true at once | Interrupted-run banner takes the primary position; `PENDING_MIGRATION` banner remains visible beneath it (behavior 1.1, EC-06) | Yes |
| An operator restores successfully while `PENDING_MIGRATION` is active | Restore completes; `PENDING_MIGRATION` remains true afterward; the Storage migration deep-link banner still renders on the next Recovery load (REQ-18, EC-07) | Yes |
| A restore point's `watermarkAtCapture` is null (pre-column row) | Disclosure renders an unknown estimate for that restore point, matching SPEC-016 EC-06 exactly | Yes |
| The watermark baseline itself is unreadable (`content.db` unopenable) at disclosure-compute time | Disclosure renders "could not be computed," never a stale or zero count (REQ-11) — whether `confirm()`/`execute()` can even be authorized in this state is out of scope here (OQ-03) | Yes |
| A deep-link envelope's `restorePointId` no longer resolves | `resolveDeepLinkContext` returns `{found: false}`; the screen renders the unfocused list rather than erroring (REQ-21, EC-03) | Yes |
