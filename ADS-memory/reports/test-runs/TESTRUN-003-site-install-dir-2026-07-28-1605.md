# Test Run Report — SPEC-003 `site-install-dir`

- Feature: FEAT-003-site-install-dir
- Run at: 2026-07-28 16:05 (local, macOS / Darwin 22.6.0, Node v24.2.0)
- Agent: TestRunner (persona `AI-Dev-Shop/agents/testrunner/skills.md` loaded this session)
- Spec: SPEC-003 v1.0.0
- Certification record: `ADS-memory/reports/pipeline/003-site-install-dir/test-certification.md`
- Tasks/constraints: `ADS-memory/reports/pipeline/003-site-install-dir/tasks.md`
- **Verdict: NOT READY for Code Review dispatch.** Three independent blockers (one failing certified test, one certified test that cannot execute at all, one hard coverage-gate failure). Details below.

---

## 1. Pre-Run Gate — Certification Hash & Inventory Verification

### Spec hash

```
python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py \
  ADS-memory/specs/003-site-install-dir --phase spec --print-hash
```

```
Feature hash computed: sha256:c2547dc39b9e12bc7fb199d3c32e472804a3fea9690014a8000f421db1846142
PASS: strict Speckit package passed mechanical validation.
```

Matches `pipeline-state.md` `spec_hash` and `test-certification.md` Spec Hash exactly. Deterministic provider-local validator used, not visual comparison. **PASS.**

### Test file hash inventory (`shasum -a 256`, macOS host)

All 13 certified files present; all 13 digests match the certification inventory byte-for-byte. All 13 expected test counts match `grep -c "^test("` on disk.

| Test File | Certified sha256 | On-disk | Expected | On-disk | Status |
|---|---|---|---:|---:|---|
| `src/site-dir/__tests__/unit/resolve-workspace.unit.test.ts` | `d47eb99c…92da4` | match | 3 | 3 | PASS |
| `src/site-dir/__tests__/unit/schema-guard.unit.test.ts` | `2d00d1fc…6ebb3` | match | 5 | 5 | PASS |
| `src/site-dir/__tests__/unit/read-site-dir.unit.test.ts` | `515974a1…1af22` | match | 7 | 7 | PASS |
| `src/site-dir/__tests__/unit/read-template.unit.test.ts` | `9abee8a1…9c5de` | match | 3 | 3 | PASS |
| `src/site-dir/__tests__/integration/init-site.integration.test.ts` | `c161e8a6…1f966` | match | 8 | 8 | PASS |
| `src/site-dir/__tests__/integration/init-site-fault-injection.integration.test.ts` | `93c4a919…26d14` | match | 4 | 4 | PASS |
| `src/site-dir/__tests__/integration/boot-site-dir.integration.test.ts` | `286b0462…5c50a` | match | 8 | 8 | PASS |
| `src/site-dir/__tests__/integration/path-containment.integration.test.ts` | `9304347c…58961` | match | 3 | 3 | PASS |
| `src/site-dir/__tests__/integration/portability-moved-dir.integration.test.ts` | `67bb0f84…6a17e` | match | 1 | 1 | PASS |
| `src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts` | `2e45d513…3790ac` | match | 5 | 5 | PASS |
| `src/cli/__tests__/integration/init-command.integration.test.ts` | `c33b2aa4…4a8750` | match | 6 | 6 | PASS |
| `src/cli/__tests__/integration/help-and-unknown-command.integration.test.ts` | `65fabcb8…699ca8` | match | 3 | 3 | PASS |
| `src/cli/__tests__/integration/serve-command.integration.test.ts` | `85d44388…89f2f3` | match | 10 | 10 | PASS |

**Gate result: PASS — no drift, no missing file, no zero-count file.** Cleared to run.

---

## 2. Suite Results

| Suite | Files | Certified | Executed | Pass | Fail | Not executable |
|---|---:|---:|---:|---:|---:|---:|
| Unit (`site-dir`) | 4 | 18 | 18 | 18 | 0 | 0 |
| Integration — `site-dir` | 5 | 24 | 24 | 23 | **1** | 0 |
| Integration — `server/deps` | 1 | 5 | 5 | 5 | 0 | 0 |
| Integration — `cli` init/help | 2 | 9 | 9 | 9 | 0 | 0 |
| Integration — `cli` serve | 1 | 10 | 9 | 9 | 0 | **1** |
| E2E | — | — | — | — | — | N/A |
| **Total** | **13** | **66** | **65** | **64** | **1** | **1** |

