# Spec Definition of Done (DoD) Checklist: desktop-app-chat

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-051 |
| feature_name | FEAT-051-desktop-app-chat |
| version | 0.1.2 |
| filled_by | w4-spec051-designs |
| filled_date | 2026-09-16T00:00:00Z |
| reviewed_by | |
| reviewed_date | |

**Read this first.** This checklist is filled in honestly and its overall result is **FAIL**, with four failing items. `validate_spec_package.py` requires every item to be PASS or NA and the overall result to read PASS, so **the validator will fail on this file until those four items are closed** — that is the intended, accurate signal, not a defect in the package. A green checklist here would tell the Architect the spec is implementable from these documents alone, and it is not yet. Each failing item names exactly what closes it.

---

## Section A: Spec Package Completeness

| # | Item | Status | Notes |
|---|------|--------|-------|
| A-01 | `feature.spec.md` is present in the feature folder | PASS | |
| A-02 | `feature.spec.md` is non-empty — all placeholder values have been replaced with real content | PASS | |
| A-03 | `api.spec.md` is present (or explicitly marked NA with justification if feature has no API) | PASS | One new HTTP route (REQ-06) plus the seven-channel IPC contract (REQ-10). Section 4.1 carries an `[OQ-03 OPEN]` marker |
| A-04 | `state.spec.md` is present (or explicitly marked NA with justification if feature has no state) | NA | REQ-18 confirms no new durable store; per-turn in-memory state is specified as behavior rules. See spec-manifest.md |
| A-05 | `orchestrator.spec.md` is present (or explicitly marked NA with justification if feature has no orchestrator) | NA | The single agent loop is `@jini-ai/daemon`'s existing `AgentExecutor`, ported; this feature adds no coordinator of its own. See spec-manifest.md |
| A-06 | `ui.spec.md` is present (or explicitly marked NA with justification if feature has no UI) | PASS | |
| A-07 | `errors.spec.md` is present (or explicitly marked NA with justification if feature defines no error codes) | PASS | |
| A-08 | `behavior.spec.md` is present (or explicitly marked NA with justification if feature has no ordering/precedence/dedup rules) | PASS | |
| A-09 | `traceability.spec.md` is present and all REQ-* and AC-* rows are populated (may be "pending implementation") | PASS | All 21 REQs and 29 ACs populated as PENDING |
| A-10 | `spec-manifest.md` is present and records actual filenames plus omitted files with justification | PASS | |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | `spec_id` is assigned and unique | PASS | |
| B-02 | `version` is set to correct semver (1.0.0 for new specs) | PASS | `0.1.2` is valid semver. Pre-1.0 is accurate for a package that was approved without its companions; bump to `1.0.0` when this checklist first reaches PASS |
| B-03 | `status` is APPROVED (not DRAFT or REVIEW) | PASS | APPROVED by the owner, 2026-09-12 |
| B-04 | `content_hash` is computed and recorded — matches the Speckit canonical hash rule | PASS | Recorded via `--update-hash`. `feature.spec.md` was not edited while this package was drafted, so it should still verify; the full `--phase spec` run is what confirms it |
| B-05 | `feature_name` matches the FEAT folder name exactly (case-sensitive) | PASS | Folder `051-desktop-app-chat`, feature_name `FEAT-051-desktop-app-chat` |
| B-06 | `last_edited` is a valid ISO-8601 UTC timestamp | PASS | |
| B-07 | `owner` is set to a named human or team (not blank, not "TBD") | PASS | Leona Burime |
| B-08 | Overview section is present and describes the feature in 1–3 sentences | PASS | |
| B-09 | Problem Statement is present with Current state, Desired state, Why now, and Success signal | PASS | Note: Current state's "`main.ts` registers no `ipcMain.handle` for any `WORKSPACE_CHAT_CHANNELS` entry" is true of `main.ts`'s own text but misleading — `runner-ipc-stubs.ts` registers all five as throwing stubs (Evidence E2 is wrong; see the report §0b) |
| B-10 | User Journey section is present with Trigger, Steps, Outcome, and Alternate paths | PASS | |
| B-11 | Scope: In-scope list is present and non-empty | PASS | |
| B-12 | Scope: Out-of-scope list is present and non-empty | PASS | Two out-of-scope items (drag-to-resize, Marketplace/settings) conflict with an undated owner decision recorded in `owner-worklist.md:105` — see H-01 |
| B-13 | Zero `[NEEDS CLARIFICATION]` markers remain anywhere in `feature.spec.md` | PASS | NC-1 resolved 2026-09-12 |
| B-14 | All Open Questions have an owner AND a resolution target date | PASS | OQ-01/02/03, all due 2026-09-19 |
| B-15 | Requirements section has at least one REQ-* item | PASS | 21 requirements |
| B-16 | All REQ-* items are observable and testable — no vague qualifiers | PASS | |
| B-17 | All REQ-* items are independently verifiable | PASS | |
| B-18 | Acceptance Criteria section has at least one AC-* item | PASS | 29 acceptance criteria |
| B-19 | Every REQ-* has at least one corresponding AC-* | PASS | |
| B-20 | All AC-* items follow Given/When/Then format | PASS | |
| B-21 | All AC-* items have a [P1], [P2], or [P3] priority tag | PASS | |
| B-22 | All P1 AC items are independently testable | PASS | |
| B-23 | No AC item requires knowledge of the implementation to evaluate | **FAIL** | AC-14 ("when the call reaches the `ToolExecutor`, then execution pauses") names the exact mechanism three files in `apps/website/src/assistant/` document as a hang (`pending-confirmations.ts:14-21`). An AC phrased against `ToolExecutor` forces the contested implementation. **Closes when:** AC-14 is reworded to its observable behavior — "given the agent calls `desktop.project.delete`, then nothing is deleted and exactly one confirm/cancel affordance renders for that call" — as part of the REQ-11 revision. AC-06/AC-12/AC-13 also name implementation symbols (`net`, `ipcMain.handle`) but those ARE the contract boundary for a brownfield IPC feature and are acceptable |
| B-24 | Invariants section has at least one INV-* item | PASS | 9 invariants |
| B-25 | All INV-* items are written as absolute statements | PASS | |
| B-26 | Edge Cases section has at least one EC-* item | PASS | 10 edge cases. A proposed EC-11 (`TOVU_ADMIN_ASSISTANT=off`) is recorded in `traceability.spec.md` §3 for the next version |
| B-27 | All EC-* items are concrete scenarios | PASS | |
| B-28 | All EC-* items have an explicit Expected Behavior | PASS | |
| B-29 | Dependencies table is complete — no blank Failure Mode or Fallback cells | PASS | |
| B-30 | Constitution Compliance table is complete — all 8 articles marked | PASS | |
| B-31 | Any EXCEPTION in the Constitution Compliance table has a note | PASS | Articles IV and VII both carry notes |
| B-32 | Implementation Readiness Gate checklist in `feature.spec.md` is complete and shows PASS | **FAIL** | The gate has two unchecked boxes and its result reads "CLARIFICATION RESOLVED", not PASS. **Closes when:** (1) this package's companions validate — now drafted, not yet validated; (2) `ADS-memory/reports/pipeline/051-desktop-app-chat/pipeline-state.md` is created — it does not exist; (3) the gate's result line is updated at the next `feature.spec.md` version bump |

