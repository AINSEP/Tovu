# audit:D03 coverage gates -> existing `@jini-ai/devops/checks/coverage` (templates T-DEDUPE x2; slice 3 BLOCKED)

Written 2026-11-16 from Tovu `refactor/terra` b28d38c6 / Jini `refactor/terra` b7666092 (unattended planning run; nothing executed).
untangle_overlap: none. No row in `untangle/sheets/*.repoint.tsv` names `development/scripts/**` coverage files or `packages/devops/src/checks/**`; no `wave-b/*` branch touches `packages/devops` (checked `git diff --name-only origin/refactor/terra...origin/wave-b/<each>`). Can run before or after the wave-B merge.
Tier: Sonnet 5.5 high executor per slice (~40k each). Opus wrote the parity reading below.

## Label correction (read first)
The audit row says HARDEN. Reading both sides, **Jini is a superset for every function Tovu's gates call**: `integrity.ts` is Tovu's detector verbatim plus CRLF tolerance and an injected classifier; `lcov.ts`/`floors.ts`/`diff.ts` are Tovu's `route-coverage-lib` / floor / tier logic plus directory-boundary checks, an `entries` union and a brf-consistency check. There is **no parity row** (nothing Tovu has that Jini lacks), so per T-HARDEN step 0 slices 1 and 2 run as **T-DEDUPE** with no Jini commit. The only genuinely missing Jini behaviour is the "changed/all-file reporting" half (`coverage-changed*.ts`, `coverage-all-files.ts`): slice 3, BLOCKED on an owner question (below).

