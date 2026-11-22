# K4-seam-11 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `@jini-ai/platform/secrets` | SealedSecret | 4 | 0 | `packages/core/src/contracts/site/platform-secrets.ts` (export `./contracts/site/platform-secrets`) — Jini-internal: move from the owning package |
| `apps/website/src/contracts/site-assistant/visitor-tools-management.ts` | VisitorToolDescriptor, VisitorToolsConfigureInput, VisitorToolsManagementPort, PreparedVisitorToolsChange, VisitorToolsView | 4 | 9 | `packages/core/src/contracts/site/site-assistant-visitor-tools-management.ts` (export `./contracts/site/site-assistant-visitor-tools-management`) |

Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 44 min (J), T about 36 min.
