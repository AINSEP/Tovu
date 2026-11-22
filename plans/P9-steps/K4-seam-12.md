# K4-seam-12 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `apps/website/src/platform/site-dir/index.ts` | SitesWorkspace, CreateSitePort, CreateSiteResult, SiteCreationAllocation, SiteBinding | 4 | 153 | `packages/core/src/contracts/site/platform-site-dir.ts` (export `./contracts/site/platform-site-dir`) |

Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 123 min (J), T about 98 min.
