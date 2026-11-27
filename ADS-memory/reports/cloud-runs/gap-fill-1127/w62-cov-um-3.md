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

REPO: Jini only. HEAD = codex/w62-cov-um-3 = origin/integ/merge-28-2026-11-26.
NOTE: a Codex Cloud task already added packages/user-management/src/members/__tests__/consent-service.test.ts and 4 tests to packages/integrations/src/credentialed-http/sets/__tests__/extract-s8-sets.unit.test.ts on branch codex/ccx-um / codex/ccx-int; do not duplicate those.

## FILES (path | coverage now | uncovered source lines)
- packages/user-management/src/newsletter/send-pipeline.ts | lines 28.23 br 53.57 fn 41.67 | uncovered lines: 95,98-102,105-108,110-113,115-120,122-124,126,128-134,136-145,147-169,177,180-183,185-191,193-196,200-206,208-209,211-212,222-223,283-284,289-290,321-325,334,337-349,351-354,356-35
- packages/user-management/src/newsletter/subscriptions.ts | lines 18.63 br 83.33 fn 20.0 | uncovered lines: 37-48,51,54-55,57,59-62,64-83,85-88,90-91,117-118,138,141-149,154,156-157,159-171,173-174,176-182
- packages/user-management/src/newsletter/tool-registrations.deps.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- packages/user-management/src/newsletter/tool-registrations.read.ts | lines 23.39 br 100.0 fn 11.11 | uncovered lines: 43-44,48-57,61-72,75-77,79-87,90-92,94-99,102-104,106-110,113-116,118-124,127-130,132-140,142-159
- packages/user-management/src/newsletter/tool-registrations.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2,15,17,23-25,30,34,36-37,39,89,91-92,94,96,98,100-101,103,105,107,109,111,113,115-116,139-154,156-172,174,177-180,183-186,196-198
- packages/user-management/src/newsletter/tool-registrations.write.ts | lines 29.08 br 61.54 fn 15.38 | uncovered lines: 50-51,56-61,63-68,70-81,84-87,90-92,94-100,102-115,149-151,153-161,164-166,168-172,175-177,179-187,190-192,194-199,202-205,207-216,219-223,225-229,231-237,240-242,244-253
- packages/user-management/src/project-keys/attached-vault.ts | lines 58.62 br 69.23 fn 62.5 | uncovered lines: 14-18,36-37,39-41,47-48,57-59,62-63,65-71
- packages/user-management/src/project-keys/create-vault.ts | lines 68.42 br 60.0 fn 75.0 | uncovered lines: 16,19-23
- packages/user-management/src/project-keys/service.ts | lines 55.88 br 39.13 fn 38.89 | uncovered lines: 13,46,48-59,61-64,66-71,81-84,98,130-134,136-140,151-156
- packages/user-management/src/project-keys/site-references.ts | lines 63.46 br 75.0 fn 60.0 | uncovered lines: 20-23,25-30,55-59,61-64
- packages/user-management/src/project-keys/site-sealer.ts | lines 97.56 br 79.17 fn 90.0 | uncovered lines: 59
- packages/user-management/src/project-keys/sql/attachments.ts | lines 86.05 br 73.91 fn 60.0 | uncovered lines: 64-66,68-70
- packages/user-management/src/project-keys/tools.ts | lines 62.5 br 83.33 fn 36.36 | uncovered lines: 46-48,52-55,63-64,69-72,75-82
- packages/user-management/src/public-http/routes/mail/feedback.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/user-management/src/react/auth/Passkeys.hooks.ts | lines 100.0 br 81.82 fn 100.0 | uncovered lines: 
- packages/user-management/src/react/auth/Passkeys.tsx | lines 100.0 br 95.65 fn 100.0 | uncovered lines: 
- packages/user-management/src/react/auth/TotpSettings.hooks.ts | lines 92.68 br 66.67 fn 100.0 | uncovered lines: 32,39,45
- packages/user-management/src/react/auth/TotpSettings.tsx | lines 100.0 br 96.55 fn 100.0 | uncovered lines: 
- packages/user-management/src/react/auth/hooks/use-login.hooks.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- packages/user-management/src/react/mail/Email.tsx | lines 91.08 br 80.0 fn 82.35 | uncovered lines: 83-89,91,122-126,128
- packages/user-management/src/react/mail/EmailProviderTab.tsx | lines 83.57 br 51.32 fn 68.0 | uncovered lines: 31-47,49-50,52,55-57,86,129-130,201-203,268-273
- packages/user-management/src/react/mail/EmailTemplateEditor.tsx | lines 84.65 br 61.7 fn 46.15 | uncovered lines: 84,137,176,215,240-246,249-252,255-258,288-294,339-347
- packages/user-management/src/react/members/api/members-api.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 13-29
- packages/user-management/src/react/roles/api/roles-api.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 13-17,19-21,24-29,31-33,35-40,42-48
- packages/user-management/src/react/users/UsersDialogs.tsx | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3-5,7,18-30,32-37,39,52-67,69-74,76,106-118,121-130,132,151-157,159,161-178,180,182,185-197,203-205,210-215,217,219-230
- packages/user-management/src/react/users/UsersTable.tsx | lines 3.53 br 100.0 fn 0.0 | uncovered lines: 72-83,85-97,99-102,104,119-151,153,193-204,209-219,221,243-250,252,259-260,263,265-277,279,281-291,293-308,310-327,329-332,334
- packages/user-management/src/react/users/api/users-api.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 13-18,20-23,25-37,41-47,49-55,57-63,65-70
- packages/user-management/src/react/users/hooks/use-localized-users.hooks.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- packages/user-management/src/server/auth-service.ts | lines 98.29 br 98.25 fn 100.0 | uncovered lines: 147-148
- packages/user-management/src/server/link-policy.ts | lines 100.0 br 96.15 fn 100.0 | uncovered lines: 
- packages/user-management/src/server/login-providers.ts | lines 100.0 br 82.5 fn 100.0 | uncovered lines: 
- packages/user-management/src/server/mfa/passkey-adapter.ts | lines 10.34 br 100.0 fn 0.0 | uncovered lines: 10-35
- packages/user-management/src/server/mfa/passkey-service.ts | lines 99.09 br 91.25 fn 100.0 | uncovered lines: 63
- packages/user-management/src/server/mfa/service.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/user-management/src/server/owner-reset-input.ts | lines 100.0 br 90.91 fn 80.0 | uncovered lines: 
- packages/user-management/src/server/recovery-codes.ts | lines 91.43 br 90.7 fn 100.0 | uncovered lines: 37-38,66-67,99-100
- packages/user-management/src/server/repo.memory.ts | lines 99.49 br 98.1 fn 98.11 | uncovered lines: 80
- packages/user-management/src/server/sql/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1,3-5
