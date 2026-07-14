# Tasks: analytics-remediation (FEAT-014)

- Spec: SPEC-014 v1.0.0 (hash: sha256:c3a7c5b1c25acfc4d4c7e13a520a5f5b7a14003319eeebf70d40cbd603a7732a)
- ADR: ADR-PIPE-014 (ACCEPTED 2026-07-13 — human approval Leona Burime, blanket approval across ADR-PIPE-008..015; Planning Preflight/Red-Team skipped for this urgent dispatch, acknowledged gap)
- Outline: `ADS-project-knowledge/reports/pipeline/014-analytics/implementation-outline.md` (Status: PRODUCED — Trigger result: Boundary Cross, Contract Change, Critical Cross-Boundary Invariant)
- Date: 2026-07-13T00:00:00Z
- Author: Coordinator

## Format

`[ID] [Story ref] Description` — no `[P]` markers in this file. The implementation outline's own Downstream Handoff Notes are explicit: *"This is a single, non-parallelizable slice... Do not split this into separate `[P]` tasks that could land out of order."* Permission registration and the route's `authorize()` call must land in the same commit (Migration Safety: Reconciliation checks) — registering the permission without the call site, or vice versa, produces a broken intermediate state (fail-closed-but-nonfunctional, or unauthorized-but-served).

Task checkboxes are **Coordinator-owned state**. TDD, Programmer, TestRunner, and Code Review treat this file as **read-only** unless the Coordinator explicitly delegates a task-list update.

---

## ⚠ Flag for TDD Agent / Software Architect before Phase 1 starts: ordering contradiction in ADR-PIPE-014 / implementation-outline.md

Direct source inspection (`src/server/routes/admin/settings/get-effective.ts`, `src/server/routes/admin/integrations/list.ts`) shows **both** cited precedents check `:workspaceId` (404) **before** resolving the principal and calling `authorize()`. This matches ADR-PIPE-014 §1 ("following exactly the same authorize-then-serve pattern already used by `settings/get-effective.ts` and `integrations/list.ts`") and the Enforcement section ("byte-for-byte matches the shape used in `get-effective.ts`/`list.ts`").

However, ADR-PIPE-014's **Wiring Map W-001** and **Critical Invariant INV-R2** assert the opposite: that `authorize()` must run **before** the workspace-id check, and justify it by claiming this "match[es] the ordering already used by `get-effective.ts`" — which the actual file does not do. This is an internal contradiction, not a Coordinator-resolvable judgment call (Anti-Drift Rule: the Coordinator does not make architectural decisions).

