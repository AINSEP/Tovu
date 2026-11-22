# K4-seam-7 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `apps/website/src/contracts/core/gated-mutations/ports.ts` | DbOpsPort | 8 | 23 | `packages/core/src/contracts/site/gated-mutations-ports.ts` (export `./contracts/site/gated-mutations-ports`) |
| `@jini-ai/agent-plugins/lifecycle` | InstalledAgentPlugin, SetAgentPluginEnabledInput as AgentPluginEnableInput, SetAgentPluginEnabledResult, UninstallAgentPluginRequired as JiniUninstallRequired, UninstallAgentPluginOptional, UninstallAgentPluginResult, AgentPluginArchiveReaderPort, AgentPluginArchiveEntry | 7 | 0 | `packages/core/src/contracts/site/agent-plugins-lifecycle.ts` (export `./contracts/site/agent-plugins-lifecycle`) — Jini-internal: move from the owning package |
| `apps/website/src/contracts/core/gated-mutations/gateway.ts` | GatewayDeps, GatedMutationHooks | 6 | 32 | `packages/core/src/contracts/site/gated-mutations-gateway.ts` (export `./contracts/site/gated-mutations-gateway`) |

If a type references a third-party type (kysely, express, react, drizzle), it cannot enter core (core has no dependencies): each Jini-bound user then declares the structural slice it reads beside itself (K4db rule) and the target is dropped from this step. Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 88 min (J), T about 70 min.
