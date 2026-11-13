### tovu:apps/admin/src/features/deployment/StaticSiteTab.tsx
- **Over:** file 935 lines (no function over 100)
- **Phase:** after-move (MIXED) · **Batch:** size-47
- **Tests:** `apps/admin/src/features/deployment/__tests__/StaticSiteTab.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `StaticSiteTabProps`, `StaticSiteTab`, `GettingItOnlineCard`, `ManageAccessTokensLink` | tab shell + "Getting it online" card (stays) |
| B | `CopyLine`, `ExportRunCounts`, `ExportRunFailures`, `ExportRunResult`, `BuildExportCard`, `ExportTriggerAction` | static export build card + run result |
| C | `publishCredentialsSectionContent`, `PublishCredentialsSection`, `PublishCredentialFields`, `FieldLabel`, `CredentialFieldInput`, `TokenFieldHints`, `CredentialStepTodo`, `TemplateWithNode`, `CredentialStepDone`, `CredentialVerifyAction`, `CredentialTokenPicker` | Step 1: publish credential |
| D | `PublishFailureNotice`, `StaticPublishTargetFields`, `PublishPreviewAction`, `PublishTriggerAction`, `chosenCredentialIdForTarget`, `StaticPublishForm`, `PublishPreviewFacts` | Step 2: preview + publish form |

- **Splits:**
  1. NEW `StaticSiteTab-export.tsx` — job: build/export card. Moves unit B (+ the `@file` paragraph about the trigger+poll build; copy it to the new header). Exports `BuildExportCard`.
  2. NEW `StaticSiteTab-credentials.tsx` — job: the credential step. Moves unit C. Exports `PublishCredentialsSection`, `FieldLabel` (used by D).
  3. NEW `StaticSiteTab-publish-form.tsx` — job: preview + publish mini-form. Moves unit D; imports `FieldLabel` from step 2. Exports `StaticPublishForm`, `chosenCredentialIdForTarget` (used by `GettingItOnlineCard`).
  All JSDoc above each component moves with it. `StaticSiteTab.tsx` imports `BuildExportCard`, `PublishCredentialsSection`, `StaticPublishForm`, `chosenCredentialIdForTarget`. None of the new files imports `StaticSiteTab.tsx`.
- **Importers to update:** none outside the file (only `StaticSiteTab`/`StaticSiteTabProps` are exported and they stay).
- **After:** `StaticSiteTab.tsx` ~180; new files ~210 / ~350 / ~210.
- **Risks / notes:** no `vi.mock` of this module. Check each moved component's own imports (hooks from `./hooks/use-static-publish.hooks`, i18n) and carry only those it uses.
