### tovu:apps/desktop/src/tovu-server.ts
- **Over:** file 503 lines · `startTovuServer` 118
- **Phase:** after-move (MIXED — DEDUPE-AFTER-HARDENING) · **Batch:** size-56
- **Tests:** `apps/desktop/src/tovu-server.test.ts`, `tovu-server-failures.test.ts`, `tovu-server.boundaries.test.ts`, `tovu-server.desktop-mcp.test.ts`, `cli-child-secrets.test.ts`, `profile-isolation.test.ts`, `product-telemetry.test.ts`, `admin-dev-proxy.test.ts`, `desktop-capture-env.test.ts`, `built-in-mcp-ownership.test.ts`, `desktop-reported-regressions.test.ts`, `electron-builder-files.test.ts`, `move-site-home.test.ts` (desktop main runner). No `mock.module` of this file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | boot-line / CLI-error / boot-token parsing + constants, `resolveCliEntry`, `resolveDevCliEntry`, `buildCliSpawnPlan` | how to invoke the CLI and read its output (stays) |
| B | `buildCliEnv`, `BuildServeEnvInput`, `buildServeEnv`, `apply*Env`, `applyRepoRootDefaults` | child env (stays — ~25 importers; moving it is churn without a new job) |
| C | `SpawnedChild`, `taskkillTree`, `stopChild`, `killWin32Tree`, `ExitOutcome`, `ExitSignal`, `createExitSignal`, `buildServeSpawnOptions` | spawn options, stop and exit signalling of a server child process |
| D | in `startTovuServer`: `const plan = buildCliSpawnPlan({` … `const child = spawnFn(` | build argv + env and spawn the child |
| E | in `startTovuServer`: `async function stopIfIdle(` | idle sleep request + bounded wait for the sleep exit |
| F | rest of `startTovuServer` (delivery, redaction, the ready/timeout/exit promise) | boot handshake (stays) |

- **Splits** (execution order):
  1. NEW `apps/desktop/src/tovu-server-child.ts` — job: a spawned server child's process group, stop and exit signal. Moves unit C verbatim (all doc comments incl. the W7/win32 `taskkill` paragraph and the `SpawnedChild` "kept narrow" paragraph). Exports `SpawnedChild` (type), `stopChild`, `createExitSignal`, `ExitSignal` (type), `buildServeSpawnOptions`, `taskkillTree`. Imports nothing from `tovu-server.ts`.
  2. HELPER `spawnServeChild({ input, port, spawnFn }: SpawnServeChildInput): { serveEnv: ReturnType<typeof buildServeEnv>; startup: ReturnType<typeof splitNodeStartupSecrets>; child: SpawnedChild }` (module level, above `startTovuServer`) ← unit D verbatim incl. the `--emit-boot-token` opt-in comment, the `agentService` token deletes and the "Startup IPC is separate" comment.
  3. HELPER `stopServerIfIdle({ agentBinding, stopGraceMs, exitSignal }: StopServerIfIdleInput): Promise<boolean>` ← body of `stopIfIdle` (its doc comment moves to the helper). In `startTovuServer`: `const stopIfIdle = async (_required = {}, _optional = {}): Promise<boolean> => stopServerIfIdle({ agentBinding, stopGraceMs, exitSignal });`. `agentBinding` type = `ReturnType<NonNullable<StartTovuServerInput["agentService"]>["bindServer"]> | undefined`.
  4. Drop `createExitSignal` from the bottom `export { … }` block (now exported by the child module).
- **Importers to update:** none outside the file import `createExitSignal`/`stopChild`/`SpawnedChild` (verified rg: comments only). `tovu-server.ts` itself imports them from `./tovu-server-child.ts`.
- **After:** `tovu-server.ts` ~405; `startTovuServer` ~80; `tovu-server-child.ts` ~110.
- **Risks / notes:** `child.pid!` inside the resolve stays verbatim (existing, not new). `electron-builder.yml` ships `src/**`, so the new file is packaged; `electron-builder-files.test.ts` names only `src/tovu-server.ts` (still there). After-move: "DEDUPE-AFTER-HARDENING" — `stopChild`/`taskkillTree` duplicate the reconcile kill in `site-process-registry.ts`/Jini sidecar; isolating them in `tovu-server-child.ts` gives the later dedupe one file to replace.
