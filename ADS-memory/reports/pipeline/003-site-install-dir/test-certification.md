# Test Certification Record

- Test Suite: site-install-dir (SPEC-003)
- Spec ID: SPEC-003
- Spec Version: 1.0.0
- Spec Hash: sha256:c2547dc39b9e12bc7fb199d3c32e472804a3fea9690014a8000f421db1846142
- Spec Hash Verification: `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/003-site-install-dir --phase spec --print-hash` → `Feature hash computed: sha256:c2547dc39b9e12bc7fb199d3c32e472804a3fea9690014a8000f421db1846142` / `PASS: strict Speckit package passed mechanical validation.` — matches `pipeline-state.md`'s recorded `spec_hash` exactly. Deterministic provider-local validator used, not a visual/eyeball comparison.
- ADR: `ADS-memory/reports/pipeline/003-site-install-dir/adr.md` (ADR-PIPE-003 v1.1.0)
- Tasks: `ADS-memory/reports/pipeline/003-site-install-dir/tasks.md` (generated this dispatch, as a delegated Coordinator action, per dispatch instructions)
- Certified At: 2026-07-28T00:00:00Z
- Certified By: TDD Agent (persona `AI-Dev-Shop/agents/tdd/skills.md` loaded this session)
- **Recertified At: 2026-07-28T17:40:00Z** — TDD Agent, in response to `ADS-memory/reports/test-runs/TESTRUN-003-site-install-dir-2026-07-28-1605.md`. Spec hash unchanged (SPEC-003 v1.0.0, `sha256:c2547d…46142`), so this is a test-side recertification, not a spec-driven one. Four files changed — see the Recertification Log immediately below.

### Recertification Log (2026-07-28, post-TestRunner)

TestRunner found that two entries this record previously certified as clean were in fact defective, and a third file was silently destroying the integration coverage artifact. **All three were test-side defects; the production implementation was independently proven correct and no non-test source file was changed.** Corrected here rather than left standing:

| Item | What this record previously claimed | What was actually true | Fix applied |
|---|---|---|---|
| EC-05 (`boot-site-dir.integration.test.ts`) | "Certified", no caveat | **False negative.** The fixture primed the exclusive lock with `locker.prepare("SELECT 1").get()`. `SELECT 1` references no table, so SQLite never touches a database page and `locking_mode = EXCLUSIVE` never engaged. No lock was ever held, `bootSiteDir` legitimately succeeded, and `assert.throws` reported "Missing expected exception". The test had **zero verification value** — it would have passed against an implementation that ignored locking entirely. | Lock priming replaced with `UPDATE workspaces SET name = name` — a genuine page write, so the exclusive lock is really acquired, while leaving the fixture's exactly-one workspace row byte-identical (so a failure to lock surfaces as `bootSiteDir` succeeding, not as an unrelated multiple-rows `SiteCorruptError` passing for the wrong reason). Assertion additionally **strengthened**: the thrown `SiteCorruptError`'s message must now match `/lock/i`, which the test's own name always claimed but never checked. Verified: 8/8 pass; EC-05's runtime went 185 ms → 5,169 ms, the signature of the real SQLite busy-retry path now actually being exercised. |
| AC-11 port boundary (`serve-command.integration.test.ts`) | All 10 tests listed as expected-runnable; C-002's only noted gap was the untested default-3000 tier | **Could not execute at all, and aborted its entire file.** The test called `runCliSync` (a `spawnSync` with no `timeout`) against `tovu serve --port 1`, assuming a fast EACCES-class failure. On this host that bind *succeeds* and the server runs forever, so the synchronous spawn never returned. Observed file-level aborts at 753 s and 848 s, the second producing no per-test results at all. It also leaked an orphaned child holding port 1 at `PPID=1`, poisoning later runs' `PORT_IN_USE` assertions. | Restructured so the assertion never depends on booting a long-running server: the test now holds each boundary port (1 and 65535) from the test process first, so the child fails fast with `PORT_IN_USE` — which is a **stronger** proof than the old `status !== 2`, since reaching a bind at all means the value already cleared the 1..65535 range check. Where the OS refuses the test process the port, it refuses the child's identical bind just as fast. `runCliSync` also gained an optional `timeoutMs` (used only here) as a hard safety net so a hang is structurally impossible. Also: the old test never actually exercised 65535 — it substituted a random ephemeral port — so the named boundary is now genuinely covered for the first time. Orphan from the prior aborted run (PID 70583) was terminated; the new form leaves none, verified by `lsof -nP -iTCP:1` after the run. Verified: 10/10 pass, whole file 34 s (was 753-848 s aborting). |

| Integration coverage artifact (`init-site-fault-injection.integration.test.ts`) | Listed as 4 expected-runnable tests, no caveat | **Silently destroyed the coverage artifact for the entire integration run.** Including this file made Node emit a 0-byte lcov for *all* 9 integration files, so integration coverage could not be measured at full fidelity at all — TestRunner had to exclude the file and report lower bounds. | Root-caused, not worked around. Under `--experimental-test-coverage` the runner exports `NODE_V8_COVERAGE=<tmpdir>` and aggregates every `coverage-*.json` written there. This file's two workers run under `ulimit -f 400` (a 409,600-byte per-file cap on macOS) and inherit that variable, so at exit each dumps a V8 profile into the shared directory — truncated at **exactly 409,600 bytes** and therefore unparseable. One malformed file makes the runner emit an empty lcov for the whole run. Proven directly by pointing `NODE_V8_COVERAGE` at an inspectable directory: 3 valid profiles plus **2 malformed files of exactly 409,600 bytes**, both written by the worker PID. Fix: redirect the workers' `NODE_V8_COVERAGE` into the test's own temp dir. Note that *deleting* the variable does **not** work — Node re-injects it into descendant processes from its own coverage state (verified: the worker still saw the runner's path after `delete env.NODE_V8_COVERAGE`), which is why the fix redirects rather than unsets. The existing `fs.rmSync(parent, …)` already removes the redirect dir, so no new cleanup path was added. Verified: file alone 4/4 pass with lcov 0 → 26,676 bytes; **full 9-file integration set 48/48 pass with lcov 0 → 975,006 bytes**. |

Assertion strength was verified by mutation, not assumed: temporarily narrowing `parsePort`'s range check in `src/cli/commands/serve.ts` to `value < 2 || value > 65534` makes the boundary test **fail** with `--port 1 is IN the valid 1..65535 range and must not be rejected as VALIDATION`. The mutation was reverted immediately; `serve.ts` is unchanged from its pre-recertification bytes.

## Test File Inventory

