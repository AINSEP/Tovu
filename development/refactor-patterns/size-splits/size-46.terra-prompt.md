# Terra job size-46: split 2 Tovu file(s) by responsibility (size limits)

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
### tovu:apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx
- **Over:** file 1033 lines · `useExecutionConfig` 134
- **Phase:** after-move (MIXED) · **Batch:** size-46
- **Tests:** `apps/admin/src/components/AssistantDock/__tests__/AssistantDock.hooks.unit.test.tsx`, `apps/admin/src/components/__tests__/AssistantDock.hooks.unit.test.tsx`, `apps/admin/src/components/__tests__/AssistantDock.unit.test.tsx`, `apps/admin/src/components/__tests__/AssistantDock.execution-refresh.unit.test.tsx`, `apps/admin/src/components/__tests__/AssistantDock.runtime-access.unit.test.tsx`, `apps/admin/src/components/AssistantDock/__tests__/agents-loader.unit.test.ts`, `apps/admin/src/components/AssistantDock/__tests__/use-messages-change-handler.unit.test.tsx`, `apps/admin/src/components/AssistantDock/__tests__/skill-composer-routing.unit.test.tsx`, `apps/admin/src/components/AssistantDock/__tests__/daemon-prewarm-error.unit.test.tsx`, `apps/admin/src/lib/__tests__/execution-settings.test.ts`, `apps/admin/src/hooks/__tests__/use-tovu-execution-adapters.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `UseExecutionConfig`, `DockExecutionConfigPort`, `defaultDockExecutionConfigPort`, `EXECUTION_CONFIG_MAX_AGE_MS`, `useExecutionConfig` | runtime picker execution config |
| B | `useByokRuntime`, `BYOK_PRESET_ICON_IDS`, `useLocalCliSelection`, `useComposerCapabilities`, `useSelectedAgentPlugins`, `useChatI18n`, `useSelectedPluginChips` | composer/runtime picker state (stays) |
| C | `useAssistantTransport`, `useLocalCliDaemonPrewarm`, `pageBindToken`, `withLatestLocalCliSelection` | chat transport + daemon prewarm |
| D | `CHAT_ATTACHMENT_*`, `useAttachmentUploader`, `useSkillAwareAttachmentUploader`, `resolveSkillsAvailable`, `useAttachmentValidator` | attachments |
| E | `AGENTS_URL` … `useAgentsPlaceholder` (agents fetch/cache/deadlines, resume-capable set, `readDaemonOnline`, `useRuntimeAccess`) | agents inventory + runtime access |
| F | `useWorkingDirectoryAccess`, re-export, `useComposerDiscoverySelect` | composer discovery (stays) |
| G | `shouldPublishOnMessagesChange`, `ToolProgressMark`, `shouldPublishContentOnToolProgress`, `useMessagesChangeHandler` | content-refresh announcements |
| H | `includeIfDefined`, `includeIfNonEmptyString`, `includeIfNonEmptyArray`, `resolveRunContext`, `useRunContext` | per-call run context |
| I | `buildAssistantMcpUiSandboxProxyUrl`, `openMcpUiLink` | MCP-UI host glue |
| J | `useChatsSeam` … `useFolderDropBridge` | seam layer (stays) |

- **Splits** (all new files in `components/AssistantDock/hooks/`; names plan-given):
  1. NEW `AssistantDock-agents.hooks.ts` — Moves unit E with its comments (incl. the module-scoped `resumeCapableAgentIds` and `agentsDeadlines` state — must move together). Exports `extractResumeCapableAgentIds`, `resetResumeCapableAgentIds`, `getResumeCapableAgentIds`, `AgentsLoader`, `replaceAgents`, `createAgentsLoader`, `useRuntimeAccess`, `useAgentsPlaceholder`.
  2. NEW `AssistantDock-transport.hooks.ts` — Moves unit C; imports `getResumeCapableAgentIds` from step 1. Exports `useAssistantTransport`, `useLocalCliDaemonPrewarm`.
  3. NEW `AssistantDock-attachments.hooks.ts` — Moves unit D. Exports the 4 functions.
  4. NEW `AssistantDock-messages-change.hooks.ts` — Moves unit G (+ its long rationale comments). Exports all four.
  5. NEW `AssistantDock-run-context.hooks.ts` — Moves unit H. Exports `resolveRunContext`, `useRunContext`.
  6. NEW `AssistantDock-mcp-ui.ts` — Moves unit I. Exports both.
  7. NEW `AssistantDock-execution-config.hooks.ts` — Moves unit A. Inside it, SUB-HOOKS above `useExecutionConfig`: `useExecutionConfigRefresh({ io, configKey, configLoader, invalidate, executionConfigRef, localWriteRef, setExecutionConfigState, setConfigLoaded }: UseExecutionConfigRefreshInput): { refreshExecutionConfig: () => Promise<ExecutionConfig>; readExecutionConfigForSend: () => Promise<ExecutionConfig> }` ← from `const lifecycleRef = useRef<AbortController | null>(null);` through the `useEffect(() => {` that uses `lifecycleRef,refreshExecutionConfig` (~L255–331); `useStoredAdminKeyPresence({ credentialLoader, invalidate, credentialKey }): boolean | null` ← `const [hasStoredAdminKey, …] = useState` + its `useEffect` (~L347–373). Keep hook call order: refresh sub-hook where the refs were, key-presence after.
  Original keeps B, F, J; seams import from the new files (no new file imports `AssistantDock.hooks.tsx`).
- **Importers to update** (rg each name; `AssistantDock.tsx` and `hooks/use-tovu-execution-adapters.hooks.ts`, `hooks/use-dock-renderer-registry.hooks.ts`, `lib/assistant-transport.ts`, `lib/agent-screen-context.ts`, `features/taxonomy/hooks/use-taxonomy.hooks.ts`, `components/AssistantDock/execution-config-write.ts`, plus ~20 tests listed by `rg -l "AssistantDock\.hooks" apps/admin/src`): repoint each moved name to its new module.
- **After:** original ~415; `useExecutionConfig` ~50; new files ~140 / ~120 / ~40 / ~70 / ~75 / ~25 / ~160.
- **Risks / notes:** no `vi.mock` of this module found. Module-level mutable state (`resumeCapableAgentIds`, `agentsDeadlines`) must live in exactly one module — tests call `resetResumeCapableAgentIds` and must import from the new file. `useExecutionConfigRefresh` closes over refs only — pass refs, not `.current`.

### tovu:apps/admin/src/features/ai-assistant/AiAssistant.tsx
- **Over:** file 655 lines · `AiAssistant` 118 · `VisitorCredentialForm` 108
- **Phase:** after-move (MIXED; STAY-PRODUCT `AiAssistant` screen) · **Batch:** size-46
- **Tests:** `apps/admin/src/features/ai-assistant/__tests__/AiAssistant.unit.test.tsx`, `apps/admin/src/features/ai-assistant/__tests__/VisitorCredentialForm.unit.test.tsx`, `apps/admin/src/features/ai-assistant/__tests__/AdminExecutionMode.unit.test.tsx`, `apps/admin/src/features/ai-assistant/__tests__/AssistantDaemonRestart.unit.test.tsx`, `apps/admin/src/features/ai-assistant/__tests__/byok-no-key-message-i18n.unit.test.tsx`, `apps/admin/src/hooks/__tests__/tovu-execution-entry-points.integration.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `RoadmapItem`, `ROADMAP`, `TabIcon`, `RoadmapChecklist`, `AiAssistantLocaleSync`, `AiAssistantProps`, `AiAssistant` | screen shell + tabs (stays) |
| B | `AdminAssistantSwitch*`, `AdminExecutionMode*`, `resolve*Hook`, `resolveT`, `AssistantDaemonRestart*`, `assistantDaemonStatusMessage`, `assistantRestartResultMessage`, `adminExecutionByok` | admin-assistant controls (stays) |
| C | `VisitorCredentialKeyFooterProps`, `VisitorCredentialSettingsFooterProps`, `visitorCredentialKeyIdleMessage`, `visitorCredentialKeyStatusMessage`, `VisitorCredentialKeyActionsProps`, `VisitorCredentialKeyActions`, `VisitorCredentialKeyFooter`, `VisitorCredentialSettingsFooter`, re-export `visitorCredentialApiKeyPlaceholder`, `VisitorCredentialFormProps`, `VisitorCredentialForm`, `visitorPresetId` | site (visitor) provider credential form |

- **Splits:**
  1. NEW `apps/admin/src/features/ai-assistant/AiAssistant-visitor-credential.tsx` — job: the visitor assistant's provider credential form. Moves unit C with all comments (the long "The SITE's provider credential" block). `resolveT` is needed by both files: move `resolveT` into the new file and export it; `AiAssistant.tsx` imports it (no cycle). Exports: `VisitorCredentialForm`, `VisitorCredentialKeyActions`, `VisitorCredentialKeyFooter`, `VisitorCredentialSettingsFooter`, `visitorCredentialKeyStatusMessage`, `visitorCredentialApiKeyPlaceholder` (re-export moves with it), `resolveT`.
  2. SUB-COMPONENT in new file above `VisitorCredentialForm`: `VisitorProviderPicker({ providerSelectId, t, preset, selectPresetById, providerGroups }): ReactNode` ← the first `<div className="visitor-inline-field">` (Provider `<select>` with its `providerGroups.map` options) and its comment.
  3. HELPER in `AiAssistant.tsx` above `AiAssistant`: `buildAiAssistantTabs({ t, settings, saving, saveError, setPublicEnabled, setWidget }: BuildAiAssistantTabsInput): SettingsDialogTab[]` ← `const tabs: SettingsDialogTab[] = [` … `];` (with the "Two tabs" comment and the roadmap-tab JSDoc). `AiAssistant` calls it after the two early returns (same spot).
- **Importers to update:** `features/ai-assistant/__tests__/VisitorCredentialForm.unit.test.tsx` (all moved names); `features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts`, `hooks/use-admin-execution-credential.hooks.ts`, `rules.ts`, `ai-assistant-i18n.ts` — check each with `rg -n "from .*AiAssistant['\"]"` (several only mention names in comments). `AiAssistant.tsx` imports `VisitorCredentialForm` from the new file.
- **After:** `AiAssistant.tsx` ~400; `AiAssistant` ~62; `VisitorCredentialForm` ~85; new file ~260.
- **Risks / notes:** `apps/admin/src/__tests__/app-boot-request-volume.test.tsx` `vi.mock`s `../features/ai-assistant` (the index) — unaffected. After the Tovu→Jini move only `AiAssistant` stays product; the visitor-credential file is the likelier mover, which this split makes easier.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx apps/admin/src/features/ai-assistant/AiAssistant.tsx <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
