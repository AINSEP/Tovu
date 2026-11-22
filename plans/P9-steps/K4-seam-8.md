# K4-seam-8 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `@jini-ai/agent-plugins/admin-surfaces` | AdminSurfaceBootstrap, AdminSurfaceAction, AdminSurfaceActionOutcome, AdminSurfacePluginStatePersistence, AgentPluginStateScope, AgentPluginStateStore, AgentPluginStateSummary, AdminSurfaceConnections | 5 | 0 | `packages/core/src/contracts/site/agent-plugins-admin-surfaces.ts` (export `./contracts/site/agent-plugins-admin-surfaces`) — Jini-internal: move from the owning package |
| `apps/admin/src/features/ai-assistant/api/ai-assistant-api.types.ts` | AdminExecutionCredential, AdminExecutionCredentialPatch, SiteAssistantCredential, SiteAssistantCredentialPatch | 5 | 25 | `packages/core/src/contracts/site/api-ai-assistant-api-types.ts` (export `./contracts/site/api-ai-assistant-api-types`) |
| `@jini-ai/capability-providers/comments` | CommentsProviderAdapter, CommentsProviderDefinition, CommentThreadRendererPort, CommentsSelectionStorePort, CommentThreadScript, CommentsProviderRegistry | 5 | 0 | `packages/core/src/contracts/site/capability-providers-comments.ts` (export `./contracts/site/capability-providers-comments`) — Jini-internal: move from the owning package |

If a type references a third-party type (kysely, express, react, drizzle), it cannot enter core (core has no dependencies): each Jini-bound user then declares the structural slice it reads beside itself (K4db rule) and the target is dropped from this step. Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 84 min (J), T about 67 min.
