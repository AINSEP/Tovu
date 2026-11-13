# Terra job size-56: split 4 Tovu file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Tovu clone you are given (Tovu only). `TOVU` below = that clone's root.

AFTER-MOVE: run this job only after the Tovu→Jini move work for these files has landed. If a file is gone, or `outline.mjs` no longer shows the declarations a fragment names, STOP that file and report it — the plan is stale for it.

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
### tovu:apps/desktop/src/tovu-server.ts
- **Over:** file 503 lines · `startTovuServer` 118
- **Phase:** after-move (MIXED — DEDUPE-AFTER-HARDENING) · **Batch:** size-56
- **Tests:** `apps/desktop/src/tovu-server.test.ts`, `tovu-server-failures.test.ts`, `tovu-server.boundaries.test.ts`, `tovu-server.desktop-mcp.test.ts`, `cli-child-secrets.test.ts`, `profile-isolation.test.ts`, `product-telemetry.test.ts`, `admin-dev-proxy.test.ts`, `desktop-capture-env.test.ts`, `built-in-mcp-ownership.test.ts`, `desktop-reported-regressions.test.ts`, `electron-builder-files.test.ts`, `move-site-home.test.ts` (desktop main runner). No `mock.module` of this file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | boot-line / CLI-error / boot-token parsing + constants, `resolveCliEntry`, `resolveDevCliEntry`, `buildCliSpawnPlan` | how to invoke the CLI and read its output (stays) |
| B | `buildCliEnv`, `BuildServeEnvInput`, `buildServeEnv`, `apply*Env`, `applyRepoRootDefaults` | child env (stays — ~25 importers; moving it is churn without a new job) |
| C | `SpawnedChild`, `taskkillTree`, `stopChild`, `killWin32Tree`, `ExitOutcome`, `ExitSignal`, `createExitSignal`, `buildServeSpawnOptions` | spawn options, stop and exit signalling of a server child process |
| D | in `startTovuServer`: `const plan = buildCliSpawnPlan({` … `const child = spawnFn(` | build argv + env and spawn the child |
| E | in `startTovuServer`: `async function stopIfIdle(` | idle sleep request + bounded wait for the sleep exit |
| F | rest of `startTovuServer` (delivery, redaction, the ready/timeout/exit promise) | boot handshake (stays) |

- **Splits** (execution order):
  1. NEW `apps/desktop/src/tovu-server-child.ts` — job: a spawned server child's process group, stop and exit signal. Moves unit C verbatim (all doc comments incl. the W7/win32 `taskkill` paragraph and the `SpawnedChild` "kept narrow" paragraph). Exports `SpawnedChild` (type), `stopChild`, `createExitSignal`, `ExitSignal` (type), `buildServeSpawnOptions`, `taskkillTree`. Imports nothing from `tovu-server.ts`.
  2. HELPER `spawnServeChild({ input, port, spawnFn }: SpawnServeChildInput): { serveEnv: ReturnType<typeof buildServeEnv>; startup: ReturnType<typeof splitNodeStartupSecrets>; child: SpawnedChild }` (module level, above `startTovuServer`) ← unit D verbatim incl. the `--emit-boot-token` opt-in comment, the `agentService` token deletes and the "Startup IPC is separate" comment.
  3. HELPER `stopServerIfIdle({ agentBinding, stopGraceMs, exitSignal }: StopServerIfIdleInput): Promise<boolean>` ← body of `stopIfIdle` (its doc comment moves to the helper). In `startTovuServer`: `const stopIfIdle = async (_required = {}, _optional = {}): Promise<boolean> => stopServerIfIdle({ agentBinding, stopGraceMs, exitSignal });`. `agentBinding` type = `ReturnType<NonNullable<StartTovuServerInput["agentService"]>["bindServer"]> | undefined`.
  4. Drop `createExitSignal` from the bottom `export { … }` block (now exported by the child module).
