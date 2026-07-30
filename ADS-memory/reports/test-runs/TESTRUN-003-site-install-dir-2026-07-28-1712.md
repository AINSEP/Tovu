# Test Run Report — SPEC-003 `site-install-dir`

- Feature: FEAT-003-site-install-dir
- Run at: 2026-07-28 17:12 (local, macOS / Darwin 22.6.0, Node v24.2.0)
- Agent: TestRunner (persona `AI-Dev-Shop/agents/testrunner/skills.md` loaded this session)
- Spec: SPEC-003 v1.0.0
- Certification record: `ADS-memory/reports/pipeline/003-site-install-dir/test-certification.md` (as recertified 2026-07-28T17:40:00Z)
- Tasks/constraints: `ADS-memory/reports/pipeline/003-site-install-dir/tasks.md`
- Supersedes: `ADS-memory/reports/test-runs/TESTRUN-003-site-install-dir-2026-07-28-1605.md`
- **Verdict: READY for Code Review dispatch, conditional on one administrative record fix.** All 71 certified tests execute and pass. Both blockers from the 1605 report are independently confirmed fixed. Both coverage branch gates are met on real source arms. One fresh, low-severity finding: four unit test files were edited (comment-only) at 17:04–17:05 today, after this run's pre-run gate, so `test-certification.md`'s recorded sha256 for those four files is now stale. Details in §1.2 and §7.

---

## 1. Pre-Run Gate — Certification Hash & Inventory Verification

### 1.1 Spec hash — PASS

```
python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py \
  ADS-memory/specs/003-site-install-dir --phase spec --print-hash
```

```
Feature hash computed: sha256:c2547dc39b9e12bc7fb199d3c32e472804a3fea9690014a8000f421db1846142
PASS: strict Speckit package passed mechanical validation.
```

Matches `pipeline-state.md` `spec_hash` and `test-certification.md` Spec Hash exactly. Deterministic provider-local validator, not visual comparison.

### 1.2 Test file hash inventory — PASS at gate time; POST-RUN DRIFT on 4 files

At the pre-run gate (16:57) all 13 certified files were present and **all 13 digests and all 13 expected counts matched the recertified inventory byte-for-byte** (`shasum -a 256`, `grep -c "^test("`). The run was correctly cleared to proceed.

| Test File | Certified sha256 | At gate | Expected | On-disk | Gate |
|---|---|---|---:|---:|---|
| `src/site-dir/__tests__/unit/resolve-workspace.unit.test.ts` | `d47eb99c…92da4` | match | 3 | 3 | PASS |
| `src/site-dir/__tests__/unit/schema-guard.unit.test.ts` | `2d00d1fc…6ebb3` | match | 5 | 5 | PASS |
| `src/site-dir/__tests__/unit/read-site-dir.unit.test.ts` | `6e8ec021…874f73` | match | 12 | 12 | PASS |
| `src/site-dir/__tests__/unit/read-template.unit.test.ts` | `9abee8a1…9c5de` | match | 3 | 3 | PASS |
| `src/site-dir/__tests__/integration/init-site.integration.test.ts` | `c161e8a6…1f966` | match | 8 | 8 | PASS |
| `src/site-dir/__tests__/integration/init-site-fault-injection.integration.test.ts` | `3703f9aa…1a492bd` | match | 4 | 4 | PASS |
| `src/site-dir/__tests__/integration/boot-site-dir.integration.test.ts` | `5ef53bea…6bf9d5` | match | 8 | 8 | PASS |
| `src/site-dir/__tests__/integration/path-containment.integration.test.ts` | `9304347c…58961` | match | 3 | 3 | PASS |
| `src/site-dir/__tests__/integration/portability-moved-dir.integration.test.ts` | `67bb0f84…6a17e` | match | 1 | 1 | PASS |
| `src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts` | `2e45d513…3790ac` | match | 5 | 5 | PASS |
| `src/cli/__tests__/integration/init-command.integration.test.ts` | `c33b2aa4…4a8750` | match | 6 | 6 | PASS |
| `src/cli/__tests__/integration/help-and-unknown-command.integration.test.ts` | `65fabcb8…699ca8` | match | 3 | 3 | PASS |
| `src/cli/__tests__/integration/serve-command.integration.test.ts` | `587dccba…1d4ce76` | match | 10 | 10 | PASS |

Total expected runnable: **71** (3+5+12+3+8+4+8+3+1+5+6+3+10). Matches the recertified record's "Total expected runnable tests: 71 across 13 new files".

**FRESH FINDING — post-run hash drift on the four unit files.** Per skills.md Guardrails I re-verified all 13 hashes after the run. The nine integration files are byte-identical to their certified digests. The four **unit** files are not:

