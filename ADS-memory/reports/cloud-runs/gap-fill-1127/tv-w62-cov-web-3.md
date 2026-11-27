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

REPO: Tovu only. HEAD = codex/tv-w62-cov-web-3 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.
WEBSITE NOTE: these numbers come from 5 of 8 website test shards. A file can already be covered by a test that did not run. Check its existing tests first; if they already exercise the listed lines, list it SKIPPED-ALREADY-COVERED instead of adding a duplicate.

## FILES (path | coverage now | uncovered source lines)
- apps/website/src/features/agent-plugins/card-host-bindings.ts | lines 92.86 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/features/agent-plugins/connect-card-ui.ts | lines 84.62 br 100.0 fn 100.0 | uncovered lines: 1-3,29
- apps/website/src/features/agent-plugins/connect-destination.ts | lines 77.78 br 100.0 fn 100.0 | uncovered lines: 1-3,18
- apps/website/src/features/agent-plugins/connect-sign-in-wait.ts | lines 75.0 br 100.0 fn 50.0 | uncovered lines: 1-3,13
- apps/website/src/features/agent-plugins/customize-tool.ts | lines 84.21 br 100.0 fn 100.0 | uncovered lines: 1-3
- apps/website/src/features/agent-plugins/enable-access.ts | lines 80.0 br 80.0 fn 75.0 | uncovered lines: 1-5,28
- apps/website/src/features/agent-plugins/executable-tools/approval.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/features/agent-plugins/executable-tools/host-bindings.ts | lines 100.0 br 92.86 fn 100.0 | uncovered lines: 
- apps/website/src/features/agent-plugins/federate-mcp.ts | lines 82.98 br 100.0 fn 80.0 | uncovered lines: 1-5,44-45,47
- apps/website/src/features/agent-plugins/grant-signed-in-defaults.ts | lines 91.3 br 83.33 fn 81.82 | uncovered lines: 1-3,55
- apps/website/src/features/agent-plugins/host-overlays-dir.ts | lines 94.44 br 75.0 fn 33.33 | uncovered lines: 16
- apps/website/src/features/agent-plugins/host-tool-ports.ts | lines 91.78 br 100.0 fn 93.33 | uncovered lines: 1-6
- apps/website/src/features/agent-plugins/identity-read-policy.ts | lines 100.0 br 66.67 fn 33.33 | uncovered lines: 
- apps/website/src/features/agent-plugins/import-access-token.ts | lines 90.0 br 100.0 fn 87.5 | uncovered lines: 1-4,49
- apps/website/src/features/agent-plugins/install-tool.ts | lines 100.0 br 100.0 fn 60.0 | uncovered lines: 
- apps/website/src/features/agent-plugins/install-upload.ts | lines 100.0 br 100.0 fn 87.5 | uncovered lines: 
- apps/website/src/features/agent-plugins/layout.ts | lines 100.0 br 100.0 fn 42.86 | uncovered lines: 
- apps/website/src/features/agent-plugins/lifecycle.ts | lines 97.43 br 94.02 fn 94.29 | uncovered lines: 69-72,104-105,325-326,348
- apps/website/src/features/agent-plugins/mcp-host-bindings.ts | lines 95.74 br 100.0 fn 100.0 | uncovered lines: 1,48
- apps/website/src/features/agent-plugins/memory-tools.ts | lines 81.82 br 100.0 fn 100.0 | uncovered lines: 1-2
- apps/website/src/features/agent-plugins/memory.ts | lines 100.0 br 85.71 fn 83.33 | uncovered lines: 
- apps/website/src/features/agent-plugins/new-site-agent-plugin-tokens.ts | lines 97.56 br 90.91 fn 100.0 | uncovered lines: 39
- apps/website/src/features/agent-plugins/provider-plugin-link.ts | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- apps/website/src/features/agent-plugins/switch-on-saved-token.ts | lines 86.49 br 100.0 fn 100.0 | uncovered lines: 1-4,47
- apps/website/src/features/agent-plugins/token-sign-in.ts | lines 86.96 br 100.0 fn 100.0 | uncovered lines: 1-2,20
- apps/website/src/features/agent-plugins/tool-registrations.ts | lines 98.73 br 90.91 fn 94.44 | uncovered lines: 45-46
- apps/website/src/features/agent-plugins/uninstall-confirmation-ui.ts | lines 98.15 br 66.67 fn 100.0 | uncovered lines: 39
- apps/website/src/features/agent-plugins/write-note-tool.ts | lines 90.91 br 100.0 fn 100.0 | uncovered lines: 1-2
- apps/website/src/features/analytics/salt-context.ts | lines 33.33 br 100.0 fn 100.0 | uncovered lines: 1-5,8-12
- apps/website/src/features/analytics/warn.ts | lines 29.17 br 100.0 fn 0.0 | uncovered lines: 1-7,11-18,24-25
- apps/website/src/features/api-connections/browser-binding.ts | lines 85.94 br 100.0 fn 87.5 | uncovered lines: 1-5,39-41,63
- apps/website/src/features/api-connections/byo-client.ts | lines 96.43 br 90.91 fn 100.0 | uncovered lines: 33
- apps/website/src/features/api-connections/connect.ts | lines 90.0 br 100.0 fn 100.0 | uncovered lines: 13
- apps/website/src/features/api-connections/contribution.ts | lines 96.0 br 100.0 fn 100.0 | uncovered lines: 17
- apps/website/src/features/api-connections/host-bindings.ts | lines 96.36 br 100.0 fn 90.0 | uncovered lines: 73-74
- apps/website/src/features/api-connections/oauth-bindings.ts | lines 94.44 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/features/api-connections/plugin-state-bindings.ts | lines 91.67 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/features/api-connections/shared-owner.ts | lines 96.0 br 100.0 fn 57.14 | uncovered lines: 22
- apps/website/src/features/api-connections/surface-connection-bindings.ts | lines 78.79 br 84.62 fn 76.92 | uncovered lines: 23,34-39
- apps/website/src/features/api-connections/surface-connections.ts | lines 90.91 br 100.0 fn 100.0 | uncovered lines: 6
- apps/website/src/features/api-connections/vault-store-binding.ts | lines 98.61 br 100.0 fn 100.0 | uncovered lines: 83
- apps/website/src/features/asset-transfer/asset-sources.ts | lines 51.52 br 100.0 fn 0.0 | uncovered lines: 1-3,50-57,61-64,68-71,76-88
- apps/website/src/features/comments/index.ts | lines 77.78 br 100.0 fn 100.0 | uncovered lines: 1-12
- apps/website/src/features/consent/host-bindings.ts | lines 100.0 br 85.71 fn 41.67 | uncovered lines: 
- apps/website/src/features/consent/privacy-defaults-reporter.ts | lines 94.12 br 100.0 fn 100.0 | uncovered lines: 15
- apps/website/src/features/content-duplication/copy-naming-policy.ts | lines 96.15 br 100.0 fn 100.0 | uncovered lines: 21
- apps/website/src/features/content-types/write-service.ts | lines 100.0 br 80.0 fn 50.0 | uncovered lines: 
- apps/website/src/features/custom-credentials/extract-s8-c2p1-ports.type-pin.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/features/custom-credentials/index.ts | lines 89.74 br 100.0 fn 100.0 | uncovered lines: 1-4
- apps/website/src/features/custom-credentials/plugin-credential-card.ts | lines 75.0 br 100.0 fn 100.0 | uncovered lines: 4
- apps/website/src/features/custom-credentials/repository-target.ts | lines 83.33 br 100.0 fn 100.0 | uncovered lines: 5
- apps/website/src/features/custom-credentials/tool-registrations.copy.ts | lines 100.0 br 92.31 fn 77.78 | uncovered lines: 
- apps/website/src/features/custom-credentials/tool-registrations.ts | lines 100.0 br 95.56 fn 100.0 | uncovered lines: 
- apps/website/src/features/custom-credentials/tovu-credential-card-identity.ts | lines 74.07 br 100.0 fn 100.0 | uncovered lines: 1-7
- apps/website/src/features/custom-credentials/tovu-credential-sets.ts | lines 100.0 br 100.0 fn 94.12 | uncovered lines: 
- apps/website/src/features/custom-credentials/types.ts | lines 70.67 br 100.0 fn 100.0 | uncovered lines: 4-11,67,71-83
- apps/website/src/features/database-transfer/copy-engine.ts | lines 89.47 br 75.0 fn 100.0 | uncovered lines: 1,15
- apps/website/src/features/database-transfer/destination-store-host.ts | lines 100.0 br 100.0 fn 81.82 | uncovered lines: 
- apps/website/src/features/database-transfer/destination-ui.ts | lines 98.28 br 100.0 fn 100.0 | uncovered lines: 50
- apps/website/src/features/database-transfer/exclusions.ts | lines 87.95 br 100.0 fn 100.0 | uncovered lines: 1-10
- apps/website/src/features/database-transfer/table-catalog.ts | lines 99.16 br 100.0 fn 95.45 | uncovered lines: 123
- apps/website/src/features/database-transfer/tool-registrations.ts | lines 99.02 br 93.33 fn 100.0 | uncovered lines: 1
- apps/website/src/features/database/gated-hooks.ts | lines 75.0 br 100.0 fn 100.0 | uncovered lines: 1,7
- apps/website/src/features/deployments/capability-card.ts | lines 96.97 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/features/deployments/deploy-config-registry.ts | lines 98.51 br 100.0 fn 83.33 | uncovered lines: 65
- apps/website/src/features/deployments/deploy-config.ts | lines 99.58 br 83.33 fn 100.0 | uncovered lines: 236
- apps/website/src/features/deployments/deploy-ops/run-ops.ts | lines 83.72 br 94.12 fn 88.24 | uncovered lines: 43-48,73
- apps/website/src/features/deployments/deploy-ops/secrets.ts | lines 100.0 br 100.0 fn 66.67 | uncovered lines: 
- apps/website/src/features/deployments/deploy-ops/typed-secret-card.ts | lines 95.45 br 100.0 fn 100.0 | uncovered lines: 25
- apps/website/src/features/deployments/deploy-targets/host-kit-binding.ts | lines 97.56 br 93.33 fn 80.0 | uncovered lines: 33
- apps/website/src/features/deployments/export-run-binding.ts | lines 100.0 br 100.0 fn 0.0 | uncovered lines: 
- apps/website/src/features/deployments/index.ts | lines 46.88 br 100.0 fn 100.0 | uncovered lines: 1-6,8-11,13-16,30-32
- apps/website/src/features/deployments/publish-agent-tools.ts | lines 100.0 br 100.0 fn 85.71 | uncovered lines: 
- apps/website/src/features/deployments/publish-credentials/store.ts | lines 97.92 br 100.0 fn 100.0 | uncovered lines: 50
- apps/website/src/features/deployments/publish-tool-deps.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/features/deployments/static-publish/adapter.ts | lines 95.24 br 100.0 fn 100.0 | uncovered lines: 20
- apps/website/src/features/deployments/static-publish/domain-publish-tool.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/features/deployments/static-publish/publish-run.ts | lines 82.35 br 100.0 fn 66.67 | uncovered lines: 13-15
- apps/website/src/features/deployments/static-publish/verify.ts | lines 80.0 br 100.0 fn 66.67 | uncovered lines: 19,21-23
- apps/website/src/features/entries/unreadable-owner-entries-repair.ts | lines 80.82 br 87.5 fn 81.82 | uncovered lines: 52-77,145-146
- apps/website/src/features/external-mcp/contracts.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/features/external-mcp/external-mcp-host-copy.ts | lines 81.82 br 100.0 fn 100.0 | uncovered lines: 1-10
- apps/website/src/features/external-mcp/external-mcp-oauth.ts | lines 98.85 br 87.5 fn 77.27 | uncovered lines: 85-86
- apps/website/src/features/external-mcp/external-mcp-store.ts | lines 93.1 br 100.0 fn 83.33 | uncovered lines: 54-57
- apps/website/src/features/external-mcp/external-mcp-vault.ts | lines 100.0 br 100.0 fn 80.0 | uncovered lines: 
- apps/website/src/features/external-mcp/tool-registrations.ts | lines 99.01 br 92.86 fn 70.0 | uncovered lines: 48
- apps/website/src/features/form-destinations/key-store.ts | lines 98.53 br 100.0 fn 100.0 | uncovered lines: 65
- apps/website/src/features/forms/form-file-maintenance.ts | lines 99.28 br 96.26 fn 98.73 | uncovered lines: 1
- apps/website/src/features/forms/form-file-purge.ts | lines 72.73 br 90.0 fn 84.62 | uncovered lines: 65-78,84-93
- apps/website/src/features/forms/index.ts | lines 73.33 br 91.3 fn 92.86 | uncovered lines: 1-39,159
