# Terra job size-03: split 4 Tovu file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Tovu clone you are given (Tovu only). `TOVU` below = that clone's root.

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
### tovu:apps/website/src/assistant/demo-a2ui-tool.ts
- **Over:** `buildDemoA2uiRegistrations` 102 (file 164, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-03
- **Tests:** `apps/website/src/assistant/__tests__/demo-a2ui-tool.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`, `apps/website/src/assistant/__tests__/cross-site-read-catalog.test.ts`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | the three `await emitA2ui({ version: "v1.0", … })` literals | A2UI message content for each turn |
| B | `firstStep` / `secondStep` ternaries | action payload → `RoundTripStep` |
| C | handler: exchange open, abort wiring, receive/early-return, finally close; `buildDomainRegistrations` call | the round-trip flow (stays) |

- **Splits** (same file, module level, above `buildDemoA2uiRegistrations`, after `noAnswerResult`):
  1. PURE `demoCreateSurfaceMessage({ surfaceId }: DemoSurfaceMessageInput): AgentToRendererMessage` ← the `createSurface` literal (uses `CATALOG.catalogId`).
  2. PURE `demoContinueComponentsMessage({ surfaceId }: DemoSurfaceMessageInput): AgentToRendererMessage` ← the first `updateComponents` literal (root/title/status/Continue button).
  3. PURE `demoFinishComponentsMessage({ surfaceId, stepName, timestamp }: DemoFinishComponentsMessageInput): AgentToRendererMessage` ← the second `updateComponents` literal; `timestamp: string | undefined` and the text keeps `${timestamp ?? "an unknown time"}` exactly.
  4. PURE `roundTripStepFrom({ action }: RoundTripStepFromInput): RoundTripStep` ← the ternary `action ? { name: action.name, context: action.context } : { name: "unknown", context: {} }`; `action` type = `ReturnType<typeof readActionPayload>`. Used for both `firstStep` and `secondStep`.
  5. Handler becomes: `await emitA2ui(demoCreateSurfaceMessage({ surfaceId }))`, `await emitA2ui(demoContinueComponentsMessage({ surfaceId }))`, …, `await emitA2ui(demoFinishComponentsMessage({ surfaceId, stepName: firstStep.name, timestamp: firstAction?.timestamp }))`. Same awaits, same order; `validateDemoA2uiMessage` still runs inside `emitA2ui`.
- **Importers to update:** none (no export moves).
- **After:** file ~180; `buildDemoA2uiRegistrations` ~50; helpers ≤ 25.
- **Risks / notes:** the `/** Validates every outgoing message … */` comment stays on `emitA2ui`. Message objects must be built fresh per call (no shared constants) — validation may mutate nothing, but keep it identical to today.

### tovu:apps/website/src/cli/program.ts
- **Over:** `createProgram` 196 (file 229, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-03
- **Tests:** `apps/website/src/cli/__tests__/unit/program-actions.unit.test.ts`, `apps/website/src/cli/__tests__/unit/plugin-command.unit.test.ts`, `apps/website/src/cli/__tests__/unit/deploy-config-target-help.unit.test.ts`, `apps/website/src/cli/__tests__/unit/export-public-url.unit.test.ts`, `apps/website/src/cli/__tests__/integration/introspect-command.integration.test.ts`, `apps/website/src/platform/site-dir/__tests__/integration/init-blank-site.integration.test.ts` (skip `storage-move.postgres.test.ts` unless Postgres is configured)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `program.command("site")…rename`, `program.command("import")`, `program.command("import-local")`, `program.command("sites")…move-home` | moving sites in/out/around |
| B | `const pluginProgram = program.command("plugin")` + its `install` / `integrity` | local plugin commands |
| C | the `program` chains for `init`, `agent-plugins token-sign-in`, `storage move`, `adopt`, `serve`, `export` | one site folder's lifecycle |
| D | `const themeProgram = program.command("theme")` + `validate`, `migrate`, `generate-index`, `sync-originals`, `normalize-build` | theme authoring group |
| E | `const deployProgram = program.command("deploy")` + `config` | deploy config group |
| F | program header, `registerOwnerStoreCommands`, `reset-owner`, `introspect`, `return program` | program assembly (stays) |

- **Splits** (same file, module level, between `JSON_SUMMARY_DESCRIPTION` and `createProgram`, in call order). All take the same shape as the existing `registerOwnerStoreCommands`: `({ program }: { program: Command }): void` (declare one `interface CliProgramInput { program: Command }` and use it for the new five):
  1. `registerSiteTransferCommands` ← from `program.command("site").description("manage local site folders")` through the `sites`/`move-home` chain.
  2. `registerPluginCommands` ← `const pluginProgram = …` through the `integrity` chain.
  3. `registerSiteFolderCommands` ← from the `program` chain whose first `.command` is `"init"` through the `"export"` chain, incl. the "Registered next to `init` deliberately" comment above `adopt`.
  4. `registerThemeCommands` ← the "Namespaced command group (2026-08-18 …)" comment, `const themeProgram = …`, all five `themeProgram` chains.
  5. `registerDeployCommands` ← the "Namespaced command group (mirrors `theme`…)" comment, `const deployProgram = …`, the `config` chain.
  6. `createProgram` keeps: `new Command`, description, `exitOverride`, `configureOutput`, `registerOwnerStoreCommands({ program })`, the `reset-owner` chain, then calls 1-5 in that order, then the `introspect` chain, `return program`.
- **Importers to update:** none (no export moves).
- **After:** file ~240; `createProgram` ~25; `registerSiteFolderCommands` ~80; others ≤ 50.
- **Risks / notes:** command REGISTRATION ORDER is observable (`--help`, `introspect` JSON) — calls must run in exactly the original order (owner-store → reset-owner → transfer → plugin → site-folder → theme → deploy → introspect). `JSON_SUMMARY_DESCRIPTION` is module-level, so helpers can read it directly.

### tovu:apps/website/src/features/agent-plugins/lifecycle.ts
- **Over:** `createTovuAgentPluginLifecycle` 111 (file 228, under)
- **Phase:** now (STAY-WIRING; survey also marks its positional compatibility exports for DELETE — separate job) · **Batch:** size-03
- **Tests:** `apps/website/src/features/agent-plugins/__tests__/unit/trusted-plugin-files.unit.test.ts`, `apps/website/src/features/agent-plugins/__tests__/unit/bundled-ui-ux-design-package.unit.test.ts`, `apps/website/src/server/runtime/composition/__tests__/site-guide-tools.test.ts`, `apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts`, `apps/website/src/server/runtime/boot/__tests__/bootstrap-reporting.unit.test.ts`, `apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled.integration.test.ts`, `apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugins-http.integration.test.ts`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `policy.onEvent` body, `policy.formatBundledUninstallRecovery` | host log/dedupe of lifecycle events; recovery sentence |
| B | `async function resolveHostPluginRefs(` (+ its JSDoc) | host guidance: maturity notices + overlays around Jini's refs |
| C | return's `loadPluginContributions` | supersession-aware contribution loading |
| D | return's `createBundledSourceArchiveReader` | adapt Jini's reader to the host port shape |
| E | `unbound`, `policy` (rest), `owner`, `manifests`, `soonCatalog`, the rest of the return | wiring (stays) |

- **Splits** (same file, module level, after `reportedIdentityWarnings`, above `createTovuAgentPluginLifecycle`). Add `type TovuLifecycleOwner = ReturnType<typeof createAgentPluginLifecycle>;`.
  1. `reportAgentPluginLifecycleEvent({ event, message, pluginId }: ReportAgentPluginLifecycleEventInput): void` ← the body of `policy.onEvent` (reads module-level `reportedIdentityWarnings`). `policy.onEvent: reportAgentPluginLifecycleEvent`. Input type = the parameter type of `AgentPluginLifecycleOptional["onEvent"]` (use `Parameters<NonNullable<AgentPluginLifecycleOptional["onEvent"]>>[0]`).
  2. `bundledUninstallRecoveryText({ pluginId }: { pluginId: string }): string` ← the template string of `formatBundledUninstallRecovery` (exact text, both lines).
  3. `createHostPluginRefResolver({ owner, hostOverlaysDir }: CreateHostPluginRefResolverInput): (input, options?) => ReturnType<TovuLifecycleOwner["resolveAgentPluginRefs"]>` ← `resolveHostPluginRefs` with its JSDoc moved above the factory; inside, `optional.hostOverlaysDir` → `hostOverlaysDir`. In the main function: `const resolveHostPluginRefs = createHostPluginRefResolver({ owner, hostOverlaysDir: optional.hostOverlaysDir });` placed where the function declaration was (after `manifests`).
  4. `createSupersessionAwareContributionLoader({ owner, manifests }: CreateSupersessionAwareContributionLoaderInput)` returning the generic `async <D, T>(input, options) => …` arrow exactly as written in the return; return key becomes `loadPluginContributions: createSupersessionAwareContributionLoader({ owner, manifests })`.
  5. `adaptBundledSourceArchiveReader({ owner }: { owner: TovuLifecycleOwner }): AgentPluginArchiveReaderPort` ← the body of `createBundledSourceArchiveReader`; return key becomes `createBundledSourceArchiveReader: () => adaptBundledSourceArchiveReader({ owner })`.
- **Importers to update:** none (no export moves).
- **After:** file ~250; `createTovuAgentPluginLifecycle` ~70; helpers ≤ 25.
- **Risks / notes:** `policy.migrateBeforeSeed` closes over `owner` declared AFTER `policy` (called later, so TDZ-safe) — leave it inline; do not reorder `policy`/`owner`. `bootstrap-reporting.unit.test.ts` `mock.module`s this file with `...lifecycle` spread — unaffected since no export moves. `TovuAgentPluginLifecycle` is `ReturnType<typeof createTovuAgentPluginLifecycle>`: keep return member types identical (generic loader must stay generic).

### tovu:apps/website/src/features/database/tool-registrations.ts
- **Over:** `buildDatabaseRegistrations` 106 (file 172, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-03
- **Tests:** `apps/website/src/assistant/__tests__/tool-registrations.database-recovery.test.ts`, `apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | the `[MIGRATE_TOOL_ID]: humanConfirmedToolHandler(surfaces, { flag: "migrated", prepare, dialog, run })` entry | human-confirmed "update the database" tool (plan → dialog → confirm → execute) |
| B | `migrateHooks`, `portable`, `restorePointTool` guard, the rest of `handlers` (portable read tools, `database_plan_migrate_forward`, `backup_create_restore_point`), `buildDomainRegistrations` | registration wiring (stays) |

- **Splits** (same file, module level, directly above `buildDatabaseRegistrations`):
  1. `buildMigrateForwardToolHandler({ routeDeps, surfaces, migrateHooks }: BuildMigrateForwardToolHandlerInput): ToolHandler` ← the value expression `humanConfirmedToolHandler(surfaces, { … })` of the `[MIGRATE_TOOL_ID]` key, verbatim (prepare/dialog/run bodies, error text, `ToolInputError` message unchanged). `migrateHooks: (actorId: string) => <its current return type>` — type it as `ReturnType`-free by declaring `migrateHooks` with an explicit type alias `type MigrateHooksFactory = (actorId: string) => ReturnType<typeof buildMigrateForwardHooks>` only if `migrateHooks` already returns `buildMigrateForwardHooks(...)` (check its body at `const migrateHooks = (actorId: string) =>`); otherwise use `typeof migrateHooks` is impossible across scopes, so export nothing and spell the existing return type. In `handlers`: `[MIGRATE_TOOL_ID]: buildMigrateForwardToolHandler({ routeDeps, surfaces, migrateHooks }),`.
- **Importers to update:** none (no export moves).
- **After:** file ~180; `buildDatabaseRegistrations` ~50; `buildMigrateForwardToolHandler` ~58.
- **Risks / notes:** `database_plan_migrate_forward` contains a pre-existing `hooks as unknown as GatedMutationHooks<…>` — it is NOT moved by this plan (stays inline) so the banned-cast rule is not triggered; do not touch it. The moved block keeps its single `as GatedMutationHooks<unknown, unknown>` casts verbatim (pre-existing; not `as any`/`as unknown as`). Same `surfaces` instance passed in (default param is evaluated once per `buildDatabaseRegistrations` call, as today).

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/website/src/assistant/demo-a2ui-tool.ts apps/website/src/cli/program.ts apps/website/src/features/agent-plugins/lifecycle.ts apps/website/src/features/database/tool-registrations.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