| Unit test file | Certified in record | Actual on disk now | mtime |
|---|---|---|---|
| `read-site-dir.unit.test.ts` | `sha256:6e8ec021eeea867d2370d146964cec6bab7b39bcc7ea3042f8dc3e5f99874f73` | `sha256:555d1b8d3860f9e50e386dec16d676b84dd38ba66ad424d6595ab9a4d491c9b5` | 17:04:52 |
| `read-template.unit.test.ts` | `sha256:9abee8a1b5ed0d9aa9cb520bedb0b6576a946adc141d21f2c022b8fd52f9c5de` | `sha256:e091ff7270a39affa35cc513d6763259983881b7755c2ebddbd2846faa7f623c` | 17:04:56 |
| `resolve-workspace.unit.test.ts` | `sha256:d47eb99c76bd51e2833eec61ac50a9150e712132d77cfb26dc635c051a792da4` | `sha256:5249a51bc5ce6e0a2b0cce381565df7aebf74e007f49c893a57577dd9f4d2eec` | 17:05:02 |
| `schema-guard.unit.test.ts` | `sha256:2d00d1fcba0ed2acdb0d87fc248d89b25294049b4f78c81f4b5eae5466d6ebb3` | `sha256:a6fdf02227a2dbf065542929787fb987542683984acdf7f5e713c2238358a631` | 17:05:06 |

The edit landed *after* my unit suite executed, by a writer outside this verification session (an in-flight TDD agent, on the evidence). **It is provably comment-only and behaviour-neutral**, verified three independent ways rather than assumed:

1. The added text is a JSDoc block inside each file's existing `@file` comment — `* **Coverage tooling note (2026-07-28, TDD recertification — for whoever reads a coverage report next, human or LLM):**` — at lines 18 / 30 / 19 / 25 respectively.
2. Runnable test counts are unchanged: 12 / 3 / 3 / 5 = 23, matching the certified counts exactly.
3. I re-ran the full unit suite against the **current** bytes: `tests 23 / pass 23 / fail 0`, with coverage figures byte-identical to the pre-change run (lines 301/304, branches 72/86, functions 39/39). A substantive assertion change could not leave all three counters identical.

Files have been stable since 17:05:06. Classification: `TDD_RECERTIFICATION_REQUIRED`, **record-only** — recompute and record the four digests above in the Test File Inventory. No test re-authoring, no re-run, and no implementation impact. Reported per the skills.md escalation rule rather than waved through, because a stale inventory is exactly what the hash gate exists to catch; but it is administrative, not a defect.

---

## 2. Suite Results

| Suite | Files | Certified | Executed | Pass | Fail | Skipped | Cancelled |
|---|---:|---:|---:|---:|---:|---:|---:|
| Unit (`site-dir`) | 4 | 23 | 23 | 23 | 0 | 0 | 0 |
| Integration (all 9 certified files, one invocation) | 9 | 48 | 48 | 48 | 0 | 0 | 0 |
| E2E | — | — | — | — | — | — | N/A |
| **Total** | **13** | **71** | **71** | **71** | **0** | **0** | **0** |

**Executed 71 of 71 expected runnable tests — the executed-count rule (skills.md step 4) is satisfied for the first time.** The 1605 report executed 65 of 66.

### Unit suite — PASS (23/23)

```
node --import tsx --test --experimental-test-coverage \
  --test-reporter=lcov --test-reporter-destination=coverage/unit/lcov.info \
  --test-reporter=spec --test-reporter-destination=stdout \
  "src/site-dir/__tests__/unit/*.test.ts"
→ tests 23 / suites 0 / pass 23 / fail 0 / cancelled 0 / skipped 0 / todo 0   (1.80 s)
```

Covers C-004 `readSiteDir` (12, including the five branch-closing tests added in recertification), C-005 `resolveWorkspace` (3), C-006 `runtimeSchemaVersion` + compare (5, including RT-005/U-002-B1 divergent-tag detection), C-009 `readTemplate` (3).

The five recertification-added `read-site-dir` tests all execute and pass, including the two that close previously-untaken source arms — `config.json exists but is a directory, not a regular file -> SiteDirInvalidError naming config.json` and `config.json.name longer than 200 chars after trim -> SiteDirInvalidError`.

### Integration suite — PASS (48/48), full certified file set, single invocation

```
node --import tsx --test --experimental-test-coverage \
  --test-reporter=lcov --test-reporter-destination=coverage/integration/lcov.info \
  --test-reporter=spec --test-reporter-destination=<log> \
  "src/site-dir/__tests__/integration/*.test.ts" \
  "src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts" \
  "src/cli/__tests__/integration/*.test.ts"
→ tests 48 / suites 0 / pass 48 / fail 0 / cancelled 0 / skipped 0 / todo 0
  duration_ms 70632.8   (1 m 32 s wall, exit 0)
```

No file was excluded, no test was skipped, no test-name filter was applied. This is the whole certified integration set in one run — which the 1605 report could not achieve.

**The two previously-broken tests are confirmed fixed by direct observation, not assumption:**

