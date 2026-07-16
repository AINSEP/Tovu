# Behavior Rules Spec: content-admin-core-contract

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-016 |
| feature_name | FEAT-016-content-admin-core-contract |
| version | 1.4.0 |
| content_hash | sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f |
| last_edited | 2026-07-15T05:00:00Z |

**Purpose:** This file captures the deterministic, rule-based behavior of the gated-mutation
gateway and the watermark contract that is not fully expressed by the acceptance criteria alone —
the precedence between `authorize()` and idempotency, the fixed token TTL, and the boundary
conditions around watermark/mirror staleness.

---

## EARS Syntax Guide

All behavior rules below use EARS (Easy Approach to Requirements Syntax) format.

---

## 1. Precedence Rules

### 1.1 authorize() vs. idempotency short-circuit

**Situation:** A mutating call carries both an idempotency key and an authorization requirement.

**Sources in precedence order (highest to lowest):**
1. `authorize()` evaluation — must run first, unconditionally.
2. Idempotency short-circuit (returning a prior `DUPLICATE_COMMAND` result) — only reached after
   `authorize()` has already allowed the call.

**Example:**
- Scenario: an unauthorized caller replays an idempotency key from a command it never
  successfully issued.
- Input: `authorize()` = deny, idempotency key = matches an existing prior command.
- Result: `FORBIDDEN` is returned; the caller never learns whether a duplicate command exists
  (REQ-14, AC-21).

**Test requirement:** The TDD Agent must write a test proving `authorize()` runs before the
idempotency check specifically for a caller who is unauthorized but supplies a valid, already-used
idempotency key.

### 1.2 Watermark source of truth vs. sidecar mirror

**Situation:** Any reader needs the current `storage_write_watermark` value.

**Sources in precedence order (highest to lowest):**
1. `content.db`'s authoritative counter — always the source of truth when `content.db` is open.
2. The sidecar ops-journal mirror — used only as a fallback display value, and only ever refreshed
   FROM source 1, never treated as independently authoritative.

**Example:**
- Scenario: `content.db` opens successfully at boot.
- Input: mirror's stale pre-boot value = 41, `content.db`'s authoritative value = 47.
- Result: the mirror is reconciled to 47 (REQ-04); the mirror's own prior value is discarded, not
  merged or averaged.

**Test requirement:** The TDD Agent must write a test proving boot reconciliation always
overwrites the mirror from `content.db`, never the reverse.

---

## 2. Ordering Rules

### 2.1 Gated-mutation step ordering

**Sequence:** `plan()` MUST precede `confirm()`; `confirm()` MUST precede `execute()`. There is no
valid call order that skips a step (REQ-08).

**Stability:** This ordering is absolute — a domain implementing this gateway may not offer an
alternate "fast path" that merges any two steps into one call.

**When overridden:** Never. This is the one ordering rule this contract makes non-negotiable,
because it is the entire safety property the gateway pattern exists to provide.

**Invariant:** A gated mutation observed to have run without a preceding successful `confirm()`
call for that exact `planHash` is a system integrity violation, not a shortcut.

### 2.2 authorize() re-evaluation ordering within execute()

**Context:** `execute()` performs several checks before running the domain-specific mutation.

**Order:** `authorize()` (fresh, fail-closed) → token expiry/redemption-state check →
actor-class redemption rule → plan re-derivation and hash comparison → domain-specific mutation.

**Tie-break:** Not applicable — these are sequential gate checks, not competing candidates; the
first failing check in this order is the one reported (an `authorize()` denial is reported as
`FORBIDDEN` even if the token has also separately expired). Likewise, an actor-class redemption
mismatch is reported as `FORBIDDEN` even if the recomputed plan would also be stale — the
actor-class rule is deliberately evaluated before plan re-derivation/hash comparison so that a
caller who was never allowed to redeem this token never learns, ahead of that denial, whether live
state has drifted. This matches this spec's own non-disclosure principle (REQ-11 hides whether a
token string was ever minted; REQ-14 hides whether a duplicate command exists from an unauthorized
caller) rather than treating the actor-class check as a lower-priority gate than plan staleness.

