# K4-seam-22 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `@jini-ai/diagnostics/web-evidence/playwright` | OwnSiteFetch, RequestRouterOptions, RequestRouter, RouteLike, RoutedRequest, FetchedResource, AbortReason, RequestDecision, RequestRouterReport | 1 | 0 | `packages/core/src/contracts/site/web-evidence-playwright.ts` (export `./contracts/site/web-evidence-playwright`) — Jini-internal: move from the owning package |
| `@jini-ai/diagnostics/web-evidence/capture-budget` | CaptureBudgetLimits | 1 | 0 | `packages/core/src/contracts/site/web-evidence-capture-budget.ts` (export `./contracts/site/web-evidence-capture-budget`) — Jini-internal: move from the owning package |
| `@jini-ai/commerce` | lipay?: import("@jini-ai/commerce").CommercePaymentRuntimePort | 1 | 0 | `packages/core/src/contracts/site/commerce.ts` (export `./contracts/site/commerce`) — Jini-internal: move from the owning package |
| `apps/website/src/server/runtime/composition/provider-config-source.ts` | ProviderConfigSource | 1 | 19 | `packages/core/src/contracts/site/composition-provider-config-source.ts` (export `./contracts/site/composition-provider-config-source`) |
| `@jini-ai/agentic/skills/install` | SkillInstallInput | 1 | 0 | `packages/core/src/contracts/site/skills-install.ts` (export `./contracts/site/skills-install`) — Jini-internal: move from the owning package |
| `apps/website/src/contracts/core/site-key-state.ts` | SiteKeyState | 1 | 1 | `packages/core/src/contracts/site/core-site-key-state.ts` (export `./contracts/site/core-site-key-state`) |

Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 91 min (J), T about 73 min.
