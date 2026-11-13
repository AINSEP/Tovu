# Terra job size-28: split 6 Jini file(s) by responsibility (size limits)

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
### jini:packages/chat/src/react/hooks/useConversation.ts
- **Over:** `useConversation` 145
- **Phase:** now (JINI 145) · **Batch:** size-28
- **Tests:** `src/react/hooks/__tests__/useConversation.test.ts`, `useConversation.retry-race.cov-j2.test.ts`, `secret-redaction.test.tsx`, `durable-run-hooks.test.ts`, `src/react/features/chat-pane/__tests__/hooks/useChatPane.refresh.test.tsx`, `src/react/components/__tests__/MessageList.test.tsx`, `src/react/__tests__/index.test.ts` (package `@jini-ai/chat`). No test mocks the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | destructure, `useState`s, `run`, refs, `setMessages` | state (stays) |
| B | `useEffect(() => { const source = options.refreshSignal; …` | refresh from saved messages on focus/visibility |
| C | `const initialMessagesRef = …` + `useEffect(() => { const last = initialMessagesRef.current?.at(-1); …` | resume an interrupted run on mount |
| D | `const applyRunToAssistantMessage = useCallback(…)` + `useEffect(() => { applyRunToAssistantMessage(); }, …)` | reconcile live run events onto the assistant bubble |
| E | `sendMessage`, `retry`, `cancel`, `acknowledgeScroll`, `suppressScroll`, `return useMemo(…)` | actions + result (stays) |

- **Splits** (SUB-HOOKS in the same file, module level, above `useConversation`, in this order; each is called from `useConversation` at the exact spot its statements were, so hook call order is unchanged):
  1. `function useSavedMessagesRefresh({ refreshSignal, isStreaming, setMessagesState }: UseSavedMessagesRefreshInput): void` ← unit B with its `// Map upserts preserve order …` comment. Input type: `{ refreshSignal: UseConversationOptions['refreshSignal']; isStreaming: boolean; setMessagesState: Dispatch<SetStateAction<ChatMessage[]>> }`. Body: `const source = refreshSignal; if (!source || isStreaming) return undefined;` …, deps `[refreshSignal, isStreaming]`. Call: `useSavedMessagesRefresh({ refreshSignal: options.refreshSignal, isStreaming: run.isStreaming, setMessagesState });`.
  2. `function useResumeInterruptedRun({ initialMessages, activeAssistantIdRef, run }: UseResumeInterruptedRunInput): void` ← unit C: `const initialMessagesRef = useRef(initialMessages);` plus the mount-only effect. Move both long doc comments word for word (the `initialMessagesRef` one and the "Resumes an interrupted run on mount…" one), and the in-effect "Mount-only: see this effect's own doc…" comment. Deps stay `[]`. Input type: `{ initialMessages: UseConversationOptions['initialMessages']; activeAssistantIdRef: { current: string | null }; run: UseRunStreamResult }`.
  3. `function useAssistantRunReconciliation({ run, activeAssistantIdRef, setMessagesState, setScrollIntent }: UseAssistantRunReconciliationInput): void` ← unit D: the `applyRunToAssistantMessage` callback (deps `[run.events, run.runId, run.status]`, with its coverage "plain if/else chain" comment) and its effect (with the "Reconcile the live run's events…" comment, deps `[run.events, run.status, run.runId]`). `setScrollIntent: Dispatch<SetStateAction<boolean>>`.
  - Add `type Dispatch, type SetStateAction` to the react import and `type UseRunStreamResult` to the `./useRunStream.js` import.
- **Importers to update:** none (nothing new is exported).
- **After:** `useConversation` ~88; sub-hooks ~20 / ~12 / ~32; file ~250 counted.
- **Risks / notes:** the dependency arrays have to stay exactly as they are, including the deliberately omitted `run` in the mount effect and `setMessagesState`, which isn't listed (it's stable). Don't "fix" these for lint. `activeAssistantIdRef` is the same ref object passed down; the reattach effect must still set `.current` before calling `run.reattach`. The existing `m.runStatus!` and `messagesRef.current[idx]!` are moved code, so they stay as they are.

