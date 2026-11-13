### jini:packages/platform/src/fs/directory-user-config.ts
- **Over:** `createDirectoryUserConfig` 146
- **Phase:** now · **Batch:** size-30
- **Tests:** `src/fs/__tests__/directory-user-config.test.ts`, `src/fs/__tests__/user-data-config.test.ts` (`pnpm --filter @jini-ai/platform exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `directories` … `legacyHomes`, `stored`, `syncProvider`, `read`, `configuredRoots` | resolve paths + read settings (stays) |
| B | `assertDirectories`, `assertNotOverridden`, `merged`, `update`, `updateRoots` | validate + write settings |
| C | `moveMarker`, `authoritativeCopy`, `recoveredMove`, `existingCopy`, `unsafeIdentityPath`, `databasePath` | locate a site database across folder moves |
| D | `return {` | surface (stays) |

- **Splits** (module level above `createDirectoryUserConfig`):
  1. HELPER `createUserConfigWriter({ file, stored, read, expand, distinct, exists, isDirectory, env, envName, policy, … }: CreateUserConfigWriterInput): { update; updateRoots }` ← `function assertDirectories(` (with its "Prefer explicit settings" comment) through `function updateRoots(`. The input holds exactly the closure names those five bodies read (the outline truncates `update`'s list — read ~L117-L139 once; include `configuredRoots`/`removeFile`/`report` if read). Types: `DirectoryUserConfig`, `DirectoryUserConfigPolicy`, and explicit function types, e.g. `stored: (locked?: boolean) => Partial<DirectoryUserConfig>`, `read: (required: Record<string, never>, options?: object) => DirectoryUserConfig`, `expand: (value: string) => string`, `distinct: (values: readonly string[]) => string[]`.
  2. HELPER `createDatabaseLocator({ fileAt, read, exists, report, directories }: CreateDatabaseLocatorInput): { databasePath }` ← `function moveMarker(` (with its "A move journal is written before copying" comment) through `function databasePath(`. Same input rule.
  3. Main destructures `{ update, updateRoots }` and `{ databasePath }` after `read`/`syncProvider` are declared; `return {` unchanged.
- **Importers to update:** none.
- **After:** file ~198; `createDirectoryUserConfig` ~70; `createUserConfigWriter` ~42; `createDatabaseLocator` ~48.
- **Risks / notes:** only `const` arrow locals (`expand`, `distinct`, `syncProvider`) must exist before the helper calls — place the calls after them. No runtime-order change otherwise (moved items are function declarations).
