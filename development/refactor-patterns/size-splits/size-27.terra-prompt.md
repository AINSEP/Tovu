# Terra job size-27: split 8 Jini file(s) by responsibility (size limits)

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
### jini:packages/agent-plugins/src/admin-surfaces/surface-client.ts
- **Over:** `createAdminSurfaceClient` 101
- **Phase:** now · **Batch:** size-27
- **Tests:** `packages/agent-plugins/src/admin-surfaces/__tests__/surface-client.unit.test.ts`, `.../theme-and-size.unit.test.ts`, `.../admin-surfaces.vertical-slice.test.ts`, `packages/agent-plugins/src/__tests__/exports.contract.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Responsibility map:** A = `function onResponse(event, data)` (match a host response to its pending call and settle it) ; B = rest (connect, theme, size, send, close) — client.
- **Splits:**
  1. HELPER `settleResponse({ init, pending, event, data }: SettleResponseInput): void` (module level, above `createAdminSurfaceClient`, after `isWellFormedResponse`) ← body of `onResponse` verbatim; `init` is passed as the current value (`Init | undefined`), `pending: Map<string, Pending>`.
  2. In the client, `function onResponse(event, data): void { settleResponse({ init, pending, event, data }); }` — keep the name so the `required.listen` callback is unchanged. (Alternatively call `settleResponse` directly at the one call site and delete `onResponse`; prefer that if `onResponse` has no other use — saves 3 more lines.)
- **Importers to update:** none (no export moves; `./admin-surfaces/surface-client` export map entry untouched).
- **After:** `createAdminSurfaceClient` ~93-96; file ~212.
- **Risks / notes:** `init` must be read at call time (it is assigned in `onInit`), so pass it per call, never capture once. Thin margin — run `--check`.

### jini:packages/agent-plugins/src/connect/credential-save-tool.ts
- **Over:** `createCredentialSaveTools` 119
- **Phase:** now · **Batch:** size-27
- **Tests:** `packages/agent-plugins/src/connect/__tests__/host-tool-inputs.unit.test.ts`; also `rg -l "createCredentialSaveTools" packages --glob '*.test.*'` (pkg `@jini-ai/agent-plugins`)
- **Responsibility map:** A = `routeSave`, `selectProviderSettingsSave`, `selectProviderSave`, `selectApiSave`, `selectPublishSave`, `invokeSaveAdapter` — closure-free routing of a selected kind to its domain adapter (outline: no `uses` of factory locals); B = `KINDS`, `CredentialKind`, `credentialSaveCatalog`, `credentialSaveDerivedRisk`, `selectSave`, `buildCredentialSaveRegistrations`, `routePluginCard`, return — tool definition + registration (read the factory params).
- **Splits:**
  1. MOVE unit A verbatim to module level directly above `createCredentialSaveTools`, in the same order, with their why-comments. They are existing functions (signatures unchanged). If any of their signatures names `CredentialKind` or reads `KINDS`, move `const KINDS = [...] as const` and `type CredentialKind` to module level too (they read no params).
  2. Before moving each, `rg` its body for any factory param (`messages`, `toolMetadata`, `CREDENTIAL_SAVE_TOOL_ID`, `_optional`) — `invokeSaveAdapter` lists `_optional`: if it really reads it, leave `invokeSaveAdapter` inside.
- **Importers to update:** none.
- **After:** `createCredentialSaveTools` ~75; file ~140.
- **Risks / notes:** `@agent-note` comments stay where they are.

### jini:packages/agent-plugins/src/connect/plugin-host/index.ts
- **Over:** `createPluginHost` 107
- **Phase:** now · **Batch:** size-27
- **Tests:** `rg -l "createPluginHost|connect/plugin-host" packages/agent-plugins --glob '*.test.*'` (none matched the path stem in the survey; smoke = `packages/agent-plugins/src/lifecycle/__tests__/provider-contribution.test.ts`) (pkg `@jini-ai/agent-plugins`)
- **Responsibility map:** A = `const agentPlugins: AgentPluginLifecycleCapability<UninstallInput> = {` (~30, lifecycle orchestration bound to the host's MCP pair); B = provider listing (`listSiteProviders`, `resolveAgentProviders`, `listAgentProviders`, `listProviders`, `lookup`) + return — plugin discovery.
- **Splits:**
  1. HELPER `createAgentPluginsCapability<UninstallInput, Layout>({ deps, lifecycle, mcp, mcpPorts, resolveServers, warn }: CreateAgentPluginsCapabilityInput<UninstallInput, Layout>, { resolveMcpServers }: CreateAgentPluginsCapabilityOptions = {}): AgentPluginLifecycleCapability<UninstallInput>` (module level, above `createPluginHost`) ← the object literal verbatim; `optional.x` reads become the options param. The "Preview, provisioning grant and status share…" comment stays on `const { mcp, mcpPorts } = deps;` in the host.
  2. `createPluginHost`: `const agentPlugins = createAgentPluginsCapability({ … }, { resolveMcpServers: optional.resolveMcpServers });` (pass only the optional fields the literal reads).
- **Importers to update:** none (index.ts is an exports target — nothing removed).
- **After:** `createPluginHost` ~80; helper ~33.
- **Risks / notes:** generic params must match `PluginHostDeps<UninstallInput, Layout>`.

### jini:packages/agent-plugins/src/lifecycle/activation.ts
- **Over:** `buildModule` 314
- **Phase:** now · **Batch:** size-27
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/activation.unit.test.ts`, `activation-edges`, `activation-m1`, `activation-reader`, `activation-reconcile`, `activation-lock-busy`, `activation-durable-write`, `activation-corrupt-file-writes` (all `.unit.test.ts` in that folder), `.../integration/activation-cross-process-writes.integration.test.ts`, `.../unit/seed-bundled-edges.unit.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Pattern:** `buildModule(ports)` is a per-host closure module; the split keeps ONE `buildModule` per instance and has it compose ports-scoped sub-factories (module level, above `buildModule`, each called once inside it, so per-instance state stays per instance). Existing inner functions keep their signatures (positional params are existing code). NB the outline's `uses` lists only earlier locals: grep each moved body for later-declared (hoisted) callees too.
- **Responsibility map / splits:**
  1. MODULE-LEVEL pure helpers (no `ports`, no closure state) — move verbatim above `buildModule`: `EMPTY_ACTIVATIONS`, `SAFE_PLUGIN_ID_PATTERN`, `isAgentPluginActive`, `filterActiveAgentPlugins`, `errorCode`, `describeError`, `toActivationsBusyError`, `RawPluginsBag` type, `ActivationsDocument` type, `isRecordedAsBundled`, `isPlainObject`, `extractPluginsBag`, `withActivationDefaults`, `normalizeActivationEntry`, `normalizeActivations`, `normalizePluginsBag`, `SEED_ACTOR`, `isUntouchedDisabledSeed`, `assertPluginId`, `assertTargetEntryReadable` (~85). Job: record shape + validation.
  2. SUB-FACTORY `buildActivationsWriteLock({ ports, mkdir, open, rename, rm, randomUUID }: BuildActivationsWriteLockInput): { lockedActivationsWrite; writeActivationsAtomically }` ← `warnStaleActivationsLockRemoved`, `pendingActivationWrites`, `serializeActivationsWrite`, `lockedActivationsWrite`, `writeActivationsAtomically`, `syncDirectoryBestEffort` (~75). Job: serialized, locked, atomic file writes.
  3. SUB-FACTORY `buildActivationReads({ readFile }: BuildActivationReadsInput): { readAgentPluginActivations; readActivationsDocument; readPluginsBagStrict; assertAgentPluginActivationsWritable; isAgentPluginRecordedAsBundled; resolveAgentPluginActivation; isAgentPluginDisabledByOperator }` (~60). Job: tolerant + strict reads.
  4. SUB-FACTORY `buildActivationWrites({ ports, reads, lock }: BuildActivationWritesInput): { setAgentPluginActivation; reconcileAgentPluginActivation; recordBundledAgentPluginIfAbsent; enableBundledAgentPluginUnlessOperatorDisabled; deleteAgentPluginActivation }` ← those five + `writeActivationDecision` (~100). If `--check` shows it >100, put `recordBundledAgentPluginIfAbsent` + `enableBundledAgentPluginUnlessOperatorDisabled` in a fifth sub-factory `buildBundledActivationWrites({ reads, lock, writeActivationDecision })`.
  5. `buildModule` keeps the `ports.filesystem` binds, calls 3→2→4 and returns the same 13 names in the same object.
- **Importers to update:** none (only `buildModule` internals change; exported names unchanged).
- **After:** `buildModule` ~25; sub-factories ≤100 each; file ~430 (wrappers add ~15).
- **Risks / notes:** every long "why" comment block (header-referenced lock/fail-closed rationale) moves with its function verbatim. `pendingActivationWrites` must be created inside the write-lock factory (once per `buildModule` call), never at module level — module-level would share the chain across instances (`module-memoisation` test).

### jini:packages/agent-plugins/src/lifecycle/automatic-use.ts
- **Over:** `createAutomaticAgentPluginUse` 143
- **Phase:** now · **Batch:** size-27
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/automatic-use.unit.test.ts`, `.../automatic-cancellation-m1.unit.test.ts`, `.../load-supporting-files.unit.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Responsibility map:** A = `resolveOneGuidance`, `recordDelivery`, `resolveGuidance`, `preparedGuidance` — guidance resolution + delivery recording (reads only `ports`, `delivered`); B = `isPrimaryInstructions`, `offPluginNote` — closure-free helpers; C = rest (consent, state persistence, usage, queue, `prepare`, `load`) — run owner.
- **Splits:**
  1. HELPERS at module level above the factory: `isPrimaryInstructions` (verbatim; drop the unused `_options` param only if it is literally unused — otherwise keep it) and `offPluginNote({ ports, catalog, input }: OffPluginNoteInput): <existing return>` ← body verbatim.
  2. SUB-FACTORY `createGuidanceResolver({ ports, delivered }: CreateGuidanceResolverInput): { resolveOneGuidance; recordDelivery; resolveGuidance; preparedGuidance }` (module level) ← unit A verbatim with comments. `delivered: Map<string, string>` is the factory's map (same instance).
  3. Factory: `const { resolveOneGuidance, recordDelivery, resolveGuidance, preparedGuidance } = createGuidanceResolver({ ports, delivered });` right after `const delivered = …`. Call sites of `offPluginNote` pass `ports`.
- **Importers to update:** none.
- **After:** factory ~95; resolver ~48; file ~225.
- **Risks / notes:** thin margin; `delivered` must be the same Map (`rememberDelivery`, `publishUsage` read it). Queue/serialization comment on `enqueue` stays.

### jini:packages/agent-plugins/src/lifecycle/bundled-digests.ts
- **Over:** `buildModule` 126
- **Phase:** now · **Batch:** size-27
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/bundled-digests.unit.test.ts`, `.../module-memoisation.unit.test.ts`, `.../seed-bundled-edges.unit.test.ts`, `.../resolve-agent-plugin-refs.unit.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Responsibility map:** A = `SHA256_DIGEST_PATTERN`, `SAFE_PLUGIN_ID_PATTERN`, `resolveThisBootsDigests`, `preferBundledAgentPluginDigests`, `idsNarrowableToTheirBundledDigest`, `isPlainObject` — pure ledger selection (no `ports`, no per-instance state); B = binds, `EMPTY_LEDGER`, `readBundledAgentPluginDigests`, `normalizeBundledDigests`, `recordBundledAgentPluginDigests`, `removeBundledAgentPluginDigest`, `writeLedgerAtomically`, return — ledger file I/O + per-instance empty ledger.
- **Splits:**
  1. MOVE unit A verbatim (with every comment) to module level above `buildModule`, same order. Existing signatures unchanged. Grep each body for hoisted callees first (anything it calls must also be module-level).
  2. `buildModule` keeps unit B (`EMPTY_LEDGER` stays inside: it is a `new Map()` handed to callers, per instance) and returns the same five names.
- **Importers to update:** none.
- **After:** `buildModule` ~85; file ~145.
- **Risks / notes:** if `normalizeBundledDigests` calls `isPlainObject`, fine (module-level is visible). Do not move `EMPTY_LEDGER` to module level.

### jini:packages/agent-plugins/src/lifecycle/bundled-source-archive.ts
- **Over:** `buildModule` 224
- **Phase:** now · **Batch:** size-27
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/bundled-source-archive.edges.unit.test.ts`, `.../bundled-source-options.unit.test.ts`, `.../lifecycle-edge-paths.unit.test.ts`, `.../module-memoisation.unit.test.ts`, `.../seed-bundled-edges.unit.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Responsibility map / splits** (same per-instance pattern as activation.ts: module-level pure helpers + ports-scoped sub-factories called once inside `buildModule`; grep moved bodies for hoisted callees):
  1. MODULE-LEVEL pure helpers verbatim above `buildModule`: `MAX_SOURCE_FILES`, `assertSourceFileCount`, `assertPackingLimit`, `encodedFileBytes`, `checkFileBudget`, `createSnapshotReader`, `onceAsyncIterable`, `regularEntryFiles`, `recordFile`, `isNameExcluded`, `selectPath`, `refuseEntry` (~75). Job: packing budgets + path selection. Keep `MAX_SOURCE_FILES` exactly `2048`.
  2. SUB-FACTORY `createArchiveEntryReader({ magic }: CreateArchiveEntryReaderInput): { createBundledSourceArchiveReader(): AgentPluginArchiveReaderPort }` ← `createBundledSourceArchiveReader`, `readEntries` (`MAGIC` → `magic`, or keep the local name `const MAGIC = magic;` at the top to keep bodies verbatim) (~40). Job: read the packed format.
  3. SUB-FACTORY `createSourceDirectoryWalker({ readdir }: CreateSourceDirectoryWalkerInput): { listRegularFiles }` ← `listRegularFiles`, `directoryEntryFiles` (~26). Job: walk runtime files.
  4. `buildModule` keeps binds, `normalizePackageEntryPath`, `packAgentPluginDirectory`, `createPackingState`, `refuseRoot`, `readBoundedFile`, `openWalkedFile` and returns the same two names (~95).
- **Importers to update:** none.
- **After:** `buildModule` ~95; sub-factories ~40 / ~26; file ~280.
- **Risks / notes:** `PackingState` type stays at module level (already is). The Windows O_NOFOLLOW comment stays with `openWalkedFile`. If `--check` shows `buildModule` >100, also move `readBoundedFile` into a `createBoundedFileReader({ ports })` — not before.

### jini:packages/agent-plugins/src/lifecycle/install.ts
- **Over:** `buildModule` 303
- **Phase:** now · **Batch:** size-27
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/install.unit.test.ts`, `.../install-edges.unit.test.ts`, `.../installed-package-roots.unit.test.ts`, `packages/agent-plugins/src/lifecycle/__tests__/type-cycles.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Pattern:** same as `activation.ts` fragment — `buildModule(ports)` is a per-host closure module (memoised in `instances`); keep ONE `buildModule` per instance that composes module-level ports-scoped sub-factories, each called ONCE inside it, so per-instance state stays per instance. Existing inner functions keep their signatures and comments verbatim. The outline `uses` lists only earlier locals — grep every moved body for later-declared (hoisted) callees and for each bound fs alias it reads, and pass those in.
- **Splits:**
  1. MODULE-LEVEL pure (no ports) verbatim above `buildModule`: `LIMITS`, `SHA256_HEX_PATTERN`, `symlinkRejectionMessage`, `assertEntryCountWithinCap`, `tooManyEntriesError`, `sha256`, `isErrnoException` (~35). Job: archive limits + small predicates. (`maxAgentPluginInstallArchiveBytes` stays in `buildModule`, it is returned.)
  2. SUB-FACTORY `createArchiveExtractor({ ports, mkdir, open, normalizePackageEntryPath, assertContainedOnDisk }: CreateArchiveExtractorInput): { extractEntries }` ← `normalizeEntryPathOrThrow`, `resolveContainedDestinationOrThrow`, `extractOneEntry`, `extractEntries`, `writeContainedFile` (~95). Job: hardened extraction.
  3. SUB-FACTORY `createPublishSteps({ rename, readdir, readFile, stat, chmod, ports }: CreatePublishStepsInput): { reuseOrSetAsideExisting; freezeTree; publish; isRealDirectory }` ← those + `sameTree`, `sameFile` (~60). Job: freeze + compare + atomic publish.
  4. SUB-FACTORY `createRevisionHousekeeping({ ports, persistentState, readFile }: CreateRevisionHousekeepingInput): { assertIdentityAvailable; pruneSupersededRevisions }` (~40). Job: identity lock + superseded-revision pruning.
  5. `buildModule` keeps binds, `index`, `indexInstalledRoot`, `maxAgentPluginInstallArchiveBytes`, `installAgentPlugin`, return (same three names).
- **Importers to update:** none (re-exports at the top unchanged).
- **After:** `buildModule` ~85; sub-factories ≤95; file ~370.
- **Risks / notes:** the module header's hardening-rule list is referenced by `extractOneEntry`/`extractEntries` comments — keep those comments verbatim (they point to "this module's header", still the same file). `type-cycles.test.ts` guards import cycles — no new files, so none added.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/agent-plugins/src/admin-surfaces/surface-client.ts packages/agent-plugins/src/connect/credential-save-tool.ts packages/agent-plugins/src/connect/plugin-host/index.ts packages/agent-plugins/src/lifecycle/activation.ts packages/agent-plugins/src/lifecycle/automatic-use.ts packages/agent-plugins/src/lifecycle/bundled-digests.ts packages/agent-plugins/src/lifecycle/bundled-source-archive.ts packages/agent-plugins/src/lifecycle/install.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