### jini:packages/chat/src/react/hooks/useRunStream.ts
- **Over:** `useRunStream` 117
- **Phase:** now (JINI 117) · **Batch:** size-28
- **Tests:** `src/react/hooks/__tests__/useRunStream.test.ts`, `useRunStream.checkpoint.cov-j2.test.ts`, `useConversation.test.ts`, `durable-run-hooks.test.ts`, `src/react/__tests__/index.test.ts`, `src/core/__tests__/durable-run-subscription.paths.unit.test.ts` (package `@jini-ai/chat`). No test mocks the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | state, refs, `teardownSubscription`, unmount effect | lifecycle (stays) |
| B | `const makeHandlers = useCallback((generation: number): RunHandlers => { … }, [])` body | turn transport callbacks into stream-state updates for one generation |
| C | `start`, `reattach`, `cancel`, `reset`, `return` | run controls (stays) |

- **Splits:**
  1. HELPER in the same file, module level, directly above `useRunStream`: `function runHandlersFor({ generation, generationRef, runIdRef, setState }: RunHandlersForInput): RunHandlers`, with `interface RunHandlersForInput { generation: number; generationRef: { current: number }; runIdRef: { current: string | null }; setState: Dispatch<SetStateAction<RunStreamState>> }`. Body = the current `makeHandlers` callback body verbatim (`const isStale = …` through the returned object with `onCheckpoint`, `onEvent`, `onToolInputDelta`, `onError`, `onDone`).
  2. `makeHandlers` becomes `const makeHandlers = useCallback((generation: number): RunHandlers => runHandlersFor({ generation, generationRef, runIdRef, setState }), []);` (deps stay `[]`).
  - Add `type Dispatch, type SetStateAction` to the react import.
- **Importers to update:** none.
- **After:** `useRunStream` ~85; `runHandlersFor` ~32; file ~165 counted.
- **Risks / notes:** the refs are passed by object, never by `.current` value, because `isStale` has to read `generationRef.current` when the callback fires. `setState` from `useState` is stable, so `[]` deps stay correct. The long `canceledGenerations` doc comment and the other ref comments stay where they are.

### jini:packages/chat/src/server/durable-runs/recover.ts
- **Over:** `createDurableRecovery` 122
- **Phase:** now (JINI 122) · **Batch:** size-28
- **Tests:** `src/server/durable-runs/__tests__/recover.test.ts`, `recover-boundaries.test.ts`, `missing-resume.test.ts`, `accept.cov-j2.test.ts` (package `@jini-ai/chat`). No test mocks the module.
- **Responsibility map** (closures inside `createDurableRecovery`):

| unit | closures | job |
|---|---|---|
| A port actions | `attach`, `nativeAllowed`, `launchNext`, `probeAttempt` | single attempt actions that read only `ports` |
| B decision | `finalize`, `continueDead`, `reattach`, `finalizeFailure`, `decide`, `decideDead`, `resolveMissing`, `reload`, `resolveDead`, returned `recover` | recovery decision tree (stays) |

- **Splits** (HELPERS in the same file, module level, directly above `createDurableRecovery` and below `interface Decision`, in this order; bodies verbatim, with `ports` now coming from the input object):
  1. `function attachAttempt({ ports, run }: AttachAttemptInput): void` ← `attach` (move its 3-line doc comment). `interface AttachAttemptInput { ports: RecoveryPorts; run: DurableRun }`.
  2. `async function nativeResumeAllowed({ ports, run }: NativeResumeAllowedInput): Promise<boolean>` ← `nativeAllowed`.
  3. `async function launchNextAttempt({ ports, run, next, native }: LaunchNextAttemptInput, _optional = {}): Promise<DurableRun>` ← `launchNext` (move its doc comment "Persist rejection evidence…" and both inner why-comments).
  4. `async function probeAttempt({ ports, run, trigger, liveRunId }: ProbeAttemptInput, _optional = {}): Promise<RunProbe>` ← `probeAttempt` (keep its comment).
  - Call sites inside `createDurableRecovery`: `attach(launched)` → `attachAttempt({ ports, run: launched })`; `attach(run)` in `reattach` and `resolveDead` → `attachAttempt({ ports, run })`; `await nativeAllowed(run)` → `await nativeResumeAllowed({ ports, run })`; `launchNext({ run, next, native })` → `launchNextAttempt({ ports, run, next, native })`; `probeAttempt({ run, trigger, liveRunId })` → `probeAttempt({ ports, run, trigger, liveRunId })`.
