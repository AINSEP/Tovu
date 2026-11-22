# K4-seam-9 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `apps/website/src/contracts/core/runtime-mode.ts` | RuntimeMode | 5 | 35 | `packages/core/src/contracts/site/core-runtime-mode.ts` (export `./contracts/site/core-runtime-mode`) |
| `@jini-ai/cookie-consent/react` | ConsentSettingsView, ConsentFieldProblem | 4 | 0 | `packages/core/src/contracts/site/cookie-consent-react.ts` (export `./contracts/site/cookie-consent-react`) — Jini-internal: move from the owning package |
| `apps/admin/src/features/sites/api/sites-api.types.ts` | AdminGeneratedSiteKey, AdminImportedSiteKey, AdminRevealedSiteKey, AdminSiteKeyStartFreshPreview, AdminSiteKeyStatus, AdminStartedFreshSiteKey, AdminSiteKeyAffectedWebhook | 4 | 41 | `packages/core/src/contracts/site/api-sites-api-types.ts` (export `./contracts/site/api-sites-api-types`) |

If a type references a third-party type (kysely, express, react, drizzle), it cannot enter core (core has no dependencies): each Jini-bound user then declares the structural slice it reads beside itself (K4db rule) and the target is dropped from this step. Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 99 min (J), T about 79 min.
