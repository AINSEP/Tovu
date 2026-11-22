# K4-seam-17 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `apps/admin/src/admin-themes/use-admin-theme.hooks.ts` | AdminThemeDocumentEnv, AdminThemePort | 1 | 25 | `packages/core/src/contracts/site/admin-themes-use-admin-theme-hooks.ts` (export `./contracts/site/admin-themes-use-admin-theme-hooks`) |
| `apps/admin/src/features/sites/hooks/sites-port.hooks.ts` | SitesPort | 1 | 11 | `packages/core/src/contracts/site/hooks-sites-port-hooks.ts` (export `./contracts/site/hooks-sites-port-hooks`) |
| `@jini-ai/agentic/dom` | DomPageDriverPage | 1 | 0 | `packages/core/src/contracts/site/agentic-dom.ts` (export `./contracts/site/agentic-dom`) — Jini-internal: move from the owning package |
| `@jini-ai/devops/packaging/electron` | AsarHeaderNode, AsarMismatch, AsarVerification | 1 | 0 | `packages/core/src/contracts/site/packaging-electron.ts` (export `./contracts/site/packaging-electron`) — Jini-internal: move from the owning package |
| `@jini-ai/platform/process` | ProcessPrivateMemory, ProcessUsage | 1 | 0 | `packages/core/src/contracts/site/platform-process.ts` (export `./contracts/site/platform-process`) — Jini-internal: move from the owning package |

Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 85 min (J), T about 68 min.