- **Importers to update:** none (new helpers are not exported).
- **After:** `createDurableRecovery` ~86; helpers 10/5/19/4; file ~225 counted.
- **Risks / notes:** `ports` is the same object, so behavior is identical. `missingResume && await nativeAllowed(run)` keeps its short-circuit (`!missingResume && await nativeResumeAllowed(...)`). The existing `events[noticeIndex]!` is moved code, so it stays.

### jini:packages/chat/src/server/run-finalizer/entry.ts
- **Over:** `createAssistantRunFinalizer` 132
- **Phase:** now (JINI 132) · **Batch:** size-28
- **Tests:** `src/server/run-finalizer/__tests__/finalizer.test.ts`, `src/server/run-finalizer/__tests__/finalizer-boundaries.test.ts` (package `@jini-ai/chat`). The file is the package entry `./server/run-finalizer`, but no export changes. No test mocks it.
- **Responsibility map** (closures inside the factory):

| unit | closures | job |
|---|---|---|
| A checkpoints | `clearTrailing`, `checkpoint` | throttled, coalesced checkpoint writes per watch |
| B stream | `openStream`, `consumeFrames` | open one SSE connection and replay its frames into the watch |
| C lifecycle | options, `reportError`, `active`, `settle`, `settleInterrupted`, `readStream`, `follow`, returned `watch`/`idle`/`activeCount` | follow → settle (stays) |

- **Splits** (module level, directly above `createAssistantRunFinalizer`, below `endStatus`, in this order):
  1. `function createWatchCheckpointer({ ledger, scheduler, now, intervalMs, reportError }: CreateWatchCheckpointerInput): WatchCheckpointer` with `interface CreateWatchCheckpointerInput { ledger: AssistantRunFinalizerArgs["ledger"]; scheduler: AssistantRunFinalizerArgs["scheduler"]; now: () => number; intervalMs: number; reportError: (input: Parameters<AssistantRunFinalizerArgs["onError"]>[0]) => void }` and `interface WatchCheckpointer { checkpoint(watch: Watch): Promise<void>; clearTrailing(watch: Watch): void }`. Body: `clearTrailing` and `checkpoint` moved verbatim (keep the 2-line "Coalesce one pending write…" comment), renaming `checkpointIntervalMs` → `intervalMs` and `args.ledger` → `ledger`; `return { checkpoint, clearTrailing };`.
  2. `async function openRunStream({ daemon, watch }: OpenRunStreamInput): Promise<OpenedStream>` ← `openStream` (keep its doc comment). `daemon: AssistantRunFinalizerArgs["daemon"]`.
  3. `async function consumeRunFrames({ watch, body, notices, checkpoint }: ConsumeRunFramesInput): Promise<StreamResult>` ← `consumeFrames` (keep the "Each connection replays…" comment); `args.notices` → `notices` (`AssistantRunFinalizerArgs["notices"]`), `checkpoint: (watch: Watch) => Promise<void>`.
  - In the factory: delete those four closures. After `const active = …` add `const { checkpoint, clearTrailing } = createWatchCheckpointer({ ledger: args.ledger, scheduler, now, intervalMs: checkpointIntervalMs, reportError });`. `readStream` becomes `const opened = await openRunStream({ daemon, watch }); return opened.kind === "open" ? consumeRunFrames({ watch, body: opened.body, notices: args.notices, checkpoint }) : opened;`.
- **Importers to update:** none.
- **After:** `createAssistantRunFinalizer` ~78; `createWatchCheckpointer` ~36; helpers 6 / 16; file ~185 counted.
- **Risks / notes:** `checkpoint` calls itself again (`void checkpoint(watch)` in the timer and in `.finally`). After the move that resolves to the inner function in the factory closure, which is the same behavior. `settle` and the `watch().finally` still call `clearTrailing` (now the destructured one). `now` is passed as the same arrow, so `args.clock` is still read lazily.

### jini:packages/chat/src/store/runtime/durable-run-store.ts
- **Over:** `createDurableRunStore` 280 (file 421, under the limit)
- **Phase:** now (JINI 280) · **Batch:** size-28
- **Tests:** `src/store/runtime/__tests__/durable-run-store.test.ts`, `durable-run-store.reads.test.ts`, `durable-run-store.race.test.ts`, `entry.cov-j2.test.ts`, `run-ledger.test.ts`, `run-ledger.cov-j2.test.ts`, `src/server/durable-runs/__tests__/recover.test.ts` (package `@jini-ai/chat`).
- **Responsibility map:**