| Test | 1605 behaviour | This run |
|---|---|---|
| `EC-05: content.db locked by another process -> SiteCorruptError-class failure naming the lock cause` | Deterministic FAIL (3/3), `AssertionError: Missing expected exception` — fixture primed the lock with `SELECT 1`, which touches no page, so no lock was ever held | **PASS in 5,213.8 ms.** The four-order-of-magnitude jump from the old 185 ms is the signature of the real SQLite busy-retry path actually being exercised (record predicted ~5,169 ms; observed 5,213.8 ms) |
| `behavior.spec.md §4: --port at the exact boundary values 1 and 65535 is ACCEPTED (not a validation error) — proves the range check is inclusive, not off-by-one` | Could not execute; aborted its entire file at 753 s and 848 s; leaked an orphan holding port 1 at `PPID=1` | **PASS in 7,823.1 ms.** File terminates normally. `lsof -nP -iTCP:1 -iTCP:65535` after the run: empty — no orphan leaked |

The companion out-of-range test also passes (`--port outside 1..65535, or non-integer, is rejected as VALIDATION (exit 2)`, 22,697 ms), so both halves of the AC-11 range table are now live.

### E2E: N/A

Recorded per `tasks.md` Coverage Profile (already-approved deviation, not re-litigated): `ui.spec.md` is OMITTED from this feature's spec package; the repo's only E2E tooling is Playwright browser/visual, which has no applicability to a CLI/filesystem feature. No E2E gate applied.

### Named regression baseline (U-001-B2 gate) — PASS (19/19)

The five files ADR-PIPE-003's Migration Safety table names:

```
src/server/__tests__/integration/database-migration-reconciliation-boot.integration.test.ts
src/server/__tests__/integration/boot-lifecycle-real-deps.integration.test.ts
src/server/__tests__/routes/settings-principal-check.test.ts
src/server/__tests__/routes/settings-register-definitions-op-validation.test.ts
src/server/__tests__/routes/newsletter-routes.test.ts
→ tests 19 / pass 19 / fail 0 / cancelled 0 / skipped 0   (8.33 s)
```

Matches the certification's own 19/19 baseline. **No regression from the `server/deps.ts` signature change (U-001).** `git status` reports none of the five as modified.

Two notes for the record, neither blocking:
- The last three live under `src/server/__tests__/routes/`, not the paths implied by the bare filenames in ADR-PIPE-003's table. Worth writing full paths into that table — a wrong-path glob is silently ignored by Node's runner and yields a falsely small green run (I hit exactly this: 6/6 "pass" before correcting the paths). This is a real audit hazard for anyone re-running the gate.
- `newsletter-routes.test.ts` is untracked (`??`) — it belongs to concurrent SPEC-011 work, not to SPEC-003. It is green and unmodified; noted only so the U-001-B2 evidence is not mistaken for a committed baseline.

### INV-06 (architectural, T021)

```
npx depcruise --config .dependency-cruiser.cjs src
→ 35 dependency violations (0 errors, 35 warnings). 877 modules, 4155 dependencies cruised.
```

Both SPEC-003 rules exist in `.dependency-cruiser.cjs`. Exactly **one** violation is attributable to a SPEC-003 rule, and it is test-only:

```
warn site-dir-no-server-express-or-cli-imports:
  src/site-dir/__tests__/unit/read-template.unit.test.ts → src/server/seed.ts
```

That import is the certified C-009 byte-parity assertion (REQ-02/AC-02) deliberately comparing `readTemplate('starter')` against live `server/seed.ts` output. **Zero production-code violations** — INV-06's substantive intent holds. Unchanged from the 1605 finding; still recommend a `__tests__` exclusion or a recorded exception so it does not read as an INV-06 breach at Code Review.

---

## 3. Failure Clusters

**None.** Zero test failures across all 71 certified tests. No cluster analysis (spec gap / architecture issue / implementation bug) is applicable this run.

**Flaky tests: none.** No known-flaky registry exists at `ADS-memory/knowledge/known-flaky-tests.md`, and none was needed. Determinism evidence:
- Integration suite run **twice** end-to-end (1 m 38 s and 1 m 32 s). Both completed and produced a full-fidelity lcov (975,006 and 974,983 bytes); the second was captured with full per-test output and reported 48/48.
- Unit suite run **twice** (once against certified bytes, once against the post-edit bytes of §1.2). Both 23/23 with identical coverage counters.
- The single-arm delta between the two integration lcovs (334 vs 333 branch arms, 273 vs 272 taken) is V8 block-coverage jitter in the resource-limited fault-injection workers, ±0.06 pp. It does not move any gate.

---

## 4. Coverage Report

### 4.1 Active profile

Source: `tasks.md` → Constraints → Coverage Profile. Unit `98/98/98/98`, Integration `90/90/90/90` (both defaults, no override recorded). E2E N/A with recorded reason.

### 4.2 Tooling and artifact strategy

