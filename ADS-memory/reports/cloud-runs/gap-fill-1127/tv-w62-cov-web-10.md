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

REPO: Tovu only. HEAD = codex/tv-w62-cov-web-10 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.
WEBSITE NOTE: these numbers come from 5 of 8 website test shards. A file can already be covered by a test that did not run. Check its existing tests first; if they already exercise the listed lines, list it SKIPPED-ALREADY-COVERED instead of adding a duplicate.

## FILES (path | coverage now | uncovered source lines)
- apps/website/src/server/inbound/public-http/http/site/bare-page.ts | lines 92.31 br 66.67 fn 33.33 | uncovered lines: 11
- apps/website/src/server/inbound/public-http/http/site/form-feedback-policy.ts | lines 97.67 br 85.71 fn 55.56 | uncovered lines: 34
- apps/website/src/server/inbound/public-http/http/site/form-wire-policy.ts | lines 100.0 br 87.5 fn 50.0 | uncovered lines: 
- apps/website/src/server/inbound/public-http/http/site/handlebars-render.ts | lines 100.0 br 100.0 fn 70.0 | uncovered lines: 
- apps/website/src/server/inbound/public-http/http/site/handlebars-worker.ts | lines 90.32 br 25.0 fn 0.0 | uncovered lines: 27-29
- apps/website/src/server/inbound/public-http/http/site/liquid-render.ts | lines 100.0 br 96.0 fn 76.47 | uncovered lines: 
- apps/website/src/server/inbound/public-http/http/site/liquid-worker.ts | lines 100.0 br 33.33 fn 0.0 | uncovered lines: 
- apps/website/src/server/inbound/public-http/http/site/render-site.ts | lines 94.44 br 66.67 fn 77.78 | uncovered lines: 22,44
- apps/website/src/server/inbound/public-http/http/site/render/blocks.ts | lines 96.43 br 90.0 fn 66.67 | uncovered lines: 29
- apps/website/src/server/inbound/public-http/http/site/render/components/entry-lists.ts | lines 94.44 br 85.71 fn 62.5 | uncovered lines: 18
- apps/website/src/server/inbound/public-http/http/site/render/components/registry.ts | lines 100.0 br 90.0 fn 80.0 | uncovered lines: 
- apps/website/src/server/inbound/public-http/http/site/render/content-html.ts | lines 100.0 br 83.33 fn 57.14 | uncovered lines: 
- apps/website/src/server/inbound/public-http/http/site/render/document-shell.ts | lines 100.0 br 90.0 fn 66.67 | uncovered lines: 
- apps/website/src/server/inbound/public-http/http/site/render/page-body.ts | lines 88.89 br 80.0 fn 75.0 | uncovered lines: 7
- apps/website/src/server/inbound/public-http/http/site/render/post-body.ts | lines 100.0 br 80.0 fn 60.0 | uncovered lines: 
- apps/website/src/server/inbound/public-http/http/site/render/site-assistant-mount.ts | lines 98.75 br 93.75 fn 50.0 | uncovered lines: 74
- apps/website/src/server/inbound/public-http/http/site/render/template-render-data.ts | lines 100.0 br 66.67 fn 33.33 | uncovered lines: 
- apps/website/src/server/inbound/public-http/http/site/seo-render-context.ts | lines 91.67 br 83.33 fn 50.0 | uncovered lines: 9
- apps/website/src/server/inbound/public-http/http/site/site-chat-markup.ts | lines 89.74 br 89.47 fn 71.43 | uncovered lines: 34-37
- apps/website/src/server/inbound/public-http/http/site/worker-sandbox.ts | lines 93.15 br 76.92 fn 100.0 | uncovered lines: 1-7,81-83
- apps/website/src/server/inbound/public-http/middleware/published-webmcp.ts | lines 100.0 br 92.0 fn 57.14 | uncovered lines: 
- apps/website/src/server/inbound/public-http/middleware/render-theme-override.ts | lines 93.75 br 100.0 fn 100.0 | uncovered lines: 12
- apps/website/src/server/inbound/public-http/middleware/site-consent.ts | lines 100.0 br 71.43 fn 45.45 | uncovered lines: 
- apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts | lines 97.88 br 96.0 fn 83.58 | uncovered lines: 162,186-187,194
- apps/website/src/server/inbound/public-http/middleware/theme-content-security-headers.ts | lines 95.0 br 80.0 fn 50.0 | uncovered lines: 18
- apps/website/src/server/inbound/public-http/middleware/theme-preview-refresh.ts | lines 100.0 br 96.77 fn 78.57 | uncovered lines: 
- apps/website/src/server/inbound/public-http/middleware/theme-preview-static.ts | lines 100.0 br 60.0 fn 100.0 | uncovered lines: 
- apps/website/src/server/inbound/public-http/middleware/theme-preview-switcher.ts | lines 100.0 br 98.33 fn 85.71 | uncovered lines: 
- apps/website/src/server/inbound/public-http/middleware/theme-static-assets.ts | lines 99.36 br 82.86 fn 81.82 | uncovered lines: 151
- apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/export-files.ts | lines 96.97 br 100.0 fn 100.0 | uncovered lines: 3
- apps/website/src/server/inbound/public-http/routes/commerce/purchase.ts | lines 97.53 br 97.73 fn 100.0 | uncovered lines: 1,83
- apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts | lines 100.0 br 90.91 fn 69.23 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/mail-feedback.ts | lines 97.62 br 100.0 fn 100.0 | uncovered lines: 39
- apps/website/src/server/inbound/public-http/routes/members/analytics.ts | lines 96.67 br 100.0 fn 100.0 | uncovered lines: 22
- apps/website/src/server/inbound/public-http/routes/members/complete-sign-in.ts | lines 88.89 br 100.0 fn 66.67 | uncovered lines: 31-33,50-51,60,65
- apps/website/src/server/inbound/public-http/routes/members/deps.ts | lines 92.54 br 82.14 fn 88.89 | uncovered lines: 139-148
- apps/website/src/server/inbound/public-http/routes/members/oidc-callback.ts | lines 96.61 br 100.0 fn 55.17 | uncovered lines: 31,61
- apps/website/src/server/inbound/public-http/routes/members/oidc-deps.ts | lines 100.0 br 90.0 fn 93.33 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/members/oidc-start.ts | lines 95.92 br 87.5 fn 60.0 | uncovered lines: 24,44
- apps/website/src/server/inbound/public-http/routes/members/oidc-verify-email.ts | lines 74.51 br 100.0 fn 23.08 | uncovered lines: 26,40-50,53
- apps/website/src/server/inbound/public-http/routes/members/sign-in.ts | lines 97.67 br 100.0 fn 100.0 | uncovered lines: 39
- apps/website/src/server/inbound/public-http/routes/members/unlink-identity.ts | lines 80.49 br 100.0 fn 23.08 | uncovered lines: 21,34-39,43
- apps/website/src/server/inbound/public-http/routes/oauth/callback-page.ts | lines 70.18 br 100.0 fn 100.0 | uncovered lines: 1-16,56
- apps/website/src/server/inbound/public-http/routes/ops/health.ts | lines 61.7 br 100.0 fn 50.0 | uncovered lines: 31-48
- apps/website/src/server/inbound/public-http/routes/plugin-contributions.ts | lines 100.0 br 93.33 fn 80.0 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site-assistant-confirm.ts | lines 84.38 br 90.91 fn 90.0 | uncovered lines: 4,6,29-31
- apps/website/src/server/inbound/public-http/routes/site-share.ts | lines 100.0 br 71.43 fn 100.0 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/analytics-ingest.ts | lines 100.0 br 66.67 fn 62.5 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts | lines 96.94 br 100.0 fn 100.0 | uncovered lines: 1-2,96
- apps/website/src/server/inbound/public-http/routes/site/comments-submit.ts | lines 100.0 br 92.31 fn 91.67 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/forms-admission.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/forms-multipart.ts | lines 66.67 br 100.0 fn 100.0 | uncovered lines: 1-2,7,13
- apps/website/src/server/inbound/public-http/routes/site/forms-submit.ts | lines 100.0 br 96.0 fn 100.0 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts | lines 98.57 br 92.86 fn 86.36 | uncovered lines: 72
- apps/website/src/server/inbound/public-http/routes/site/member-pages.ts | lines 98.53 br 92.31 fn 78.57 | uncovered lines: 70
- apps/website/src/server/inbound/public-http/routes/site/newsletter-confirm.ts | lines 97.14 br 100.0 fn 62.5 | uncovered lines: 32
- apps/website/src/server/inbound/public-http/routes/site/newsletter-deps.ts | lines 56.67 br 100.0 fn 100.0 | uncovered lines: 3-14,49
- apps/website/src/server/inbound/public-http/routes/site/newsletter-unsubscribe.ts | lines 100.0 br 100.0 fn 83.33 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/pages.ts | lines 100.0 br 75.0 fn 50.0 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/pages/extra-head.ts | lines 100.0 br 87.5 fn 71.43 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/pages/handlers/home.ts | lines 98.04 br 91.18 fn 93.75 | uncovered lines: 52
- apps/website/src/server/inbound/public-http/routes/site/pages/handlers/listing.ts | lines 100.0 br 75.0 fn 66.67 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/pages/handlers/marketing.ts | lines 100.0 br 91.67 fn 76.92 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/pages/handlers/post.ts | lines 100.0 br 96.3 fn 86.21 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/pages/handlers/slug-routes.ts | lines 98.55 br 97.56 fn 92.86 | uncovered lines: 70
- apps/website/src/server/inbound/public-http/routes/site/pages/handlers/virtual-page.ts | lines 100.0 br 100.0 fn 80.95 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/pages/listing/listing-batch.ts | lines 96.15 br 88.89 fn 60.0 | uncovered lines: 15
- apps/website/src/server/inbound/public-http/routes/site/pages/pre-consent-cache.ts | lines 97.78 br 85.71 fn 57.14 | uncovered lines: 40
- apps/website/src/server/inbound/public-http/routes/site/pages/render-context/content-marker-ports.ts | lines 97.3 br 91.67 fn 60.0 | uncovered lines: 9
- apps/website/src/server/inbound/public-http/routes/site/pages/render-context/deps.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/inbound/public-http/routes/site/pages/render-context/media-metadata.ts | lines 100.0 br 93.33 fn 76.47 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/pages/render-context/member-access.ts | lines 98.33 br 83.33 fn 50.0 | uncovered lines: 63
- apps/website/src/server/inbound/public-http/routes/site/pages/render-context/post-previews.ts | lines 100.0 br 92.31 fn 84.62 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/pages/render-context/site-title.ts | lines 98.25 br 84.62 fn 50.0 | uncovered lines: 58
- apps/website/src/server/inbound/public-http/routes/site/pages/render-context/static-menus.ts | lines 98.63 br 91.18 fn 87.5 | uncovered lines: 223-225
- apps/website/src/server/inbound/public-http/routes/site/pages/render-context/widgets.ts | lines 100.0 br 83.33 fn 50.0 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/pages/request-policy.ts | lines 99.23 br 70.0 fn 33.33 | uncovered lines: 129
- apps/website/src/server/inbound/public-http/routes/site/pages/response.ts | lines 98.18 br 96.43 fn 82.76 | uncovered lines: 89,113
- apps/website/src/server/inbound/public-http/routes/site/pages/static-tier.ts | lines 97.14 br 94.12 fn 83.33 | uncovered lines: 82,91
- apps/website/src/server/inbound/public-http/routes/site/pages/template-render.ts | lines 100.0 br 75.0 fn 84.62 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/products.ts | lines 97.62 br 94.87 fn 94.12 | uncovered lines: 58,92
- apps/website/src/server/inbound/public-http/routes/site/search.ts | lines 100.0 br 100.0 fn 60.0 | uncovered lines: 
- apps/website/src/server/inbound/public-http/routes/site/seo-documents.ts | lines 100.0 br 94.12 fn 75.0 | uncovered lines: 
- apps/website/src/server/inbound/shared/admin-failure.ts | lines 100.0 br 96.97 fn 70.59 | uncovered lines: 
- apps/website/src/server/inbound/shared/admin-route-mount-support.ts | lines 100.0 br 88.89 fn 53.85 | uncovered lines: 
- apps/website/src/server/inbound/shared/dev-cors.ts | lines 66.04 br 60.0 fn 50.0 | uncovered lines: 32-34,47-61
- apps/website/src/server/inbound/shared/json-body-parsers.ts | lines 98.48 br 92.0 fn 36.84 | uncovered lines: 125,132
- apps/website/src/server/inbound/shared/media-original-writer.ts | lines 96.3 br 100.0 fn 50.0 | uncovered lines: 27
- apps/website/src/server/inbound/shared/observability-middleware.ts | lines 100.0 br 85.37 fn 100.0 | uncovered lines: 
- apps/website/src/server/inbound/shared/request-admissions.ts | lines 100.0 br 93.75 fn 70.0 | uncovered lines: 