| unit | declarations / closures | job |
|---|---|---|
| R reads | types `RunRow`, `RunMatch`, `ReadOptions`, `RunRead`, `Metadata`; `recoveryFields`, `sessionFields`, `acceptedRequest`, `runHead`, `savedRunEvents`; closures `runRow`, `conversationTranscript`, `readTranscript`, `transcriptEventProjection`, `currentMessage`, `readRun`, `lockedRead`, `load`, `head`, `probeRun`, `lockedRun` | read a run's head + transcript, locked |
| P poll | closure `poll` | unlocked, cursor-versioned projection poll |
| W attempt writes | closures `writeAttemptMetadata`, `cancel`, `saveAgentSession`, `captureSession`, `clearSession`, `guardTool`, `writeToolEvent`, `completeTool`, `recoveryClock` | attempt-scoped writes under the run lock |
| A accept/advance | closures `find`, `lockOwnedConversation`, `assertSlotFree`, `appendAcceptedQuestion`, `appendQueuedAnswer`, `accept`, `advance`, `cancelPending` | accept a turn, advance or cancel its generation (stays) |

- **Splits** (in order):
  1. NEW `durable-run-store-reads.ts`. Job: read a durable run's head and transcript, and poll its projection. Moves the 5 R types (exported now), `recoveryFields`, `sessionFields`, `acceptedRequest`, `runHead`, `savedRunEvents` (stays exported), plus:
     - `export function createDurableRunReads({ kernel, isDaemonRunId }: CreateDurableRunReadsInput)` with `interface CreateDurableRunReadsInput { kernel: ChatKernel<ChatDatabase>; isDaemonRunId: RunIdPolicy }`. Its body is the R closures, verbatim and in their current order, with every doc comment. It returns `{ readRun, lockedRead, load, head, probeRun, lockedRun }`; the return type is inferred. Also add `export type DurableRunReads = ReturnType<typeof createDurableRunReads>;`.
     - `export async function pollRunProjection({ kernel, messageId, principalId, workspaceId }: PollRunProjectionInput, { cursor }: { cursor?: string } = {})` gets the `poll` body verbatim (its doc comment and the SQLite/PG comments go with it).
     - Imports: what the moved code uses (`sql`, `Selectable` from kysely, `sqliteReadVersion`, `createChatHistoryStore`, `runLockKey`, `toMessage`/`validatedEventsJson` from `../sql/store.js`, the core types). Nothing comes from `./durable-run-store.js`.
  2. In `durable-run-store.ts`, move the closures `appendAcceptedQuestion` and `appendQueuedAnswer` to module level, directly above `createDurableRunStore`, unchanged. They read no closure variables.
  3. Add a module-level helper in `durable-run-store.ts`, above `createDurableRunStore`: `function createAttemptWrites({ kernel, lockedRun }: CreateAttemptWritesInput)` with `interface CreateAttemptWritesInput { kernel: ChatKernel<ChatDatabase>; lockedRun: DurableRunReads["lockedRun"] }`. Its body is the W closures, verbatim and in their current order, with their comments. It returns `{ writeAttemptMetadata, cancel, captureSession, clearSession, guardTool, completeTool, recoveryClock }`.
  4. `createDurableRunStore` keeps `const kernel = …`. Then it adds `const { lockedRead, load, head, probeRun, lockedRun } = createDurableRunReads({ kernel, isDaemonRunId });` and `const { writeAttemptMetadata, cancel, captureSession, clearSession, guardTool, completeTool, recoveryClock } = createAttemptWrites({ kernel, lockedRun });`, plus a 3-line adapter `async function poll(required: { messageId: string; principalId: string; workspaceId: string }, optional: { cursor?: string } = {}) { return pollRunProjection({ kernel, ...required }, optional); }`. After that come the A closures and the unchanged `return { … }`.
- **Importers to update:** `src/store/runtime/entry.ts` is the package entry `./store/runtime` and does `export * from "./durable-run-store.js"`. Add `export { savedRunEvents } from "./durable-run-store-reads.js";` there so the public API stays the same. In `src/store/runtime/__tests__/durable-run-store.test.ts`, `savedRunEvents` now comes from `../durable-run-store-reads.js`. `run-ledger.ts` doesn't change.
- **After:** `createDurableRunStore` about 87 lines, `createDurableRunReads` about 72, `createAttemptWrites` about 80, `pollRunProjection` about 36. durable-run-store.ts about 285 counted lines, reads module about 160.
- **Risks / notes:** the two sub-factories are created with `const` before any operation runs. Every use happens at call time, so it doesn't matter that the original closures were hoisted. `durable-run-store.race.test.ts` uses `vi.mock('../chat-history-store.js')`, which mocks that module for every importer, so it still applies when `conversationTranscript` moves to the reads module. No mock-path edit is needed. `cancelPending` still calls `cancel`, which is now the destructured one. No cycle: the reads module doesn't import `durable-run-store.ts`.