**Executed 65 of 66 expected runnable tests.** Per `skills.md` step 4, an executed count below the certified expected count is a blocking condition.

**Consolidated confirmation run.** All nine integration files were additionally run together in a single invocation on an idle host, with only the non-terminating port-boundary test skipped: `tests 47 / pass 46 / fail 1 / cancelled 0 / skipped 0`. The 47 = 24 (`site-dir`) + 5 (`server/deps`) + 9 (`cli` init/help) + 9 (`cli` serve, of 10). The single failure is EC-05, reproducing the same assertion as in the per-file runs. This corroborates the per-suite numbers above from one run rather than five.

### E2E: N/A

Recorded per `tasks.md` Coverage Profile (already-approved deviation, not re-litigated): `ui.spec.md` is OMITTED from this feature's spec package; the repo's only E2E tooling is Playwright browser/visual (`e2e/theme-visual.spec.ts`), which has no applicability to a CLI/filesystem feature. No E2E gate applied.

### Unit suite — PASS (18/18)

`node --import tsx --test "src/site-dir/__tests__/unit/*.test.ts"` → `tests 18 / pass 18 / fail 0`, 3.7s. Covers C-004 `readSiteDir`, C-005 `resolveWorkspace`, C-006 `runtimeSchemaVersion`+compare, C-009 `readTemplate`, including RT-005/U-002-B1 divergent-tag detection.

### Integration — `site-dir` — 23/24, ONE FAILURE

`node --import tsx --test "src/site-dir/__tests__/integration/*.test.ts"` → `tests 24 / pass 23 / fail 1`, 13.1s.

Passing (summarised): AC-01/AC-14 layout, BR-03 basename default, EC-01/EC-02 non-empty and file-at-target rejection, EC-06 name validation, INV-03 template immutability, all 4 INV-02/U-003 fault-injection cleanup tests, all 3 INV-01/U-004-B1 path-containment tests, AC-06 newer-schema, RT-005 divergent tag, AC-07/INV-05 migrate-forward round-trip, EC-07 unknown templateId warn-and-proceed, U-002-B2/ORD1 blocked-stamp-write atomicity, AC-08/AC-09 workspace resolution, AC-10/REQ-08 moved-dir portability.

**FAILING — full output:**

```
test at src/site-dir/__tests__/integration/boot-site-dir.integration.test.ts:2:7816
✖ EC-05: content.db locked by another process -> SiteCorruptError-class failure naming the lock cause (185.247565ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (/Users/la/Programming/Tovu/src/site-dir/__tests__/integration/boot-site-dir.integration.test.ts:200:12)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1062:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:752:18)
      at Test.postRun (node:internal/test_runner/test:1191:19)
      at Test.run (node:internal/test_runner/test:1119:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:752:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    operator: 'throws'
  }
```

**Determinism:** not flaky. Re-ran the isolated failing test twice more (`--test-name-pattern "EC-05"`): fail, fail. **3/3 deterministic failures.**

### Integration — `server/deps` — PASS (5/5)

All C-010 contract tests pass, including both legacy-default-path parity tests (REQ-10/AC-13) and the new `overrides` branch reusing the exact same db handle (REQ-06/AC-08), plus both "supplied together or not at all" validation branches.

### Integration — `cli` init/help — PASS (9/9)

`--help`/bare/unknown-command exit codes (AC-12), init stdout contract (AC-01), AC-04/EC-01/EC-02/EC-06 exit codes, missing-positional usage error. 9.2s.

### Integration — `cli` serve — 9 pass, 1 CANNOT EXECUTE

See §3 Blocker 2. With the non-executable test skipped, the remaining 9 pass cleanly on an idle host (321s): AC-05 exit 3, AC-06 exit 4, AC-09 exit 5, EC-04 `PORT_IN_USE`, BR-02/AC-11 flag>config precedence (both directions), BR-07 graceful SIGTERM exit 0 + BR-04/EC-08 dir-overrides-env, AC-08 real HTTP round-trip to seeded content, and the out-of-range/non-integer `--port` VALIDATION table.

### Named regression baseline (U-001-B2 gate) — PASS (19/19)

The five files ADR-PIPE-003's Migration Safety table names, all unmodified:
`database-migration-reconciliation-boot.integration.test.ts`, `boot-lifecycle-real-deps.integration.test.ts`, `settings-principal-check.test.ts`, `settings-register-definitions-op-validation.test.ts`, `newsletter-routes.test.ts` → `tests 19 / pass 19 / fail 0`, 33.7s. Matches the certification's own 19/19 baseline. **No regression from the `server/deps.ts` signature change.**

