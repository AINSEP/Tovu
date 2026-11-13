# Terra job size-09: split 4 Tovu file(s) by responsibility (size limits)

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
### tovu:apps/website/src/server/runtime/composition/other-site-keys.ts
- **Over:** `createOtherSiteKeys` 116 (file 167, under)
- **Phase:** now (label ?) · **Batch:** size-09
- **Tests:** `apps/website/src/server/runtime/composition/__tests__/other-site-keys.integration.test.ts`. No test mocks this module.
- **Responsibility map:**

| unit | nested functions | job |
|---|---|---|
| A | `readSource` | open one site source read-only, read, always close |
| B | `promote` | adopt a key into Shared Keys (reuse same-secret key, else free id/label) |
| C (stays) | `projectVault`, `sources`, `label`, `readPlainly`, `hasSafeNames`, `lockedReason`, key-id helpers, the returned `list`/`find`/`adopt` | list/find/adopt other sites' keys |

- **Splits:** HELPERS at module level directly above `createOtherSiteKeys`, bodies word for word with their comments:
  1. `readSiteSource<T>({ source, read, workspace, home, openSource, sources }: ReadSiteSourceInput<T>): Promise<T>` ← A (`sources` = the `sources` arrow, passed as a function). Keep `const readSource = <T>(input: { source: Source; read: … }) => readSiteSource<T>({ ...input, workspace, home, openSource, sources });` — `readPlainly`'s `Parameters<typeof readSource<T>>[0]` keeps working.
  2. `promoteToSharedKey({ summary, payload, source, projectVault, project, label }: PromoteToSharedKeyInput)` ← B (return type copied). `adopt` calls it with the extra three.
  Types: `workspace: SitesWorkspace`, `home: string`, `openSource: typeof openSqliteFileKernel`, `projectVault: SecretsVaultService`, `project: ProjectVaultScope`, `label: (source: Source & { isTarget?: boolean }) => string`.
- **Importers to update:** none.
- **After:** `createOtherSiteKeys` ~86; file ~180.
- **Risks / notes:** none.

### tovu:apps/website/src/server/runtime/composition/provider-plugins.ts
- **Over:** `bootProviderPlugins` 147 (file 365, under)
- **Phase:** now (label ?) · **Batch:** size-09
- **Tests:** `apps/website/src/server/runtime/composition/__tests__/provider-plugins.unit.test.ts`, `.../__tests__/plugin-runtime.provider-plugins.test.ts`, `.../__tests__/boot-settings-rejection.integration.test.ts`. Check `rg -n "mock.*provider-plugins" apps/website/src` before starting (none found at design time).
- **Responsibility map** (inside `bootProviderPlugins`):

| unit | statements | job |
|---|---|---|
| A | nested `replaceSlot` | (re)initialize one slot's lease from saved settings, retiring the old one |
| B | nested `applySlots` | apply a plugin's selected slots and report initialization outcomes |
| C | nested `ensureLoaded` | admit a configured plugin through the runtime once |
| D | nested `selectSlots` | find (or admit new form-collection) slots for a plugin |
| E (stays) | settings decls, `initialization`, `closed`, `apply`, `reapply`, `leases` loop, boot apply, port composition, returned handle | boot + live reapply lifecycle (owns the mutable `tracker`, `closed`, `formCollectionRegistry`, `disposal`) |

