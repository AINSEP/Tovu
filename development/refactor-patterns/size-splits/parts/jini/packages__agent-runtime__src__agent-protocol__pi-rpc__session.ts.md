### jini:packages/agent-runtime/src/agent-protocol/pi-rpc/session.ts
- **Over:** `attachPiRpcSession` 119
- **Phase:** now · **Batch:** size-16
- **Tests:** `src/agent-protocol/pi-rpc/__tests__/session.test.ts`, `src/agent-protocol/pi-rpc/__tests__/session.handlers.unit.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | types, image budgets, `replyExtensionUi`, session-file snapshot fns, image payload fns, `handlePiResponseMessage` | pi RPC helpers |
| B inbound routing | parser `onMessage` body (~L426-449) | route one parsed stdout frame |
| C agent-end shutdown | `handlePiAgentEnd` statements from `try { stdin.end()` through the `setTimeout(... gracefulShutdownMs)` | close stdin + SIGTERM after grace |
| D (stays) | destructuring, flags, `sendCommand`, `fail`, initial status, stdin handlers, `sendPromptCommand`, parent-session branch, stdout/child wiring, return | run lifecycle |

- **Splits** (helpers at module level directly above `attachPiRpcSession`, in run order):
  1. `shutDownPiAfterAgentEnd({ stdin, child, fail, gracefulShutdownMs }: ShutDownPiAfterAgentEndInput): void` ← unit C verbatim (the "pi's RPC process stays alive…" and "Grace period…" comments move). `handlePiAgentEnd` keeps `finished = true;`, the capture comment + `capturedSessionPath = …`, then calls the helper.
  2. `routePiRpcMessage({ raw, finished, stdin, parentSessionRpcId, promptRpcId, fail, sendPromptCommand, send, runStartedAt, sentFirstToken, onAgentEnd }: RoutePiRpcMessageInput): void` ← unit B verbatim (comments move). `parentSessionRpcId`, `promptRpcId`, `finished` are `let`s: the parser passes their CURRENT values on every call (`routePiRpcMessage({ raw, finished, parentSessionRpcId, promptRpcId, …, onAgentEnd: handlePiAgentEnd })`), so reads are unchanged.
- **Importers to update:** none (no export moves).
- **After:** `attachPiRpcSession` ~95; file ~320.
- **Risks / notes:** `routePiRpcMessage` must receive the lets by value at call time, never captured once at parser creation. `handlePiResponseMessage` gets the same arguments as before. Keep `sentFirstToken` the same object (it is mutated by `mapPiRpcEvent`).
