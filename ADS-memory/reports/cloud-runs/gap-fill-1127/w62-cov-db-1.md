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

REPO: Jini only. HEAD = codex/w62-cov-db-1 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/db/src/data-modules/data-module.ts | lines 52.82 br 66.67 fn 64.29 | uncovered lines: 333-336,338-339,363-370,375-378,400-401,423-428,477-480,488-492,494,496-501,504,506-509,516,518-522,524-525,535,537-542,544-545,555-561,564-565,573-587,590-595,612-626,648-649,651-…
- packages/db/src/data-modules/disk-headroom.ts | lines 19.23 br 100.0 fn 0.0 | uncovered lines: 28-30,33-35,43-45,47-49,51-57,59-60
- packages/db/src/data-modules/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 9,11-17
- packages/db/src/data-modules/migration-journal.ts | lines 7.41 br 100.0 fn 0.0 | uncovered lines: 34-38,40-55,58-74,91-99,102-109,112-121,131-140
- packages/db/src/data-modules/migration-recovery.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 15-18,25,45,48-52,54-60,63-66,69-72
- packages/db/src/data-modules/plugin-identity.ts | lines 78.75 br 58.33 fn 80.0 | uncovered lines: 69-70,92-95,117-119,121-128
- packages/db/src/data-modules/restore.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 31,33-43
- packages/db/src/data-modules/snapshot.ts | lines 41.18 br 50.0 fn 33.33 | uncovered lines: 45-46,61-66,68-73,102-107
- packages/db/src/events/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2
- packages/db/src/events/outbox-repo.sql.ts | lines 100.0 br 97.06 fn 100.0 | uncovered lines: 
- packages/db/src/events/repo.rows.ts | lines 100.0 br 82.05 fn 100.0 | uncovered lines: 
- packages/db/src/gated-mutations/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1
- packages/db/src/gated-mutations/repo.sql.ts | lines 100.0 br 96.15 fn 100.0 | uncovered lines: 
- packages/db/src/kernel/kernel-core.ts | lines 100.0 br 96.97 fn 100.0 | uncovered lines: 
- packages/db/src/kernel/session-lock.ts | lines 100.0 br 81.25 fn 80.0 | uncovered lines: 
- packages/db/src/kernel/sqlite/sqlite-only.ts | lines 2.33 br 100.0 fn 0.0 | uncovered lines: 49-53,59-64,72-77,85-95,103-116
- packages/db/src/migrate/legacy-ledger.ts | lines 100.0 br 88.57 fn 100.0 | uncovered lines: 
- packages/db/src/migrate/runner.ts | lines 97.91 br 97.1 fn 100.0 | uncovered lines: 280-283
- packages/db/src/owner-store/index.ts | lines 100.0 br 93.33 fn 100.0 | uncovered lines: 
- packages/db/src/react/recovery/Recovery.restore-steps.tsx | lines 90.32 br 68.97 fn 88.89 | uncovered lines: 50-52,157-169,171,200
- packages/db/src/react/recovery/Recovery.tsx | lines 48.0 br 29.41 fn 66.67 | uncovered lines: 207,209,211-213,219-222,224-226,228-232,234-236,241,248-249,253-265,267-279,281-283,288-289,291-292,294-296,298,307,316-326,328-332,334
- packages/db/src/recovery/journal-repo.sql.ts | lines 25.0 br 83.33 fn 30.0 | uncovered lines: 40-42,55-56,74-94,96-103,105-108,113-137,153-168,203-210,248-262,281-282,297-320,322-324,329,331-337,339-343,347-357,370-373,377-391
- packages/db/src/recovery/tool-registrations.ts | lines 84.09 br 78.72 fn 88.24 | uncovered lines: 169-171,173-180,183-185,187-188,200-204,266-267,270-271,276-282,314,325-326
- packages/db/src/secrets-vault/repo.sql.ts | lines 100.0 br 99.25 fn 100.0 | uncovered lines: 
- packages/db/src/settings/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1
- packages/db/src/settings/repo.rows.ts | lines 97.96 br 84.0 fn 100.0 | uncovered lines: 106-107
- packages/db/src/settings/repo.sql.ts | lines 99.58 br 92.5 fn 100.0 | uncovered lines: 98
- packages/db/src/site/repo.memory.ts | lines 37.61 br 55.56 fn 17.39 | uncovered lines: 18,25-27,30-31,41-50,59-68,70-72,74-75,96,108-110,113-115,118-126,129-131,144-145,148-149,185-186,189-191,197-198,207-208,211-213,216-217
- packages/db/src/site/tool-registrations.ts | lines 50.71 br 85.71 fn 17.65 | uncovered lines: 142-143,148-156,158-164,168-176,186-200,203-227,276-277
- packages/db/src/sqlite/checked-client.ts | lines 100.0 br 98.11 fn 100.0 | uncovered lines: 
- packages/db/src/sqlite/compaction-steps.ts | lines 91.11 br 57.89 fn 100.0 | uncovered lines: 28-30,51
- packages/db/src/sqlite/compaction.ts | lines 98.81 br 94.79 fn 100.0 | uncovered lines: 135-136
- packages/db/src/sqlite/db-ops.ts | lines 95.89 br 90.91 fn 100.0 | uncovered lines: 144-145,147
- packages/db/src/sqlite/stopped.ts | lines 29.73 br 100.0 fn 33.33 | uncovered lines: 40-41,43-53,65-77
- packages/db/src/sqlite/transaction.ts | lines 100.0 br 95.45 fn 100.0 | uncovered lines: 
- packages/db/src/transfer/confirmation-ui.ts | lines 100.0 br 90.0 fn 100.0 | uncovered lines: 
- packages/db/src/transfer/copy-order.ts | lines 100.0 br 89.66 fn 100.0 | uncovered lines: 
- packages/db/src/transfer/destination-store.ts | lines 67.27 br 53.33 fn 57.14 | uncovered lines: 30-31,60-61,66-73,77-81,96
- packages/db/src/transfer/schema-catalog.ts | lines 100.0 br 97.3 fn 100.0 | uncovered lines: 
- packages/db/src/verified-origin/index.ts | lines 0.0 br 0.0 fn 0.0 | uncovered lines: 1-2
