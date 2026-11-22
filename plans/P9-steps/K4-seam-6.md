# K4-seam-6 — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)

Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).

| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |
|---|---|---|---|---|
| `@jini-ai/user-management/react` | MembersController as JiniController, MembersPort, RolesPort, UsersController as JiniController, UserManageController, UsersPort, TotpSettingsPort, PasskeySettingsPort, PasskeySignInPort | 9 | 0 | `packages/core/src/contracts/site/user-management-react.ts` (export `./contracts/site/user-management-react`) — Jini-internal: move from the owning package |
| `@jini-ai/cookie-consent` | ConsentState, DeclaredScript, RawContribution, RegionResolver, ConsentAnalyticsProof, ConsentConfig | 9 | 0 | `packages/core/src/contracts/site/cookie-consent.ts` (export `./contracts/site/cookie-consent`) — Jini-internal: move from the owning package |
| `@jini-ai/cms/forms` | FormDeliveryJobStatus, FormDeliveryBinding, FormDeliveryConnectionPort, FormDestinationCredential, FormDestinationForm, FormSubmissionsInspection, FormDestinationPublishInput, FormReceiverPlan, FormReceiverPort, FormDefinitionRepoPort | 8 | 0 | `packages/core/src/contracts/site/cms-forms.ts` (export `./contracts/site/cms-forms`) — Jini-internal: move from the owning package |

If a type references a third-party type (kysely, express, react, drizzle), it cannot enter core (core has no dependencies): each Jini-bound user then declares the structural slice it reads beside itself (K4db rule) and the target is dropped from this step. Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est 83 min (J), T about 66 min.
