### jini:packages/sidecar/src/json-ipc.ts
- **Over:** `createJsonIpcServer` 157 · its `createNetServer` callback 132 · `requestJsonIpc` 129 · its Promise executor 124
- **Phase:** now · **Batch:** size-36
- **Tests:** `src/__tests__/json-ipc.contract.test.ts`, `src/__tests__/index.test.ts` (`pnpm --filter @jini-ai/sidecar exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | trace helpers, `jsonIpcError`, `staleUnixSocketExists`, `prepareIpcPath`, `ipcResponseError` | unchanged |
| B | server connection state, idle timer, `claimFrame`, error/close listeners, data listener up to `buffer = buffer.slice(newlineIndex + 1);` | per-connection framing (stays) |
| C | data listener: `if (receivedBytes > maxFrameBytes) {` branch body after `claimFrame();` | refuse an oversized frame |
| D | data listener from `let message: unknown;` to its end | parse one frame, run the handler, write the reply |
| E | client: `socket.on("connect", () => {` body | send the request frame |
| F | client: `socket.on("error", (error) => {` body | fail the request on socket error |

- **Splits** (module level, C and D above `createJsonIpcServer`, E and F above `requestJsonIpc`):
  1. HELPER `rejectOversizedFrame({ socket, startedAt, maxFrameBytes, receivedBytes, socketPath, traceId }: RejectOversizedFrameInput): void` ← the `traceJsonIpc("server.frame_too_large", …)` call and the `socket.end(…FRAME_TOO_LARGE…)` call. In place: `claimFrame(); rejectOversizedFrame({ … }); return;`.
  2. HELPER `answerJsonIpcFrame({ frame, socket, handler, socketPath, traceId, startedAt }: AnswerJsonIpcFrameInput): Promise<void>` ← from `let message: unknown;` to the end of the data listener (both `try` blocks, verbatim). In place: `await answerJsonIpcFrame({ … });`.
  3. HELPER `sendJsonIpcRequest({ socket, payload, socketPath, timeoutMs, traceId, startedAt, messageSummary }: SendJsonIpcRequestInput): void` ← body of the client `"connect"` listener (pass exactly what it reads).
  4. HELPER `failJsonIpcRequest({ error, socketPath, traceId, startedAt, messageSummary, settle, rejectRequest }: FailJsonIpcRequestInput): void` ← body of the client `"error"` listener (`settle: (callback: () => void) => void`, `rejectRequest: (reason: unknown) => void`).
- **Importers to update:** none.
- **After:** file ~395; `createJsonIpcServer` ~80; connection callback ~55; `requestJsonIpc` ~85; executor ~80; `answerJsonIpcFrame` ~68; others ≤ 35.
- **Risks / notes:** `buffer`, `receivedBytes`, `handled` (server) and `buffer`, `settled` (client) are `let`s — they stay in their closures; only immutable values cross. The `claimFrame()` before awaiting the handler must stay in the listener before `await answerJsonIpcFrame` (SEC-004 one-request guard). All trace event names and reply JSON byte-identical. The client `"data"` listener (mutates `buffer`) stays.