### INV-06 (architectural, T021)

`npx depcruise --config .dependency-cruiser.cjs src` → `35 dependency violations (0 errors, 35 warnings)`. Both SPEC-003 rules exist in `.dependency-cruiser.cjs` (`site-dir-no-server-express-or-cli-imports:35`, `cli-no-direct-drizzle-imports:42`).

Exactly **one** violation is attributable to a SPEC-003 rule, and it is test-only:

```
warn site-dir-no-server-express-or-cli-imports:
  src/site-dir/__tests__/unit/read-template.unit.test.ts → src/server/seed.ts
```

That import is the certified C-009 byte-parity assertion (REQ-02/AC-02) deliberately comparing `readTemplate('starter')` against the live `server/seed.ts` output. **Zero production-code violations** — INV-06's substantive intent holds. The other 34 warnings are pre-existing `core-no-server-or-app-imports` findings unrelated to this feature. Recommend the rule gain a `__tests__` exclusion or the exception be recorded, so this does not read as an INV-06 breach at Code Review.

---

## 3. Failure Clusters

### Blocker 1 — EC-05 locked-db test: **test fixture defect, NOT an implementation bug**

- **Test:** `boot-site-dir.integration.test.ts:185` (assert at `:200`)
- **Spec refs:** EC-05, RT-002 (Red-Team ADVISORY "present-but-corrupt-db → SITE_CORRUPT"), BR-05, C-008
- **Likely owner: TDD Agent** (fixture), not Programmer.

Root-caused empirically, not inferred. The fixture primes the exclusive lock with `SELECT 1`:

```js
const locker = new Database(dbPath);
locker.pragma("journal_mode = WAL");
locker.pragma("locking_mode = EXCLUSIVE");
locker.prepare("SELECT 1").get(); // triggers the exclusive lock to actually take effect
```

`SELECT 1` references no table, so SQLite never touches a database page and `locking_mode = EXCLUSIVE` never takes effect. The comment's claim is empirically false. Isolated probe of the three priming styles against a real db:

| Lock priming | 2nd connection read | 2nd connection write |
|---|---|---|
| `SELECT 1` (**what EC-05 does**) | SUCCEEDED — no lock in effect | SUCCEEDED — no lock in effect |
| real table read (`SELECT * FROM t`) | SUCCEEDED (WAL readers coexist) | blocked only by a UNIQUE constraint, not the lock |
| real write (`INSERT`) | **BLOCKED: database is locked** | **BLOCKED: database is locked** |

So no lock is ever held, `bootSiteDir` legitimately succeeds, and `assert.throws` reports "Missing expected exception."

**The implementation is correct.** Re-running EC-05's exact scenario with a correct lock prime (a real write) against the real `bootSiteDir`:

```
RESULT: bootSiteDir threw SiteCorruptError: bootSiteDir: content.db at …/content.db
        could not be opened: database is locked
VERDICT: FIXTURE-ONLY DEFECT — implementation satisfies EC-05.
```

**Impact:** EC-05/RT-002 currently has **zero real verification value** — it would pass against an implementation that ignored locking entirely. This is a false-negative-shaped hole in a Red-Team-mandated behavior, which is exactly what the certification protocol exists to prevent. Route to TDD to re-prime the lock with a real write and recertify that file.

### Blocker 2 — `serve-command` port-boundary test hangs indefinitely and blocks its entire file

- **Test:** `serve-command.integration.test.ts:125` — *"behavior.spec.md §4: --port at the exact boundary values 1 and 65535 is ACCEPTED…"*
- **Spec refs:** AC-11 (P2), behavior.spec.md §4 range check, C-002
- **Likely owner: TDD Agent** (test harness), not Programmer.

The test drives a **long-running server** through a **synchronous, unbounded** spawn:

```js
function runCliSync(args, env = {}) {
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI_MAIN, ...args],
    { encoding: "utf8", env: { ...process.env, ...env } });   // no `timeout` option
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
…
const resultForPortOne = runCliSync(["serve", dir, "--port", "1"]);
assert.notEqual(resultForPortOne.status, 2, "port 1 is IN the valid 1..65535 range …");
```

The test's own comment anticipates *"an EACCES-on-bind … however the implementation maps a privileged-port bind failure"* — i.e. it assumes `tovu serve --port 1` fails fast and returns. **On this host it does not fail: it binds successfully and serves.** Direct evidence from the stuck child:

