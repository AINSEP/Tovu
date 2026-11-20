Item 7 implemented; changes remain uncommitted.

- Created `form-delivery-repo.ts`, `form-pull-lease-repo.ts`, and `form-submission-receipt-repo.ts` under `packages/cms/src/forms/sql/`.
- Exported `SqlFormDeliveryRepo`, `SqlFormPullLeaseRepo`, and `SqlFormSubmissionReceiptRepo`.
- Added three constructor-function assertions to the existing integration contract test.
- Added `.changeset/forms-delivery-sql.md` and one `COMMIT-PLAN.md` entry recording all five comment rewrites and cloud follow-ups.

Items 2, 3, and 6 remain untouched. No package.json changes were required. No tests, builds, installs, typechecks, or linters were run, per dispatch.
