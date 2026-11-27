BOOTSTRAP: dispatched job. This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.

ROLE: you are the TDD agent doing a coverage GAP FILL. Read first: /Users/la/Programming/Tovu/AI-Dev-Shop/agents/tdd/skills.md, then the skills it lists for writing tests: AI-Dev-Shop/skills/test-design/SKILL.md, AI-Dev-Shop/skills/adversarial-test-design/references/testing-mistakes.md (lines 1-192: The One Question, the "What I'm about to test" index, Author Checklist; then the entries for what you test), AI-Dev-Shop/skills/coding-foundations/SKILL.md, AI-Dev-Shop/skills/testable-design-patterns/SKILL.md, and AI-Dev-Shop/harness-engineering/quality/coverage-integrity-policy.md (all under /Users/la/Programming/Tovu/). There is no spec/ADR for this work: skip spec-hash/ADR/CIC certification steps; follow the gap-fill path (step 4a).

GOAL: owner target is 100% lines/branches/functions per file. Write HIGH-QUALITY tests that cover the uncovered lines listed below. A test exists to catch a real break, not to raise a number.

HARD - NO RUNNING (owner: running tests here could take down the machine): do NOT run tests, test suites, builds, installs, typechecks of the tests tsconfig, coverage, or mutation runs. This clone has no node_modules; do not install. An Opus cloud run tests and fixes everything after you, so write code that you are confident compiles: check imports, exported names and types by reading the source.
HARD - NO REPO-WIDE SEARCH: no git grep / rg / find over the whole repo. Search only inside the target file's own package or app folder (e.g. `git grep -l <name> -- packages/cms/`), or read exact files.
DO NOT TOUCH: packages/commerce, packages/admin/src/pages/PageEditorChrome.tsx and its tests, coverage configs, thresholds, guard baselines, ratchets.

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

REPO: Jini only. HEAD = codex/w62-cov-int-2 = origin/integ/merge-28-2026-11-26.
NOTE: a Codex Cloud task already added packages/user-management/src/members/__tests__/consent-service.test.ts and 4 tests to packages/integrations/src/credentialed-http/sets/__tests__/extract-s8-sets.unit.test.ts on branch codex/ccx-um / codex/ccx-int; do not duplicate those.

