# Commit plan

## DG2-01 — Declare existing public entries and pin dependency direction

- Status: implementation done; execution and mutation evidence owed to combine.
- Base: `7b27b4129174dd898d296cb2002ea0d131e72ecc`, supplied branch `codex/tv-dg-bnd2`.
- Files: `.dependency-cruiser.mjs`, `development/scripts/__tests__/dependency-cruiser.test.ts`, `COMMIT-PLAN.md`, `REFRESH.md`.
- Source: declare the seven named theme leaves, SEO `page-head-contributor`, and site-dir `errors`. Preserve rule scope, rank direction, existing imports, declarations, and argument pads.
- Tests first: added one scratch-tree case before editing the config. It copies the actual rank table and compares exact JSON rule names, error severities, and edge endpoints, plus process error/signal assertions with plain-words messages.
- Expected RED before the source change: the undeclared `theme-page-eligibility` leaf adds deep-import violations for the external production caller and the rank-2 media caller. The expected report contains only the private-theme error and the upward value-import error.
- Mutation owed to combine: remove the leaf declaration; suppress `no-deep-imports:features/theme`; suppress `feature-rank:2`, separately. Each changes the exact expected violation list and must fail the new case.
- Verification: tests, builds, installs, type checks, linters, and mutations were not run under the dispatch machine rule. Dependency-cruiser's executable is absent in this clone. No commits or git writes.
- Combine proof also owed: the published-but-unlisted theme-page case, `published-webmcp.test.ts`, `cover-image-head.test.ts`, the flag-specific stdin cap case, and existing worker/public-read import-graph checks.
- API-baseline delta (Jini): none. No debt, manifest, package API, or architecture baseline edits.
- Look owed: Chrome published theme-page and visitor-tool HTML check with DG2-06.
- Importer review: opened both coordinator-ruling importers; neither needs an edit because their current imports already target `platform/site-dir/errors`. Additional test callers and the inherited fixture issue are in `REFRESH.md`.
- Static dependency review: read the named leaves and their local runtime dependencies; no local write-service or tool-registry dependency found. Installed-package transitive proof remains with combine's existing graph checks.
- Architecture review: PASS for the static source diff, which contains only `PUBLIC_ENTRIES` data changes. Existing `noDeepImportRules` scope and `FEATURE_RANK_RULES` are unchanged. No production function or API change; runtime evidence is unavailable here.
- Function review: new test callback is 37 lines including its closing line; one fixture loop, no new helpers, casts, pads, comments, or dependencies. The existing long test callback remains unchanged. Assessment: new fixture callback | INCONCLUSIVE | runtime evidence unavailable under machine rule | static scope/size and assertion review completed.
- File size: `.dependency-cruiser.mjs` is 885 lines; recorded as instructed, not a stop reason.
- Diff re-read deletions: removed two incidental rank-table setup lines added to the existing test, retaining only the sheet's new case. No existing source or test assertions deleted or weakened.
- Fresh evidence: targeted `git show HEAD:<file>` comparisons and direct reads of the two changed code files; no repo-wide scan or runtime verification.
- Open items: combine execution/mutations, package-transitive graph proof, Chrome look, and the pre-existing scratch-fixture setup issue recorded in `REFRESH.md`.
