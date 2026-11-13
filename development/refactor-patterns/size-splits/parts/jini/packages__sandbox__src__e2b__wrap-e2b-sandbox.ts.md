### jini:packages/sandbox/src/e2b/wrap-e2b-sandbox.ts
- **Over:** `wrapE2bSandbox` 197
- **Phase:** now · **Batch:** size-23
- **Tests:** `src/e2b/__tests__/wrap-e2b-sandbox.test.ts`, `src/e2b/__tests__/mount-characterization.test.ts`, `src/e2b/__tests__/provider.test.ts` (`pnpm --filter @jini-ai/sandbox exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | config destructure, root `try {`, listener/mount maps, `fingerprint`, `trackedProcesses`, `return {` short props | session wiring (stays) |
| B | `let watchHandle` + `try { watchHandle = await handle.files.watchDir(` … `catch` | start the project-root watcher (echo-suppressing) |
| C | prop `mountFiles` (31) | mount files with rollback |
| D | prop `installDependencies` (16), prop `startProcess` (33) | process execution |
| E | prop `teardown` (19) | kill tracked processes + stop watcher |

- **Splits** (module level above `wrapE2bSandbox`):
  1. HELPER `startProjectWatch({ handle, projectRoot, fileChangeListeners, mountingPaths, mountedFiles, fingerprint }: StartProjectWatchInput): Promise<E2bWatchHandle>` ← the whole `try { … } catch (error) { throw wrapE2bError(error, 'Failed to start watching the sandbox project root'); }` block, returning the handle. `type E2bWatchHandle = Awaited<ReturnType<E2bSandboxHandle['files']['watchDir']>>`. Main: `const watchHandle = await startProjectWatch({ … });` (the `let` becomes `const` only if nothing reassigns it later — check `teardown`; otherwise keep `let watchHandle = await …`).
  2. HELPER `mountSessionFiles({ session, input }: MountSessionFilesInput)` ← body of prop `mountFiles`.
  3. HELPER `installSessionDependencies({ session, input })` ← body of `installDependencies`; `startSessionProcess({ session, input })` ← body of `startProcess`.
  4. HELPER `teardownSession({ session, watchHandle })` ← body of `teardown`.
  `session` = one object built once in main: `{ handle, projectRoot, fingerprint, mountedFiles, mountingPaths, trackedProcesses, fileChangeListeners }` typed `E2bSession` (interface declared above the helpers). `input` = the prop's existing parameter(s) as one object (if a prop takes several positional params, name them as fields). Return types inferred/kept as today.
- **Importers to update:** none.
- **After:** file ~300; `wrapE2bSandbox` ~80; helpers ≤ 40.
- **Risks / notes:** `provider.test.ts` does `vi.mock('../wrap-e2b-sandbox.js', …)` — it replaces the whole module; no export moves, so unaffected. Keep the "watcher carries no writer identity" and "Every process this session has started" comments with their maps. The initial `try {` (L176-180) stays first.