| Test File | Type | Spec Refs | sha256 | Expected Test Count | Red Evidence |
|---|---|---|---:|---:|---|
| `src/site-dir/__tests__/unit/resolve-workspace.unit.test.ts` | unit | REQ-06, state.spec.md §5, C-005, U-001 | sha256:5249a51bc5ce6e0a2b0cce381565df7aebf74e007f49c893a57577dd9f4d2eec | 3 | `node --import tsx --test` → `Cannot find module '../../resolve-workspace'` (MODULE_NOT_FOUND) |
| `src/site-dir/__tests__/unit/schema-guard.unit.test.ts` | unit | REQ-05, RT-005, INV-04, INV-05, C-006, U-002-B1 | sha256:a6fdf02227a2dbf065542929787fb987542683984acdf7f5e713c2238358a631 | 5 | MODULE_NOT_FOUND: `../../schema-guard` |
| `src/site-dir/__tests__/unit/read-site-dir.unit.test.ts` | unit | REQ-04, EC-03, state.spec.md §2/§5, behavior.spec.md §4, C-004 | sha256:555d1b8d3860f9e50e386dec16d676b84dd38ba66ad424d6595ab9a4d491c9b5 | 12 | MODULE_NOT_FOUND: `../../read-site-dir` (original 7); **recertified 2026-07-28 — +5 branch-closing tests, see Coverage Gate section** |
| `src/site-dir/__tests__/unit/read-template.unit.test.ts` | unit | REQ-02, AC-02, state.spec.md §2, BR-01 step 3, C-009 | sha256:e091ff7270a39affa35cc513d6763259983881b7755c2ebddbd2846faa7f623c | 3 | MODULE_NOT_FOUND: `../../read-template` |