Jini test text: `packages/devops/src/checks/coverage/__tests__/integrity.test.ts` still names `development/scripts/check-coverage-integrity.ts` (l.37, l.509) and uses `apps/admin/...` fixture paths (l.140-154). Not touched here (neutralising it is an 11-line Jini test-only commit that would trip COMMON rule 2's rg on its own fixture data); recorded as follow-up F-D03-1 in AUDIT-SHEETS-2.md.

Gate output: slices 1-2 keep every line `check:coverage-integrity`, `check:route-coverage-floor`, `check:route-coverage-diff` print today, byte for byte, on any LF lcov whose two tiers agree on BRF (the only real-world shape). The two output-visible differences are pinned failing-test-first (DD-coverage-2 F1/F2).

---

## DD-coverage-1: integrity detector

```
id: DD-coverage-1
feature: audit:D03 development/scripts (coverage gates)
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base
tovu_files:
  - development/scripts/check-coverage-integrity.ts | blob 7667dec55c36dfd0a5ac605d7e650088d7f94a09 | reduce-to-binding
  - development/scripts/coverage-changed.ts | blob ca60b27902daec5270a6038f55f72cb3b8391657 | importer edit (l.10, l.166, l.171)
  - development/scripts/__tests__/check-coverage-integrity.test.ts | blob c69b50ba76945947c006ffb632096d420286160d | reduce (see tovu_tests)
jini_survivor: @jini-ai/devops/checks/coverage {applyBaseline, parseBaseline, serializeBaseline, DEFAULT_BASELINE_COMMENT, parseArgs, parseLcovBlocks, isPureReExportBarrelSource, classifyBlock, checkCoverageIntegrity, LcovBlock, BlockVerdict, GatedVerdict, IntegrityReport, BlockStatus, ParsedArgs} at packages/devops/src/checks/coverage/integrity.ts:8-192 | blob bee9aa26b883255df3c098bd19828b07bc051fde ; subpath barrel packages/devops/src/checks/coverage/index.ts:4 (`export * from './integrity.js'`) | blob 530c7716faeea26227ab79b3afa0f0cd8a347e5c
behaviour_diff:
  - args: Tovu positional (`classifyBlock(block, sourceText?)`, `checkCoverageIntegrity(text, readSource?)`, `parseArgs(argv)`, `parseBaseline(json)`, `serializeBaseline(paths, comment?)`, `applyBaseline(contaminated, set)`) / Jini object args + host `repoRoot` + `isFirstParty` classifier, `readSource({file})` / differs (call shape only; converted in binding)
  - SF path normalisation: Tovu `startsWith(REPO_ROOT)` then `path.relative` / Jini `toRepoRelative` with a `${root}/` boundary and `\`->`/` / differs only for an SF path that is a sibling dir sharing the root prefix (e.g. `<root>-other/x.ts`); Tovu lcov SF lines are repo-relative or under the root, so no output change. No test (unreachable input).
  - CRLF: Tovu splits on `^end_of_record$` without `\r\n` normalisation / Jini normalises first / differs only on CRLF lcov (Tovu never writes CRLF; Node's lcov writer emits LF). Improvement; no Tovu test.
  - non-first-party skip reason text: Tovu "not a first-party src/**, packages/*/src/**, or apps/*/src/** path" / Jini "not a first-party source path" / differs, but NO Tovu output prints a skip reason (main l.649-688 prints only `contaminated`; coverage-changed.ts:171-172 reads only `status === "contaminated"`). The Tovu test asserting the old text (test file l.176) is a Jini twin and is deleted (Jini integrity.test.ts pins the new text). No failing test.
  - barrel skip reason, contaminated/SEVERE reason text, MIN_DA 30 floor, wrapper names, applyBaseline `fails` rule, baseline JSON shape + sort, parseArgs grammar: same (bodies compared line by line)
  - errors: Tovu `parseBaseline` throws JSON.parse error / Jini same
real_caller_check: check-coverage-integrity.ts main() l.659 `checkCoverageIntegrity(readFileSync(lcovPath,"utf8"), readSourceFromDisk)` relies on `{contaminated, evaluated, skipped}` and verdict `.file/.reason/.severe`; coverage-changed.ts:171 relies on `verdict.status/.severe/.reason`. Jini returns the same shapes.
```

### binding (check-coverage-integrity.ts after the edit)
Keep l.1-161 (header) verbatim: it is Tovu history (Route A, `src/server/deps.ts:1048`, ADS report paths) and stays above the binding. Keep l.162-167 imports/REPO_ROOT/DEFAULT_LCOV_PATH. Then:

1. DELETE l.169-544 except the two Tovu-policy declarations below (WRAPPER_HELPER_NAMES + its doc l.169-172, MIN_DA_RECORDS_FOR_SEVERE_HEURISTIC + doc l.174-183, every interface/type, applyBaseline, parseBaseline, DEFAULT_BASELINE_COMMENT, serializeBaseline, ParsedArgs, parseArgs, parseLcovBlocks, toRepoRelative, EXPORT_FROM_STATEMENT, isPureReExportBarrelSource, classifyBlock, classifyWrapperFingerprint, checkCoverageIntegrity all go). KEEP:
   - `interface BaselineFile` (l.245-248, still read by handleUpdateBaseline for `_comment`), unexported.
   - `isFirstPartySourcePath` (l.363-372) + its doc: Tovu policy (which roots are first-party), still exported (coverage-changed.ts uses it).
   - Why-comments of deleted declarations: the doc blocks on l.169-171, 174-182, 221-234, 250-254, 260-266, 281-285, 297-304, 323-327, 374-397, 406-436, 526-531 have neutral equivalents already on the Jini declarations (`severeLineMergeReason`, `BARREL_SKIP_REASON`, `applyBaseline`, `parseBaseline`, `serializeBaseline`, `parseArgs`, `parseLcovBlocks`, `isPureReExportBarrelSource`, `checkCoverageIntegrity`) -> delete them with the code (COMMON rule 12 satisfied: the generic why already lives in Jini; Tovu-specific why is in the kept header).
2. ADD after the `pathToFileURL` import (l.164):
```ts
import {
  applyBaseline,
  checkCoverageIntegrity,
  DEFAULT_BASELINE_COMMENT,
  parseArgs,
  parseBaseline,
  serializeBaseline,
  type BlockVerdict,
  type GatedVerdict,
} from "@jini-ai/devops/checks/coverage";
```
3. ADD after `isFirstPartySourcePath`:
```ts
/** Host classifier handed to the shared detector: this repo's first-party roots (see above). */
function isFirstParty({ file }: { file: string }): boolean {
  return isFirstPartySourcePath(file);
}
```
4. Call-shape edits (exact old -> new):
   - `checkCoverageIntegrity(readFileSync(lcovPath, "utf8"), readSourceFromDisk)` -> `checkCoverageIntegrity({ lcovText: readFileSync(lcovPath, "utf8"), repoRoot: REPO_ROOT, isFirstParty }, { readSource: ({ file }) => readSourceFromDisk(file) })`
   - `serializeBaseline(knownPaths, existingComment ?? DEFAULT_BASELINE_COMMENT)` -> `serializeBaseline({ paths: knownPaths }, { comment: existingComment ?? DEFAULT_BASELINE_COMMENT })`
   - `return parseBaseline(readFileSync(resolvedBaselinePath, "utf8"));` -> `return parseBaseline({ baselineJson: readFileSync(resolvedBaselinePath, "utf8") });`
   - `parseArgs(process.argv.slice(2))` -> `parseArgs({ argv: process.argv.slice(2) })`
   - `applyBaseline(contaminated, loadBaselineSet(baselinePath))` -> `applyBaseline({ contaminated, baselineSet: loadBaselineSet(baselinePath) })`
   Every console line, exit code and the main guard (l.691) stay unchanged.

### importer_edits
- development/scripts/coverage-changed.ts:10: `import { parseLcovBlocks, classifyBlock, isFirstPartySourcePath } from "./check-coverage-integrity.js";` -> two lines: `import { classifyBlock, parseLcovBlocks } from "@jini-ai/devops/checks/coverage";` and `import { isFirstPartySourcePath } from "./check-coverage-integrity.js";`
- coverage-changed.ts:166: `for (const block of parseLcovBlocks(text)) {` -> `for (const block of parseLcovBlocks({ lcovText: text })) {`
- coverage-changed.ts:171: `const verdict = classifyBlock({ ...block, file: isFirstPartySourcePath(file) ? file : \`apps/cov1/src/${file}\` }, sources.get(file));` -> `const verdict = classifyBlock({ block: { ...block, file: isFirstPartySourcePath(file) ? file : \`apps/cov1/src/${file}\` }, repoRoot: repo, isFirstParty: ({ file: candidate }) => isFirstPartySourcePath(candidate) }, { sourceText: sources.get(file) });` (keep the two comment lines above it). If this pushes `integrityWarnings` past complexity 10, extract the classifier as a module-level `const isFirstParty = ({ file }: { file: string }) => isFirstPartySourcePath(file);`.

### tovu_tests (check-coverage-integrity.test.ts; before: 43 tests)
Honest-testing ledger: 43 -> 9 Tovu tests; the 34 deleted ones have a same-titled Jini twin in `packages/devops/src/checks/coverage/__tests__/integrity.test.ts` (verified by exact title match, 2026-11-16). Report the before/after counts.
- KEEP and convert call shapes (never drop an assertion; COMMON rule 20):
  1. "SEVERE requires at least 30 DA records and every hit count to match the wrapper" (Tovu-only)
  2. "CLI gates severe/new contamination and captures a usable exact baseline" (spawns the Tovu CLI; Tovu-only)
  3-5. the three `isPureReExportBarrelSource: … real platform/export/index.ts …`, `… real features/content-types/index.ts …`, `… real logic-bearing file …` tests (read real Tovu source files; Tovu-only)
  6-7. "isFirstPartySourcePath: true for src/**, …" and "isFirstPartySourcePath: false for node_modules, …" (Tovu policy function stays in Tovu)
  8. "real committed baseline: development/scripts/coverage-integrity-baseline.json is valid …" (reads Tovu's real ledger; Jini's twin reads a fixture copy)
  9. "classifyBlock: apps/admin/dist (build output, not apps/*/src/) is skipped -- the glob is src only" -> KEEP but rewrite its reason assertion ONLY if it asserts the Tovu skip text; it pins Tovu's classifier through `classifyBlock({block, repoRoot: REPO_ROOT, isFirstParty: ({file}) => isFirstPartySourcePath(file)})`.
  Imports become: `applyBaseline…` names from `@jini-ai/devops/checks/coverage` as each kept test needs; `isFirstPartySourcePath` from `../check-coverage-integrity.js`. Calls: `classifyBlock(x)` -> `classifyBlock({ block: x, repoRoot: REPO_ROOT, isFirstParty: ({ file }) => isFirstPartySourcePath(file) })`; `classifyBlock(x, src)` adds `, { sourceText: src }`; `isPureReExportBarrelSource(t)` -> `isPureReExportBarrelSource({ sourceText: t })`; `parseBaseline(j)` -> `parseBaseline({ baselineJson: j })`; `checkCoverageIntegrity(t, r)` -> `checkCoverageIntegrity({ lcovText: t, repoRoot: REPO_ROOT, isFirstParty: … }, { readSource: ({ file }) => r(file) })`.
- DELETE the other 34 (Jini twins). A kept test whose assertion cannot be expressed after conversion = STOP (rule 20).

```
why_moves: header l.1-161 -> stays in Tovu (Tovu history); declaration docs -> already neutral on Jini declarations (delete with code)
jini_test_text: -   (follow-up F-D03-1)
failing_test: -     (no output-visible difference; see behaviour_diff)
census: python3 M/scripts/census.py . development/scripts/check-coverage-integrity.ts | allowed: [coverage-changed.ts:10, __tests__/check-coverage-integrity.test.ts:20 (import) +:42 (spawn path), package.json:71, knip.json:26, coverage-integrity-baseline.json:14 (comment), apps/website/src/features/source-control/__tests__/commit-site-export-resolution.unit.test.ts:17 (comment)]
  then: rg -n "check-coverage-integrity.js\"" development apps -> only coverage-changed.ts and the test import isFirstPartySourcePath/nothing else
bundle_check: -
jini_msg: - | tovu_msg: "refactor(scripts): coverage-integrity gate runs on @jini-ai/devops/checks/coverage" | body "Tovu keeps the CLI, baseline file I/O, report wording and the first-party root policy; the detector is the shared one. Skip-reason text for non-first-party blocks now reads 'not a first-party source path' (never printed)."
```
Gate debt: record the eslint error count on untouched lines of check-coverage-integrity.ts and coverage-changed.ts before editing (coverage-changed.ts has `max-lines` debt).

---

## DD-coverage-2: route/area LCOV lib, floor, area floor, tier diff

```
id: DD-coverage-2
feature: audit:D03 development/scripts (coverage gates)
tovu_files:
  - development/scripts/route-coverage-lib.ts | blob 9da5b34cc0142f4f6ee59c0b3594588849678413 | reduce-to-binding
  - development/scripts/check-route-coverage-diff.ts | blob 3dfcfd7d710161a39484ca3f79bd8a762aea49d0 | reduce-to-binding
  - development/scripts/check-route-coverage-floor.ts | blob 3feffb9dfce513a33a0040655f93bd3c248abb7d | reduce-to-binding
  - development/scripts/check-area-coverage-floor.ts | blob 471f1ac696933c65d87e2129ccad1cba6d89cdd8 | reduce-to-binding
  - development/scripts/classify-coverage-gaps.ts | blob a15ed4e4a39a68ec3bef34af907b7496624e5453 | importer (type FileCoverage only)
  - development/scripts/__tests__/route-coverage-lib.test.ts | blob 0df7c8f7fd2031af3e37360149d7b7036b000e0d | edit (pct calls) + failing test F1
  - development/scripts/__tests__/check-route-coverage-diff.test.ts | blob 7eabcbac63bf648883dd4b492816919a6ca255ec | failing test F2
jini_survivor: @jini-ai/devops/checks/coverage {pct, loadLcov, loadRouteCoverage, isIntegrationTestFile, FileCoverage} at lcov.ts:20,107,112,40,3 | blob d85165ceae53ae4dc5d9b397c7cb9f1e4946f12e ; {evaluateFloor, evaluateArea, AreaFloor} at floors.ts:10,21,5 | blob f9ed06071d025ab71d368086b6ea1e60c84d912c ; {resolveBaseRef, evaluateFileTiers, TierResult, FileTierEvaluation} at diff.ts:11,44,5,6 | blob 9723e3b10043a340078cf82e26b68bdadc837102 ; {SourceReaderPort} re-exported by index.ts:6 from ports.ts:19 | blob c06f925dadf07d511de5357b5e6483e7f3c579ef
behaviour_diff:
  - pct args: Tovu `pct(hit, found)` / Jini `pct({ hit, found })` / same values
  - loadLcov missing file: Tovu throws "<path> does not exist. Run `npm run test:cov` first — …" / Jini propagates the reader's error / same once the Tovu reader throws that message (binding below)
  - loadLcov records: Tovu `{file,lf,lh,brf,brh,fnf,fnh}` / Jini same + optional `entries` when DA/BRDA/FN lines exist / differs only by an extra field; no Tovu caller deep-compares a record that has DA lines (route-coverage-lib.test l.105 fixture has none -> deepEqual still holds)
  - SF normalisation: see DD-coverage-1 (boundary + backslash; unreachable difference)
  - isIntegrationTestFile: Tovu `/\.integration\.test\.ts$/` or `includes("/__tests__/integration/")` / Jini endsWith(suffix) or `/${file}`.includes(`/__tests__/integration/`) / DIFFERS for a path that STARTS with `__tests__/integration/` (Jini true, Tovu false) -> F1
  - evaluateFloor vs route-floor main: same aggregation, same `${axis} X.XX% < floor Y%` wording; Jini also RangeErrors on a floor outside 0-100 (Tovu FLOOR is 99/68/93: unreachable). Empty set: Tovu prints its own FAIL text before aggregating; binding keeps that pre-check, so output same.
  - evaluateArea: Jini requires the prefix to match whole directories (`prefix/`) and takes the host classifier; Tovu `startsWith(prefix)` + its exclusions / same when every configured prefix ends with `/`; the floors file `development/scripts/area-coverage-floors.json` DOES NOT EXIST at b28d38c6 (the gate exits 1 "missing" today and is in no package.json script), so no configured prefix can differ. Empty-area failure text: Tovu `0 measurable files matched "<prefix>" -- lcov is empty/truncated, or the prefix is stale (directory renamed?)` / Jini `0 measurable files` -> binding rewrites that one failure to the Tovu text (copy stays Tovu).
  - evaluateFileTiers: Tovu prefers the unit record's brf when both tiers exist / Jini fails both tiers with "inconsistent branch totals between tiers" when unit.brf !== integration.brf / DIFFERS -> F2 (adopt Jini: a disagreeing static branch count means one LCOV is stale)
  - evaluateFileTiers missing detail: Tovu "no coverage record on either tier (never loaded by any src/server test)" / Jini "no coverage record on either tier" -> binding appends the Tovu parenthetical (copy stays Tovu); same output
  - resolveBaseRef: Tovu env/argv positional / Jini `({fallbackRef, remote}, {override, positional, pullRequestBase, eventBefore})`; zero-SHA check Tovu `=== 40 zeros`, Jini `/^0+$/` / differs only for a shorter all-zero string (GitHub never sends one); covered by F2b
real_caller_check: check-test-safety-diff.ts:21 imports `resolveBaseRef` (argv positional, reads the same env) -> Tovu keeps `resolveBaseRef(argv)` as the env-reading binding (not a forwarder: it owns the env names), so check-test-safety-diff.ts is untouched. classify-coverage-gaps.ts:68 calls `evaluateFileTiers(file, unitRec, integrationRec)` -> Tovu keeps that exported name/signature as the threshold+copy binding; untouched except its FileCoverage type import.
```

### failing tests FIRST (Tovu; not run; RED expected on the parent, GREEN on the commit)
F1 — append to `development/scripts/__tests__/route-coverage-lib.test.ts`:
```ts
test("isIntegrationTestFile: a repo-relative path that starts at __tests__/integration/ is integration (shared classifier)", () => {
  assert.equal(isIntegrationTestFile("__tests__/integration/boot.test.ts"), true);
});
```
F2 — append to `development/scripts/__tests__/check-route-coverage-diff.test.ts` (uses that file's existing `fileCoverage` helper):
```ts
test("evaluateFileTiers: tiers that disagree on the static branch total fail both tiers instead of trusting the unit record", () => {
  const result = evaluateFileTiers("src/server/routes/site/example.ts", fileCoverage({ brf: 100, brh: 100 }), fileCoverage({ brf: 90, brh: 90 }));
  assert.equal(result.ok, false);
  assert.equal(result.unit.detail, "inconsistent branch totals between tiers");
  assert.equal(result.integration.detail, "inconsistent branch totals between tiers");
});
test("evaluateFileTiers: no record on either tier keeps this repo's 'never loaded' explanation", () => {
  const result = evaluateFileTiers("src/server/routes/site/example.ts", undefined, undefined);
  assert.equal(result.unit.detail, "no coverage record on either tier (never loaded by any src/server test)");
});
```
F2b — same file, inside the existing env-isolation helper the other resolveBaseRef tests use (copy the pattern of the "all-zeros SHA" test l.60-66):
```ts
// GITHUB_EVENT_BEFORE = "0000000" (short all-zero) -> "origin/main"
```
(The second F2 test is GREEN on the parent too: it pins the copy the binding must keep.)

### tovu_reduced
**route-coverage-lib.ts** — keep header l.1-28, REPO_ROOT/LCOV_* constants + docs l.32-39, `isIntegrationTestFile` doc l.64-71, `MEASURABLE_ROUTE_PREFIXES` + doc l.78-104, `isMeasurableRouteFile` + doc l.56-63,106-115 (Tovu policy). Delete `FileCoverage` l.41-50, `pct` l.52-54, `toRepoRelative` l.117-121, `lcovField` + doc l.123-128, the loadLcov body. Imports become `import { existsSync, readFileSync } from "node:fs"; import path from "node:path"; import { isIntegrationTestFile as isSharedIntegrationTestFile, loadLcov as loadSharedLcov, type FileCoverage, type SourceReaderPort } from "@jini-ai/devops/checks/coverage";`. New bodies:
```ts
export function isIntegrationTestFile(relPath: string): boolean {
  return isSharedIntegrationTestFile({ file: relPath, suffixes: [".integration.test.ts"], directories: ["__tests__/integration"] });
}

/** Reads one LCOV artifact; a missing file names the command that produces it. */
const lcovReader: SourceReaderPort = {
  readText: ({ path: lcovPath }) => {
    if (!existsSync(lcovPath)) {
      throw new Error(
        `${lcovPath} does not exist. Run \`npm run test:cov\` first — these gates only parse its output, they do not run tests themselves.`
      );
    }
    return readFileSync(lcovPath, "utf8");
  },
};

