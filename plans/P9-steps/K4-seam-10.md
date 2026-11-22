# K4-seam-10 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `@jini-ai/ui/mcp-ui/secret-card` | SecretCardForm, SecretCardField | 4 | 0 | `packages/core/src/contracts/site/mcp-ui-secret-card.ts` (export `./contracts/site/mcp-ui-secret-card`) — Jini-internal: move from the owning package |
| `@jini-ai/daemon` | ToolAccessChange, PrepareToolGuidance, *, FrontendSessionOwner | 4 | 0 | `packages/core/src/contracts/site/daemon.ts` (export `./contracts/site/daemon`) — Jini-internal: move from the owning package |
| `@jini-ai/plugins/host` | PluginActivationRecord, PluginActivationRepoPort, ProviderKeyUsage, ProviderWriteResult, PluginConflict, RemovePluginFn, PluginContributionsSnapshot | 4 | 0 | `packages/core/src/contracts/site/plugins-host.ts` (export `./contracts/site/plugins-host`) — Jini-internal: move from the owning package |
| `@jini-ai/db/data-modules` | ColumnType, DataModuleDecl | 4 | 0 | `packages/core/src/contracts/site/db-data-modules.ts` (export `./contracts/site/db-data-modules`) — Jini-internal: move from the owning package |
| `apps/website/src/assistant/tool-contributions.ts` | DuplicateResourceHandler, DuplicateResourceHandlerContributor | 4 | 7 | `packages/core/src/contracts/site/assistant-tool-contributions.ts` (export `./contracts/site/assistant-tool-contributions`) |
| `@jini-ai/ui/mcp-ui/surfaces` | SurfaceOutcomeSpec, SurfaceDetail | 4 | 0 | `packages/core/src/contracts/site/mcp-ui-surfaces.ts` (export `./contracts/site/mcp-ui-surfaces`) — Jini-internal: move from the owning package |

Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 93 min (J), T about 75 min.