**Record fix (2026-07-28T17:40:00Z):** the four digests above were recomputed after a comment-only edit landed on all four unit test files post-certification — the Coordinator (not a TDD agent, correcting `TESTRUN-003-site-install-dir-2026-07-28-1712.md`'s inference) added a "Coverage tooling note" JSDoc paragraph to each file's `@file` header documenting the branch-coverage-instrument artifact described in this document's own Coverage Gates section, so a future reader (human or LLM) doesn't mistake the transpiler-injected-code gap for missing tests. Verified behavior-neutral three ways per TESTRUN-...-1712.md §1.2: unchanged test counts (23/23), unchanged coverage counters (lines 301/304, branches 72/86, functions 39/39), and a clean 23/23 re-run against the new bytes.
| `src/site-dir/__tests__/integration/init-site.integration.test.ts` | integration | REQ-01, REQ-02, REQ-03, BR-01, BR-03, INV-03, AC-01, AC-02, AC-04, AC-14, EC-01, EC-02, EC-06, C-007 | sha256:c161e8a6f92212dcaba3203e668bb0ec84f9c670ec2063964d6c5ce80eaf1966 | 8 | MODULE_NOT_FOUND: `../../init-site` |
| `src/site-dir/__tests__/integration/init-site-fault-injection.integration.test.ts` | integration | INV-02, AC-03, EC-10, RT-003, U-003-B1/B2/B3/ORD1 | sha256:3703f9aa0852bcb621c3ad9d495ab59c53a333550e5ede3cea595edb7a1492bd | 4 | MODULE_NOT_FOUND: `../../init-site`; **recertified 2026-07-28 — worker V8-coverage redirect, count unchanged, see Recertification Log** |
| `src/site-dir/__tests__/integration/boot-site-dir.integration.test.ts` | integration | REQ-05, REQ-06, BR-05, BR-06, INV-04, INV-05, RT-005, AC-06, AC-07, AC-08, AC-09, EC-05, EC-07, EC-09, C-008, U-002-B1/B2/B3/ORD1/ORD2 | sha256:5ef53beae936d86f00d55a61f3630836b7195147d722f09a2dd888b72fb6f1d5 | 8 | MODULE_NOT_FOUND: `../../boot-site-dir`; **recertified 2026-07-28 — EC-05 lock-priming fixture defect fixed, count unchanged, see Recertification Log** |
| `src/site-dir/__tests__/integration/path-containment.integration.test.ts` | integration | INV-01, U-004-B1 | sha256:9304347cebdfda7216e8d16a7171e9f75b8d35fc8cd529c46cdd513300058961 | 3 | MODULE_NOT_FOUND: `../../init-site` |
| `src/site-dir/__tests__/integration/portability-moved-dir.integration.test.ts` | integration | REQ-08, AC-10, state.spec.md §6 | sha256:67bb0f84a66abb6e2e83b01a1ca5d1bcd22544d561b1a8a0a89ba77380e6a17e | 1 | MODULE_NOT_FOUND: `../../init-site` |
| `src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts` | integration | REQ-06, REQ-10, AC-08, AC-09, AC-13, C-010, U-001-B2 | sha256:2e45d5138b29ff8233bdcae002df2708d5a14be407234ffa061e3e6503c790ac | 5 | 2/5 pass today (legacy path already matches old behavior); 3/5 fail (`overrides` param not yet implemented — old 1-arg signature) |
| `src/cli/__tests__/integration/init-command.integration.test.ts` | integration | REQ-03, REQ-09, BR-01, BR-03, AC-01, AC-04, EC-01, EC-02, EC-06, C-001 | sha256:c33b2aa4a0e508ce32115cedc835dc5547f7b0f8b7b2ec702ad6377baa4f8750 | 6 | spawn of nonexistent `src/cli/main.ts` → nonzero status, all assertions fail |
| `src/cli/__tests__/integration/help-and-unknown-command.integration.test.ts` | integration | REQ-09, AC-12, C-003 | sha256:65fabcb808b166821ba2e458bcdb3cccfcf1aefa13b7af853627c107c5699ca8 | 3 | spawn of nonexistent `src/cli/main.ts` → all assertions fail |
| `src/cli/__tests__/integration/serve-command.integration.test.ts` | integration | REQ-04, REQ-05, REQ-06, REQ-07, BR-02, BR-04, BR-05, BR-06, BR-07, AC-05, AC-06, AC-08, AC-09, AC-11, EC-04, EC-08, C-002 | sha256:587dccba0ecf4960c90e4a2b71c338bdd066848cefe9c13ed816f3df1d4fce76 | 10 | fixture setup (`tovu init`) fails first — nonexistent CLI, all assertions fail; **recertified 2026-07-28 — AC-11 port-boundary test no longer boots a long-running server, count unchanged, see Recertification Log** |

**Total expected runnable tests: 71** (across 13 new files) — originally 66; +5 from the read-site-dir branch-closing tests added during the 2026-07-28 recertification. All 13 files were run under this repo's actual harness (`node --import tsx --test`) during certification, not merely eyeballed:
- The 11 files with zero current runnable dependency (`resolve-workspace`, `schema-guard`, `read-site-dir`, `read-template`, `init-site`, `init-site-fault-injection`, `boot-site-dir`, `path-containment`, `portability-moved-dir`, both CLI command files, `serve-command`) fail at module resolution or first fixture step, exactly as expected pre-implementation.
- `create-sqlite-route-deps-overrides.integration.test.ts` partially passes TODAY (2/5) because two of its tests assert the **unchanged legacy default path**, which already behaves correctly against the current, unmodified `server/deps.ts` — this is intentional and correct: those two tests double as an immediate, live regression baseline, not a false pass.
- Full harness run logs are reproducible via the commands in each file's "Red Evidence" cell; representative transcripts were captured during this certification session.

No existing test file was modified. Full regression sanity check run this session (all pass, 19/19): `database-migration-reconciliation-boot.integration.test.ts`, `boot-lifecycle-real-deps.integration.test.ts`, `settings-principal-check.test.ts`, `settings-register-definitions-op-validation.test.ts`, `newsletter-routes.test.ts` — the five files ADR-PIPE-003's Migration Safety table names as the U-001-B2 regression gate.

---

## Covered Requirements

| Spec Ref | Priority | Test File | Test Name (abbreviated) | Type | Assertion Summary | Status |
|---|---|---|---|---|---|---|
| REQ-01 / AC-01 | P1 | `init-site.integration.test.ts` | "AC-01/AC-14/REQ-01: a clean init produces exactly the required layout…" | Acceptance | Exact 7-entry layout; config.json.name; .site-meta.json's templateId/siteId/schemaVersion/schemaTag/createdAt all correct | Certified |
| AC-14 / REQ-01 | P2 | `init-site.integration.test.ts` | same test | Acceptance | uploads/themes/plugins/overrides exist, empty; nothing created outside target | Certified |
| REQ-02 / AC-02 | P1 | `read-template.unit.test.ts` | "readTemplate('starter').seed is byte-equivalent to server/seed.ts's current live output" | Acceptance | Full deep-equality of workspace/posts/presentation vs. live `server/seed.ts` exports | Certified |
| REQ-03 / AC-03 | P1 | `init-site-fault-injection.integration.test.ts` | "a file-size-limited child process fails partway through db creation/seeding…" | Acceptance | Real fs-resource failure after config.json succeeds → full cleanup, target absent, no marker | Certified |
| REQ-03 / AC-04 | P1 | `init-site.integration.test.ts`, `init-command.integration.test.ts` | "an existing NON-EMPTY directory -> InitDirNotEmptyError…" (both layers) | Acceptance | Directory untouched, `InitDirNotEmptyError` / exit 3 `INIT_DIR_NOT_EMPTY` | Certified |
| REQ-04 / AC-05 | P1 | `serve-command.integration.test.ts` | "AC-05: serve against a dir missing .site-meta.json…" | Acceptance | Exit 3, `tovu: SITE_DIR_INVALID:` stderr line | Certified |
| REQ-05 / AC-06 | P1 | `schema-guard.unit.test.ts`, `boot-site-dir.integration.test.ts`, `serve-command.integration.test.ts` | newer / divergent-tag scenarios at all three layers | Acceptance | `SiteNewerThanRuntimeError` thrown; content.db untouched (mtime/size); CLI exit 4 | Certified |
| REQ-05 / AC-07 | P2 | `boot-site-dir.integration.test.ts` | "an older schemaVersion migrates forward… round-trip" | Acceptance | Both schemaVersion+schemaTag bumped together; re-serve passes cleanly (INV-05) | Certified |
| REQ-06 / AC-08 | P1 | `boot-site-dir.integration.test.ts`, `create-sqlite-route-deps-overrides…`, `serve-command.integration.test.ts` | workspace-id resolution + CLI-reachability | Acceptance | Resolved workspaceId equals db's one row; override path honored; real HTTP request reaches seeded content | Certified |
| REQ-06 / AC-09 | P1 | `resolve-workspace.unit.test.ts`, `boot-site-dir.integration.test.ts`, `serve-command.integration.test.ts` | zero/multiple workspace rows | Acceptance | `SiteCorruptError` / CLI exit 5 `SITE_CORRUPT` | Certified |
| REQ-07 / AC-11 | P2 | `serve-command.integration.test.ts` | port precedence flag > config > boundary-value range table | Acceptance | `--port` beats `config.json.port`; range 1..65535 inclusive, boundary + out-of-range table | **Recertified 2026-07-28** — the boundary half previously could not execute at all and aborted its whole file; it also never actually exercised 65535. Both boundary values now genuinely covered; see Recertification Log |
| REQ-08 / AC-10 | P1 | `portability-moved-dir.integration.test.ts` | full move round-trip | Acceptance | workspaceId/config/content identical after move; no old absolute path persisted | Certified |
| REQ-09 / AC-12 | P2 | `help-and-unknown-command.integration.test.ts` | `--help` / bare / unknown command | Acceptance | Exit 0 for help/bare, exit 2 + usage for unknown command | Certified (see disclosed REQ-09-prose ambiguity below) |
| REQ-10 / AC-13 | P1 | `create-sqlite-route-deps-overrides.integration.test.ts` | legacy default path (both dbPath-given and fully-argument-less) | Acceptance | `workspaceId === "workspace-local"`, unchanged | Certified (2/5 pass today, live baseline) |
| INV-01 | — | `path-containment.integration.test.ts` | embedded `..`, symlink-at-target (init + serve) | Invariant | Every write lands under the resolved real target; nothing spills beside a symlink or an unresolved intermediate segment | Certified |
| INV-02 | — | `init-site-fault-injection.integration.test.ts` | all 4 fault-injection tests | Invariant | No commit marker after any mid-flight failure; full/best-effort cleanup | Certified |
| INV-03 | — | `init-site.integration.test.ts` | "init never mutates templates/starter/…" | Invariant | template.json content + mtime byte-identical before/after a real init run | Certified |
| INV-04 | — | `schema-guard.unit.test.ts`, `boot-site-dir.integration.test.ts` | divergent-tag + torn-stamp fault injection | Invariant | Equal-index-divergent-tag treated as newer; stamp never partially bumped | Certified |
| INV-05 | — | `boot-site-dir.integration.test.ts` | round-trip re-serve | Invariant | A second serve of the now-current site passes the guard cleanly | Certified |
| INV-06 | — | — | — | Architectural | Not a TDD assertion — `implementation-outline.md`'s own Test Expectation for INV-06 is "Architectural: site-dir has zero imports from cli/\*\* (Enforcement rule)", i.e. a `.dependency-cruiser.cjs` rule (tasks.md T021), not a Node test | N/A (by design) |
| EC-01 | — | `init-site.integration.test.ts`, `init-command.integration.test.ts` | pre-existing empty dir allowed; non-empty rejected | Edge Case | Both branches of EC-01 | Certified |
| EC-02 | — | `init-site.integration.test.ts`, `init-command.integration.test.ts` | file-at-target | Edge Case | `InitDirNotEmptyError` / exit 3, file untouched | Certified |
| EC-03 | — | `read-site-dir.unit.test.ts` | corrupt config.json | Edge Case | `SiteDirInvalidError` naming config.json + parse failure | Certified |
| EC-04 | — | `serve-command.integration.test.ts` | port already bound | Edge Case | Exit 1 `PORT_IN_USE`, port number in stderr | Certified |
| EC-05 | — | `boot-site-dir.integration.test.ts` | real `locking_mode=EXCLUSIVE` second connection, primed with a genuine page write | Edge Case | `SiteCorruptError` whose message names the lock (`/lock/i`) | **Recertified 2026-07-28** — previously certified clean but was a false negative (fixture never acquired the lock); see Recertification Log |
| EC-06 | — | `init-site.integration.test.ts`, `init-command.integration.test.ts` | empty/whitespace `--name` | Edge Case | `ValidationError` / exit 2, nothing created | Certified |
| EC-07 | — | `boot-site-dir.integration.test.ts` | unknown templateId | Edge Case | Serve still succeeds; `console.warn` called naming the id | Certified |
| EC-08 | — | `serve-command.integration.test.ts` | dir arg + `TOVU_CONTENT_DB` both present | Edge Case | Dir wins (real content served); stderr warning names `TOVU_CONTENT_DB` | Certified |
| EC-09 | — | `boot-site-dir.integration.test.ts` (U-002-B2/ORD1 retry half) | crash-mid-migration-class retry | Edge Case | A blocked stamp-write attempt leaves the OLD stamp intact; a clean retry re-applies migrate() idempotently and bumps both fields | Certified |
| EC-10 / RT-003 | — | `init-site-fault-injection.integration.test.ts` | 2 permission tests + 1 deep ulimit test + 1 cleanup-failure test | Edge Case | Full cleanup after early failure; full cleanup after a deep real-resource failure; cleanup-failure names the partial dir | Certified |
| BR-01 | — | `init-site.integration.test.ts`, `init-site-fault-injection.integration.test.ts` | ordering + cleanup | Behavior Rule | Commit marker last; full cleanup on any failure | Certified |
| BR-02 | — | `serve-command.integration.test.ts` | flag > config > (env/default untested tier, disclosed) | Behavior Rule | Precedence mechanism proven for the two controllable tiers + range boundary table | Certified (partial — see Known Gaps) |
| BR-03 | — | `init-site.integration.test.ts`, `init-command.integration.test.ts` | default name = basename | Behavior Rule | `config.json.name` equals dir basename when `--name` omitted | Certified |
| BR-04 | — | `serve-command.integration.test.ts` | dir overrides env | Behavior Rule | Same test as EC-08 | Certified |
| BR-05 | — | `boot-site-dir.integration.test.ts`, `serve-command.integration.test.ts` | validation chain order (first-failure-wins) | Behavior Rule | Each named failure class (missing meta, newer schema, zero workspace, locked db) independently reachable and correctly classified | Certified |
| BR-06 | — | `boot-site-dir.integration.test.ts` | stamp-bump-after-migrate | Behavior Rule | Both fields bumped only after a successful migrate(); never torn | Certified |
| BR-07 | — | `serve-command.integration.test.ts` | SIGTERM | Behavior Rule | Graceful stop, exit 0 | Certified |
| TB-01 | — | — | — | N/A | behavior.spec.md itself records this as "not applicable — no collection ordering exists" | N/A (spec-recorded) |
| errors: `VALIDATION` | — | `init-command`, `serve-command`, `init-site` (site-dir layer) | multiple | Error Code | Exit 2, `tovu: VALIDATION:` line | Certified |
| errors: `INIT_DIR_NOT_EMPTY` | — | `init-command`, `init-site` | multiple | Error Code | Exit 3, `tovu: INIT_DIR_NOT_EMPTY:` line | Certified |
| errors: `SITE_DIR_INVALID` | — | `read-site-dir.unit.test.ts`, `serve-command` | multiple | Error Code | Exit 3, `tovu: SITE_DIR_INVALID:` line | Certified |
| errors: `SITE_NEWER_THAN_RUNTIME` | — | `schema-guard`, `boot-site-dir`, `serve-command` | multiple | Error Code | Exit 4 | Certified |
| errors: `SITE_CORRUPT` | — | `resolve-workspace`, `boot-site-dir`, `serve-command` | multiple | Error Code | Exit 5 | Certified |
| errors: `PORT_IN_USE` | — | `serve-command` | EC-04 test | Error Code | Exit 1, port number named | Certified |
| errors: `INTERNAL` | — | `init-site-fault-injection`, `read-template` (unknown templateId) | multiple | Error Code | Exit 1 (CLI layer) / `InternalError` (site-dir layer) | Certified |

**Disclosed spec-internal inconsistency (not silently resolved):** `feature.spec.md` REQ-09's prose — "`tovu --help` and unknown commands exit 2 with usage" — read literally would put `--help` at exit 2. `api.spec.md` §6's Status Code Map and `errors.spec.md` both structure `CLI_HELP` as two distinct outcomes ("0 = help printed" vs. "2 = unknown command"), and AC-12 (the only AC that pins an exit code here) tests exclusively the unknown-command case at exit 2. This suite certifies against the structured, machine-checked artifacts (api.spec.md/errors.spec.md/AC-12) — `--help`/bare `tovu` at exit 0, unknown commands at exit 2 — and flags REQ-09's one-sentence ambiguity for a Spec Agent clarification pass. Not a `[NEEDS CLARIFICATION]`-level blocker (the tested artifacts are internally consistent and give an unambiguous target), but worth a spec-text fix.

---

## Outcome Matrix

### `site-dir/resolve-workspace.ts` (C-005)

| State | Input | Expected Outcome | Spec Ref |
|---|---|---|---|
| db has 0 workspace rows | `{db}` | throws `SiteCorruptError` naming "zero rows" | REQ-06, AC-09 |
| db has exactly 1 workspace row | `{db}` | returns that row's `WorkspaceRecord` verbatim | REQ-06, AC-08 |
| db has 2+ workspace rows | `{db}` | throws `SiteCorruptError` naming "multiple rows" | state.spec.md §5 |

### `site-dir/schema-guard.ts` (C-006)

| State | Input | Expected Outcome | Spec Ref |
|---|---|---|---|
| site.schemaVersion < runtime.index | `{schemaVersion, schemaTag}` (any tag) | returns `"migrate"` | REQ-05(c) |
| site.schemaVersion === runtime.index, schemaTag matches | same | returns `"compatible"` | REQ-05(c) |
| site.schemaVersion === runtime.index, schemaTag diverges | same | throws `SiteNewerThanRuntimeError` | REQ-05(b), RT-005 |
| site.schemaVersion > runtime.index | same | throws `SiteNewerThanRuntimeError` | REQ-05(a) |

### `site-dir/read-site-dir.ts` (C-004)

| State | Input | Expected Outcome | Spec Ref |
|---|---|---|---|
| config.json absent | `{dir}` | throws `SiteDirInvalidError` naming config.json | REQ-04 |
| .site-meta.json absent | `{dir}` | throws `SiteDirInvalidError` naming .site-meta.json | AC-05 |
| config.json present but not a regular file (a directory) | `{dir}` | throws `SiteDirInvalidError` naming config.json | REQ-04 |
| config.json unparseable | `{dir}` | throws `SiteDirInvalidError` naming the parse failure | EC-03 |
| .site-meta.json unparseable | `{dir}` | throws `SiteDirInvalidError` naming .site-meta.json | EC-03 |
| config.json.name empty/whitespace | `{dir}` | throws `SiteDirInvalidError` | state.spec.md §2 |
| config.json.name absent, or present but not a string | `{dir}` | throws `SiteDirInvalidError` | state.spec.md §2 |
| config.json.name > 200 chars after trim | `{dir}` | throws `SiteDirInvalidError` | state.spec.md §2 |
| either file > 64 KiB | `{dir}` | throws `SiteDirInvalidError` | behavior.spec.md §4 |
| config.json carries real domain/port values | `{dir}` | returns them verbatim (not nulled out); name returned trimmed | state.spec.md §2, BR-02 |
| both files present, valid, in-size | `{dir}` | returns `{config, meta}` content-equal to disk | REQ-04 |

The last five rows were added during the 2026-07-28 recertification to close `read-site-dir.ts`'s two genuinely-untaken source branch arms (`!stat.isFile()` and `name.length > 200`) and to pin the optional-field pass-through the `?? null` defaults could otherwise silently swallow.

### `site-dir/init-site.ts` (C-007)

| State | Input | Expected Outcome | Spec Ref |
|---|---|---|---|
| target absent | `{dir, name?}` | creates full REQ-01 layout; `.site-meta.json` last; returns `{siteId, dir}` | AC-01, BR-01 |
| target exists, empty | `{dir, name?}` | proceeds using it, same as absent | EC-01 |
| target exists, non-empty (dir or file) | `{dir, name?}` | throws `InitDirNotEmptyError`, untouched | AC-04, EC-01, EC-02 |
| `name` empty/whitespace or > 200 chars | `{dir, name}` | throws `ValidationError`, nothing created | EC-06, behavior.spec.md §4 |
| any failure in steps 2-7 | `{dir, name?}` | full best-effort cleanup, no `.site-meta.json` ever | INV-02, AC-03 |
| cleanup's own removal step fails | `{dir, name?}` | thrown error names the partial dir's path | EC-10, RT-003 |
| `dir` contains `..` / is a symlink | `{dir, name?}` | every write lands under the resolved real target only | INV-01 |

### `site-dir/boot-site-dir.ts` (C-008)

| State | Input | Expected Outcome | Spec Ref |
|---|---|---|---|
| dir/config/meta invalid | `{dir}` | throws `SiteDirInvalidError` | BR-05 steps 1-2 |
| schema newer/divergent | `{dir}` | throws `SiteNewerThanRuntimeError`; content.db untouched | AC-06 |
| schema older | `{dir}` | migrates; both stamp fields bumped together; returns `{db, workspaceId, config}` | AC-07, BR-06 |
| schema equal+matching, re-serve | `{dir}` | passes cleanly, no throw | INV-05, AC-07 |
| 0 or 2+ workspace rows | `{dir}` | throws `SiteCorruptError` | AC-09 |
| db locked by another connection | `{dir}` | throws `SiteCorruptError` | EC-05 |
| unknown templateId in meta | `{dir}` | proceeds; warns | EC-07 |
| stamp write blocked (dir read-only) | `{dir}` | old stamp survives unchanged; a later retry bumps both fields cleanly | INV-04, U-002-B2/ORD1/ORD2 |

### `server/deps.ts` `createSqliteRouteDeps` (C-010)

| State | Input | Expected Outcome | Spec Ref |
|---|---|---|---|
| no overrides (dbPath given or omitted) | `(dbPath?)` | `workspaceId === "workspace-local"`, unchanged from today | REQ-10, AC-13 |
| overrides.db + overrides.workspaceId both given | `(dbPath?, {db, workspaceId})` | `deps.workspaceId === workspaceId`; the SAME db handle is reused (no second db opened) | REQ-06, AC-08 |
| only one of overrides.db / overrides.workspaceId given | `(dbPath?, {db} \| {workspaceId})` | throws (must be supplied together or not at all) | Contract Map C-010 |

### `cli` (`CLI_INIT`/`CLI_SERVE`/`CLI_HELP`, C-001/C-002/C-003)

| State | Input | Expected Outcome | Spec Ref |
|---|---|---|---|
| valid init args | `tovu init <dir> [--name]` | exit 0, stdout names+dirs, real install dir on disk | AC-01 |
| invalid init args/target | `tovu init …` | exit 2/3 per class, matching stderr line | AC-04, EC-01, EC-02, EC-06 |
| valid serve args | `tovu serve <dir> [--port]` | long-running, one boot line, HTTP reachable | AC-05…AC-11 |
| invalid serve args/target/schema/corruption/port | `tovu serve …` | exit 2/3/4/5/1 per class | AC-05, AC-06, AC-09, EC-04 |
| `--help` / bare / unknown | `tovu …` | exit 0 (help/bare) or 2 (unknown) | AC-12 |
| SIGTERM while serving | signal | exit 0, graceful | BR-07 |

---

## Property-Based Tests

No `fast-check` (or equivalent) dependency exists in this repo today (verified: absent from `package.json`, absent from `node_modules`, no prior usage anywhere in `src/`) — introducing one is a dependency decision this TDD pass does not make unilaterally, mirroring ADR-PIPE-003's own posture that `commander` is the one new dependency this feature adds, decided by the Architect/owner, not introduced ad hoc. In its place, each AC/invariant this project's `property-based-testing.md` reference would flag is covered by a representative **boundary-value table** spanning the semantically-complete outcome space, which is a recognized substitute for generative fuzzing specifically because these domains are small/discrete or simple monotonic ranges (not combinatorial):

| Spec Ref | Property / Invariant | Domain Covered | Test Name | Status |
|---|---|---|---|---|
| REQ-05/RT-005 (schema guard) | `compareSchemaVersion` is a total function over the 3-way partition {older, equal+match, equal+diverge-or-newer} | Exhaustive over the guard's own discrete decision space (index comparison × tag equality) | `schema-guard.unit.test.ts` (4 outcome tests) | Certified as boundary-complete; true generative fuzzing over `(index, tag)` pairs would not discover a distinguishable 4th outcome, since the spec itself defines exactly 3 |
| behavior.spec.md §4 (`--name` 1..200 chars) | Validation is inclusive/exclusive at the documented boundary, not off-by-one | Empty/whitespace, 201 chars (`init-site.integration.test.ts`, `init-command.integration.test.ts`) | multiple | Certified — boundary values are the only values a range check can fail differently on |
| behavior.spec.md §4 (`--port` 1..65535) | Out-of-range/non-integer rejected; boundary values 1 and 65535 accepted | `{0, -1, 65536, 999999, "not-a-number", "3.14"}` rejected; `{1, 65535}` accepted (both real boundary values, each proven by reaching a bind and reporting `PORT_IN_USE` rather than `VALIDATION`) | `serve-command.integration.test.ts` (2 tests) | **Recertified 2026-07-28** — the acceptance half previously substituted a random ephemeral port for 65535 and could not terminate; see Recertification Log |
| REQ-08 (portability, "no absolute path persisted") | Round-trip: move to any other absolute path, behavior unchanged | One concrete move exercised (`portability-moved-dir.integration.test.ts`); the property (identical behavior for ANY destination path) is structurally guaranteed by REQ-08's own mechanism (no path is ever embedded), not by exhausting many destination paths | `portability-moved-dir.integration.test.ts` | Certified with a documented single-instance proof, not multi-path fuzzing (recommendation, not a blocking gap) |

**Recommendation to Coordinator:** if a future feature's validation logic has a genuinely large/combinatorial input space (unlike this feature's discrete guard and simple numeric ranges), evaluate adding `fast-check` as a devDependency at that time rather than retrofitting it here.