### jini:packages/chat/src/store/runtime/run-ledger.ts
- **Over:** `createChatRunLedger` 186
- **Phase:** now (JINI 186) · **Batch:** size-28
- **Tests:** `src/store/runtime/__tests__/run-ledger.test.ts`, `run-ledger.cov-j2.test.ts`, `entry.cov-j2.test.ts`, `run-guarded-chat-store.cov-j2.test.ts`, `src/server/durable-runs/__tests__/accept.cov-j2.test.ts` (package `@jini-ai/chat`). No test mocks the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| K checkpoint writes | `const version`, `const returnedVersion`, `recordProgress`, `writeDelta`, `notifyPersisted`, `writeFullCheckpoint` | guarded delta / full-merge checkpoint writes + receipts |
| S settle | `prop settle` body | settle one run (first terminal wins) |
| R reconcile | `prop reconcileInterrupted` body | boot-time adoption or cancel of stuck runs |
| L ledger | `const kernel`, `isSettled`, returned `durable`, `hasActiveRuns`, `unlessSettled`, `checkpoint` | ledger surface (stays) |

- **Splits** (module level, directly above `createChatRunLedger` and below `keepToolCheckpoints`, in this order; bodies verbatim with all comments):
  1. `function createCheckpointWrites({ kernel, now }: CreateCheckpointWritesInput)` with `interface CreateCheckpointWritesInput { kernel: ChatKernel<ChatDatabase>; now: () => number }`. Body: `const version = …`, `const returnedVersion = …`, then `recordProgress`, `writeDelta`, `notifyPersisted`, `writeFullCheckpoint` (with their doc comments). Returns `{ writeDelta, writeFullCheckpoint }`.
  2. `async function settleRun({ kernel, settlement }: SettleRunInput): Promise<boolean>`. Body = the current `settle` method body (`return kernel.transaction(async () => { … })`). `settlement: Parameters<ChatRunLedger["settle"]>[0]`.
  3. `async function reconcileInterruptedRuns({ kernel, now, required, optional }: ReconcileInterruptedRunsInput): Promise<number>`. Body = the current `reconcileInterrupted` method body, keeping the "A legacy stub without an attempt id…" comment. `required: NonNullable<Parameters<ChatRunLedger["reconcileInterrupted"]>[0]>`, `optional: NonNullable<Parameters<ChatRunLedger["reconcileInterrupted"]>[1]>`. If `ChatRunLedger` has no such method types, take the parameter types from the interface in `../../core/durable-runs/ledger-contracts.js` and don't loosen them.
  - In `createChatRunLedger`, delete `version`, `returnedVersion` and the four K closures, and add `const { writeDelta, writeFullCheckpoint } = createCheckpointWrites({ kernel, now });` after `const kernel`. Then `settle(settlement, _optional = {}) { return settleRun({ kernel, settlement }); },` and `async reconcileInterrupted(required = {}, optional = {}) { return reconcileInterruptedRuns({ kernel, now, required, optional }); },`. `checkpoint` stays as it is and calls the destructured writers.
- **Importers to update:** none.
- **After:** `createChatRunLedger` ~55; `createCheckpointWrites` ~58; `settleRun` ~34; `reconcileInterruptedRuns` ~46; file ~265 counted.
- **Risks / notes:** inside the reconcile loop, `endedAt = required.now ?? now()` still runs under the per-row lock, at the same point. Keep it inside the moved body and don't hoist it. `version` is a SQL fragment built once per ledger, the same as before (it's built once per `createCheckpointWrites` call, and that's once per ledger). The existing `[0]!.version` / `nativeVersion!` are moved code, so they stay.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/chat/src/react/hooks/useConversation.ts packages/chat/src/react/hooks/useRunStream.ts packages/chat/src/server/durable-runs/recover.ts packages/chat/src/server/run-finalizer/entry.ts packages/chat/src/store/runtime/durable-run-store.ts packages/chat/src/store/runtime/run-ledger.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
