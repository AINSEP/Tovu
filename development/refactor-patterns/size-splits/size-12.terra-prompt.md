# Terra job size-12: split 7 Jini file(s) by responsibility (size limits)

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
### jini:packages/chat/src/react/components/ToolCard.tsx
- **Over:** file 516 lines (no function over 100)
- **Phase:** now · **Batch:** size-12
- **Package entry:** not an exports target; `src/react/index.ts` (entry `./react`) re-exports `ToolCard`, `ToolCardProps` — both STAY in ToolCard.tsx, so index.ts is untouched.
- **Tests:** `src/react/components/__tests__/ToolCard.test.tsx`, `ToolCard.batch-target.test.tsx`, `ToolCard.cli-events.test.tsx`, `ToolCard.long-chat-memory.test.tsx` (all import only `ToolCard`). `ToolCard.test.tsx` `vi.mock`s `../../../core/tool-output.js` (not this file) → still applies wherever the moved code imports it.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A dispatch (stays) | `ToolCardProps`, `JINI_TOOL_ID_PATTERN`, `ToolCard`, `ToolCardBodyArgs`, `FamilyCardRender`, `FAMILY_CARDS`, `renderRegistered`, `renderToolCardBody`, `DelegatedToolCardProps`, `DelegatedToolCard`, `GenericCard` | pick the card for a tool call |
| B parts | `RUNNING_TITLE_CLASS`, `ToolUseEvent`, `ToolResultEvent`, `CardProps`, `RetriedContext`, `ToolRowHead`, `ExpandableCard`, `CollapsedReaderText`, `ToolCallDetail`, `ErrorBadge`, `ResultBadge`, `ToolResultMedia`, `ToolResultImage`, `ToolResultImageFigure`, `FileErrorDetail`, `headSummary`, `truncate` | the row shell, badges, detail and media every card shares |
| C family cards | `FileToolCtx`, `OpenInTabButton`, `FileWriteCard`, `FileEditCard`, `FileReadCard`, `BashCard`, `GlobCard`, `GrepCard`, `WebFetchCard`, `WebSearchCard`, `SearchToolsCard`, `DescribeToolCard` | built-in per-tool-family cards |

- **Splits:**
  1. NEW `ToolCard-parts.tsx` — unit B verbatim (doc comments incl. the `RetriedContext` "read by ErrorBadge only" note and the `ExpandableCard`/`headSummary` paragraphs). Exports every moved name used by A or C (incl. `RetriedContext`, which `ToolCard` provides). Imports nothing from ToolCard.tsx.
  2. NEW `ToolCard-family-cards.tsx` — unit C verbatim. Exports the 10 card components used by `FAMILY_CARDS` + type `FileToolCtx`. Imports from `./ToolCard-parts.js` only.
  3. ToolCard.tsx imports from both; drop now-unused React imports.
- **Importers to update:** none outside the file (`ToolCard`, `ToolCardProps` stay).
- **After:** ToolCard.tsx ~115; ToolCard-parts ~165; ToolCard-family-cards ~255.
- **Risks / notes:** `ExpandableCard` keeps its own `useState` (moved verbatim; no new state, so no `.hooks.ts` needed for this file-size split). `ToolUseEvent`/`ToolResultEvent` are local aliases — export them from parts and import as types in ToolCard.tsx.

### jini:packages/chat/src/react/features/chat-pane/components/AgentRuntimePicker.tsx
- **Over:** file 516 lines (no function over 100)
- **Phase:** now · **Batch:** size-12
- **Package entry:** not an exports target. `features/chat-pane/index.ts` re-exports `AgentRuntimePicker` (stays here). The L29 `export { runtimeOptionLabel, runtimePopoverPosition… } from '../hooks/useAgentRuntimePicker.hooks.js'` re-export stays as is (existing, "public surface unchanged" comment).
- **Tests:** `src/react/features/chat-pane/__tests__/components/AgentRuntimePicker.test.tsx` (imports `runtimeAgentStatus` → path edit), `AgentRuntimePicker.native-policy.unit.test.tsx`, `AgentRuntimePicker.agent-handles.test.tsx`, `AgentRuntimePicker.access-note-icon.unit.test.tsx`, `__tests__/composer-action-hit-targets.test.tsx`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A agents | `runtimeAgentStatus`, `FullAccessNoteTip`, `NativeToolPolicyWarning`, `RuntimeAgentListProps`, `RuntimeAgentList`, `RuntimeAgentRowProps`, `RuntimeAgentRow` | agent rows, status and access warnings |
| B popover | `RuntimeModeButtonsProps`, `RuntimeModeButtons`, `RuntimeByokDetailsProps`, `resolveByokModel`, `RuntimeByokDetails`, `RuntimeRescanFooterProps`, `RuntimeRescanFooter`, `RuntimePopoverProps`, `runtimePortalBinding`, `RuntimePopover` | the portaled picker popover body |
| C (stays) | L29 re-export, `RuntimeBarMenusProps`, `RuntimeBarMenus`, `RuntimeTriggerProps`, `RuntimeTriggerIcon`, `RuntimeTrigger`, `AgentRuntimePicker` | trigger, bar menus, composition |

