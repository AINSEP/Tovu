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

REPO: Jini only. HEAD = codex/w62-cov-devops-2 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/devops/src/deploy/react/StaticExportCard.tsx | lines 56.86 br 37.5 fn 54.55 | uncovered lines: 73-100,102,108-135,137,145-148,150,152-156,158,182-188,190-191,274,276-282,284-285
- packages/devops/src/deploy/react/StaticPublishCredentials.tsx | lines 7.32 br 100.0 fn 0.0 | uncovered lines: 15-19,23-32,34-35,37,39-41,43-44,46-50,97-103,105-106,108
- packages/devops/src/deploy/react/StaticPublishForm.tsx | lines 2.55 br 100.0 fn 0.0 | uncovered lines: 9-13,21-22,26-43,45-46,48,57-61,65-73,75-83,85,98-106,118-127,129-137,139,142-146,153-155,161,163-165,167-170,172-182,184,189-194,196-214,216,218-221,229,231-239,241,243-266,268,27…
- packages/devops/src/deploy/react/StaticSiteTab.tsx | lines 54.8 br 66.67 fn 44.44 | uncovered lines: 239-241,277,300-314,316-326,328-329,331-337,339,341-351,353-356,358,379-391,393-395,397,414-416,419-422
- packages/devops/src/deploy/react/deployment-visuals.tsx | lines 43.48 br 100.0 fn 33.33 | uncovered lines: 30-36,38,64-68,70,74-78,80,93-94,96,117-118,120,133-140,142,155-158
- packages/devops/src/deploy/react/hooks/publish-credential-draft.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/devops/src/deploy/react/hooks/publish-credential-selection.ts | lines 92.59 br 50.0 fn 100.0 | uncovered lines: 22,37
- packages/devops/src/deploy/react/hooks/publish-credential-writes.ts | lines 73.24 br 51.52 fn 66.67 | uncovered lines: 20-25,67,69-70,73-76,109-114
- packages/devops/src/deploy/react/hooks/static-publish-actions.ts | lines 90.48 br 75.0 fn 100.0 | uncovered lines: 48-51
- packages/devops/src/deploy/react/hooks/static-publish-form.hooks.ts | lines 89.06 br 61.54 fn 75.0 | uncovered lines: 55-57,95-98
- packages/devops/src/deploy/react/hooks/static-publish-run.hooks.ts | lines 90.48 br 76.47 fn 80.0 | uncovered lines: 37-38,80-83
- packages/devops/src/deploy/react/hooks/use-dockerfile-source.hooks.ts | lines 89.32 br 64.0 fn 90.0 | uncovered lines: 139,150-155,157-158,247,261
- packages/devops/src/deploy/react/hooks/use-publish-credentials.hooks.ts | lines 100.0 br 80.0 fn 80.0 | uncovered lines: 
- packages/devops/src/deploy/react/hooks/use-static-export.hooks.ts | lines 85.84 br 70.83 fn 80.0 | uncovered lines: 187-189,194-198,224-225,235-238,240,247
- packages/devops/src/deploy/react/hooks/use-static-publish.hooks.ts | lines 100.0 br 100.0 fn 80.0 | uncovered lines: 
- packages/devops/src/deploy/react/rules.ts | lines 71.75 br 58.7 fn 51.61 | uncovered lines: 213-214,220-221,227-228,234-239,245-247,255-262,268-269,275-276,301-302,314-315,324-327,344-345,352-353,357-358,362-363,375,386,395-399
- packages/devops/src/deploy/site-update/desktop-site-update.ts | lines 100.0 br 91.67 fn 100.0 | uncovered lines: 
- packages/devops/src/deploy/site-update/self-hosted-site-update.ts | lines 100.0 br 96.0 fn 100.0 | uncovered lines: 
- packages/devops/src/deploy/site/agent-tools.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 38-43,49-65,77-93,101-142
- packages/devops/src/deploy/site/deploy-ops/agent-tools.ts | lines 100.0 br 55.56 fn 100.0 | uncovered lines: 
- packages/devops/src/deploy/site/deploy-ops/registry.ts | lines 52.94 br 75.0 fn 40.0 | uncovered lines: 24,27-32,36,39-48,55-65,108-110
- packages/devops/src/deploy/site/deploy-ops/run-ops.ts | lines 100.0 br 50.0 fn 100.0 | uncovered lines: 
- packages/devops/src/deploy/site/deploy-ops/secret-confirm.ts | lines 95.65 br 54.55 fn 83.33 | uncovered lines: 32
- packages/devops/src/deploy/site/deploy-targets/host-kit.ts | lines 61.33 br 63.64 fn 33.33 | uncovered lines: 50-51,55-58,61-68,70-80,87,122-124
- packages/devops/src/deploy/site/deploy-targets/registry.ts | lines 92.42 br 92.31 fn 53.85 | uncovered lines: 99,102-105
- packages/devops/src/deploy/site/dockerfile.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-3,60-62,67,72-74,82-87,105-108,161,164-167
- packages/devops/src/deploy/site/export-run.ts | lines 100.0 br 95.83 fn 100.0 | uncovered lines: 
- packages/devops/src/deploy/site/publish-agent-tools.ts | lines 30.0 br 100.0 fn 0.0 | uncovered lines: 50-58,60-61,63,66-77,79,95-100,102,104-110,114-121,129-130
- packages/devops/src/deploy/site/publish-credentials/compatibility-port.ts | lines 80.0 br 100.0 fn 100.0 | uncovered lines: 25-26
- packages/devops/src/deploy/site/publish-credentials/store-owner.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 5-9
- packages/devops/src/deploy/site/publish-credentials/store-resolution.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,6,9-13,24-30,37,40-47,49,53-62,64,67-71,74,76,78-81,83,85-87,89-93,98-109,114-120
- packages/devops/src/deploy/site/publish-credentials/store-validation.ts | lines 9.91 br 100.0 fn 0.0 | uncovered lines: 12-14,21-26,31-39,50-55,57-59,61-62,65-67,74-79,97-104,107-111,113-121,125-131,133-134,138-140,142,144-150,156-162,164,166-169,172-174,176,178-181
- packages/devops/src/deploy/site/publish-credentials/store.ts | lines 32.52 br 54.55 fn 33.33 | uncovered lines: 38-45,49,51-57,60-63,88-94,101,103-110,160-164,172-173,203-204,222-230,235-237,240-242,271-277,282-286,291-295,301-307,309,312-315,317,319,322-327,329-335,337-339,370-371,377-392,4…
- packages/devops/src/deploy/site/publish-tool-capabilities.ts | lines 81.9 br 53.33 fn 100.0 | uncovered lines: 41-51,167-170,215,223,225-226
- packages/devops/src/deploy/site/publish-tool-credential.ts | lines 46.84 br 48.65 fn 50.0 | uncovered lines: 40-42,78-80,91,93-95,98,100-107,124,127-133,135-143,145,147-150,152-154,160,162,165-178,185,188-190,194-209,211,214,217-221,277-278,282-290,295-297
- packages/devops/src/deploy/site/publish-tool-deps.ts | lines 8.33 br 100.0 fn 0.0 | uncovered lines: 151-161
- packages/devops/src/deploy/site/publish-tool-execution.ts | lines 10.34 br 66.67 fn 13.33 | uncovered lines: 35-36,41-47,53-57,64-70,79-85,94-96,118,127-145,163-164,170-180,203,211-247,249-258,261-263,265-269,271,273-275,278,280-287,289,293-316,320,323-328,330,332-341,343-353,357-367,369,…
