# StrykerJS run 2 — FORCED re-run (measure-only, no source/test edits)

Unattended cloud run, 2026-10-25T21:43Z → 2026-10-26T00:10Z. Same scope as run 2: Jini `packages/agent-plugins` (`src/lifecycle/**`, `src/admin-surfaces/**`, `src/*.ts`) + `packages/cms/src/widgets/html/plugin-export.ts`. Stryker 9.6.1 core + vitest-runner, vitest 2.1.9 (Jini's own), TypeScript 5.9.3 beside Stryker, Node 22, 4 cores, concurrency 3, `perTest`, StringLiteral excluded, `timeoutMS` 10000, `disableTypeChecks`, **`force:true` / `incremental:false`**, cwd = package dir.
Jini tree: **`9fa38851`** = `3e2fbae8` (origin/cloud/overnight-1024-jini) + run 2's Part-0 `exports.ts` test commit. ASSUMPTION: the brief says 3e2fbae8, but run 2 measured Parts 1–3 on 9fa38851 (its report: "the Part 1 run (committed tests…)"), so 9fa38851 is the comparable tree; the only difference is one test file for `exports.ts`.

## 1. Headline — run 2 vs forced
| Part | Mutants | Run 2 score | Forced K/T/S/NC | **Forced score** | Δ | Static survivors run2→forced | Collection-error kills | Vitest-timeout "Killed" run2 / forced | Stryker Timeout run2 / forced | Strict forced¹ | Forced if coll-err counted Survived² |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 lifecycle | 4508 | 89.88 | K4103 T17 S384 NC4 | **91.39** | +1.51 | 148→80 | 68 | 2 / 1 | 13 / 17 | 90.99 | 89.88 |
| 2 admin-surfaces | 2085 | 90.60 | K1946 T7 S132 NC0 | **93.67** | +3.07 | 79→15 | 10 | 64 / 61 | 1 / 7 | 90.41 | 93.19 |
| 3a agent-plugins `src/*.ts` | 214 | 93.93 | K193 T8 S13 NC0 | **93.93** | 0.00 | 1→1 | 0 | 0 / 0 | 7 / 8 | 90.19 | 93.93 |
| 3b cms plugin-export | 169 | 85.21 | K144 T0 S25 NC0 | **85.21** | 0.00 | 2→2 | 0 | 0 / 0 | 0 / 0 | 85.21 | 85.21 |
| **all 1–3** | **6976** | **90.11** | K6386 T32 S554 NC4 | **92.00** | **+1.89** | **230→98** | **78** | 66 / 62 | 21 / 32 | **90.65** | 90.88 |

¹ Strict = only assertion kills count as detected: vitest-timeout "Killed" and Stryker `Timeout` are moved out of the numerator (kept in the denominator). ² What the upstream runner would report for the same forced run (collection-error kills become Survived) — confirmed directly for one file in §3.
Forced survivors are a strict subset of run-2 survivors: **0 mutants went Killed→Survived; 132 went Survived→detected, all 132 static** (`data/force-survdiff*.txt`).

## 2. Verdict on the three review findings
1. **Stale incremental results — CONFIRMED.** Every survivor that disappeared under `--force` is a static mutant. Part 2: 64 of 79 static survivors gone, none involving collection errors → pure stale cache from the pre-alias-fix pass (run 2's incremental re-run reused static results because neither the mutant nor the test files changed — only the wrapper config). Part 1: 68 gone (64 collection-error + 4 static now Timeout/Killed); 3a/3b unchanged. Run 2's per-part headline was therefore understated by 1.5–3.1 points, and its top triage pattern was partly an artifact: **22 of capability-declarations.ts's 30 "regex anchor" survivors are killed** when forced (file 76.9 % → 93.85 %), surface-capabilities 17 of 36, delivery-bindings 7 of 10, surface-handlers 8 of 23.
2. **Collection errors counted as survivors — CONFIRMED and measured: 78 mutants.** All are `BlockStatement`/`BooleanLiteral`/`ConditionalExpression` mutants on the `create*Module` memoisation (`if (!instance) { instance = buildModule(ports); … }`) or on a module-level fixture validator. The mutant makes `createXModule()` return undefined; `capabilities.characterization.unit.test.ts`, `admin-surfaces.characterization.test.ts`, `search.unit.test.ts`, `lifecycle-reconciliation.unit.test.ts`, etc. destructure it at module top level → the file fails to import → vitest reports zero tests for it → upstream runner says "all passed". 68 in Part 1 (activation 5, bundled-digests 5, bundled-source-archive 5, capability-projection 5, install 6, resolve-agent-plugin-refs 6, retire-bundled 5, search 5, seed-bundled 5, set-enabled 5, trusted-plugin-files ~5, uninstall 5, package-paths 3, node 2, installed-package-index 1 …), 10 in Part 2 (descriptor 9, action-schema 1: fixtures in `external-links.security.test.ts` / `admin-surfaces.security.test.ts` fail validation at import). **Run 2's "pattern 2 — memoisation needs an identity test" was a mis-triage**: those were never real survivors.
3. **66 'Killed' were vitest timeouts — CONFIRMED (66 in run 2: 64 Part 2 + 2 Part 1; forced: 62).** They are not bogus, though: each is a mutant that makes a postMessage envelope guard (`host-validator.ts` 41–50, `surface-client.ts` 97–112, `external-links.ts` 33–36, `protocol.ts`) **reject a valid message**, so the round-trip tests (`admin-surfaces.vertical-slice … round-trips one declared action`, `surface-client … a call made before init is posted once init arrives`) wait forever and vitest kills them at 30 s. Real detections, but by hang rather than assertion, and 30 s each. The *reject-invalid* direction of the same guards still has 17 + 33 + 11 genuine survivors (§5).

## 3. Methodology checks actually run
- **Fresh measurement:** `force:true`, `incremental:false`, `cleanTempDir:true`; no incremental file read or written. Configs in `data/force-stryker.*.json`.
- **Same vitest:** `npm i @stryker-mutator/vitest-runner` peer-installed vitest **5.0.5**; replaced by a symlink to Jini's 2.1.9, verified `import('vitest/node')` loads.
- **Absolute alias** (`@jini-ai/plugins/host` → `/home/user/Jini*/packages/plugins/src/host/index.ts`) in the wrapper config (`data/force-vitest.agent-plugins.config.ts`); 30 s test/hook timeout as in run 2; `.stryker-tmp` excluded from collection.
- **`inPlace:true`, tempDir outside the package.** FAILURES that forced this (logged): sandbox mode → `ENOENT …/.stryker-tmp/agent-plugins/src/lifecycle/ports.ts` (a structural test reads sibling paths); inPlace with in-package tempDir → vitest collected the backup copy (`ENOENT …/.stryker-tmp/backup-P9KpVo/package.json`). After every run `git status` shows only the untracked wrapper configs — sources restored.
- **Dry-run count vs plain vitest (all MATCH):**

| Check | Plain vitest | Stryker dry run |
|---|---|---|
| agent-plugins whole suite (orig config / wrapper) | 1465 pass + 2 skip / same | 1465 (p3a, related:false) |
| Part 2 `vitest related` admin-surfaces files | 1242 + 2 skip | 1242 |
| Part 1a `lifecycle/[a-h]*.ts` | 1134 + 2 skip | 1134 |
| Part 1b `lifecycle/[i-z]*.ts` | 1073 + 2 skip | 1073 |
| Part 1c `lifecycle/*/**` | 456 | 456 (both runs) |
| cms (wrapper excludes 1 pre-existing failure) | 4199 | 4199 |
- **cms pre-existing failure:** plain `vitest run` in cms = 4199 pass + **1 FAIL** on the unmodified tree (`subpath-isolation.contract.test.ts`: `./widgets/html/html-embeds` reaches `src/consent/types.ts` via plugin-export.ts). Excluded in the wrapper (Stryker aborts on a red dry run). Run 2 used only 6 widget test files (141 tests) for 3b; the forced run uses the full cms suite — same score, so no indirect kills were missed.
- **Collection errors FAIL the mutant:** 13-line patch to the runner (`data/force-vitest-runner-collection-error.patch`): any test file with `result.state==='fail'` and zero executed tests adds a failed pseudo-test `STRYKER-FORCE-COLLECTION-ERROR <file>: <error>`. **A/B proof:** `capability-projection.ts` re-run with the UNPATCHED runner, same forced config → the same 5 mutants are **Survived with `testsCompleted: 27`** (the reviewer's "only 27 tests completed"); file score 73.53 % unpatched vs 85.29 % patched (`data/force-unpatched-capproj.json`).
- **Timeout accounting:** Stryker `Timeout` kept separate; vitest-internal timeouts identified by `statusReason` matching `Test timed out in …ms` and reported separately (`data/force-analyze.py`).
- **`vitest.related`:** a first Part 2 attempt with `related:false` (dry run = whole suite) was aborted after 9 min — 485 static mutants × the full 1465-test suite ≈ 110 min. Final runs use `related:true` (run 2's semantics); the count checks above were redone per slice against plain `vitest related`.
- **Determinism:** Part 1c was run twice (main tree, then Jini2 worktree under different load): 601 mutants, **0 status differences**.
- **Concurrency caveat:** to fit 3 h, Part 1 ran in a second worktree (`/home/user/Jini2`, same sha, its own Stryker copy, so two in-place runs never share `__stryker__` mutant ids) concurrently with Part 2 / 1c. Load reached ~7 on 4 cores; Stryker Timeouts rose 21 → 32 and may be slightly inflated by contention.

## 4. Per-file table (forced vs run 2)
Full tables with K/T/S/NC per file: `data/force-p1a.compare.md`, `force-p1b.compare.md`, `force-p1c-main.compare.md`, `force-p2.compare.md`, `force-p3a.compare.md`, `force-p3b.compare.md`. Files whose score moved:

| File | Run 2 | Forced | Why |
|---|---|---|---|
| admin-surfaces/capability-declarations.ts | 76.92 | 93.85 | 22 stale static (regex) |
| lifecycle/capability-projection.ts | 70.59 | 85.29 | 5 coll-err |
| admin-surfaces/surface-capabilities.ts | 85.12 | 92.15 | 17 stale static |
| lifecycle/trusted-plugin-files.ts | 84.62 | 94.23 | 5 coll-err |
| lifecycle/set-enabled.ts | 81.48 | 90.74 | 5 coll-err |
| lifecycle/bundled-source-archive.ts | 83.33 | 90.28 | 5 coll-err |
| lifecycle/seed-bundled.ts | 81.01 | 87.34 | 5 coll-err |
| admin-surfaces/delivery-bindings.ts | 92.19 | 97.66 | 7 stale static |
| lifecycle/resolve-agent-plugin-refs.ts | 89.17 | 94.17 | 6 coll-err |
| lifecycle/retire-bundled.ts | 92.38 | 97.14 | 5 coll-err |
| admin-surfaces/surface-handlers.ts | 87.70 | 91.98 | 8 stale static |
| lifecycle/search.ts | 88.49 | 92.09 | 5 coll-err |
| lifecycle/bundled-digests.ts | 78.72 | 82.27 | 5 coll-err |
| admin-surfaces/settings-value.ts | 86.89 | 90.16 | 2 stale static |
| lifecycle/uninstall.ts | 88.89 | 91.98 | 5 coll-err |
| lifecycle/activation.ts | 86.08 | 88.67 | 5 coll-err + 3 static now Timeout |
| lifecycle/install.ts | 83.20 | 85.55 | 6 coll-err |
| lifecycle/node.ts | 78.95 | 81.58 | 1 coll-err |
| admin-surfaces/callback-field-inbox.ts | 88.46 | 100 | 3 stale static |
| admin-surfaces/action-schema.ts | 97.06 | 98.90 | 5 stale static |
| lifecycle/installed-package-index.ts | 85.42 | 86.46 | 1 coll-err |
| lifecycle/tools/capabilities.ts | 94.96 | 95.68 | 1 stale static |
Unchanged (forced = run 2): persistent-state 65.52, package-paths 77.94, skill-file-reader 80.54, installed-package-roots 84.38, fetch-archive 88.98, automatic-use 89.62, yauzl-archive-reader 89.47, host-validator 87.31, surface-client 87.45, external-links 89.11, theme 89.29, action-tools 90.91, tools/projection, update*, manifest, layout, compatibility*, exports 99.08, all of Part 3.

## 5. Top forced survivors that are real gaps (re-checked against the forced data)
Still valid from run 2's triage (these survive with a fresh, collection-error-aware run):
1. **Security envelope guards, reject-invalid direction** — `host-validator.ts` 42/44/49/50/97 (17 surv), `surface-client.ts` 97–112 (33), `external-links.ts` 33–36 + **48 (URL `username`/`password` refusal)** (11): no test sends a message that is invalid in exactly one field (non-object, null, wrong protocol/version/kind, bad mountId/requestId) or a link URL with credentials.
2. **cms `plugin-export.ts` (85.21 %)** — 57 unknown-slot/`hasOwn` guard (5 surv: `props.constructor`/`__proto__`), **66 `startsWith('//')` open-redirect guard**, 94–96 unquoted-attribute check, 108–109 slot-in-comment, 152/154 missing `port`/`id`/`config` each alone.
3. **`fetch-archive.ts` 279** — URL with username/password not refused (5 surv); 221/248 exact-`maxBytes` boundary.
4. **`package-paths.ts` (77.94 %)** — containment `relative !== '..' / !isAbsolute` (113, static), the four `..`/`../`/`.`/`""` escapes (58), Windows drive regex (53).
5. **`skill-file-reader.ts` (80.54 %, 36 surv)** — control-byte rule (36), size cap boundary (23), path guards (66: NUL, backslash, absolute, `C:` each alone).
6. **`persistent-state.ts` (65.52 %)** — invalid plugin id never passed to `parsePluginId` (28–30); port lambdas (16–17).
7. Error-code helpers rethrowing non-ENOENT errors (`node.ts:30`, `installed-package-roots.ts:71`, `installed-package-index.ts:42`, `update.ts:340`) — 4–6 survivors each.
8. **`tools/capabilities.ts:111`** JSON-escaped token leak check.
**Withdrawn from run 2's list:** "pattern 2 memoisation identity test" (all were collection-error kills); most of "pattern 1 regex anchors" in capability-declarations / surface-capabilities / delivery-bindings / surface-handlers (stale static). Regex survivors that remain real: installed-package-roots 8/34, update-store 32–33, bundled-digests 97/99, install 245, manifest 84/461, surface-handlers 70, surface-client 21, descriptor 66.
**Recommendation for the round-trip tests:** give them a bounded await so a hang fails in ~1 s with an assertion, not at 30 s; that would turn 61 timeout-kills into assertion kills and cut ~30 min of mutation wall time.

## 6. Concerns / caveats
- Absolute scores remain an approximation: `disableTypeChecks` (type-invalid mutants count as normal), indirect kills count, equivalent mutants not proven.
- Part 1 ran under CPU contention (see §3); Killed/Survived were deterministic in the 1c repeat, but Timeouts may be a little inflated.
- The runner patch is local tooling (not upstreamed); without it, any future run will again count module-load failures as survivors. Alternative without patching: avoid top-level `createXModule()` destructuring in test files.
- No source or test files were edited in Jini; only the untracked wrapper configs exist there (not committed).

Artifacts (`data/`): `force-p1a/p1b/p1c-main/p2/p3a/p3b.json` (forced mutation reports), `force-p1c-rerun-jini2.json` (determinism repeat), `force-unpatched-capproj.json` (A/B), `force-*.compare.md`, `force-*.analysis.txt`, `force-survdiff*.txt`, `force-stryker.*.json`, `force-vitest.*.config.ts`, `force-vitest-runner-collection-error.patch`, `force-analyze.py`/`force-compare.py`/`force-survdiff.py`, `force-plaincounts-*.txt`, `force-p2-related-false-aborted.txt`.

## Progress log
### 2026-10-25T21:43Z — STARTED
Tovu `cloud/stryker-1025-tovu` @ origin tip; Jini detached at **`9fa38851`** (= `3e2fbae8` + run-2's Part-0 `exports.ts` test commit — run 2's Parts 1–3 were measured on this tree, so this is the comparable one; ASSUMPTION, see report). Plan: pnpm install + build, plain `vitest run` baseline counts, dry-run count check, then Parts 1/2/3a/3b with `--force`.
### 2026-10-25T22:07Z — PROGRESS
Setup: Stryker 9.6.1 core+vitest-runner + typescript 5.9.3 in a separate dir; Stryker's peer-installed vitest 5.0.5 REPLACED by a symlink to Jini's vitest 2.1.9 (otherwise the runner would drive a different vitest than the tests). Runner patched (`data/force-vitest-runner-collection-error.patch`): a test file that fails to collect now FAILS the run (mutant Killed, reason `STRYKER-FORCE-COLLECTION-ERROR …`) instead of reporting zero tests = Survived. Config: `force:true`, `incremental:false`, `vitest.related:false` (dry run = whole suite, so its count is directly comparable to plain `vitest run`), `inPlace:true` + tempDir outside the package (sandbox copies broke tests that read `../../../../package.json` / sibling packages), wrapper vitest config with ABSOLUTE alias + `.stryker-tmp` excluded.
FAILURE (fixed): first two p3a dry runs aborted — sandbox mode: `ENOENT …/.stryker-tmp/agent-plugins/src/lifecycle/ports.ts`; inPlace with in-package tempDir: vitest collected the backup copy of the tests (`ENOENT …/.stryker-tmp/backup-P9KpVo/package.json`).
Count check agent-plugins: plain `vitest run` (orig config) 1465 passed + 2 skipped; wrapper config same; Stryker dry run "Ran 1465 tests" → MATCH. cms: plain run 4199 pass + 1 PRE-EXISTING FAILURE (`subpath-isolation.contract.test.ts`: plugin-export.ts reaches consent/types.ts) → excluded in wrapper; wrapper 4199; dry run 4199 → MATCH.
Part 3a forced: 255 mutants (41 ignored StringLiteral) K193 T8 S13 → **93.93 %** (run 2: 93.93 %). Part 3b forced (full cms suite, run 2 used 6 widget test files/141 tests): K144 S25 → **85.21 %** (run 2: 85.21 %). 0 collection-error kills, 0 vitest-timeout kills in either.
### 2026-10-25T22:37Z — PROGRESS
Part 2 first attempt with `vitest.related:false` ABORTED by me after 9 min: 485 static mutants each re-running the full 1465-test suite → ~110 min for Part 2 alone, over budget. Restarted with `related:true` (= run 2's semantics; static mutants run every test file that imports the mutated file; still `--force`). Count check redone per part against plain `vitest related --run <same files>`: Part 2 plain 1242 pass (+2 skip) vs Stryker dry run "Ran 1242 tests" → MATCH; Part 1a plain 1134 vs dry run 1134 → MATCH. Unrelated-suite dry run (related:false) was 1465 = plain 1465 (proved in p3a/p2-attempt-1).
To fit the 3 h cap, Part 1 runs CONCURRENTLY with Part 2 in a second worktree (`/home/user/Jini2`, same sha 9fa38851, own Stryker copy, own in-place tree — two in-place runs in one tree would share mutant ids through `__stryker__`). Part 1 split into 1a `lifecycle/[a-h]*.ts` (1648 mutants), 1b `[i-z]*.ts`, 1c `lifecycle/*/**` (tools/) so a partial finish still yields data. Caveat: CPU contention (load ~6.9 on 4 cores) can turn slow kills into Timeouts; Timeouts are reported separately.
### 2026-10-25T22:52Z — PROGRESS
Part 2 forced DONE (30 min): K1946 T7 S132 NC0 → **93.67 %** vs run 2 **90.60 %** (+3.07). Static survivors 79 → 15: run 2's incremental re-run kept stale pre-alias-fix static results. 10 kills via collection error (descriptor.ts ×9, action-schema.ts ×1 — module-level fixtures in `external-links.security.test.ts` / `admin-surfaces.security.test.ts` fail validation at import). 61 Killed are vitest 30 s test timeouts (run 2: 64) — strict score (vitest-timeout kills and Stryker Timeouts not counted as detected) 90.41 %. Table: `data/force-p2.compare.md`.
### 2026-10-25T23:03Z — PROGRESS
Part 1a forced DONE (Jini2, 23 min; dry run 1134 = plain related 1134): K1255 T7 S121 NC1 → **91.18 %** vs run 2 same files **89.52 %**; static survivors 30 → 7; **20 collection-error kills** (activation.ts 175/869/871, bundled-digests 91/339/341, bundled-source-archive 60/193/195, capability-projection 11/80/82 — every one is a `create*Module` / `buildModule` memoisation body: the mutant makes `createXModule()` return undefined, a test file destructures it at module top level → import throws).
Part 1c (lifecycle/tools/**) forced DONE (main tree, 4 min; dry run 456 = plain related 456): K507 T3 S29 NC3 → **94.10 %** vs run 2 93.91 %.
**Direct check of the collection-error claim:** `capability-projection.ts` alone re-run with the UNPATCHED upstream runner (same forced config): the same 5 mutants come back **Survived with `testsCompleted: 27`** (patched runner: Killed by collection error); file score 73.53 % unpatched vs 85.29 % patched. So run 2's "pattern 2 — memoisation needs an identity test" survivors were mis-triaged: they were collection-error kills miscounted as Survived. Data: `data/force-unpatched-capproj.json`.
Part 1b (`lifecycle/[i-z]*.ts`, largest slice) running in Jini2.
### 2026-10-25T23:22Z — PROGRESS
Part 1b at 2088/2582 (static tail remaining, ETA ~00:00Z). Survivor diff run 2 → forced (`data/force-survdiff.txt`): **every** run-2 survivor that is no longer a survivor is a **static** mutant (Part 2: 64/64 static, 0 collection; Part 1a: 23 static, of which 20 collection-error) — i.e. stale incremental-cache results from the pre-alias-fix pass. Notably 22 of capability-declarations' 30 run-2 survivors (the regex-anchor "pattern 1" headline) are killed when forced. No mutant went the other way (killed in run 2 → survived forced).
Vitest-timeout kills inspected: they are mutants that make an envelope guard reject a VALID message, so round-trip tests (`admin-surfaces.vertical-slice … round-trips one declared action`, `surface-client … a call made before init is posted once init arrives`) hang until the 30 s vitest timeout — genuine detections, but by hang, not by assertion.

### 2026-10-26T00:09Z — DONE
All parts measured with --force; final report above. Pushed to Tovu `cloud/stryker-1025-tovu`.

RUN2-FORCE DONE 2026-10-26T00:10Z — wall ≈ 2 h 27 m (21:43Z → 00:10Z; Stryker time ≈ 2 h 10 m across parallel lanes), ≈ 0.25M tokens (rough).
