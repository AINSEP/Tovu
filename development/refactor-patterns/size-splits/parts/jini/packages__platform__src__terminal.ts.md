### jini:packages/platform/src/terminal.ts
- **Over:** `createTerminalService` 239
- **Phase:** now · **Batch:** size-30
- **Tests:** `src/__tests__/terminal.test.ts` (`pnpm --filter @jini-ai/platform exec vitest run src/__tests__/terminal.test.ts --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | options destructure, `sessions`, `cachedSpawnPty`, `loadPty`, `scheduleCleanup`, `get`, `list`, `return {` | service wiring (stays) |
| B | `recordByteLength`, `trimBuffer`, `emit`, `flushData`, `finish` | session output buffering + exit |
| C | `create` (52) | spawn a PTY session |
| D | `attach`, `detach`, `write`, `resize`, `kill`, `shutdownActive` | per-session controls |

- **Splits** (module level above `createTerminalService`, order B, C, D):
  1. HELPER `createSessionOutput({ maxEvents, maxBufferBytes, exitTailBytes, scheduleCleanup }: CreateSessionOutputInput): { emit; flushData; finish }` ← `const recordByteLength =` through `const finish = (session: InternalSession, code: number | null, signal: string | null) => {`.
  2. HELPER `createTerminalSession({ deps, createOptions }: CreateTerminalSessionInput): Promise<TerminalSession>` where `deps` holds exactly the closure names the `create` body reads (outline truncates the list — read ~L356-L411 once). Body = `create`'s body verbatim. Main keeps `const create = (createOptions: CreateTerminalOptions): Promise<TerminalSession> => createTerminalSession({ deps: createDeps, createOptions });` with `createDeps` built once just above.
  3. HELPER `createSessionControls({ sessions, get, finish, shutdownGraceMs }: CreateSessionControlsInput): { attach; detach; write; resize; kill; shutdownActive }` ← `const attach =` through `const shutdownActive =`.
  4. Main destructures each helper's result in place of the moved declarations; `return {` unchanged.
- **Importers to update:** none.
- **After:** file ~420; `createTerminalService` ~50; `createTerminalSession` ~55; `createSessionControls` ~85; `createSessionOutput` ~70.
- **Risks / notes:** `cachedSpawnPty` is a `let` mutated by `loadPty` — keep both in main and pass `loadPty` (the function) to `createTerminalSession`. Timers/flush intervals inside `create` stay as-is. Keep `get` in main (used by controls; pass it in).