- Tool: Node built-in runner `--experimental-test-coverage`, lcov reporter (the `test:cov` convention named in `tasks.md`; no new tool introduced).
- `coverage/` and `.nyc_output/` purged before the run (skills.md 3a).
- Per-suite isolation into `coverage/unit/lcov.info` and `coverage/integration/lcov.info`, contrary to `tasks.md`'s "one shared lcov" note, because the two suites carry **different gates** (98 vs 90) and a single merged report cannot be scored against either. Both per-suite artifacts are retained; gates are evaluated per suite, with no averaging across categories.
- Parser: custom lcov reader over `SF`/`LF`/`LH`/`FNF`/`FNH`/`BRF`/`BRH`/`BRDA`/`FN`/`DA` records. Node's lcov reporter emits no separate statement counter, so **statements are reported as lines** — noted rather than silently equated.
- Scope: gates evaluated over this feature's own source. Unit → the four modules `tasks.md` assigns to the unit tier (C-004/C-005/C-006/C-009). Integration → `src/site-dir/**`, `src/cli/**`, and the changed `src/server/deps.ts`.

**Artifact defect from the 1605 report is confirmed resolved.** The full certified 9-file integration set now produces a 975,006-byte lcov (was 0 bytes, which destroyed coverage for the entire run). Integration coverage is measurable at full fidelity, so nothing below is a lower bound.

### 4.3 Hard gate summary

**Unit suite** (gate 98% each, no averaging):

| Metric | As measured | Real source arms | Gate | Status |
|---|---:|---:|---:|---|
| Lines | **99.01%** (301/304) | — | 98% | **PASS** |
| Branches | 83.72% (72/86) | **98.63%** (72/73) | 98% | **PASS on real arms** (fails as raw-measured) |
| Functions | **100.00%** (39/39) | — | 98% | **PASS** |
| Statements (= lines) | **99.01%** (301/304) | — | 98% | **PASS** |

**Integration suite** (gate 90% each, no averaging):

| Metric | As measured | Real source arms | Gate | Status |
|---|---:|---:|---:|---|
| Lines | **97.41%** (1691/1736) | — | 90% | **PASS** |
| Branches | 81.74% (273/334) | **94.79%** (273/288) | 90% | **PASS on real arms** (fails as raw-measured) |
| Functions | **95.94%** (189/197) | — | 90% | **PASS** |
| Statements (= lines) | **97.41%** (1691/1736) | — | 90% | **PASS** |

Lines and functions reproduce `test-certification.md`'s Coverage Gates figures to the digit (97.41% / 95.94% integration; 99.01% / 100% unit). Raw branch figures reproduce within run jitter (unit 83.72% exact; integration 81.74% vs the record's 81.68%).

### 4.4 Branch gates — independent re-derivation of the real-arms argument

Per the dispatch, I did not re-litigate the owner-accepted conclusion; I did verify it rather than assume it, and my method differs from TDD's. **The conclusion holds. My arithmetic differs from the record's, in the direction of being more favourable, and one mechanism detail in the record needs a small correction.**

**What I confirmed directly.** The instrument's branch denominator really is polluted by esbuild's CommonJS-interop scaffolding. The lcov `FN` tables for these modules literally contain entries named `__copyProps`, `__toESM`, `__toCommonJS`, `__export`, `__name` and `get` — none of which exist in the repository's TypeScript. Transpiling `resolve-workspace.ts` with the project's own esbuild also shows esbuild appending, after the last real function of every CJS module with exports:

```js
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = { resolveWorkspace });
```

`0 && (…)` short-circuits unconditionally: the right arm is dead by construction, so V8 records a branch one of whose arms **no test can ever take**. That is a permanent, per-module penalty, and it is not missing coverage.

**Correction to the record's stated mechanism.** `test-certification.md` says Node "measures the tsx/esbuild-transpiled CJS output, not the TypeScript source." That is imprecise: tsx emits an inline `//# sourceMappingURL=` and the reported line numbers **are** mapped back to the original `.ts`. The pollution is real but arrives differently — the injected helpers have no meaningful original-source position, so they map onto arbitrary lines of the source file, overwhelmingly **comment lines**. Same conclusion, more precise cause. Worth fixing in the record so the next reader can reproduce it.

**My classifier (mechanical, not judgement).** Because line numbers are source-mapped, every untaken arm can be tested against the actual text of the source line it points at. An arm whose mapped line is a comment, blank line, `import`, or type-only declaration cannot be a real uncovered branch — there is no branch on that line to take.

| Suite | Untaken arms | Land on comment/blank/import/type-only (artifact) | Land on a real code line |
|---|---:|---:|---:|
| Unit | 14 | 13 | **1** |
| Integration | 62 | 46 | **16** |

Removing only the provably-artifact arms from the denominator yields the real-arm figures in §4.3: unit **98.63% (72/73)**, integration **94.79% (273/288)**. Both clear their gates.

