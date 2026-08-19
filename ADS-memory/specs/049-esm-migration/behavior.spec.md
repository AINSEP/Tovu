# Behavior Rules Spec: esm-migration

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-049 |
| feature_name | FEAT-049-esm-migration |
| version | 1.1.0 |
| content_hash | sha256:af12b9f5cc28ea909a62730ed39d59d18897bc5d25de4822aa8dee7f44016fab (propagated from feature.spec.md's validator-computed hash) |
| last_edited | 2026-08-18T04:00:00Z |

**Purpose:** This feature has one governing behavior rule class: an ordering constraint on which files/modules may enter a migration wave, and the exact conditions under which a wave or a barrel file is eligible for conversion. It has no competing value sources, no numeric limits in the API/UI sense, and no data-deduplication logic — the standard behavior.spec.md sections that assume those (Precedence, Default Values, Limits and Bounds, Deduplication, Tie-Break) are marked N/A below with a one-line reason each, per this template's own omission rule. Section 2 (Ordering Rules) and Section 7 (Edge Case Handling) carry the real content for this feature.

---

## EARS Syntax Guide

All behavior rules and acceptance criteria in this file use EARS (Easy Approach to Requirements Syntax) format.

### EARS Patterns

| Pattern | Structure | Use when |
|---|---|---|
| Ubiquitous | `The <system> shall <response>` | Always-true system behavior |
| Event-driven | `WHEN <trigger>, the <system> shall <response>` | Triggered by a discrete event |
| State-driven | `WHILE precondition holds, the <system> shall <response>` | Active during a system state |
| Conditional | `WHERE <feature is included>, the <system> shall <response>` | Optional feature behavior |
| Unwanted behavior | `IF <unwanted condition>, THEN the <system> shall <response>` | Error/exception handling |
| Complex | `WHILE precondition holds, WHEN <trigger>, the <system> shall <response>` | State + event combined |

---

## 1. Precedence Rules

N/A — this feature has no competing value sources. No field, config value, or output in this migration can be supplied by more than one source that needs a winner picked.

---

## 2. Ordering Rules

### 2.1 Wave Sequencing Order (the governing rule of this feature)

**Unit ordered:** Migration waves — each wave is a named, fixed set of files converted from CommonJS to native ESM together.

**Order:** Strictly bottom-up by the real `#src/` dependency graph. A wave may be proposed only when every file in its candidate member set has all of its `#src/`-internal import targets already satisfied — either external (npm) or migrated to ESM in a previously merged wave. This is REQ-01/INV-02 in `feature.spec.md`.

**Direction constraint (why this ordering, not any other):** The confirmed failure mode (`MIGRATION-esm-2026-08-18.md` §2) only fires in one direction — an already-ESM file statically importing a named export from a still-CJS file that only re-exports (not defines) that name breaks `cjs-module-lexer`'s static analysis. It does not fire in reverse: a CJS file `require()`-ing an already-migrated ESM file resolves real ESM bindings and works, given a Node runtime with stable synchronous `require(esm)` (REQ-08). A top-down or arbitrary wave order walks directly into the forward-direction failure; strictly bottom-up ordering avoids it structurally, not by luck.

**Wave 1 fixed membership:** `origin` (5 files), `http` (5 files), `headless` (2 files), `features/agent-plugins` (6 files), `features/site-glue` (6 files) — the verified 24-file zero-outward-dependency leaf set, confirmed by both `check:architecture` and direct grep (REQ-02).

**Invariant:** No wave may be proposed, converted, or merged before every file in its member set independently satisfies the bottom-up precondition. Out-of-order wave proposals are a defect, not a style preference.

---

### 2.2 Barrel Conversion Order

**Context:** 37 of 67 `index.ts` barrels are pure re-export files (100% re-export, nothing locally defined); the remaining 29 are mixed. A barrel cannot be treated as an ordinary file for wave-sequencing purposes because its own "definition" is entirely a function of what it re-exports.

**Order:** A barrel `index.ts` is only eligible for ESM conversion once 100% of the names it re-exports are defined in, or transitively re-exported only from, already-migrated files (REQ-11). A barrel with even one still-CommonJS re-export target remains CommonJS.

**Invariant:** A barrel's own conversion always happens no earlier than the last of its re-export targets' conversions — never before.

---

## 3. Default Values

N/A — this feature introduces no configuration fields, API parameters, or UI props with defaults. Module-type declarations are either "CommonJS" or "ESM"; there is no third default state to document.

---

## 4. Limits and Bounds

N/A as an enforceable numeric/size constraint table. The evidence base's numeric facts (990 cross-module imports, 347 barrel-mediated, 67 barrels of which 37 are pure, 24-file Wave 1, 1806 modules / 7945 dependencies / 72 warnings / 517 deep-import edges per `check:boundaries`/`check:architecture`) are cited by reference to `MIGRATION-esm-2026-08-18.md` rather than restated here, per the Brownfield/Legacy Rule 3 (reference legacy evidence by citation, never by restatement) — see `spec-manifest.md`'s Brownfield References section for the exact citation.

---

## 5. Deduplication Rules

N/A — this feature does not deduplicate inputs. Each file is migrated exactly once; there is no batch-creation or duplicate-detection scenario.

---

## 6. Tie-Break Logic

N/A — this feature has no scenario where multiple items compete for the same role. When two candidate waves have zero dependency edges between them (EC-04 in `feature.spec.md`), either relative order is equally correct; there is no "winner" to pick, only two independently valid, independently verifiable waves.

---

## 7. Edge Case Handling

All rows use EARS format and are independently testable — see `traceability.spec.md` §5 for the mapping to certified tests.

| # | EARS Statement | Test Required? |
|---|-----------------|-----------------|
| 1 | WHEN a candidate wave's file set is proposed, the migration tooling/process shall verify (by direct grep of `#src/` imports, not tool output alone) that every file's internal dependencies are external or already-migrated before allowing that wave to proceed. | Yes |
| 2 | IF a file in a candidate wave has an `#src/`-internal import target that is still CommonJS and not part of the same wave, THEN that file shall be excluded from the wave. | Yes |
| 3 | WHILE the `core` module's Ce=0 (tool)-vs-real-import (grep) discrepancy is undocumented and unresolved, the migration process shall exclude `core` from every wave's member set, regardless of `check:architecture` output. | Yes |
| 4 | WHEN a wave's verification gate (typecheck, tests, `check:boundaries`, `check:architecture`, boot/smoke) reports any failure, the wave shall be reverted as a single atomic commit rather than merged in a partial state. | Yes |
| 5 | IF a barrel `index.ts` re-exports any name still defined in a not-yet-migrated file, THEN that barrel shall remain CommonJS and shall not be converted. | Yes |
| 6 | WHERE two candidate waves have zero dependency edges between them (verified per-pair via the dependency graph and grep), the waves may be migrated in either relative order or in parallel. | Yes |
| 7 | WHEN a migrated file's relative import specifiers are generated or rewritten, the process shall ensure every one includes an explicit file extension. | Yes |
| 8 | IF a wave would create a boundary where a still-CommonJS file `require()`s an already-migrated ESM file before Phase 0 (the Node 24 runtime bump, REQ-08) is verified complete, THEN that wave shall not merge. | Yes |
| 9 | IF a wave's candidate member set includes any file under `apps/admin/**`, `src/themes/static/**`, or `src/features/theme/**`, THEN that wave shall be rejected before conversion begins. | Yes |
| 10 | WHILE a `packages/*` file (i.e., `packages/sdk`) is already `"type": "module"` with zero outward `#src/`-internal dependencies, the migration process shall treat it as pre-migrated and shall not schedule it for conversion in any wave. | Yes |
