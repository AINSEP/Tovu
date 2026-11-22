# K4-seam-20 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `@jini-ai/diagnostics/domain-dns` | DnsRecordType, DnsQuery, PublicDnsResolver, TlsStatus | 1 | 0 | `packages/core/src/contracts/site/diagnostics-domain-dns.ts` (export `./contracts/site/diagnostics-domain-dns`) — Jini-internal: move from the owning package |
| `@jini-ai/integrations/api-connections/hosted-mcp` | ExternalMcpOAuthDeps as CanonicalExternalMcpOAuthDeps, SharedExternalMcpOwner, DeviceAuthorizationStore, ExternalMcpOAuthService | 1 | 0 | `packages/core/src/contracts/site/api-connections-hosted-mcp.ts` (export `./contracts/site/api-connections-hosted-mcp`) — Jini-internal: move from the owning package |
| `@jini-ai/db/secrets-vault` | SqlSecretsVaultRepo | 1 | 0 | `packages/core/src/contracts/site/db-secrets-vault.ts` (export `./contracts/site/db-secrets-vault`) — Jini-internal: move from the owning package |
| `@jini-ai/integrations/media-providers/catalog` | MediaModel, MediaProvider | 1 | 0 | `packages/core/src/contracts/site/media-providers-catalog.ts` (export `./contracts/site/media-providers-catalog`) — Jini-internal: move from the owning package |
| `@jini-ai/cms/trash` | RemoveEntity, TrashActor | 1 | 0 | `packages/core/src/contracts/site/cms-trash.ts` (export `./contracts/site/cms-trash`) — Jini-internal: move from the owning package |
| `@jini-ai/cms/seo/content-analysis` | ContentBlock, HeadingLevel | 1 | 0 | `packages/core/src/contracts/site/seo-content-analysis.ts` (export `./contracts/site/seo-content-analysis`) — Jini-internal: move from the owning package |
| `@tovu/sdk` | Plugin | 1 | 0 | `packages/core/src/contracts/site/tovu-sdk.ts` (export `./contracts/site/tovu-sdk`) |
| `apps/website/src/platform/dev-supervisor/dev-restart.ts` | DevRestartPort | 1 | 4 | `packages/core/src/contracts/site/dev-supervisor-dev-restart.ts` (export `./contracts/site/dev-supervisor-dev-restart`) |

Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 99 min (J), T about 80 min.
