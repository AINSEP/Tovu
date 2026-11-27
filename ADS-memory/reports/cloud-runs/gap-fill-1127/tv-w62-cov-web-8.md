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

REPO: Tovu only. HEAD = codex/tv-w62-cov-web-8 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.
WEBSITE NOTE: these numbers come from 5 of 8 website test shards. A file can already be covered by a test that did not run. Check its existing tests first; if they already exercise the listed lines, list it SKIPPED-ALREADY-COVERED instead of adding a duplicate.

## FILES (path | coverage now | uncovered source lines)
- apps/website/src/platform/db/repos/origin-repo.ts | lines 100.0 br 84.62 fn 100.0 | uncovered lines: 
- apps/website/src/platform/db/repos/publish-content-run-repo.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- apps/website/src/platform/db/repos/publish-history-repo.ts | lines 100.0 br 96.3 fn 100.0 | uncovered lines: 
- apps/website/src/platform/db/schema.postgres.ts | lines 98.98 br 100.0 fn 100.0 | uncovered lines: 1-13
- apps/website/src/platform/db/schema.sqlite.ts | lines 100.0 br 98.78 fn 46.51 | uncovered lines: 
- apps/website/src/platform/db/site-store-copy.ts | lines 93.33 br 75.0 fn 15.38 | uncovered lines: 17
- apps/website/src/platform/db/sqlite/chat-db.ts | lines 94.59 br 88.89 fn 100.0 | uncovered lines: 55-57,68
- apps/website/src/platform/db/sqlite/chat-orphan-check.ts | lines 84.0 br 58.33 fn 41.67 | uncovered lines: 108-112,118-120,140-159
- apps/website/src/platform/db/sqlite/content-db.ts | lines 97.78 br 75.0 fn 61.11 | uncovered lines: 175-177,199
- apps/website/src/platform/db/sqlite/copy-coordinator.ts | lines 98.01 br 69.57 fn 61.29 | uncovered lines: 176-178
- apps/website/src/platform/db/sqlite/database-introspection-adapter.sqlite.ts | lines 100.0 br 97.4 fn 100.0 | uncovered lines: 
- apps/website/src/platform/db/sqlite/fresh-content-db.ts | lines 99.38 br 96.0 fn 96.77 | uncovered lines: 84-85
- apps/website/src/platform/db/sqlite/origin-repo.sqlite.ts | lines 97.5 br 100.0 fn 100.0 | uncovered lines: 40
- apps/website/src/platform/db/sqlite/outbox-repo.sqlite.ts | lines 100.0 br 85.71 fn 100.0 | uncovered lines: 
- apps/website/src/platform/db/sqlite/reset-legacy-site-title-pin.ts | lines 100.0 br 100.0 fn 44.44 | uncovered lines: 
- apps/website/src/platform/db/sqlite/restore-point-prune-warning.ts | lines 88.89 br 100.0 fn 100.0 | uncovered lines: 7
- apps/website/src/platform/db/sqlite/routines-db.ts | lines 41.38 br 66.67 fn 100.0 | uncovered lines: 3-14,16,27-30
- apps/website/src/platform/db/vault-credential-inventory.ts | lines 100.0 br 98.37 fn 78.57 | uncovered lines: 
- apps/website/src/platform/db/vault-credential-recovery.ts | lines 100.0 br 94.29 fn 100.0 | uncovered lines: 
- apps/website/src/platform/db/write-watermark-tables.ts | lines 16.67 br 100.0 fn 100.0 | uncovered lines: 1-5
- apps/website/src/platform/dev-host/warm-site-agent.ts | lines 61.54 br 50.0 fn 50.0 | uncovered lines: 1,16-24
- apps/website/src/platform/dev-supervisor/dev-restart.ts | lines 100.0 br 94.59 fn 81.82 | uncovered lines: 
- apps/website/src/platform/dev-supervisor/index.ts | lines 50.0 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/platform/express/async-route.ts | lines 100.0 br 85.71 fn 66.67 | uncovered lines: 
- apps/website/src/platform/express/jini-routes.ts | lines 97.12 br 77.19 fn 100.0 | uncovered lines: 1-6
- apps/website/src/platform/express/public-origin.ts | lines 98.96 br 95.0 fn 50.0 | uncovered lines: 87
- apps/website/src/platform/express/request-facts.ts | lines 97.14 br 83.33 fn 50.0 | uncovered lines: 35
- apps/website/src/platform/headless-browser/desktop-render.ts | lines 84.21 br 75.0 fn 100.0 | uncovered lines: 1-3
- apps/website/src/platform/headless-browser/playwright-loader.ts | lines 43.59 br 100.0 fn 50.0 | uncovered lines: 10-31
- apps/website/src/platform/html/menu-render.ts | lines 98.53 br 100.0 fn 80.0 | uncovered lines: 82
- apps/website/src/platform/html/published-webmcp-strip.ts | lines 98.51 br 81.82 fn 70.0 | uncovered lines: 56
- apps/website/src/platform/http/client.ts | lines 95.0 br 86.67 fn 100.0 | uncovered lines: 1-2,40-41
- apps/website/src/platform/http/egress-policies.ts | lines 90.03 br 88.89 fn 100.0 | uncovered lines: 1-25,28-32
- apps/website/src/platform/http/index.ts | lines 33.33 br 100.0 fn 100.0 | uncovered lines: 1-5,8-10
- apps/website/src/platform/http/ports.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/platform/http/test-origin-allowlist.ts | lines 78.3 br 100.0 fn 100.0 | uncovered lines: 1-23
- apps/website/src/platform/mail/adapter-module.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/platform/mail/adapters/smtp.nodemailer.ts | lines 90.0 br 100.0 fn 50.0 | uncovered lines: 1,24
- apps/website/src/platform/mail/delivery-availability.ts | lines 84.62 br 100.0 fn 100.0 | uncovered lines: 1,12
- apps/website/src/platform/mail/index.ts | lines 61.54 br 100.0 fn 100.0 | uncovered lines: 1-5
- apps/website/src/platform/markdown/frontmatter.ts | lines 98.41 br 64.71 fn 100.0 | uncovered lines: 48
- apps/website/src/platform/oauth/index.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/platform/oauth/legacy-endpoint-error.ts | lines 96.88 br 75.0 fn 100.0 | uncovered lines: 21
- apps/website/src/platform/publish-contracts.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/platform/routing/adapter.ts | lines 100.0 br 75.0 fn 10.53 | uncovered lines: 
- apps/website/src/platform/routing/index.ts | lines 100.0 br 66.67 fn 12.5 | uncovered lines: 
- apps/website/src/platform/secrets/startup-secrets.ts | lines 97.5 br 85.71 fn 100.0 | uncovered lines: 1
- apps/website/src/platform/secrets/vault-api-connection-meta.ts | lines 97.06 br 93.33 fn 22.22 | uncovered lines: 23
- apps/website/src/platform/secrets/vault-kinds.ts | lines 100.0 br 97.56 fn 77.27 | uncovered lines: 
- apps/website/src/platform/secrets/vault-meta-rules.ts | lines 100.0 br 98.85 fn 73.91 | uncovered lines: 
- apps/website/src/platform/server-logs/index.ts | lines 99.21 br 100.0 fn 100.0 | uncovered lines: 116
- apps/website/src/platform/server-logs/log-buffer.ts | lines 71.43 br 69.23 fn 87.5 | uncovered lines: 1-16,80-89
- apps/website/src/platform/server-logs/log-file.ts | lines 94.16 br 70.59 fn 91.67 | uncovered lines: 86-88,92-93,116-117,140
- apps/website/src/platform/site-dir/active-site.ts | lines 91.45 br 44.44 fn 50.0 | uncovered lines: 118,123-131
- apps/website/src/platform/site-dir/boot-site-dir.ts | lines 100.0 br 96.77 fn 100.0 | uncovered lines: 
- apps/website/src/platform/site-dir/duplicate-content-db.ts | lines 100.0 br 100.0 fn 60.0 | uncovered lines: 
- apps/website/src/platform/site-dir/duplicate-pglite-store.ts | lines 43.53 br 50.0 fn 0.0 | uncovered lines: 28-37,41-58,68-87
- apps/website/src/platform/site-dir/duplicate-site.ts | lines 97.03 br 83.33 fn 80.0 | uncovered lines: 119-120,292-298
- apps/website/src/platform/site-dir/errors.ts | lines 100.0 br 93.33 fn 65.0 | uncovered lines: 
- apps/website/src/platform/site-dir/index.ts | lines 100.0 br 75.0 fn 3.64 | uncovered lines: 
- apps/website/src/platform/site-dir/init-site.ts | lines 99.77 br 94.17 fn 73.08 | uncovered lines: 489
- apps/website/src/platform/site-dir/key-only-site-meta.ts | lines 75.64 br 60.0 fn 28.0 | uncovered lines: 90-91,107-113,118-120,125-126,129-131,140-151,161-164,166-168,171-181,197-202,235-238
- apps/website/src/platform/site-dir/layout.ts | lines 99.33 br 100.0 fn 22.22 | uncovered lines: 148
- apps/website/src/platform/site-dir/local-admin-bundle.ts | lines 98.88 br 93.94 fn 81.48 | uncovered lines: 30,136
- apps/website/src/platform/site-dir/local-site-child.ts | lines 95.3 br 93.33 fn 100.0 | uncovered lines: 1-3,146-148,180
- apps/website/src/platform/site-dir/local-site-intent.ts | lines 98.39 br 93.33 fn 72.73 | uncovered lines: 60
- apps/website/src/platform/site-dir/local-site-supervisor.ts | lines 86.69 br 61.11 fn 64.52 | uncovered lines: 89-91,96-103,111-121,176-183,186-187,190-196,231,234-235,259-260,280-282
- apps/website/src/platform/site-dir/move-sites-home.ts | lines 99.61 br 99.13 fn 100.0 | uncovered lines: 1
- apps/website/src/platform/site-dir/moves.ts | lines 50.0 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/platform/site-dir/nested-sites-root.ts | lines 100.0 br 95.83 fn 69.23 | uncovered lines: 
- apps/website/src/platform/site-dir/new-site-owner.ts | lines 100.0 br 90.0 fn 50.0 | uncovered lines: 
- apps/website/src/platform/site-dir/ports.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/platform/site-dir/product-root.ts | lines 97.14 br 94.59 fn 64.71 | uncovered lines: 20-24
- apps/website/src/platform/site-dir/read-applied-schema-identity.ts | lines 100.0 br 100.0 fn 70.0 | uncovered lines: 
- apps/website/src/platform/site-dir/read-site-dir.ts | lines 100.0 br 97.87 fn 73.68 | uncovered lines: 
- apps/website/src/platform/site-dir/read-template.ts | lines 100.0 br 88.89 fn 50.0 | uncovered lines: 
- apps/website/src/platform/site-dir/repair-site.ts | lines 90.97 br 60.87 fn 66.67 | uncovered lines: 228-232,236-240,242-246,313-323
- apps/website/src/platform/site-dir/schema-guard.ts | lines 100.0 br 85.71 fn 50.0 | uncovered lines: 
- apps/website/src/platform/site-dir/seed-site-themes.ts | lines 99.38 br 100.0 fn 55.56 | uncovered lines: 178
- apps/website/src/platform/site-dir/seed-starter-title.ts | lines 100.0 br 83.33 fn 60.0 | uncovered lines: 
- apps/website/src/platform/site-dir/site-databases.ts | lines 99.32 br 96.88 fn 68.75 | uncovered lines: 134
- apps/website/src/platform/site-dir/site-key-dependent-data.ts | lines 84.15 br 64.71 fn 50.0 | uncovered lines: 43-44,53-57,78-83
- apps/website/src/platform/site-dir/site-registry.ts | lines 99.38 br 95.59 fn 73.58 | uncovered lines: 165-166,526
- apps/website/src/platform/site-dir/site-root.ts | lines 96.0 br 84.62 fn 33.33 | uncovered lines: 90-92,99
- apps/website/src/platform/site-dir/site-running.ts | lines 100.0 br 96.97 fn 72.22 | uncovered lines: 
- apps/website/src/platform/site-dir/site-storage.ts | lines 98.88 br 96.88 fn 44.44 | uncovered lines: 74
- apps/website/src/platform/site-dir/site-store.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/platform/site-dir/site-switcher-enabled.ts | lines 96.43 br 87.5 fn 50.0 | uncovered lines: 23
- apps/website/src/platform/site-dir/site-trash.ts | lines 99.55 br 97.3 fn 75.0 | uncovered lines: 211
- apps/website/src/platform/site-dir/sites-home.ts | lines 97.62 br 100.0 fn 44.44 | uncovered lines: 45