```
$ lsof -p 53642 -a -i
COMMAND   PID USER   FD   TYPE  DEVICE  NODE NAME
node    53642   la   20u  IPv6  0xf2e…  TCP  *:tcpmux (LISTEN)      # tcpmux == port 1
$ ps -o pid,stat,etime -p 53642
53642 S 10:10
```

A correctly-working server that never exits + `spawnSync` with no timeout = the test blocks forever, taking the whole file with it.

Observed three times:
- Run A: file-level abort after **753s**, `pass 0 / fail 1`.
- Run B: file-level abort after **848s**, `pass 0 / fail 0 / cancelled 1` — the file produced *no* usable per-test results.
- Run C (same file, this hanging test skipped, idle host): **`tests 9 / pass 9 / fail 0`** in 321s.

Run C isolates the defect to that single test and clears the other nine.

Side observations from the same investigation (informational, not blockers):
- `tovu serve --port 1` when port 1 *is* already held reports `tovu: PORT_IN_USE: Port 1 is already in use.` for what is an `EACCES`-class privileged-port refusal on hosts that disallow it. The error mapping conflates EACCES with EADDRINUSE. The certified test only asserts `status !== 2`, so it does not catch this. Worth a Code Review look.
- The hung child leaks: it survives the runner and keeps holding port 1 (I found one orphan at `PPID=1` from an aborted run). Each aborted run leaves a squatter that poisons subsequent runs' `PORT_IN_USE` assertions.

**Recommended fix (TDD):** give `runCliSync` a `timeout`, or assert range-acceptance for port 1/65535 without booting a real long-running server (the out-of-range half of the range check already passes and needs no server).

### Blocker 3 — Both coverage hard gates fail on branches; integration coverage artifact is not fully obtainable

See §4. Unit branches 80.72% vs 98%; integration branches 81.76% vs 90%; `server/deps.ts` functions 78.79% vs 90%. Separately, the integration coverage artifact cannot be produced at all with the full certified file set (`init-site-fault-injection` zeroes it), so integration coverage is a **lower bound measured on a reduced file set** — reported as `UNAVAILABLE at full fidelity — escalated` per skills.md 3b, not as a pass.

### Not a failure cluster, but a certification-record discrepancy — flagged per dispatch instruction

The dispatch brief stated that `test-certification.md` *"documents 2 of the 66 tests as having disclosed, already root-caused environment-dependent fixture issues (not code bugs)."* **I could not find any such disclosure in that file, and what I observed differs.** Verified by full read plus targeted grep for `environment-dependent`, `fixture issue`, `env-dependent`, `macOS`, `hang`, `timeout`, `blocks` — no hits.

What the certification actually discloses is unrelated: the REQ-09 `--help` exit-code prose ambiguity; the BR-02/AC-11 "else 3000" tier not being live-bound; C-007 steps 5/6/7 isolation limits; INV-06 being architectural; and E2E being N/A. Both tests I found broken are recorded as clean:

- EC-05 → *"Certified"* with no caveat (certification lines 68 and 145).
- `serve-command.integration.test.ts` → all 10 tests listed as expected-runnable; C-002's only noted gap is the untested default-3000 tier.

So these are **fresh findings against a record that claims them green**, not known issues. Treating the brief's note as covering them would have masked both. Recommend correcting the record during recertification.

---

## 4. Coverage Report

### Active profile

Source: `tasks.md` → Constraints → Coverage Profile. Unit `98/98/98/98`, Integration `90/90/90/90` (both defaults, no override). E2E N/A with recorded reason.

### Tooling and artifact strategy

- Tool: Node built-in runner `--experimental-test-coverage`, lcov reporter (the `test:cov` convention named in `tasks.md`; no new tool introduced).
- `coverage/` and `.nyc_output/` purged before the run (skills.md 3a).
- Per-suite isolation, contrary to `tasks.md`'s "one shared lcov" note, because the two suites carry **different gates** (98 vs 90) and a merged report cannot be scored against either:
  - Unit → `coverage/unit/lcov.info`
  - Integration → `coverage/integration/lcov.info`
- Parser: custom lcov reader over `SF`/`LF`/`LH`/`FNF`/`FNH`/`BRF`/`BRH`/`DA` records (`scratchpad/parse-lcov.mjs`). Node's lcov reporter emits no separate statement counter, so **statements are reported as lines** — noted rather than silently equated.
- Scope: gates evaluated over **this feature's own source files**, not repo-wide. A repo-wide number would be dominated by unrelated in-flight features and would say nothing about SPEC-003.

