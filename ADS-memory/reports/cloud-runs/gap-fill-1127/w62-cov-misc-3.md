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

REPO: Jini only. HEAD = codex/w62-cov-misc-3 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/core/src/contracts/runtime/process.ts | lines 100.0 br 90.0 fn 100.0 | uncovered lines: 
- packages/core/src/contracts/server/api-error.ts | lines 100.0 br 100.0 fn 66.67 | uncovered lines: 
- packages/core/src/contracts/server/conformance.ts | lines 100.0 br 93.33 fn 100.0 | uncovered lines: 
- packages/core/src/contracts/server/json-route.ts | lines 100.0 br 97.2 fn 100.0 | uncovered lines: 
- packages/core/src/contracts/server/middleware.ts | lines 100.0 br 95.24 fn 100.0 | uncovered lines: 
- packages/core/src/contracts/server/request-body.ts | lines 100.0 br 96.88 fn 100.0 | uncovered lines: 
- packages/core/src/contracts/server/route-table.ts | lines 93.98 br 93.51 fn 92.31 | uncovered lines: 76-78,94-95
- packages/core/src/contracts/server/sse.ts | lines 97.22 br 88.68 fn 100.0 | uncovered lines: 136-137
- packages/core/src/contracts/server/testing.ts | lines 100.0 br 93.55 fn 100.0 | uncovered lines: 
- packages/core/src/contracts/server/verified-origin/loopback-host.ts | lines 85.71 br 80.0 fn 100.0 | uncovered lines: 10
- packages/core/src/contracts/site/approval-i18n.ts | lines 100.0 br 91.3 fn 100.0 | uncovered lines: 
- packages/core/src/contracts/site/cms-media.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 200
- packages/core/src/contracts/site/media-provider-contribution.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 16
- packages/core/src/contracts/site/media-upload-limits.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 6
- packages/core/src/contracts/site/post-author.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-7
- packages/core/src/contracts/site/request-facts.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 10,23-28,35-39
- packages/core/src/contracts/site/site-serving-gate.ts | lines 100.0 br 92.31 fn 100.0 | uncovered lines: 
- packages/core/src/contracts/vault/invariants.ts | lines 89.47 br 100.0 fn 85.71 | uncovered lines: 19-22
- packages/core/src/env/coercers.ts | lines 100.0 br 96.55 fn 82.61 | uncovered lines: 
- packages/core/src/env/format-env-issue.ts | lines 100.0 br 91.67 fn 100.0 | uncovered lines: 
- packages/core/src/env/parse-env.ts | lines 100.0 br 98.39 fn 100.0 | uncovered lines: 
- packages/core/src/errors/catalog.ts | lines 100.0 br 97.8 fn 100.0 | uncovered lines: 
- packages/core/src/errors/incident-text.ts | lines 95.74 br 94.74 fn 100.0 | uncovered lines: 29-30
- packages/core/src/errors/reporter.ts | lines 98.79 br 96.74 fn 98.04 | uncovered lines: 421-423
- packages/core/src/errors/testing.ts | lines 100.0 br 92.31 fn 84.62 | uncovered lines: 
- packages/core/src/format-error-for-log.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/core/src/list-page.ts | lines 100.0 br 98.39 fn 100.0 | uncovered lines: 
- packages/core/src/native-approval-memory.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,15-16,19-37
- packages/core/src/net/endpoint-policy.ts | lines 100.0 br 97.46 fn 100.0 | uncovered lines: 
- packages/core/src/net/public-dns-vocabulary.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 10-12,14
- packages/core/src/object-store.ts | lines 100.0 br 100.0 fn 88.89 | uncovered lines: 
- packages/core/src/operator-locale.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,16,29-42
- packages/core/src/optimistic-concurrency.ts | lines 100.0 br 97.06 fn 100.0 | uncovered lines: 
- packages/core/src/optional-peer.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/core/src/primitives/logger.ts | lines 100.0 br 98.08 fn 100.0 | uncovered lines: 
- packages/core/src/redaction-collectors.ts | lines 100.0 br 89.61 fn 100.0 | uncovered lines: 
- packages/core/src/redaction-exact-secrets.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/core/src/redaction-labels.ts | lines 100.0 br 98.39 fn 100.0 | uncovered lines: 
- packages/core/src/redaction-spans.ts | lines 100.0 br 86.49 fn 100.0 | uncovered lines: 
- packages/core/src/registration-kit.ts | lines 97.99 br 100.0 fn 93.33 | uncovered lines: 603-607
- packages/core/src/settings/route-policy.ts | lines 7.41 br 100.0 fn 0.0 | uncovered lines: 45-53,60,63-71,77-82
- packages/core/src/settings/settings.ts | lines 99.41 br 99.06 fn 100.0 | uncovered lines: 128
- packages/core/src/settings/tool-registrations.ts | lines 100.0 br 98.92 fn 100.0 | uncovered lines: 
- packages/core/src/text/descriptor-i18n.ts | lines 17.14 br 100.0 fn 0.0 | uncovered lines: 35-38,40-48,50-52,55-67
- packages/core/src/text/format-timestamp.ts | lines 100.0 br 92.86 fn 100.0 | uncovered lines: 
- packages/core/src/text/mime.ts | lines 100.0 br 46.15 fn 100.0 | uncovered lines: 
- packages/core/src/text/sanitize-untrusted-text.ts | lines 98.0 br 97.4 fn 100.0 | uncovered lines: 135-136
- packages/core/src/tool-input-envelope.ts | lines 100.0 br 95.83 fn 100.0 | uncovered lines: 
- packages/core/src/tool-input-repairs.ts | lines 100.0 br 98.78 fn 92.86 | uncovered lines: 
- packages/core/src/tool-read-cards.ts | lines 100.0 br 94.83 fn 100.0 | uncovered lines: 
- packages/core/src/user-facing-error.ts | lines 100.0 br 83.61 fn 100.0 | uncovered lines: 
- packages/daemon/src/agent-executor/acp-events.ts | lines 98.31 br 96.7 fn 100.0 | uncovered lines: 185-186,308
- packages/daemon/src/agent-executor/argv-prompt-variants.ts | lines 91.8 br 88.89 fn 100.0 | uncovered lines: 88,122-124,147
- packages/daemon/src/agent-executor/child-input.ts | lines 98.36 br 97.75 fn 100.0 | uncovered lines: 89-91
- packages/daemon/src/agent-executor/child-lifecycle.ts | lines 100.0 br 97.92 fn 100.0 | uncovered lines: 
- packages/daemon/src/agent-executor/child-stdout.ts | lines 98.31 br 98.78 fn 100.0 | uncovered lines: 201-202
- packages/daemon/src/agent-executor/child-stream-events.ts | lines 96.94 br 96.77 fn 100.0 | uncovered lines: 52-54
- packages/daemon/src/agent-executor/http-mcp.ts | lines 100.0 br 92.31 fn 87.5 | uncovered lines: 
- packages/daemon/src/agent-executor/launch.ts | lines 99.21 br 97.83 fn 100.0 | uncovered lines: 849,919,1036,1053,1095,1597-1598
- packages/daemon/src/agent-executor/live-session-state.ts | lines 100.0 br 98.2 fn 100.0 | uncovered lines: 
- packages/daemon/src/agent-executor/mcp-bridge.ts | lines 100.0 br 97.06 fn 100.0 | uncovered lines: 
- packages/daemon/src/agent-executor/pi-rpc-events.ts | lines 99.17 br 97.96 fn 100.0 | uncovered lines: 215
- packages/daemon/src/bound-confirmations.ts | lines 98.2 br 90.16 fn 88.89 | uncovered lines: 191,225
- packages/daemon/src/byok-meta-tool-result.ts | lines 95.45 br 98.0 fn 100.0 | uncovered lines: 123-125
- packages/daemon/src/chat-settings.ts | lines 100.0 br 86.67 fn 87.5 | uncovered lines: 
- packages/daemon/src/core/read-only-tools.ts | lines 100.0 br 98.28 fn 100.0 | uncovered lines: 
- packages/daemon/src/frontend-session-registry.ts | lines 100.0 br 97.18 fn 100.0 | uncovered lines: 
- packages/daemon/src/http/a2ui-actions.ts | lines 96.83 br 87.5 fn 100.0 | uncovered lines: 54-55
- packages/daemon/src/http/agent-plugin-preflight.ts | lines 100.0 br 93.62 fn 100.0 | uncovered lines: 
- packages/daemon/src/http/attachment-lookup-routes.ts | lines 100.0 br 97.67 fn 100.0 | uncovered lines: 
- packages/daemon/src/http/attachment-owner-read.ts | lines 94.33 br 60.0 fn 100.0 | uncovered lines: 210-211,248-249,259-260,305-306
- packages/daemon/src/http/attachment-routes.ts | lines 100.0 br 95.0 fn 100.0 | uncovered lines: 
- packages/daemon/src/http/attachments.ts | lines 100.0 br 97.3 fn 100.0 | uncovered lines: 
- packages/daemon/src/http/db-ops.ts | lines 97.62 br 97.56 fn 100.0 | uncovered lines: 241-243
- packages/daemon/src/http/delegated-tools.ts | lines 98.4 br 99.18 fn 100.0 | uncovered lines: 355-357
- packages/daemon/src/http/frontend-control.ts | lines 100.0 br 91.89 fn 88.89 | uncovered lines: 
- packages/daemon/src/http/frontend-guest-scope.ts | lines 100.0 br 86.36 fn 100.0 | uncovered lines: 
- packages/daemon/src/http/frontend-request-route.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/daemon/src/http/frontend-sessions.ts | lines 97.96 br 93.8 fn 100.0 | uncovered lines: 253-254,264-265
- packages/daemon/src/http/memory.ts | lines 100.0 br 99.12 fn 100.0 | uncovered lines: 
- packages/daemon/src/http/principal-first-route.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/daemon/src/http/routines.ts | lines 82.4 br 90.11 fn 78.26 | uncovered lines: 398-399,436-437,439-441,461-463,465-467,469-471,477-479,512-517,519-521,524-535,537-544,547-558
- packages/daemon/src/http/runs.ts | lines 100.0 br 99.22 fn 100.0 | uncovered lines: 
- packages/daemon/src/http/sse-commit.ts | lines 100.0 br 100.0 fn 75.0 | uncovered lines: 
- packages/daemon/src/http/surface-callback-request.ts | lines 92.39 br 97.62 fn 76.92 | uncovered lines: 90-93,121-123
- packages/daemon/src/http/surface-callback-route.ts | lines 95.92 br 93.75 fn 100.0 | uncovered lines: 86-87
- packages/daemon/src/http/terminals.ts | lines 98.19 br 96.7 fn 100.0 | uncovered lines: 101-103
- packages/daemon/src/http/tool-execution-routes.ts | lines 100.0 br 95.08 fn 100.0 | uncovered lines: 
- packages/daemon/src/remote-tool-executor.ts | lines 100.0 br 98.97 fn 100.0 | uncovered lines: 
- packages/daemon/src/routines/durable-scheduler.ts | lines 89.93 br 79.46 fn 88.89 | uncovered lines: 48-52,114-115,174-175,215-232
