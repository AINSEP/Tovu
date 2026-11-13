# Terra job size-11: split 5 Jini file(s) by responsibility (size limits)

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
### jini:packages/chat/src/embed-widget/browser/frontend-session-bridge.ts
- **Over:** `createFrontendSessionBridge` 219
- **Phase:** now · **Batch:** size-11
- **Tests:** `src/embed-widget/browser/__tests__/frontend-session-bridge.test.ts`, `src/react/agent-bridge/__tests__/frontend-session-bridge.test.ts`, `src/embed-widget/browser/__tests__/frontend-navigation-guard.test.ts`, `src/embed-widget/__tests__/boundaries.test.ts`, `src/__tests__/dbpkg-chat-request-ports.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `EXECUTED_MEMORY`, option/arg/bridge interfaces, `claimedCapabilities`, frame readers, `openFetchFrontendStream`, `boundedFrontendResponse`, `assertFrontendResponse`, navigation guard | contract + frame parsing |
| B invocation serving | `pageQueue`, `servePage`, `serveLocally`, `acknowledge`, `remember`, `handleInvocation` | run one invocation (replay guard, pane vs local, serialized page work) |
| C stream listening | inside `connect`: the four `current.addEventListener(…)` calls (message switch, parked, suspended, error) | react to one stream's frames/lifecycle |
| D response POST | `respond` body | POST one bounded answer |
| E rebind wait | the `new Promise` in `rebind` | wait for the next attachment |
| F (stays) | `send`, session lets, `ready`, listener/executed/pending/attachments sets, `source`, `closed`, `abortPending`, `query`, `invalidate`, `disconnect`, `respondSuccess/Error`, `attach`, `connect` (open + `source = current`), `bridgeAccess`, return | attachment lifecycle |

- **Splits** (module level, above `createFrontendSessionBridge`, below `readFrame`; bodies verbatim, comments move):
  1. `servePageInvocation({ action, signal, options, respond }: ServePageInvocationInput): Promise<unknown>` ← `servePage` (JSDoc moves).
  2. `acknowledgeInvocation({ action, output, signal, options, respondSuccess }: AcknowledgeInvocationInput): Promise<void>` ← `acknowledge`.
  3. `serveInvocationLocally({ action, controller, options, pending, respond, respondSuccess, respondError }: ServeInvocationLocallyInput): Promise<void>` ← `serveLocally` (calls 1 and 2).
  4. `createInvocationRunner({ options, executed, pending, chatListeners, respond, respondSuccess, respondError }: CreateInvocationRunnerInput): { handleInvocation(action: ChatPaneAgentToolAction): void; resetPageQueue(): void }` — owns `let pageQueue` (its "A page driver owns one live screen…" comment moves), `remember`, `handleInvocation` (verbatim). `invalidate`'s `pageQueue = Promise.resolve();` becomes `invocations.resetPageQueue();`. Create the runner right after `respondError` (it needs `respond*`); `invalidate` only runs after `connect()`, so it is initialised by then.
  5. `postFrontendResponse({ send, base, endpointPrefix, headers, sessionId, bindToken, maxResponseBytes, invocationId, body }: PostFrontendResponseInput): Promise<void>` ← `respond` body after its `sessionId === undefined` guard; `respond` keeps the guard and passes the CURRENT `sessionId`/`currentBindToken` on every call.
  6. `listenToFrontendStream({ current, isCurrent, onFrame, disconnect, invalidate, onError }: ListenToFrontendStreamInput): void` ← the four `addEventListener` calls (the "Intentional visibility pauses…" comment moves); `isCurrent = () => source === current`. The `message` listener calls `onFrame(readFrame(event.data))`.
  7. `applyFrontendFrame({ frame, pending, attach, rejectReady, disconnect, handleInvocation, onError }: ApplyFrontendFrameInput): void` ← the `switch (frame.kind)` verbatim.
  8. `waitForAttachment({ attachments, signal, hasSource, connect, disconnect }: WaitForAttachmentInput): Promise<{ sessionId: string; bindToken: string }>` ← the `return new Promise(…)` in `rebind` (`!source` → `!hasSource()`).
- **Importers to update:** none (no export moves; file is the `./browser/frontend-session-bridge` package entry and keeps every export).
- **After:** `createFrontendSessionBridge` ~95; `createInvocationRunner` ~32; file ~420.
- **Risks / notes:** `rejectReady` is a definite-assignment `let` set synchronously by the `ready` executor — pass it at call time (inside `connect`), not captured before `ready` is created. `options.pageDriver!` inside `servePage` is existing code moved verbatim (not a new `!`); if lint flags it in the new location, report rather than change it. Listener order on `current` must stay: message, parked, suspended, error.

### jini:packages/chat/src/embed-widget/vanilla/index.ts
- **Over:** `mountVanillaChat` 256
- **Phase:** now · **Batch:** size-11
- **Tests:** `src/embed-widget/vanilla/__tests__/widget.test.ts`, `src/embed-widget/vanilla/__tests__/state.test.ts` (smoke), `src/embed-widget/vanilla/__tests__/state.edges.test.ts` (smoke). No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `ARIA_LABEL`, re-exports, `VanillaChatCopy`, `MountVanillaChatArgs`, `svgIcon` | contract |
| B element factory | closures `node`, `button` | create classed elements/buttons |
| C DOM build | statements `const shell = node(…)` through `element.replaceChildren(shell);` (~L68-137) | build the panel tree with ARIA |
| D chrome | `renderChrome` | reflect open/busy/error on chrome |
| E rows | `rows`, `liveReplies`, `createRow`, `renderRow`, `announce`, `announceSettledReplies`, `renderRows` | render message rows + live announcements |
| F (stays) | `wasOpen`, `initialized`, `focusEntry`, `moveFocus`, `renderFocus`, `latestState`, `framePending`, `cancelRenderFrame`, `render`, `controller`, `listeners`, `listen`, init, return | render scheduling + lifecycle |
| G events | from `suggestionEntries.forEach(… listen(button, 'click'…` through `listen(element, 'jini-chat-open', …)` (~L243-301) incl. `dismissConfirmation`, `onEscape`, `trapTab` | wire user input to the controller |

- **Splits** (module level, above `mountVanillaChat`, below `svgIcon`; bodies verbatim, comments move):
  1. `createVanillaElementFactory({ document }: CreateVanillaElementFactoryInput): VanillaElementFactory` returning `{ node, button }` (the two closures verbatim; export nothing).
  2. `buildVanillaChatDom({ document, element, copy, ids, suggestions, factory }: BuildVanillaChatDomInput): VanillaChatDom` ← unit C; returns an object with every node the rest uses (`shell, fab, panel, reset, close, confirmation, confirm, keep, log, status, announcements, error, form, input, send, stop, greeting, suggestions, suggestionEntries, suggestionButtons`). `ids` = `args.ids`, `suggestions` = `args.suggestions`. Mount destructures it with the same names, so later code is unchanged.
  3. `renderVanillaChrome({ dom, copy, state }: RenderVanillaChromeInput): void` ← `renderChrome` body; mount keeps `const renderChrome = ({ state }) => renderVanillaChrome({ dom, copy, state });`.
  4. `createVanillaRows({ dom, node, renderMarkdown }: CreateVanillaRowsInput): { renderRows(input: { state: VanillaChatState }): void; liveReplies: Set<string> }` ← unit E (the "Bound the additions-only…" and "A dedicated additions-only region…" comments move). `render` uses the returned `liveReplies` and `renderRows`.
  5. `wireVanillaChatEvents({ dom, document, element, copy, controller, renderChrome, focusEntry, listen }: WireVanillaChatEventsInput): void` ← unit G verbatim (the `trapTab` comment moves). `listen` and `listeners` stay in mount (the return's destroy uses `listeners`). Listener registration order unchanged.
- **Importers to update:** none (no export moves; file is the `./vanilla` package entry and keeps its exports).
- **After:** `mountVanillaChat` ~75; `buildVanillaChatDom` ~75; `wireVanillaChatEvents` ~55; `createVanillaRows` ~40; file ~320.
- **Risks / notes:** `element.replaceChildren(shell)` must still happen before `rows`/controller creation (inside the build helper, same position). `wasOpen`/`initialized` stay `let`s in mount because `moveFocus`/`renderFocus`/`render` and the final `initialized = true` share them. `announcements.firstElementChild!` is existing code moved verbatim.

### jini:packages/chat/src/react/components/A2uiSurfaceCard.tsx
- **Over:** `A2uiSurfaceCard` 130 (`RenderComponent` 99 — at the limit, untouched)
- **Phase:** now · **Batch:** size-11
- **Tests:** `src/react/components/__tests__/A2uiSurfaceCard.test.tsx`, `src/react/components/__tests__/A2uiSurfaceCard.delivery.test.tsx`, `src/react/components/__tests__/A2uiSurfaceCard.registry.test.tsx`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `RenderComponent`, `A2uiSurfaceCardProps`, `A2uiSurfaceCard` (`t`, `formatLocalActionValue`, `!root` branch, JSX) | render the surface |
| B interpreter | `actionIdCounter` (module `let`), `catalog` memo, `interpreterRef` + init block, `forceRender` + subscribe effect | one interpreter per card, re-render on change |
| C apply events | `SURFACE_ID_KEYS`, `extractSurfaceId`, `appliedCountRef`, `surfaceIdRef`, `refusalNotice` state, the events-apply effect (~L278-315) | feed new agent messages, relay validation refusals |
| D actions | `A2uiAgentActionOutcome`, `isThenable`, `agentActionAttemptRef`, `pendingAgentAction`/`localActionResult`/`deliveryFailureNotice` state, `handleAction` | build + deliver a user action |

- **Splits:**
  1. NEW `A2uiSurfaceCard.hooks.ts` — job: interpreter state + action delivery for the card. Moves `SURFACE_ID_KEYS`, `actionIdCounter` (with its "Preserve the interpreter's former module-wide sequence…" comment), `extractSurfaceId`, type `A2uiAgentActionOutcome` (export; its doc moves), `isThenable` (doc moves). Hooks (all comments move with their statements):
     - `useA2uiInterpreter({ registry }: UseA2uiInterpreterInput): A2uiInterpreter` ← unit B (the "Merges the host registry…" comment moves).
     - `useA2uiSurfaceEvents({ interpreter, events, runId, onAgentAction }: UseA2uiSurfaceEventsInput): { surfaceId: string | undefined; refusalNotice: string | null; setRefusalNotice: Dispatch<SetStateAction<string | null>> }` ← unit C (both long comments in the effect move; dependency array identical).
     - `useA2uiActionHandler({ interpreter, surfaceId, runId, onAgentAction, setRefusalNotice }: UseA2uiActionHandlerInput): { handleAction(componentId: string): void; pendingAgentAction: string | null; localActionResult: { componentId: string; value: unknown } | null; deliveryFailureNotice: string | null }` ← unit D (`handleAction` verbatim, plain function as today, not `useCallback`).
     `onAgentAction` typed `A2uiSurfaceCardProps['onAgentAction']` would need the component file — instead declare the prop type in the hooks file as `type A2uiAgentActionHandler = (runId: string, message: RendererToAgentMessage) => A2uiAgentActionOutcome | Promise<A2uiAgentActionOutcome> | void` copied exactly from the current prop declaration, and make `A2uiSurfaceCardProps.onAgentAction?: A2uiAgentActionHandler`.
  2. `A2uiSurfaceCard` calls the three hooks in that order (interpreter → events → actions), then keeps `root`, `formatLocalActionValue`, the `!root` branch and the JSX unchanged.
- **Importers to update:** `src/react/index.ts` (`export type { A2uiAgentActionOutcome }` → `./components/A2uiSurfaceCard.hooks.js`; keep the comment above it; `A2uiSurfaceCardProps` stays). Tests import only `A2uiSurfaceCard` — no change.
- **After:** `A2uiSurfaceCard` ~42; `useA2uiActionHandler` ~42; `useA2uiSurfaceEvents` ~30; `useA2uiInterpreter` ~20; component file ~175; hooks file ~115.
- **Risks / notes:** hook call order must equal today's hook order (memo, ref, state, effects) — interpreter hook first so its `useEffect` (subscribe) still runs before the events effect. `surfaceId!` in `handleAction` is existing code moved verbatim with its justification comment. `actionIdCounter` must stay a single module-level `let` (shared across cards).

### jini:packages/chat/src/react/components/ConversationList.tsx
- **Over:** `ConversationList` 209
- **Phase:** now · **Batch:** size-11
- **Tests:** `src/react/components/__tests__/ConversationList.test.tsx`, `ConversationList.trigger.test.tsx`, `ConversationList.gaps.test.tsx`, `list-gallery.hooks.test.tsx` (same folder). No `vi.mock` of the file or of `ConversationList.hooks.ts`.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `DOUBLE_CLICK_GRACE_MS`, item/props interfaces, `runConversationListHostEffect` (+ reporter), `relativeTime`, `ConversationActions` | contract + helpers |
| B switcher | `open`, `rootRef`, `pendingSelectRef`, `cancelPendingSelect`, unmount/close/outside-click effects (~L180-214), the row-click scheduling inline handler | open/close + click-vs-double-click |
| C search | `query`, `savedServerResults`, `useConversationListTitles(...)`, `deferredQuery`, the reset-on-open effect (~L217), the search effect (~L224), `visible` | filter + server search |
| D row actions | `editingId`, `commitRename`, `startRename`, `requestDelete` | rename/delete |
| E render | the `{open ? (…)}` panel JSX and each `visible.map` row | menu + rows |

- **Splits:**
  1. In existing `ConversationList.hooks.ts` (next to `useConversationListTitles`) add (bodies verbatim, every comment moves, dependency arrays identical):
     - `useConversationSwitcher({ onSelect }: UseConversationSwitcherInput): { open; setOpen; rootRef; cancelPendingSelect; scheduleSelect(id: string): void }` ← unit B; `scheduleSelect` = the body of the row button's inline `onClick` (cancel, `setTimeout(… onSelect(id); setOpen(false); }, DOUBLE_CLICK_GRACE_MS)`); `DOUBLE_CLICK_GRACE_MS` moves here (its comment moves); `ConversationList.tsx` no longer uses it.
     - `useConversationSearch({ conversations: savedConversations, onSearch, open, t }, { setEditingId }): { query; setQuery; conversations; rawTitles; visible }` ← unit C (reset effect stays immediately before the search effect, as today).
     - `useConversationRowActions({ onRename, onDelete, confirmDelete, t, cancelPendingSelect }): { editingId; setEditingId; commitRename; startRename; requestDelete }` ← unit D. Note `requestDelete` uses `runConversationListHostEffect` if it does today — if so, move `runConversationListHostEffect` + `reportConversationListHostEffectFailure` to the hooks file and import them in the component (the hooks file must not import the component).
  2. SUB-COMPONENTS in `ConversationList.tsx` (module level, above `ConversationList`), plain props, JSX verbatim incl. JSX comments:
     - `ConversationRow({ item, active, editing, title, canRename, canDelete, now, onCommitRename, onCancelRename, onSelect, onStartRename, onDelete, t })` ← one `visible.map` item.
     - `ConversationMenu({ conversations, visible, query, onQueryChange, emptyLabel, createDisabled, onCreate, activeConversationId, editingId, rawTitles, now, …row callbacks, t })` ← the `<div className="jini-conv-menu">` block (the `onCreate` click keeps `runConversationListHostEffect('onCreate', …)` + `setOpen(false)` passed in as `onCreate`).
  3. `ConversationList` calls the hooks in order switcher → row actions (needs `cancelPendingSelect`) → search; keeps `now`, `active`, `emptyLabel`, the trigger button and `{open ? <ConversationMenu …/> : null}`.
- **Importers to update:** none outside the file (`DOUBLE_CLICK_GRACE_MS` is not exported).
- **After:** `ConversationList` ~55; `ConversationMenu` ~50; `ConversationRow` ~40; hooks ~45/~40/~30; component file ~260.
- **Risks / notes:** search needs `setEditingId` for the reset effect while row actions own `editingId` — call `useConversationRowActions` before `useConversationSearch`. Effect order today: unmount-cancel, close-abandon, outside-click, reset, search — keep that order across hook calls (switcher first). The `useState` order changes (editing before query) — allowed (stable across renders), but keep effects in order.

### jini:packages/chat/src/react/components/MessageRow.tsx
- **Over:** `AssistantMessageRow` 159
- **Phase:** now · **Batch:** size-11
- **Tests:** `src/react/components/__tests__/MessageRow.test.tsx`, `MessageRow.display.test.tsx`, `MessageRow.terminal-extension.test.tsx`, `MessageRow.usage.test.ts`, `MessageRow.usage.l199.characterization.test.ts`, `mid-run-transcript.test.tsx`, `MidRunUserMessage.test.tsx`, `answered-question.test.tsx`, `surface-question-replay.test.tsx`, `durable-run-notice.test.tsx`, `sending-label.unit.test.tsx`, `standalone-approval.test.tsx`, `MessageList.test.tsx` (all in `src/react/components/__tests__/`), `src/react/__tests__/index.test.ts`. Complete with `rg -l "MessageRow" packages/chat/src --glob '*.test.*'`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `MessageRowProps`, `UsageSummary`, `RunAccessNotice`, `ThinkingBlock`, `AssistantMessageFooter`, `NO_ATTACHMENTS`, `MessageRow`, `UserMessageRow`, `answerRenderProps`, `transcriptSections`, `isUserSection`, `RunActivityLine` | render pieces |
| B view model | hooks + derivations in `AssistantMessageRow` from `const registry = useExtEventRendererRegistry();` through `const flatExtGroups = …` (excluding the two render closures) and pure helpers `isPendingWithNoContent`, `isRunInProgress`, `messageBlocks`, `flatToolGroups`, `messageAwaitingAnswer`, `assistantTerminalNotice`, `lastFinishedReplyIndex`, type `AssistantBlock` | derive what one assistant message shows |
| C tool rendering | closures `renderToolCard`, `renderTools` | render tool groups/cards |
| D ext rendering | closure `renderExtGroup` | render one extension event group in its error boundary |
| E text rendering | closure `renderTextSegments` | markdown + inline question forms |
| F (stays) | `renderBlock`, `renderExtBlock`, `renderAssistantSection`, the two returns | lay out sections |

- **Splits:**
  1. NEW `MessageRow.hooks.ts` — job: assistant message view model. Moves the pure helpers of unit B and type `AssistantBlock` (export; all their comments move). Adds `useAssistantMessageView({ message, usageSummary, runStreaming, runSucceeded, toolCallDisplay, showThinking, showUsageLine }: UseAssistantMessageViewInput): AssistantMessageView` ← unit B statements verbatim in order (the "Artifact stripping trims/replaces text…" comment moves); returns `{ registry, extGroups, answeredCards, terminalNotice, visibleContent, displayBlocks, blocks, pending, runInProgress, awaitingAnswer, usage, footerUsage, lastFinishedReply, timeline, retriedRows, flatTools, flatExtGroups }`. Imports nothing from `MessageRow.tsx`.
  2. Module-level render helpers in `MessageRow.tsx` (above `AssistantMessageRow`; plain functions returning `ReactNode`, NOT components — keys and element identity stay exactly as today):
     - `renderToolGroup({ rows, key, retriedRows, toolCallDisplay, runStreaming, runSucceeded, projectFileNames, onRequestOpenFile }: RenderToolGroupInput): ReactNode` ← `renderTools` with `renderToolCard` as a private module function `renderToolCard({ row, … })` (the "Hidden mode reuses…" comment moves). `ToolCallGroup`'s `renderRow` gets `(row) => renderToolCard({ row, … })`.
     - `renderExtEventGroup({ group, registry, message, runInProgress, runSucceeded, awaitingAnswer, answeredCards }: RenderExtEventGroupInput): ReactNode` ← `renderExtGroup` (the boundary-key comment moves).
     - `renderTextSegments({ text, keyPrefix, questionFormInteractive, questionFormSubmittedAnswers, onQuestionFormSubmit }: RenderTextSegmentsInput): ReactNode`.
  3. `AssistantMessageRow` keeps one-line adapters `const renderTools = (rows, key?) => renderToolGroup({...})`, `const renderExtGroup = (group) => renderExtEventGroup({...})`, `const renderText = …` so `renderBlock`/`renderExtBlock`/`renderAssistantSection`/returns are unchanged.
- **Importers to update:** none (`MessageRow`, `MessageRowProps` stay; moved helpers were not exported). `transcriptSections`/`isUserSection` import type `AssistantBlock` from `./MessageRow.hooks.js`.
- **After:** `AssistantMessageRow` ~80; `useAssistantMessageView` ~30; file ~330; hooks file ~95.
- **Risks / notes:** hooks order inside `useAssistantMessageView` = today's (`useExtEventRendererRegistry`, `useMessageUsage`, `useToolTimeline`, `useExtEventGroups`, `useAnsweredCards`). Do not turn render helpers into components (would add a component layer and change keys/reconciliation, e.g. the footer must not remount). `section[0]!.key` is existing code, untouched.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/chat/src/embed-widget/browser/frontend-session-bridge.ts packages/chat/src/embed-widget/vanilla/index.ts packages/chat/src/react/components/A2uiSurfaceCard.tsx packages/chat/src/react/components/ConversationList.tsx packages/chat/src/react/components/MessageRow.tsx <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
