# Terra job size-30: split 4 Jini file(s) by responsibility (size limits)

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
### jini:packages/platform/src/fs/directory-user-config.ts
- **Over:** `createDirectoryUserConfig` 146
- **Phase:** now · **Batch:** size-30
- **Tests:** `src/fs/__tests__/directory-user-config.test.ts`, `src/fs/__tests__/user-data-config.test.ts` (`pnpm --filter @jini-ai/platform exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `directories` … `legacyHomes`, `stored`, `syncProvider`, `read`, `configuredRoots` | resolve paths + read settings (stays) |
| B | `assertDirectories`, `assertNotOverridden`, `merged`, `update`, `updateRoots` | validate + write settings |
| C | `moveMarker`, `authoritativeCopy`, `recoveredMove`, `existingCopy`, `unsafeIdentityPath`, `databasePath` | locate a site database across folder moves |
| D | `return {` | surface (stays) |

- **Splits** (module level above `createDirectoryUserConfig`):
  1. HELPER `createUserConfigWriter({ file, stored, read, expand, distinct, exists, isDirectory, env, envName, policy, … }: CreateUserConfigWriterInput): { update; updateRoots }` ← `function assertDirectories(` (with its "Prefer explicit settings" comment) through `function updateRoots(`. The input holds exactly the closure names those five bodies read (the outline truncates `update`'s list — read ~L117-L139 once; include `configuredRoots`/`removeFile`/`report` if read). Types: `DirectoryUserConfig`, `DirectoryUserConfigPolicy`, and explicit function types, e.g. `stored: (locked?: boolean) => Partial<DirectoryUserConfig>`, `read: (required: Record<string, never>, options?: object) => DirectoryUserConfig`, `expand: (value: string) => string`, `distinct: (values: readonly string[]) => string[]`.
  2. HELPER `createDatabaseLocator({ fileAt, read, exists, report, directories }: CreateDatabaseLocatorInput): { databasePath }` ← `function moveMarker(` (with its "A move journal is written before copying" comment) through `function databasePath(`. Same input rule.
  3. Main destructures `{ update, updateRoots }` and `{ databasePath }` after `read`/`syncProvider` are declared; `return {` unchanged.
- **Importers to update:** none.
- **After:** file ~198; `createDirectoryUserConfig` ~70; `createUserConfigWriter` ~42; `createDatabaseLocator` ~48.
- **Risks / notes:** only `const` arrow locals (`expand`, `distinct`, `syncProvider`) must exist before the helper calls — place the calls after them. No runtime-order change otherwise (moved items are function declarations).

### jini:packages/platform/src/fs/directory-workspace.ts
- **Over:** `createNodeDirectoryWorkspace` 172
- **Phase:** now · **Batch:** size-30
- **Tests:** `src/fs/__tests__/directory-workspace.test.ts`, `src/fs/__tests__/directory-registry.test.ts`, `src/fs/__tests__/app-data-profile.test.ts`, `src/fs/__tests__/user-data-config.test.ts`, `src/fs/__tests__/file-lock.incomplete-holder.test.ts` (`pnpm --filter @jini-ai/platform exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `fileAt`, `config`, `settings`, `readSetting`, `legacyHome`, `home` | settings + home resolution (stays) |
| B | `fixturePattern`, `atHome`, `oldCatalogs`, `importOldCatalog` | catalog registry access + one-time legacy catalog import |
| C | `runningLockAt`, `mutate`, `registry` | locking + registry facade (stays) |
| D | prop `relocate` (34) | move the sites home |
| E | prop `running` (15) | running-lease surface |
| F | rest of `return {`, `thisConfig` | surface (stays) |

- **Splits** (module level above `createNodeDirectoryWorkspace`):
  1. HELPER `createCatalogAccess({ fileAt, config, home, registryName, canonicalPath, registryRecovery, homeDir, defaultFolder, envName, env, cwd, directoryOptions, userConfig }: CreateCatalogAccessInput): { atHome; oldCatalogs; importOldCatalog }` ← `const fixturePattern = registryRecovery ?` through `const importOldCatalog = () => {` (with the "Read old catalogs" comment). Input = exactly the closure names those four read.
  2. HELPER `relocateWorkspaceHome({ …closure names read…, input }: RelocateWorkspaceHomeInput)` ← body of prop `relocate`; the prop becomes a one-line call passing its parameter as `input` (keep the prop's parameter type and return type as today).
  3. HELPER `createRunningSurface({ …closure names read… }: CreateRunningSurfaceInput)` ← the value of prop `running`, moved verbatim and returned; prop becomes `running: createRunningSurface({ … })` — ONLY if the value is not lazily evaluated today; if `running` is a method/getter, wrap the same way as `relocate`.
- **Importers to update:** none.
- **After:** file ~205; `createNodeDirectoryWorkspace` ~90; helpers ≤ 40.
- **Risks / notes:** `atHome`/`oldCatalogs` are lazy thunks — keep them thunks. `mutate` calls `importOldCatalog` inside `settings.withLock` — unchanged. The "Serialize pointer changes" comment stays on `registry`.

### jini:packages/platform/src/fs/guarded-reader.ts
- **Over:** `createGuardedFileReader` 329
- **Phase:** now · **Batch:** size-30
- **Tests:** `src/fs/__tests__/guarded-reader.binary.test.ts`, `…/guarded-reader.boundaries.test.ts`, `…/guarded-reader.traversal-budget.test.ts`, `…/guarded-reader.descriptor.test.ts` and any other `src/fs/__tests__/guarded-reader*.test.ts` (`pnpm --filter @jini-ai/platform exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | arg checks, `descriptorFlags`, fs destructure, limit consts, `return {` | reader wiring (stays) |
| B | `foldFsNameForDenylist`, `normalizeFsRelativePath`, `isWithin`, `assertWellFormedRelativePath`, `walkBoundReached`, `interface FsWalkState`, `interface ReadFsFileResult`, `readBoundedStream` | pure helpers (read no closure locals) |
| C | `isDeniedFsFileName`, `isDeniedFsPathSegment`, `assertNoSymlinkEscape`, `resolveFsFilePath`, `assertRequestedPathNotDenied`, `assertEffectiveTargetNotDenied` | path policy: deny rules + containment |
| D | `visitFsDirEntry`, `walkFsDir`, `listFsFiles` | bounded directory listing |
| E | `statOrFsPathError`, `statRegularFile`, `looksBinary`, `readFsFile`, `readBoundedSync` | synchronous bounded reads |
| F | `openValidatedDescriptor`, `openFsFileForRead`, `openNoFollow`, `createBoundedStream` | descriptor/stream reads |

- **Splits** (same file, module level above `createGuardedFileReader`, order B, C, D, E, F):
  1. Lift unit B verbatim (each with its "why" comment). Before lifting each, confirm its body reads no closure local (outline shows none for these).
  2. HELPER `createGuardedPathPolicy({ rootPath, denyRules, fs, limits }: CreateGuardedPathPolicyInput): GuardedPathPolicy` ← unit C; inside, re-declare `const { existsSync, realpathSync } = fs;` and `const MAX_WALK_DEPTH = limits.maxWalkDepth;` (same expressions as the original). Returns the six functions.
  3. HELPER `createGuardedLister({ rootPath, fs, limits, excludedListingDirs, policy }: CreateGuardedListerInput): { listFsFiles }` ← unit D (re-declare the `MAX_*` / `EXCLUDED_LISTING_DIR_NAMES` consts and fs functions it reads with the same expressions).
  4. HELPER `createGuardedSyncReads({ rootPath, fs, limits, descriptorFlags, policy }: CreateGuardedSyncReadsInput): { statRegularFile; readFsFile }` ← unit E.
  5. HELPER `createGuardedStreamReads({ rootPath, fs, descriptorRead, descriptorFlags, policy, statRegularFile }: CreateGuardedStreamReadsInput): { openFsFileForRead }` ← unit F (`createBoundedStream` returned too if `openFsFileForRead` is not its only caller).
  6. Main keeps the arg validation (`if (!rootPath)`, limits loop), `descriptorFlags`, calls the four factories in that order, destructures the names `return {` uses, returns unchanged. `GuardedPathPolicy` etc. = `ReturnType<typeof …>`; `limits: GuardedReaderLimits`, `fs: GuardedReaderFilesystem`, `descriptorRead`: the existing `DescriptorReadPolicy | undefined`.
- **Importers to update:** none (exports unchanged; package entry `./fs/guarded-reader` is this file).
- **After:** file ~470; `createGuardedFileReader` ~40; `createGuardedPathPolicy` ~75; `createGuardedLister` ~70; `createGuardedSyncReads` ~60; `createGuardedStreamReads` ~65.
- **Risks / notes:** security-critical (containment, symlink escape, deny rules, byte caps): every refusal message and check order must stay byte-identical. Validation (`if (!rootPath)`, limits loop, `descriptorOpenFlags`) must still run before any factory. If `outline.mjs --check` shows the file > 500 after the split, STOP and report — do not improvise a sibling.

### jini:packages/platform/src/terminal.ts
- **Over:** `createTerminalService` 239
- **Phase:** now · **Batch:** size-30
- **Tests:** `src/__tests__/terminal.test.ts` (`pnpm --filter @jini-ai/platform exec vitest run src/__tests__/terminal.test.ts --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | options destructure, `sessions`, `cachedSpawnPty`, `loadPty`, `scheduleCleanup`, `get`, `list`, `return {` | service wiring (stays) |
| B | `recordByteLength`, `trimBuffer`, `emit`, `flushData`, `finish` | session output buffering + exit |
| C | `create` (52) | spawn a PTY session |
| D | `attach`, `detach`, `write`, `resize`, `kill`, `shutdownActive` | per-session controls |

- **Splits** (module level above `createTerminalService`, order B, C, D):
  1. HELPER `createSessionOutput({ maxEvents, maxBufferBytes, exitTailBytes, scheduleCleanup }: CreateSessionOutputInput): { emit; flushData; finish }` ← `const recordByteLength =` through `const finish = (session: InternalSession, code: number | null, signal: string | null) => {`.
  2. HELPER `createTerminalSession({ deps, createOptions }: CreateTerminalSessionInput): Promise<TerminalSession>` where `deps` holds exactly the closure names the `create` body reads (outline truncates the list — read ~L356-L411 once). Body = `create`'s body verbatim. Main keeps `const create = (createOptions: CreateTerminalOptions): Promise<TerminalSession> => createTerminalSession({ deps: createDeps, createOptions });` with `createDeps` built once just above.
  3. HELPER `createSessionControls({ sessions, get, finish, shutdownGraceMs }: CreateSessionControlsInput): { attach; detach; write; resize; kill; shutdownActive }` ← `const attach =` through `const shutdownActive =`.
  4. Main destructures each helper's result in place of the moved declarations; `return {` unchanged.
- **Importers to update:** none.
- **After:** file ~420; `createTerminalService` ~50; `createTerminalSession` ~55; `createSessionControls` ~85; `createSessionOutput` ~70.
- **Risks / notes:** `cachedSpawnPty` is a `let` mutated by `loadPty` — keep both in main and pass `loadPty` (the function) to `createTerminalSession`. Timers/flush intervals inside `create` stay as-is. Keep `get` in main (used by controls; pass it in).

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/platform/src/fs/directory-user-config.ts packages/platform/src/fs/directory-workspace.ts packages/platform/src/fs/guarded-reader.ts packages/platform/src/terminal.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
