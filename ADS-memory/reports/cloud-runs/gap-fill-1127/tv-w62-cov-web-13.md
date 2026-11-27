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

REPO: Tovu only. HEAD = codex/tv-w62-cov-web-13 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.
WEBSITE NOTE: these numbers come from 5 of 8 website test shards. A file can already be covered by a test that did not run. Check its existing tests first; if they already exercise the listed lines, list it SKIPPED-ALREADY-COVERED instead of adding a duplicate.

## FILES (path | coverage now | uncovered source lines)
- apps/website/src/server/runtime/composition/permanent-delete-deps.ts | lines 61.13 br 86.67 fn 72.0 | uncovered lines: 46,49-65,105,113-114,141-142,200-213,220-241,243-251,253-267,269-276,278-289,291-297
- apps/website/src/server/runtime/composition/plugin-credential-cards.ts | lines 45.35 br 50.0 fn 10.0 | uncovered lines: 1,18-20,26-34,47,50-59,65-68,71-89
- apps/website/src/server/runtime/composition/plugin-host.ts | lines 88.89 br 79.17 fn 62.5 | uncovered lines: 2-3,45-52,88
- apps/website/src/server/runtime/composition/plugin-runtime.ts | lines 61.4 br 90.0 fn 66.67 | uncovered lines: 10,12-15,17,30,32-62,65-70
- apps/website/src/server/runtime/composition/product-events.ts | lines 80.72 br 100.0 fn 33.33 | uncovered lines: 1,61-67,77-84
- apps/website/src/server/runtime/composition/product-telemetry.ts | lines 40.94 br 50.0 fn 7.14 | uncovered lines: 1,43-47,58-72,75-79,82-92,95-97,102-109,120,122-158,161-163,168-181,194-210,216-223,228-232,242-258
- apps/website/src/server/runtime/composition/project-store.ts | lines 98.11 br 85.94 fn 96.3 | uncovered lines: 243-244,268-270
- apps/website/src/server/runtime/composition/provider-config-source.ts | lines 99.54 br 91.49 fn 100.0 | uncovered lines: 207
- apps/website/src/server/runtime/composition/provider-contracts.ts | lines 76.0 br 100.0 fn 0.0 | uncovered lines: 21-26
- apps/website/src/server/runtime/composition/provider-plugins.ts | lines 87.27 br 70.83 fn 61.9 | uncovered lines: 187-193,225-226,236,239,244,247-254,258-263,271-278,291-292,308-310,314-315,323,335-336,381-383,386,476-479,516,540-548
- apps/website/src/server/runtime/composition/provider-revision-watch.ts | lines 77.78 br 100.0 fn 100.0 | uncovered lines: 9-10
- apps/website/src/server/runtime/composition/provider-settings-save.ts | lines 86.36 br 96.12 fn 83.33 | uncovered lines: 107,162-163,166-172,182,186-198
- apps/website/src/server/runtime/composition/public-oauth-callbacks.ts | lines 86.96 br 93.33 fn 56.25 | uncovered lines: 1-10,51-52
- apps/website/src/server/runtime/composition/public-site-guide.ts | lines 93.62 br 93.75 fn 87.5 | uncovered lines: 23-25
- apps/website/src/server/runtime/composition/publish-backstop-ports.ts | lines 96.0 br 100.0 fn 100.0 | uncovered lines: 16
- apps/website/src/server/runtime/composition/publish-content-http.ts | lines 93.33 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/server/runtime/composition/publish-content-manifest.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/publish-content-seed-hash.ts | lines 48.85 br 100.0 fn 25.0 | uncovered lines: 62-71,80-136
- apps/website/src/server/runtime/composition/publish-trust-grants.ts | lines 90.14 br 100.0 fn 75.0 | uncovered lines: 63-69
- apps/website/src/server/runtime/composition/publish-trust-revocations.ts | lines 27.5 br 75.0 fn 100.0 | uncovered lines: 4-10,12-28,36-40
- apps/website/src/server/runtime/composition/registered-sites.ts | lines 98.36 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/server/runtime/composition/reset-owner.ts | lines 40.43 br 100.0 fn 0.0 | uncovered lines: 20-47
- apps/website/src/server/runtime/composition/retention-policies/database-copies.ts | lines 53.49 br 100.0 fn 33.33 | uncovered lines: 27-34,37-48
- apps/website/src/server/runtime/composition/retention-policies/db-free-pages.ts | lines 80.0 br 100.0 fn 88.89 | uncovered lines: 1-7,12,41-45
- apps/website/src/server/runtime/composition/retention-policies/media-bytes-deps.ts | lines 98.39 br 91.3 fn 91.3 | uncovered lines: 95-96
- apps/website/src/server/runtime/composition/retention-policies/media-bytes.ts | lines 85.19 br 77.78 fn 100.0 | uncovered lines: 3-13,17
- apps/website/src/server/runtime/composition/retention.ts | lines 97.42 br 88.89 fn 90.48 | uncovered lines: 31-33,70
- apps/website/src/server/runtime/composition/serving-app.ts | lines 98.05 br 59.46 fn 51.61 | uncovered lines: 91-92,151-152
- apps/website/src/server/runtime/composition/settings-registration.ts | lines 95.06 br 100.0 fn 100.0 | uncovered lines: 1-4
- apps/website/src/server/runtime/composition/site-app-boot-work.ts | lines 72.73 br 100.0 fn 100.0 | uncovered lines: 1-5,11
- apps/website/src/server/runtime/composition/site-consent.ts | lines 100.0 br 88.64 fn 94.12 | uncovered lines: 
- apps/website/src/server/runtime/composition/site-cookie-consent.ts | lines 86.89 br 57.14 fn 62.5 | uncovered lines: 1,37-39,42-44,64
- apps/website/src/server/runtime/composition/site-deps/after-assembly-forms-search.ts | lines 97.09 br 90.0 fn 80.0 | uncovered lines: 68-69,72
- apps/website/src/server/runtime/composition/site-deps/agent-plugin-bootstrap.ts | lines 100.0 br 87.5 fn 85.71 | uncovered lines: 
- apps/website/src/server/runtime/composition/site-deps/assembly-phases.ts | lines 100.0 br 73.68 fn 70.59 | uncovered lines: 
- apps/website/src/server/runtime/composition/site-deps/boot-data.ts | lines 95.12 br 100.0 fn 54.55 | uncovered lines: 52,70,86,109,133-134
- apps/website/src/server/runtime/composition/site-deps/boot-phases.ts | lines 100.0 br 93.1 fn 65.79 | uncovered lines: 
- apps/website/src/server/runtime/composition/site-deps/content-resolvers-comments.ts | lines 98.84 br 100.0 fn 42.86 | uncovered lines: 89
- apps/website/src/server/runtime/composition/site-deps/events-origin.ts | lines 98.15 br 62.5 fn 100.0 | uncovered lines: 93-94
- apps/website/src/server/runtime/composition/site-deps/identity-settings.ts | lines 100.0 br 92.5 fn 96.55 | uncovered lines: 
- apps/website/src/server/runtime/composition/site-deps/mail-http.ts | lines 100.0 br 87.5 fn 75.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/site-deps/media-storage.ts | lines 89.83 br 100.0 fn 75.0 | uncovered lines: 1,63-67
- apps/website/src/server/runtime/composition/site-deps/open-store.ts | lines 100.0 br 94.74 fn 93.75 | uncovered lines: 
- apps/website/src/server/runtime/composition/site-deps/outbound-connections.ts | lines 100.0 br 100.0 fn 80.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/site-deps/overrides.ts | lines 95.0 br 86.96 fn 100.0 | uncovered lines: 112-115
- apps/website/src/server/runtime/composition/site-deps/plugin-runtime.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/site-deps/pre-assembly.ts | lines 97.5 br 100.0 fn 71.43 | uncovered lines: 58
- apps/website/src/server/runtime/composition/site-deps/project-keys.ts | lines 88.46 br 75.0 fn 83.33 | uncovered lines: 40-42
- apps/website/src/server/runtime/composition/site-deps/provider-config.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/site-deps/provider-identity.ts | lines 98.98 br 91.18 fn 84.62 | uncovered lines: 40
- apps/website/src/server/runtime/composition/site-deps/publish-apply.ts | lines 98.86 br 100.0 fn 60.0 | uncovered lines: 118
- apps/website/src/server/runtime/composition/site-deps/redirects.ts | lines 90.74 br 100.0 fn 75.0 | uncovered lines: 47-51
- apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts | lines 99.23 br 100.0 fn 60.0 | uncovered lines: 119
- apps/website/src/server/runtime/composition/site-deps/route-deps-comments-plugins.ts | lines 100.0 br 83.33 fn 80.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/site-deps/route-deps-content-chat.ts | lines 100.0 br 100.0 fn 44.44 | uncovered lines: 
- apps/website/src/server/runtime/composition/site-deps/route-deps-publish-credentials.ts | lines 94.38 br 100.0 fn 66.67 | uncovered lines: 70-74
- apps/website/src/server/runtime/composition/site-deps/route-deps-site-providers.ts | lines 98.75 br 84.62 fn 57.14 | uncovered lines: 225-226
- apps/website/src/server/runtime/composition/site-deps/self-hosted-update-supervisor.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/runtime/composition/site-deps/shared-oauth-commerce.ts | lines 94.59 br 77.78 fn 50.0 | uncovered lines: 41-42
- apps/website/src/server/runtime/composition/site-deps/site-imports.ts | lines 60.87 br 66.67 fn 33.33 | uncovered lines: 27-35
- apps/website/src/server/runtime/composition/site-deps/site-keys-members.ts | lines 100.0 br 57.14 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/site-deps/site-sharing.ts | lines 89.29 br 78.95 fn 64.71 | uncovered lines: 125-131,134-138
- apps/website/src/server/runtime/composition/site-deps/site-update-binding.ts | lines 68.42 br 80.0 fn 75.0 | uncovered lines: 1-7,65-75
- apps/website/src/server/runtime/composition/site-deps/store-basics.ts | lines 97.44 br 100.0 fn 71.43 | uncovered lines: 34
- apps/website/src/server/runtime/composition/site-deps/store-close-hooks.ts | lines 59.09 br 100.0 fn 100.0 | uncovered lines: 3-10,26
- apps/website/src/server/runtime/composition/site-deps/trash-adapters.ts | lines 90.91 br 100.0 fn 27.27 | uncovered lines: 87-90,100-104
- apps/website/src/server/runtime/composition/site-deps/trash-follow-up-hooks.ts | lines 96.77 br 86.96 fn 92.86 | uncovered lines: 95-97
- apps/website/src/server/runtime/composition/site-deps/trash-service.ts | lines 100.0 br 100.0 fn 71.43 | uncovered lines: 
- apps/website/src/server/runtime/composition/site-event-subscriptions.ts | lines 97.63 br 93.33 fn 75.0 | uncovered lines: 1-4
- apps/website/src/server/runtime/composition/site-guide-tools.ts | lines 99.24 br 88.0 fn 100.0 | uncovered lines: 126
- apps/website/src/server/runtime/composition/site-guide.ts | lines 99.07 br 89.47 fn 93.75 | uncovered lines: 95
- apps/website/src/server/runtime/composition/site-import-backend.ts | lines 89.29 br 70.0 fn 50.0 | uncovered lines: 35,56,62-68
- apps/website/src/server/runtime/composition/site-import-backfill.ts | lines 76.92 br 100.0 fn 50.0 | uncovered lines: 5,11-12
- apps/website/src/server/runtime/composition/site-import-index-state.ts | lines 60.87 br 72.0 fn 44.12 | uncovered lines: 55,58-61,63-77,83-86,93-100,107-115,138-147,162-164,173-191,199-200,209,222-226
- apps/website/src/server/runtime/composition/site-import-payload-fs.ts | lines 91.43 br 82.35 fn 100.0 | uncovered lines: 16,31-32
- apps/website/src/server/runtime/composition/site-key-recovery.ts | lines 47.02 br 100.0 fn 10.0 | uncovered lines: 62-71,75-78,88-105,107-115,119-129,145,148-174
- apps/website/src/server/runtime/composition/site-key-write-bindings.ts | lines 97.37 br 100.0 fn 100.0 | uncovered lines: 38
- apps/website/src/server/runtime/composition/site-mailer.ts | lines 86.96 br 66.67 fn 56.25 | uncovered lines: 54-62,88-90
- apps/website/src/server/runtime/composition/site-paths.ts | lines 99.45 br 76.74 fn 50.0 | uncovered lines: 128,364
- apps/website/src/server/runtime/composition/site-portability.ts | lines 98.59 br 94.12 fn 100.0 | uncovered lines: 76
- apps/website/src/server/runtime/composition/source-control-key-binding.ts | lines 96.23 br 82.46 fn 95.45 | uncovered lines: 40-41,107-108
- apps/website/src/server/runtime/composition/storage-secret.ts | lines 100.0 br 86.49 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/store-bound-contracts.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/runtime/composition/telemetry-consent.ts | lines 97.56 br 100.0 fn 100.0 | uncovered lines: 29
- apps/website/src/server/runtime/composition/tool-catalog-manifest.ts | lines 97.57 br 91.53 fn 52.38 | uncovered lines: 508-513,640-644,694-701,711
- apps/website/src/server/runtime/composition/tool-use-events.ts | lines 54.55 br 87.5 fn 100.0 | uncovered lines: 4-11,13,18-23
- apps/website/src/server/runtime/composition/trash-retention.ts | lines 11.11 br 100.0 fn 100.0 | uncovered lines: 1-8
- apps/website/src/server/runtime/composition/trash-user-admin-override.ts | lines 92.73 br 76.92 fn 100.0 | uncovered lines: 54-57
- apps/website/src/server/runtime/composition/vault-boot.ts | lines 98.94 br 92.99 fn 97.3 | uncovered lines: 27,142,360-361
- apps/website/src/server/runtime/composition/visitor-page-targets.ts | lines 97.44 br 69.23 fn 88.89 | uncovered lines: 1
