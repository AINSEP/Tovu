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

REPO: Tovu only. HEAD = codex/tv-w62-cov-web-1 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.
WEBSITE NOTE: these numbers come from 5 of 8 website test shards. A file can already be covered by a test that did not run. Check its existing tests first; if they already exercise the listed lines, list it SKIPPED-ALREADY-COVERED instead of adding a duplicate.

## FILES (path | coverage now | uncovered source lines)
- apps/site-chat/src/SiteAssistantHeader.tsx | lines 47.37 br 100.0 fn 100.0 | uncovered lines: 1-2,4-10,12
- apps/site-chat/src/SiteAssistantWidget.hooks.ts | lines 100.0 br 100.0 fn 86.67 | uncovered lines: 
- apps/site-chat/src/SiteAssistantWidget.tsx | lines 48.91 br 85.71 fn 100.0 | uncovered lines: 1-2,4,6-49
- apps/site-chat/src/jini-surfaces.ts | lines 66.67 br 100.0 fn 100.0 | uncovered lines: 1-6
- apps/site-chat/src/main.tsx | lines 44.0 br 100.0 fn 100.0 | uncovered lines: 1,3-9,11-13,15-29,31-32
- apps/site-chat/src/remixicon-override.ts | lines 13.64 br 100.0 fn 100.0 | uncovered lines: 1-57
- apps/site-chat/src/session-store.ts | lines 100.0 br 96.55 fn 100.0 | uncovered lines: 
- apps/site-chat/src/site-assistant-errors.ts | lines 75.68 br 72.73 fn 100.0 | uncovered lines: 1-6,8-9,28
- apps/site-chat/src/site-assistant-transport.ts | lines 89.44 br 83.09 fn 83.93 | uncovered lines: 1-28,297-303,314-329,402-406,586,592
- apps/site-chat/src/site-chat-comparison.ts | lines 97.3 br 100.0 fn 100.0 | uncovered lines: 1
- apps/site-chat/src/site-chat-i18n.ts | lines 97.83 br 93.75 fn 100.0 | uncovered lines: 1
- apps/site-chat/src/tool-confirmation.ts | lines 78.12 br 37.5 fn 66.67 | uncovered lines: 28-34
- apps/site-chat/src/vanilla-host.ts | lines 94.67 br 85.71 fn 71.43 | uncovered lines: 75-78
- apps/site-chat/src/vanilla-tool-confirmation.ts | lines 98.98 br 97.62 fn 100.0 | uncovered lines: 1
- apps/site-chat/src/visitor-page-control.ts | lines 100.0 br 68.18 fn 78.05 | uncovered lines: 
- apps/site-chat/src/visitor-site-path.ts | lines 97.62 br 55.56 fn 100.0 | uncovered lines: 39
- apps/website/src/assistant/a2ui-actions-route.ts | lines 98.91 br 100.0 fn 100.0 | uncovered lines: 97
- apps/website/src/assistant/admin-ag-ui-approvals.ts | lines 66.12 br 100.0 fn 14.29 | uncovered lines: 68-71,79,81-92,97-99,107,109-116,122-129,136-139
- apps/website/src/assistant/admin-frontend-owner.ts | lines 56.0 br 100.0 fn 0.0 | uncovered lines: 12-16,22-27
- apps/website/src/assistant/admin-screen-link-tool.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- apps/website/src/assistant/agent-daemon-port.ts | lines 76.83 br 100.0 fn 100.0 | uncovered lines: 1-19
- apps/website/src/assistant/agent-session-preset.ts | lines 87.5 br 100.0 fn 100.0 | uncovered lines: 1,15
- apps/website/src/assistant/agents.ts | lines 95.8 br 97.8 fn 100.0 | uncovered lines: 1-9,280
- apps/website/src/assistant/ask-choice-custom-answer.ts | lines 97.5 br 75.0 fn 100.0 | uncovered lines: 36
- apps/website/src/assistant/ask-choice-tool.ts | lines 100.0 br 89.06 fn 97.96 | uncovered lines: 
- apps/website/src/assistant/ask-choice-ui-resource.ts | lines 96.97 br 100.0 fn 100.0 | uncovered lines: 31
- apps/website/src/assistant/assistant-vault-compat.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- apps/website/src/assistant/assistant-vault.ts | lines 100.0 br 94.0 fn 66.67 | uncovered lines: 
- apps/website/src/assistant/batch-tool-inputs.ts | lines 100.0 br 95.45 fn 100.0 | uncovered lines: 
- apps/website/src/assistant/byok-credential.ts | lines 73.33 br 100.0 fn 100.0 | uncovered lines: 1-8
- apps/website/src/assistant/byok-tool-surface.ts | lines 93.54 br 67.72 fn 86.15 | uncovered lines: 288-289,311-318,320-321,338-345,349,386-387,390-401,617-618,707-714
- apps/website/src/assistant/cli-permission-layer.ts | lines 94.74 br 100.0 fn 100.0 | uncovered lines: 16
- apps/website/src/assistant/component-catalog-query.ts | lines 99.09 br 100.0 fn 100.0 | uncovered lines: 94
- apps/website/src/assistant/component-catalog-tool.ts | lines 100.0 br 93.75 fn 100.0 | uncovered lines: 
- apps/website/src/assistant/content-read-tool.ts | lines 98.89 br 91.3 fn 100.0 | uncovered lines: 275-276,498-499,527-528
- apps/website/src/assistant/content-target-inputs.ts | lines 100.0 br 98.97 fn 100.0 | uncovered lines: 
- apps/website/src/assistant/credential-chat-intake.ts | lines 97.62 br 95.24 fn 100.0 | uncovered lines: 18
- apps/website/src/assistant/credential-guidance.ts | lines 92.86 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/assistant/credential-store-fields.ts | lines 94.12 br 96.3 fn 50.0 | uncovered lines: 12
- apps/website/src/assistant/daemon-access.ts | lines 97.78 br 86.67 fn 100.0 | uncovered lines: 1,96
- apps/website/src/assistant/daemon-respawn-policy.ts | lines 63.33 br 100.0 fn 100.0 | uncovered lines: 1-10,25
- apps/website/src/assistant/demo-a2ui-tool.ts | lines 55.74 br 100.0 fn 42.86 | uncovered lines: 103-133,135-160,164-210
- apps/website/src/assistant/desktop-mcp-runtime.ts | lines 98.68 br 100.0 fn 90.91 | uncovered lines: 1
- apps/website/src/assistant/duplicate-resource-registry.ts | lines 46.15 br 100.0 fn 100.0 | uncovered lines: 1-33,39,65
- apps/website/src/assistant/durable-runs/accept.ts | lines 83.33 br 100.0 fn 100.0 | uncovered lines: 5
- apps/website/src/assistant/execution-credential-store.ts | lines 100.0 br 96.23 fn 100.0 | uncovered lines: 
- apps/website/src/assistant/external-mcp-call-confirmation.ts | lines 70.71 br 96.77 fn 100.0 | uncovered lines: 1-29
- apps/website/src/assistant/external-mcp-connection-source.ts | lines 90.23 br 77.78 fn 50.0 | uncovered lines: 104-109,152-154,160-164,192-194
- apps/website/src/assistant/external-mcp-federation-runtime.ts | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- apps/website/src/assistant/external-mcp-roster-change.ts | lines 97.56 br 100.0 fn 75.0 | uncovered lines: 43
- apps/website/src/assistant/external-mcp-tool-approval-adapters.ts | lines 100.0 br 100.0 fn 85.71 | uncovered lines: 
- apps/website/src/assistant/external-mcp-tool-approval-ports.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/assistant/frontend-control-capabilities.ts | lines 53.2 br 100.0 fn 100.0 | uncovered lines: 1-95
- apps/website/src/assistant/host-contracts.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/assistant/host-ports.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/assistant/index.ts | lines 83.09 br 100.0 fn 100.0 | uncovered lines: 1-29,31-36
- apps/website/src/assistant/installed-extension-tools.ts | lines 81.13 br 84.21 fn 100.0 | uncovered lines: 1-20
- apps/website/src/assistant/lost-frontend-binding.ts | lines 66.67 br 100.0 fn 100.0 | uncovered lines: 1-11
- apps/website/src/assistant/mcp-federation/bootstrap.ts | lines 100.0 br 96.3 fn 89.47 | uncovered lines: 
- apps/website/src/assistant/mcp-federation/presets.ts | lines 92.68 br 100.0 fn 85.71 | uncovered lines: 76-81
- apps/website/src/assistant/mcp-federation/registrations.ts | lines 100.0 br 96.0 fn 100.0 | uncovered lines: 
- apps/website/src/assistant/mcp-federation/reload-adapter.ts | lines 94.74 br 53.85 fn 54.55 | uncovered lines: 1,20
- apps/website/src/assistant/mcp-injection.ts | lines 52.05 br 100.0 fn 25.0 | uncovered lines: 1-21,45-47,72-82
- apps/website/src/assistant/mcp-services.ts | lines 75.0 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/assistant/mcp-ui.ts | lines 95.0 br 100.0 fn 100.0 | uncovered lines: 21
- apps/website/src/assistant/permanent-delete-settings.ts | lines 93.75 br 88.89 fn 100.0 | uncovered lines: 34-35
- apps/website/src/assistant/persistence/agent-session-store.ts | lines 94.44 br 100.0 fn 100.0 | uncovered lines: 1-2
- apps/website/src/assistant/persistence/chat-expiry-sweep.ts | lines 83.33 br 100.0 fn 66.67 | uncovered lines: 9-10
- apps/website/src/assistant/persistence/chat-history-store.ts | lines 83.33 br 100.0 fn 100.0 | uncovered lines: 6
- apps/website/src/assistant/persistence/conversation-tool-approval-store.ts | lines 91.3 br 100.0 fn 100.0 | uncovered lines: 1-6
- apps/website/src/assistant/persistence/run-ledger.ts | lines 92.0 br 62.5 fn 75.0 | uncovered lines: 24-25
- apps/website/src/assistant/persistence/store-factory.ts | lines 100.0 br 100.0 fn 88.89 | uncovered lines: 
- apps/website/src/assistant/persistence/tenant-scope.ts | lines 98.28 br 100.0 fn 100.0 | uncovered lines: 49
- apps/website/src/assistant/public-assistant-availability.ts | lines 100.0 br 91.67 fn 33.33 | uncovered lines: 
- apps/website/src/assistant/public-assistant-settings.ts | lines 100.0 br 95.65 fn 46.15 | uncovered lines: 
- apps/website/src/assistant/read-only-tool-constraint.ts | lines 66.46 br 100.0 fn 100.0 | uncovered lines: 1-53,168
- apps/website/src/assistant/rewrap-page-navigate-error.ts | lines 27.27 br 100.0 fn 100.0 | uncovered lines: 1-23,26
- apps/website/src/assistant/run-active-context.ts | lines 33.33 br 100.0 fn 50.0 | uncovered lines: 1-20,24,33
- apps/website/src/assistant/run-page-context.ts | lines 99.4 br 100.0 fn 100.0 | uncovered lines: 186
- apps/website/src/assistant/run-start-context.ts | lines 99.32 br 100.0 fn 100.0 | uncovered lines: 134
- apps/website/src/assistant/runtime-preferences.ts | lines 97.78 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/assistant/server-federation-diagnosis.ts | lines 93.33 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/assistant/site-credential-store.memory.ts | lines 100.0 br 77.78 fn 100.0 | uncovered lines: 
- apps/website/src/assistant/site-credential-store.ts | lines 98.17 br 91.11 fn 66.67 | uncovered lines: 106-107
- apps/website/src/assistant/site-guide-pointer.ts | lines 8.0 br 100.0 fn 100.0 | uncovered lines: 1-2,5-25
- apps/website/src/assistant/site/capability-card.ts | lines 93.33 br 100.0 fn 100.0 | uncovered lines: 3
- apps/website/src/assistant/site/capability-registry.ts | lines 99.29 br 100.0 fn 100.0 | uncovered lines: 153
- apps/website/src/assistant/site/history.ts | lines 78.72 br 100.0 fn 100.0 | uncovered lines: 1-19,88
- apps/website/src/assistant/site/mode.ts | lines 70.0 br 100.0 fn 100.0 | uncovered lines: 1-2,10
- apps/website/src/assistant/site/public-content.ts | lines 75.0 br 66.67 fn 100.0 | uncovered lines: 5-10,29,55-57
