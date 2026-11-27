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

REPO: Tovu only. HEAD = codex/tv-w62-cov-web-9 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.
WEBSITE NOTE: these numbers come from 5 of 8 website test shards. A file can already be covered by a test that did not run. Check its existing tests first; if they already exercise the listed lines, list it SKIPPED-ALREADY-COVERED instead of adding a duplicate.

## FILES (path | coverage now | uncovered source lines)
- apps/website/src/platform/site-dir/sites-project-references.ts | lines 98.28 br 98.04 fn 78.95 | uncovered lines: 57
- apps/website/src/platform/site-dir/sites-workspace-options.ts | lines 100.0 br 96.0 fn 63.64 | uncovered lines: 
- apps/website/src/platform/site-dir/types.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/platform/temp/site-temp-roots.ts | lines 100.0 br 100.0 fn 83.33 | uncovered lines: 
- apps/website/src/platform/test-home-isolation.ts | lines 100.0 br 93.33 fn 85.71 | uncovered lines: 
- apps/website/src/server/error-mapping/respond.ts | lines 43.75 br 100.0 fn 0.0 | uncovered lines: 1,10-17
- apps/website/src/server/http/request-cookie.ts | lines 100.0 br 75.0 fn 33.33 | uncovered lines: 
- apps/website/src/server/inbound/admin-http/admin-json-route-ports.ts | lines 100.0 br 91.81 fn 70.21 | uncovered lines: 
- apps/website/src/server/inbound/admin-http/admin-raw-route-ports.ts | lines 100.0 br 91.3 fn 70.0 | uncovered lines: 
- apps/website/src/server/inbound/admin-http/admin-request-facts.ts | lines 98.86 br 92.0 fn 64.29 | uncovered lines: 97
- apps/website/src/server/inbound/admin-http/authorize-guard.ts | lines 100.0 br 92.86 fn 57.14 | uncovered lines: 
- apps/website/src/server/inbound/admin-http/dev-auth.ts | lines 98.13 br 92.68 fn 81.48 | uncovered lines: 469-473,566-568,622-626
- apps/website/src/server/inbound/admin-http/http/widgets.ts | lines 98.7 br 90.91 fn 100.0 | uncovered lines: 77
- apps/website/src/server/inbound/admin-http/local-admin-request.ts | lines 96.15 br 94.44 fn 66.67 | uncovered lines: 19
- apps/website/src/server/inbound/admin-http/owner-mfa-routes.ts | lines 100.0 br 88.89 fn 35.29 | uncovered lines: 
- apps/website/src/server/inbound/admin-http/owner-passkey-routes.ts | lines 100.0 br 94.44 fn 68.18 | uncovered lines: 
- apps/website/src/server/inbound/admin-http/owner-recovery-routes.ts | lines 100.0 br 92.31 fn 88.89 | uncovered lines: 
- apps/website/src/server/inbound/admin-http/publish-trust-auth.ts | lines 99.55 br 96.05 fn 71.43 | uncovered lines: 222,444
- apps/website/src/server/inbound/admin-http/routes/agent-plugins/deps.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/inbound/admin-http/routes/agent-plugins/install-response.ts | lines 97.83 br 80.0 fn 100.0 | uncovered lines: 44
- apps/website/src/server/inbound/admin-http/routes/analytics/recent-hits.ts | lines 90.74 br 71.43 fn 80.0 | uncovered lines: 35-39
- apps/website/src/server/inbound/admin-http/routes/api-keys/deps.ts | lines 100.0 br 100.0 fn 83.33 | uncovered lines: 
- apps/website/src/server/inbound/admin-http/routes/assistant/stored-credential-probe.ts | lines 89.74 br 100.0 fn 33.33 | uncovered lines: 32-33,36-37
- apps/website/src/server/inbound/admin-http/routes/external-mcp/deps.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/inbound/admin-http/routes/external-mcp/guard.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts | lines 93.52 br 100.0 fn 33.33 | uncovered lines: 60-61,66,69-70,104-105
- apps/website/src/server/inbound/admin-http/routes/forms/deps.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/inbound/admin-http/routes/fs-files/folder-picker.ts | lines 100.0 br 100.0 fn 88.89 | uncovered lines: 
- apps/website/src/server/inbound/admin-http/routes/media/deps.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/inbound/admin-http/routes/media/route-guards.ts | lines 83.33 br 66.67 fn 50.0 | uncovered lines: 19-20,27-29
- apps/website/src/server/inbound/admin-http/routes/members/deps.ts | lines 64.0 br 100.0 fn 100.0 | uncovered lines: 1-8,36
- apps/website/src/server/inbound/admin-http/routes/newsletter/deps.ts | lines 79.22 br 100.0 fn 100.0 | uncovered lines: 1-15,128
- apps/website/src/server/inbound/admin-http/routes/plugins/chart-providers.ts | lines 60.0 br 100.0 fn 25.0 | uncovered lines: 28-36,39-44,47-51
- apps/website/src/server/inbound/admin-http/routes/plugins/install.ts | lines 93.75 br 100.0 fn 94.12 | uncovered lines: 35-37
- apps/website/src/server/inbound/admin-http/routes/publish-content/deps.ts | lines 99.07 br 100.0 fn 50.0 | uncovered lines: 130
- apps/website/src/server/inbound/admin-http/routes/publish-content/import-errors.ts | lines 97.73 br 100.0 fn 100.0 | uncovered lines: 42
- apps/website/src/server/inbound/admin-http/routes/publish-content/peer-transport.ts | lines 100.0 br 76.19 fn 100.0 | uncovered lines: 
- apps/website/src/server/inbound/admin-http/routes/settings/deps.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/inbound/admin-http/routes/settings/shared.ts | lines 99.41 br 95.45 fn 100.0 | uncovered lines: 163
- apps/website/src/server/inbound/admin-http/routes/sites/sites-home.ts | lines 78.87 br 68.75 fn 90.91 | uncovered lines: 2-13,49-51
- apps/website/src/server/inbound/admin-http/routes/sites/warm-site-control.ts | lines 93.75 br 47.62 fn 100.0 | uncovered lines: 1,42-44
- apps/website/src/server/inbound/admin-http/routes/system/mail-providers.ts | lines 100.0 br 100.0 fn 88.89 | uncovered lines: 
- apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts | lines 99.03 br 100.0 fn 90.0 | uncovered lines: 105,181
- apps/website/src/server/inbound/admin-http/routes/system/site-key.ts | lines 95.64 br 84.68 fn 97.06 | uncovered lines: 228-232,302-304,333-334,472-475,610-619
- apps/website/src/server/inbound/admin-http/routes/system/site-shares.ts | lines 100.0 br 93.26 fn 95.24 | uncovered lines: 
- apps/website/src/server/inbound/admin-http/routes/system/sites.ts | lines 95.11 br 92.31 fn 91.67 | uncovered lines: 213-223
- apps/website/src/server/inbound/admin-http/routes/taxonomy/deps.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/inbound/admin-http/routes/themes/explore.ts | lines 96.93 br 88.89 fn 94.74 | uncovered lines: 1-3,511,541-542,555-559,570-575
- apps/website/src/server/inbound/admin-http/routes/themes/held-back.ts | lines 100.0 br 89.29 fn 92.86 | uncovered lines: 
- apps/website/src/server/inbound/admin-http/routes/themes/preview.ts | lines 100.0 br 100.0 fn 80.0 | uncovered lines: 
- apps/website/src/server/inbound/admin-http/routes/users/deps.ts | lines 100.0 br 90.0 fn 57.14 | uncovered lines: 
- apps/website/src/server/inbound/assistant/agent-daemon-core-client.ts | lines 97.22 br 84.21 fn 97.3 | uncovered lines: 1-2,41-42
- apps/website/src/server/inbound/assistant/agent-daemon-idle-park.ts | lines 74.71 br 52.94 fn 70.0 | uncovered lines: 1,3,44-53,57-62,64-65,77-78
- apps/website/src/server/inbound/assistant/agent-daemon-run-launch.ts | lines 95.92 br 71.67 fn 90.48 | uncovered lines: 124-128,146-147,203
- apps/website/src/server/inbound/assistant/agent-daemon-run-session.ts | lines 98.55 br 73.53 fn 75.0 | uncovered lines: 69,72,209
- apps/website/src/server/inbound/assistant/agent-daemon-run-start.ts | lines 95.87 br 61.11 fn 81.82 | uncovered lines: 1,195-196,239-243,280-281,315,356-357,364-365
- apps/website/src/server/inbound/assistant/agent-daemon-run-tool-access.ts | lines 94.32 br 78.46 fn 80.77 | uncovered lines: 29-31,93-96,112-114
- apps/website/src/server/inbound/assistant/agent-daemon-scope-attachments.ts | lines 99.52 br 91.89 fn 100.0 | uncovered lines: 203
- apps/website/src/server/inbound/assistant/agent-daemon-scope-control.ts | lines 98.39 br 81.82 fn 83.33 | uncovered lines: 1
- apps/website/src/server/inbound/assistant/agent-daemon-scope-http.ts | lines 82.76 br 100.0 fn 41.38 | uncovered lines: 58-62,65-68,105-108,136-139,149-160,213-220,227,277-283
- apps/website/src/server/inbound/assistant/agent-daemon-scope-lifetime.ts | lines 96.43 br 85.71 fn 100.0 | uncovered lines: 1-2
- apps/website/src/server/inbound/assistant/agent-daemon-scope-runtime.ts | lines 76.22 br 100.0 fn 28.57 | uncovered lines: 1,48-50,74-94,120-125,168,170-176
- apps/website/src/server/inbound/assistant/agent-daemon-scope-tools.ts | lines 97.14 br 62.5 fn 33.33 | uncovered lines: 83-84,98-99
- apps/website/src/server/inbound/assistant/agent-daemon-scope.ts | lines 98.45 br 78.95 fn 44.0 | uncovered lines: 199,341-342,345-346
- apps/website/src/server/inbound/assistant/agent-daemon-server.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/server/inbound/assistant/agent-daemon-site-tools.ts | lines 93.09 br 74.63 fn 78.79 | uncovered lines: 1,152-158,167-168,225-229
- apps/website/src/server/inbound/assistant/agent-plugin-preflight-events.ts | lines 96.97 br 87.5 fn 100.0 | uncovered lines: 1
- apps/website/src/server/inbound/assistant/agent-plugin-prompt-variants.ts | lines 92.86 br 90.0 fn 100.0 | uncovered lines: 1-3
- apps/website/src/server/inbound/assistant/assistant-browser-lease.ts | lines 70.0 br 100.0 fn 100.0 | uncovered lines: 1-4,7-8
- apps/website/src/server/inbound/assistant/assistant-filesystem-notices.ts | lines 75.0 br 50.0 fn 100.0 | uncovered lines: 3-5
- apps/website/src/server/inbound/assistant/assistant-run-tool-facts.ts | lines 100.0 br 72.73 fn 100.0 | uncovered lines: 
- apps/website/src/server/inbound/assistant/assistant-run-tool-policy.ts | lines 97.78 br 76.92 fn 100.0 | uncovered lines: 47
- apps/website/src/server/inbound/assistant/assistant-runtime-guidance.ts | lines 93.53 br 84.62 fn 92.86 | uncovered lines: 1-3,156-163
- apps/website/src/server/inbound/assistant/assistant-system-overlay.ts | lines 99.38 br 88.89 fn 100.0 | uncovered lines: 88-89
- apps/website/src/server/inbound/assistant/assistant-tool-access.ts | lines 98.44 br 86.49 fn 100.0 | uncovered lines: 56
- apps/website/src/server/inbound/assistant/assistant-tool-consent.ts | lines 100.0 br 91.67 fn 90.91 | uncovered lines: 
- apps/website/src/server/inbound/assistant/byok-message-attachments.ts | lines 96.0 br 100.0 fn 100.0 | uncovered lines: 13
- apps/website/src/server/inbound/assistant/capability-manifest-prefix.ts | lines 67.03 br 100.0 fn 100.0 | uncovered lines: 1-30
- apps/website/src/server/inbound/assistant/chat-attachment-directory.ts | lines 97.78 br 66.67 fn 33.33 | uncovered lines: 39
- apps/website/src/server/inbound/assistant/daemon-origin-policy.ts | lines 72.22 br 57.14 fn 100.0 | uncovered lines: 1-10
- apps/website/src/server/inbound/assistant/federation-admissions-route.ts | lines 34.67 br 100.0 fn 100.0 | uncovered lines: 5-53
- apps/website/src/server/inbound/assistant/federation-reload-route.ts | lines 100.0 br 75.0 fn 100.0 | uncovered lines: 
- apps/website/src/server/inbound/assistant/index.ts | lines 42.86 br 100.0 fn 100.0 | uncovered lines: 1-8
- apps/website/src/server/inbound/assistant/plugin-prompt-assembly.ts | lines 27.27 br 100.0 fn 100.0 | uncovered lines: 1-8
- apps/website/src/server/inbound/assistant/plugin-prompt-prefix.ts | lines 32.14 br 100.0 fn 0.0 | uncovered lines: 1-14,36-37,43-64
- apps/website/src/server/inbound/assistant/run-has-write-access.ts | lines 74.51 br 78.57 fn 100.0 | uncovered lines: 3-15
- apps/website/src/server/inbound/assistant/run-lifecycle-tracing.ts | lines 100.0 br 60.0 fn 28.57 | uncovered lines: 
- apps/website/src/server/inbound/assistant/run-log-lines.ts | lines 88.57 br 100.0 fn 100.0 | uncovered lines: 7-10
- apps/website/src/server/inbound/assistant/tool-access-lowering-route.ts | lines 92.59 br 75.0 fn 100.0 | uncovered lines: 26-27
- apps/website/src/server/inbound/public-http/http/members.ts | lines 100.0 br 66.67 fn 33.33 | uncovered lines: 
