# K4-seam-15 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `@jini-ai/search` | SearchProvider, SearchServiceResult | 2 | 0 | `packages/core/src/contracts/site/search.ts` (export `./contracts/site/search`) — Jini-internal: move from the owning package |
| `@jini-ai/oauth` | OAuthClient | 2 | 0 | `packages/core/src/contracts/site/oauth.ts` (export `./contracts/site/oauth`) — Jini-internal: move from the owning package |
| `@jini-ai/agent-plugins/admin-surfaces/connections` | AdminSurfaceConnectionsHost, IssuedSignIn | 2 | 0 | `packages/core/src/contracts/site/admin-surfaces-connections.ts` (export `./contracts/site/admin-surfaces-connections`) — Jini-internal: move from the owning package |
| `apps/website/src/contracts/core/consent-refusal.ts` | ConsentProblem | 2 | 8 | `packages/core/src/contracts/site/core-consent-refusal.ts` (export `./contracts/site/core-consent-refusal`) |
| `@jini-ai/agent-plugins/connect` | CredentialSaveAdapters, LoadPluginCredentialCards | 2 | 0 | `packages/core/src/contracts/site/agent-plugins-connect.ts` (export `./contracts/site/agent-plugins-connect`) — Jini-internal: move from the owning package |
| `apps/website/src/contracts/core/custom-credential-categories.ts` | CustomCredentialCategoryId | 2 | 10 | `packages/core/src/contracts/site/core-custom-credential-categories.ts` (export `./contracts/site/core-custom-credential-categories`) |
| `@jini-ai/db/events` | outboxEventValues | 2 | 0 | `packages/core/src/contracts/site/db-events.ts` (export `./contracts/site/db-events`) — Jini-internal: move from the owning package |
| `@jini-ai/daemon/http` | PendingAttachmentSummary, FrontendHookInput | 2 | 0 | `packages/core/src/contracts/site/daemon-http.ts` (export `./contracts/site/daemon-http`) — Jini-internal: move from the owning package |

Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 98 min (J), T about 78 min.
