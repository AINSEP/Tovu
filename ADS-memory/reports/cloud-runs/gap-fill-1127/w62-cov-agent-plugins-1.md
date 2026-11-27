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

REPO: Jini only. HEAD = codex/w62-cov-agent-plugins-1 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/agent-plugins/cloudflare/lib/forms.mjs | lines 100.0 br 94.95 fn 100.0 | uncovered lines: 
- packages/agent-plugins/cloudflare/lib/target.mjs | lines 100.0 br 98.32 fn 100.0 | uncovered lines: 
- packages/agent-plugins/cloudflare/worker/forms-receiver.mjs | lines 100.0 br 97.69 fn 98.08 | uncovered lines: 
- packages/agent-plugins/fly/scripts/render-deploy-workflow.mjs | lines 95.33 br 96.3 fn 83.33 | uncovered lines: 144-150
- packages/agent-plugins/github-pages/targets/github-pages.mjs | lines 100.0 br 97.89 fn 100.0 | uncovered lines: 
- packages/agent-plugins/github/deploy-ops/github-actions.mjs | lines 100.0 br 97.53 fn 100.0 | uncovered lines: 
- packages/agent-plugins/github/source-control/commit-site.mjs | lines 95.1 br 70.43 fn 94.74 | uncovered lines: 96-97,107-108,115,143-144,205-206,212-213,219-220,339-341,370-371,410-411,466-468
- packages/agent-plugins/github/source-control/write-files.mjs | lines 100.0 br 99.55 fn 100.0 | uncovered lines: 
- packages/agent-plugins/google-workspace/lib/auth.mjs | lines 93.83 br 73.33 fn 75.0 | uncovered lines: 48-49,73-75
- packages/agent-plugins/google-workspace/lib/product-state.mjs | lines 92.47 br 100.0 fn 87.5 | uncovered lines: 57-63
- packages/agent-plugins/google-workspace/ui/destination-panel.mjs | lines 100.0 br 98.92 fn 100.0 | uncovered lines: 
- packages/agent-plugins/meilisearch/providers/meilisearch.mjs | lines 73.73 br 50.0 fn 43.33 | uncovered lines: 113-115,122-124,127-129,132-134,137-142,145-147,174-175,179-182,188-193,206-217,220-225,243-244,247-249,279-284,287-293,300-306,313-324,327-330,365-375,391-394,397-398,414-415,437,…
- packages/agent-plugins/netlify/targets/netlify.mjs | lines 100.0 br 97.56 fn 100.0 | uncovered lines: 
- packages/agent-plugins/railway/deploy-ops/railway.mjs | lines 100.0 br 91.67 fn 96.43 | uncovered lines: 
- packages/agent-plugins/render/deploy-ops/render.mjs | lines 100.0 br 93.18 fn 100.0 | uncovered lines: 
- packages/agent-plugins/s3-compatible/object-stores/s3-compatible.mjs | lines 100.0 br 95.7 fn 100.0 | uncovered lines: 
- packages/agent-plugins/s3-compatible/targets/s3-compatible.mjs | lines 100.0 br 98.12 fn 100.0 | uncovered lines: 
- packages/agent-plugins/scripts/build-cloudflare.mjs | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- packages/agent-plugins/src/admin-surfaces/action-tools.ts | lines 100.0 br 94.74 fn 100.0 | uncovered lines: 
- packages/agent-plugins/src/admin-surfaces/connections/connections.ts | lines 51.08 br 60.0 fn 40.91 | uncovered lines: 45-51,54-56,59-66,96,100-102,107,119-122,132,135-145,168,172-181,183,186-193,195-196,209-212,219-221
- packages/agent-plugins/src/admin-surfaces/connections/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1
- packages/agent-plugins/src/admin-surfaces/plugin-state.ts | lines 7.59 br 100.0 fn 0.0 | uncovered lines: 47-50,53-59,62-65,69-82,92-96,99-102,105-107,111-115,117-119,121,123-131,133-146
- packages/agent-plugins/src/connect/access-token-tool.ts | lines 6.83 br 100.0 fn 0.0 | uncovered lines: 144-151,159-171,181-186,188-195,197-203,209-216,218-221,230-234,236-252,256-261,269-270,273-277,279-292,294-297,300-305,317-332,334-354
- packages/agent-plugins/src/connect/apply-connect-defaults.ts | lines 54.29 br 25.0 fn 57.14 | uncovered lines: 104-105,115,122,133,135-140,142-144,148,150-156,164,168-176
- packages/agent-plugins/src/connect/apply-tool-renames.ts | lines 50.0 br 37.5 fn 33.33 | uncovered lines: 52-60,68-71,75-76,84-103,126-130
- packages/agent-plugins/src/connect/catalog.ts | lines 9.68 br 100.0 fn 0.0 | uncovered lines: 8-28,32-35,44-46
- packages/agent-plugins/src/connect/connect-card-ui.ts | lines 6.67 br 100.0 fn 0.0 | uncovered lines: 32-38,66-68,85-99,119-139,153-162
- packages/agent-plugins/src/connect/connect-destination.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,17-23,30,35-58
- packages/agent-plugins/src/connect/connect-sign-in-wait.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,14,19-29
- packages/agent-plugins/src/connect/connect-tool.ts | lines 5.67 br 50.0 fn 6.25 | uncovered lines: 62-64,75-82,84,86-90,92-93,95-108,120-133,135-139,143-150,156-157,161-183,189-191,193-196,222,224-227,229-236,240-242,244-247,250-256,258-261,263-265,269-283,286,288-296,301,304-33…
- packages/agent-plugins/src/connect/connection-status.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 19,24-31,34-36,39-43,46-49,52,54-58,60,62-68,70,73-80,82,84-88
- packages/agent-plugins/src/connect/credential-cards.ts | lines 100.0 br 80.95 fn 83.33 | uncovered lines: 
- packages/agent-plugins/src/connect/credential-save-tool.ts | lines 76.23 br 51.28 fn 61.54 | uncovered lines: 93-95,105-108,112-115,117-121,123,125-126,128-130,148,151-154,172-173
- packages/agent-plugins/src/connect/enable-access.ts | lines 89.09 br 23.81 fn 100.0 | uncovered lines: 52-53,85-86,88-89
- packages/agent-plugins/src/connect/executable/approval.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 22-24,45-68
- packages/agent-plugins/src/connect/executable/host-capabilities.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 31-32,34-37,40-49,57-58,60-62,66-72,74-75,82-84,91-97,100-104,117-118,122-130,132-133,135-137
- packages/agent-plugins/src/connect/executable/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 6-8
- packages/agent-plugins/src/connect/executable/register.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 16-17,19,21-22,29-35,37-42,45-56,58-61,63-69,71-75,89-100,102-109,111-124,127-142
- packages/agent-plugins/src/connect/federate-mcp.ts | lines 53.72 br 50.0 fn 61.54 | uncovered lines: 239-240,242-246,248-252,258-262,266-267,299,357-358,366,373-376,414-416,421-433,438-442,450,454,458-461,483-487,493-496,505-515,521-523,561-563,585-587,589-590,592-593
- packages/agent-plugins/src/connect/grant-signed-in-defaults.ts | lines 78.46 br 27.78 fn 71.43 | uncovered lines: 78-80,125-128,153,158-163
- packages/agent-plugins/src/connect/host-deps.ts | lines 46.67 br 100.0 fn 20.0 | uncovered lines: 7-11,13-21,41,43
- packages/agent-plugins/src/connect/import-access-token.ts | lines 19.51 br 33.33 fn 16.67 | uncovered lines: 53-54,61-67,70-75,77-80,97-108,131-137,164-169,174-180,183-194,196-198
- packages/agent-plugins/src/connect/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-13,15,17-23,25
- packages/agent-plugins/src/connect/installed-plugin.ts | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