## FILES (path | coverage now | uncovered source lines)
- packages/integrations/src/credentialed-http/tools/tool-registrations.ts | lines 2.15 br 100.0 fn 0.0 | uncovered lines: 41-43,89-100,119-121,145,152-161,164-166,186-193,208-217,236-243,256,259-260,262-268,303-305,307,315-316,319-329,337-340,346-361,399-408,453-456,458-468,489-500,516-521,524-539,547
- packages/integrations/src/custom-credentials/agent-tools.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 51-56,58-67,69-83,85-95,100-129,137-138,144-157
- packages/integrations/src/custom-credentials/credential-ports.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 18-19,33-42,61-72
- packages/integrations/src/custom-credentials/credentialed-request.ts | lines 94.83 br 95.65 fn 89.47 | uncovered lines: 90-92
- packages/integrations/src/custom-credentials/custom-credential-create-ui.ts | lines 87.95 br 95.24 fn 75.0 | uncovered lines: 182-191
- packages/integrations/src/custom-credentials/provider-settings-card.ts | lines 100.0 br 97.84 fn 100.0 | uncovered lines: 
- packages/integrations/src/custom-credentials/write-files-validation.ts | lines 73.15 br 69.44 fn 88.89 | uncovered lines: 96-102,106-107,120-121,143-144,146-147,152-153,161-162,174-175,182-183,202-203,205-206,226-227
- packages/integrations/src/media-providers/catalog-projection.ts | lines 93.33 br 53.85 fn 100.0 | uncovered lines: 36-37
- packages/integrations/src/media-providers/dispatch/engine.ts | lines 100.0 br 98.75 fn 100.0 | uncovered lines: 
- packages/integrations/src/media-providers/dispatch/openai-compatible.ts | lines 100.0 br 98.98 fn 100.0 | uncovered lines: 
- packages/integrations/src/react/admin-credentials/AdminByokKeyPanel.tsx | lines 30.68 br 28.57 fn 16.67 | uncovered lines: 50-52,72-76,78-89,91-98,100-104,106,195-199,214-219,221-223,229-234,236-241,243
- packages/integrations/src/react/credentials/OtherCredentialsSection.hooks.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,50-51,56-66,69-71
- packages/integrations/src/react/credentials/OtherCredentialsSection.tsx | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2,6,8,37-39,45,56-65,67-72,74,79-83,88-96,98-99,101,106-116,118,120-126,132-133,135-142,144,151-172,174,184-188,193-203,207-223,225,239,241-243,250-253,256-261,263-269,271-272
- packages/integrations/src/react/credentials/access-token-forms.ts | lines 26.23 br 25.0 fn 12.5 | uncovered lines: 20-22,31-34,55,61-68,79,83-91,98-100,145-153,163,173-174,177-180
- packages/integrations/src/react/credentials/credential-copy.ts | lines 100.0 br 60.0 fn 100.0 | uncovered lines: 
- packages/integrations/src/react/credentials/other-credential-stores.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,48-50,56-57,62-68,76,78-79,86-90,97-99,106-110,121-122,127-136
- packages/integrations/src/react/site-key/SiteKeyRecoveryCard.tsx | lines 3.57 br 100.0 fn 0.0 | uncovered lines: 15-20,22-26,28,30,32-40,42-46,49-61,63,65-75,77-79,81-105,107
- packages/integrations/src/react/site-key/SiteKeyTab.tsx | lines 65.87 br 46.15 fn 56.25 | uncovered lines: 94-97,99,101-102,128,148-151,183-184,186-188,190,192-193,201-202,226-228,272-282,284-287,289,291-296,298-306,308
- packages/integrations/src/react/site-key/hooks/use-site-key-recovery.hooks.ts | lines 69.44 br 63.16 fn 63.64 | uncovered lines: 74,76-80,82-85,121-135,166-168,173-176,189
- packages/integrations/src/react/site-key/hooks/use-site-key.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,71,77-79,81,83-92,94,104-120,122,124-129,132-138,140-147,149-150,153,159-173,175-177,179-180
- packages/integrations/src/react/webhooks/IntegrationDeliveries.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3,31-38,40-41,43-61,63-68,70-79,81-85,87
- packages/integrations/src/react/webhooks/Integrations.tsx | lines 67.14 br 71.43 fn 70.59 | uncovered lines: 54,67-104,106-112,114-117,119,191-204,253-255,325
- packages/integrations/src/react/webhooks/hooks/use-integration-deliveries.hooks.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/integrations/src/react/webhooks/hooks/use-integrations.hooks.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,4,94-101,103-113,115-137,139-140,143,146-148,150-158,160-161,163-167,169-170,176-182,184-189,191-192,194-195,200-202,204-207,211,213-233
- packages/integrations/src/react/webhooks/rules.ts | lines 67.5 br 75.0 fn 42.86 | uncovered lines: 45-49,99-100,123-128
- packages/integrations/src/secrets/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2
- packages/integrations/src/vendor-credentials/abort-guarded-repo.ts | lines 100.0 br 90.91 fn 100.0 | uncovered lines: 
- packages/integrations/src/vendor-credentials/project-scope.ts | lines 100.0 br 92.31 fn 100.0 | uncovered lines: 
- packages/integrations/src/vendor-credentials/vault-adapter.ts | lines 78.18 br 79.37 fn 76.92 | uncovered lines: 83-84,86-87,91-94,96-102,104-112,114-116,127-132,134,187-188
- packages/integrations/src/web-screenshot/capture-retention.ts | lines 99.0 br 86.79 fn 100.0 | uncovered lines: 91
- packages/integrations/src/web-screenshot/web-screenshot.ts | lines 99.28 br 78.57 fn 90.32 | uncovered lines: 374-375
- packages/integrations/src/webhooks/site/http.memory.ts | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- packages/integrations/src/webhooks/site/repo.memory.ts | lines 99.3 br 96.3 fn 100.0 | uncovered lines: 92
- packages/integrations/src/webhooks/site/seal-aad-invariant.node.ts | lines 97.87 br 84.62 fn 100.0 | uncovered lines: 15
- packages/integrations/src/webhooks/site/signing.keyring.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3,29-31
- packages/integrations/src/webhooks/site/subscriptions.ts | lines 73.91 br 75.0 fn 50.0 | uncovered lines: 114-115,119-120,124-125
- packages/integrations/src/webhooks/sql/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1
- packages/integrations/src/webhooks/sql/webhook-repo.ts | lines 97.07 br 90.0 fn 96.43 | uncovered lines: 134,428-435
- packages/integrations/src/webhooks/tools/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,4-5
- packages/integrations/src/webhooks/tools/tool-handlers.ts | lines 98.47 br 98.15 fn 100.0 | uncovered lines: 187-188
- packages/integrations/src/webhooks/tools/tool-views.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
