# K4-seam-23 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `apps/website/src/features/sites/index.ts` | SitePreviewService | 1 | 17 | `packages/core/src/contracts/site/features-sites.ts` (export `./contracts/site/features-sites`) |
| `apps/website/src/assistant/host-ports.ts` | ToolGapsToolDeps | 1 | 3 | `packages/core/src/contracts/site/assistant-host-ports.ts` (export `./contracts/site/assistant-host-ports`) |
| `@jini-ai/sandbox/node-worker` | SandboxRenderResult | 1 | 0 | `packages/core/src/contracts/site/sandbox-node-worker.ts` (export `./contracts/site/sandbox-node-worker`) — Jini-internal: move from the owning package |
| `@jini-ai/db/recovery/reconcile-interrupted-migration` | SiteStatusPort | 1 | 0 | `packages/core/src/contracts/site/recovery-reconcile-interrupted-migration.ts` (export `./contracts/site/recovery-reconcile-interrupted-migration`) — Jini-internal: move from the owning package |
| `apps/website/src/server/runtime/lifecycle/boot-lifecycle.ts` | BootModuleResult, ModuleLifecycleStatus | 1 | 16 | `packages/core/src/contracts/site/lifecycle-boot-lifecycle.ts` (export `./contracts/site/lifecycle-boot-lifecycle`) |
| `apps/website/src/server/runtime/composition/modules/site-search.ts` | SiteSearchRuntime | 1 | 13 | `packages/core/src/contracts/site/modules-site-search.ts` (export `./contracts/site/modules-site-search`) |

If a type references a third-party type (kysely, express, react, drizzle), it cannot enter core (core has no dependencies): each Jini-bound user then declares the structural slice it reads beside itself (K4db rule) and the target is dropped from this step. Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 94 min (J), T about 76 min.
