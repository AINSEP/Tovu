### jini:packages/platform/src/fs/directory-workspace.ts
- **Over:** `createNodeDirectoryWorkspace` 172
- **Phase:** now · **Batch:** size-30
- **Tests:** `src/fs/__tests__/directory-workspace.test.ts`, `src/fs/__tests__/directory-registry.test.ts`, `src/fs/__tests__/app-data-profile.test.ts`, `src/fs/__tests__/user-data-config.test.ts`, `src/fs/__tests__/file-lock.incomplete-holder.test.ts` (`pnpm --filter @jini-ai/platform exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `fileAt`, `config`, `settings`, `readSetting`, `legacyHome`, `home` | settings + home resolution (stays) |
| B | `fixturePattern`, `atHome`, `oldCatalogs`, `importOldCatalog` | catalog registry access + one-time legacy catalog import |
| C | `runningLockAt`, `mutate`, `registry` | locking + registry facade (stays) |
| D | prop `relocate` (34) | move the sites home |
| E | prop `running` (15) | running-lease surface |
| F | rest of `return {`, `thisConfig` | surface (stays) |

- **Splits** (module level above `createNodeDirectoryWorkspace`):
  1. HELPER `createCatalogAccess({ fileAt, config, home, registryName, canonicalPath, registryRecovery, homeDir, defaultFolder, envName, env, cwd, directoryOptions, userConfig }: CreateCatalogAccessInput): { atHome; oldCatalogs; importOldCatalog }` ← `const fixturePattern = registryRecovery ?` through `const importOldCatalog = () => {` (with the "Read old catalogs" comment). Input = exactly the closure names those four read.
  2. HELPER `relocateWorkspaceHome({ …closure names read…, input }: RelocateWorkspaceHomeInput)` ← body of prop `relocate`; the prop becomes a one-line call passing its parameter as `input` (keep the prop's parameter type and return type as today).
  3. HELPER `createRunningSurface({ …closure names read… }: CreateRunningSurfaceInput)` ← the value of prop `running`, moved verbatim and returned; prop becomes `running: createRunningSurface({ … })` — ONLY if the value is not lazily evaluated today; if `running` is a method/getter, wrap the same way as `relocate`.
- **Importers to update:** none.
- **After:** file ~205; `createNodeDirectoryWorkspace` ~90; helpers ≤ 40.
- **Risks / notes:** `atHome`/`oldCatalogs` are lazy thunks — keep them thunks. `mutate` calls `importOldCatalog` inside `settings.withLock` — unchanged. The "Serialize pointer changes" comment stays on `registry`.