#### Coverage-tooling defect found while collecting integration coverage

Including `src/site-dir/__tests__/integration/init-site-fault-injection.integration.test.ts` in a coverage run makes Node emit an **empty (0-byte) lcov file for the entire run** — all other files' coverage is lost with it. Isolated per-file bisection:

| Integration file included | lcov bytes produced |
|---|---:|
| `create-sqlite-route-deps-overrides` (alone) | 457,681 |
| `init-command` + `help-and-unknown-command` | 908,809 |
| `init-site` | 28,796 |
| `boot-site-dir` | 29,489 |
| `path-containment` | 32,652 |
| `portability-moved-dir` | 32,525 |
| **`init-site-fault-injection`** | **0** |
| all 9 integration files together | **0** |

Ruled out as causes: the failing EC-05 test (a 46/46 all-green run still produced 0 bytes) and the dual `spec`-to-stdout reporter (single-file control produced identical output with and without it).

The plausible mechanism is this file's real resource-exhaustion fault injection — an `ulimit`-constrained child plus deliberately read-only directories — colliding with V8's end-of-process coverage write. Worth confirming during recertification.

**Consequence:** the integration numbers below are measured with that one file excluded, so `init-site.ts`'s cleanup/rollback branches (INV-02 / U-003 / EC-10 / RT-003) are **under-counted** — those paths are exercised only by the excluded file. The integration figure is therefore a **lower bound**, and this suite cannot currently be certified at full fidelity by this toolchain. Reported as a tooling escalation, not as a coverage pass.

### Unit hard gate — **FAIL**

Scope: the four modules `tasks.md` assigns to the unit suite (C-004/C-005/C-006/C-009).

| Metric | Measured | Gate | Status |
|---|---:|---:|---|
| Lines | 98.03% (298/304) | 98% | PASS |
| Branches | **80.72% (67/83)** | 98% | **FAIL** |
| Functions | 100.00% (39/39) | 98% | PASS |
| Statements | 98.03% (298/304) | 98% | PASS |

Per-file:

| File | Module class | Lines | Branch | Funcs | Threshold | Status |
|---|---|---:|---:|---:|---:|---|
| `src/site-dir/read-site-dir.ts` | Core business logic | 93.02% | 79.31% | 100% | 98 | **Below** |
| `src/site-dir/read-template.ts` | Core business logic | 100% | 76.47% | 100% | 98 | **Below** (branch) |
| `src/site-dir/resolve-workspace.ts` | Core business logic | 100% | 85.71% | 100% | 98 | **Below** (branch) |
| `src/site-dir/schema-guard.ts` | Core business logic | 100% | 82.61% | 100% | 98 | **Below** (branch) |
| `src/site-dir/errors.ts` | Config/type-ish (error classes) | 90.32% | 92.00% | 83.33% | — | Integration-covered |

Widening scope to all of `src/site-dir/**` makes it worse, not better (lines 96.72%, branches 83.33%, functions 93.65%) — the gate fails under either scoping, so the choice of scope is not load-bearing for the verdict.

### Integration hard gate — **FAIL**

Scope: this feature's own source — `src/site-dir/**`, `src/cli/**`, and the changed `src/server/deps.ts`. Measured with `init-site-fault-injection.integration.test.ts` excluded (see tooling defect above), so these are lower bounds.

| Metric | Measured | Gate | Status |
|---|---:|---:|---|
| Lines | 97.06% (1685/1736) | 90% | PASS |
| Branches | **81.76% (269/329)** | 90% | **FAIL** |
| Functions | 94.92% (187/197) | 90% | PASS |
| Statements | 97.06% (1685/1736) | 90% | PASS |

Per-file:

| File | Module class | Lines | Branch | Funcs | Status |
|---|---|---:|---:|---:|---|
| `src/cli/main.ts` | API adapter | 100% | 100% | 100% | Above |
| `src/cli/program.ts` | API adapter | 100% | 85.71% | 100% | Below (branch) |
| `src/cli/commands/init.ts` | API adapter | 97.06% | 81.82% | 100% | Below (branch) |
| `src/cli/commands/serve.ts` | API adapter | 99.24% | 70.37% | 94.44% | **Below** (branch) |
| `src/cli/errors.ts` | API adapter | 96.83% | 84.21% | 100% | Below (branch) |
| `src/cli/help.ts` | View-ish (usage text) | 94.29% | 86.67% | 100% | Below (branch) |
| `src/server/deps.ts` | Orchestrator (composition root) | 98.56% | 95.00% | **78.79%** | **Below** (functions) |
| `src/site-dir/atomic-write.ts` | Infrastructure adapter | 100% | 80.00% | 100% | Below (branch) |
| `src/site-dir/boot-site-dir.ts` | Orchestrator | 99.07% | 78.26% | 100% | Below (branch) |
| `src/site-dir/init-site.ts` | Orchestrator | 90.66% | 84.85% | 100% | Below — **under-counted**, see note |
| `src/site-dir/read-site-dir.ts` | Core business logic | 89.53% | 64.00% | 100% | **Below** |
| `src/site-dir/read-template.ts` | Core business logic | 98.61% | 68.75% | 100% | Below (branch) |
| `src/site-dir/resolve-install-dir-target.ts` | Core business logic | 100% | 76.19% | 100% | Below (branch) |
| `src/site-dir/resolve-workspace.ts` | Core business logic | 96.30% | 80.00% | 100% | Below (branch) |
| `src/site-dir/schema-guard.ts` | Core business logic | 100% | 83.33% | 100% | Below (branch) |
| `src/site-dir/errors.ts` | Error classes | 91.94% | 92.59% | 91.67% | Above |

Notes:
- `init-site.ts` lines 85-99 are its cleanup/rollback path — exercised exclusively by the excluded fault-injection file. Its true figure is higher; do not read 90.66% as the real number.
- `server/deps.ts` functions at 78.79% is the weakest non-branch metric anywhere in the feature. It is the ~500-line brownfield composition root that Phase 1 edited (U-001), so it deserves a look at Code Review even though the *line* figure (98.56%) is strong: many of its registrar closures are never invoked by this feature's tests.

**Both suites fail on the same metric — branches, and only branches** (unit 80.72%, integration 81.76%; every other metric passes both gates comfortably). Two suites with entirely different scopes, tests, and thresholds landing within 1 pp of each other on branches, while passing lines/functions/statements, is a strong signal that the shortfall is at least partly an artifact of how Node's `--experimental-test-coverage` counts branch arms on TypeScript-lowered constructs rather than a genuine 18-point testing hole. That is a hypothesis supported by the data, not a waiver — see the routing options below.

### Coverage Gap List (priority order)

| Priority | Suite | File | Metric | Current | Target | Gap detail |
|---|---|---|---|---:|---:|---|
| High | Integration | `src/site-dir/read-site-dir.ts` | branches | 64.00% | 90% | Worst branch figure in the feature; 9 uncovered lines (18-19, 54-56, 59, 73-74, 80) on the size-guard / parse-failure / name-validation paths |
| High | Integration | `src/server/deps.ts` | functions | 78.79% | 90% | 21% of functions never invoked; uncovered 153-156, 276-278, 280. Brownfield composition root edited by U-001 — highest blast radius in the feature |
| High | Integration | `src/site-dir/read-template.ts` | branches | 68.75% | 90% | 98.61% lines but many untaken arms |
| High | Unit | `src/site-dir/read-site-dir.ts` | branches | 79.31% | 98% | Same file, unit view |
| High | Unit | `src/site-dir/read-template.ts` | branches | 76.47% | 98% | 100% lines, 4 untaken arms |
| High | Unit | `src/site-dir/schema-guard.ts` | branches | 82.61% | 98% | 100% lines, 4 untaken arms in index/tag comparison |
| High | Unit | `src/site-dir/resolve-workspace.ts` | branches | 85.71% | 98% | 100% lines, 1 untaken arm |
| Medium | Integration | `src/cli/commands/serve.ts` | branches | 70.37% | 90% | 99.24% lines; also 94.44% functions |
| Medium | Integration | `src/site-dir/boot-site-dir.ts` | branches | 78.26% | 90% | 99.07% lines, uncovered line 47 |
| Medium | Integration | `src/site-dir/resolve-install-dir-target.ts` | branches | 76.19% | 90% | 100% lines |
| Medium | Integration | `src/site-dir/atomic-write.ts` | branches | 80.00% | 90% | 100% lines |
| Medium | Integration | `src/site-dir/init-site.ts` | lines/branches | 90.66% / 84.85% | 90% | **Under-counted** — cleanup path (85-99) only covered by the excluded fault-injection file |
| Low | Integration | `src/cli/help.ts`, `errors.ts`, `program.ts`, `commands/init.ts` | branches | 84-87% | 90% | Usage/error-formatting arms |

### Uncovered-lines justification