**Invariant:** No check later in this order may run once an earlier check has failed.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| Confirmation token TTL | `GATEWAY_CONFIRM` response | `600 seconds (10 minutes), exact — no jitter` | Originates from ADR-041 §3's "~10 minutes," pinned to an exact figure by this contract — long enough for a human to read a plan and confirm, short enough to bound the window a stolen/leaked token remains redeemable. |
| `storage_write_watermark` initial value | first boot of a new `content.db` | `0` | A monotonic counter must start at a known floor; `0` means "no writes stamped yet," matching a freshly provisioned site. |
| `mirror.staleness` initial value | first boot | `'fresh'` | Optimistic default — the very first boot reconciliation attempt determines the real state; there is no prior mirror value to distrust yet. |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| Confirmation token TTL | exactly 600 seconds | API (gateway `confirm()`/`execute()`) | Fixed by this contract (originating from ADR-041 §3); not configurable per this core contract — a dependent domain spec that needs a different value must document why as an explicit deviation, not silently vary it. |
| Confirmation token redemption count | exactly 1 | API (gateway `execute()`) | INV-03 — enforced at the `execute()` check sequence (behavior 2.2), not merely at the database layer. |
| `storage_write_watermark` per-transaction increment | exactly 1 | API (the watermark-stamping function itself) | A single call increments by exactly 1; a write chokepoint that logically represents multiple row changes still calls the stamping function once per logical write operation, matching REQ-02's "in the same transaction as its own row write." |

---

## 5. Deduplication Rules

N/A — this core contract does not deduplicate content. (Domain-specific deduplication, e.g.
Collections' reserved content-type keys or Categories & Tags' term-merge dedup, is owned by
SPEC-020/SPEC-018, not this spec.)

---

## 6. Tie-Break Logic

N/A — this core contract has no scenario where multiple items compete for the same role. The
`execute()` check sequence (behavior 2.2) is strictly ordered gate evaluation, not a tie-break
between competing candidates.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| A second `confirm()` call is made for the same still-valid `planId`/`planHash` before the first token is redeemed or expired | Mints an independent additional single-use token (this spec's stated default assumption — see feature.spec.md OQ-04); the first token remains valid until it is separately redeemed or expires | Yes |
| `execute()` is called exactly at the TTL boundary (`now == expiresAt`) | Treated as expired — `expiresAt` is an exclusive upper bound, not inclusive | Yes |
| `authorize()` denies AND the token has also independently expired | `FORBIDDEN` is returned (authorize() is evaluated first per behavior 2.2), not `TOKEN_EXPIRED` | Yes |
| The sidecar mirror was never initialized (a pre-ADR-041 install-dir with no `ops/` tree yet) | Boot provisioning creates the mirror from `content.db`'s current authoritative value on first open, per the same rule as ordinary reconciliation (REQ-04) | Yes |
| A restore point predates the `watermarkAtCapture` column | `watermarkAtCapture` is treated as absent/null; any disclosure computed against it renders an explicit unknown estimate, never assumes zero loss (EC-06) | Yes |
| A write chokepoint calls the watermark-stamping function twice within the same transaction (a chokepoint implementation bug, not a contract-level scenario) | Each call increments the counter by 1 independently — the contract itself does not detect or prevent a chokepoint calling it more than once per logical write; REQ-02 obligates exactly one call per logical write, and a chokepoint that violates this over-counts its own writes against the watermark. This is a chokepoint-authoring discipline the owning domain spec must enforce in its own code review, not a gap this core contract can close mechanically. | Yes |
| `execute()` is called with a `confirmationToken` string this contract never minted (garbage or forged, not merely expired or already-redeemed) | Treated identically to an expired token — the response is `TOKEN_EXPIRED`, never a distinct code, so the caller cannot learn whether that token string was ever issued (REQ-11, EC-09, AC-35) | Yes |
| A redemption attempt fails the actor-class rule (REQ-13) AND the recomputed plan would also be stale (a hash mismatch exists) | `FORBIDDEN` is returned (the actor-class rule is evaluated before plan re-derivation/hash comparison per the revised § 2.2 ordering), never `PLAN_STALE` — consistent with REQ-11/REQ-14's non-disclosure pattern (REQ-13, EC-10, AC-38) | Yes |