- **Splits:** HELPERS at module level directly above `bootProviderPlugins` (after `isTelemetrySlot`), in this order; every comment/JSDoc inside moves with its body:
  1. `replaceProviderSlot({ slot, saved, initialization, host, required, release, exportOptions, delivery, info }: ReplaceProviderSlotInput): Promise<void>` ← `replaceSlot` body (`info` = `optional.info`, keep the `?? ((message) => console.info(message))` fallback inside). Types: `host: ReturnType<typeof createPluginProviderHost>`, `delivery: ReturnType<typeof createTelemetryDeliveryMonitor>`, `exportOptions: (contract: ProviderSlotContract) => …` (copy the inferred type or use `ReturnType`), `initialization: (input: { slot: ProviderSlot; outcome: …; reasonClass: string }) => void` (copy from source).
  2. `applyProviderSlots({ selected, saved, replaceSlot, initialization }: ApplyProviderSlotsInput): Promise<void>` ← `applySlots` body.
  3. `ensureProviderPluginLoaded({ pluginId, selected, saved, loaded, runtime, timeoutMs }: EnsureProviderPluginLoadedInput): Promise<void>` ← `ensureLoaded` (`runtime` = `required.runtime`).
  4. `selectProviderSlots({ pluginId, slots, runtime }: SelectProviderSlotsInput): Promise<ProviderSlot[]>` ← `selectSlots` (still `slots.push(...)` on the SAME array).
  In `bootProviderPlugins` replace the four nested functions with one-line locals at the same spot, e.g. `const replaceSlot = (slot: ProviderSlot, saved: ProviderPluginConfig | null) => replaceProviderSlot({ slot, saved, initialization, host, required, release, exportOptions, delivery, info: optional.info });`, `const applySlots = …`, `const ensureLoaded = …`, `const selectSlots = …` — `apply` keeps calling them by the same names.
- **Importers to update:** none (no export moves).
- **After:** `bootProviderPlugins` ~92; `replaceProviderSlot` ~33; file ~390.
- **Risks / notes:** `initialization` closes over the `let tracker` (assigned after boot) — pass the function, never `tracker` itself. Nested function declarations were hoisted; the replacement `const` locals must be declared before `reapply`'s first call (`await Promise.all([...].map(... reapply(...)))`) — placing them where the nested functions were satisfies that.