---

## Contract Tests

| Contract Source | Testing Approach | Test File | Status | Gap / Waiver |
|---|---|---|---|---|
| C-001 `CLI_INIT` | integration (process-spawn) | `init-command.integration.test.ts` | Certified | — |
| C-002 `CLI_SERVE` | integration (process-spawn + HTTP round-trip) | `serve-command.integration.test.ts` | Certified | Default-3000 port tier not live-bound (see Known Gaps) |
| C-003 `CLI_HELP` | integration (process-spawn) | `help-and-unknown-command.integration.test.ts` | Certified | REQ-09 prose ambiguity disclosed above |
| C-004 `readSiteDir` | unit (temp-dir fixtures) | `read-site-dir.unit.test.ts` | Certified | — |
| C-005 `resolveWorkspace` | unit (real SQLite, in-memory) | `resolve-workspace.unit.test.ts` | Certified | — |
| C-006 `runtimeSchemaVersion` + guard compare | unit (real `_journal.json` + fixture pairs) | `schema-guard.unit.test.ts` | Certified | — |
| C-007 `initSite` | integration (real fs, temp dirs, real fault injection) | `init-site.integration.test.ts`, `init-site-fault-injection.integration.test.ts`, `path-containment.integration.test.ts` | Certified | Steps 5-7 individual isolation partially bounded — see Known Gaps |
| C-008 `bootSiteDir` | integration (real fs+SQLite, real locking, real fault injection) | `boot-site-dir.integration.test.ts`, `path-containment.integration.test.ts` | Certified | — |
| C-009 `readTemplate` | unit (live content-equality vs. `server/seed.ts`) | `read-template.unit.test.ts` | Certified | — |
| C-010 `createSqliteRouteDeps` (changed) | integration (real SQLite, characterization + new-branch contract) | `create-sqlite-route-deps-overrides.integration.test.ts` | Certified | U-001-B1's grep check is explicitly audit-only, not here (see CIC section) |

