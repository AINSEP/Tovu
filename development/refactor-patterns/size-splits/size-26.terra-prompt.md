# Terra job size-26: split 4 Jini file(s) by responsibility (size limits)

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
### jini:packages/memory/src/note-store.ts
- **Over:** file 522 lines · `createNoteStore` 367
- **Phase:** now · **Batch:** size-26
- **Tests:** `src/__tests__/note-store.test.ts`, `src/__tests__/note-store-helpers.test.ts`, `src/__tests__/note-store.containment.test.ts` (`pnpm --filter @jini-ai/memory exec vitest run <path> --maxWorkers=2`), then `pnpm --filter @jini-ai/memory run typecheck`.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | exported interfaces/types, `NoteStoreConfigError`, `NoteStore`, consts, `isValidId`, `escapeIndexText`, `capitalize`, upsert helpers (`isValidUpsertInput`, `resolveUpsertEntryId`, `buildUpsertChangeEvent`) | contracts + pure helpers (stay) |
| B | `hasInvalidSubdirLength`, `isReservedRelativeSegment`, `containsPathSeparatorOrNul`, `isMultiSegmentOrAbsoluteWin32Path`, `assertSafeSubdir` | subdir safety rules |
| C | `ensureDir`, `resolveContainedDir`, `readRegularFileStrict`, `readRegularFileOrNull`, `atomicWriteFile` | guarded filesystem I/O |
| D | `readConfig`, `writeConfig` | per-dir config file |
| E | `readIndex`, `writeIndex`, `parseIndexLinkIds`, `ensureIndexHasEntry`, `removeIndexLine` | the Markdown index file |
| F | `summarize`, `listEntries`, `listActiveEntries`, `readEntry`, `upsertEntry`, `deleteEntry`, `updateTreeNode` | note entries CRUD |
| G | `folderId`, `toIsoTime`, `buildTree` | tree view (module-level helper, same file) |
| H | setup locals, `serializeMutation`, `emitChange`, `isValidType`, `dir`, `deriveId`, `contained*Path`, `return {` | store wiring (stays) |

- **Splits** (in order):
  1. NEW `note-store-subdir.ts` — job: subdir safety rules. Moves unit B (four predicates exported as today, `assertSafeSubdir` now exported) with their doc comments. Imports nothing from the original.
  2. NEW `note-store-files.ts` — job: guarded filesystem I/O. Moves type `NoteStoreFilesystemPort` (exported, with its comment) and adds `export function createNoteFileAccess({ fsp, ids }: CreateNoteFileAccessInput): NoteFileAccess` whose body is `async function ensureDir`, `resolveContainedDir`, `readRegularFileStrict`, `readRegularFileOrNull`, `atomicWriteFile` verbatim (with their realpath / atomic-write comments), returning all five. `NoteFileAccess = ReturnType<typeof createNoteFileAccess>`. `note-store.ts` imports the type and the factory; `NoteStoreOptionalArgs` keeps referencing the type. Imports nothing from `note-store.ts`.
  3. TREE HELPER in `note-store.ts` (module level): lift `function folderId` and `function toIsoTime` (they read no locals) and add `function buildNoteTree({ entries, validTypes }: BuildNoteTreeInput): NoteTreeNode[]` ← body of `buildTree` after its first statement `const entries = await listEntries({ dataDir });`, with `config.validTypes` read from the input `validTypes: readonly string[]` (pass `config.validTypes`; NOT the closure's `validTypes` Set — check the body: where it reads the closure `validTypes` Set, add a second field `validTypeSet: ReadonlySet<string>`). Main keeps `async function buildTree({ dataDir }: { dataDir: string }): Promise<NoteTreeNode[]> { const entries = await listEntries({ dataDir }); return buildNoteTree({ entries, validTypes: config.validTypes, validTypeSet: validTypes }); }`.
  4. HELPERS in `note-store.ts` above `createNoteStore`: `createNoteConfigOps({ containedConfigPath, readRegularFileStrict, atomicWriteFile, emitChange }): { readConfig, writeConfig }` ← unit D · `createNoteIndexOps({ containedIndexPath, readRegularFileOrNull, atomicWriteFile, emitChange }): { readIndex, writeIndex, parseIndexLinkIds, ensureIndexHasEntry, removeIndexLine }` ← unit E · `createNoteEntryOps({ config, fsp, dir, isValidType, deriveId, resolveContainedDir, containedEntryPath, readRegularFileOrNull, atomicWriteFile, emitChange, readIndex, parseIndexLinkIds?, ensureIndexHasEntry, removeIndexLine }): { listEntries, listActiveEntries, readEntry, upsertEntry, deleteEntry, updateTreeNode }` ← unit F (include exactly the names the bodies read). Each returns its functions; `createNoteStore` destructures them in place.
- **Importers to update:** `src/index.ts` (`hasInvalidSubdirLength`, `isReservedRelativeSegment`, `containsPathSeparatorOrNul`, `isMultiSegmentOrAbsoluteWin32Path` → `./note-store-subdir.js`; type `NoteStoreFilesystemPort` → `./note-store-files.js`); `src/__tests__/note-store-helpers.test.ts` (the four predicates → `../note-store-subdir.js`); `src/__tests__/note-store.test.ts` (`type NoteStoreFilesystemPort` → `../note-store-files.js`).
- **After:** `note-store.ts` ~450; `createNoteStore` ~85; `createNoteEntryOps` ~92; `createNoteIndexOps` ~52; `createNoteConfigOps` ~37; `buildNoteTree` ~45; `note-store-files.ts` ~78; `note-store-subdir.ts` ~35.
- **Risks / notes:** `NoteStoreOptionalArgs` references `NoteStoreFilesystemPort` → `note-store.ts` imports the type from `note-store-files.ts` (one direction only). `parseIndexLinkIds`'s `ids` is a LOCAL `Set` (outline's `uses: ids` is a false positive) — do not pass the store's `ids`. `serializeMutation` (per-dir mutation tails) stays in `createNoteStore`. Keep `NoteStore` interface field order unchanged. If createNoteEntryOps's input exceeds ~14 fields, it is still one object — fine.