- **Importers to update:** none outside the file import `createExitSignal`/`stopChild`/`SpawnedChild` (verified rg: comments only). `tovu-server.ts` itself imports them from `./tovu-server-child.ts`.
- **After:** `tovu-server.ts` ~405; `startTovuServer` ~80; `tovu-server-child.ts` ~110.
- **Risks / notes:** `child.pid!` inside the resolve stays verbatim (existing, not new). `electron-builder.yml` ships `src/**`, so the new file is packaged; `electron-builder-files.test.ts` names only `src/tovu-server.ts` (still there). After-move: "DEDUPE-AFTER-HARDENING" — `stopChild`/`taskkillTree` duplicate the reconcile kill in `site-process-registry.ts`/Jini sidecar; isolating them in `tovu-server-child.ts` gives the later dedupe one file to replace.

### tovu:apps/website/src/assistant/byok-tool-surface.ts
- **Over:** `createByokToolSurface` 130 (file 485 — will exceed 500 once helpers are added, so the file splits too)
- **Phase:** after-move (MIXED) · **Batch:** size-56
- **Tests:** `apps/website/src/assistant/__tests__/byok-tool-surface.test.ts`, `byok-tool-surface.site-capabilities.test.ts`, `byok-meta-tool-result.unit.test.ts`, `byok-google-catalog.test.ts`, `byok-image-tool-results.test.ts`, `desktop-mcp-runtime.integration.test.ts`, `tool-executor-stack.failure-redaction.test.ts`, `server/__tests__/assistant-byok-routes.test.ts`, `server/runtime/composition/modules/__tests__/assistant-byok.tool-access-lowering.integration.test.ts`, `server/runtime/composition/__tests__/agent-plugin-search-discovery.integration.test.ts` (website runner; full list = `rg -l "byok-tool-surface" apps/website/src --glob '*.test.*'`, 20 files — run all). No mocks of the module.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `SEARCH_LIMIT_MAX`, `SEARCH_LIMIT_DEFAULT`, `META_TOOL_DESCRIPTORS`, `META_TOOL_IDS`, `MetaToolCatalogAudit`, `searchInputError`, `runSearchTools`, `runDescribeTool`, `runExecuteDelegatedTool`, `runTypedTool` | the three BYOK meta-tools: descriptors + one runner per branch |
| B | `ByokToolRun`, `ByokToolSurface`, deps/options types, `createDiscoveryRegistry`, `createSurfaceConnectionSource`, `attachSurfaceExtensions`, `composeSurfaceExecutor`, `registerSurfaceTools`, `withDaemonLocalTools` | assemble the surface (stays) |
| C | in `createByokToolSurface`: `catalog` + `ready` + `startFederation` + `syncInstalled` + `executeMetaTool` + returned object | the live surface (stays; closes over the mutable `catalog`) |

- **Splits** (execution order):
  1. NEW `apps/website/src/assistant/byok-tool-surface-meta-tools.ts` — job: BYOK meta-tool descriptors and their per-branch runners. Moves unit A verbatim with doc comments (the `META_TOOL_DESCRIPTORS` doc block and the "split out of `executeMetaTool`" note on `runSearchTools` move word for word). Exports `META_TOOL_DESCRIPTORS`, `META_TOOL_IDS`, type `MetaToolCatalogAudit`, `runSearchTools`, `runDescribeTool`, `runExecuteDelegatedTool`, `runTypedTool`. Imports nothing from `byok-tool-surface.ts`. `byok-tool-surface.ts` imports these and keeps `metaTools: META_TOOL_DESCRIPTORS` in its return.
  2. HELPERS in `byok-tool-surface.ts` (module level, above `createByokToolSurface`, in this order):
     - `surfaceFederationConnect({ options, desktop }: SurfaceFederationConnectInput): NonNullable<ByokToolSurfaceOptions["federationConnect"]>` ← the `options.federationConnect ?? createDefaultConnect({ resolver: … }, { bearerToken: desktop.bearerToken })` expression.
     - `awaitWithin({ start, timeoutMs }: AwaitWithinInput): Promise<{ readonly settled: boolean }>` ← `awaitFederation`'s `timer`/`Promise.race`/`clearTimeout` lines; `awaitFederation` becomes `if (!federation) return { settled: true }; return awaitWithin({ start: startFederation, timeoutMs });` (its doc stays on `awaitFederation`).
     - `unknownMetaToolError({ name }: { name: string }): ByokMetaToolResult` ← the `err(…)` call with its "Reachable in practice" comment.
     - `metaToolCatalogAudit({ options, principal, run }: MetaToolCatalogAuditInput): MetaToolCatalogAudit | undefined` ← the `catalogAudit` expression (comment moves).
     - `createByokRun({ principal, run, visibleRegistry, executeMetaTool }: CreateByokRunInput, limits = {}): ByokToolRun` ← body of `createRun` (its doc moves); `createRun` becomes a one-line adapter keeping its signature.
     - `buildDaemonCalls({ executor, visibleRegistry, deleteScope, syncInstalled }: BuildDaemonCallsInput): ByokToolSurface["daemonCalls"]` ← the `daemonCalls: { … }` literal.
