# Terra job size-23: split 4 Jini file(s) by responsibility (size limits)

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
### jini:packages/sandbox/src/e2b/wrap-e2b-sandbox.ts
- **Over:** `wrapE2bSandbox` 197
- **Phase:** now · **Batch:** size-23
- **Tests:** `src/e2b/__tests__/wrap-e2b-sandbox.test.ts`, `src/e2b/__tests__/mount-characterization.test.ts`, `src/e2b/__tests__/provider.test.ts` (`pnpm --filter @jini-ai/sandbox exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | config destructure, root `try {`, listener/mount maps, `fingerprint`, `trackedProcesses`, `return {` short props | session wiring (stays) |
| B | `let watchHandle` + `try { watchHandle = await handle.files.watchDir(` … `catch` | start the project-root watcher (echo-suppressing) |
| C | prop `mountFiles` (31) | mount files with rollback |
| D | prop `installDependencies` (16), prop `startProcess` (33) | process execution |
| E | prop `teardown` (19) | kill tracked processes + stop watcher |

- **Splits** (module level above `wrapE2bSandbox`):
  1. HELPER `startProjectWatch({ handle, projectRoot, fileChangeListeners, mountingPaths, mountedFiles, fingerprint }: StartProjectWatchInput): Promise<E2bWatchHandle>` ← the whole `try { … } catch (error) { throw wrapE2bError(error, 'Failed to start watching the sandbox project root'); }` block, returning the handle. `type E2bWatchHandle = Awaited<ReturnType<E2bSandboxHandle['files']['watchDir']>>`. Main: `const watchHandle = await startProjectWatch({ … });` (the `let` becomes `const` only if nothing reassigns it later — check `teardown`; otherwise keep `let watchHandle = await …`).
  2. HELPER `mountSessionFiles({ session, input }: MountSessionFilesInput)` ← body of prop `mountFiles`.
  3. HELPER `installSessionDependencies({ session, input })` ← body of `installDependencies`; `startSessionProcess({ session, input })` ← body of `startProcess`.
  4. HELPER `teardownSession({ session, watchHandle })` ← body of `teardown`.
  `session` = one object built once in main: `{ handle, projectRoot, fingerprint, mountedFiles, mountingPaths, trackedProcesses, fileChangeListeners }` typed `E2bSession` (interface declared above the helpers). `input` = the prop's existing parameter(s) as one object (if a prop takes several positional params, name them as fields). Return types inferred/kept as today.
- **Importers to update:** none.
- **After:** file ~300; `wrapE2bSandbox` ~80; helpers ≤ 40.
- **Risks / notes:** `provider.test.ts` does `vi.mock('../wrap-e2b-sandbox.js', …)` — it replaces the whole module; no export moves, so unaffected. Keep the "watcher carries no writer identity" and "Every process this session has started" comments with their maps. The initial `try {` (L176-180) stays first.

### jini:packages/search/src/indexer.ts
- **Over:** `createSearchIndexer` 239
- **Phase:** now · **Batch:** size-23
- **Tests:** `src/__tests__/indexer.test.ts`, `src/__tests__/exports.test.ts` (`pnpm --filter @jini-ai/search exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | destructures, `resolve`, `currentTargets`, `return {` | indexer wiring + entry points (stays) |
| B | `planRow`, `putPlan`, `freshRecords`, `settleCall`, `writeChunks`, `writeToTarget` | write records to one target |
| C | `settleObserved`, `settledRow`, `settleTask`, `checkRevisions`, `checkChunk`, `settleInFlight`, `rewriteRow`, `reconcileTarget` | reconcile in-flight / failed rows |
| D | `scanSource`, `promote`, `dropRetired`, `backfillTarget`, `readMarks` | backfill + target promotion/retirement |

- **Splits** (module level above `createSearchIndexer`, order B, C, D):
  1. HELPER `createTargetWriter({ state, now, resolve }: CreateTargetWriterInput): { writeToTarget }` ← `const planRow =` through `const writeToTarget =` (keep every "why" comment). `resolve: (target: SearchTarget, workspaceId: string) => Promise<Resolved | null>`.
  2. HELPER `createTargetReconciler({ state, now, sources, maxAttempts, resolve, writeToTarget }: CreateTargetReconcilerInput): { reconcileTarget }` ← `const settleObserved =` (L114, with its CAS comment — it moves out of its original position before `freshRecords`; it is a `const` arrow only used by C, so no order effect) plus `const settledRow =` through `const reconcileTarget =`. Include `writeToTarget`/`putPlan` only if `rewriteRow`/`reconcileTarget` read them (outline truncates — check).
  3. HELPER `createTargetBackfill({ state, targets, sources, scanPageSize, resolve, writeToTarget }: CreateTargetBackfillInput): { promote; dropRetired; backfillTarget; readMarks }` ← `const scanSource =` through `const readMarks =`.
  4. Main: destructures, `resolve`, `currentTargets`, the three helper calls (B, C, D), `return {` unchanged.
- **Importers to update:** none.
- **After:** file ~315; `createSearchIndexer` ~70; `createTargetReconciler` ~82; `createTargetWriter` ~62; `createTargetBackfill` ~55.
- **Risks / notes:** helper types `Resolved`, `Plan`, `Settle`, `WriteTally`, `Watermark` are module-level already. `state`/`targets`/`sources` typed via `SearchIndexerRequired['state']` etc.

### jini:packages/server/src/builtin-features.ts
- **Over:** file 566 lines · `createBuiltInFeatures` 426
- **Phase:** now · **Batch:** size-23
- **Tests:** `src/__tests__/builtin-features.test.ts`, `src/__tests__/builtin-features.mounts.test.ts`, `src/__tests__/delegated-principal.security.test.ts`, `src/__tests__/compose-jini-kernel.test.ts` (`pnpm --filter @jini-ai/server exec vitest run <path> --maxWorkers=2`), then `pnpm --filter @jini-ai/server run typecheck`.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| S | `LOCAL_DAEMON_PRINCIPAL`, `require`, `packageVersion`, `ANONYMOUS_DELEGATED_PRINCIPAL`, `resolveDelegatedToolPrincipal`, `BuiltInFeatureOptions`, `requireOptions`, `requireSqlite`, `buildDaemonDbOperations`, `isExecutableDetectedAgent`, `projectAgentDiagnostic`, `projectDetectedAgent` | shared feature support: identities, options type, guards, projections |
| D | `healthFeature`, `runsFeature`, `agentsFeature`, `daemonDbFeature`, `remoteRunEventsFeature`, `daemonStatusFeature` | daemon/process features |
| T | `hostToolsFeature`, `modelProxyFeature`, `activeContextFeature`, `terminalFeature`, `toolCatalogFeature`, `resolveDelegatedPrincipal` + `delegatedToolCallsFeature`, `connectorsFeature`, `researchFeature` | tool-surface features |
| V | `xaiFeature`, `memoryFeature`, `routinesFeature`, `mediaFeature`, `frontendSessionsFeature` | service features |
| M | `createBuiltInFeatures` + its `return [` list | the catalog (stays) |

- **Splits:**
  1. NEW `builtin-features-support.ts` — job: shared feature support. Moves unit S verbatim (all exports kept; `requireOptions`, `requireSqlite`, `packageVersion` now exported for the siblings). Header "why" comments on each move with it.
  2. NEW `builtin-features-daemon.ts`, `builtin-features-tools.ts`, `builtin-features-services.ts` — job: daemon / tool-surface / service features. Each feature becomes an exported factory in its module: `createHealthFeature({ options }: BuiltInFeatureFactoryInput): JiniFeature` whose body is `return defineJiniFeature({ … })` with the original object verbatim (features that do not read `options` — `modelProxy`, `activeContext`, `toolCatalog`, `connectors`, `research` — take no parameter). `createDelegatedToolCallsFeature({ options })` starts with the moved `const resolveDelegatedPrincipal = options.delegatedToolCalls?.resolvePrincipal;`. `BuiltInFeatureFactoryInput = { options: BuiltInFeatureOptions }` declared in the support module. Return type = whatever `defineJiniFeature` returns (use `ReturnType<typeof defineJiniFeature>` if no named type exists). Siblings import from `./builtin-features-support.js` only.
  3. `builtin-features.ts` keeps `createBuiltInFeatures(options: BuiltInFeatureOptions = {})` (+ its doc comment): one `const xFeature = createXFeature(…)` per feature in the ORIGINAL order, then the `return [` list unchanged.
- **Importers to update:** `src/index.ts` (`BuiltInFeatureOptions` type, `ANONYMOUS_DELEGATED_PRINCIPAL`, `LOCAL_DAEMON_PRINCIPAL` → `./builtin-features-support.js`; `createBuiltInFeatures` stays); `src/create-local-node-daemon.ts` (L49 `type BuiltInFeatureOptions` and L63 re-export `buildDaemonDbOperations, projectDetectedAgent` → `./builtin-features-support.js`); `src/compose-jini-kernel.ts` (`type BuiltInFeatureOptions` → support; `createBuiltInFeatures` stays); tests: `builtin-features.test.ts` (`projectDetectedAgent` → `../builtin-features-support.js`), `builtin-features.mounts.test.ts` (all three names → support), `delegated-principal.security.test.ts` (`resolveDelegatedToolPrincipal` → support).
- **After:** `builtin-features.ts` ~50; `createBuiltInFeatures` ~45; `builtin-features-support.ts` ~145; `-daemon.ts` ~175; `-tools.ts` ~165; `-services.ts` ~95; each factory ≤ 36.
- **Risks / notes:** features are built eagerly today in order; keep the call order identical (some `defineJiniFeature` calls may validate at construction). `require`/`packageVersion` use `createRequire(import.meta.url)` — the relative `package.json` path must still resolve from the new file's folder (same folder, so unchanged).

### jini:packages/server/src/create-local-node-daemon.ts
- **Over:** `createLocalNodeDaemon` (implementation overload) 113
- **Phase:** now · **Batch:** size-23
- **Tests:** `src/__tests__/create-local-node-daemon.test.ts`, `src/__tests__/create-local-node-daemon.headers.test.ts`, `src/__tests__/kernel-runtime.test.ts` (`pnpm --filter @jini-ai/server exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `host`, `env`, port/registry locals, lets, `app`, `kernel = await composeJiniKernel({`, `activeFeatures`, final `return await new Promise<LocalNodeDaemon>(` | boot + listen orchestration (stays) |
| B | the async IIFE inside `stop()` | ordered shutdown: close server, dispose features/packs, remove registry record, onShutdown, close base |
| C | `const listen = (): Promise<Server> =>` | bind the HTTP listener |

- **Splits** (module level above the overloads of `createLocalNodeDaemon`):
  1. HELPER `shutDownLocalDaemon({ server, kernel, registryPath, config }: ShutDownLocalDaemonInput): Promise<void>` ← the body of the `(async () => { try { await closeHttpServer(server); } finally { … } })()` IIFE (verbatim, including the empty `.catch(() => { … })` comment). `stop()` becomes: `shuttingDown = true; if (!stopPromise) { stopPromise = shutDownLocalDaemon({ server, kernel, registryPath, config }); } return stopPromise;`. Types: `server: Server`, `kernel: Awaited<ReturnType<typeof composeJiniKernel>>`, `registryPath: string | null`, `config: CreateLocalNodeDaemonConfig<readonly AnyPack[], string>`.
  2. HELPER `listenLocalDaemon({ app, requestedPort, host }: ListenLocalDaemonInput): Promise<Server>` ← body of `listen`; main keeps `const listen = (): Promise<Server> => listenLocalDaemon({ app, requestedPort, host });`.
- **Importers to update:** none.
- **After:** file ~290; `createLocalNodeDaemon` ~88; helpers ~20 / ~14.
- **Risks / notes:** `server` is a `let` assigned in the final Promise; it is read when `stop()` runs (same as the IIFE reading it synchronously at its start) — unchanged semantics. Keep `stopPromise` memoization in `stop()`.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/sandbox/src/e2b/wrap-e2b-sandbox.ts packages/search/src/indexer.ts packages/server/src/builtin-features.ts packages/server/src/create-local-node-daemon.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
