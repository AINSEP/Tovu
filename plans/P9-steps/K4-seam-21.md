# K4-seam-21 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `@jini-ai/db/kernel/sqlite` | sqliteForeignKeyCheckedTransaction, sqliteTableInfo | 1 | 0 | `packages/core/src/contracts/site/kernel-sqlite.ts` (export `./contracts/site/kernel-sqlite`) — Jini-internal: move from the owning package |
| `apps/website/src/features/publish-content/ui/sections.ts` | PublishSection, PublishSectionId | 1 | 5 | `packages/core/src/contracts/site/ui-sections.ts` (export `./contracts/site/ui-sections`) |
| `apps/website/src/platform/server-logs/index.ts` | ServerLogEntry, ServerLogLevel | 1 | 15 | `packages/core/src/contracts/site/platform-server-logs.ts` (export `./contracts/site/platform-server-logs`) |
| `apps/website/src/assistant/agent-discovery.ts` | AssistantAgentInventory | 1 | 3 | `packages/core/src/contracts/site/assistant-agent-discovery.ts` (export `./contracts/site/assistant-agent-discovery`) |
| `@jini-ai/cms/redirects` | RedirectRecord, RedirectRepoPort | 1 | 0 | `packages/core/src/contracts/site/cms-redirects.ts` (export `./contracts/site/cms-redirects`) — Jini-internal: move from the owning package |

If a type references a third-party type (kysely, express, react, drizzle), it cannot enter core (core has no dependencies): each Jini-bound user then declares the structural slice it reads beside itself (K4db rule) and the target is dropped from this step. Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 77 min (J), T about 61 min.
