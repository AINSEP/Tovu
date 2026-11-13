### jini:packages/server/src/create-local-node-daemon.ts
- **Over:** `createLocalNodeDaemon` (implementation overload) 113
- **Phase:** now · **Batch:** size-23
- **Tests:** `src/__tests__/create-local-node-daemon.test.ts`, `src/__tests__/create-local-node-daemon.headers.test.ts`, `src/__tests__/kernel-runtime.test.ts` (`pnpm --filter @jini-ai/server exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `host`, `env`, port/registry locals, lets, `app`, `kernel = await composeJiniKernel({`, `activeFeatures`, final `return await new Promise<LocalNodeDaemon>(` | boot + listen orchestration (stays) |
| B | the async IIFE inside `stop()` | ordered shutdown: close server, dispose features/packs, remove registry record, onShutdown, close base |
| C | `const listen = (): Promise<Server> =>` | bind the HTTP listener |

- **Splits** (module level above the overloads of `createLocalNodeDaemon`):
  1. HELPER `shutDownLocalDaemon({ server, kernel, registryPath, config }: ShutDownLocalDaemonInput): Promise<void>` ← the body of the `(async () => { try { await closeHttpServer(server); } finally { … } })()` IIFE (verbatim, including the empty `.catch(() => { … })` comment). `stop()` becomes: `shuttingDown = true; if (!stopPromise) { stopPromise = shutDownLocalDaemon({ server, kernel, registryPath, config }); } return stopPromise;`. Types: `server: Server`, `kernel: Awaited<ReturnType<typeof composeJiniKernel>>`, `registryPath: string | null`, `config: CreateLocalNodeDaemonConfig<readonly AnyPack[], string>`.
  2. HELPER `listenLocalDaemon({ app, requestedPort, host }: ListenLocalDaemonInput): Promise<Server>` ← body of `listen`; main keeps `const listen = (): Promise<Server> => listenLocalDaemon({ app, requestedPort, host });`.
- **Importers to update:** none.
- **After:** file ~290; `createLocalNodeDaemon` ~88; helpers ~20 / ~14.
- **Risks / notes:** `server` is a `let` assigned in the final Promise; it is read when `stop()` runs (same as the IIFE reading it synchronously at its start) — unchanged semantics. Keep `stopPromise` memoization in `stop()`.
