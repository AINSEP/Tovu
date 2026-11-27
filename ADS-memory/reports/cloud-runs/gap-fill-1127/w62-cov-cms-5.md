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

REPO: Jini only. HEAD = codex/w62-cov-cms-5 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/cms/src/posts/publish-content.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,5-6,16-19,21,23,74,100,102-112,115-116,124-126,131-134,143,150,157-159,163,167-171,195-204,207-211,214-218,221-225,228-229,232-236,239-248,260-277,280-286,300-303,305-306,308-3…
- packages/cms/src/posts/repo.memory.ts | lines 81.37 br 92.68 fn 78.95 | uncovered lines: 54-57,59,140-145,147-154,166-174,197-198
- packages/cms/src/posts/reverters.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3-4,6-8,58-67,78-103,113-120,123-124,129-131,135-140,142-144,163-171,185-187,189-192,196-203,206-211,213-214,223-227,255-257,260-268,270-271,277-279,281-284,286-288,290-291,297-2…
- packages/cms/src/posts/revision-thinning.ts | lines 100.0 br 89.66 fn 100.0 | uncovered lines: 
- packages/cms/src/posts/search.ts | lines 44.93 br 44.44 fn 57.14 | uncovered lines: 124-125,162-166,169,172-173,210,248-252,254-259,261-264,266-272,274-275,279-281
- packages/cms/src/posts/sql/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-4
- packages/cms/src/posts/sql/kernel-statements.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 12-14,17-19
- packages/cms/src/posts/sql/repo.rows.ts | lines 100.0 br 88.46 fn 100.0 | uncovered lines: 
- packages/cms/src/posts/sql/repo.ts | lines 76.11 br 97.92 fn 68.42 | uncovered lines: 80-90,93-97,225-235,247-262,265-268,310-318,370-372
- packages/cms/src/posts/sql/revision-refs.ts | lines 88.37 br 52.94 fn 85.71 | uncovered lines: 64-68
- packages/cms/src/posts/sql/revision-thinning.ts | lines 94.74 br 70.27 fn 90.0 | uncovered lines: 90-92,99,167
- packages/cms/src/posts/sql/search-index.contract.ts | lines 8.33 br 100.0 fn 0.0 | uncovered lines: 58-68
- packages/cms/src/posts/sql/search-index.postgres.ts | lines 28.0 br 100.0 fn 33.33 | uncovered lines: 55-59,65-70,73-74,76-78,84,88-93,95-98,101,104-105,107,110-114
- packages/cms/src/posts/sql/search-index.sqlite.ts | lines 55.1 br 100.0 fn 33.33 | uncovered lines: 101-104,112-119,123-125,127-128,132,134-137
- packages/cms/src/posts/sql/search-index.ts | lines 10.87 br 33.33 fn 8.33 | uncovered lines: 43-44,52-55,58-60,76-77,108-132,168-197,211-218,221-229,232-242,244-257,260,262-267,277-284
- packages/cms/src/posts/tiptap-text-schema.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 28-46,49-68,70-72,76-85
- packages/cms/src/posts/tool-registrations.handlers.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3,5,7,9,11,13-15,19,33-37,39-43,45-54,59-61,71,73-76,78-79,84-86,88-89,91,93,97-99
- packages/cms/src/posts/tool-registrations.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3-10,12-14,16-21,24,26-28,30-39,43-54,56,60-77,79,86-90,92-104,106-122,124-126,135,137-139,141-151,153-157,159-162,166,172-173,176-177,179-184,186-193,196-205,207-211,214-216,220…
- packages/cms/src/posts/tool-registrations.update.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-3,5-6,8,10-11,13-16,18,21,25,28-38,46-55,57-61,63-73,75-79,81-85,90-93,99,101,108,110-113,117,124,131-132,134-149,155,165-167,169-177,179-180
- packages/cms/src/presentation/html.ts | lines 100.0 br 98.61 fn 100.0 | uncovered lines: 
- packages/cms/src/presentation/page-head.ts | lines 98.48 br 88.57 fn 100.0 | uncovered lines: 27
- packages/cms/src/public-http/http/shared/post.ts | lines 100.0 br 95.45 fn 100.0 | uncovered lines: 
- packages/cms/src/public-http/http/site/bare-page.ts | lines 81.82 br 9.09 fn 100.0 | uncovered lines: 89-92
- packages/cms/src/public-http/http/site/form-label-inspection.ts | lines 100.0 br 91.89 fn 100.0 | uncovered lines: 
- packages/cms/src/public-http/http/site/form-validation-i18n.ts | lines 100.0 br 91.67 fn 100.0 | uncovered lines: 
- packages/cms/src/public-http/http/site/render-site.ts | lines 62.62 br 40.74 fn 70.0 | uncovered lines: 270-275,277-284,289-298,302-306,340-347,349-351
- packages/cms/src/public-http/http/site/render/blocks.ts | lines 76.92 br 57.14 fn 85.71 | uncovered lines: 32-40,49,51,55
- packages/cms/src/public-http/http/site/render/components/entry-lists.ts | lines 65.31 br 76.92 fn 50.0 | uncovered lines: 57-63,68-73,84-87
- packages/cms/src/public-http/http/site/render/components/layout.ts | lines 25.68 br 85.71 fn 60.0 | uncovered lines: 10,44-71,75-100
- packages/cms/src/public-http/http/site/render/components/marketing.ts | lines 98.55 br 30.3 fn 100.0 | uncovered lines: 37
- packages/cms/src/public-http/http/site/render/contact-form-widget.ts | lines 59.02 br 45.45 fn 50.0 | uncovered lines: 48-50,54-60,64-78
- packages/cms/src/public-http/http/site/render/content-html.ts | lines 81.36 br 90.91 fn 33.33 | uncovered lines: 48-51,74-79,120
- packages/cms/src/public-http/http/site/render/doc/doc-nodes.ts | lines 54.22 br 57.69 fn 25.93 | uncovered lines: 80-85,90-92,94,97-98,100-102,104-106,110-113,126-128,130-132,134-142,155-162,173-186,188-190,192,198-202,204-206,215-217,245-246
- packages/cms/src/public-http/http/site/render/doc/media-ref.ts | lines 87.18 br 87.5 fn 100.0 | uncovered lines: 77-81
- packages/cms/src/public-http/http/site/render/doc/nodes-media.ts | lines 97.1 br 63.41 fn 100.0 | uncovered lines: 162-163
- packages/cms/src/public-http/http/site/render/page-body.ts | lines 72.97 br 60.47 fn 84.62 | uncovered lines: 115-117,140-141,147-152,177-185
- packages/cms/src/public-http/http/site/render/post-body.ts | lines 77.5 br 75.0 fn 60.0 | uncovered lines: 88-89,94-95,99-103
- packages/cms/src/public-http/http/site/render/template-render-data.ts | lines 92.19 br 56.25 fn 80.0 | uncovered lines: 64,94-95,97-98
- packages/cms/src/public-http/http/site/render/widgets/media.ts | lines 73.68 br 61.54 fn 66.67 | uncovered lines: 44-50,86-87,99-100,123-124,135-136,141-143,148-149
- packages/cms/src/public-http/http/site/render/widgets/post-content.ts | lines 67.47 br 22.22 fn 85.71 | uncovered lines: 69-71,77-83,89,91-94,103-109,117-121
- packages/cms/src/public-http/http/site/render/widgets/social-entries.ts | lines 96.3 br 66.67 fn 100.0 | uncovered lines: 61-62
- packages/cms/src/public-http/middleware/canonical-site-host.ts | lines 100.0 br 94.74 fn 100.0 | uncovered lines: 
- packages/cms/src/public-http/middleware/theme-preview-refresh.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/cms/src/public-http/middleware/theme-static-assets.ts | lines 100.0 br 95.45 fn 100.0 | uncovered lines: 
- packages/cms/src/public-http/routes/members/complete-sign-in.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/cms/src/public-http/routes/members/oidc-callback.ts | lines 100.0 br 94.44 fn 90.91 | uncovered lines: 
- packages/cms/src/public-http/routes/members/oidc-shared.ts | lines 100.0 br 87.5 fn 100.0 | uncovered lines: 
- packages/cms/src/public-http/routes/members/oidc-verify-email.ts | lines 100.0 br 95.45 fn 92.31 | uncovered lines: 
- packages/cms/src/public-http/routes/members/shared.ts | lines 100.0 br 97.37 fn 100.0 | uncovered lines: 
- packages/cms/src/public-http/routes/members/unlink-identity.ts | lines 100.0 br 95.45 fn 100.0 | uncovered lines: 
- packages/cms/src/public-http/routes/plugin-contributions.ts | lines 32.26 br 70.0 fn 50.0 | uncovered lines: 53-55,58-74,85-87,91-107,112-115,121-139
- packages/cms/src/public-http/routes/publish-trust/handshake.ts | lines 100.0 br 96.36 fn 100.0 | uncovered lines: 
