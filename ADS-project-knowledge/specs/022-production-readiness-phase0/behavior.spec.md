# Behavior Rules Spec: Production Readiness Phase 0 — Capability Inventory & Runtime-Mode Containment

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-022 |
| feature_name | FEAT-022-production-readiness-phase0 |
| version | 1.0.0 |
| content_hash | anchored in feature.spec.md |
| last_edited | 2026-07-16T00:00:00Z |

**Purpose:** This phase has real precedence (runtime-mode signal resolution), real ordering (the boot-time check sequence), non-obvious defaults (fail-closed on ambiguity), and a discriminator rule (mailer lane resolution) — this file is required, not optional.

---

## EARS Syntax Guide

(See template — all rules below use EARS patterns: Ubiquitous, Event-driven, State-driven, Conditional, Unwanted behavior, Complex.)

---

## 1. Precedence Rules

### 1.1 Runtime-Mode Signal Resolution

**Situation:** Determining whether the server is in `production` or `local` mode at boot.

**Sources in precedence order (highest to lowest):**
1. The dedicated runtime-mode configuration source (env var or config store — exact mechanism resolved by Software Architect, OQ-01) — explicit, operator-set, authoritative.
2. Absence of source 1 — falls through to the default, never to `NODE_ENV`.

**Explicitly NOT a source:** `NODE_ENV`. WHILE the dedicated runtime-mode source is unset, IF `NODE_ENV=production`, THEN the system shall still resolve to `local` — `NODE_ENV` is never consulted for this decision (INV-02).

**Example:**
- Scenario: an operator sets `NODE_ENV=production` for logging-verbosity reasons but forgets to set the dedicated runtime-mode signal.
- Result: the system resolves runtime mode to `local` and does NOT apply any of Phase 0's production-mode containment (REQ-03/04/07/08/10) — this is intentional fail-*open-toward-dev-convenience*, not a bug, because failing toward `production`'s stricter checks on an operator's dev/staging box would be the more dangerous silent-failure direction (INV-04 governs the inverse case: an ambiguous or malformed value must still resolve to `local`, never guess `production`).

**Test requirement:** TDD Agent must write a test for: dedicated signal = `production` + `NODE_ENV` unset (resolves `production`); dedicated signal unset + `NODE_ENV=production` (resolves `local`); dedicated signal = malformed/unrecognized value (resolves `local`, EC-02).

### 1.2 Mailer Lane Resolution (Purpose-Scoped Gate)

**Situation:** Determining whether a given `MailerPort.send()` call is on the interactive lane (passes ungated) or the notification lane (gated on durable-outbox-readiness) — REQ-09/REQ-10.

