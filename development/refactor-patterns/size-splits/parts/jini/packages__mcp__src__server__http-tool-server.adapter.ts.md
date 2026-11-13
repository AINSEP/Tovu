### jini:packages/mcp/src/server/http-tool-server.adapter.ts
- **Over:** `startMcpHttpToolServer` 104
- **Phase:** now · **Batch:** size-25
- **Tests:** `src/server/__tests__/http-tool-server.wire.test.ts`, `src/server/__tests__/run-tool-host.http.test.ts` (`pnpm --filter @jini-ai/mcp exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `host`, `token`, `pending`, session lets, `server` creation | listener state (stays) |
| B | `server.headersTimeout = 5000;` … `server.maxConnections = MAX_REQUESTS;` and `await new Promise<void>((resolve, reject) => {` … `const port = address.port;` | bind the loopback listener with its limits, return the port |
| C | `handle`, `dispatch`, `repairListener`, `return {` | request admission/dispatch + handle (stays; they close over mutable lets) |

- **Splits:**
  1. HELPER `bindLoopbackListener({ server }: BindLoopbackListenerInput): Promise<number>` (same file, above `startMcpHttpToolServer`) ← the three `server.*Timeout/maxConnections` assignments, then the `await new Promise<void>(…listen…)`, `const address = server.address();`, the `if (!address || typeof address === 'string') throw …` line, and returns `address.port`. `server` type = `Server` from `node:http` (whatever `createServer` returns in the file).
  2. In `startMcpHttpToolServer`: the three assignments are removed from their spot; `const port = await bindLoopbackListener({ server });` replaces the listen block. `handle`/`dispatch` stay as hoisted function declarations between them, so runtime order is unchanged (limits set immediately before listen, as today — nothing runs between them).
- **Importers to update:** none.
- **After:** file ~218; `startMcpHttpToolServer` ~90.
- **Risks / notes:** `handle`, `dispatch`, `repairListener` mutate `stopped`/`retry`/`sessionConnection` — do NOT move them. The limits must still be set before `listen` (they are, inside the helper). Keep the throw message exact.
