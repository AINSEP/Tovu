# K4-seam-14 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `@jini-ai/agent-runtime` | DetectedAgent as RuntimeDetectedAgent, detectAgents, listProviderModels, testProviderConnection, DetectedAgent | 3 | 0 | `packages/core/src/contracts/site/agent-runtime.ts` (export `./contracts/site/agent-runtime`) — Jini-internal: move from the owning package |
| `@jini-ai/http-kit/settings` | SettingsErrorMapping | 3 | 0 | `packages/core/src/contracts/site/http-kit-settings.ts` (export `./contracts/site/http-kit-settings`) — Jini-internal: move from the owning package |
| `apps/admin/src/nav.ts` | AdminNavGroup | 2 | 15 | `packages/core/src/contracts/site/nav.ts` (export `./contracts/site/nav`) |
| `@jini-ai/agentic` | PageEntityLookup, ResolvedPageEntity, AgentNavigationScreen | 2 | 0 | `packages/core/src/contracts/site/agentic.ts` (export `./contracts/site/agentic`) — Jini-internal: move from the owning package |
| `@jini-ai/infra/events/outbox` | OutboxDrainer, OutboxRetryPolicyResolver | 2 | 0 | `packages/core/src/contracts/site/events-outbox.ts` (export `./contracts/site/events-outbox`) — Jini-internal: move from the owning package |
| `@jini-ai/agent-plugins/manifest` | AgentPluginExport | 2 | 0 | `packages/core/src/contracts/site/agent-plugins-manifest.ts` (export `./contracts/site/agent-plugins-manifest`) — Jini-internal: move from the owning package |
| `@jini-ai/user-management/server` | LoginProvider, AuthServiceDeps | 2 | 0 | `packages/core/src/contracts/site/user-management-server.ts` (export `./contracts/site/user-management-server`) — Jini-internal: move from the owning package |

If a type references a third-party type (kysely, express, react, drizzle), it cannot enter core (core has no dependencies): each Jini-bound user then declares the structural slice it reads beside itself (K4db rule) and the target is dropped from this step. Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 96 min (J), T about 77 min.