- **Splits:**
  1. NEW `AgentRuntimePicker-agents.tsx` — unit A verbatim (the `FullAccessNoteTip` and preflight "why" comments move). Exports `runtimeAgentStatus`, `NativeToolPolicyWarning`, `RuntimeAgentList`.
  2. NEW `AgentRuntimePicker-popover.tsx` — unit B verbatim (the `resolveByokModel` and `runtimePortalBinding` comments move). Imports `RuntimeAgentList` from `./AgentRuntimePicker-agents.js`. Exports `RuntimePopover`.
  3. AgentRuntimePicker.tsx imports `NativeToolPolicyWarning` and `RuntimePopover`; does NOT re-export `runtimeAgentStatus`.
- **Importers to update:** `__tests__/components/AgentRuntimePicker.test.tsx` (`runtimeAgentStatus` → `../../components/AgentRuntimePicker-agents.js`).
- **After:** AgentRuntimePicker.tsx ~165; -agents ~120; -popover ~235.
- **Risks / notes:** sub-components already take plain props and use only `useT`/`useId`/`useOverlayContainer`; moving them verbatim keeps behavior. `runtimeAgentStatus` was a public name of this module but not of any package entry (chat-pane `index.ts` does not export it) — confirm with `rg -n runtimeAgentStatus src` before dropping it here.

### jini:packages/chat/src/react/features/chat-pane/hooks/useAgentRuntimePicker.hooks.ts
- **Over:** `useAgentRuntimePicker` 103
- **Phase:** now · **Batch:** size-12
- **Tests:** `src/react/features/chat-pane/__tests__/hooks/useAgentRuntimePicker.cov-j2.test.ts`, `src/react/features/chat-pane/__tests__/components/AgentRuntimePicker.test.tsx` (smoke). No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | pure exports `runtimeOptionLabel` … `byokSummaryText`, option/result interfaces | labels, position math, key routing |
| B | `const [position, setPosition]`, effect `useEffect(() => {` L302 (uses open,triggerRef,setPosition,placement), effect L319 (uses open,position,popoverRef) | place the open popover and move focus into it |
| C (stays) | ids/refs, derived labels, `focusTrigger`, `toggleOpen`, dismiss effect L270, `handlePopoverKeyDown`, return | picker state |

- **Splits:**
  1. SUB-HOOK `usePopoverPlacement({ open, triggerRef, popoverRef, placement }: UsePopoverPlacementInput): CSSProperties | undefined` — module level above `useAgentRuntimePicker` ← `const [position, setPosition] = useState<CSSProperties>();` + the two effects at ~L302 and ~L319 (with their comments), same order. Call it where the L302 effect stood (after the dismiss effect), so effect order is unchanged; its `useState` moves with it (hook slot order changes, which is harmless across a code change).
- **Importers to update:** none.
- **After:** `useAgentRuntimePicker` ~82; `usePopoverPlacement` ~26; file ~225.
- **Risks / notes:** effect run order must stay: dismiss (L270) → position (L302) → focus (L319). `setPosition` is only used by the moved effect (per outline), so nothing else needs it.

### jini:packages/chat/src/react/features/chat-pane/hooks/useChatPaneRuntimeInventory.hooks.ts
- **Over:** `useChatPaneRuntimeInventory` 134
- **Phase:** now · **Batch:** size-12
- **Tests:** `src/react/features/chat-pane/__tests__/hooks/useChatPaneRuntimeInventory.test.tsx`; smoke `src/react/features/chat-pane/__tests__/components/AgentRuntimePicker.test.tsx`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | constants, interfaces, `useInventoryRetry`, `pendingRetryDelayMs` | retry bookkeeping |
| B (stays) | state, `inventory`/`health`/`retry`, reset effect L79, `loadAgents`, `reloadIfUnanswered`, `refreshStatus`, `rescanAgents`, return | load + expose the inventory |
| C | effect `useEffect(() => {` ~L144 (uses access,retry,loadAgents,refreshStatus,pollIntervalMs,inventory,health) and effect ~L187 (uses access,refreshStatus,reloadIfUnanswered) | poll status/inventory and re-check on wake/visibility |