export function loadLcov(lcovPath: string = LCOV_PATH): FileCoverage[] {
  return loadSharedLcov({ lcovPath, repoRoot: REPO_ROOT, reader: lcovReader });
}

export function loadRouteCoverage(lcovPath: string = LCOV_PATH): FileCoverage[] {
  return loadLcov(lcovPath).filter((record) => isMeasurableRouteFile(record.file));
}
```
(keep each existing doc comment above its function; the error string is copied from l.134-136 byte for byte — re-read it, do not retype.)

**check-route-coverage-diff.ts** — keep header l.1-71, constants l.85-88 (ZERO_SHA stays exported only if `rg -n ZERO_SHA development apps` shows another user; else drop the `export`), `changedRouteFiles` l.101-130 (git stays Tovu), `reportFileCoverage`, `main`, guard. Import list l.74-83: drop `pct`, `type FileCoverage`; add `import { evaluateFileTiers as evaluateSharedFileTiers, resolveBaseRef as resolveSharedBaseRef, type FileCoverage, type FileTierEvaluation } from "@jini-ai/devops/checks/coverage";`. Delete `TierResult`/`FileTierEvaluation` interfaces l.132-145 and `tierResult` l.147-151 (no re-export: `rg -n "TierResult|FileTierEvaluation" development` importers repoint their `type` import to `@jini-ai/devops/checks/coverage`; classify-coverage-gaps.ts:68 imports `type FileTierEvaluation` -> split into `import { evaluateFileTiers } from "./check-route-coverage-diff.js";` + `import type { FileTierEvaluation, FileCoverage } from "@jini-ai/devops/checks/coverage";`). New bodies:
```ts
export function resolveBaseRef(argv: string[]): string {
  return resolveSharedBaseRef({ fallbackRef: "origin/main", remote: "origin" }, {
    override: process.env.ROUTE_COVERAGE_DIFF_BASE,
    positional: argv[2],
    pullRequestBase: process.env.GITHUB_BASE_REF,
    eventBefore: process.env.GITHUB_EVENT_BEFORE,
  });
}