---

## Section C: Typed Contract Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| C-01 | All contract files use the language's type system — no behavior defined only in comments | PASS | api.spec.md §5, ui.spec.md §2 and errors.spec.md §3 use typed tables throughout |
| C-02 | All public interfaces and types have doc comments | PASS | Notes columns serve this role |
| C-03 | All optional fields are explicitly marked as optional | PASS | Required columns throughout |
| C-04 | Nullable fields have explicit nullable typing | PASS | e.g. `window.tovuDesktopEmbedded: boolean \| undefined` in ui.spec.md §2.3 |
| C-05 | No untyped / `any` / `object` escape hatches | PASS | `params: Record<string, unknown>` is pass-through by contract, mirroring the shipped `McpUiToolCallRequest` |
| C-06 | Immutable constants are marked as such in the language's idiom | NA | This language-neutral package declares no source constants directly; `DESKTOP_TOOL_CALLS_PATH` follows `MCP_UI_TOOL_CALLS_PATH`'s existing exported-`const` precedent |
| C-07 | API contract: all endpoints are registered in a single registry constant | PASS | api.spec.md §1 |
| C-08 | API contract: all error codes have an HTTP status mapping | PASS | api.spec.md §6 |
| C-09 | API contract: all endpoints have explicit auth requirements | PASS | api.spec.md §2 — two hops, both named, plus the caller-side `net`/partition obligation |
| C-10 | State contract: initial state covers all fields | NA | No state.spec.md; see spec-manifest.md |
| C-11 | State contract: transitions/actions cover all state-changing operations | NA | No state.spec.md; see spec-manifest.md |
| C-12 | State contract: invariants are falsifiable statements | NA | No state.spec.md; feature-level invariants live in feature.spec.md |
| C-13 | Orchestrator contract: all async outputs have an explicit result type | NA | No orchestrator.spec.md; see spec-manifest.md |
| C-14 | Orchestrator contract: invariants are falsifiable statements | NA | No orchestrator.spec.md; see spec-manifest.md |
| C-15 | UI contract: all components have a typed props/params definition | PASS | ui.spec.md §2 |
| C-16 | UI contract: display conditions cover show/hide/disabled state for every interactive element | PASS | ui.spec.md §4, R-01 through R-09 |
| C-17 | UI contract: accessibility requirements cover all components | PASS | ui.spec.md §5 |
| C-18 | Error contract: all error codes have entries for HTTP status, retry eligibility, ownership, and user message guidance | PASS | errors.spec.md §2, §2a, §4 |
| C-19 | Error contract: no error code is missing from coverage requirements | PASS | Every code appears in traceability.spec.md §4 |

