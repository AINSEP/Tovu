# Terra job size-31: split 4 Jini file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Jini clone you are given (Jini only; never edit Tovu). `TOVU` below = the Tovu clone path the coordinator gives you (only for the read-only `outline.mjs` tool). Run `pnpm install --frozen-lockfile` once if `node_modules` is missing.

READY: these files are not reshaped by the Tovu→Jini move.

## Rules
Owner-approved 2026-11-13. These rules are binding for every `size-NN` job and every hard-file plan.
They are inlined into each Terra prompt, so a job needs nothing else.

## Limits and how lines are counted
- A file is over when it has more than **500** counted lines; a function (incl. a React component, hook,
  method, arrow) when it has more than **100**. Counted = non-blank after comments are removed (ESLint
  `max-lines` / `max-lines-per-function` with `skipBlankLines` + `skipComments`). Nested functions count
  on their own, and they also count inside their parent.
- Measure and check with the outline tool (read-only, TypeScript from `<root>/node_modules`):
  `node <TOVU>/development/refactor-patterns/size-splits/outline.mjs --root <repo with node_modules> <file>` prints
  every top-level declaration (range, counted lines, same-file names it uses) and, for each function over
  100, its body statements with `decl:` (locals it creates) and `uses:` (earlier locals/params it reads).
  `--check <files...>` prints only what is still over and exits 1 if anything is.
- Exempt (never split): `development/scripts/size-exceptions.json` (locale `*-i18n.ts(x)`, `i18n-common.ts`,
  `*.generated.*`, `migration(s)/`, plus listed entries). `composition/deps.ts` and `composition/app.ts`
  are NOT exempt.

## What a split is
1. **Split by responsibility, never by line number.** Each new module does one job you can name in a few
   words (its file name says it). Each helper does one step you can name. If a piece has no nameable job,
   it stays where it is.
2. **A long function becomes helper functions in the SAME file.** Helpers go at module level directly
   above the function they came from, in the order they run. A step that needs many of the function's
   locals becomes a helper that takes them as one object; for a React hook, a group of state + effects
   becomes a sub-hook `useXxx` in the same file. Only when the file itself is then over 500 do helpers
   move to a sibling file (as the plan says).
3. **A long file splits into sibling modules** in the same folder, named `<original-stem>-<job>.ts(x)`
   (or the name the plan gives). The original file keeps its own name and its main job, and imports
   what moved. No new folder unless the plan says so.
4. **Imports follow the move.** Every importer of a moved export imports it from its new module
   (find them with `rg -n "from ['\"].*<old-stem>(\.js)?['\"]"` across the repo, tests included). The old
   file does NOT re-export moved names — except when the old file is a package entry (a target in a
   `package.json` `exports` map, or an `index.ts` that is one): then it keeps `export { x } from "./new.js"`
   so the public API is unchanged.
5. **No import cycles.** A new module never imports the file it was cut out of. Types both sides need move
   into the new module (or a `<stem>-types.ts` sibling when the plan says so).
6. **Behaviour does not change.** Same statements, same order, same awaits, same error text, same exports
   from the package. Only what crosses a new boundary changes: locals become parameters / return values.
   Do not "improve" code you move.
7. **"Why" comments move with their code** — word for word, including the comment above a moved
   statement and the file header paragraph that explains a moved part (copy that paragraph into the new
   file's header; keep the original header's other paragraphs).
8. **Arguments: `(required, optional = {})`.** A new helper takes ONE destructured object of required
   inputs and, only if it has optional inputs, a second object defaulting to `{}`:
   `function applyRow({ row, store }: ApplyRowInput, { signal }: ApplyRowOptions = {}): Promise<void>`.
   No new positional primitive parameters. Name the input type `<Helper>Input` (and `<Helper>Options`)
   unless the plan names it. Sub-hooks follow the same rule.
9. **React components take props only.** State, effects, refs, callbacks and data loading live in
   `<Component>.hooks.ts` (or the existing hooks file the plan names). A component split into
   sub-components passes plain props; a sub-component never receives the whole hook result object unless
   the plan says so.
