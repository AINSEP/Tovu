# K4-seam-5 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `@jini-ai/db/kernel` | KyselyKernel | 17 | 0 | `packages/core/src/contracts/site/db-kernel.ts` (export `./contracts/site/db-kernel`) — Jini-internal: move from the owning package |
| `apps/website/src/features/publish-content/tovu-publish-ports.ts` | TovuPublishPorts, EntryPublishPorts, TaxonomyPublishPorts, WidgetPublishPorts | 16 | 22 | `packages/core/src/contracts/site/publish-content-tovu-publish-ports.ts` (export `./contracts/site/publish-content-tovu-publish-ports`) |
| `@jini-ai/platform/secrets/credential-token` | CredentialTokenHint, CredentialConnection | 13 | 0 | `packages/core/src/contracts/site/secrets-credential-token.ts` (export `./contracts/site/secrets-credential-token`) — Jini-internal: move from the owning package |
| `@jini-ai/user-management` | PrincipalRepoPort, UserRepoPort, PrincipalRecord, PolicyRecord, RoleRecord, UserRecord, IdentityRepos, PasswordHasherPort | 13 | 0 | `packages/core/src/contracts/site/user-management.ts` (export `./contracts/site/user-management`) — Jini-internal: move from the owning package |
| `@jini-ai/agentic/core` | GuideTopic as CapabilityCard, PagePublication, PublishedPageAction, PublishedPageElement | 10 | 0 | `packages/core/src/contracts/site/agentic-core.ts` (export `./contracts/site/agentic-core`) — Jini-internal: move from the owning package |

If a type references a third-party type (kysely, express, react, drizzle), it cannot enter core (core has no dependencies): each Jini-bound user then declares the structural slice it reads beside itself (K4db rule) and the target is dropped from this step. Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 96 min (J), T about 77 min.