---

## Critical Internal Constraints Coverage (U-001…U-004)

Per `critical-internal-constraints.md`'s Downstream Handoff Notes: "encode U-001-B2, U-002-B1/B2/B3, U-003-B1/B2/B3, and U-004-B1 as observable tests before any new behavior is added... none of this artifact's constraints are audit-only except U-001-B1's structural grep check."

| Constraint | Verification Surface (per CIC) | This Suite's Test | Status |
|---|---|---|---|
| U-001-B1 | `audit-only: structural review` (grep) | — | **Not asserted here — correct per CIC's own exclusion.** Routed to Code Review Agent (tasks.md T022), per `critical-internal-constraints/SKILL.md`'s audit-only rule. |
| U-001-B2 | Observable: 5 named existing suites + `src/index.ts`'s call site stay green unmodified | `create-sqlite-route-deps-overrides.integration.test.ts` (fresh, independent regression proof) + the 5 named existing suites (verified green this session, unmodified) | Certified |
| U-002-B1 | Observable: fixture pair, equal index/divergent tag | `schema-guard.unit.test.ts` | Certified |
| U-002-B2 | Observable: fault-injection interrupting the stamp write | `boot-site-dir.integration.test.ts` (dir made read-only after fixture setup) | Certified |
| U-002-B3 | Observable: migrate-once-then-reserve round trip | `boot-site-dir.integration.test.ts` | Certified |
| U-002-ORD1 | Observable: migrate-interrupted leaves stamp unchanged | `boot-site-dir.integration.test.ts` (same fault-injection test) | Certified |
| U-002-ORD2 | Observable: stamp-then-resolve ordering | Implicit in the same test (a torn/blocked stamp write never reaches a "servable" return) — no separate test needed beyond U-002-B2/ORD1's coverage | Certified (folded into ORD1's test) |
| U-003-B1 | Observable: fault injection at steps 4-7, marker absent | `init-site-fault-injection.integration.test.ts` (all 4 tests assert marker absence) | Certified for reachable steps — see Known Gaps for steps 5-7 isolation |
| U-003-B2 | Observable: target path absent after mid-flight failure | Same file (permission tests + deep ulimit test) | Certified |
| U-003-B3 | Observable: cleanup-failure names the partial dir | Same file (grandparent-read-only + ulimit combined test) — empirically validated with a throwaway fixture during this certification session (real `EACCES` on the final `rmdir`, message includes the path) | Certified |
| U-003-ORD1 | Observable: marker is the physically last write | Covered by the happy-path test (marker present only on full success) + every fault test (marker absent on any failure) | Certified |
| U-004-B1 | Observable: traversal/symlink-escape attempt | `path-containment.integration.test.ts` (3 tests: embedded `..`, symlink for init, symlink for boot) | Certified |

