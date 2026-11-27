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

REPO: Jini only. HEAD = codex/w62-cov-mcp-1 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/mcp/src/agent-install/install.ts | lines 100.0 br 93.59 fn 100.0 | uncovered lines: 
- packages/mcp/src/agent-install/owned-json-install.ts | lines 100.0 br 92.86 fn 100.0 | uncovered lines: 
- packages/mcp/src/client/client.ts | lines 98.44 br 98.95 fn 100.0 | uncovered lines: 271-273
- packages/mcp/src/client/css-url-refs.ts | lines 100.0 br 73.33 fn 100.0 | uncovered lines: 
- packages/mcp/src/external/access-review.ts | lines 55.81 br 40.0 fn 43.75 | uncovered lines: 16-19,64,71,73-77,83-91,96,99-101,104-106,110,112-114,125-127,132,134-139,143-148,182-191
- packages/mcp/src/external/operations-tools.ts | lines 88.06 br 78.57 fn 85.71 | uncovered lines: 100,103-109
- packages/mcp/src/external/save-form.ts | lines 100.0 br 97.4 fn 100.0 | uncovered lines: 
- packages/mcp/src/external/save-input.ts | lines 35.71 br 50.0 fn 16.67 | uncovered lines: 23-26,56-68,89-91,95-99,120-129,132-133,135-148,151-162
- packages/mcp/src/external/tool-registrations.ts | lines 17.43 br 100.0 fn 13.33 | uncovered lines: 75-76,79-80,83-101,105-113,116-117,121-138,141-150,152-157,165,168-170,172-199,209-212,214-220,223-233,257-262,264-268,270-273,280-283,285-288,290-292,309-313,315-317,319-324,326-3…
- packages/mcp/src/federation/adapter.http.ts | lines 100.0 br 99.28 fn 100.0 | uncovered lines: 
- packages/mcp/src/federation/bootstrap.ts | lines 100.0 br 98.39 fn 100.0 | uncovered lines: 
- packages/mcp/src/federation/external-mcp-probe.ts | lines 98.08 br 94.74 fn 100.0 | uncovered lines: 53
- packages/mcp/src/federation/frozen-grants.ts | lines 100.0 br 96.67 fn 100.0 | uncovered lines: 
- packages/mcp/src/federation/hosted/access.ts | lines 100.0 br 96.0 fn 100.0 | uncovered lines: 
- packages/mcp/src/federation/hosted/connection-gate.ts | lines 9.09 br 100.0 fn 0.0 | uncovered lines: 70-80,83-85,91-95,101-108,116-123,130-134
- packages/mcp/src/federation/hosted/external-mcp-repo.ts | lines 68.72 br 67.86 fn 64.71 | uncovered lines: 78-81,84-88,91-100,181,183-191,193-196,199-200,237-248,280-288
- packages/mcp/src/federation/hosted/external-mcp-repo.writes.ts | lines 88.99 br 61.29 fn 90.0 | uncovered lines: 78-79,90-97,141-142
- packages/mcp/src/federation/hosted/pinned-capability.ts | lines 100.0 br 94.87 fn 100.0 | uncovered lines: 
- packages/mcp/src/federation/hosted/probe.ts | lines 100.0 br 92.31 fn 100.0 | uncovered lines: 
- packages/mcp/src/federation/hosted/revocation.ts | lines 56.1 br 100.0 fn 50.0 | uncovered lines: 76-78,85-92,109-115
- packages/mcp/src/federation/hosted/store-config.ts | lines 88.61 br 68.0 fn 100.0 | uncovered lines: 39-40,43-49,98,133-134,236-238,242-244
- packages/mcp/src/federation/hosted/store-credentials.ts | lines 86.05 br 81.93 fn 100.0 | uncovered lines: 27-28,49-50,88-89,131-134,189-190,240-244,246-250,277-278
- packages/mcp/src/federation/hosted/store-input.ts | lines 76.82 br 59.65 fn 100.0 | uncovered lines: 43-47,51-55,77-78,132-133,149-150,153-154,166-167,172-176,193-194,201-202,223-224,229-230,234-235
- packages/mcp/src/federation/hosted/store-oauth-fields.ts | lines 75.62 br 78.46 fn 100.0 | uncovered lines: 25-26,116-117,124-125,144-145,147-148,196-200,202-206,242-254,260-261,291-294
- packages/mcp/src/federation/hosted/store-view.ts | lines 100.0 br 92.0 fn 100.0 | uncovered lines: 
- packages/mcp/src/federation/hosted/store.memory.ts | lines 80.27 br 96.43 fn 84.21 | uncovered lines: 177-181,183-190,197-201,204-208,211-216
- packages/mcp/src/federation/hosted/store.save.ts | lines 85.71 br 80.0 fn 83.33 | uncovered lines: 21-22,34-36,76
- packages/mcp/src/federation/hosted/store.ts | lines 92.41 br 94.44 fn 88.89 | uncovered lines: 131-135,265-270
- packages/mcp/src/federation/hosted/vault.ts | lines 97.18 br 82.26 fn 87.5 | uncovered lines: 247-250
- packages/mcp/src/federation/runtime.ts | lines 100.0 br 95.65 fn 95.0 | uncovered lines: 
- packages/mcp/src/federation/stdio/smoke.ts | lines 100.0 br 96.49 fn 100.0 | uncovered lines: 
- packages/mcp/src/react/external-mcp/ExternalMcpAdmissionsBanner.tsx | lines 75.79 br 64.0 fn 100.0 | uncovered lines: 113-119,150-155,177-180,182,185-188,190
- packages/mcp/src/react/external-mcp/ExternalMcpPanelSections.tsx | lines 61.64 br 30.0 fn 60.0 | uncovered lines: 26-33,69-71,73-85,87,121-123
- packages/mcp/src/react/external-mcp/ExternalMcpSettingsPanel.hooks.tsx | lines 69.74 br 100.0 fn 75.0 | uncovered lines: 39,44-59,62-67
- packages/mcp/src/react/external-mcp/ExternalMcpSettingsPanel.tsx | lines 90.11 br 83.33 fn 50.0 | uncovered lines: 226-228,233-235,265-267
- packages/mcp/src/react/external-mcp/ExternalMcpSourceRow.tsx | lines 64.73 br 50.0 fn 40.0 | uncovered lines: 30-31,53,56-58,61-79,81,87-97,99-100,102,105-107,116-123,125,175,189-195,264-267,269,272-278,280
- packages/mcp/src/react/external-mcp/hooks/external-mcp-form.rules.ts | lines 84.31 br 54.17 fn 91.67 | uncovered lines: 109-111,128,172-183
- packages/mcp/src/react/external-mcp/hooks/external-mcp-source-actions.ts | lines 30.34 br 60.0 fn 50.0 | uncovered lines: 6-13,27-29,32-34,36-55,57-66,95-96,131-146
- packages/mcp/src/react/external-mcp/hooks/use-external-mcp-admissions.hooks.ts | lines 98.36 br 96.36 fn 92.86 | uncovered lines: 287,361
- packages/mcp/src/react/external-mcp/hooks/use-external-mcp.hooks.ts | lines 86.21 br 100.0 fn 42.86 | uncovered lines: 84-87
- packages/mcp/src/server/adapters/stdio-codec.ts | lines 84.62 br 85.71 fn 100.0 | uncovered lines: 12-13
- packages/mcp/src/server/http-tool-server.adapter.ts | lines 98.11 br 83.67 fn 95.45 | uncovered lines: 48,173-175
- packages/mcp/src/server/loopback-fetch.ts | lines 100.0 br 81.25 fn 100.0 | uncovered lines: 
- packages/mcp/src/server/run-tool-host.ts | lines 100.0 br 93.1 fn 100.0 | uncovered lines: 
- packages/mcp/src/server/stdio-hosting.ts | lines 100.0 br 95.88 fn 100.0 | uncovered lines: 
- packages/mcp/src/server/tool-arguments.ts | lines 100.0 br 98.45 fn 100.0 | uncovered lines: 
- packages/mcp/src/server/tool-protocol.ts | lines 100.0 br 98.9 fn 100.0 | uncovered lines: 
- packages/mcp/src/server/tool-server.ts | lines 98.65 br 97.4 fn 100.0 | uncovered lines: 338-340
- packages/mcp/src/server/tools/delegated-tool.ts | lines 100.0 br 98.15 fn 100.0 | uncovered lines: 
- packages/mcp/src/tools/ask-choice/custom-answer.ts | lines 100.0 br 96.15 fn 100.0 | uncovered lines: 
