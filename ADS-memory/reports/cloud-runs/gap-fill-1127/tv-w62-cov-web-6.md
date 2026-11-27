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

REPO: Tovu only. HEAD = codex/tv-w62-cov-web-6 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.
WEBSITE NOTE: these numbers come from 5 of 8 website test shards. A file can already be covered by a test that did not run. Check its existing tests first; if they already exercise the listed lines, list it SKIPPED-ALREADY-COVERED instead of adding a duplicate.

## FILES (path | coverage now | uncovered source lines)
- apps/website/src/features/theme/font-links.ts | lines 100.0 br 90.91 fn 84.62 | uncovered lines: 
- apps/website/src/features/theme/handlebars-allowlist.ts | lines 99.75 br 89.55 fn 71.43 | uncovered lines: 391
- apps/website/src/features/theme/hardcoded-link-lists.ts | lines 99.15 br 84.85 fn 100.0 | uncovered lines: 107
- apps/website/src/features/theme/held-back-choice.ts | lines 95.78 br 88.68 fn 100.0 | uncovered lines: 84,103-105,113,130,164
- apps/website/src/features/theme/held-back-gated-hooks.ts | lines 97.73 br 100.0 fn 100.0 | uncovered lines: 38
- apps/website/src/features/theme/held-back-themes.ts | lines 99.17 br 81.01 fn 100.0 | uncovered lines: 104,146
- apps/website/src/features/theme/import-theme-file-tool.ts | lines 100.0 br 93.33 fn 88.89 | uncovered lines: 
- apps/website/src/features/theme/liquid-allowlist.ts | lines 99.66 br 95.24 fn 61.54 | uncovered lines: 159
- apps/website/src/features/theme/migration/migrate-theme.ts | lines 88.37 br 55.26 fn 82.35 | uncovered lines: 67,127,151-156,239-240,242-247,300-314,354-355,357-358,360-361,370-372
- apps/website/src/features/theme/migration/theme-migration-plan.ts | lines 61.98 br 52.63 fn 40.0 | uncovered lines: 1-15,79-80,105,139-150,160-163,167-178,183-187,192-198,202-213,220-234,254-265,271,277-278
- apps/website/src/features/theme/page-publication.ts | lines 98.44 br 100.0 fn 100.0 | uncovered lines: 43
- apps/website/src/features/theme/page-publish-tool.ts | lines 98.15 br 85.71 fn 100.0 | uncovered lines: 49
- apps/website/src/features/theme/preview-policy.ts | lines 83.33 br 80.0 fn 75.0 | uncovered lines: 1
- apps/website/src/features/theme/preview-switcher-html.ts | lines 100.0 br 100.0 fn 84.21 | uncovered lines: 
- apps/website/src/features/theme/preview-switcher.ts | lines 99.15 br 97.5 fn 72.97 | uncovered lines: 118
- apps/website/src/features/theme/public-page-security-headers.ts | lines 96.15 br 100.0 fn 100.0 | uncovered lines: 14
- apps/website/src/features/theme/public-theme-resources.ts | lines 97.14 br 83.33 fn 50.0 | uncovered lines: 32
- apps/website/src/features/theme/publish-content.ts | lines 91.53 br 62.16 fn 84.62 | uncovered lines: 105,113-115,261-262,304-305,317-318,491-492,519-536,577-582,626-630,634-637,647-649,689-690,697-700,704-706,727-729,739-744
- apps/website/src/features/theme/render-contract.ts | lines 99.07 br 90.0 fn 55.56 | uncovered lines: 295
- apps/website/src/features/theme/save-theme-original.ts | lines 98.08 br 100.0 fn 100.0 | uncovered lines: 39
- apps/website/src/features/theme/set-active-theme-tool.ts | lines 99.44 br 65.0 fn 100.0 | uncovered lines: 153
- apps/website/src/features/theme/static-asset-contract.ts | lines 99.13 br 94.74 fn 57.14 | uncovered lines: 112
- apps/website/src/features/theme/static-page-shell.ts | lines 99.39 br 76.0 fn 71.43 | uncovered lines: 143
- apps/website/src/features/theme/static-portability-index.ts | lines 94.37 br 84.21 fn 53.33 | uncovered lines: 63-65,103-107,149-152,218
- apps/website/src/features/theme/static-render-content.ts | lines 99.42 br 93.22 fn 66.67 | uncovered lines: 167
- apps/website/src/features/theme/static-render-menus.ts | lines 100.0 br 100.0 fn 88.46 | uncovered lines: 
- apps/website/src/features/theme/static-render-previews.ts | lines 100.0 br 93.75 fn 63.64 | uncovered lines: 
- apps/website/src/features/theme/static-render.ts | lines 99.59 br 91.89 fn 77.78 | uncovered lines: 244
- apps/website/src/features/theme/static-template-choice.ts | lines 99.44 br 86.36 fn 55.56 | uncovered lines: 175
- apps/website/src/features/theme/static-template-resolution.ts | lines 99.26 br 95.45 fn 50.0 | uncovered lines: 112
- apps/website/src/features/theme/structure-only-theme.ts | lines 98.15 br 96.0 fn 100.0 | uncovered lines: 30
- apps/website/src/features/theme/sync-originals.ts | lines 99.48 br 100.0 fn 100.0 | uncovered lines: 186
- apps/website/src/features/theme/theme-discovery.ts | lines 99.56 br 93.88 fn 67.65 | uncovered lines: 223
- apps/website/src/features/theme/theme-file-identity-tools.ts | lines 93.64 br 52.17 fn 100.0 | uncovered lines: 29-30,64-65,67-68,75-76,112-113,142
- apps/website/src/features/theme/theme-file-import.ts | lines 87.79 br 95.24 fn 100.0 | uncovered lines: 1-21
- apps/website/src/features/theme/theme-file-listing.ts | lines 96.1 br 71.43 fn 100.0 | uncovered lines: 28-30
- apps/website/src/features/theme/theme-file-policy.ts | lines 100.0 br 96.67 fn 53.85 | uncovered lines: 
- apps/website/src/features/theme/theme-file-trash-tools.ts | lines 100.0 br 96.3 fn 100.0 | uncovered lines: 
- apps/website/src/features/theme/theme-file-write-ports.ts | lines 92.68 br 85.71 fn 83.33 | uncovered lines: 40-42
- apps/website/src/features/theme/theme-file-writing.ts | lines 97.12 br 94.44 fn 100.0 | uncovered lines: 20-21,94
- apps/website/src/features/theme/theme-files.ts | lines 97.29 br 82.5 fn 100.0 | uncovered lines: 144-145,150-151,218-219
- apps/website/src/features/theme/theme-generated-restore.ts | lines 98.48 br 100.0 fn 100.0 | uncovered lines: 34
- apps/website/src/features/theme/theme-manifest-fields.ts | lines 100.0 br 88.1 fn 65.22 | uncovered lines: 
- apps/website/src/features/theme/theme-manifest.ts | lines 100.0 br 98.18 fn 83.33 | uncovered lines: 
- apps/website/src/features/theme/theme-page-eligibility.ts | lines 98.68 br 93.75 fn 50.0 | uncovered lines: 68
- apps/website/src/features/theme/theme-preview-image.ts | lines 66.02 br 70.0 fn 40.0 | uncovered lines: 37-46,64-73,80,86-95,104,112-114
- apps/website/src/features/theme/theme-read-content.ts | lines 84.38 br 33.33 fn 100.0 | uncovered lines: 1-4,41-43,54,57-58
- apps/website/src/features/theme/theme-read-tools.ts | lines 82.26 br 84.38 fn 68.75 | uncovered lines: 42-50,71-81,104,120
- apps/website/src/features/theme/theme-reset-file-tool.ts | lines 99.17 br 100.0 fn 100.0 | uncovered lines: 87
- apps/website/src/features/theme/theme-roster-ports.ts | lines 100.0 br 50.0 fn 0.0 | uncovered lines: 
- apps/website/src/features/theme/theme-static-assets.ts | lines 100.0 br 87.69 fn 78.95 | uncovered lines: 
- apps/website/src/features/theme/theme-template-sources.ts | lines 100.0 br 98.11 fn 72.73 | uncovered lines: 
- apps/website/src/features/theme/theme-tool-editing.ts | lines 86.76 br 66.67 fn 100.0 | uncovered lines: 17-18,49-50,60-61,63-64,66
- apps/website/src/features/theme/theme-tool-view.ts | lines 56.1 br 100.0 fn 100.0 | uncovered lines: 1,4-20
- apps/website/src/features/theme/theme-trash-binding.ts | lines 65.85 br 100.0 fn 42.86 | uncovered lines: 14-16,20-26,34-35,40-41
- apps/website/src/features/theme/theme-watch-bindings.ts | lines 47.06 br 100.0 fn 0.0 | uncovered lines: 9-14,16-18
- apps/website/src/features/theme/theme-write-tools.ts | lines 99.0 br 80.0 fn 100.0 | uncovered lines: 61
- apps/website/src/features/theme/theme.ts | lines 78.06 br 93.88 fn 83.33 | uncovered lines: 30,33-83
- apps/website/src/features/theme/token-aliases.ts | lines 98.08 br 80.0 fn 66.67 | uncovered lines: 44
- apps/website/src/features/theme/tool-registrations.ts | lines 77.7 br 100.0 fn 100.0 | uncovered lines: 1-31
- apps/website/src/features/theme/trash-theme-tool.ts | lines 71.11 br 100.0 fn 50.0 | uncovered lines: 77-85,103-121,134-138,151-169
- apps/website/src/features/theme/validation/markup.ts | lines 93.55 br 87.5 fn 61.54 | uncovered lines: 69-72,77-79,116
- apps/website/src/features/theme/validation/profiles.ts | lines 64.29 br 90.91 fn 100.0 | uncovered lines: 1-10,12-25,30-34,72
- apps/website/src/features/theme/validation/references.ts | lines 99.04 br 100.0 fn 100.0 | uncovered lines: 96
- apps/website/src/features/theme/validation/structure.ts | lines 99.66 br 89.66 fn 100.0 | uncovered lines: 291
- apps/website/src/features/theme/validation/validate-theme-package.ts | lines 99.59 br 100.0 fn 100.0 | uncovered lines: 237
- apps/website/src/features/theme/validation/webmcp-markup.ts | lines 99.0 br 87.62 fn 100.0 | uncovered lines: 49,197
- apps/website/src/features/theme/visitor-publication.ts | lines 55.56 br 63.16 fn 35.29 | uncovered lines: 33-44,56-57,66-68,94-101,103-107,115-118,121-127,130-156
- apps/website/src/features/trash/adapters/comment.ts | lines 78.08 br 100.0 fn 100.0 | uncovered lines: 1-15,29
- apps/website/src/features/trash/adapters/redirect.ts | lines 85.71 br 100.0 fn 100.0 | uncovered lines: 6
- apps/website/src/features/trash/agent-delete-policy.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/features/trash/db-port.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/features/trash/index.ts | lines 83.67 br 100.0 fn 0.0 | uncovered lines: 1-8
- apps/website/src/features/trash/registry.ts | lines 89.02 br 100.0 fn 100.0 | uncovered lines: 1-21,24-31
- apps/website/src/features/trash/repo.sqlite.ts | lines 97.22 br 100.0 fn 100.0 | uncovered lines: 32
- apps/website/src/features/trash/tool-kinds.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- apps/website/src/features/trash/tool-registrations.ts | lines 100.0 br 100.0 fn 57.14 | uncovered lines: 
- apps/website/src/features/vendor-credentials/index.ts | lines 33.33 br 100.0 fn 100.0 | uncovered lines: 1-6
- apps/website/src/features/vendor-credentials/vault-adapter.ts | lines 100.0 br 100.0 fn 66.67 | uncovered lines: 
- apps/website/src/features/web/policy.ts | lines 42.86 br 100.0 fn 100.0 | uncovered lines: 3-6
- apps/website/src/features/web/web-page.ts | lines 96.88 br 100.0 fn 100.0 | uncovered lines: 2
- apps/website/src/features/webhooks/keyring.env.ts | lines 100.0 br 93.33 fn 43.48 | uncovered lines: 
- apps/website/src/features/webhooks/site-key-read-bindings.ts | lines 100.0 br 66.67 fn 23.08 | uncovered lines: 
- apps/website/src/features/webhooks/tool-registrations.ts | lines 92.66 br 100.0 fn 100.0 | uncovered lines: 1-8
- apps/website/src/features/webhooks/wire-headers.ts | lines 28.57 br 100.0 fn 100.0 | uncovered lines: 3-7
- apps/website/src/features/webmcp/published-html.ts | lines 94.74 br 66.67 fn 33.33 | uncovered lines: 6
- apps/website/src/features/widgets/deps.ts | lines 99.28 br 95.83 fn 76.19 | uncovered lines: 174
- apps/website/src/features/widgets/media-html-log.ts | lines 92.31 br 80.0 fn 75.0 | uncovered lines: 12
- apps/website/src/index.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/platform/db/chat-kernel.ts | lines 100.0 br 87.5 fn 42.86 | uncovered lines: 