- **Splits:**
  1. SUB-HOOK `useInventoryPolling({ access, retry, loadAgents, refreshStatus, reloadIfUnanswered, pollIntervalMs, inventory, health }: UseInventoryPollingInput): void` — module level above `useChatPaneRuntimeInventory` (below the constants) ← the two effects verbatim, same order, same dependency arrays, comments with them. Called at the old position (after `refreshStatus`, before `rescanAgents`).
- **Importers to update:** none.
- **After:** `useChatPaneRuntimeInventory` ~78; `useInventoryPolling` ~62; file ~245.
- **Risks / notes:** `inventory`/`health` are `useLatestOperation` results — pass the objects, not their fields, so cleanup cancels the same instances. Effect order is preserved because the sub-hook is called exactly where the effects stood.

### jini:packages/chat/src/react/features/chat-pane/hooks/useChatPaneWorkingDirectory.hooks.ts
- **Over:** `useChatPaneWorkingDirectory` 160
- **Phase:** now · **Batch:** size-12
- **Tests:** `src/react/features/chat-pane/__tests__/hooks/useChatPaneWorkingDirectory.test.tsx`; smoke any `useChatPane` hook test that renders the pane. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `controlled`, the 5 `useState`s, `operation`, `observedDirectoryRef`, `workingDirectory`, `reportWorkingDirectory`, `reportFailure`, `clearWorkingDirectory`, return | directory state |
| B | effect `useEffect(() => {` ~L72 (52 lines) | validate/observe the current directory and load recents |
| C | `openWorkingDirectoryPicker`, `pickWorkingDirectory`, `selectRecentDirectory` | user actions that call the native picker |

- **Splits:**
  1. SUB-HOOK `useWorkingDirectorySync({ options, workingDirectory, operation, observedDirectoryRef, reportWorkingDirectory, setWorkingDirectoryError, setWorkingDirectoryInvalid, setWorkingDirectoryPending, setRecentDirectories }: UseWorkingDirectorySyncInput): void` ← the L72 effect verbatim (pass exactly the names in its dependency array/body; the outline lists them).
  2. SUB-HOOK `useWorkingDirectoryActions({ options, operation, workingDirectory, recentDirectories, reportWorkingDirectory, reportFailure, setWorkingDirectoryError, setWorkingDirectoryPending, setWorkingDirectoryInvalid, setRecentDirectories }: UseWorkingDirectoryActionsInput): { openWorkingDirectoryPicker; pickWorkingDirectory; selectRecentDirectory }` ← the three `useCallback`s verbatim, same order and deps.
  Both module level above the main hook, called at the original positions (sync before actions).
- **Importers to update:** none.
- **After:** `useChatPaneWorkingDirectory` ~45; `useWorkingDirectorySync` ~58; `useWorkingDirectoryActions` ~70; file ~200.
- **Risks / notes:** `clearWorkingDirectory` stays in the main hook (it follows the actions; keep its position after the actions call). Setters are stable, so passing them adds no deps.

### jini:packages/chat/src/react/hooks/fab-position.ts
- **Over:** `useFabPosition` 115
- **Phase:** now · **Batch:** size-12
- **Tests:** `src/react/hooks/__tests__/fab-position.cov-j2.test.ts`; smoke the ChatFab tests (`rg -l ChatFab src --glob '*test*'`). No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | shapes, `readPersisted`, `writePersisted`, `DEFAULT_POSITION` | persisted position |
| B (stays) | refs/state, resize effect, pointer handlers, `consumeDragFlag`, return | drag behaviour |
| C | body of `const style = useMemo(() => {` (~L346, 31 lines) | turn position + dock avoidance into CSS |

