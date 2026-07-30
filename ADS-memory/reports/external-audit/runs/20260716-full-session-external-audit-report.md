# External Audit Report — Full Session (2026-07-15 evening – 2026-07-16)

**Threat model:** `TM-20260716-full-session-001` (full scope, HIGH risk, floor 8.5) + `TM-20260716-full-session-nonsecurity-001` (agy's re-scoped dispatch, MEDIUM risk, floor 8.5)
**Resolved models:** Codex `gpt-5.6-terra` (reasoning=xhigh, codex-cli 0.144.3) · agy `Gemini 3.1 Pro (High)` (agy 1.1.2) · Fable subagent (in-host, Claude-family)
**Effective `suggest_changes` mode:** patches
**Auditors:** internal Claude-family verifier (mandatory pre-pass) + Codex (full packet) + agy (re-scoped non-security packet, due to a known bug where it hard-refuses any packet containing a security-framed domain) + Fable (security-domain-focused: media authz, LiquidJS sandbox, mailer CIC)

## Work Log

See `ADS-memory/.local-artifacts/external-audit/packets/20260716-full-session-audit-packet.md`, sections A–I, for the full work log (backend TDD slices, admin route wiring incl. the gated-mutation gateway composition, the media-authz security fix, LiquidJS sandbox hardening, the SPEC-021 brownfield spec pass that found the media-authz gap, admin UI screens, Playwright VRT setup, and the ADR-046 debate + SPEC-022 spec/outline/tests package).

## Auditor Matrix

| Auditor | Score | Rationale | Blocking Gate |
|---|---:|---|---|
| Internal verifier | 9.0/10 | Zero validated blockers; systematic authz sweep clean for tonight's new code; 2 non-blocking findings | PASS |
| Codex | 8.0/10 | Sandbox/media/gateway internals solid, but pre-authorization lock acquisition is a validated access-control blocker | **FAIL** |
| agy | 7.0/10 | Backend/gateway logic solid; two findings it classified as blockers (see Coordinator Response — one is disputed) | FAIL (recomputed below) |
| Fable | 9.0/10 | All 3 security domains clean of blocking defects; one empirically-verified low-severity sandbox finding; refutes the internal/Codex CIC severity characterization with a more precise read | PASS |

## Degraded Coverage

None. All 4 planned auditors (internal + 3 external) returned complete, structured responses within budget. agy's scope was deliberately narrowed (not degraded) to exclude security-framed domains, per its known tooling limitation — those domains received a dedicated Fable pass instead, so coverage is complete, just redistributed.

## Per-Auditor Scope Checks

- **Internal verifier:** "reviewed the full working-tree diff (142 files) against the frozen threat model, ran `npm test`/`npm run typecheck` directly, systematically grepped every admin route file for missing `authorize()` calls."
- **Codex:** "audited the working-tree security/composition/spec surfaces named in the packet, including all five media routes, permissions/seed migration wiring, Liquid allowlist/worker sandbox, gated-mutation gateway/composition/routes, SPEC-022's six spec files plus CIC/outline, visual spec/snapshot inventory, and todos.md samples."
- **agy:** "audited gateway.ts check-sequence, e2e/theme-visual.spec.ts visual regression baseline, todos.md ADR mapping, specs/022-production-readiness-phase0/ internal consistency, and admin screens UI wiring (Storage, Recovery, Taxonomy)."
- **Fable:** "read all 5 media route files, the authorize() core, the permission catalog and seed grants; liquid-allowlist.ts, liquid-worker.ts, liquid-sandbox.ts and both test files plus LiquidJS's own range() implementation; the CIC artifact, all of SPEC-022's traced files, and both live mailer call sites — including one empirical sandbox-bypass reproduction."

## What The External LLMs Said

### Codex — 1 blocker, 2 medium
**AUD-001 (blocker):** `src/server/routes/admin/storage/migrate-forward.ts` and `src/server/routes/admin/recovery/restore.ts`'s `/execute` routes call `executeMigrateForward`/`executeRestore`, which acquire the shared cross-domain operation lock (`core/operation-lock.ts`) *before* the gateway's own `authorize()` re-check runs inside `execute()`. An authenticated principal holding zero relevant grants can therefore reach and briefly hold the shared lock — rejected only after acquisition, not before — creating a lock-contention path against a concurrent, legitimately authorized ceremony.
**AUD-002/AUD-003 (medium):** SPEC-022 hash placeholders inconsistent with DoD claims; CIC's Binding Constraints don't, in isolation, structurally prevent the historical `purpose: "transactional"` collision.

### agy — 2 findings labeled blocker (see Coordinator Response — one disputed, one corrected)
**F-01:** Taxonomy/Storage/Recovery UI screens don't yet expose the migrate-forward/term-merge/restore-execute actions.
**F-02:** SPEC-022 hash placeholders (converges with Codex/internal) + claimed `errors.spec.md` "omits feature_name" and uses "an unstructured bulleted list instead of the standard table."

### Fable — 0 blockers, 1 new low-severity empirical finding, refutes the CIC severity characterization
**M2-1 (low, non-blocking, newly discovered):** A variable-bound Liquid range (`{% assign n = 2000000000 %}{% for i in (1..n) %}`) bypasses the literal-range-span lint cap. Empirically reproduced against the real sandbox: worker terminated on `resourceLimits`' memory ceiling, **parent process survived**. Root cause: LiquidJS's `range()` builds via incremental `push()`, not the one-shot allocation the original bug's documentation describes — the lint cap is defense-in-depth, not the sole barrier, and the code comments overstate the mechanism.
**On the CIC gap (M3-1/M3-2):** independently re-derived the internal/Codex conclusion and **refutes its strength**: `feature.spec.md`'s INV-05 is a live, traced, binding invariant the CIC's own U-001-B1 row cites — a future implementer who follows the CIC's Trace column (not just its Binding Constraints table in isolation) *would* be structurally prevented from re-shipping the exact historical collision. The real gap is narrower: the Binding Constraints table isn't self-contained, so a reader who stops at B1/B2 without following the trace could mistakenly believe the protection doesn't exist elsewhere.

## Cross-Auditor Synthesis

**Convergent (3-4 way agreement):**
- SPEC-022's `content_hash: sha256:PENDING` placeholder in `behavior.spec.md`/`traceability.spec.md`/`errors.spec.md`: found independently by all 3 review passes (internal, Codex, agy). High-confidence, low-severity.
- Media-route authorization, LiquidJS AST-based allowlist, and the gated-mutation check-sequence ordering: all reviewers who examined these found them correct. High confidence these are solid.

**Genuine disagreement, surfaced rather than silently resolved:** the internal verifier and Codex independently characterized the mailer CIC's Binding Constraints as *not* preventing the historical bug (only a standalone test does). Fable, after deeper verification (reading the traced `INV-05`/`REQ-09`, confirming the CIC's own Trace column cites them), argues the full CIC — including its traces, not just its Binding Constraints table in isolation — *does* structurally prevent it, and the real defect is a documentation self-containment gap. **All three converge on the same fix** (add an explicit binding constraint capturing the disjointness rule) despite disagreeing on how broken the current state is. See Decision Points For User.