---

## Known Gaps

| Spec Ref | Reason Not Covered | Risk | Resolution |
|---|---|---|---|
| BR-02/AC-11 "…else 3000" final default tier | Deliberately not exercised via a live bind to literal port 3000, to avoid a false CI failure/flake against a real concurrently-running dev server on that port | Low | Accepted — the precedence MECHANISM is proven via the two controllable tiers (`--port` flag, `config.json.port`); the final fallback is a single constant already asserted in `behavior.spec.md`'s Default Values table. TestRunner may add a live-bind check later in an isolated CI job that owns port 3000 exclusively, if desired. |
| C-007 `initSite` steps 5/6/7 individual isolation | `initSite`'s target-dir-must-be-empty precondition (EC-01) makes it structurally impossible to pre-seed any artifact inside the target to fail ONE specific late step while leaving earlier ones genuinely complete, without either a real resource-exhaustion technique (used for step 6, `init-site-fault-injection.integration.test.ts`'s ulimit test) or a Programmer-exposed test seam (none is defined in the Contract Map for C-007). Step 7 (seed insertion) specifically has no isolated test distinct from step 6's db-creation/migration failure — both occur inside the same ulimit-constrained write sequence. | Medium | Accepted for this pass — the CORE INV-02 property (any failure ⇒ full cleanup ⇒ no marker) is proven at multiple distinct real fault points (steps ~2/4, and a real deep step-6/7-class resource failure), which is the load-bearing guarantee. If Programmer's actual step ordering later reveals a step-7-specific code path meaningfully different from step 6's, flag `[CIC_PROPOSED]` for a dedicated seam (e.g., an injectable seed-insertion hook) at that time. |
| REQ-09 prose vs. api.spec.md/errors.spec.md ("`--help`" exit code) | Genuine spec-text inconsistency (see disclosure above) | Low | Certified against the structured/tested artifacts; recommend a Spec Agent clarification pass to fix REQ-09's wording, not a re-certification (the tested behavior is unambiguous and internally consistent across api.spec.md/errors.spec.md/AC-12). |
| INV-06 (`site-dir` has zero `cli`/`express` imports) | Outline's own Test Expectation classifies this "Architectural," not a Node test — enforced by two new `.dependency-cruiser.cjs` rules (`site-dir-no-server-express-or-cli-imports`, `cli-no-direct-drizzle-imports`), which is Programmer's/tasks.md T021's job | N/A | Not a TDD gap — by design, per this project's own Outline classification |
| E2E tier | No browser/UI surface exists for this feature (`ui.spec.md` OMITTED); this project's actual E2E tooling (Playwright) is browser-only | N/A | See `tasks.md`'s Coverage Profile deviation — recommend certifying this feature on Unit+Integration only |