---

## Section D: Behavior Rules Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| D-01 | Precedence rules cover every field that can receive a value from multiple sources | PASS | Tool set (BR-01), always-on membership (BR-08), panel visibility (BR-05) |
| D-02 | Precedence rules are ordered — highest priority source is first | PASS | BR-01 is evaluated top to bottom, and puts the reachability row above the inclusion row on purpose |
| D-03 | Default Values table covers every field with a non-obvious default | PASS | |
| D-04 | "Why" column in Default Values table contains a rationale | PASS | |
| D-05 | Limits and Bounds table covers every numeric constraint that affects behavior | PASS | Covered. Three values are not yet fixed and say so: the 900px threshold (never measured), the confirmation deadline (ADR), and the allowlist size (`[OQ-02 OPEN]`) |
| D-06 | Enforcement column in Limits table specifies where each constraint is checked | PASS | |
| D-07 | Deduplication rules define "duplicate" precisely | NA | No records can duplicate; behavior.spec.md §5 documents the two look-alike cases and why neither is deduplicated |
| D-08 | Tie-break logic is deterministic | PASS | behavior.spec.md §6.1 — turn-start capture, no heuristic |
| D-09 | Edge Case Handling table covers all boundary values from the Limits table | PASS | Including exactly 900px and the 480px floor |
| D-10 | Every behavior rule in behavior.spec.md has a corresponding row in traceability.spec.md Section 5 | PASS | BR-08 and BR-09 are covered by the REQ-02 and REQ-10 rows respectively |

---

