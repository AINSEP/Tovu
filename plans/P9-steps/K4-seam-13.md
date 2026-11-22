# K4-seam-13 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `@jini-ai/protocol/mcp-ui` | UIResourceUri, UIResource | 3 | 0 | `packages/core/src/contracts/site/protocol-mcp-ui.ts` (export `./contracts/site/protocol-mcp-ui`) — Jini-internal: move from the owning package |
| `@jini-ai/platform/secrets/credential-sets` | SecretsVaultService | 3 | 0 | `packages/core/src/contracts/site/secrets-credential-sets.ts` (export `./contracts/site/secrets-credential-sets`) — Jini-internal: move from the owning package |
| `@jini-ai/devops/deploy` | DeployFile, ArtifactStorePort, DeployTargetCredential, PluginDeployHostKit as DeployHostKit | 3 | 0 | `packages/core/src/contracts/site/devops-deploy.ts` (export `./contracts/site/devops-deploy`) — Jini-internal: move from the owning package |
| `apps/website/src/contracts/core/settings-vocabulary.ts` | MailTestModeSetting | 3 | 11 | `packages/core/src/contracts/site/core-settings-vocabulary.ts` (export `./contracts/site/core-settings-vocabulary`) |
| `@jini-ai/cms/media` | TransformParams, MediaRepoPort, ImageCodecPort | 3 | 0 | `packages/core/src/contracts/site/cms-media.ts` (export `./contracts/site/cms-media`) — Jini-internal: move from the owning package |
| `@jini-ai/daemon/tool-audit` | ToolAttemptAuditSink, ToolAttemptEvent, ToolGapEntry | 3 | 0 | `packages/core/src/contracts/site/daemon-tool-audit.ts` (export `./contracts/site/daemon-tool-audit`) — Jini-internal: move from the owning package |

If a type references a third-party type (kysely, express, react, drizzle), it cannot enter core (core has no dependencies): each Jini-bound user then declares the structural slice it reads beside itself (K4db rule) and the target is dropped from this step. Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 86 min (J), T about 68 min.
