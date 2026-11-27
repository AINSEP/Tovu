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

REPO: Jini only. HEAD = codex/w62-cov-cms-1 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/cms/src/admin-http/http/forms.ts | lines 100.0 br 71.43 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/http/media.ts | lines 100.0 br 82.35 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/http/posts.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3,5-9
- packages/cms/src/admin-http/http/widgets.ts | lines 96.15 br 100.0 fn 47.06 | uncovered lines: 87-89
- packages/cms/src/admin-http/limits.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 13
- packages/cms/src/admin-http/routes/agent-plugins/admin-surfaces.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,4,39-40,84-86,89-98,100-102,116-124,131,133-143,146-156,159-172,174-175
- packages/cms/src/admin-http/routes/agent-plugins/install-response.ts | lines 100.0 br 96.15 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/agent-plugins/install.ts | lines 100.0 br 97.14 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/agent-plugins/list.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/agent-plugins/set-enabled.ts | lines 100.0 br 88.24 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/assistant/execution-shared.ts | lines 100.0 br 96.88 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/assistant/shared.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/assistant/stored-credential-probe.ts | lines 95.56 br 88.89 fn 100.0 | uncovered lines: 181-182
- packages/cms/src/admin-http/routes/assistant/test-agent.ts | lines 100.0 br 93.33 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/assistant/test-connection.ts | lines 100.0 br 90.91 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/change-sets/revert.ts | lines 100.0 br 96.97 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/comments/shared.ts | lines 100.0 br 71.43 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/consent/routes.ts | lines 100.0 br 94.59 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/content-types/collections-route.ts | lines 100.0 br 81.82 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/content-types/lifecycle.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/content-types/update-fields.ts | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/database/restore-points.ts | lines 100.0 br 94.29 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/database/timeline.ts | lines 100.0 br 93.33 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/email-templates/shared.ts | lines 100.0 br 95.45 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/entries/create.ts | lines 100.0 br 88.89 fn 66.67 | uncovered lines: 
- packages/cms/src/admin-http/routes/entries/lifecycle.ts | lines 100.0 br 75.0 fn 50.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/entries/list.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/entries/update.ts | lines 100.0 br 77.78 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/external-mcp/oauth.ts | lines 81.99 br 85.71 fn 57.14 | uncovered lines: 16-21,71-76,92-93,197-200,206-210,223,226-230
- packages/cms/src/admin-http/routes/external-mcp/probe.ts | lines 100.0 br 83.33 fn 60.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/external-mcp/provider-refusal.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/external-mcp/route-helpers.ts | lines 94.12 br 72.22 fn 100.0 | uncovered lines: 48-49
- packages/cms/src/admin-http/routes/external-mcp/tool-approvals.ts | lines 100.0 br 100.0 fn 80.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/forms/list-submissions.ts | lines 100.0 br 93.33 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/forms/providers.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/fs-files/custom-root.ts | lines 100.0 br 96.3 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/integrations/shared.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/media/batch-providers.ts | lines 100.0 br 61.11 fn 50.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/media/byte-size.ts | lines 100.0 br 92.86 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/media/grid.ts | lines 100.0 br 94.81 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/media/provider-catalog.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/media/replace.ts | lines 100.0 br 97.06 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/media/shared.ts | lines 97.3 br 95.83 fn 93.33 | uncovered lines: 130-131
- packages/cms/src/admin-http/routes/media/stored-media-response.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/media/upload.ts | lines 100.0 br 95.56 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/members/request-magic-link.ts | lines 100.0 br 87.5 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/menus/assign-location.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/menus/create.ts | lines 100.0 br 90.0 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/menus/update-tree.ts | lines 100.0 br 89.47 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/newsletter/create-campaign.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/newsletter/create-subscription.ts | lines 100.0 br 92.31 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/newsletter/import-subscriptions.ts | lines 100.0 br 92.86 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/newsletter/schedule-campaign.ts | lines 100.0 br 92.31 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/newsletter/send-test-campaign.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/newsletter/update-campaign.ts | lines 100.0 br 95.74 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/pages/delete.ts | lines 100.0 br 90.91 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/pages/get-by-id.ts | lines 100.0 br 96.88 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/pages/update-html.ts | lines 100.0 br 97.5 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/pages/update.ts | lines 95.45 br 100.0 fn 85.71 | uncovered lines: 45-46
- packages/cms/src/admin-http/routes/plugins/install.ts | lines 95.5 br 89.19 fn 95.0 | uncovered lines: 125-127,135-136
- packages/cms/src/admin-http/routes/plugins/provider-settings.ts | lines 100.0 br 95.65 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/posts/autosave.ts | lines 100.0 br 98.55 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/posts/delete.ts | lines 100.0 br 91.67 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/posts/get-by-id.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/posts/shared.ts | lines 100.0 br 97.62 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/posts/template-preview-embeds.ts | lines 97.1 br 83.33 fn 100.0 | uncovered lines: 118-119
- packages/cms/src/admin-http/routes/posts/template-preview-render.ts | lines 90.59 br 71.43 fn 75.0 | uncovered lines: 47-50,122-123,134-135
- packages/cms/src/admin-http/routes/posts/template-preview.ts | lines 100.0 br 96.88 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/presentation/patch.ts | lines 100.0 br 95.65 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/publish-content/backstop.ts | lines 100.0 br 97.33 fn 87.5 | uncovered lines: 
- packages/cms/src/admin-http/routes/publish-content/blob-put.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/publish-content/blobs-probe.ts | lines 100.0 br 94.74 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/publish-content/bundle-create.ts | lines 100.0 br 98.68 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/publish-content/destination.ts | lines 97.67 br 97.56 fn 87.5 | uncovered lines: 75-76
- packages/cms/src/admin-http/routes/publish-content/export.ts | lines 100.0 br 93.33 fn 80.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/publish-content/import-errors.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/publish-content/import.ts | lines 100.0 br 98.39 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/publish-content/peer-transport.ts | lines 88.95 br 72.37 fn 71.43 | uncovered lines: 101-103,129-130,143,260-266,289-294
- packages/cms/src/admin-http/routes/publish-content/peers.ts | lines 100.0 br 100.0 fn 93.33 | uncovered lines: 
- packages/cms/src/admin-http/routes/publish-content/route-helpers.ts | lines 100.0 br 87.5 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/redirects/update.ts | lines 100.0 br 81.82 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/seo/get-entry-analyze.ts | lines 95.0 br 83.33 fn 100.0 | uncovered lines: 30
- packages/cms/src/admin-http/routes/seo/get-entry.ts | lines 95.0 br 83.33 fn 100.0 | uncovered lines: 35
- packages/cms/src/admin-http/routes/seo/post-sitemap-regenerate.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/seo/put-entry.ts | lines 90.32 br 71.43 fn 100.0 | uncovered lines: 61-63
- packages/cms/src/admin-http/routes/settings/clear.ts | lines 100.0 br 82.61 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/settings/events.ts | lines 86.79 br 69.81 fn 79.17 | uncovered lines: 254-257,262-268,279-285,341-343
- packages/cms/src/admin-http/routes/settings/get-raw.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/settings/list-definitions.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/cms/src/admin-http/routes/settings/preview-feed-access.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 4-23