**Disputed finding:** agy's F-01 (UI ceremony actions unwired) restates something already disclosed as a known, deliberate sequencing gap in this session's own Work Log (the UI was built before the write-ceremony routes existed) — not a fresh discovery. agy's F-02 partially mischaracterizes `errors.spec.md`'s template-correct bulleted-list format as a defect; `feature_name` is present, just labeled `Feature:` per that file's own (different, correct) template.

**One validated, independently-confirmed blocker:** Codex's AUD-001. I independently re-verified this by reading the actual route and orchestration code before accepting it — confirmed accurate, not a hallucination (unlike an earlier agy finding this same evening, which is why every external finding tonight got independently checked against source before being trusted).

## Per-Finding Rationales

Included verbatim in each auditor's structured JSON response above (Checked/Expected/Observed/Why-it-matters/Recommended-fix/Confidence per finding, per the mandatory packet format).

## Suggested Changes By Auditor

- **Codex:** inline `authorize()` diff for `migrate-forward.ts` (applied, extended to `restore.ts` too); spec-hash fix; CIC B4-style addition.
- **agy:** `errors.spec.md`/`behavior.spec.md`/`traceability.spec.md` hash-field diffs (applied, using SPEC-021's established "anchored in feature.spec.md" convention rather than agy's literal copy-the-hash-in diff, which would have implied a separately-computed hash that doesn't actually exist for those files).
- **Fable:** optional — set an explicit finite `memoryLimit` on the Liquid worker's engine to close the variable-range bypass uniformly (not yet applied — see disposition below); correct the crash-rationale doc comments to credit `resourceLimits`, not the lint cap, as the actual defense.

## Coordinator Response → Agree

- Codex's AUD-001 (blocker): **agree, implemented.** Added inline `authorize()` checks (`storage.migrate` / `backup.restore`) before any lock acquisition in both `migrate-forward.ts` and `restore.ts`'s `/execute` routes, keeping the gateway's own fresh re-check as the authoritative defense-in-depth layer. Added 2 new regression tests proving a bare-grant principal is rejected before the lock/mutation path is ever reached (`storage-migrate-forward-routes.test.ts`, `recovery-restore-routes.test.ts`). Full suite re-verified: 1439/1451 pass (was 1437/1449 pre-fix), same 12 pre-existing/disclosed failures, zero new regressions.
- Convergent spec-hash finding (Codex AUD-002, agy F-02 partial, internal #1): **agree, implemented.** Replaced `sha256:PENDING` with "anchored in feature.spec.md" in all 3 affected SPEC-022 files, matching SPEC-021's own established precedent (verified before applying).

## Coordinator Response → Change

- CIC severity disagreement (internal #2, Codex AUD-003, Fable M3-1): **change, not yet implemented.** All three reviewers converge on the same fix despite disagreeing on current severity — promote the disjointness rule (currently only reachable via `INV-05`'s trace) into an explicit `U-001-B4` Binding Constraint in `critical-internal-constraints.md`, so the table is self-contained without requiring a reader to chase the Trace column. This is a documentation-precision fix to an artifact governing code that doesn't exist yet (SPEC-022 is unimplemented) — not urgent, but cheap and worth doing before Phase 0 implementation starts. **Deferred to the next SPEC-022-touching session**, tracked here rather than done inline to avoid further scope-creeping this already-large session.
- Fable's optional M2-1 fix (explicit `memoryLimit` on the Liquid worker engine): **change, not yet implemented.** Real, empirically-verified, but low-severity (already contained by `resourceLimits`) — recommend fixing alongside a small doc-comment correction (credit `resourceLimits`, not the lint cap, as the actual defense against oversized ranges) in a future AW-5a-touching session, not blocking this audit's closure.

## Coordinator Response → Disagree

- agy's F-01 (UI ceremony actions unwired, labeled blocker): **disagree with the blocker classification.** This is not a newly-discovered defect — it was explicitly disclosed as a known, deliberate sequencing artifact in this session's own Work Log before agy's dispatch (the UI was built against routes that existed at build time; 3 write-ceremony routes were added later the same evening). It doesn't violate any mandatory invariant in either threat model (no data loss, no access-control violation, no test regression) — it's incomplete-feature-coverage, which the packet's blocking-impact threshold doesn't reach. Tracked as a known follow-up (already was, before this audit).
- agy's F-02's "unstructured bulleted list instead of the standard table / completely omits feature_name" characterization of `errors.spec.md`: **disagree, verified inaccurate.** Read the file directly: `feature_name` is present (as `Feature: FEAT-022-production-readiness-phase0`), and the bulleted-list format is that file's own template's correct, by-design structure (different from the other 5 files' table format) — not a defect. The corroborated part of F-02 (the hash placeholder) was separately agreed and fixed above.

## Coordinator Response → Proposed Fix Handling

| # | Proposed fix | Source | Disposition | Rationale | Status |
|---|---|---|---|---|---|
| 1 | Inline `authorize()` before lock acquisition, `migrate-forward.ts` execute route | Codex AUD-001 | `agree-implement` | Validated blocker, independently re-verified against source | **Implemented + re-verified** (2 new tests, full suite green) |
| 2 | Same fix, `restore.ts` execute route | Codex AUD-001 (extended by Coordinator — same defect class, same file family) | `agree-implement` | Same root cause confirmed present in the sibling route | **Implemented + re-verified** |
| 3 | Fix `content_hash: PENDING` in 3 SPEC-022 files | Internal + Codex AUD-002 + agy F-02 (partial) | `agree-implement` | 3-way corroborated, trivial fix, matches SPEC-021 precedent | **Implemented** |
| 4 | Promote INV-05 disjointness rule to explicit CIC Binding Constraint (`U-001-B4`) | Internal #2 + Codex AUD-003 + Fable M3-1 (converge on fix despite severity disagreement) | `agree-defer` | Governs unimplemented code; cheap but not urgent; avoids further scope-creep this session | Tracked, not yet done — next SPEC-022 session |
| 5 | Set explicit finite `memoryLimit` on Liquid worker engine; correct crash-rationale doc comments | Fable M2-1 | `agree-defer` | Real but already contained (resourceLimits), low severity | Tracked, not yet done — next AW-5a-touching session |
| 6 | agy F-01: wire UI ceremony actions | agy | `disagree` (blocker classification) / `agree-defer` (the underlying work itself) | Already-disclosed known gap, doesn't meet either threat model's blocking threshold; the UI work itself is legitimately still owed, just not from this audit | Already tracked pre-audit, unchanged |
| 7 | agy F-02: rewrite `errors.spec.md` as a table, add feature_name | agy | `disagree` | Verified inaccurate — file already correctly follows its own template and already has feature_name | No action (finding was wrong) |

All proposed fixes/recommended_fix entries from every auditor are dispositioned above. Nothing is silently dropped.

## Audit Outcome

**Recomputed `blocking_gate`:** Started `FAIL` (1 validated blocker — Codex's AUD-001). **Now `PASS`** — the blocker was fixed and independently re-verified (2 new regression tests, full-suite re-run showing only the same 12 pre-existing/disclosed failures, zero new regressions) within this same session, per the Disposition Gate's re-verification requirement.

agy's and the internal/Codex CIC-severity disagreement do not independently fail the gate: agy's blocker-labeled findings were dispositioned as `disagree`/`agree-defer` above with evidence-backed rationale (one factually incorrect, one already-disclosed and non-blocking-per-contract), and the CIC disagreement resolved to a converged, deferred documentation fix rather than a validated code-level blocker (no implementation exists yet to violate anything).

## Decision Points For User

1. **CIC severity disagreement (internal+Codex vs. Fable):** three reviewers converge on the same fix (add `U-001-B4`) despite disagreeing on how urgent it is. I've deferred implementing it to keep this session bounded — happy to do it now if you'd rather close it out immediately rather than carry it to the next SPEC-022 session.
2. **The 17 pre-existing admin route files never checked for the authorize() gap** (flagged by the internal verifier, out of this session's diff-scope by the packet's own non-goals): worth a dedicated future sweep, not urgent, but a real open question this audit surfaced rather than resolved.
3. **Fable's M2-1 (Liquid variable-range bypass, contained but real):** low severity, deferred — same call as #1, happy to fix now if preferred.
4. **What would raise agy's score to 10:** wiring the UI ceremony actions (already tracked) and the spec-hash fix (now done). What would raise Codex's score to 10: AUD-001 fixed (now done) plus AUD-002/003 resolved (hash fixed; CIC deferred per #1 above).

---

## Round 2 (Compliance Inspector Pass)

All 3 external auditors reconciled the full cross-auditor ledger and audited the fix diff for new violations.

| Auditor | Round 2 Score | Round 2 Gate | Notes |
|---|---:|---|---|
| Codex | 9/10 | PASS | Confirmed AUD-001 fix correct and complete; found one legitimate gap in the regression tests themselves (see below) |
| agy | 10/10 | PASS | All ledger entries reconciled; honestly re-confirmed its own F-02 was factually wrong rather than defending it |
| Fable | PASS (qualitative) | PASS | Deepest verification: traced every caller of the fixed functions (confirmed single call site each, no bypass), verified the fix uses the exact same `authorize()` function instance as the gateway's own check (no divergent-wiring risk), and found the tests were real but *weaker than their own comments claimed* |

### New finding, addressed: regression tests didn't independently prove lock-ordering

Both Codex and Fable independently flagged the same gap: my original 2 regression tests proved "the request is rejected and nothing mutates," which is necessary but doesn't on its own distinguish "the lock was never touched" from "the lock was acquired-then-cleanly-released before the mutation was rejected" — a subtly weaker guarantee than AUD-001 actually requires.

Fable proposed a concrete, cheap, purely observational fix requiring no mocking: **acquire the site's operation lock manually in the test first, then send the bare-principal request.** Post-fix, `authorize()` rejects before the route ever attempts the lock, so the response is 403 regardless of the pre-held lock. Pre-fix, the route would have reached `acquireOperationLock`, found it already held, and returned 409 (`OPERATION_IN_FLIGHT`/`RESTORE_OPERATION_IN_FLIGHT`) — a status-code-level signal that doesn't depend on response-body shape.

**Implemented and verified both ways:** added one new test per route file using this technique. Confirmed empirically that all 4 AUD-001-related tests (the original 2 plus these 2 new ones) genuinely fail when the fix is temporarily reverted (tested by stripping the fix, running the suite — 4 failures — then restoring it and re-running — 11/11 pass). This is a real regression guard, not a tautology.

Fable also separately confirmed: no other caller reaches `executeMigrateForward`/`executeRestore` outside their route handlers (no bypass path exists), `RouteDeps.authorize` and the gateway's internal `authorize` resolve to the same function instance in both composition roots (no divergent-strictness risk), and taxonomy's `merge-term.ts` (the third gated-mutation ceremony) does not share this defect class (no lock, and hook construction before the gateway's authorize check is pure/side-effect-free).

**New, informational-severity finding (Fable, not caused by this fix, pre-existing):** `merge-term.ts`'s `/plan` route runs a real database read (`computeOverlap`/`countOverlap`) *before* the gateway's `readPermission` check. The result is never returned to an unauthorized caller (the gateway throws before any plan is returned), so this is pre-authorization resource consumption, not a data leak — informational only, not actioned this session, noted for whoever next touches taxonomy's merge-term route.

### Final Disposition Table Update

| # | Item | Round 1 Disposition | Round 2 Status |
|---|---|---|---|
| 1-2 | AUD-001 fix (both routes) | `agree-implement` | **Verified by 3/3 auditors**, strengthened with 2 additional ordering-proof tests per Fable's suggestion, confirmed to genuinely fail pre-fix |
| 3 | Spec-hash placeholders | `agree-implement` | **Verified by 3/3 auditors** |
| 4 | CIC `U-001-B4` addition | `agree-defer` | Unchanged — still deferred, all 3 Round 2 auditors confirmed no diff exists for this (correctly, since it wasn't attempted this round) |
| 5 | Liquid `memoryLimit` fix | `agree-defer` | Unchanged — still deferred |
| 6 | agy F-01 (UI wiring) | `disagree` (blocker classification) | Unchanged |
| 7 | agy F-02 (spec format) | `disagree` | Unchanged — agy itself re-confirmed this in Round 2 |
| 8 (new) | Test-ordering-proof gap | N/A (found in Round 2) | `agree-implement`, **implemented and empirically verified** this round |
| 9 (new) | merge-term pre-auth DB read (Fable) | N/A (found in Round 2) | `agree-defer` — informational severity, pre-existing, not caused by tonight's diff |

## Final Audit Outcome

**`blocking_gate = PASS`**, confirmed independently by all 3 external Round 2 auditors plus the original internal pass. The one validated blocker (AUD-001) is fixed, the fix is verified correct by 3 independent reviewers using 3 different verification strategies (Codex: direct code + permission cross-check; agy: full-ledger reconciliation; Fable: caller-graph tracing + same-function-instance verification + proposing and reasoning through the empirical ordering-proof test design), and the regression tests themselves were hardened and proven to actually catch the regression they claim to guard against.

Full session: 1441/1453 tests passing (same 12 pre-existing/disclosed failures throughout), typecheck clean, zero regressions introduced across two full audit rounds and all associated fixes.