10. **Banned:** `eslint-disable` (any form), `as any`, `as unknown as`, non-null `!`, `@ts-ignore`,
    `@ts-expect-error`. If a type does not line up after a move, export the existing type from where it
    lives — never loosen it. A pre-existing `eslint-disable-next-line` / `biome-ignore` on a moved line moves
    with that line unchanged (the diff shows it moved, not added); never add a new one.
11. **Tests are not edited**, except an import path of a moved symbol. Before moving an export, run
    `rg -n "vi\.mock\(|mock\.module\(|jest\.mock\(" <test dirs of the file>`: if a test mocks the OLD module
    path and the code under test now gets the moved symbol from the NEW module, the mock stops applying —
    move the mock path in that test to the new module (the only other allowed test edit) and say so in the
    report.

## Running checks (no suites, nothing left running)
- Run ONLY the test files the plan lists for each file, one at a time, after that file is done:
  - Tovu `apps/website`, `packages/*`, `content/*`, `apps/site-chat`:
    `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <test file>`
  - Tovu `apps/admin`: `cd apps/admin && npx vitest run <path relative to apps/admin> --maxWorkers=2`
  - Tovu `apps/desktop` main (`src/` outside `renderer/`, `contracts/`):
    `cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=1 <file>`
  - Tovu `apps/desktop` renderer/contracts: `cd apps/desktop && node --import ./scripts/one-react.ts --import tsx --test --test-concurrency=1 <file>`
  - Jini: `pnpm --filter <package name> exec vitest run <path relative to the package> --maxWorkers=2`, then
    `pnpm --filter <package name> run typecheck` once per touched package (Jini packages are small enough).
- Tovu: no full `tsc` (admin tsc needs 2+ GB). Run `npx eslint <changed files>` (no new errors, no
  `max-lines`/`max-lines-per-function` warnings left on the planned items).
- Done check per file: `outline.mjs --check <original file> <new files>` → every planned item `OK`
  (an item the plan says stays over, e.g. an owner exception candidate, is listed in the report).
- No watch modes, no dev servers, no suites; kill nothing you did not start; leave nothing running.

## Commit and report
- One commit per file (or per tightly coupled pair the plan names), by explicit paths only:
  `git add -- <paths> && git commit -F msg -- <paths>`; message `refactor(<area>): split <file> by responsibility (size)`.
  Never push, never `git add -A`, never stash or checkout other files.
- If a plan step cannot be done as written (an anchor is missing, a cycle appears, a test fails and
  the cause is the split), stop that file, revert only that file's uncommitted changes
  (`git restore -- <its paths>`, delete its new files), and report it — never improvise a different split.
- Report: per file `OK` / `STOPPED (reason)`, new files, before → after counted lines, tests run with
  pass/fail counts, and any test-mock path you moved.

## For each file, in the order listed
1. `node $TOVU/development/refactor-patterns/size-splits/outline.mjs --root <repo with node_modules> <file>` — confirm every declaration / statement anchor the plan names exists. A missing anchor = STOP this file.
2. Complete the test list: `rg -l "<file stem>" <app or package dir> --glob '*.test.*'` (colocated tests are easy to miss); add any hit that exercises the file.
3. Run those tests once BEFORE editing (baseline). A test already failing is noted and compared after; it is not yours to fix.
4. Do the plan's steps in order. After the file: tests again (same pass count), `npx eslint <changed files>`, `outline.mjs --check <original> <new files>`, Jini: the package typecheck. Then commit that file.
5. Worked example of the expected style: `development/refactor-patterns/size-splits/EXAMPLE.md` in the Tovu clone (optional reading).