Per `test-design/SKILL.md`, uncovered lines in changed/high-priority runtime code need a concrete technical justification, and "not enough time"/"too hard" do not qualify.

`read-site-dir.ts` lines 18-19, 54-56, 80 sit on genuinely reachable paths (oversize guard, JSON parse failure, `config.json.name` validation) — the certified unit suite *does* exercise each of those behaviors, so the residue is untaken branch arms rather than dead code.

**No valid justification is on record for the branch shortfall — additional tests or a documented, human-approved profile override are required.** Two legitimate routes, Coordinator's call:

1. **Route to TDD** to close the branch arms (the honest reading of the gates), or
2. **Record a human-approved coverage-profile override** in `tasks.md`. There is a real argument for this: Node's `--experimental-test-coverage` counts branch arms on TypeScript-lowered constructs (optional chaining, default parameters, narrowing), which systematically depresses branch percentages relative to istanbul/c8-style instrumentation. A 98% *branch* bar measured by this specific tool may be unreachable in practice for TS sources. That is a profile-calibration decision for the human owner, **not** something TestRunner may waive unilaterally — flagging it, not deciding it.

**Two gaps do not fit route 2 and need real tests regardless of how the branch bar is calibrated:**

- `src/server/deps.ts` **functions at 78.79%** (uncovered 153-156, 276-278, 280). Functions, not branches — no TS-lowering artifact explains an uninvoked function. This is the U-001 composition root with the feature's largest blast radius.
- `src/site-dir/read-site-dir.ts` **branches at 64.00%** — far below every other file in the feature and below both gates by a wide margin. Its 9 uncovered lines cluster on the corruption-guard paths (oversize, parse failure, name validation) that EC-03 and behavior.spec.md §4 specifically call out.

### Touched-file regression flag