## Section E: Traceability Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| E-01 | traceability.spec.md is present | PASS | |
| E-02 | Every REQ-* from feature.spec.md appears in traceability.spec.md Section 1 | PASS | 21 of 21 |
| E-03 | Every AC-* from feature.spec.md appears in traceability.spec.md Section 1 | PASS | 29 of 29 |
| E-04 | Every INV-* from feature.spec.md appears in traceability.spec.md Section 2 | PASS | 9 of 9 |
| E-05 | Every EC-* from feature.spec.md appears in traceability.spec.md Section 3 | PASS | 10 of 10, plus proposed EC-11 |
| E-06 | Every error code from errors.spec.md appears in traceability.spec.md Section 4 | PASS | |
| E-07 | Rows with "pending" status are acceptable at spec stage — no FAIL for pending rows | PASS | Every row is PENDING; nothing is implemented |
| E-08 | Section 7 (Untraced Requirements) is empty | PASS | |

---

## Section F: Internal Consistency

| # | Item | Status | Notes |
|---|------|--------|-------|
| F-01 | Error codes in api.spec.md match error codes in errors.spec.md | PASS | Every code in api.spec.md §6 is in errors.spec.md §2 (new) or §2a (existing, reused) |
| F-02 | Resource status types in api.spec.md, state.spec.md, orchestrator.spec.md, and ui.spec.md are consistent | NA | Only `WorkspaceChatRunState` exists, in api.spec.md alone, and it is the existing contract type unchanged |
| F-03 | OrchestratorItem fields in orchestrator.spec.md are a valid projection of FeatureItem in state.spec.md | NA | Neither file exists |
| F-04 | ItemSummary fields in ui.spec.md are a valid projection of OrchestratorItem in orchestrator.spec.md | NA | No orchestrator.spec.md |
| F-05 | Default values in orchestrator.spec.md InputProps match the Default Values table in behavior.spec.md | NA | No orchestrator.spec.md |
| F-06 | Rate limit values in api.spec.md match the Limits and Bounds table in behavior.spec.md | NA | The feature defines no rate limits; api.spec.md §3 states why |
| F-07 | All spec files reference the same spec_id and feature_name | PASS | SPEC-051 / FEAT-051-desktop-app-chat throughout |
| F-08 | All spec files have consistent version numbers | PASS | 0.1.2 throughout |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Article I (Library-First) | PASS | COMPLIES. Strengthened by this package: REQ-11's site-tool confirmation can reuse `@jini-ai/chat`'s shipped `createMcpUiToolCaller`/`McpUiSurfaceCard` instead of a new mechanism |
| G-02 | Article II (Test-First) | PASS | COMPLIES |
| G-03 | Article III (Simplicity Gate) | PASS | COMPLIES |
| G-04 | Article IV (Anti-Abstraction Gate) | PASS | EXCEPTION (temporary), justified: REQ-06's route has one caller today. The ADR's strongest answer is that this is the **second** concrete instance of one shape — `mcp-ui-tool-calls-route.ts` is the first — which is the gate's own standard, rather than a speculative second caller |
| G-05 | Article V (Integration-First Testing) | PASS | COMPLIES; P1 ACs sit at the IPC and HTTP boundaries |
| G-06 | Article VI (Security-by-Default) | PASS | COMPLIES, with one constraint this package adds that `feature.spec.md` omits: the mcp-ui confirmation round trip must take the same `net` + `session.fromPartition` hop as REQ-06, never a direct request from the Sites Home renderer (api.spec.md §4.3) |
| G-07 | Article VII (Spec Integrity) | **FAIL** | EXCEPTION (temporary): the full `--phase spec` validator has never run to a clean exit. **Closes when:** `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/051-desktop-app-chat --phase spec` exits 0 — which by design cannot happen until B-23, B-32 and H-01 are closed |
| G-08 | Article VIII (Observability) | PASS | COMPLIES; every refusal is named and states whether the model sees it (errors.spec.md §2) |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | **Implementation Readiness Gate:** A new developer who has never worked on this codebase can read the spec-system package and implement the feature from these specs alone | **FAIL** | Not yet, for four concrete reasons, each of which is a decision rather than more writing. (1) **REQ-11's mechanism contradicts the codebase:** it specifies an `ExecutionDelegate` and `requiresConfirmation: true`, which `pending-confirmations.ts`, `frontend-control-capabilities.ts` and nine test files document as an unbounded hang. (2) **REQ-16 vs owner decision:** the spec puts drag-to-resize out of scope; `owner-worklist.md:105` records an undated owner decision for it. (3) **REQ-20 vs owner decision:** the spec puts Marketplace install and settings out of scope; the same worklist line puts both in v1. (4) **OQ-01, OQ-02, OQ-03** are open, due 2026-09-19. **Closes when:** the owner settles (2) and (3), OQ-01/02/03 are answered, and `feature.spec.md` is revised to v0.2.0 with REQ-11 split by tool origin. Full option analysis: `ADS-memory/.local-artifacts/agent-reports/2026-09-16-w4-spec051-designs.md` |