- **Importers to update:** `apps/website/src/assistant/__tests__/byok-tool-surface.test.ts` (`META_TOOL_DESCRIPTORS` → `../byok-tool-surface-meta-tools.js`). Re-check with `rg -n "META_TOOL_DESCRIPTORS|META_TOOL_IDS|runSearchTools|runTypedTool" apps/website --glob '!node_modules'` (others are comments).
- **After:** `byok-tool-surface.ts` ~345; `createByokToolSurface` ~92; `byok-tool-surface-meta-tools.ts` ~175.
- **Risks / notes:** `catalog` is a reassigned `let` read by `executeMetaTool` and rebuilt by `onAdmitted`, `ready`, `startFederation`, `syncInstalled` — all of those stay inside `createByokToolSurface`; no helper may take `catalog` by value. `exposure!` in `executeMetaTool` is existing code; keep verbatim, do not add new `!`. After-move: survey MIXED — the meta-tool runners (unit A) mirror `@jini-ai/http-kit`'s tool-catalog; they are the part a Jini move would take, and step 1 isolates them.

### tovu:apps/website/src/features/agent-plugins/automatic-agent-plugins.ts
- **Over:** `createAutomaticPluginRuns` 142 (file 175, under)
- **Phase:** after-move (MIXED: MOVE-AFTER(ports) `createAutomaticPluginRuns`… — label truncated in the survey) · **Batch:** size-56
- **Tests:** `apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts`, `assistant/__tests__/tool-registrations.contracts.test.ts`, `server/runtime/composition/modules/__tests__/assistant-agent-plugin-preflight.integration.test.ts`, `features/agent-plugins/__tests__/unit/tool-registrations.unit.test.ts` (website runner). No mocks of the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `type Entry = { … }`, `const chatKey = (context…) =>` | turn-entry shape + chat identity key |
| B | `function createEntry({ mode, context, turnId, runId })` (48 lines: controller ports `list`/`rank`/`resolve`/`ask`/`saveAuto`/`publish`) | wire one logical turn's automatic-use controller to catalog, resolver, consent card and settings |
| C | the `load_agent_plugin` handler inside `buildDomainRegistrations({ … handlers: { … } })` | load one plugin's guidance for a run, with the per-status note |
| D | `turns`/`runs`/`lateAnswers`, `releaseDetached`, `start`, `rejoin`, `preflight`, `withLateAnswer`, `prepareGuidance`, `loadRegistration` call, `forget`, return | turn/attempt bookkeeping (stays) |