const NEVER_LOADED = "no coverage record on either tier";

export function evaluateFileTiers(
  file: string,
  unitRec: FileCoverage | undefined,
  integrationRec: FileCoverage | undefined
): FileTierEvaluation {
  const result = evaluateSharedFileTiers({ file, unitRec, integrationRec, thresholds: { unit: UNIT_BRANCH_THRESHOLD, integration: INTEGRATION_BRANCH_THRESHOLD } });
  if (result.unit.detail !== NEVER_LOADED) return result;
  const detail = `${NEVER_LOADED} (never loaded by any src/server test)`;
  return { ...result, unit: { ...result.unit, detail }, integration: { ...result.integration, detail } };
}
```
Keep the existing doc comments of resolveBaseRef/evaluateFileTiers; move the brf comment (l.~161-163 "brf is a static property…") up into the evaluateFileTiers doc and append "A disagreement between tiers therefore means one artifact is stale; the shared evaluator fails both."

**check-route-coverage-floor.ts** — import `{ evaluateFloor } from "@jini-ai/devops/checks/coverage"` + `{ loadRouteCoverage } from "./route-coverage-lib.js"`. Keep the empty-files pre-check and every console line. Replace the accumulation block (`let lf = 0` … `const funcs = pct(fnh, fnf);` and the three `if (… < FLOOR…) failures.push` lines) with `const { line, branch, funcs, failures } = evaluateFloor({ files, floors: FLOOR });` placed where `const line` was; the three `console.log` lines and the failure printing are unchanged.

**check-area-coverage-floor.ts** — imports: `import { evaluateArea as evaluateSharedArea, type AreaFloor, type AreaFloorResult, type FileCoverage } from "@jini-ai/devops/checks/coverage";` and `import { loadLcov, REPO_ROOT } from "./route-coverage-lib.js";`. Delete local `AreaFloor` (l.52-57) and `AreaResult` (l.81-88); `FloorsFile.areas` becomes `readonly AreaFloor[]`. Keep `isMeasurableAreaFile` (Tovu exclusions: `__tests__`, `__measurements__`, test suffixes, deps/execution-deps/types). New body:
```ts
export function evaluateArea(area: AreaFloor, all: readonly FileCoverage[]): AreaFloorResult {
  const result = evaluateSharedArea({ area, all, isMeasurable: ({ file }) => isMeasurableAreaFile(file, area.prefix) });
  if (result.count !== 0) return result;
  return { ...result, failures: [`0 measurable files matched "${area.prefix}" -- lcov is empty/truncated, or the prefix is stale (directory renamed?)`] };
}
```
Keep the "Zero measurable files is never a legitimate pass" comment above it. `main` output unchanged.

**route-coverage-lib.test.ts** — `pct(3, 8)` -> `pct({ hit: 3, found: 8 })`, `pct(0, 0)` -> `pct({ hit: 0, found: 0 })`, and its import of `pct` moves to `@jini-ai/devops/checks/coverage`. Every other test there stays as written.

```
why_moves: route-coverage-lib header + MEASURABLE_ROUTE_PREFIXES doc (2026-09-03 gap history) -> stay in Tovu; pct/lcov parsing docs -> already neutral in Jini lcov.ts; brf comment -> Tovu evaluateFileTiers doc
jini_test_text: -
census: python3 M/scripts/census.py . development/scripts/route-coverage-lib.ts ; same for check-route-coverage-diff.ts | allowed: [list-server-test-files.ts:25, check-route-coverage-diff.ts:74-83, classify-coverage-gaps.ts:62-68, check-route-coverage-floor.ts:24, check-area-coverage-floor.ts:48, check-test-safety-diff.ts:21, __tests__/route-coverage-lib.test.ts:8, __tests__/check-route-coverage-diff.test.ts, __tests__/list-server-test-files.test.ts:7, lib/dead-path-sweep.ts + __tests__/dead-path-sweep.test.ts (comment/fixture strings only), knip.json:37-38, package.json:76-77]
bundle_check: -
jini_msg: - | tovu_msg: "refactor(scripts): route/area coverage gates use @jini-ai/devops/checks/coverage" | body "Tier evaluation now fails a file whose unit and integration LCOVs disagree on its branch total (was: trusted the unit record). A path starting at __tests__/integration/ now classifies as integration."
```

---

## SLICE 3 — BLOCKED (owner question): changed-file / all-file coverage reports
Files: `coverage-changed.ts` (482), `coverage-changed-model.ts` (460), `coverage-all-files.ts` (345) [+ `coverage-changed-discovery.ts`, which is audit **D04** ACCEPT-LATER -> AI-Dev-Shop toolkit].
What is generic: `mergeLcov` (entry-level LCOV union keyed by function identity; twin of Jini `mergeCoverage` but keyed differently and path-normalising), `analyzeSource` type-only detection + branch-arm estimates, `buildReport`/`renderReport` (all-file table with NEVER-LOADED rows), `evaluateFiles`/`summarizeFiles`/`renderFixPrompt`.
What is Tovu: runner selection (`node`/`admin`/`desktop-*`), `TEST_PASSES` from apps/desktop, `GATE`/`COMMON` ADS paths, area mapping.
**OWNER QUESTION (BLOCKED):** do the changed-file and all-file coverage *reports* go to `@jini-ai/devops/checks/coverage` (new `report` module: union + never-loaded estimates + markdown rendering), or with D04 (changed-test discovery) to the **AI-Dev-Shop toolkit** (AUDIT-ADDITIONS owner question 1 groups test-rigor / coverage-changed discovery there)? `coverage-changed.ts` cannot be split without D04's discovery module, so the reports should follow D04's answer. Recommendation: AI-Dev-Shop with D04; then only `mergeLcov` -> Jini `mergeCoverage` is a candidate DEDUPE here, and its key/normalisation differences (function key by `(line,name)` ordinal vs Jini's unambiguous-declaration rule, which throws on duplicate names) make it a HARDEN needing an Opus parity list. No sheet until answered.
