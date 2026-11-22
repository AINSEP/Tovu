# K4-seam-16 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `@jini-ai/agent-plugins/lifecycle/host-tools` | ProviderStatusRow, ProviderStatusPorts, ProviderSettingFieldProjection, PluginMaturity | 2 | 0 | `packages/core/src/contracts/site/lifecycle-host-tools.ts` (export `./contracts/site/lifecycle-host-tools`) — Jini-internal: move from the owning package |
| `@jini-ai/agent-plugins/folder-zip` | zipFolderFiles | 2 | 0 | `packages/core/src/contracts/site/agent-plugins-folder-zip.ts` (export `./contracts/site/agent-plugins-folder-zip`) — Jini-internal: move from the owning package |
| `apps/website/src/contracts/core/public-page-security-headers.ts` | PublicThemeResources | 2 | 6 | `packages/core/src/contracts/site/core-public-page-security-headers.ts` (export `./contracts/site/core-public-page-security-headers`) |
| `apps/website/src/contracts/core/theme-slots.ts` | ThemeSlotDescriptor | 2 | 10 | `packages/core/src/contracts/site/core-theme-slots.ts` (export `./contracts/site/core-theme-slots`) |
| `@jini-ai/analytics` | DeviceClass, HitKind, NormalizedHit, IngestBeacon, IngestContext | 2 | 0 | `packages/core/src/contracts/site/analytics.ts` (export `./contracts/site/analytics`) — Jini-internal: move from the owning package |
| `@jini-ai/plugins/host/node` | PluginDiscoveryRecord, PluginPackageFiles, PluginInstallerPort | 2 | 0 | `packages/core/src/contracts/site/host-node.ts` (export `./contracts/site/host-node`) — Jini-internal: move from the owning package |

If a type references a third-party type (kysely, express, react, drizzle), it cannot enter core (core has no dependencies): each Jini-bound user then declares the structural slice it reads beside itself (K4db rule) and the target is dropped from this step. Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 91 min (J), T about 72 min.