- **Splits** (same file, module level, above `createAutomaticPluginRuns`, in this order):
  1. Lift `type Entry` to module level as `type AutomaticPluginEntry` (identical body); inside the function keep `type Entry = AutomaticPluginEntry;` only if needed to avoid touching every annotation — otherwise rename the 8 uses. Lift `chatKey` unchanged to module level (pure, reads nothing from the closure).
  2. HELPER `createAutomaticPluginEntry({ mode, context, turnId, runId, deps, surfaces, askAgentPluginChoice, lateAnswers }: CreateAutomaticPluginEntryInput): AutomaticPluginEntry` ← body of `createEntry` verbatim (all its comments, incl. "A retry can replace this attempt…", "Detached turns already hand late consent…", "Preflight callers keep the turn running…"; both `ToolInputError` messages byte-identical). In the function: `function createEntry(input: { mode: ChatAgentPlugins; context: AutomaticPluginRun; turnId: string; runId: string }): Entry { return createAutomaticPluginEntry({ ...input, deps, surfaces, askAgentPluginChoice, lateAnswers }); }` (keep its doc comment on the helper).
  3. HELPER `loadAgentPluginGuidance({ raw, run, principal, signal, runs, release }: LoadAgentPluginGuidanceInput): Promise<…same return type as today…>` ← the `load_agent_plugin` handler body verbatim (input checks, entry lookup, `controller.load(...).finally(() => release(entry))`, the `notes` table, maturity spread). `release: (entry: AutomaticPluginEntry) => void` = `releaseDetached`. In the registration: `handlers: { load_agent_plugin: ({ input: raw, run, principal, signal }) => loadAgentPluginGuidance({ raw, run, principal, signal, runs, release: releaseDetached }) }`. Keep `catalogModule: 'assistant/automatic-agent-plugins.ts'` byte-identical (contract test reads it).
- **Importers to update:** none (no export moves).
- **After:** `createAutomaticPluginRuns` ~74; `createAutomaticPluginEntry` ~50; `loadAgentPluginGuidance` ~24; file ~190.
- **Risks / notes:** inside `createEntry` the `let entry` / `let approvedPreferenceRevisionSeq` are assigned and read by the port closures — they move together into the helper, unchanged. `lateAnswers` is a shared `Map` passed by reference (writes in `publish` must hit the same map `withLateAnswer` reads). After-move: survey says `createAutomaticPluginRuns` moves to Jini once ports exist; the split keeps all three pieces in this one file so the move stays a single-file move.

### tovu:apps/website/src/features/comments/tool-registrations.ts
- **Over:** `buildCommentsRegistrations` 127 (file 265)
- **Phase:** after-move (MOVE-AFTER settings feature, c…) · **Batch:** size-56
- **Tests:** `apps/website/src/features/comments/__tests__/tool-registrations.get-comment.test.ts`, `…/tool-registrations.list-validation.test.ts`, `…/tool-registrations.model-facing-errors.test.ts`, `…/tool-registrations.update-settings-validation-status.test.ts`, `…/provider-tools.test.ts`, `…/agent-tools.trash-confirmation.test.ts` (all under `apps/website/src/features/comments/__tests__/`)
- **Responsibility map:** handlers object = provider (`comments_get_provider`, `comments_set_provider`) · reads (`comments_get_comment`, `comments_list_moderation_queue`) · settings (`comments_get_settings`, `comments_update_settings`) · moderation (`comments_approve_comment`, `comments_mark_comment_spam`, `comments_trash_comment`, `comments_restore_comment`).
- **Splits** (HELPERS, same file, above `buildCommentsRegistrations`):
  1. `buildCommentsProviderHandlers({ routeDeps, surfaces, providerRegistry, providerPermission }): Record<string, ToolHandler>` ← the two provider entries; move `providerRegistry`/`providerPermission` arrows into it if nothing else reads them (outline: only `handlers` does) — then input is `{ routeDeps, surfaces }`.
  2. `buildCommentsReadAndSettingsHandlers({ routeDeps }): Record<string, ToolHandler>` ← `comments_get_comment` through `comments_update_settings` (four entries, contiguous).
  3. `buildCommentsModerationHandlers({ routeDeps, surfaces }): Record<string, ToolHandler>` ← the four moderation entries (incl. the trash handler and its confirmation comments).
  `handlers = { ...1, ...2, ...3 }` (original key order kept).
- **Importers to update:** none.
- **After:** `buildCommentsRegistrations` ~20; helpers ~40 / ~45 / ~45; file ~275.
- **Risks / notes:** keep `surfaces` default parameter on `buildCommentsRegistrations` unchanged.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/desktop/src/tovu-server.ts apps/website/src/assistant/byok-tool-surface.ts apps/website/src/features/agent-plugins/automatic-agent-plugins.ts apps/website/src/features/comments/tool-registrations.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
