### jini:packages/agent-runtime/src/providers/oauth-callback-server.ts
- **Over:** `startOAuthCallbackListener` 111
- **Phase:** now · **Batch:** size-20
- **Tests:** `src/providers/__tests__/oauth-callback-server.test.ts`, `src/providers/__tests__/j5-02-characterization.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | types, `DEFAULT_TIMEOUT_MS`, `renderResultPage`, `escapeHtml`, `callbackOutcome`, `callbackConsumesListener` | outcome + page |
| B request handling | `let consumed`, `const handle = async (req, res) =>` (~L100-149) | answer one HTTP hit on the listener |
| C listen | `await new Promise<void>((resolve, reject) => {` (~L155-172) | bind the port, map EADDRINUSE to a plain message |
| D (stays) | input/defaults, `stopped`, `serverRef`, `timer`, `closeServer`, `stop`, `server`, timeout, return | listener lifecycle |

- **Splits** (module level, directly above `startOAuthCallbackListener`, in run order):
  1. `handleOAuthCallbackRequest({ req, res, host, port, callbackPath, input, listener, stop }: HandleOAuthCallbackRequestInput): Promise<void>` ← body of `handle` verbatim (both comments move). `let consumed = false` becomes `const listener = { consumed: false }` in the caller (only `handle` reads/writes it); `consumed` → `listener.consumed`. `input` typed `StartOAuthCallbackListenerInput`, `stop: () => Promise<void>`.
  2. `listenOnce({ server, host, port }: ListenOnceInput): Promise<void>` ← the `new Promise` block verbatim; caller does `await listenOnce({ server, host, port });`.
  `http.createServer` callback becomes `void handleOAuthCallbackRequest({ req, res, host, port, callbackPath, input, listener, stop })`.
- **Importers to update:** none (no export moves).
- **After:** `startOAuthCallbackListener` ~55; `handleOAuthCallbackRequest` ~42; `listenOnce` ~19; file ~190.
- **Risks / notes:** `stop` is declared before `handle`, so passing it is safe. The EADDRINUSE message text must stay byte-identical (tests assert it).