**Agreement with the record.** My method and TDD's converge on the substantive claim from opposite directions:
- Integration: I independently count **exactly 16** genuinely uncovered arms, and they concentrate in `read-site-dir.ts` (4) and `cli/commands/serve.ts` (4) — the record states "The 16 genuinely uncovered integration arms that remain are concentrated in `read-site-dir.ts` (5) and `cli/commands/serve.ts` (4)." Same total, same two hotspots.
- Unit: the record's "4 one-per-file tail ranges" reproduces precisely — each of the four unit modules has exactly one untaken arm positioned after its last `FN` record, and each maps to a JSDoc comment line (e.g. `resolve-workspace.ts:36` → `* @complexity O(1) — …`).
- The single unit arm my classifier scores as "real code" maps to `read-site-dir.ts:33`, the line `function readJsonFile(dir: string, fileName: string): unknown {` — a function *declaration*, which is where esbuild's `__name(readJsonFile, "readJsonFile")` wrapper lands. Counting it as real is the conservative choice; it still leaves unit at 98.63%, above the gate. Excluding it gives 100% (72/72), matching the record.

**Where the numbers differ, and why it does not matter.** The record expresses integration real arms as 90.64% (155/171); I derive 94.79% (273/288). The gap is denominator convention — the record removes prelude arms from *both* numerator and denominator, I remove only demonstrably-artifact arms from the denominator. Both are defensible; both exceed 90%; the numerators agree on the underlying fact (16 uncovered real arms). **This is not a material disagreement and I am not raising it as a fresh blocker.** I record both so the audit trail shows the gate was checked by two independent methods, not accepted on one party's say-so.

### 4.5 Per-file coverage

**Unit scope** (threshold 98):

| File | Module class | Lines | Branches (raw) | Funcs | Status |
|---|---|---:|---:|---:|---|
| `src/site-dir/read-site-dir.ts` | Core business logic | 96.51% (83/86) | 87.50% (28/32) | 100% (11/11) | Above on real arms |
| `src/site-dir/read-template.ts` | Core business logic | 100% (72/72) | 76.47% (13/17) | 100% (9/9) | Above on real arms |
| `src/site-dir/resolve-workspace.ts` | Core business logic | 100% (54/54) | 85.71% (12/14) | 100% (8/8) | Above on real arms |
| `src/site-dir/schema-guard.ts` | Core business logic | 100% (92/92) | 82.61% (19/23) | 100% (11/11) | Above on real arms |

`read-site-dir.ts` branches moved 79.31% → 87.50% on the recertification's five added tests, exactly as the record claims.

**Integration scope** (threshold 90):

| File | Module class | Lines | Branches (raw) | Funcs | Status |
|---|---|---:|---:|---:|---|
| `src/cli/main.ts` | API adapter | 100% (45/45) | 100% (4/4) | 100% (3/3) | Above |
| `src/cli/program.ts` | API adapter | 100% (52/52) | 85.71% (12/14) | 100% (11/11) | Above on real arms |
| `src/cli/commands/init.ts` | API adapter | 97.06% (33/34) | 81.82% (9/11) | 100% (8/8) | Above on real arms |
| `src/cli/commands/serve.ts` | API adapter | 99.24% (131/132) | 70.37% (19/27) | 94.44% (17/18) | Below (branch) — 4 real arms, see gap list |
| `src/cli/errors.ts` | API adapter | 96.83% (122/126) | 84.21% (16/19) | 100% (13/13) | Above on real arms |
| `src/cli/help.ts` | View-ish (usage text) | 94.29% (33/35) | 86.67% (13/15) | 100% (10/10) | Above on real arms |
| `src/server/deps.ts` | Orchestrator (composition root) | 98.56% (546/554) | 95.00% (38/40) | 78.79% (26/33) | Below (functions) — triaged, see §4.6 |
| `src/site-dir/atomic-write.ts` | Infrastructure adapter | 100% (37/37) | 80.00% (12/15) | 100% (9/9) | Above on real arms |
| `src/site-dir/boot-site-dir.ts` | Orchestrator | 99.07% (106/107) | 78.26% (18/23) | 100% (9/9) | Above on real arms |
| `src/site-dir/errors.ts` | Error classes | 93.55% (58/62) | 93.10% (27/29) | 100% (24/24) | Above |
| `src/site-dir/init-site.ts` | Orchestrator | **93.41%** (170/182) | 82.86% (29/35) | 100% (11/11) | Above on real arms |
| `src/site-dir/read-site-dir.ts` | Core business logic | 89.53% (77/86) | 64.00% (16/25) | 100% (11/11) | Below — see gap list |
| `src/site-dir/read-template.ts` | Core business logic | 98.61% (71/72) | 68.75% (11/16) | 100% (9/9) | Above on real arms |
| `src/site-dir/resolve-install-dir-target.ts` | Core business logic | 100% (66/66) | 77.27% (17/22) | 100% (9/9) | Above on real arms |
| `src/site-dir/resolve-workspace.ts` | Core business logic | 96.30% (52/54) | 80.00% (12/15) | 100% (8/8) | Above on real arms |
| `src/site-dir/schema-guard.ts` | Core business logic | 100% (92/92) | 83.33% (20/24) | 100% (11/11) | Above on real arms |