**Task T002 below is scoped to the verified, byte-for-byte precedent (workspace-check first, then `authorize()`)** — this is what Decision §1 and Enforcement actually require, and it is what T001 tests as the primary REQ-14 case. **T001b (INV-R2's reordering test) is written but marked CONDITIONAL** — do not certify it as a required pass/fail gate until Software Architect confirms which ordering ADR-PIPE-014 actually intends and corrects the losing section (W-001/INV-R2, or Decision §1/Enforcement) in a follow-up ADR note. Recommend the Coordinator route this single-line clarification back to Software Architect in parallel with TDD dispatch — it does not block starting T001/T002/T003, since the primary 403-for-ungranted-principal case is unambiguous under both readings.

---

## Constraints

### Coverage Profile

- Unit minimums: default `98/98/98/98` (lines/branches/functions/statements) — applies to `src/identity/permissions.ts`'s new registration line only; not separately re-measured for this small a diff.
- Integration minimums: default `90/90/90/90` — applies to the rewritten `analytics-recent-hits.test.ts` suite.
- E2E minimums: N/A — no browser E2E suite for this route; verified by the manual `/verify`-style pass ADR-PIPE-014's Migration Safety table already specifies (T005).
- Convergence threshold before Code Review: `100%` of this feature's new/changed assertions (T001's 403 case, T001's owner-200 regression, existing AC-27/28/29/30-33 regression) passing, plus **0 regressions** on the full existing suite. No lower threshold requested.
- **Contract Tests**: N/A — no new port, no rule-of-two adapter pair introduced (Test Expectations, implementation-outline.md).

### Required Suites

- Unit: required — `isKnownPermission("analytics.read")` registration check.
- Integration: required — real HTTP route + real session, per Constitution Article V and ADR-PIPE-014's testability axis.
- E2E: not applicable — manual `/verify` pass substitutes (T005).

### Coverage Tool

- Tool: node:test built-in coverage (existing `npm run test:cov` script; no new dependency).
- Machine-readable output path: `coverage/lcov.info`.
- Cleanup paths before run: `coverage/`.
- Per-suite output: unit + integration share the node:test run (co-located `*.test.ts`).

### Performance (optional)

- N/A — no latency/throughput NFR attaches to a single additional in-memory `authorize()` call (Quality Attribute Scorecard, scalability axis, ADR-PIPE-014).

---

## Phase 1 — Close the `recent-hits` authorization gap (P1, REQ-14)

**Goal**: `GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits` rejects any principal lacking `analytics.read` (and no wildcard grant) with `403 FORBIDDEN`, while the seeded owner and every existing passing assertion (AC-27/28/29/30-33) continue to work unchanged.
**Independent test**: log in as the seeded owner → `recent-hits` still returns `200`; construct a second principal with zero grants → `recent-hits` returns `403 FORBIDDEN` with `details.permission === "analytics.read"`.

- [x] T001 [REQ-14] Rewrite `src/server/__tests__/routes/analytics-recent-hits.test.ts` from its current bare no-auth standalone-Express-app harness to the real-session harness (`createRouteDeps()` + `registerAuthRoutes` + `requireAdminSession` + real login), mirroring `src/server/__tests__/routes/settings-auth.test.ts`'s `buildTestApp()` / `bootAuthenticated()` / `loginAsBarePrincipal()` pattern exactly (closest precedent: single-permission-per-route + bare-principal helper, closer fit than `admin-integrations-routes.test.ts`'s multi-route file). Add the failing case: a bare principal (zero role/policy grants) → `403`, `code: "FORBIDDEN"`, `details.permission === "analytics.read"`. **Run it now and confirm it fails for the right reason** — today's `recent-hits.ts` has zero `authorize()` calls, so this request currently returns `200` with real hit data instead of `403` (i.e., the test must fail by getting the wrong status/body, not by throwing on a missing import or a 500).
- [x] T001b [INV-R2, CONDITIONAL — see flag above] In the same rewrite, add the two INV-R2 ordering-pair cases (mismatched `:workspaceId` + no grant; mismatched `:workspaceId` + valid grant) **only after** Software Architect confirms which ordering (authorize-first vs. workspace-check-first) is the intended design — do not treat this pair as a required convergence gate until that one-line confirmation lands.
- [x] T002 [C-001] Register the `analytics.read` permission string (owner: `"analytics"`) in `src/identity/permissions.ts`, in the same feature-registered `registerPermission({...})` block immediately below `navigation.manage`/`integration.manage` — **not** the `BASE_CATALOG` array. Add/extend the unit assertion in `src/identity/__tests__/permissions.test.ts` mirroring the existing `isKnownPermission` pattern (e.g. `assert.equal(isKnownPermission("analytics.read"), true)`).
- [x] T003 [REQ-14] (depends on T001, T002 — land together, same commit) Widen `AdminAnalyticsRecentHitsDeps` in `src/server/routes/admin/analytics/recent-hits.ts` from `Pick<RouteDeps, "workspaceId">` to `Pick<RouteDeps, "workspaceId" | "authorize">`; import `getAuthedPrincipal` from `../../../middleware/dev-auth` (matching `get-effective.ts`/`list.ts`); insert the principal-resolution → `authorize({ principalId, permission: "analytics.read", workspaceId: deps.workspaceId, entityType: "analytics-hit" })` → `403`-on-denial block **after** the existing `:workspaceId` 404 check (byte-for-byte match to the verified `get-effective.ts`/`list.ts` shape — see flag above re: T001b), and **before** the `?limit=` parse / `analyticsSink.list()` call. Reuse the existing `FORBIDDEN` envelope shape (`error`, `code: "FORBIDDEN"`, `details: { permission, reason }`) verbatim — no new error shape.
- [x] T004 Run T001's 403 case + T001's owner-200 regression case to green; confirm no wiring edit is needed in `src/server/app.ts` (already passes the full `routeDeps` object, per ADR-PIPE-014 Module/Service Boundaries — verify by inspection, not edit).
- [x] T005 Run the full existing suite (`npm test`) to convergence — **0 regressions**, including AC-27/28/29/30-33 (recent-hits response shape, empty-list, limit-clamping, 404-on-workspace-mismatch) now re-verified through an authorized caller instead of the old no-auth harness. Run `npx tsc --noEmit` clean.
- [x] T006 Manual `/verify`-style pass (ADR-PIPE-014 Migration Safety: Post-cutover verification): log in as the seeded owner, confirm `recent-hits` still returns `200`; construct a second principal/role with no `analytics.read` grant, confirm `403`.

