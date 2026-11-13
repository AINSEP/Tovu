### tovu:apps/website/src/server/runtime/composition/other-site-keys.ts
- **Over:** `createOtherSiteKeys` 116 (file 167, under)
- **Phase:** now (label ?) · **Batch:** size-09
- **Tests:** `apps/website/src/server/runtime/composition/__tests__/other-site-keys.integration.test.ts`. No test mocks this module.
- **Responsibility map:**

| unit | nested functions | job |
|---|---|---|
| A | `readSource` | open one site source read-only, read, always close |
| B | `promote` | adopt a key into Shared Keys (reuse same-secret key, else free id/label) |
| C (stays) | `projectVault`, `sources`, `label`, `readPlainly`, `hasSafeNames`, `lockedReason`, key-id helpers, the returned `list`/`find`/`adopt` | list/find/adopt other sites' keys |

- **Splits:** HELPERS at module level directly above `createOtherSiteKeys`, bodies word for word with their comments:
  1. `readSiteSource<T>({ source, read, workspace, home, openSource, sources }: ReadSiteSourceInput<T>): Promise<T>` ← A (`sources` = the `sources` arrow, passed as a function). Keep `const readSource = <T>(input: { source: Source; read: … }) => readSiteSource<T>({ ...input, workspace, home, openSource, sources });` — `readPlainly`'s `Parameters<typeof readSource<T>>[0]` keeps working.
  2. `promoteToSharedKey({ summary, payload, source, projectVault, project, label }: PromoteToSharedKeyInput)` ← B (return type copied). `adopt` calls it with the extra three.
  Types: `workspace: SitesWorkspace`, `home: string`, `openSource: typeof openSqliteFileKernel`, `projectVault: SecretsVaultService`, `project: ProjectVaultScope`, `label: (source: Source & { isTarget?: boolean }) => string`.
- **Importers to update:** none.
- **After:** `createOtherSiteKeys` ~86; file ~180.
- **Risks / notes:** none.
