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

REPO: Tovu only. HEAD = codex/tv-w62-cov-web-4 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.
WEBSITE NOTE: these numbers come from 5 of 8 website test shards. A file can already be covered by a test that did not run. Check its existing tests first; if they already exercise the listed lines, list it SKIPPED-ALREADY-COVERED instead of adding a duplicate.

## FILES (path | coverage now | uncovered source lines)
- apps/website/src/features/forms/submission-ip-expiry-sweep.ts | lines 76.47 br 66.67 fn 33.33 | uncovered lines: 13-15,30-34
- apps/website/src/features/forms/tool-registrations.ts | lines 90.91 br 100.0 fn 100.0 | uncovered lines: 1-8
- apps/website/src/features/fs-files/fs-files.ts | lines 92.89 br 100.0 fn 75.0 | uncovered lines: 1-5,172-173,226-234
- apps/website/src/features/fs-files/layout.ts | lines 97.2 br 100.0 fn 100.0 | uncovered lines: 1-3,145
- apps/website/src/features/fs-files/site-file-request.ts | lines 98.75 br 96.88 fn 100.0 | uncovered lines: 71
- apps/website/src/features/fs-files/tool-registrations.ts | lines 94.83 br 100.0 fn 85.71 | uncovered lines: 49-51
- apps/website/src/features/identity/api-key-binding.ts | lines 100.0 br 50.0 fn 0.0 | uncovered lines: 
- apps/website/src/features/identity/boot-session-token-binding.ts | lines 100.0 br 50.0 fn 0.0 | uncovered lines: 
- apps/website/src/features/identity/default-credential-exposure.ts | lines 77.71 br 100.0 fn 100.0 | uncovered lines: 1-35
- apps/website/src/features/identity/first-owner-password.ts | lines 98.31 br 93.75 fn 55.56 | uncovered lines: 48
- apps/website/src/features/identity/repo.sqlite.ts | lines 100.0 br 96.15 fn 63.16 | uncovered lines: 
- apps/website/src/features/identity/wiring.ts | lines 100.0 br 89.19 fn 70.83 | uncovered lines: 
- apps/website/src/features/mail-status/provider-operations.ts | lines 92.86 br 100.0 fn 100.0 | uncovered lines: 8
- apps/website/src/features/mail-status/provider-tool-registrations.ts | lines 100.0 br 80.0 fn 75.0 | uncovered lines: 
- apps/website/src/features/mail/index.ts | lines 71.43 br 100.0 fn 100.0 | uncovered lines: 1-3,12
- apps/website/src/features/media-generation/host-media-providers.ts | lines 100.0 br 81.82 fn 100.0 | uncovered lines: 
- apps/website/src/features/media-generation/provider-card-host.ts | lines 100.0 br 95.0 fn 92.86 | uncovered lines: 
- apps/website/src/features/media-generation/tool-registrations.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- apps/website/src/features/media-import/fetch-image.ts | lines 64.25 br 95.65 fn 100.0 | uncovered lines: 1-63,187
- apps/website/src/features/media/chat-attachment-reader-host.ts | lines 93.75 br 85.71 fn 100.0 | uncovered lines: 5
- apps/website/src/features/media/import-video-conversion.ts | lines 64.71 br 100.0 fn 66.67 | uncovered lines: 15-20
- apps/website/src/features/media/index.ts | lines 90.91 br 100.0 fn 100.0 | uncovered lines: 1-8
- apps/website/src/features/media/tool-registrations.ts | lines 100.0 br 82.86 fn 92.31 | uncovered lines: 
- apps/website/src/features/member-login/bindings.ts | lines 76.19 br 100.0 fn 40.0 | uncovered lines: 1,26-31,34-38,55,61-62
- apps/website/src/features/members/mail-transport.ts | lines 72.73 br 100.0 fn 100.0 | uncovered lines: 1-3
- apps/website/src/features/members/repo.sqlite.ts | lines 100.0 br 100.0 fn 93.75 | uncovered lines: 
- apps/website/src/features/newsletter/delivery/tool-registrations.ts | lines 100.0 br 100.0 fn 75.0 | uncovered lines: 
- apps/website/src/features/newsletter/deps-builders.ts | lines 98.82 br 100.0 fn 100.0 | uncovered lines: 64
- apps/website/src/features/newsletter/repo.sqlite.ts | lines 100.0 br 100.0 fn 92.86 | uncovered lines: 
- apps/website/src/features/observability/test-error-message.ts | lines 20.0 br 100.0 fn 100.0 | uncovered lines: 1-4
- apps/website/src/features/origin/configured-origin.ts | lines 85.51 br 100.0 fn 100.0 | uncovered lines: 1-10
- apps/website/src/features/pages/index.ts | lines 34.78 br 100.0 fn 100.0 | uncovered lines: 1-15
- apps/website/src/features/pages/permissions.ts | lines 32.03 br 100.0 fn 100.0 | uncovered lines: 3-99,101-107
- apps/website/src/features/pages/skeleton.ts | lines 36.07 br 100.0 fn 100.0 | uncovered lines: 1-22,42-44,46-48,50-52,54-61
- apps/website/src/features/plugin-runtime/agent-plugin-tool-binding.ts | lines 98.28 br 96.23 fn 100.0 | uncovered lines: 1
- apps/website/src/features/plugin-runtime/built-ins/content-analyzer/index.ts | lines 100.0 br 100.0 fn 0.0 | uncovered lines: 
- apps/website/src/features/plugin-runtime/built-ins/content-analyzer/plugin.ts | lines 55.0 br 100.0 fn 100.0 | uncovered lines: 1-9
- apps/website/src/features/plugin-runtime/built-ins/word-count/index.ts | lines 70.15 br 100.0 fn 100.0 | uncovered lines: 1-20
- apps/website/src/features/plugin-runtime/capability-tool-registrations.ts | lines 99.01 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/features/plugin-runtime/declarative-content-types.ts | lines 71.79 br 100.0 fn 100.0 | uncovered lines: 1-22
- apps/website/src/features/plugin-runtime/host-binding.ts | lines 94.19 br 77.78 fn 91.67 | uncovered lines: 59-62,88
- apps/website/src/features/plugin-runtime/host-install-source.ts | lines 100.0 br 100.0 fn 85.71 | uncovered lines: 
- apps/website/src/features/plugin-runtime/host-tool-binding.ts | lines 100.0 br 96.77 fn 100.0 | uncovered lines: 
- apps/website/src/features/plugin-runtime/install-archive.ts | lines 39.13 br 100.0 fn 0.0 | uncovered lines: 1-8,19-24
- apps/website/src/features/plugin-runtime/install-tool-binding.ts | lines 96.3 br 75.0 fn 100.0 | uncovered lines: 1
- apps/website/src/features/plugin-runtime/install-tool.ts | lines 100.0 br 100.0 fn 66.67 | uncovered lines: 
- apps/website/src/features/plugin-runtime/install.ts | lines 95.45 br 100.0 fn 100.0 | uncovered lines: 21
- apps/website/src/features/plugin-runtime/invocation-core-deps.ts | lines 60.53 br 100.0 fn 100.0 | uncovered lines: 1-15
- apps/website/src/features/plugin-runtime/plugin-host-copy.ts | lines 71.43 br 100.0 fn 100.0 | uncovered lines: 1-8
- apps/website/src/features/plugin-runtime/provider-status-tool.ts | lines 100.0 br 100.0 fn 0.0 | uncovered lines: 
- apps/website/src/features/plugin-runtime/service-ports.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/features/plugin-runtime/tool-registrations.ts | lines 96.0 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/features/post/post-tool-view-deps.ts | lines 97.56 br 100.0 fn 100.0 | uncovered lines: 36
- apps/website/src/features/post/repo.memory.ts | lines 83.33 br 100.0 fn 100.0 | uncovered lines: 6
- apps/website/src/features/post/search-host-config.ts | lines 50.0 br 100.0 fn 100.0 | uncovered lines: 3-7
- apps/website/src/features/post/search-scratch-host.ts | lines 97.87 br 100.0 fn 100.0 | uncovered lines: 38
- apps/website/src/features/presentation/index.ts | lines 57.89 br 100.0 fn 100.0 | uncovered lines: 1-8
- apps/website/src/features/presentation/set-active-theme.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- apps/website/src/features/project-keys/host-bindings.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- apps/website/src/features/project-keys/vault-policy.ts | lines 97.06 br 80.0 fn 100.0 | uncovered lines: 12
- apps/website/src/features/publish-content/backstop-policy.ts | lines 100.0 br 98.39 fn 100.0 | uncovered lines: 
- apps/website/src/features/publish-content/backstop-service.ts | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- apps/website/src/features/publish-content/backstop-sqlite-binding.ts | lines 95.45 br 100.0 fn 87.5 | uncovered lines: 10
- apps/website/src/features/publish-content/destination-credential.ts | lines 100.0 br 100.0 fn 75.0 | uncovered lines: 
- apps/website/src/features/publish-content/peers.ts | lines 100.0 br 100.0 fn 80.0 | uncovered lines: 
- apps/website/src/features/publish-content/publish-readiness-copy.ts | lines 74.29 br 100.0 fn 100.0 | uncovered lines: 3-9,11-12
- apps/website/src/features/publish-content/publish-tool.ts | lines 92.59 br 100.0 fn 0.0 | uncovered lines: 21-22
- apps/website/src/features/publish-content/raw-file-contributor.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- apps/website/src/features/publish-content/raw-row-contributor.ts | lines 92.86 br 50.0 fn 100.0 | uncovered lines: 3
- apps/website/src/features/publish-content/tool-deps.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/features/publish-content/tool-registrations.ts | lines 100.0 br 88.89 fn 87.5 | uncovered lines: 
- apps/website/src/features/publish-content/tovu-publish-ports.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/features/publish-content/ui/host-binding.ts | lines 65.45 br 100.0 fn 33.33 | uncovered lines: 1-6,40-41,45-46,50-51,54-60
- apps/website/src/features/publish-content/ui/index.ts | lines 40.0 br 100.0 fn 100.0 | uncovered lines: 1-24
- apps/website/src/features/publish-content/ui/policy.ts | lines 98.05 br 100.0 fn 100.0 | uncovered lines: 1-8
- apps/website/src/features/publish-content/ui/sections.ts | lines 76.27 br 100.0 fn 100.0 | uncovered lines: 1-13,59
- apps/website/src/features/publish-trust/candidate-policy.ts | lines 36.84 br 100.0 fn 100.0 | uncovered lines: 1-5,7-13
- apps/website/src/features/publish-trust/host-settings.ts | lines 80.95 br 100.0 fn 100.0 | uncovered lines: 1-5,7-9
- apps/website/src/features/recovery/capability-card.ts | lines 96.15 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/features/recovery/gated-hooks.ts | lines 88.89 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/features/routines/classify-routine-approval.ts | lines 72.55 br 96.0 fn 100.0 | uncovered lines: 3-12,14,26,39,60
- apps/website/src/features/routines/routine-approval-observer.ts | lines 100.0 br 80.56 fn 84.62 | uncovered lines: 
- apps/website/src/features/routines/routine-commands.ts | lines 88.44 br 94.83 fn 90.0 | uncovered lines: 5-21,27,32,152
- apps/website/src/features/routines/routine-host.ts | lines 100.0 br 88.89 fn 75.0 | uncovered lines: 
- apps/website/src/features/routines/routine-run-handler.ts | lines 98.55 br 88.41 fn 100.0 | uncovered lines: 171-172
- apps/website/src/features/routines/routine-tool-registrations.ts | lines 53.72 br 100.0 fn 16.0 | uncovered lines: 99-103,112-115,118-121,123-128,134-144,147-152,161-168,172-175,177-182,184-198,201-204,206-221,223-237,241-245,254,267-268
- apps/website/src/features/routines/routine-wake-receiver.ts | lines 59.09 br 100.0 fn 60.0 | uncovered lines: 1-11,44-50
- apps/website/src/features/seo/index.ts | lines 95.73 br 100.0 fn 91.3 | uncovered lines: 1-5
- apps/website/src/features/settings/index.ts | lines 89.19 br 100.0 fn 100.0 | uncovered lines: 1-8,12-15
- apps/website/src/features/settings/settings-write-policies.ts | lines 95.95 br 100.0 fn 100.0 | uncovered lines: 72,76-77