- **Splits:**
  1. HELPER `fabPositionStyle({ live, dragging, isDragging, persisted, viewport, edgeMargin, sizePx, dockOpen, avoidBottomPx, avoidRightPx }: FabPositionStyleInput): CSSProperties` (use the memo's current return type) — module level above `useFabPosition` ← the memo callback's statements verbatim, with `liveRef.current` → `live`, `draggingRef.current` → `dragging`, `window` → `viewport`, `FAB_EDGE_MARGIN`/`FAB_SIZE_PX` → `edgeMargin`/`sizePx`. `useFabPosition` keeps `useMemo(() => fabPositionStyle({ live: liveRef.current, dragging: draggingRef.current, … }), [same deps incl. renderTick])`.
- **Importers to update:** none.
- **After:** `useFabPosition` ~88; `fabPositionStyle` ~32; file ~195.
- **Risks / notes:** the refs must still be read INSIDE the memo callback (at memo time), not when the hook renders — pass `.current` in the call inside the callback. Keep `renderTick` in the dependency array even though the helper does not read it (it forces recompute).

### jini:packages/chat/src/react/hooks/useComposer.ts
- **Over:** `useComposer` 208
- **Phase:** now · **Batch:** size-12
- **Tests:** `src/react/hooks/__tests__/useComposer.test.ts`, `src/react/hooks/__tests__/useComposer.draft-debounce.test.tsx`, `src/react/hooks/__tests__/useComposer.release-check.test.tsx`, `src/react/hooks/__tests__/useComposer.lifecycle.cov-j2.test.tsx`, `src/react/components/__tests__/Composer.test.tsx` (smoke). No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | interfaces, `browserPageLifecycle`, `EMPTY_MENTION`, `DRAFT_PERSIST_DEBOUNCE_MS`, `useDeferredDraftWrite`, `canReleaseAttachments` | draft write plumbing |
| B folders | `const [folders, setFolders]`, `addFolders`, `removeFolder` | pinned folders per conversation |
| C restore | `validateAttachmentsRef` (+ `.current =`), `attachmentsHydratedForRef`, restore effect ~L365, persist effect ~L406 | restore/persist staged attachments per conversation |
| D attach actions | `addAttachment`, `addAttachments`, `removeAttachment`, `clearAttachments` | edit the attachment list |
| E mention | `openMention`, `closeMention`, `selectMention` | @-mention popover |
| F core (stays) | draft state, `attachments`/`agent`/`mention` state, `pendingUploadsRef`, `deferredWrite`, `commitDraft`, `history`, `setDraft`, draftRef, conversation-change effect, `reset`, `canSubmit`, return memo | the composer |

- **Splits** (sub-hooks at module level above `useComposer`, below `useDeferredDraftWrite`; each called exactly where its first statement stood):
  1. `useComposerFolders({ conversationId }: UseComposerFoldersInput): { folders; setFolders; addFolders; removeFolder }` ← unit B (the "persist inside the updater" comment moves). Only state + callbacks, no effects.
  2. `useAttachmentRestore({ conversationId, validateAttachments, attachments, setAttachments }: UseAttachmentRestoreInput): void` ← unit C verbatim (comments move), called at ~L353 (after the conversation-change effect, so effect order is unchanged). Uses `canReleaseAttachments` as before.
  3. `useAttachmentActions({ project, composerSlots, pendingUploadsRef, setAttachments }: UseAttachmentActionsInput): { addAttachment; addAttachments; removeAttachment; clearAttachments }` ← unit D.
  4. `useMentionPopover({ composerSlots, draft, setDraft, setMention }: UseMentionPopoverInput): { openMention; closeMention; selectMention }` ← unit E.
- **Importers to update:** none (no export moves).
- **After:** `useComposer` ~92; sub-hooks ~20 / ~42 / ~30 / ~32; file ~370.
- **Risks / notes:** effect order must stay: `useDeferredDraftWrite`'s effects → conversation-change effect (~L321) → restore effect → persist effect. Keep every `useCallback` dependency array identical. `mention` state stays in the core (the conversation-change effect calls `setMention`).

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/chat/src/react/components/ToolCard.tsx packages/chat/src/react/features/chat-pane/components/AgentRuntimePicker.tsx packages/chat/src/react/features/chat-pane/hooks/useAgentRuntimePicker.hooks.ts packages/chat/src/react/features/chat-pane/hooks/useChatPaneRuntimeInventory.hooks.ts packages/chat/src/react/features/chat-pane/hooks/useChatPaneWorkingDirectory.hooks.ts packages/chat/src/react/hooks/fab-position.ts packages/chat/src/react/hooks/useComposer.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