---

## Summary

| Section | Items | Passing | Failing | NA |
|---------|-------|---------|---------|-----|
| A: Package Completeness | 10 | 8 | 0 | 2 |
| B: feature.spec.md Quality | 32 | 30 | 2 | 0 |
| C: Typed Contract Quality | 19 | 13 | 0 | 6 |
| D: Behavior Rules Quality | 10 | 9 | 0 | 1 |
| E: Traceability Quality | 8 | 8 | 0 | 0 |
| F: Internal Consistency | 8 | 3 | 0 | 5 |
| G: Constitution Compliance | 8 | 7 | 1 | 0 |
| H: Final Gate | 1 | 0 | 1 | 0 |
| **TOTAL** | **96** | **78** | **4** | **14** |

**Overall DoD Result:** FAIL

> FAIL — four items fail (B-23, B-32, G-07, H-01). None is a missing document; the package is now complete. All four close on owner decisions plus one `feature.spec.md` revision. Do not dispatch Software Architect until this reads PASS.

---

## Blocking Issues (if FAIL)

| Item ID | Issue | Required Change | Owner | Target Date |
|---------|-------|----------------|-------|-------------|
| H-01 (1), B-23 | REQ-11 / AC-14 prescribe `ExecutionDelegate` + `requiresConfirmation`, documented in this codebase as a hang | Split REQ-11 by tool origin: site tools use the shipped mcp-ui two-step; `desktop.*` tools use an in-daemon pending-call store with a deadline. Reword AC-14 to observable behavior | Software Architect, then Spec Agent | 2026-09-19 |
| H-01 (2) | Drag-to-resize: REQ-16 (out of scope) vs `owner-worklist.md:105` (decided in) | Owner confirms which is current; revise REQ-16/AC-23 or strike the worklist line | Leona Burime | 2026-09-19 |
| H-01 (3) | Marketplace install + settings: REQ-20 (out) vs `owner-worklist.md:105` (in v1) | Owner confirms which is current; if in v1, revise REQ-02, REQ-20, AC-02, AC-28 and this settles part of OQ-01 | Leona Burime | 2026-09-19 |
| H-01 (4) | OQ-01, OQ-02, OQ-03 open | Owner answers; options and recommendations in the report §2 | Leona Burime / Software Architect | 2026-09-19 |
| B-32 | `pipeline-state.md` does not exist | Create `ADS-memory/reports/pipeline/051-desktop-app-chat/pipeline-state.md` with the provider fields `spec-writing` names | Coordinator | 2026-09-19 |
| G-07 | Full validator never run clean | Run it after the rows above close | Coordinator | after the above |

---

## Sign-Off Block

| Role | Name / Agent ID | Date (ISO-8601 UTC) | Signature |
|------|-----------------|---------------------|-----------|
| Spec Agent | w4-spec051-designs | 2026-09-16T00:00:00Z | w4-spec051-designs (drafted; overall FAIL recorded honestly) |
| Coordinator | | | |
