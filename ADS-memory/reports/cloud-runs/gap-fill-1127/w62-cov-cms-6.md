BOOTSTRAP: dispatched job. This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.

ROLE: you are the TDD agent doing a coverage GAP FILL. Read first: /Users/la/Programming/Tovu/AI-Dev-Shop/agents/tdd/skills.md, then the skills it lists for writing tests: AI-Dev-Shop/skills/test-design/SKILL.md, AI-Dev-Shop/skills/adversarial-test-design/references/testing-mistakes.md (lines 1-192: The One Question, the "What I'm about to test" index, Author Checklist; then the entries for what you test), AI-Dev-Shop/skills/coding-foundations/SKILL.md, AI-Dev-Shop/skills/testable-design-patterns/SKILL.md, and AI-Dev-Shop/harness-engineering/quality/coverage-integrity-policy.md (all under /Users/la/Programming/Tovu/). There is no spec/ADR for this work: skip spec-hash/ADR/CIC certification steps; follow the gap-fill path (step 4a).

GOAL: owner target is 100% lines/branches/functions per file. Write HIGH-QUALITY tests that cover the uncovered lines listed below. A test exists to catch a real break, not to raise a number.

HARD - NO RUNNING (owner: running tests here could take down the machine): do NOT run tests, test suites, builds, installs, typechecks of the tests tsconfig, coverage, or mutation runs. This clone has no node_modules; do not install. An Opus cloud run tests and fixes everything after you, so write code that you are confident compiles: check imports, exported names and types by reading the source.
HARD - NO REPO-WIDE SEARCH: no git grep / rg / find over the whole repo. Search only inside the target file's own package or app folder (e.g. `git grep -l <name> -- packages/cms/`), or read exact files.
DO NOT TOUCH: packages/commerce, packages/user-management, packages/integrations (other jobs own them), packages/admin/src/pages/PageEditorChrome.tsx and its tests, coverage configs, thresholds, guard baselines, ratchets.

FOR EACH FILE in the list:
1. Read the source and its existing tests (same folder / __tests__ next to it). Extend an existing test file when it fits; else add a new one that matches the neighbours' runner, location and naming (Jini = vitest; Tovu website/desktop = node:test + node:assert as the neighbours do; Tovu admin = vitest + Testing Library).
2. Cover the listed uncovered lines/branches/functions through the file's real behaviour: outputs, state changes, errors with their messages, calls to INJECTED ports with exact args. Every branch named by an `if`/`??`/`?:` gets the case that takes it.
3. For every new test, record in COMMIT-PLAN.md (repo root, not committed): file:test -> the mutation in the source that must turn it red. Do not run it.
4. Run the Author Checklist on every new test before moving on.
RULES: never vi.mock / mock.module the module under test; prefer real in-memory implementations and injected fakes over module mocks; reuse the package's existing test helpers and fixtures. No snapshot-only tests; no `toBeDefined`/`not.toThrow`/`ok(x)` as the only assertion; no test that only imports a file to bump coverage. No skips, no `.only`, no ts-ignore/expect-error, no `as any`. Never edit an existing assertion to be weaker.
PRODUCTION CODE: do not change it. If a test you write proves a real bug, keep that test (it will be red), and report BUG <file:line> + what is wrong + the fix you propose.
NOT WORTH TESTING: if a line truly cannot be meaningfully tested (type-only module, pure re-export barrel, process entry point), do not write a fake test: list it as EXCEPTION <file:lines> + one-line reason. Data tables (i18n dictionaries, catalogs) ARE testable: assert real invariants (every locale has every key of the source locale, no empty values, placeholders preserved).
Work through the whole list; if you run low on context, finish the file you are on and write the report.

REPORT (final message, <= 700 words): files done (tests added per file), files SKIPPED-ALREADY-COVERED (with the existing test that covers them), EXCEPTION list, BUG list, files left and why, new test files created.