### jini:packages/oauth/src/refresh.ts
- **Over:** `createTokenRefresher` 130
- **Phase:** now · **Batch:** size-26
- **Tests:** `tests/token-refresh.test.ts`, `tests/refresh.f1.test.ts`, `tests/args-convention.test.ts` (`pnpm --filter @jini-ai/oauth exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `skewMs`, `leaseWaitMs`, `leasePollMs`, `sleep`, `inFlight`, `refreshOnce`, `return {` | refresher wiring + single-flight (stays) |
| B | `markNeedsReauthBestEffort`, `performRefresh` | redeem the refresh token and persist / mark reauth |
| C | `awaitLeaseHolder` | wait for another holder's lease result |

- **Splits** (module level above `createTokenRefresher`):
  1. HELPER `createRefreshPerformer({ deps }: CreateRefreshPerformerInput): (key: string, current: OAuthTokenSet) => Promise<string>` ← `const markNeedsReauthBestEffort = async (key: string, reason: string)` (with its "Preserve the terminal OAuth signal" comment) and `const performRefresh = async (key: string, current: OAuthTokenSet)`; returns `performRefresh`. `deps: OAuthRequiredArgs<TokenRefresherDeps>`.
  2. HELPER `awaitLeaseHolder({ deps, key, leaseWaitMs, leasePollMs, skewMs, sleep }: AwaitLeaseHolderInput): Promise<…same as today…>` ← body of `const awaitLeaseHolder = async ({ key }, _optionalArgs = {})` (with its "Poll durable storage" comment). Main keeps `const awaitLeaseHolder = ({ key }: { readonly key: string }, _optionalArgs = {}) => awaitLeaseHolderUntilResolved({ deps, key, leaseWaitMs, leasePollMs, skewMs, sleep });` — name the module helper `awaitLeaseHolderUntilResolved` to avoid shadowing.
  3. Main: `const performRefresh = createRefreshPerformer({ deps });`.
- **Importers to update:** none.
- **After:** file ~185; `createTokenRefresher` ~65; helpers ~45 / ~30.
- **Risks / notes:** `inFlight` must stay per refresher (it does). Same awaits, same order.

### jini:packages/platform/src/asset-cache.ts
- **Over:** `createAssetCache` 123
- **Phase:** now · **Batch:** size-26
- **Tests:** `src/__tests__/asset-cache.test.ts`, `src/__tests__/asset-cache-dispatcher.test.ts`, `src/__tests__/validating-lookup.hostile.test.ts` (`pnpm --filter @jini-ai/platform exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | option locals, `dispatcher`, `inflight`, `fetchAndStore`, `get`, `return` | cache orchestration (stays) |
| B | `readFromDisk`, `writeToDisk` | on-disk cache entries |
| C | `resolveContentType` | MIME choice (reads no locals) |
| D | `assertWithinLimit`, `drainCapped`, `readBodyCapped` | size-capped body read |

- **Splits** (module level above `createAssetCache`):
  1. Lift `function resolveContentType({ headerValue, url })` verbatim to module level (reads only module consts).
  2. HELPER `createAssetDiskStore({ cacheDir }: CreateAssetDiskStoreInput): { readFromDisk; writeToDisk }` ← `async function readFromDisk({ key }, _options = {})` and `async function writeToDisk(key: string, result: AssetCacheResult)` verbatim.
  3. HELPER `createCappedBodyReader({ maxBytes }: CreateCappedBodyReaderInput): { assertWithinLimit; readBodyCapped }` ← `function assertWithinLimit`, `async function drainCapped(` (with its comment), `async function readBodyCapped(` (with its comment).
  4. Main destructures both helpers' results where those functions were declared.
- **Importers to update:** none.
- **After:** file ~255; `createAssetCache` ~58; helpers ≤ 40.
- **Risks / notes:** `asset-cache-dispatcher.test.ts` mocks `../asset-cache.adapter.js` (not this file) — unaffected. The SSRF "Pin SSRF validation" comment stays with `suppliedDispatcher`.

### jini:packages/platform/src/download.ts
- **Over:** file 981 lines (no function over 100)
- **Phase:** now · **Batch:** size-26
- **Tests:** `src/__tests__/download.test.ts`, `src/__tests__/unit/download-reuse-m2.unit.test.ts` (`pnpm --filter @jini-ai/platform exec vitest run <path> --maxWorkers=2`), then `pnpm --filter @jini-ai/platform run typecheck`.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| C | public types `ManagedDownload*`, `DownloadCopyAndClear*`, `RemoveManagedDownload*`, `PruneManagedDownloads*`, `MANAGED_DOWNLOAD_ERROR_CODES`, `ManagedDownloadErrorCode`, `ManagedDownloadError`, `errorCode`, `errorMessage` | public contract + errors |
| S | `STORE_SENTINEL`, `STATE_DIR`, `PARTIAL_DIR`, `LOCK_DIR`, `STORE_SCHEMA_VERSION`, `MANIFEST_SCHEMA_VERSION`, `STORE_KIND`, `MANIFEST_KIND`, `StoreSentinel`, `DownloadManifest`, `NormalizedTarget`, `ReusableState`, `digest`, `pathExists`, `readJson`, `writeJson`, `directoryIsEmpty`, `isPlainObject`, `isStoreSentinel`, `writeSentinel`, `resetOwnedTarget`, `ensureStoreDirs`, `ensureManagedBase`, `isChecksum`, `MANIFEST_STRING_FIELDS`, `isManifest`, `readManifest`, `MANIFEST_IDENTITY_FIELDS`, `manifestMatchesTarget`, `createManifest`, `hashFile`, `statFileSize` | on-disk store layout, sentinel, manifests |
| N | `normalizeChecksum`, `DOT_SEGMENTS`, `normalizeSegment`, `normalizeUrl`, `normalizeBasePath`, `targetFromOptions`, `targetWithoutPayload` | normalizing options into a target |
| L | `PID_REUSE_GRACE_MS`, `PROCESS_STARTED_AT_MS`, `AcquiredLock`, `DownloadLockFile`, `isDownloadLockFile`, `parseTimeMs`, `lockBelongsToCurrentProcess`, `isLockProcessAlive`, `acquireLock`, `tryCreateLockFile`, `clearStaleLock`, `releaseLock` | cross-process target lock |
| X | `DEFAULT_MAX_ATTEMPTS`, `DownloadAttemptResult`, `emitExistingProgress`, `contentLength`, `validatorsFromResponse`, `validatorsConflict`, `parseContentRange`, `writeResponseBodyToPartial`, `DownloadDeps`, `DownloadRequestOptions`, `resumeRequestHeaders`, `acceptedResumeTotalBytes`, `tryResumeDownload`, `downloadFromZero`, `downloadWithRetries`, `manifestAfterFailedAttempt` | HTTP transfer with resume + retries |
| M | `DEFAULT_PRUNE_OLDER_THAN_MS`, `ActiveTask`, `CopyLease`, `CopyLeaseState`, `activeTasks`, `activeTargets`, `copyLeases`, `suspiciousReset`, `loadReusableState`, `reusableCompleteState`, `runManagedDownload`, `loadStateAllowingOneReset`, `promoteVerifiedPartial`, `activeKey`, `targetActiveKey`, `waitForTask`, `managedDownload`, copy-lease trio, `downloadCopyAndClear`, `inspectManagedDownload`, `removeManagedDownload`, `removeEntriesOlderThan`, `pruneManagedDownloads` | public operations (stay in `download.ts`) |

- **Splits** (dependency order C → S → N → L → X; none imports `download.ts`):
  1. NEW `download-contract.ts` — job: public types + error. Moves unit C; all public names stay exported; `errorCode`/`errorMessage` exported for siblings.
  2. NEW `download-store.ts` — job: on-disk store layout and manifests. Moves unit S; exports what N/L/X/M read (check each with rg after the move). Imports from contract only.
  3. NEW `download-target.ts` — job: options → normalized target. Moves unit N; imports `STATE_DIR`, `PARTIAL_DIR`, `LOCK_DIR`, `digest`, `NormalizedTarget` from store, errors from contract.
  4. NEW `download-lock.ts` — job: cross-process target lock. Moves unit L.
  5. NEW `download-transfer.ts` — job: resumable HTTP transfer. Moves unit X; exports `downloadWithRetries`, `DownloadDeps` (and whatever M reads).
  6. `download.ts` keeps unit M and imports from the five modules. Module-level registries (`activeTasks`, `activeTargets`, `copyLeases`) stay here — they are process singletons and must exist once.
- **Importers to update:** `src/index.ts` (types `DownloadCopyAndClearOptions`, `DownloadCopyAndClearResult`, `ManagedDownloadChecksum`, `ManagedDownloadErrorCode`, `ManagedDownloadInspection`, `ManagedDownloadOptions`, `ManagedDownloadPayload`, `ManagedDownloadProgress`, `ManagedDownloadResult`, `PruneManagedDownloadsOptions/Result`, `RemoveManagedDownloadOptions/Result`, and values `MANAGED_DOWNLOAD_ERROR_CODES`, `ManagedDownloadError` → `./download-contract.js`; the five functions stay from `./download.js`); `src/__tests__/download.test.ts` (`MANAGED_DOWNLOAD_ERROR_CODES`, `type ManagedDownloadProgress` → `../download-contract.js`); `src/__tests__/unit/download-reuse-m2.unit.test.ts` (`MANAGED_DOWNLOAD_ERROR_CODES` → `../../download-contract.js`). Re-run `rg -n "download(\.js)?['\"]" packages/platform/src` to catch any other.
- **After:** `download.ts` ~345; `download-store.ts` ~190; `download-transfer.ts` ~190; `download-contract.ts` ~100; `download-lock.ts` ~90; `download-target.ts` ~75.
- **Risks / notes:** `PROCESS_STARTED_AT_MS` is computed at module load — moving it to `download-lock.ts` keeps it a load-time constant (first import of the package loads both); acceptable, same process. The "Every caller feeds this a `JSON.parse` result" comment moves with `isPlainObject`; all other per-function comments move with their code. `removeManagedDownload` is called by the copy-lease trio — both stay in `download.ts`.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/memory/src/note-store.ts packages/oauth/src/refresh.ts packages/platform/src/asset-cache.ts packages/platform/src/download.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
