# K4-seam-1 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `apps/website/src/contracts/core/tool-metadata/approval-policy.ts` | ToolApprovalPolicy, ToolApprovalClass | 58 | 63 | `packages/core/src/contracts/site/tool-metadata-approval-policy.ts` (export `./contracts/site/tool-metadata-approval-policy`) |
| `@jini-ai/daemon/surface-exchanges` | AssistantSurfaceDeps | 31 | 0 | `packages/core/src/contracts/site/daemon-surface-exchanges.ts` (export `./contracts/site/daemon-surface-exchanges`) — Jini-internal: move from the owning package |
| `@jini-ai/integrations/webhooks` | KeyringPort, SecretSealerPort | 27 | 0 | `packages/core/src/contracts/site/integrations-webhooks.ts` (export `./contracts/site/integrations-webhooks`) — Jini-internal: move from the owning package |

Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 81 min (J), T about 65 min.