## Files
### jini:packages/agent-plugins/src/lifecycle/resolve-agent-plugin-refs.ts
- **Over:** `buildModule` 154
- **Phase:** now · **Batch:** size-31
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/resolve-agent-plugin-refs.unit.test.ts`, `.../ref-read-failure-m1.unit.test.ts`, `.../bundled-digests.unit.test.ts`, `.../layout-b-persistent-state.unit.test.ts`, `packages/agent-plugins/src/lifecycle/__tests__/type-cycles.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Pattern:** same as `activation.ts` fragment — `buildModule(ports)` is a per-host closure module (memoised in `instances`); keep ONE `buildModule` per instance that composes module-level ports-scoped sub-factories, each called ONCE inside it, so per-instance state stays per instance. Existing inner functions keep their signatures and comments verbatim. The outline `uses` lists only earlier locals — grep every moved body for later-declared (hoisted) callees and for each bound fs alias it reads, and pass those in.
- **Splits:**
  1. SUB-FACTORY `createInstalledRefLookup({ ports, stat, indexInstalledRoot, preferBundledAgentPluginDigests }: CreateInstalledRefLookupInput): { listInstalledPlugins; isInstalledDigestPresent; resolveOnePluginRef }` ← those three (~50). Job: find installed revisions for a ref (zero/one/many rules).
  2. SUB-FACTORY `createInjectedSections({ ports, persistentState, readInstalledSkillFile }: CreateInjectedSectionsInput): { buildInjectedSection; buildPointerSection; renderSkillInventory }` ← `instructionNotes`, `buildInjectedSection`, `renderSkillInventory`, `buildPointerSection` (~57). Job: render inject/pointer text.
  3. `buildModule` keeps the module wiring, `resolveAgentPluginDeliveryMode`, `resolveAgentPluginRefs`, `resolveAgentPluginSelection`, `activationRefusal`, return (same four names).
- **Importers to update:** none.
- **After:** `buildModule` ~60; sub-factories ~50 / ~57.
- **Risks / notes:** `resolveAgentPluginSelection` probably calls `resolveOnePluginRef`/`buildInjectedSection` (hoisted) — destructure them from the sub-factories at the top of `buildModule`.

### jini:packages/agent-plugins/src/lifecycle/seed-bundled.ts
- **Over:** `buildModule` 118
- **Phase:** now · **Batch:** size-31
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/seed-bundled-edges.unit.test.ts`, `.../seed-bundled-preserve.unit.test.ts`, `.../module-memoisation.unit.test.ts`, `.../lifecycle-reconciliation.unit.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Pattern:** same as `activation.ts` fragment — `buildModule(ports)` is a per-host closure module (memoised in `instances`); keep ONE `buildModule` per instance that composes module-level ports-scoped sub-factories, each called ONCE inside it, so per-instance state stays per instance. Existing inner functions keep their signatures and comments verbatim. The outline `uses` lists only earlier locals — grep every moved body for later-declared (hoisted) callees and for each bound fs alias it reads, and pass those in.
- **Splits:**
  1. SUB-FACTORY `createSeedBookkeeping({ ports, readdir, stat, recordBundledAgentPluginDigests, assertAgentPluginActivationsWritable }: CreateSeedBookkeepingInput): { recordSeededDigests; activationsRefusal; listBundledPluginDirs }` ← those three (~45). Job: pre-flight refusal, source dir listing, digest ledger record.
  2. `buildModule` keeps wiring, `seedBundledAgentPlugins`, `seedOne`, return.
- **Importers to update:** none.
- **After:** `buildModule` ~78; sub-factory ~47.
- **Risks / notes:** the "OWN manifest name" comment stays with `seedOne`.