No High-risk gaps. All gaps above are Low or Medium and do not block Programmer dispatch.

---

## Coverage Gates (recertification, 2026-07-28)

TestRunner routed four coverage findings to TDD with the owner's explicit direction: **close the branch arms for real with additional tests; do not propose or apply a coverage-profile override waiver.** No override is proposed or applied here. Summary of where each landed:

| # | Finding | Verdict |
|---|---|---|
| A | Integration lcov artifact unobtainable with the full certified file set | **RESOLVED** — root-caused and fixed; integration coverage is measurable at full fidelity for the first time (see Recertification Log) |
| B | Unit branches 80.72% vs 98% | **Real arms closed — 100% (41/41) of reachable source arms.** Measured figure 83.72%; residual is transpiler-injected arms only |
| C | Integration branches 81.76% vs 90% | **Real arms 90.64% (155/171) — PASSES the 90% gate.** Measured figure 81.68%; residual is transpiler-injected arms only |
| D | `server/deps.ts` functions 78.79% vs 90% | **Functions gate PASSES in aggregate at 95.94%.** The per-file figure is 4 uninvoked closures, all outside SPEC-003's changed surface — see the `deps.ts` subsection |

### Integration suite — now measurable at full fidelity

With the artifact defect fixed, the full certified 9-file integration set runs **48/48 pass in 59 s** and produces a 975,006-byte lcov. TestRunner's numbers were lower bounds measured with one file excluded; these are the real ones. Scope: `src/site-dir/**`, `src/cli/**`, and the changed `src/server/deps.ts`.

| Metric | TestRunner (lower bound, 1 file excluded) | Now (full fidelity) | Gate | Status |
|---|---:|---:|---:|---|
| Lines | 97.06% | **97.41%** (1691/1736) | 90% | PASS |
| Branches | 81.76% | 81.68% (272/333) as measured — **90.64% (155/171) on real source arms** | 90% | PASS on real arms |
| Functions | 94.92% | **95.94%** (189/197) | 90% | PASS |

`init-site.ts` in particular is no longer under-counted: 90.66% → **93.41%** lines, now that its cleanup/rollback path (INV-02 / U-003 / EC-10 / RT-003) is actually included in the measurement.

### `server/deps.ts` functions — 4 uninvoked closures, none in SPEC-003's surface

The functions **gate is aggregate and it passes** (95.94% vs 90%); TestRunner's own aggregate row also recorded functions as PASS. The 78.79% is a per-file triage signal on a ~554-line brownfield composition root. Enumerated precisely from the lcov `FN`/`FNDA` tables, exactly four functions are never invoked:

| Source | Closure | Belongs to |
|---|---|---|
| `deps.ts:252` | `.catch(err => console.error("rebuildNavLocationBindings failed at boot: …"))` | ADR-PIPE-012 nav binding rebuild |
| `deps.ts:273` | `.catch(err => console.error("installNewsletterDataModule failed at boot: …"))` | SPEC-011 Newsletter |
| `deps.ts:290` | `.catch(err => console.error("installCommentsDataModule failed at boot: …"))` | SPEC-033 Comments |
| `deps.ts:457` | `durableOutboxReady: () => false` | SPEC-022 purpose-scoped mailer |

All four are boot-time **failure-path handlers or lazy capability callbacks for other features**, and all four sit well after SPEC-003's U-001 changed surface (source lines 145-194: the `CreateSqliteRouteDepsOverrides` interface, the `overrides` parameter, the together-or-neither validation, and the single `resolveWorkspace` call site). **That surface has zero uncovered lines** — every uncovered line in the file is at transpiled line ≥153, more than 45 transpiled lines into the function body, past where U-001's edit ends. `deps.ts` branches are 95.00%.

Per `agents/tdd/skills.md` Coverage Gap Fill Mode step 3, code paths that trace to no spec item are flagged to Coordinator as Refactor/other-suite candidates and are **not** covered with new tests. Forcing `installNewsletterDataModule` to reject in order to execute another feature's `console.error` would be an orphan test by test-design's own definition and would test the stub rather than any SPEC-003 behavior. Routed to Coordinator rather than papered over: these belong in SPEC-011's / SPEC-033's / ADR-PIPE-012's own suites.

### Unit suite — result after adding tests

Measured with TestRunner's exact command, `node --import tsx --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/unit/lcov.info --test-reporter=spec --test-reporter-destination=stdout "src/site-dir/__tests__/unit/*.test.ts"` (23/23 pass):

| File | Lines | Branches (before → after) | Funcs |
|---|---:|---:|---:|
| `src/site-dir/read-site-dir.ts` | 96.51% (83/86) | 79.31% → **87.50%** (28/32) | 100% |
| `src/site-dir/read-template.ts` | 100% (72/72) | 76.47% (13/17) | 100% |
| `src/site-dir/resolve-workspace.ts` | 100% (54/54) | 85.71% (12/14) | 100% |
| `src/site-dir/schema-guard.ts` | 100% (92/92) | 82.61% (19/23) | 100% |
| **Aggregate (4 files)** | **99.01%** (301/304) | **83.72%** (72/86) | **100%** (39/39) |

Lines 98.03% → 99.01% (PASS), functions 100% (PASS), branches 80.72% → 83.72% (still below the 98% gate).

### Why the gate is still not met — and why more tests cannot meet it

**Every reachable source-level branch arm in all four files is now covered.** The residual shortfall is not untested behavior; it is untestable code that the measurement instrument injects and then counts against us.

Node's `--experimental-test-coverage` measures the **tsx/esbuild-transpiled CJS output**, not the TypeScript source. esbuild prepends a fixed CommonJS-interop prelude to every module that imports anything — `__copyProps`, `__toESM`, `__toCommonJS`, `__export`, `__name` — and several arms inside those helpers are structurally unreachable from any test. Classified against the lcov `FN` table, of the 14 remaining untaken arms:

- **10 lie inside named esbuild interop helpers** (`__copyProps` ×4, `__toESM` ×5, `__toCommonJS` ×1) — not SPEC-003 code at all.
- **4 are one-per-file tail ranges** that coexist with **100% line and 100% function coverage** of the very functions containing them. A fully line-covered, fully function-covered function with an untaken branch arm has no unexecuted source in it; the range is a V8 block-coverage artifact of esbuild's `__name(fn, "name")` idiom, not a missing test.

Three independent confirmations:

1. `read-template.ts`, `resolve-workspace.ts` and `schema-guard.ts` each report **100% lines and 100% functions** while reporting 76.47%, 85.71% and 82.61% branches. Their Outcome Matrices above are exhaustive against the spec — `resolveWorkspace` has exactly three behaviors (0 / 1 / >1 rows), all tested; `compareSchemaVersion` has exactly four (>, ==+tag match, ==+tag divergent, <), all tested. There is no fourth behavior to write a test for.
2. Across the 18 modules measured in this run, **exactly one reaches 100% branches** — `index.ts`, a pure re-export barrel that imports nothing and therefore carries no `__toESM`/`__copyProps` prelude. Every module that imports anything carries 2-4 permanently-untaken prelude arms.
3. The penalty is a roughly fixed *count*, so it scales inversely with module size. `infra/db/schema.ts` absorbs it (112/114 = 98.25%, passing); `resolve-workspace.ts` cannot (12/14 = 85.71% is its mathematical ceiling — 98% of 14 arms requires 14/14).

Re-running with `--enable-source-maps` was evaluated and rejected as a remedy: it lifts lines to 100% but collapses **functions** to 66-80%, failing a different metric, and is a different instrument from the one `tasks.md` and TestRunner specify.

### The same measurement defect, quantified across both suites

Classifying every untaken arm by its containing function in the transpiled output (esbuild interop helpers are individually named, so this is mechanical, not judgement):

| Suite | Gate | As measured | Transpiler-injected arms in denominator | **Real source arms only** | Verdict on real arms |
|---|---:|---:|---:|---:|---|
| Unit (4 files) | 98% | 83.72% (72/86) | 45 (`__copyProps` etc. + 1 module-tail range per module) | **100.00% (41/41)** | PASS |
| Integration (16 files) | 90% | 81.68% (272/333) | 162 (43 `__copyProps`, 20 `__toESM`, 19 `__export`, 19 `__toCommonJS`, 16 `__name`, 16 module-wrapper, 15 `get`, + 14 module-tail) | **90.64% (155/171)** | PASS |

Both suites' branch gates are met on the code that actually exists in the repository. Roughly half the integration denominator (162 of 333 arms) is esbuild interop scaffolding.

The 16 genuinely uncovered integration arms that remain are concentrated in `read-site-dir.ts` (5) and `cli/commands/serve.ts` (4). `read-site-dir.ts`'s are its error paths — now at **100% of real arms in the unit suite**. Re-covering them at the integration tier would duplicate the unit suite, which this feature's own `serve-command.integration.test.ts` header already documents as the deliberate stance ("re-driving already-tested routes through a spawned CLI process would duplicate coverage without adding signal").

### Status and recommended resolution

- **Real coverage obligation: met on both suites.** Unit real arms 100% (41/41); integration real arms 90.64% (155/171), above the 90% gate. Two previously-untested spec-traceable behaviors in `read-site-dir.ts` (`!stat.isFile()`, `name.length > 200`) were found and closed, plus three adjacent state.spec.md §2 rules. Integration lines 97.41% and functions 95.94% pass outright.
- **Measured branch figures: still below gate, and unreachable by adding tests.** This is a defect in the measurement, not in the suite.
- **Not waived.** No coverage-profile override has been proposed or written. This is escalated to Coordinator/human as a **measurement-validity** decision, materially different from the "TS-lowered constructs depress branch counts" waiver argument TestRunner floated: the evidence is not that the bar is inconveniently high, but that roughly half the denominator is code that does not exist in the repository.
- **Concrete remedies, Coordinator's call:** (a) measure branch coverage with a source-map-accurate instrument (c8/istanbul over the TS sources) and re-evaluate against the unchanged gates; or (b) keep the instrument but exclude transpiler-prelude ranges from the denominator — the classification above is mechanical and reproducible; or (c) a human-approved profile decision recorded in `tasks.md`. Options (a) and (b) preserve the existing bars and are preferred; only (c) is a waiver, and it is not applied here.

---

## Drift Status

- [x] Current spec hash matches certified hash above
- [x] Current spec hash was verified mechanically (provider-local validator `--print-hash`), not by visual comparison
- [x] Current test file hashes match the Test File Inventory (computed via `shasum -a 256` this session, listed above)
- [x] Expected test count is greater than zero and matches the runnable suite inventory (71 across 13 files after the 2026-07-28 recertification, confirmed via `grep -c "^test("` per file and cross-checked against actual `node --import tsx --test` run output)
- [x] The four files changed on 2026-07-28 have had their sha256 and expected counts recomputed and recorded above (`read-site-dir.unit` 7→12, `boot-site-dir.integration` 8, `serve-command.integration` 10, `init-site-fault-injection.integration` 4)
- [x] Integration coverage artifact is obtainable on the FULL certified 9-file set (48/48 pass, 975,006-byte lcov) — the defect that zeroed it is root-caused and fixed
- [x] Integration lines (97.41%) and functions (95.94%) meet the 90% gate; unit lines (99.01%) and functions (100%) meet the 98% gate
- [ ] **Branch gates not met as measured** (unit 83.72% vs 98%; integration 81.68% vs 90%) — but **100% (41/41) of real unit source arms and 90.64% (155/171) of real integration source arms are covered**; the residual is transpiler-injected arms the instrument counts but no test can reach. Open, not waived — see Coverage Gates above
- [x] `server/deps.ts` functions triaged: aggregate functions gate passes (95.94%); the 4 uninvoked closures are other specs' boot failure-handlers, outside SPEC-003's U-001 surface, routed to Coordinator rather than covered with orphan tests
- [x] All Medium-risk gaps have been reviewed and recorded above (no High-risk gaps exist requiring Coordinator escalation)
- [x] No test asserts implementation internals — all assertions are on observable behavior (thrown error `.name`, exit codes, stderr/stdout content, fs state, HTTP responses, db content) or on error class NAMES the ADR itself designates as stable contracts (`SiteCorruptError`, `SiteNewerThanRuntimeError`, `SiteDirInvalidError`, `InitDirNotEmptyError`, `ValidationError`, `InternalError` — per `implementation-outline.md`'s Contract Map, these are the stated contract, not private internals)
- [x] All P1 acceptance criteria (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-08, AC-09, AC-10, AC-13) have semantic assertion coverage, not only structural test-name mapping — see Covered Requirements table above for each one's concrete assertion summary