REPO: Jini only. HEAD = codex/w62-cov-cms-6 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/cms/src/public-http/routes/site/comments-submit.ts | lines 75.86 br 86.36 fn 75.0 | uncovered lines: 84-85,88-89,100-101,108-115
- packages/cms/src/public-http/routes/site/media-rendition.ts | lines 65.54 br 52.78 fn 57.69 | uncovered lines: 35-37,65-67,81-83,137-138,142-143,147-150,157-161,221-225,227-228,235-237,240-244,255-257,274,276-278,280-290,312,340-344
- packages/cms/src/public-http/routes/site/member-pages.ts | lines 100.0 br 97.5 fn 100.0 | uncovered lines: 
- packages/cms/src/public-http/routes/site/pages/extra-head.ts | lines 85.19 br 77.78 fn 100.0 | uncovered lines: 51-54
- packages/cms/src/public-http/routes/site/pages/handlers/home.ts | lines 84.31 br 72.22 fn 100.0 | uncovered lines: 94,100-102,114,128-130
- packages/cms/src/public-http/routes/site/pages/handlers/marketing.ts | lines 88.89 br 60.0 fn 100.0 | uncovered lines: 60,63-64
- packages/cms/src/public-http/routes/site/pages/handlers/post-not-found.ts | lines 52.63 br 53.85 fn 75.0 | uncovered lines: 18-26,38,40-43,57-60
- packages/cms/src/public-http/routes/site/pages/handlers/post.ts | lines 88.89 br 75.0 fn 100.0 | uncovered lines: 74,79-80,87-90
- packages/cms/src/public-http/routes/site/pages/handlers/slug-routes.ts | lines 68.63 br 50.0 fn 75.0 | uncovered lines: 18,20-27,88-90,105-108
- packages/cms/src/public-http/routes/site/pages/handlers/virtual-page.ts | lines 100.0 br 44.44 fn 100.0 | uncovered lines: 
- packages/cms/src/public-http/routes/site/pages/listing/listing-state.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3
- packages/cms/src/public-http/routes/site/pages/render-context/collection-lists.ts | lines 95.79 br 77.27 fn 87.5 | uncovered lines: 191-192,225-226
- packages/cms/src/public-http/routes/site/pages/render-context/media-metadata.ts | lines 78.02 br 86.11 fn 71.43 | uncovered lines: 32-33,36-43,198-207
- packages/cms/src/public-http/routes/site/pages/render-context/post-previews.ts | lines 97.78 br 73.33 fn 100.0 | uncovered lines: 157-158
- packages/cms/src/public-http/routes/site/pages/render-context/static-menus.ts | lines 94.0 br 72.0 fn 100.0 | uncovered lines: 50,52,54
- packages/cms/src/public-http/routes/site/pages/render-context/taxonomy.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,24-29,39-50
- packages/cms/src/public-http/routes/site/pages/response.ts | lines 90.48 br 92.86 fn 93.33 | uncovered lines: 66-68,115-117
- packages/cms/src/public-http/routes/site/pages/static-tier.ts | lines 94.44 br 55.56 fn 87.5 | uncovered lines: 123,128,157-158
- packages/cms/src/public-http/routes/site/pages/template-render.ts | lines 91.43 br 33.33 fn 66.67 | uncovered lines: 102-103,122
- packages/cms/src/public-http/routes/site/products.ts | lines 61.04 br 87.5 fn 66.67 | uncovered lines: 7,9-11,28-33,71,78-93,112-114
- packages/cms/src/public-http/routes/site/robots.ts | lines 100.0 br 40.0 fn 100.0 | uncovered lines: 
- packages/cms/src/publish/content/apply-report.ts | lines 66.9 br 56.0 fn 73.08 | uncovered lines: 51-53,73-74,80-85,91-92,96-98,156-167,177,286,288-289,294-308,314-319,345-346,356-365,404-413,416-424,426-430,433-445,474,476-478,483,513-514,518,560-577,580-591
- packages/cms/src/publish/content/apply-retire.ts | lines 100.0 br 88.0 fn 100.0 | uncovered lines: 
- packages/cms/src/publish/content/apply-row.ts | lines 49.52 br 61.11 fn 50.0 | uncovered lines: 115-119,124-129,133-146,190-191,197-204,213-230
- packages/cms/src/publish/content/apply-run.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/cms/src/publish/content/backstop-preview.ts | lines 49.18 br 36.36 fn 50.0 | uncovered lines: 15-27,50,60-72,79-80,82-83
- packages/cms/src/publish/content/backstop-service.ts | lines 100.0 br 90.8 fn 100.0 | uncovered lines: 
- packages/cms/src/publish/content/baseline-repo.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/cms/src/publish/content/composite-blob-source.ts | lines 34.21 br 100.0 fn 20.0 | uncovered lines: 64-66,77-82,99-103,105-115
- packages/cms/src/publish/content/disconnect-tool.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/cms/src/publish/content/export-bundle.ts | lines 100.0 br 96.92 fn 100.0 | uncovered lines: 
- packages/cms/src/publish/content/file-tree-policy.ts | lines 100.0 br 97.53 fn 100.0 | uncovered lines: 
- packages/cms/src/publish/content/gated-hooks.ts | lines 99.08 br 66.67 fn 88.89 | uncovered lines: 303
- packages/cms/src/publish/content/idempotency.ts | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- packages/cms/src/publish/content/media-references.ts | lines 100.0 br 99.07 fn 100.0 | uncovered lines: 
- packages/cms/src/publish/content/peer-registry.ts | lines 64.44 br 70.77 fn 58.33 | uncovered lines: 211-212,261-262,284-285,289-292,294-299,301-317,339-340,344-348,354-355,359-362,395-396,434-445,455-459,609-620,622-628,631-636,638-640,642-645,647-650
- packages/cms/src/publish/content/peer-transport.ts | lines 93.35 br 87.78 fn 100.0 | uncovered lines: 484-488,496,521,525-526,528-532,594-595,607,664-665,675-679,693-694,739-741
- packages/cms/src/publish/content/planner.ts | lines 38.35 br 41.67 fn 63.64 | uncovered lines: 148-156,159-169,173-179,185,187-191,196,199,206-218,229-231,233-234,245-250,252-253,256,258,263-267,272-275,278,280-283,309-314,319-328,330-335,349-357,360-369,418-426
- packages/cms/src/publish/content/precheck-reasons.ts | lines 41.67 br 100.0 fn 12.5 | uncovered lines: 25-26,34-35,41-42,49-50,58-59,66-67,82-83
- packages/cms/src/publish/content/publish-backstop-file.ts | lines 51.8 br 52.38 fn 45.45 | uncovered lines: 7-8,19-21,59-61,73,75-80,83-90,96-102,105-107,110-111,132-136,138-145,150-155,158-164,166-169,172-173
- packages/cms/src/publish/content/publish-readiness.ts | lines 88.24 br 88.89 fn 100.0 | uncovered lines: 106-107
- packages/cms/src/publish/content/publish-tool.ts | lines 96.72 br 81.97 fn 100.0 | uncovered lines: 214-217,227-228
- packages/cms/src/publish/content/push-plan.ts | lines 99.02 br 84.62 fn 87.5 | uncovered lines: 92
- packages/cms/src/publish/content/raw-file-contributor.ts | lines 93.89 br 64.0 fn 92.31 | uncovered lines: 129-131,149-150,156-157,192-198
- packages/cms/src/publish/content/raw-row-contributor.ts | lines 91.95 br 65.08 fn 95.12 | uncovered lines: 51-53,116-118,134-136,199-200,258-260,265-269
- packages/cms/src/publish/content/repo-handler.ts | lines 89.21 br 77.5 fn 77.78 | uncovered lines: 213-215,220-221,263-270,281-283,303-305,349-355
- packages/cms/src/publish/content/run-repo.ts | lines 29.73 br 75.0 fn 75.0 | uncovered lines: 100-101,105-128
- packages/cms/src/publish/content/seed-hash.ts | lines 15.0 br 100.0 fn 0.0 | uncovered lines: 58,60-64,66-68,71-78
- packages/cms/src/publish/content/sql/raw-row-sqlite.ts | lines 78.31 br 78.57 fn 68.75 | uncovered lines: 15-16,18-21,51-53,65-70,104-106
- packages/cms/src/publish/content/tool-helpers.ts | lines 67.44 br 70.0 fn 50.0 | uncovered lines: 50-51,56-62,65-66,69-71
- packages/cms/src/publish/content/tool-registrations.ts | lines 17.22 br 100.0 fn 8.33 | uncovered lines: 118-120,128-132,136-141,143-148,152-158,160-161,164-169,171-174,179-188,191-218,220-242,245-252,255-266,272-288,290-300,302,305-311,313-314,336-342,344-349,353-356,382-387,390-399,…
- packages/cms/src/publish/content/type-registry.ts | lines 100.0 br 95.35 fn 100.0 | uncovered lines: 
- packages/cms/src/publish/content/ui/PublishContentReportRow.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3,5,18-19,22-24,28-33,38-40,45-53,55-56,60-62,65-68,72-79,85-86,88,90,93
- packages/cms/src/publish/content/ui/criteria.ts | lines 91.92 br 86.76 fn 90.91 | uncovered lines: 194-199,222-223
- packages/cms/src/publish/content/ui/report-rows.ts | lines 98.25 br 94.2 fn 100.0 | uncovered lines: 234-235
- packages/cms/src/publish/content/ui/sections.ts | lines 94.29 br 92.86 fn 100.0 | uncovered lines: 63-64
- packages/cms/src/publish/transfer/file-blob-index.ts | lines 100.0 br 91.67 fn 100.0 | uncovered lines: 
- packages/cms/src/publish/trust/grant.ts | lines 100.0 br 97.85 fn 100.0 | uncovered lines: 
- packages/cms/src/publish/trust/handshake-client.ts | lines 52.31 br 70.59 fn 72.73 | uncovered lines: 117-118,124-131,160-161,177-178,182-183,185-186,271-272,276-279,281-283,285-292,294-296,298-308,310-311,319,324-333
- packages/cms/src/publish/trust/provisioning-status.ts | lines 98.25 br 96.15 fn 100.0 | uncovered lines: 37
- packages/cms/src/publish/trust/provisioning.node-io.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 9-10,24-32,44-51
- packages/cms/src/publish/trust/revocations.sql.ts | lines 82.69 br 67.65 fn 100.0 | uncovered lines: 72-73,93-94,109-113,123-124,136-140,149-150
- packages/cms/src/publish/trust/revocations.ts | lines 99.16 br 98.77 fn 100.0 | uncovered lines: 195
- packages/cms/src/react/collections/CollectionEntryEditor.fields.tsx | lines 73.64 br 64.29 fn 60.0 | uncovered lines: 20-28,30,35-42,44,52-60,62
- packages/cms/src/react/collections/CollectionEntryEditor.tsx | lines 93.41 br 75.0 fn 54.55 | uncovered lines: 77-85,87-88
- packages/cms/src/react/media/ExternalProvidersPanel.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 12,38,50-58,60-63,65
- packages/cms/src/react/media/MediaEditDialog/MediaEditDialog.tsx | lines 79.37 br 30.0 fn 50.0 | uncovered lines: 80-85,126-132
- packages/cms/src/react/media/MediaLoadMore.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,8,14-24,26-28,30
- packages/cms/src/react/media/MediaPickerDialog/MediaPickerDialog.hooks.tsx | lines 24.0 br 100.0 fn 33.33 | uncovered lines: 52-61,110,116-121,131-132
- packages/cms/src/react/media/MediaPickerDialog/MediaPickerDialog.tsx | lines 61.19 br 41.67 fn 75.0 | uncovered lines: 93-99,101-113,115-119,121
