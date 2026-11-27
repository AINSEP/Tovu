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

REPO: Tovu only. HEAD = codex/tv-w62-cov-adm-2 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- apps/admin/src/hooks/use-admin-execution-credential.hooks.ts | lines 96.0 br 93.33 fn 94.44 | uncovered lines: 108
- apps/admin/src/hooks/use-assistant-chats.hooks.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- apps/admin/src/integrations/jini-admin/analytics-page.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 12
- apps/admin/src/integrations/jini-admin/consent-screen.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 10,15
- apps/admin/src/integrations/jini-admin/kit.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- apps/admin/src/integrations/jini-admin/modules.hooks.ts | lines 100.0 br 95.92 fn 100.0 | uncovered lines: 
- apps/admin/src/integrations/jini-admin/security-module.hooks.ts | lines 88.24 br 100.0 fn 50.0 | uncovered lines: 34-35
- apps/admin/src/integrations/jini-admin/security-ports.ts | lines 95.0 br 85.71 fn 90.91 | uncovered lines: 91
- apps/admin/src/integrations/jini-admin/settings-external-mcp-oauth-connect.hooks.ts | lines 80.0 br 85.71 fn 66.67 | uncovered lines: 21
- apps/admin/src/integrations/jini-admin/settings-external-mcp-shared-choice.hooks.ts | lines 75.0 br 66.67 fn 83.33 | uncovered lines: 13-14
- apps/admin/src/integrations/jini-admin/site-update-notice.hooks.ts | lines 91.67 br 100.0 fn 80.0 | uncovered lines: 28
- apps/admin/src/integrations/jini-admin/site-update-notice.tsx | lines 100.0 br 61.54 fn 83.33 | uncovered lines: 
- apps/admin/src/integrations/jini-kits.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- apps/admin/src/lib/admin-nav-i18n.ts | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- apps/admin/src/lib/agent-navigation-entities.ts | lines 66.67 br 64.29 fn 57.14 | uncovered lines: 22-23,26-27,30-31
- apps/admin/src/lib/assistant-chats.ts | lines 77.27 br 78.95 fn 71.43 | uncovered lines: 115,118,123,128,133
- apps/admin/src/lib/assistant-transport-ag-ui.ts | lines 95.77 br 76.79 fn 94.44 | uncovered lines: 224,227,234
- apps/admin/src/lib/assistant-transport.ts | lines 100.0 br 80.77 fn 100.0 | uncovered lines: 
- apps/admin/src/lib/browser-telemetry.ts | lines 71.43 br 66.67 fn 66.67 | uncovered lines: 29-30
- apps/admin/src/lib/chat-attachment-liveness.ts | lines 100.0 br 66.67 fn 100.0 | uncovered lines: 
- apps/admin/src/lib/media-image-extension.tsx | lines 100.0 br 90.48 fn 100.0 | uncovered lines: 
- apps/admin/src/lib/settings-tabs.ts | lines 94.44 br 50.0 fn 66.67 | uncovered lines: 66
- apps/admin/src/lib/shell-collaborators.ts | lines 95.45 br 100.0 fn 88.89 | uncovered lines: 42
- apps/admin/src/lib/shell-notices-wiring.tsx | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- apps/admin/src/lib/widget-embed-extension.tsx | lines 94.59 br 96.55 fn 91.3 | uncovered lines: 124-125
- apps/admin/src/main.tsx | lines 100.0 br 87.5 fn 66.67 | uncovered lines: 
- apps/admin/src/panel-pages.ts | lines 100.0 br 100.0 fn 84.15 | uncovered lines: 
- apps/admin/src/panels.tsx | lines 98.8 br 98.73 fn 98.21 | uncovered lines: 165
- apps/admin/src/site-section-availability.hooks.ts | lines 100.0 br 97.3 fn 100.0 | uncovered lines: 
