# K4-seam-19 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `@jini-ai/db/recovery/operation-lock` | OperationLockHandle, OperationLockError, AcquireOperationLockResult | 1 | 0 | `packages/core/src/contracts/site/recovery-operation-lock.ts` (export `./contracts/site/recovery-operation-lock`) — Jini-internal: move from the owning package |
| `@jini-ai/cms/core` | PublicPostKind | 1 | 0 | `packages/core/src/contracts/site/cms-core.ts` (export `./contracts/site/cms-core`) — Jini-internal: move from the owning package |
| `@jini-ai/http-kit/rate-limit` | ClientIpSource, RateLimitProfile | 1 | 0 | `packages/core/src/contracts/site/http-kit-rate-limit.ts` (export `./contracts/site/http-kit-rate-limit`) — Jini-internal: move from the owning package |
| `@jini-ai/daemon/tool-recovery` | ToolFailureDiagnostic | 1 | 0 | `packages/core/src/contracts/site/daemon-tool-recovery.ts` (export `./contracts/site/daemon-tool-recovery`) — Jini-internal: move from the owning package |
| `apps/website/src/contracts/headless/assistant-permanent-deletes-policy.ts` | ChatPermanentDeleteToolId, AssistantPermanentDeletesPolicy | 1 | 4 | `packages/core/src/contracts/site/headless-assistant-permanent-deletes-policy.ts` (export `./contracts/site/headless-assistant-permanent-deletes-policy`) |
| `@jini-ai/integrations/credentialed-http` | CredentialSchemeRule, CredentialSchemeRegistry | 1 | 0 | `packages/core/src/contracts/site/integrations-credentialed-http.ts` (export `./contracts/site/integrations-credentialed-http`) — Jini-internal: move from the owning package |
| `@jini-ai/cms/widgets/html` | PluginExportsPort, PluginExportTemplate | 1 | 0 | `packages/core/src/contracts/site/widgets-html.ts` (export `./contracts/site/widgets-html`) — Jini-internal: move from the owning package |
| `@jini-ai/integrations/api-connections` | ApiConnectionConnectStatus | 1 | 0 | `packages/core/src/contracts/site/integrations-api-connections.ts` (export `./contracts/site/integrations-api-connections`) — Jini-internal: move from the owning package |

If a type references a third-party type (kysely, express, react, drizzle), it cannot enter core (core has no dependencies): each Jini-bound user then declares the structural slice it reads beside itself (K4db rule) and the target is dropped from this step. Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 93 min (J), T about 75 min.