**Sources in precedence order (highest to lowest):**
1. The (post-fix) discriminating field on the send call (the field REQ-09 introduces — exact shape resolved by Software Architect, OQ-02, but must not collapse members and forms to the same value as today's shared `purpose: "transactional"`).
2. An unrecognized/unmapped value for that field — NOT a fallback to "interactive" (permissive). Per INV-05/EC-04, an unrecognized value resolves to the *notification* lane (the more restrictive gate) — fail-closed, not fail-open.

**Example:**
- Scenario: a third mailer call site is added later (e.g. a future feature) using a discriminator value nobody anticipated.
- Result: WHEN the discriminator value does not match a known interactive-lane value, THE system shall treat the send as notification-lane and apply REQ-10's durable-outbox gate — never silently treat an unknown lane as safe-to-send-directly.

**Test requirement:** TDD Agent must write a test asserting the pre-fix collision (AC-16) and the post-fix discrimination (AC-17), plus the unknown-value fail-closed case (EC-04).

---

## 2. Ordering Rules

### 2.1 Boot-Time Check Sequence

**Context:** When the server boots in `production` mode, in what order are the containment checks (REQ-03) evaluated?

**Order:**
1. Resolve the runtime-mode signal (§1.1). If not `production`, skip the remaining steps entirely — none of Phase 0's containment applies in `local` mode.
2. Check for dev-only unsafe defaults (dev secret placeholder, localhost/dev egress allowance, always-enabled analytics stub) — REQ-03's first clause. Any failure here refuses boot immediately; the capability-inventory check (step 3) does not need to run to know boot has already failed, but SHOULD still run and report ALL failing checks together (not just the first one found) so an operator fixes everything in one pass rather than iterating one failure at a time.
3. Cross-check every `production`-classified capability in the inventory (REQ-01) against its actual configured durable adapter. Any capability failing this check contributes to the same aggregated boot-refusal report as step 2.
4. If steps 2 and 3 together found zero failures, boot proceeds: `local-only`/`experimental` capabilities' routes/workers are skipped entirely (never registered, per REQ-04) and `production`-classified capabilities register normally.
5. If either step found any failure, boot refuses — the process must not bind its listening socket, and must exit or halt with the aggregated `PRODUCTION_BOOT_UNSAFE_DEFAULT`/`PRODUCTION_CAPABILITY_NOT_DURABLE` report from steps 2-3.

**Tie-break:** N/A — every check that can fail is independently evaluated and all failures are aggregated; there is no "first failure wins" short-circuit for the report (only for skipping unnecessary further work is optional, reporting is not).

**Invariant:** No route registers and no worker starts in `production` mode until steps 2-3 have both completed with zero failures (INV-01).

### 2.2 Mailer Seam Gate Evaluation (per-send, not boot-time)

**Context:** For each individual `MailerPort.send()` call, in what order is the lane-gate (§1.2) evaluated relative to runtime-mode resolution?

**Order:** Runtime-mode resolution (§1.1) always happens first (or is already cached from boot); the mailer seam gate then only applies its refusal logic (REQ-10) when the cached mode is `production`. In `local` mode, the seam gate resolves the lane (for observability/logging purposes only) but never refuses a send.

**Invariant:** A `local`-mode send is never refused by this gate, regardless of lane or durable-outbox-readiness state.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| Runtime-mode signal, when unset or unrecognized | Boot-time resolution | `local` | INV-04 — an ambiguous/missing signal must never fail open toward the stricter `production` posture being silently skipped, but conversely must never be *guessed* into `production` either; `local` is the only safe default in both directions since it activates no new containment the operator didn't explicitly ask for. |
| Mailer lane, when the discriminator value is unrecognized | Per-send lane resolution | `notification` (the more restrictive lane) | INV-05/EC-04 — an unknown lane must be treated as needing the durable-outbox gate, not assumed safe to send directly; the permissive lane (interactive) must be explicitly and correctly identified, never a fallback. |
| Capability classification, when an inventory entry is missing entirely | Boot-time containment check | Treated as a `CAPABILITY_INVENTORY_STALE` flag (REQ-12), not silently treated as any of `production`/`local-only`/`experimental` | A capability with no inventory entry has no basis for any classification-driven decision — flagging the gap is correct; guessing a classification is not. |

---

## 4. Limits and Bounds

N/A — this phase introduces no numeric/size constraints. (No pagination, no rate limits, no byte-size caps are in scope for Phase 0.)

---

## 5. Deduplication Rules

N/A — this feature does not deduplicate inputs. The capability inventory has exactly one entry per route family/worker by construction (REQ-01/AC-01); duplicate entries for the same capability would be a spec-completeness bug, not a runtime dedup scenario.

---

## 6. Tie-Break Logic

N/A — no scenario in this phase has two items competing for the same role. (The closest analog, mailer-lane resolution, is a classification/discrimination rule, not a tie-break — see §1.2.)

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| Runtime-mode signal set to an empty string | Treated identically to unset — resolves `local` (EC-02). | Yes |
| Runtime-mode signal set to `"Production"` (wrong case) | Treated as unrecognized — resolves `local`, not case-insensitively matched to `production` (fail-closed on ambiguity, not lenient parsing). | Yes |
| A `production`-classified capability's durability check throws instead of returning a boolean | Treated as a failed check — contributes to boot refusal, never silently passes (EC-03). | Yes |
| Two `production`-classified capabilities both fail their checks simultaneously | Boot refusal report names both, not just the first found (§2.1 step 2-3 aggregation rule). | Yes |
| A third mailer call site is added with a discriminator value not yet mapped to a lane | Resolves to `notification` lane (fail-closed default, §1.2/EC-04) — not silently treated as `interactive`. | Yes |
| `dependency-cruiser`'s report-only run crashes rather than completing with a (possibly empty) violation list | Surfaced as `DEPENDENCY_CRUISER_REPORT_FAILURE`, a distinct CI signal from "zero violations" (EC-05). | Yes |
| A new route is added to `deps.ts` in the same commit as its capability-inventory entry | Passes the staleness check (REQ-12) — the check only flags a route with NO matching entry, not timing/ordering of the two edits within a commit. | Yes |
| Runtime mode resolves to `local` and a `production`-classified capability lacks its durable adapter | No refusal — Phase 0's containment is entirely inert outside `production` mode (§2.1 step 1). | Yes |
