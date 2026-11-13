### tovu:apps/website/src/features/newsletter/repo.ts
- **Over:** file 548 lines (no function over 100)
- **Phase:** after-move (MOVE-AFTER content schema type; MOVE-AFTE…) · **Batch:** size-48
- **Tests:** `apps/website/src/features/newsletter/__tests__/repo.contract.test.ts`, `apps/website/src/features/newsletter/__tests__/repo.dialects.test.ts`, `apps/website/src/features/newsletter/__tests__/repo.rows.test.ts`
- **Responsibility map:** A editorial (`DEFAULT_LIST_LIMIT`, `campaignsWithEditorialState`, `SqlNewsletterCampaignRepo`, `SqlNewsletterListRepo`, `SqlNewsletterSubscriptionRepo`, `SqlNewsletterConfirmationTokenRepo`) · B dispatch (`SqlNewsletterAudienceSnapshotRepo`, `SqlNewsletterSendRepo` incl. `claimForDispatch` / `recordOutcome` lease logic).
- **Splits:**
  1. NEW `repo-dispatch.ts` — job: audience snapshots + send rows (dispatch leases). Moves unit B with all lease comments. `SqlNewsletterSendRepo` uses `DEFAULT_LIST_LIMIT`: move the constant (+ its comment) into `repo-dispatch.ts`, export it, and import it in `repo.ts` (new never imports original).
- **Importers to update:** `features/newsletter/repo.sqlite.ts`, `features/newsletter/__tests__/repo.dialects.test.ts` (both classes); rg `from ".*newsletter/repo(\.js)?"` for others.
- **After:** `repo.ts` ~365; `repo-dispatch.ts` ~185.
- **Risks / notes:** the `@file` paragraph ("one Kysely query body for every database") is copied into the new header.
