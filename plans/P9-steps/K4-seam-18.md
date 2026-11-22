# K4-seam-18 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `apps/desktop/src/contracts/resources.ts` | MemoryMetric, ResourceProcess | 1 | 16 | `packages/core/src/contracts/site/contracts-resources.ts` (export `./contracts/site/contracts-resources`) |
| `@jini-ai/platform/fs/durable-json` | FileLockOptions, JsonFileRead, QuarantineNotice | 1 | 0 | `packages/core/src/contracts/site/fs-durable-json.ts` (export `./contracts/site/fs-durable-json`) — Jini-internal: move from the owning package |
| `@jini-ai/chat/core` | AgentEvent | 1 | 0 | `packages/core/src/contracts/site/chat-core.ts` (export `./contracts/site/chat-core`) — Jini-internal: move from the owning package |
| `@jini-ai/chat/core/run-events` | RunAgentPayload, RunProtocolEventWire, TerminalOutcome, RunFrameOutcome, RunFrameCarry | 1 | 0 | `packages/core/src/contracts/site/core-run-events.ts` (export `./contracts/site/core-run-events`) — Jini-internal: move from the owning package |
| `@jini-ai/cms/core/commands` | EntityReverter, RevertRegistry | 1 | 0 | `packages/core/src/contracts/site/core-commands.ts` (export `./contracts/site/core-commands`) — Jini-internal: move from the owning package |
| `@jini-ai/devops/static-export` | ExportReport as BaseExportReport | 1 | 0 | `packages/core/src/contracts/site/devops-static-export.ts` (export `./contracts/site/devops-static-export`) — Jini-internal: move from the owning package |
| `apps/website/src/assistant/mcp-services.ts` | ConversationToolApprovalStore | 1 | 4 | `packages/core/src/contracts/site/assistant-mcp-services.ts` (export `./contracts/site/assistant-mcp-services`) |

Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 99 min (J), T about 79 min.
