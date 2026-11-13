### jini:packages/mcp/src/server/tool-server.ts
- **Over:** `createMcpToolServer` 103
- **Phase:** now · **Batch:** size-25
- **Tests:** `src/server/__tests__/tool-server.test.ts`, `…/tool-server.wire.test.ts`, `…/tool-server.hosting.test.ts`, `…/tool-argument-recovery.test.ts`, `…/delegated-local-tools.integration.test.ts` (`pnpm --filter @jini-ai/mcp exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `validateFrameLimit`, `buildToolIndex`, `resources`, `resourceIndex`, `createServer`, `createTransport` | eager validation + factories (stays) |
| B | `async function connectHost({ transport, withActivity }: {` (61) | install tool/resource dispatch on a server for one transport |
| C | `return {` with prop `run` | run lifecycle (stays) |

- **Splits:**
  1. HELPER `connectToolHost({ requiredArgs, options, createServer, resources, resourceIndex, transport, withActivity }: ConnectToolHostInput): Promise<…same return as today…>` (module level, directly above `createMcpToolServer`, below `createToolPublisher`) ← body of `connectHost` verbatim, with its "Install the shared tool/resource dispatch…" comment. Field types: `McpToolServerRequiredArgs`, `McpToolServerOptions`, `NonNullable<McpToolServerOptions['createServer']>`, the `resources`/`resourceIndex` types as inferred today (use `ReturnType<typeof buildResourceIndex>`), and `transport`/`withActivity` as in `connectHost`'s current inline param type.
  2. `createMcpToolServer` keeps `function connectHost(input: { transport: …; withActivity: … }) { return connectToolHost({ requiredArgs, options, createServer, resources, resourceIndex, ...input }); }` (same name, so `run` is unchanged).
- **Importers to update:** none.
- **After:** file ~300; `createMcpToolServer` ~48; `connectToolHost` ~63.
- **Risks / notes:** `buildToolIndex` stays eager in `createMcpToolServer` (comment says the mutable dispatch index lives inside `run()` — do not move that).
