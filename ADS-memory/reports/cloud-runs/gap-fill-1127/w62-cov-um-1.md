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

REPO: Jini only. HEAD = codex/w62-cov-um-1 = origin/integ/merge-28-2026-11-26.
NOTE: a Codex Cloud task already added packages/user-management/src/members/__tests__/consent-service.test.ts and 4 tests to packages/integrations/src/credentialed-http/sets/__tests__/extract-s8-sets.unit.test.ts on branch codex/ccx-um / codex/ccx-int; do not duplicate those.

## FILES (path | coverage now | uncovered source lines)
- packages/user-management/src/admin-http/auth/auth-request.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/user-management/src/admin-http/auth/current-user.ts | lines 100.0 br 100.0 fn 66.67 | uncovered lines: 
- packages/user-management/src/admin-http/auth/local-boot-session.ts | lines 100.0 br 100.0 fn 50.0 | uncovered lines: 
- packages/user-management/src/admin-http/auth/password-login.ts | lines 100.0 br 94.74 fn 100.0 | uncovered lines: 
- packages/user-management/src/admin-http/auth/password-status.ts | lines 100.0 br 100.0 fn 75.0 | uncovered lines: 
- packages/user-management/src/admin-http/owner/mfa-routes.ts | lines 100.0 br 97.83 fn 100.0 | uncovered lines: 
- packages/user-management/src/admin-http/owner/passkey-admission.ts | lines 100.0 br 94.74 fn 85.71 | uncovered lines: 
- packages/user-management/src/admin-http/owner/passkey-route-deps.ts | lines 92.59 br 81.25 fn 100.0 | uncovered lines: 15-16
- packages/user-management/src/admin-http/owner/passkey-routes.ts | lines 86.57 br 85.71 fn 100.0 | uncovered lines: 41-42,60,78-79,88-91
- packages/user-management/src/admin-http/routes/users/access-shared.ts | lines 100.0 br 97.06 fn 100.0 | uncovered lines: 
- packages/user-management/src/admin-http/routes/users/create.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/user-management/src/admin-http/routes/users/list.ts | lines 100.0 br 94.44 fn 100.0 | uncovered lines: 
- packages/user-management/src/admin-http/routes/users/reset-password.ts | lines 100.0 br 92.86 fn 100.0 | uncovered lines: 
- packages/user-management/src/admin-http/routes/users/shared.ts | lines 100.0 br 95.12 fn 100.0 | uncovered lines: 
- packages/user-management/src/admin-http/routes/users/update.ts | lines 100.0 br 92.0 fn 100.0 | uncovered lines: 
- packages/user-management/src/admin-http/routes/users/write-policy-permission.ts | lines 100.0 br 81.82 fn 100.0 | uncovered lines: 
- packages/user-management/src/admin/adapters/http.ts | lines 100.0 br 98.55 fn 100.0 | uncovered lines: 
- packages/user-management/src/admin/conformance/index.ts | lines 100.0 br 98.36 fn 100.0 | uncovered lines: 
- packages/user-management/src/admin/controllers/auth.controller.ts | lines 100.0 br 93.33 fn 100.0 | uncovered lines: 
- packages/user-management/src/identity/delete-user-service.ts | lines 88.57 br 69.64 fn 94.12 | uncovered lines: 205-210,266-267,290-291,345-346,352-353,366-367,370-373
- packages/user-management/src/identity/owner-reset-env.ts | lines 100.0 br 80.0 fn 100.0 | uncovered lines: 
- packages/user-management/src/identity/permission-list-tool.ts | lines 78.79 br 50.0 fn 66.67 | uncovered lines: 39-40,42-44,50-51
- packages/user-management/src/identity/repo.authentication.ts | lines 72.5 br 70.97 fn 77.78 | uncovered lines: 75-86,117-127,175-185,188-197
- packages/user-management/src/identity/repo.authorization.ts | lines 33.49 br 85.71 fn 29.63 | uncovered lines: 38-40,44-45,47-50,53-63,66-76,79-83,88-98,101-110,113-119,122-132,136-137,139-142,145-155,158-168,171-175,180-190,193-204,207-213,273-279
- packages/user-management/src/identity/repo.ts | lines 19.08 br 60.0 fn 11.76 | uncovered lines: 66-76,80,82-84,87-97,100-104,107-118,121-131,138-139,141-144,149-160,163-173,176-180,183-190,200-210,213-228
- packages/user-management/src/identity/role-manage-permission.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 26,34-42,45-46
- packages/user-management/src/identity/sql/kernel-user-trash-store.ts | lines 100.0 br 83.33 fn 100.0 | uncovered lines: 
- packages/user-management/src/identity/sql/user-trash-adapter.ts | lines 91.3 br 76.32 fn 90.91 | uncovered lines: 151-158
- packages/user-management/src/identity/tool-registrations.ts | lines 58.57 br 63.16 fn 66.67 | uncovered lines: 74-76,94-102,104-115,117-130,142,144-146,169-172,176-177,188-199,201-215,217-219,221-223,239,243-245,317-318
- packages/user-management/src/identity/user-manage-permission.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 6-10
- packages/user-management/src/identity/user-purge-types.ts | lines 66.67 br 100.0 fn 0.0 | uncovered lines: 82-83
- packages/user-management/src/identity/username-change-ports.ts | lines 52.94 br 100.0 fn 25.0 | uncovered lines: 16-19,22-25
- packages/user-management/src/mail/status/agent-tools.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3-21
- packages/user-management/src/mail/status/delivery-agent-tools.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 4-62
- packages/user-management/src/mail/status/delivery-tool-registrations.ts | lines 57.14 br 80.0 fn 25.0 | uncovered lines: 111-116,158-163,169-171,173-175,194-197,199-201,203-207,223-226,237-238
- packages/user-management/src/mail/status/permissions.ts | lines 52.38 br 100.0 fn 0.0 | uncovered lines: 43-50,53-54
- packages/user-management/src/mail/status/provider-agent-tools.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 4-16
- packages/user-management/src/mail/status/provider-operations.ts | lines 58.54 br 31.82 fn 50.0 | uncovered lines: 34-37,117,125-132,154-169,175-179
- packages/user-management/src/mail/status/provider-tool-registrations.ts | lines 16.67 br 100.0 fn 0.0 | uncovered lines: 40-47,50-56,60-63,66-70,77-82,84-86,88-93,103-108,110-119,121-128,132-133
- packages/user-management/src/mail/status/tool-registrations.ts | lines 52.87 br 55.56 fn 35.71 | uncovered lines: 115-118,121-126,129-132,138-145,147-150,153,155-157,174-179,188-189,194,207-208
- packages/user-management/src/member-login/credentials.ts | lines 94.44 br 90.0 fn 100.0 | uncovered lines: 28
- packages/user-management/src/member-login/link-service.ts | lines 14.81 br 100.0 fn 8.33 | uncovered lines: 50-53,55-64,66-69,71-75,77-81,83-84,87,89-91,93,95,98-103,106-109,111,114-126,128,130-137,145,147-160,162-169
- packages/user-management/src/member-login/oidc-login.ts | lines 82.31 br 39.47 fn 88.24 | uncovered lines: 141-142,150,203-204,212-214,235-236,245,247-261
- packages/user-management/src/member-login/oidc-request.ts | lines 77.19 br 62.07 fn 85.71 | uncovered lines: 37-38,40-41,44-47,81-83,86-87
- packages/user-management/src/member-login/providers.ts | lines 100.0 br 100.0 fn 80.0 | uncovered lines: 
- packages/user-management/src/member-login/unlink-identity.ts | lines 100.0 br 77.78 fn 100.0 | uncovered lines: 
- packages/user-management/src/members/access-resolver.ts | lines 96.95 br 94.0 fn 100.0 | uncovered lines: 251-254
- packages/user-management/src/members/capability-card.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 5-30
- packages/user-management/src/members/member-admin-writes.ts | lines 6.4 br 100.0 fn 0.0 | uncovered lines: 17,20-25,27-34,36,38-45,47-48,59,62-67,69-71,73-86,88-89,99,102-107,109-115,117-127,129-141,143-144,153,161-172,174-183,185-186
- packages/user-management/src/members/member-challenge-request.ts | lines 100.0 br 77.55 fn 100.0 | uncovered lines: 
- packages/user-management/src/members/member-challenge.ts | lines 61.9 br 54.55 fn 44.44 | uncovered lines: 34,46-48,70,72-80,82-89,91-92
- packages/user-management/src/members/member-credentials.ts | lines 32.56 br 66.67 fn 33.33 | uncovered lines: 27-33,37-38,40-42,53,55-68,70-71
- packages/user-management/src/members/member-sign-in.ts | lines 11.83 br 100.0 fn 33.33 | uncovered lines: 14,19-24,26-35,40-51,63,66-81,89,91-103,112,115-118,120-123,126-128,130-137,139-140
- packages/user-management/src/members/member-validation.ts | lines 80.0 br 50.0 fn 100.0 | uncovered lines: 11-12
- packages/user-management/src/members/password-auth.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-3,5-8,11-14,23,26-36,38-40,43-49,52-59,69,71-88,91-94,101,104-109,111-116,118-121,128,131-139,145,148-155,157-161,170,173-190
- packages/user-management/src/members/ports.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 318-338
- packages/user-management/src/members/public-member-auth-response.ts | lines 64.52 br 75.0 fn 75.0 | uncovered lines: 13-14,31-33,41-46
- packages/user-management/src/members/repo.memory.ts | lines 58.84 br 89.19 fn 54.9 | uncovered lines: 58-61,63-65,67-69,84-87,91-94,98-105,109-115,119-123,127-130,133-141,181-183,187-190,201-203,237-241,243,246-247,251-258,281-283,313-314,401-402,417-423,457-458,464-471,473,476-477
