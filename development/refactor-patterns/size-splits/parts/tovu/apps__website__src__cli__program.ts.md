### tovu:apps/website/src/cli/program.ts
- **Over:** `createProgram` 196 (file 229, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-03
- **Tests:** `apps/website/src/cli/__tests__/unit/program-actions.unit.test.ts`, `apps/website/src/cli/__tests__/unit/plugin-command.unit.test.ts`, `apps/website/src/cli/__tests__/unit/deploy-config-target-help.unit.test.ts`, `apps/website/src/cli/__tests__/unit/export-public-url.unit.test.ts`, `apps/website/src/cli/__tests__/integration/introspect-command.integration.test.ts`, `apps/website/src/platform/site-dir/__tests__/integration/init-blank-site.integration.test.ts` (skip `storage-move.postgres.test.ts` unless Postgres is configured)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `program.command("site")…rename`, `program.command("import")`, `program.command("import-local")`, `program.command("sites")…move-home` | moving sites in/out/around |
| B | `const pluginProgram = program.command("plugin")` + its `install` / `integrity` | local plugin commands |
| C | the `program` chains for `init`, `agent-plugins token-sign-in`, `storage move`, `adopt`, `serve`, `export` | one site folder's lifecycle |
| D | `const themeProgram = program.command("theme")` + `validate`, `migrate`, `generate-index`, `sync-originals`, `normalize-build` | theme authoring group |
| E | `const deployProgram = program.command("deploy")` + `config` | deploy config group |
| F | program header, `registerOwnerStoreCommands`, `reset-owner`, `introspect`, `return program` | program assembly (stays) |

- **Splits** (same file, module level, between `JSON_SUMMARY_DESCRIPTION` and `createProgram`, in call order). All take the same shape as the existing `registerOwnerStoreCommands`: `({ program }: { program: Command }): void` (declare one `interface CliProgramInput { program: Command }` and use it for the new five):
  1. `registerSiteTransferCommands` ← from `program.command("site").description("manage local site folders")` through the `sites`/`move-home` chain.
  2. `registerPluginCommands` ← `const pluginProgram = …` through the `integrity` chain.
  3. `registerSiteFolderCommands` ← from the `program` chain whose first `.command` is `"init"` through the `"export"` chain, incl. the "Registered next to `init` deliberately" comment above `adopt`.
  4. `registerThemeCommands` ← the "Namespaced command group (2026-08-18 …)" comment, `const themeProgram = …`, all five `themeProgram` chains.
  5. `registerDeployCommands` ← the "Namespaced command group (mirrors `theme`…)" comment, `const deployProgram = …`, the `config` chain.
  6. `createProgram` keeps: `new Command`, description, `exitOverride`, `configureOutput`, `registerOwnerStoreCommands({ program })`, the `reset-owner` chain, then calls 1-5 in that order, then the `introspect` chain, `return program`.
- **Importers to update:** none (no export moves).
- **After:** file ~240; `createProgram` ~25; `registerSiteFolderCommands` ~80; others ≤ 50.
- **Risks / notes:** command REGISTRATION ORDER is observable (`--help`, `introspect` JSON) — calls must run in exactly the original order (owner-store → reset-owner → transfer → plugin → site-folder → theme → deploy → introspect). `JSON_SUMMARY_DESCRIPTION` is module-level, so helpers can read it directly.
