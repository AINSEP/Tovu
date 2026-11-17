# S15. Progress while a call waits; no hidden 300 s wall in the HTTP hop (C7, mechanism M9, Jini mcp)

Repo: Jini. Package: `mcp`. Estimate: 190k Sonnet. Prerequisites: none.

## Read first
`../DESIGN.md` §2.9, M9. `mcp/src/server/tool-server.ts` (`defaultCreateServer`: it passes the SDK's whole `extra`;
the `CallToolRequestSchema` handler; `McpServerLike` handler type), `mcp/src/server/daemon-client.ts`
(`requestDaemonJson`, `startDeadline`), `mcp/src/server/tools/delegated-tool.ts` (`DEFAULT_DELEGATED_TOOL_TIMEOUT_MS = null`),
`mcp/src/bin/serve.ts`, `mcp/src/server/http-tool-server.adapter.ts`, the pinned `@modelcontextprotocol/sdk` types for
`RequestHandlerExtra` (`sendNotification`, `_meta.progressToken`). Read the SDK's own docs for progress in the installed version; do not rely on memory.

## Step 0: prove or disprove the second wall (real local HTTP server, no mocks of fetch)
`daemon-client.long-wait.integration.test.ts`: a server that sends its response headers after D ms. Call it through
`postDaemonJson` with `timeoutMs: null` and a dispatcher whose header wait is 200 ms → expect today's failure and pin its
text. This shows the mechanism without waiting 300 s. Then read the Node version in use and its documented default
header wait, and write both in the report. If the default is unlimited on the supported Node versions, drop step 3 of
"Change" and say so.

## Characterization (passes today)
`tool-server.progress.characterization.test.ts` with a fake `McpServerLike` and a fake scheduler: a `tools/call` with
`_meta: { progressToken: "t1" }` whose handler takes 120 fake seconds produces **zero** notifications.

## Red-first
`call-progress.unit.test.ts` (fake scheduler, fake `sendNotification`):
1. token present, handler takes 120 s, interval 25 s → notifications at 25, 50, 75, 100 with `{ progressToken: "t1", progress: 1..4, message: "waiting" }`, none after settle.
2. no token → none.
3. `extra.signal` aborts at 40 s → one notification (at 25), then none, and the timer is cleared.
4. `sendNotification` rejects → the pump stops, the handler result is still returned, one log line through the logger port.
5. handler throws → pump stopped before the error result is returned.
6. a notification never contains tool output, arguments or ids (assert the exact object).
Wire test (`tool-server.wire.test.ts` style, real SDK server + in-memory transport): a slow local tool yields progress frames for a client that sent a token.

## Change
1. `mcp/src/server/call-progress.ts` (new, ≤ 80 lines): `startCallProgress({ extra }, { scheduler, intervalMs = 25_000, logger })` → `{ stop() }`.
2. `tool-server.ts` (409 lines): widen the handler's `extra` type to include the two SDK fields; wrap the single `handleToolCall` await in `start`/`stop` via `try/finally`. Net growth ≤ 8 lines.
3. `bin/serve.ts`: build the `fetchImpl` for the run with an unlimited response-header wait and pass it through `assembleRunToolHost`'s existing `fetchImpl` option. The limit on a delegated call stays the caller's signal; all other calls keep `DEFAULT_TIMEOUT_MS`.
4. Idle exit: confirm a call that is waiting still counts as activity (`createActivityTracker`); add a test that a 20-minute wait does not trigger idle exit.

## Acceptance
All cases green; cancellation still reaches the daemon (existing test for `ctx.signal` passes); no notification after the response (assert order on the wire test); `mcp` tests, `pnpm guard`, `pnpm typecheck` green.