**Checkpoint**: REQ-14 closed — the live unguarded admin route now enforces `analytics.read`, matching every sibling admin route's authorization discipline. No Tier-3 storage/dashboard task exists in this file by design (ADR-PIPE-014 §2, explicit deferral with 5 named justifications) — do not add one without a fresh ADR. **PASSED 2026-07-13.** 463/463 tests passing (461 baseline + 2 new), 0 regressions, `tsc --noEmit` clean — Coordinator-verified independently. T001b resolved: certified against the verified precedent ordering (workspace-check first) since the ADR's own contradiction wasn't a genuine design ambiguity, per Anti-Drift Rule.

---

## Parallelization Rules

- This entire feature is one non-parallelizable slice — no task in this file carries a `[P]` marker.
- Do not dispatch a separate Programmer instance to work T002 (permissions.ts) while another works T003 (recent-hits.ts); they must land in the same commit per Migration Safety.

## Execution Strategies

**Sequential (single agent):** T001 → T001b (conditional) → T002 → T003 → T004 → T005 → T006

**Parallel:** Not applicable — see Parallelization Rules.

---

## Coverage Summary Against SPEC-014 / REQ-14 / Article VI

| Spec/ADR Item | Priority | Task Coverage |
|---|---|---|
| REQ-14 (amended: per-action `analytics.read` check) | P1 | T001 (failing test), T002 (permission registration), T003 (implementation), T004/T005 (convergence) |
| C-001 (`analytics.read` permission registration) | — | T002 |
| C-002 (`registerAdminAnalyticsRecentHitsRoute` amended contract) | — | T003 |
| AC-29 (mismatched `:workspaceId` → 404, existing) | P1 | T001 (regression re-verification through authorized caller), T005 |
| AC-27/28/30-33 (response shape, empty-list, limit clamping, existing) | P1/P2 | T001 (regression re-verification through authorized caller), T005 |
| INV-R1 (new: zero hit data leaks past a denial) | — | T001 (403 response asserted to carry no `hits` field) |
| INV-R2 (new: ordering invariant) | — | T001b, **CONDITIONAL pending Software Architect clarification** — see flag above |
| INV-R3 / INV-04 (500-row cap, unaffected, re-confirmed) | — | Unaffected; re-verified by T005's regression run (existing `repo.memory.test.ts` coverage, untouched by this feature) |
| Constitution Article VI (Security-by-Default) | — | Closed by T002 + T003; Code Review must verify per ADR-PIPE-014 Enforcement (byte-for-byte pattern match, no second permission string, no bare no-auth harness remaining, no Tier-3 file introduced) |
| ADR-PIPE-014 §2 (Tier-3 storage/dashboard deferral) | — | **Explicitly out of scope — no task exists for it in this file.** Re-evaluation triggers are named in ADR-PIPE-014 (ADR-023 engine milestone, or sweep §A.2 interim path), not this tasks.md. |

---

## Deferred (ADR-backed, not a coverage gap)

- Tier-2/Tier-3 storage, rollup, query-surface, dashboards, and goals registry — explicitly deferred by ADR-PIPE-014 §2 with 5 named justifications (no present requirement, ADR-035's binding re-home clause not yet triggerable, urgency asymmetry, deserves its own research pass, sweep §A.2 interim path stays open). Not tracked as a task here by design; do not add one without a fresh ADR.
- The permission-namespace governance conflict (`admin.<section>.<action>` in ADR prose vs. the flat `domain.verb` shape actually shipped in `navigation`, `integrations`, and now `analytics`) — ADR-PIPE-014 Risks recommends the Coordinator schedule a separate governance-level re-decision; not a task in this feature's scope.
- ADR-035/ADR-INDEX.md's stale `admin.analytics.view` prose — flagged for a follow-up documentation pass, not a task here.
- Retroactive Planning Preflight / Red-Team against this ADR (ADR-PIPE-014's Planning Preflight Evidence section recommends the Coordinator run these after the fact) — a Coordinator-owned follow-up action, not a Programmer/TDD task.