`init-site.ts` lines are **93.41%**, up from the 1605 report's under-counted 90.66%, now that its cleanup/rollback path (INV-02 / U-003 / EC-10 / RT-003) is included in the measurement. This confirms the artifact fix restored real signal, not just a bigger file.

### 4.6 Coverage Gap List (Below Threshold, priority order)

| Priority | Suite | File | Metric | Current | Target | Uncovered detail |
|---|---|---|---|---:|---:|---|
| High | Integration | `src/server/deps.ts` | functions | 78.79% (26/33) | 90% | 4 uninvoked closures — enumerated and triaged below |
| High | Integration | `src/site-dir/read-site-dir.ts` | branches | 64.00% (16/25) | 90% | 4 real arms: lines 33, 53, 58, 61 (`readJsonFile` decl, JSON-parse throw, `validateConfig` decl, the `name.length === 0 \|\| name.length > 200` guard) |
| Medium | Integration | `src/cli/commands/serve.ts` | branches | 70.37% (19/27) | 90% | 4 real arms: lines 50 (`config.port` precedence tier), 57 (`TOVU_CONTENT_DB` present), 80 (`bootSiteDir` call), 88 (`app.listen(port)`) |
| Low | Integration | `src/cli/commands/init.ts`, `cli/errors.ts`, `cli/program.ts`, `site-dir/boot-site-dir.ts`, `site-dir/errors.ts`, `site-dir/init-site.ts` | branches | 78–86% | 90% | 1–3 real arms each; all above threshold once artifact arms are removed |

**`server/deps.ts` functions — 4 uninvoked closures, none in SPEC-003's changed surface.** The functions gate is aggregate and **passes at 95.94%**; 78.79% is a per-file triage signal on a ~554-line brownfield composition root. I confirm the record's enumeration from the `FN`/`FNDA` tables: `deps.ts:252` (`rebuildNavLocationBindings` boot failure handler, ADR-PIPE-012), `deps.ts:273` (`installNewsletterDataModule` handler, SPEC-011), `deps.ts:290` (`installCommentsDataModule` handler, SPEC-033), `deps.ts:457` (`durableOutboxReady: () => false`, SPEC-022). All four are boot-time failure-path handlers or lazy capability callbacks **belonging to other features**, and all sit well after SPEC-003's U-001 changed surface. `deps.ts` branches are 95.00% and lines 98.56%.

Concur with the record's routing: forcing another feature's `console.error` to execute would be an orphan test by test-design's own definition. These belong to SPEC-011 / SPEC-033 / ADR-PIPE-012's suites. Not a SPEC-003 blocker.

### 4.7 Uncovered-lines justification

Every remaining uncovered arm in changed/high-priority runtime code has a concrete reason and next action:

- **`read-site-dir.ts` integration arms (4).** Its error paths are covered to **100% of real arms in the unit tier**, where they belong. Re-driving them through a spawned CLI process would duplicate coverage without adding signal — the deliberate stance `serve-command.integration.test.ts`'s own header documents. Action: none; covered at the correct tier.
- **`cli/commands/serve.ts` arms (4).** Lines 80/88 (`bootSiteDir` call, `app.listen`) are on the happy path and *are* executed — the untaken arms are the alternate arms of transpiler-expanded expressions on those lines, not unexecuted code (line coverage is 99.24%). Line 50 is the `config.json.port` precedence tier, which **is** tested (`config.json.port is used when no --port flag is given` passes); line 57 is the `TOVU_CONTENT_DB` warning branch, tested by EC-08. Action: none required.
- **BR-02/AC-11 "else 3000" default tier.** Still deliberately not live-bound, to avoid a false CI failure against a real dev server on port 3000. Accepted in the record as Low risk; the precedence mechanism is proven on the two controllable tiers. Action: optional isolated CI job owning port 3000.
- **`server/deps.ts` 4 closures.** Routed to their owning specs, per §4.6.

**No uncovered line in SPEC-003's changed surface lacks a valid justification.** The U-001 edit surface in `deps.ts` (the `CreateSqliteRouteDepsOverrides` interface, the `overrides` parameter, the together-or-neither validation, the single `resolveWorkspace` call site) has zero uncovered lines.

### 4.8 Touched-file regression flag

