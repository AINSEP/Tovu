### jini:packages/chat/src/core/assistant-client/durable-run-subscription.ts
- **Over:** `followDurableRun` 103
- **Phase:** now · **Batch:** size-32
- **Tests:** `src/core/__tests__/durable-run-subscription.unit.test.ts`, `src/core/__tests__/durable-run-subscription.paths.unit.test.ts`, `src/core/__tests__/durable-run-w2g.unit.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `DurableRunBinding`, `DurableSubscriptionPorts`, `CheckpointHandlers` | contract |
| B final delivery | `finish`'s statements after `stop();` (checkpoint, failed-run error, `onDone`) | hand the terminal saved message to the caller |
| C live frame rendering | `frame`'s last two statements (`if (handlers.onCheckpoint) return;` + `for … handlers.onEvent`) with their comment | render live events when no checkpoint hook |
| D (stays) | the `let`s, `stop`, `open`, `disconnected`, `scheduleRead`, `read`, `applySavedMessage`, startup | reconnect/poll state machine (tightly shared mutable state — not split further) |

- **Splits** (module level, directly above `followDurableRun`):
  1. `deliverFinalMessage({ message, handlers }: DeliverFinalMessageInput): void` ← the three statements after `stop();` in `finish` (error text byte-identical). `finish` becomes `stop(); deliverFinalMessage({ message, handlers });`.
  2. `renderLiveFrameEvents({ events, handlers }: RenderLiveFrameEventsInput): void` ← `if (handlers.onCheckpoint) return; for (const event of events) handlers.onEvent(event);` plus the "With the checkpoint-capable hook…" comment. `frame` calls `renderLiveFrameEvents({ events: outcome.events, handlers });`.
- **Importers to update:** none (no export moves).
- **After:** `followDurableRun` ~97; file ~120.
- **Risks / notes:** small margin (~3 lines). Everything else shares the `let` state machine (`streamEpoch`, `dropped`, `reading`, `recoveryPending`, `cursor`, `runId`) — do not lift those closures. `handlers` type is `CheckpointHandlers`.