### jini:packages/agent-plugins/src/lifecycle/uninstall.ts
- **Over:** `buildModule` 180
- **Phase:** now · **Batch:** size-31
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/uninstall.unit.test.ts`, `.../uninstall-fault-injection.unit.test.ts`, `.../update.unit.test.ts` (uses `stageForRemoval`/`restoreStagedTrees`) (pkg `@jini-ai/agent-plugins`)
- **Pattern:** same as `activation.ts` fragment — `buildModule(ports)` is a per-host closure module (memoised in `instances`); keep ONE `buildModule` per instance that composes module-level ports-scoped sub-factories, each called ONCE inside it, so per-instance state stays per instance. Existing inner functions keep their signatures and comments verbatim. The outline `uses` lists only earlier locals — grep every moved body for later-declared (hoisted) callees and for each bound fs alias it reads, and pass those in.
- **Splits:**
  1. MODULE-LEVEL pure verbatim above `buildModule`: `UninstallTargets` interface, `STAGED_DIRNAME_PREFIX`, `assertMemoryDeletionConfirmed`, `isAncestorStillInUse`, `assertUnchangedSincePreview` (~30).
  2. SUB-FACTORY `createStagedTreeOps({ randomUUID, stat, chmod, rename, rm, readdir }: CreateStagedTreeOpsInput): { stageForRemoval; restoreStagedTrees; removeFrozenPackageTree }` ← those + `makeTreeWritable` (~55). Job: reversible staging + frozen-tree removal (shared with update.ts via the return).
  3. SUB-FACTORY `createUninstallTargets({ ports, listInstalledPlugins, isAgentPluginRecordedAsBundled, resolveAgentPluginActivation }: CreateUninstallTargetsInput): { resolveUninstallTargets }` ← `resolveUninstallTargets`, `bundledRefusalMessage`, `malformedEntryRefusalMessage` (~33). Job: target lookup + refusals.
  4. `buildModule` keeps wiring, preview/uninstall/unlocked, `stageAndDeleteActivation`, `removeEmptyPackageAncestors`, `deletePersistentMemory`, return (same five names).
- **Importers to update:** none.
- **After:** `buildModule` ~75; sub-factories ~57 / ~35.
- **Risks / notes:** comments referring to "this file's header" stay valid (same file).

### jini:packages/agent-plugins/src/lifecycle/update.ts
- **Over:** `createUpdateModule` 204
- **Phase:** now · **Batch:** size-31
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/update.unit.test.ts`, `.../lifecycle-reconciliation.unit.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Pattern:** same as `activation.ts` fragment — `buildModule(ports)` is a per-host closure module (memoised in `instances`); keep ONE `buildModule` per instance that composes module-level ports-scoped sub-factories, each called ONCE inside it, so per-instance state stays per instance. Existing inner functions keep their signatures and comments verbatim. The outline `uses` lists only earlier locals — grep every moved body for later-declared (hoisted) callees and for each bound fs alias it reads, and pass those in. (here the closure is the exported `createUpdateModule(ports, optional)`.)
- **Splits:**
  1. MODULE-LEVEL pure verbatim above: `admissionWarnings`, `isPluginStateRoot`, `errorCode` (+ `disableBeforeSwitch`/`rollBackAfterFailure` only if their bodies read no factory locals) (~16-30).
  2. SUB-FACTORY `createUpdateRecovery({ ports, activation, removal, index, persistent }: CreateUpdateRecoveryInput): { setActivation; restoreUpdate; reconcileAgentPluginUpdates }` ← `setActivation`, `restoreUpdate`, `restoreOldBytes`, `reprovisionOld`, `reconcileAgentPluginUpdates`, `listPluginStateIds`, `reconcilePlugin`, `switchOffUnrecovered` (~78). Job: idempotent boot/rollback recovery.
  3. SUB-FACTORY `createUpdateSwitch({ ports, removal, recovery }: CreateUpdateSwitchInput): { performUpdate }` ← `performUpdate`, `beginJournal`, `switchRevision`, `freezeRollback` (+ `disableBeforeSwitch`, `rollBackAfterFailure` if not moved in 1) (~60). Job: journaled revision switch.
  4. `createUpdateModule` keeps wiring, `updateAgentPlugin`, `updateLocked`, `readTarget`, return (same two names).
- **Importers to update:** none.
- **After:** `createUpdateModule` ~60; sub-factories ~78 / ~60; file ~265.
- **Risks / notes:** `switchRevision` / `rollBackAfterFailure` call recovery functions (hoisted) — take them from `recovery`.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/agent-plugins/src/lifecycle/resolve-agent-plugin-refs.ts packages/agent-plugins/src/lifecycle/seed-bundled.ts packages/agent-plugins/src/lifecycle/uninstall.ts packages/agent-plugins/src/lifecycle/update.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