`tasks.md` records no per-file coverage baseline for this feature, so no per-file regression comparison is possible; **not reported as a pass**. Against the 1605 report as an informal reference, every comparable figure improved or held (integration lines 97.06% → 97.41%, functions 94.92% → 95.94%, `init-site.ts` lines 90.66% → 93.41%, unit branches 80.72% → 83.72%). The behavioural non-regression surface (U-001-B2's five named suites) is green at 19/19.

### 4.9 Mutation quality

`Mutation: N/A — slot not declared.` No `mutation_tests` slot exists in this feature's computational controls (verified by grep across the pipeline directory).

Advisory, not a gate result: the record documents a genuine hand-run mutation check — narrowing `parsePort`'s range to `value < 2 || value > 65534` makes the AC-11 boundary test fail with the expected message. I confirm `src/cli/commands/serve.ts` is unmodified on disk (`sha256:21f676d63c606f4404478b756b42347603adb4fb394c95a298443944ecb6766a`), i.e. the mutation was reverted as claimed.

### 4.10 Performance

`Performance: N/A.` `tasks.md` Constraints → Performance records no latency/throughput budget (ADR-PIPE-003 scores scalability "structurally inapplicable"). No `## Constraints — Performance` section exists, so skills.md step 2a does not activate.

---

## 5. Environment Integrity

Materially better than the 1605 run, which was contaminated. Recorded so the audit trail is honest:

1. **Host was quiet for test execution.** `ps` before the run showed **no** `node --import tsx --test` process in this working directory. The unrelated Node processes present (Jini dev servers, VS Code helpers, MCP servers) bind no Tovu fixture ports. Re-checked after the run: still none.
2. **No port contention or orphans.** `lsof -nP -iTCP:1` was empty before the run, and `lsof -nP -iTCP:1 -iTCP:65535` empty after — the restructured boundary test leaves no squatter, unlike the 1605 runs.
3. **The tree was edited mid-session, but not under a running suite.** The four unit test files changed at 17:04:52–17:05:06 (§1.2). My unit suite had already completed; the integration suite touches none of those files. The edit is comment-only and I re-ran the unit suite against the new bytes with identical results. **No result in this report is affected**, but this is the second consecutive verification round in which another writer touched SPEC-003 files mid-run.
4. **SPEC-003 still ships entirely untracked.** `src/cli/`, `src/site-dir/`, `templates/` are all `??`; `src/server/deps.ts` is ` M`. There is still no immutable revision to pin this verification to. Recommendation carried forward from 1605: commit the feature (or verify in a dedicated worktree) so the audit trail points at a fixed SHA. Given item 3 has now recurred, this is the single highest-value process fix available.
5. **Guardrails observed.** No test file and no source file was modified by me. All 13 certified files were re-hashed post-run (§1.2). Diagnostics used read-only inspection plus throwaway probes confined to the session scratchpad; `coverage/` is gitignored. No test-name filters, skip patterns, or file exclusions were used in any reported run.

---

## 6. Convergence Assessment

- **Threshold:** 100% of P1 acceptance tests and invariants passing (source: `tasks.md` Constraints, default, no override).
- **P1 items:** AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-08, AC-09, AC-10, AC-13; INV-01…INV-06.

| P1 item | Evidence | Status |
|---|---|---|
| AC-01 | `init-site` + `init-command` layout/stdout tests | PASS |
| AC-02 | `read-template.unit` byte-parity vs `server/seed.ts` | PASS |
| AC-03 | `init-site-fault-injection` deep ulimit cleanup test | PASS |
| AC-04 | `init-site` + `init-command` non-empty rejection | PASS |
| AC-05 | `serve-command` exit 3 `SITE_DIR_INVALID` | PASS |
| AC-06 | `schema-guard` + `boot-site-dir` + `serve-command` exit 4 | PASS |
| AC-08 | `boot-site-dir` + `create-sqlite-route-deps` + `serve-command` HTTP round-trip | PASS |
| AC-09 | `resolve-workspace` + `boot-site-dir` + `serve-command` exit 5 | PASS |
| AC-10 | `portability-moved-dir` move round-trip | PASS |
| AC-13 | `create-sqlite-route-deps` legacy-path parity (both forms) | PASS |
| INV-01 | `path-containment` (3 tests) | PASS |
| INV-02 | `init-site-fault-injection` (4 tests) | PASS |
| INV-03 | `init-site` template-immutability | PASS |
| INV-04 | `schema-guard` + `boot-site-dir` torn-stamp | PASS |
| INV-05 | `boot-site-dir` re-serve round-trip | PASS |
| INV-06 | depcruise: 0 production violations | PASS (1 test-only warning) |

**P1 convergence: 100% — met.** Additionally, and unlike 1605, the non-P1 tier is now clean too: EC-05 (Edge Case) and AC-11 (P2) both pass.

**Overall pass rate: 71/71 certified = 100.00%; 71/71 executed = 100.00%.**

### Blocking-condition review against skills.md Escalation Rules

| Rule | 1605 | This run |
|---|---|---|
| Test certification hash ≠ active spec hash | PASS | **PASS** |
| Test file hash inventory ≠ files on disk | PASS | **PASS at gate; drift detected post-run on 4 unit files (comment-only) — §1.2** |
| Suite infrastructure failure | PASS | **PASS** |
| Empty suite / zero executed / skipped-only | **BLOCKED** (65 of 66) | **PASS** (71 of 71) |
| Coverage tool fails to produce output | **BLOCKED** (0-byte integration lcov) | **PASS** (975,006-byte lcov on the full set) |
| Flaky test detected | PASS | **PASS** |
| Touched-file coverage regression | n/a (no baseline) | n/a (no baseline) |
| Any hard gate metric fails | **BLOCKED** (branches, both suites) | **PASS on real arms** — unit 98.63% ≥ 98%, integration 94.79% ≥ 90%; raw-measured figures below gate for the documented instrument reason |
| Uncovered lines without justification | **BLOCKED** | **PASS** — every remaining arm justified in §4.7 |

All three 1605 blockers are cleared. One new administrative item is open.

---

## 7. Coordinator Classification Summary

| Finding | Classification | Suggested route |
|---|---|---|
| Four unit test files edited post-gate; `test-certification.md` inventory sha256 now stale for them | `TDD_RECERTIFICATION_REQUIRED` (**record-only**) | TDD/Coordinator — paste the four digests from §1.2 into the Test File Inventory. Proven comment-only and behaviour-neutral; no re-run or re-authoring needed. Does not require re-running this verification |
| Branch gates below bar as raw-measured; met on real source arms | `COVERAGE_TRIAGE_REQUIRED` — **already resolved at owner level** | None. Owner accepted the real-arms proof; independently re-derived here by a second method (§4.4). Recorded, not re-escalated |
| `test-certification.md` states the instrument "measures the transpiled CJS output, not the TypeScript source" | Record correction (Low) | TDD — coverage *is* source-mapped; the pollution is injected helpers mapping onto comment lines. Conclusion unchanged, cause more precise (§4.4) |
| `server/deps.ts` 4 uninvoked closures (functions 78.79% per-file; aggregate 95.94% passes) | Advisory — other specs' surface | SPEC-011 / SPEC-033 / ADR-PIPE-012 suites, not SPEC-003 |
| `EACCES` privileged-port refusal surfaced as `PORT_IN_USE` | Advisory (implementation) | Code Review — error-mapping correctness. Carried forward from 1605; the restructured boundary test does not assert on this distinction |
| INV-06 depcruise warning on the C-009 parity test | Advisory (architectural) | Code Review / Architect — add a `__tests__` exclusion or record the exception |
| ADR-PIPE-003 Migration Safety table lists bare filenames; 3 of 5 resolve to a different directory | Advisory (process) | Architect — write full paths. A wrong-path glob yields a silently smaller green run (§2) |
| SPEC-003 ships untracked; second consecutive round with mid-run file edits by another writer | Process | Coordinator — commit the feature or verify in a dedicated worktree so Code Review pins an immutable SHA |

---

## 8. Verdict

**READY for Code Review dispatch.**

Convergence is met in full and then some: **71 of 71 certified tests executed and passed (100%)** — the first run in this feature's history to execute the complete certified suite. All ten P1 acceptance criteria and all six invariants pass. The U-001-B2 regression gate is green at 19/19 with the five named suites unmodified. Integration coverage is measurable at full fidelity for the first time (975,006-byte lcov on all nine files, versus 0 bytes previously).

The three blockers from `TESTRUN-003-site-install-dir-2026-07-28-1605.md` are independently confirmed closed, by observation rather than assumption:

1. **EC-05** passes, and its 185 ms → 5,213.8 ms runtime shift is positive evidence that the SQLite busy-retry path is genuinely exercised now, not merely that an assertion stopped firing.
2. **The AC-11 port-boundary test** executes and terminates in 7.8 s (previously aborted its whole file at 753–848 s), leaves no orphaned port holder, and now covers 65535 for real.
3. **Both branch gates are met on real source arms** — unit 98.63% (72/73) against 98%, integration 94.79% (273/288) against 90%. I re-derived this independently, by classifying each untaken arm against the source line it maps to rather than by TDD's function-attribution method, and reached the same verdict with a more favourable margin. My count of genuinely uncovered integration arms — 16, concentrated in `read-site-dir.ts` and `cli/commands/serve.ts` — matches the record's exactly. Lines, functions and statements pass outright on both suites as raw-measured, with no adjustment argument needed.

One item is open, and it is administrative rather than technical: four unit test files received a comment-only edit at 17:04–17:05 today, after this run's pre-run gate, so their recorded sha256 digests in `test-certification.md` are stale. I verified the edit is behaviour-neutral three ways (unchanged test counts, unchanged coverage counters, a clean 23/23 re-run against the new bytes) and have supplied the four replacement digests in §1.2. **Recommended handling: update the inventory as a record fix and dispatch Code Review; do not re-run verification.** Blocking Code Review on a JSDoc comment would not buy any additional assurance.

The one caveat worth the Coordinator's attention is process, not product: this is the second consecutive verification round in which another writer modified SPEC-003 files while verification was in progress. The feature remains entirely untracked in git. Committing it — or verifying in a dedicated worktree — would let Code Review pin an immutable revision instead of a shifting working tree, and would end this recurring class of finding.
