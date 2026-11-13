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