`tasks.md` records no per-file coverage baseline for this feature, so no regression comparison is possible. Not reported as pass. The behavioural non-regression surface (U-001-B2's five named suites) is green at 19/19.

### Mutation quality

`Mutation: N/A — slot not declared.` No `mutation_tests` slot exists in this feature's computational controls.

### Performance

`Performance: N/A.` `tasks.md` Constraints → Performance records no latency/throughput budget (ADR-PIPE-003 scores scalability "structurally inapplicable"). No `## Constraints — Performance` section exists, so skills.md step 2a does not activate.

---

## 5. Environment Integrity Note (affects how to read Run A/B)

This verification did **not** run against a quiet, stable tree, and that materially affected the first attempts. Recording it so the audit trail is honest:

1. **Concurrent full-suite runs by other agents.** Two other `node --import tsx --test "src/**/*.test.ts"` processes (PIDs 44920, 45742) were executing in this same working directory throughout Runs A and B. They run `serve-command.integration.test.ts` too, so they competed for the same fixture ports.
2. **The source tree was edited mid-run.** Run A failed with `ReferenceError: rejectOversizedJsonBody is not defined` at `src/server/routes/admin/pages/update.ts:37`, crashing `createApp` and thus every `tovu serve` fixture. That file is **untracked** and was being written by the concurrent "body-size middleware" work; the import at line 11 that resolves it landed *after* my run started. `require('src/server/app.ts')` now loads cleanly, and Run C confirms the serve path works. **Run A's serve failures were tree-tearing artifacts and should not be read as SPEC-003 defects.**
3. **SPEC-003 ships entirely untracked.** `src/cli/`, `src/site-dir/`, and `templates/` are all `??` in `git status`; `src/server/deps.ts` is ` M`. Nothing about this feature is committed, so there is no stable revision to re-verify against.

Runs A and B are therefore reported as environment-contaminated and are **not** the basis for any pass/fail claim. Every result asserted in §2 came from a run on an idle host after the concurrent suites finished, except the site-dir integration and unit runs, which bind no ports and were independently reproduced.

**Recommendation:** re-run verification against a committed revision (or a dedicated worktree) once the tree is quiet, so the audit trail points at an immutable commit rather than a shifting working tree.

---

## 6. Convergence Assessment

- **Threshold:** 100% of P1 acceptance tests and invariants passing (source: `tasks.md` Constraints, default, no override).
- **P1 items:** AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-08, AC-09, AC-10, AC-13; INV-01…INV-06.

Every P1 AC and every invariant has at least one passing certified assertion:

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

**P1 convergence: 100% — met.** Both broken tests are non-P1 (EC-05 is an Edge Case; the port-boundary test serves P2 AC-11).

**However, convergence alone does not clear the gate.** Three independent blocking conditions from `skills.md` Escalation Rules are active:

| # | Blocker | Rule |
|---|---|---|
| 1 | A certified test fails deterministically (EC-05) | Test failure blocks advancement |
| 2 | Executed 65 < certified 66; one test cannot execute and aborts its whole file | "Empty suite / zero executed tests" + executed-count rule |
| 3 | Unit branches 80.72% vs 98%; integration branches 81.76% vs 90%; `deps.ts` functions 78.79% vs 90% | "Any hard gate metric fails — block advancement" |
| 4 | Integration coverage artifact unobtainable with the full certified file set | "Coverage tool fails to produce output — escalate" |

**Overall pass rate:** 64/66 certified = 96.97%; 64/65 executed = 98.46%.

---

## 7. Coordinator Classification Summary

| Finding | Classification | Suggested route |
|---|---|---|
| EC-05 lock-priming fixture defect | `TDD_RECERTIFICATION_REQUIRED` | TDD — re-prime with a real write; implementation verified correct, do **not** send to Programmer |
| `serve-command` port-boundary test hangs, blocking its file | `TDD_RECERTIFICATION_REQUIRED` | TDD — bound `runCliSync` with a timeout or drop the long-running server from a range assertion |
| Unit branches 80.72% < 98%; integration branches 81.76% < 90% | `COVERAGE_TRIAGE_REQUIRED` | Coordinator — either route to TDD for branch arms, or obtain a human-approved profile override for TS-lowered branch counting |
| `server/deps.ts` functions 78.79% < 90% | `COVERAGE_TRIAGE_REQUIRED` | TDD/Coordinator — genuine gap on the U-001 composition root, not a tooling artifact |
| `init-site-fault-injection` zeroes the lcov artifact for its whole run | Tooling escalation | Coordinator/TDD — integration coverage cannot be certified at full fidelity until resolved |
| `EACCES` privileged-port refusal surfaced as `PORT_IN_USE` | Advisory (implementation) | Code Review — error-mapping correctness |
| INV-06 depcruise warning on the C-009 parity test | Advisory (architectural) | Code Review / Architect — add `__tests__` exclusion or record the exception |
| Certification record claims EC-05 and all 10 serve tests green | Record correction | TDD — fix the record during recertification |
| Untracked feature + concurrent agents editing the tree mid-run | Process | Coordinator — re-verify against a committed revision / isolated worktree |

**Flaky tests:** none. EC-05 is deterministic (3/3). The serve-command hang is deterministic and structural, not non-deterministic. No known-flaky registry exists at `ADS-memory/knowledge/known-flaky-tests.md`, and none was needed.

**Guardrails observed:** no test file and no source file was modified. All diagnosis was performed with read-only inspection plus throwaway probes under the session scratchpad. Test selection flags (`--test-name-pattern`, `--test-skip-pattern`) were used to isolate and to recover results around the blocking test; the files themselves are byte-identical to the certified hashes (re-verifiable with the §1 command).

---

## 8. Verdict

**NOT ready for Code Review dispatch.**

The feature is in good functional shape — 64 of 66 certified tests pass, all P1 acceptance criteria and all six invariants are satisfied, the U-001-B2 regression gate is green at 19/19, and the two broken items are **both test-side defects rather than implementation bugs** (EC-05's implementation behaviour was independently proven correct). But three hard gates from `skills.md` are open: a deterministically failing certified test, an executed count below the certified count caused by a test that cannot terminate, and a unit branch-coverage gate at 80.72% against a 98% bar.

Minimum to clear the gate:
1. TDD recertifies `boot-site-dir.integration.test.ts` with a lock prime that actually acquires the lock (a real write, not `SELECT 1`).
2. TDD recertifies `serve-command.integration.test.ts` so the port-boundary assertion terminates (bound `runCliSync`, or assert range acceptance without booting a long-running server).
3. Resolve why `init-site-fault-injection.integration.test.ts` zeroes the coverage artifact, so integration coverage can be measured on the full certified file set.
4. Coordinator resolves the coverage gates — additional tests for the genuine gaps (`read-site-dir.ts` branches, `server/deps.ts` functions), and a decision on whether the branch bar is achievable under Node's experimental TS branch counting or needs a human-approved override in `tasks.md`.
5. A clean full re-run on a quiet host against a committed revision, reaching 66/66 executed.

Steps 1 and 2 are small, well-localised test edits whose root causes are already identified and independently verified here. Step 4 is the only one needing a human decision.
