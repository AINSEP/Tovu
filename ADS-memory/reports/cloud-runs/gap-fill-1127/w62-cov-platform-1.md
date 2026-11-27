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

REPO: Jini only. HEAD = codex/w62-cov-platform-1 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.

## FILES (path | coverage now | uncovered source lines)
- packages/platform/src/asset-cache.ts | lines 99.14 br 98.37 fn 100.0 | uncovered lines: 70-71
- packages/platform/src/download-lock.ts | lines 100.0 br 97.5 fn 100.0 | uncovered lines: 
- packages/platform/src/fetch-with-timeout.ts | lines 100.0 br 98.04 fn 95.83 | uncovered lines: 
- packages/platform/src/fs/backup-once.ts | lines 14.29 br 100.0 fn 0.0 | uncovered lines: 7-12
- packages/platform/src/fs/boot-identity.ts | lines 100.0 br 92.68 fn 100.0 | uncovered lines: 
- packages/platform/src/fs/directory-running-lock.ts | lines 100.0 br 98.8 fn 100.0 | uncovered lines: 
- packages/platform/src/fs/directory-user-config.ts | lines 100.0 br 100.0 fn 97.62 | uncovered lines: 
- packages/platform/src/fs/errno.ts | lines 100.0 br 92.31 fn 100.0 | uncovered lines: 
- packages/platform/src/fs/guarded-reader.ts | lines 100.0 br 98.41 fn 100.0 | uncovered lines: 
- packages/platform/src/fs/owned-temp-root.ts | lines 96.69 br 86.57 fn 100.0 | uncovered lines: 163,165-167
- packages/platform/src/fs/reviewed-file.ts | lines 97.96 br 79.41 fn 83.33 | uncovered lines: 54
- packages/platform/src/fs/staged-file.ts | lines 4.76 br 100.0 fn 0.0 | uncovered lines: 12-24,26,29-50,52,54-71,74-78
- packages/platform/src/fs/workspace-directory.ts | lines 100.0 br 93.02 fn 100.0 | uncovered lines: 
- packages/platform/src/mail/delivery-wrapper.ts | lines 100.0 br 98.28 fn 100.0 | uncovered lines: 
- packages/platform/src/mail/email-template-operations.ts | lines 68.42 br 90.62 fn 65.0 | uncovered lines: 144-150,152-158,223-224,258-260,263-266,268-272,280-291,294-295,303-308
- packages/platform/src/mail/email-template-tool-registrations.ts | lines 64.15 br 100.0 fn 37.5 | uncovered lines: 60-63,65-68,70-74,81-84,95-96
- packages/platform/src/mail/email-template.ts | lines 100.0 br 97.89 fn 100.0 | uncovered lines: 
- packages/platform/src/mail/plugin-abi.ts | lines 89.47 br 100.0 fn 88.89 | uncovered lines: 6-7
- packages/platform/src/mail/provider-mailer.ts | lines 12.0 br 100.0 fn 0.0 | uncovered lines: 10-20,22-32
- packages/platform/src/mail/provider-setup.ts | lines 97.7 br 73.85 fn 100.0 | uncovered lines: 128-129
- packages/platform/src/mail/purpose-gate-probe.ts | lines 33.33 br 100.0 fn 0.0 | uncovered lines: 22-25
- packages/platform/src/mail/resolve-mailer.ts | lines 100.0 br 99.53 fn 100.0 | uncovered lines: 
- packages/platform/src/mail/sql/activity.repo.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 21,25,32-35,38-40,43-50,52-53,58-68,71-76,79-81,84-85,89-90,93,95,98-99,101-102,106-107,109-115,126-148
- packages/platform/src/mail/sql/attempts.repo.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-6,16-29,31,35-37
- packages/platform/src/mail/sql/capture.repo.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-3,7-8,10,47-48,50,56-57,69-103,105-109,111-112,114-122,128-134,137-139,148,150-166
- packages/platform/src/mail/sql/feedback-inbox.repo.ts | lines 42.11 br 50.0 fn 33.33 | uncovered lines: 18,20-25,27-28,30-31
- packages/platform/src/mail/sql/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3-11
- packages/platform/src/mail/sql/ledger.repo.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 2-3,31-33,35-40,51-54,56-63,67-72,74-75,77-85
- packages/platform/src/mail/sql/retention.ts | lines 100.0 br 89.47 fn 100.0 | uncovered lines: 
- packages/platform/src/mail/sql/suppression-admin.repo.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 10-11,18-23,25-32,38-55,58-78
- packages/platform/src/mail/sql/suppression.repo.ts | lines 60.87 br 50.0 fn 25.0 | uncovered lines: 26-30,32-35
- packages/platform/src/mail/test-send.ts | lines 93.57 br 84.88 fn 100.0 | uncovered lines: 154-156,180-183,198-199
- packages/platform/src/mail/use-readiness.ts | lines 93.68 br 76.92 fn 100.0 | uncovered lines: 111-112,162-163,166-167
- packages/platform/src/messages.ts | lines 100.0 br 100.0 fn 91.67 | uncovered lines: 
- packages/platform/src/net/local-http-probe.ts | lines 100.0 br 93.75 fn 100.0 | uncovered lines: 
- packages/platform/src/net/local-http-request.ts | lines 100.0 br 63.64 fn 100.0 | uncovered lines: 
- packages/platform/src/object-store/descriptors.ts | lines 100.0 br 88.89 fn 100.0 | uncovered lines: 
- packages/platform/src/object-store/local-fs.ts | lines 77.68 br 100.0 fn 92.31 | uncovered lines: 95-119
- packages/platform/src/object-store/site/artifact-provider.ts | lines 95.45 br 70.0 fn 100.0 | uncovered lines: 46
- packages/platform/src/process-probes.ts | lines 100.0 br 98.99 fn 100.0 | uncovered lines: 
- packages/platform/src/process-top-footprint.ts | lines 100.0 br 95.24 fn 100.0 | uncovered lines: 
- packages/platform/src/process.ts | lines 99.1 br 97.12 fn 100.0 | uncovered lines: 299-300
- packages/platform/src/retention/index.ts | lines 0.0 br 100.0 fn 100.0 | uncovered lines: 3,17,28
- packages/platform/src/retention/measure-tree.ts | lines 97.63 br 90.8 fn 100.0 | uncovered lines: 101-103,213
- packages/platform/src/retention/preview-store.ts | lines 100.0 br 91.67 fn 100.0 | uncovered lines: 
- packages/platform/src/retention/routes.ts | lines 95.45 br 75.0 fn 80.0 | uncovered lines: 9
- packages/platform/src/secrets/credential-sets/vault-archive.ts | lines 100.0 br 82.61 fn 100.0 | uncovered lines: 
- packages/platform/src/secrets/legacy-codecs.ts | lines 100.0 br 98.39 fn 100.0 | uncovered lines: 
- packages/platform/src/secrets/legacy-owner.ts | lines 97.16 br 95.15 fn 90.91 | uncovered lines: 180-181,206-207
- packages/platform/src/secrets/root-key/ensure.ts | lines 93.06 br 82.26 fn 79.49 | uncovered lines: 175-176,234-236,327-328,423-425
- packages/platform/src/secrets/root-key/files.ts | lines 66.67 br 58.33 fn 85.71 | uncovered lines: 18-40,87,149-150,173-176
- packages/platform/src/secrets/root-key/material.ts | lines 81.25 br 82.76 fn 80.0 | uncovered lines: 68-73,90-91,160-163
- packages/platform/src/secrets/root-key/ordered-keyring.ts | lines 76.25 br 94.29 fn 86.96 | uncovered lines: 30-31,37-38,44-58
- packages/platform/src/secrets/root-key/reconcile.ts | lines 97.25 br 95.74 fn 80.0 | uncovered lines: 98-100
- packages/platform/src/secrets/root-key/site-keyring-errors.ts | lines 100.0 br 61.54 fn 100.0 | uncovered lines: 
- packages/platform/src/secrets/root-key/sources.ts | lines 95.45 br 83.78 fn 84.21 | uncovered lines: 53-55
- packages/platform/src/web/strip-html-presentation.ts | lines 100.0 br 96.0 fn 100.0 | uncovered lines: 
- packages/platform/src/web/tool-registrations.ts | lines 93.94 br 87.5 fn 100.0 | uncovered lines: 47-48
