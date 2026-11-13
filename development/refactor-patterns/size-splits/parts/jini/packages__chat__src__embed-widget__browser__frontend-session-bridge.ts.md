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