### tovu:apps/website/src/server/runtime/composition/tool-catalog-manifest.ts
- **Over:** `installFirstPartyToolContributors` 252 (file 384, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-09
- **Tests:** `apps/website/src/features/deployments/deploy-ops/__tests__/search-discoverability.test.ts`, `apps/website/src/features/publish-content/__tests__/publish-agent-tools.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.trash-item.test.ts`, `apps/website/src/assistant/__tests__/byok-tool-surface.test.ts`, `apps/website/src/features/fs-files/__tests__/wiring.integration.test.ts`. No test mocks this module.
- **Responsibility map:** one function = the first-party tool manifest. Most statements are one-line `contributions.contributors.register(...)`; six blocks carry their own wiring and become helpers.

| unit | statements (anchors) | job |
|---|---|---|
| A (stays) | `toolSearchKeywords({}, …)` … `contributeDeployOpsTools(…)`; `const bundledPluginsRoot = bundledAgentPluginsDir();`; the one-line registers between the blocks | manifest order + plain one-line contributors |
| B | `const domainDnsHttpClient = createHttpClient(DOMAIN_DNS_EGRESS_POLICY, …)`, `const domainDnsDiagnostics`, `const publicDnsResolver`, `contributeDomainDnsAndChangeTools<…>` register | domain DNS/TLS tools + their egress client |
| C | `const plugins = contributePluginsTools();` through `contributions.contributors.register({ contribution: { ...agentPluginsInstall, build: …` | plugin + agent-plugin install tools (attachment reader) |
| D | `contributePostTools()` register through `installFirstPartyPublishContentTypes();` | post + publish-content tools |
| E | `const publicBrowserPool = createRenderBrowserPool({` through the `contributeWebScreenshotTools(` register | public web fetch / screenshot tools sharing one browser pool |
| F | `contributions.contributors.register({ contribution: { domain: "credential-copy"` through the `provider-status` register (incl. `candidatePaths`, `committedRoot`, `findPublishCandidate`) | credential copy/save, project keys, provider status |
| G | `contributeThemesTools()` register through the final `for (const contributor of [` loop | themes, change sets, permanent delete, trash, widgets, workspace, duplicate handlers |

- **Splits:** HELPERS in the same file, module level, directly above `installFirstPartyToolContributors`, each called at the exact spot its block was (registration ORDER must not change). Every comment inside a block moves with it.
  1. `registerDomainDnsTools({ contributions, createHttpClient, observability, bundledPluginsRoot }: RegisterDomainDnsToolsInput): void` ← block B (`bundledPluginsRoot` stays declared in the main function just before the call, since F also uses it).
  2. `registerPluginInstallTools({ contributions, readInstallAttachment }: RegisterPluginInstallToolsInput): void` ← block C.
  3. `registerPostAndPublishContentTools({ contributions }: RegisterPostAndPublishContentToolsInput): void` ← block D (keeps the two publishing-tools comments and the TYPE-registry comment).
  4. `registerWebReadTools({ contributions, createHttpClient, observability }: RegisterWebReadToolsInput): void` ← block E (`web_fetch_page` / `web_screenshot_page` comments move).
  5. `registerCredentialAndProviderTools({ contributions, bundledPluginsRoot }: RegisterCredentialAndProviderToolsInput): void` ← block F.
  6. `registerThemeTrashAndWorkspaceTools({ contributions }: RegisterThemeTrashAndWorkspaceToolsInput): void` ← block G (all F7a/F7b/Owner-Q1/theme_* comments move).
  Types: `contributions: AssistantToolContributions`; `createHttpClient: typeof createDefaultHttpClient`; `observability?: ObservabilityPort`; `readInstallAttachment: InstallAttachmentReader`; `bundledPluginsRoot: string` (use the return type of `bundledAgentPluginsDir` if not `string`).
- **Importers to update:** none (no export moves).
- **After:** file ~415; `installFirstPartyToolContributors` ~85; largest helper (F) ~58.
- **Risks / notes:** registration order is observable (catalog/search order, duplicate-domain checks) — call sites must sit exactly where the blocks were. `observability` is optional in the options; keep it optional in helper inputs.

### tovu:apps/website/src/server/runtime/lifecycle/local-site-process.ts
- **Over:** `createLocalSiteProcessPort` 121 (file 229, under)
- **Phase:** now (label ?) · **Batch:** size-09
- **Tests:** `apps/website/src/server/runtime/lifecycle/__tests__/local-site-process.unit.test.ts`, `.../__tests__/local-site-process-port.unit.test.ts`, `.../__tests__/local-site-start.unit.test.ts`, `.../__tests__/warm-site-watch.unit.test.ts`. Check `rg -n "mock.*local-site-process" apps/website/src` first.
- **Responsibility map:**

| unit | statement anchor | job |
|---|---|---|
| A (stays) | `repoRoot`, `tls`, `scheme`, `let buildRoot`, `registry`, `stateForSite`, `existing`, the returned object's other props (`isPortFree`, `dispose`, …) | bind native effects |
| B | the `launch` prop from `const childBuildRoot = buildRoot;`'s next statement (`const childEnv = localSiteChildEnv({ …`) to its end | spawn one site child and hand back its `LocalSiteProcess` |

- **Splits:** HELPER at module level directly above `createLocalSiteProcessPort`: `spawnLocalSiteChild({ name, port, daemonPort, siteDir, childBuildRoot, env, repoRoot, scheme, registry, processOptions, tls, probeHttp }: SpawnLocalSiteChildInput): Promise<LocalSiteProcess>` ← every statement of `launch` after `const childBuildRoot = buildRoot;` (add `site`, `existing` or `stateForSite` to the input only if those statements reference them). `launch` keeps: `assertLocalSiteName`, the site lookup/`SITE_NOT_FOUND`, `siteDir`, the containment comment, `buildRoot ??= mkdtempSync(…)`, `const childBuildRoot = buildRoot;`, then `return spawnLocalSiteChild({ … })`. Types: `tls` = `ReturnType<typeof resolveDevTls>`, `registry` = `typeof registry` → declare a module-level type for the inline `{ readLive, write, removeIfCurrent }` literal (copy its member types), `processOptions`/`probeHttp`/`env` = the factory's option types.
- **Importers to update:** none.
- **After:** `createLocalSiteProcessPort` ~45; `spawnLocalSiteChild` ~78; file ~240.
- **Risks / notes:** `buildRoot` is a lazily-created `let` shared with `dispose` — it stays in the factory; only its snapshot `childBuildRoot` crosses into the helper.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/website/src/server/runtime/composition/other-site-keys.ts apps/website/src/server/runtime/composition/provider-plugins.ts apps/website/src/server/runtime/composition/tool-catalog-manifest.ts apps/website/src/server/runtime/lifecycle/local-site-process.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
