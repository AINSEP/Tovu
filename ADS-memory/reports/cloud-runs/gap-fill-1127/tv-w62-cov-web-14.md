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

REPO: Tovu only. HEAD = codex/tv-w62-cov-web-14 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.
WEBSITE NOTE: these numbers come from 5 of 8 website test shards. A file can already be covered by a test that did not run. Check its existing tests first; if they already exercise the listed lines, list it SKIPPED-ALREADY-COVERED instead of adding a duplicate.

## FILES (path | coverage now | uncovered source lines)
- apps/website/src/server/runtime/composition/visitor-tools-management.ts | lines 74.07 br 100.0 fn 25.0 | uncovered lines: 14-17,26-28
- apps/website/src/server/runtime/composition/webhook-delivery-worker.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- apps/website/src/server/runtime/composition/widget-render-host.ts | lines 100.0 br 66.67 fn 50.0 | uncovered lines: 
- apps/website/src/server/runtime/configuration/capability-inventory.ts | lines 95.11 br 100.0 fn 100.0 | uncovered lines: 1-16,370
- apps/website/src/server/runtime/configuration/env-schema.ts | lines 79.37 br 85.71 fn 85.71 | uncovered lines: 1-11,102-109,127-133
- apps/website/src/server/runtime/configuration/seed.ts | lines 100.0 br 96.3 fn 94.44 | uncovered lines: 
- apps/website/src/server/runtime/lifecycle/agent-daemon-port.ts | lines 91.43 br 80.0 fn 75.0 | uncovered lines: 33-35
- apps/website/src/server/runtime/lifecycle/assistant-daemon-connection.ts | lines 95.0 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/server/runtime/lifecycle/assistant-daemon-registry.ts | lines 97.3 br 100.0 fn 100.0 | uncovered lines: 33
- apps/website/src/server/runtime/lifecycle/boot-lifecycle.ts | lines 72.31 br 65.0 fn 90.0 | uncovered lines: 1-16,58-66,93-95,118-125
- apps/website/src/server/runtime/lifecycle/daemon-demand-fetch.ts | lines 93.75 br 100.0 fn 66.67 | uncovered lines: 12
- apps/website/src/server/runtime/lifecycle/daemon-lifecycle-log.ts | lines 18.75 br 100.0 fn 100.0 | uncovered lines: 1-7,9-14
- apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts | lines 74.88 br 70.31 fn 73.85 | uncovered lines: 29,31,37,47,57-66,68-102,106-109,111-144,154-157,161-166,169-178,196-202,204-205,226-227,243-247,301-314,508-542,548,584-585,594-595,609-611,614-616,656-661,702,721,733-735,737-738…
- apps/website/src/server/runtime/lifecycle/local-site-host.ts | lines 91.07 br 81.82 fn 84.21 | uncovered lines: 30-39
- apps/website/src/server/runtime/lifecycle/local-site-process.ts | lines 86.16 br 59.52 fn 63.64 | uncovered lines: 59-60,63-64,73,117-118,167-173,189-195,250-251,277-282,285-287,295-302,320-323
- apps/website/src/server/runtime/lifecycle/readiness-state.ts | lines 84.31 br 100.0 fn 100.0 | uncovered lines: 5-19,101
- apps/website/src/server/runtime/lifecycle/site-idle-park.ts | lines 69.57 br 100.0 fn 50.0 | uncovered lines: 1,13,19-23
- apps/website/src/server/runtime/lifecycle/warm-site-retirement.ts | lines 47.06 br 50.0 fn 20.0 | uncovered lines: 1,14-22,29,35-50
- apps/website/src/server/runtime/plugin-tier2/run-in-worker.ts | lines 84.29 br 100.0 fn 100.0 | uncovered lines: 1-11
- apps/website/src/server/runtime/plugin-tier2/worker.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/admin-failure-copy.ts | lines 99.14 br 100.0 fn 100.0 | uncovered lines: 1
- packages/contracts/src/admin-locales.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/assistant-content-guidance.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/assistant-native-fallbacks.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/assistant-subagents-policy.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/content-chat-title.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/credential-copy.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/daemon-connection.ts | lines 95.45 br 100.0 fn 100.0 | uncovered lines: 1
- packages/contracts/src/daemon-exit-codes.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/desktop-storage.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/export-report.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/fs-folder-recovery.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/host-signals.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/hosted-sign-in-links.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/product-telemetry.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/publish-history-list-limit.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/redirect-tables.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/routines.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/secret-redaction.ts | lines 91.38 br 100.0 fn 0.0 | uncovered lines: 1-2,58-60
- packages/contracts/src/site-scope-key.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/site-share-limits.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/startup-secret-keys.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/upload-limits.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/contracts/src/widget-tables.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/sdk/src/content-contracts.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/sdk/src/hooks.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/sdk/src/index.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
