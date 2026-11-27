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

REPO: Tovu only. HEAD = codex/tv-w62-cov-web-7 = origin/integ/merge-28-2026-11-26. Jini source is readable from a Tovu clone via: git -C /Users/la/Programming/Jini show origin/integ/merge-28-2026-11-26:<path>.
WEBSITE NOTE: these numbers come from 5 of 8 website test shards. A file can already be covered by a test that did not run. Check its existing tests first; if they already exercise the listed lines, list it SKIPPED-ALREADY-COVERED instead of adding a duplicate.

## FILES (path | coverage now | uncovered source lines)
- apps/website/src/platform/db/client/open-site-db-client.ts | lines 97.5 br 86.21 fn 91.67 | uncovered lines: 125-127
- apps/website/src/platform/db/content-database.generated.ts | lines MISSING br MISSING fn MISSING | uncovered lines: not-in-lcov
- apps/website/src/platform/db/content-kernel.ts | lines 100.0 br 87.5 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/keep-stored-revocation.ts | lines 94.12 br 66.67 fn 33.33 | uncovered lines: 15
- apps/website/src/platform/db/kernel/drivers/pglite-owner.ts | lines 100.0 br 87.5 fn 26.67 | uncovered lines: 
- apps/website/src/platform/db/kernel/drivers/pglite-socket.ts | lines 88.89 br 100.0 fn 100.0 | uncovered lines: 1
- apps/website/src/platform/db/kernel/drivers/pglite.ts | lines 100.0 br 75.0 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/kernel/drivers/postgres.ts | lines 88.89 br 100.0 fn 50.0 | uncovered lines: 8
- apps/website/src/platform/db/kernel/drivers/sqlite.ts | lines 98.11 br 100.0 fn 55.0 | uncovered lines: 52
- apps/website/src/platform/db/kernel/index.ts | lines 100.0 br 66.67 fn 10.0 | uncovered lines: 
- apps/website/src/platform/db/kernel/ops.ts | lines 97.22 br 100.0 fn 50.0 | uncovered lines: 35
- apps/website/src/platform/db/kernel/stopped-database.ts | lines 84.62 br 100.0 fn 100.0 | uncovered lines: 1,11
- apps/website/src/platform/db/key-dependent-data.ts | lines 100.0 br 100.0 fn 63.64 | uncovered lines: 
- apps/website/src/platform/db/migration/manifest.ts | lines 82.64 br 89.74 fn 80.0 | uncovered lines: 1-65,462-467,503-506,554-563,589-600,649-653,713-740,836-843
- apps/website/src/platform/db/migrations/0000_legacy_baseline.postgres.ts | lines 100.0 br 66.67 fn 33.33 | uncovered lines: 
- apps/website/src/platform/db/migrations/0000_legacy_baseline.ts | lines 100.0 br 92.86 fn 66.67 | uncovered lines: 
- apps/website/src/platform/db/migrations/0001_post_search.ts | lines 100.0 br 88.89 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0002_drop_empty_legacy_chat_tables.ts | lines 100.0 br 76.92 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0003_coercion_json_as_json.ts | lines 100.0 br 87.5 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0004_drop_unused_deployment_tables.ts | lines 100.0 br 83.33 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0005_media_createdby.ts | lines 100.0 br 80.0 fn 75.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0006_submission_ip_retention.ts | lines 94.59 br 80.0 fn 77.78 | uncovered lines: 40-41,52-53
- apps/website/src/platform/db/migrations/0007_publish_backstop.ts | lines 100.0 br 87.5 fn 75.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0008_posts_publish_at_featured_media.ts | lines 100.0 br 80.0 fn 75.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0009_posts_author.ts | lines 100.0 br 87.5 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0010_members_credentials_revoked_at.ts | lines 100.0 br 80.0 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0011_archive_legacy_commerce.ts | lines 100.0 br 96.3 fn 72.73 | uncovered lines: 
- apps/website/src/platform/db/migrations/0011_drop_empty_core_commerce_tables.ts | lines 100.0 br 96.15 fn 75.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0012_secrets_vault.ts | lines 100.0 br 95.83 fn 85.71 | uncovered lines: 
- apps/website/src/platform/db/migrations/0013_unify_vault_credentials.ts | lines 100.0 br 95.0 fn 75.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0014_media_library.ts | lines 100.0 br 83.33 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0015_document_blob_ownership.ts | lines 100.0 br 90.0 fn 66.67 | uncovered lines: 
- apps/website/src/platform/db/migrations/0016_publish_destination_history.ts | lines 100.0 br 80.0 fn 75.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0017_publish_history_kind.ts | lines 100.0 br 80.0 fn 75.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0018_form_submission_remote_receipts.ts | lines 100.0 br 80.0 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0019_form_delivery_plans.ts | lines 100.0 br 83.33 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0020_vault_api_connection_kind.ts | lines 97.26 br 76.92 fn 62.5 | uncovered lines: 33-34
- apps/website/src/platform/db/migrations/0021_site_consent_revisions.ts | lines 100.0 br 85.71 fn 66.67 | uncovered lines: 
- apps/website/src/platform/db/migrations/0022_workspace_mcp_cascade.ts | lines 100.0 br 83.33 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0023_mail_ledgers.ts | lines 100.0 br 83.33 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0024_domain_bindings.ts | lines 100.0 br 83.33 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0025_mail_feedback_processed.ts | lines 100.0 br 80.0 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0026_domain_binding_version.ts | lines 100.0 br 80.0 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0027_search_index.ts | lines 100.0 br 83.33 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0028_search_index_retired.ts | lines 100.0 br 80.0 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0029_mail_activity_indexes.ts | lines 100.0 br 96.0 fn 82.61 | uncovered lines: 
- apps/website/src/platform/db/migrations/0030_mail_suppression_admin.ts | lines 100.0 br 95.45 fn 80.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0031_mail_activity_retention.ts | lines 100.0 br 90.0 fn 63.64 | uncovered lines: 
- apps/website/src/platform/db/migrations/0032_member_signup_email.ts | lines 100.0 br 80.0 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0033_mail_activity_message.ts | lines 100.0 br 80.0 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0034_member_auth.ts | lines 100.0 br 90.0 fn 66.67 | uncovered lines: 
- apps/website/src/platform/db/migrations/0035_member_external_identities.ts | lines 100.0 br 83.33 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0036_publish_history_config_jsonb.ts | lines 100.0 br 87.5 fn 75.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0037_media_source_metadata.ts | lines 100.0 br 88.89 fn 80.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0038_newsletter_sending_index.ts | lines 100.0 br 85.71 fn 62.5 | uncovered lines: 
- apps/website/src/platform/db/migrations/0039_owner_recovery_codes.ts | lines 100.0 br 90.0 fn 72.73 | uncovered lines: 
- apps/website/src/platform/db/migrations/0040_owner_mfa.ts | lines 100.0 br 95.45 fn 84.21 | uncovered lines: 
- apps/website/src/platform/db/migrations/0041_owner_passkeys.ts | lines 100.0 br 94.44 fn 80.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0042_optimistic_concurrency_versions.ts | lines 100.0 br 85.71 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0043_webhook_subscription_creator_kind.ts | lines 100.0 br 80.0 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0044_agent_pause_creator_kind.ts | lines 100.0 br 83.33 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0045_media_captions.ts | lines 100.0 br 83.33 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0046_media_description.ts | lines 100.0 br 80.0 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0047_change_set_actor_kind.ts | lines 100.0 br 80.0 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0048_blob_gc_journal.ts | lines 100.0 br 83.33 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/0050_ledger_actor_kind.ts | lines 100.0 br 83.33 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/chat/0000_chat_baseline.ts | lines 100.0 br 88.89 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/chat/0001_sqlite_chat_tables.ts | lines 100.0 br 88.89 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/chat/0002_durable_run_attempts.ts | lines 100.0 br 91.67 fn 66.67 | uncovered lines: 
- apps/website/src/platform/db/migrations/chat/0003_active_run_index.ts | lines 100.0 br 88.89 fn 66.67 | uncovered lines: 
- apps/website/src/platform/db/migrations/chat/0004_chat_pinned.ts | lines 100.0 br 93.75 fn 66.67 | uncovered lines: 
- apps/website/src/platform/db/migrations/chat/0049_scrub_assistant_chat_titles.ts | lines 100.0 br 81.82 fn 66.67 | uncovered lines: 
- apps/website/src/platform/db/migrations/checksums.ts | lines 100.0 br 75.0 fn 66.67 | uncovered lines: 
- apps/website/src/platform/db/migrations/commerce/0000_catalog.ts | lines 100.0 br 83.33 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/index.ts | lines 100.0 br 83.33 fn 31.58 | uncovered lines: 
- apps/website/src/platform/db/migrations/legacy-sqlite.ts | lines 96.09 br 85.42 fn 67.65 | uncovered lines: 111-112,200-204
- apps/website/src/platform/db/migrations/project/0000_project_vault.ts | lines 100.0 br 71.43 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/project/0001_project_credential_kinds.ts | lines 100.0 br 71.43 fn 50.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/project/0002_site_key_attachments.ts | lines 100.0 br 83.33 fn 60.0 | uncovered lines: 
- apps/website/src/platform/db/migrations/runner.ts | lines 95.65 br 100.0 fn 42.86 | uncovered lines: 25
- apps/website/src/platform/db/migrations/source-digests.ts | lines 88.33 br 100.0 fn 100.0 | uncovered lines: 1-7
- apps/website/src/platform/db/postgres/db-ops-adapter.ts | lines 94.74 br 100.0 fn 57.14 | uncovered lines: 81-82,85-86
- apps/website/src/platform/db/prepare-content-store.ts | lines 100.0 br 97.22 fn 71.43 | uncovered lines: 
- apps/website/src/platform/db/publish-backstop-tables.ts | lines 14.29 br 100.0 fn 100.0 | uncovered lines: 1-6
- apps/website/src/platform/db/repos/analytics-sink.ts | lines 83.48 br 100.0 fn 30.0 | uncovered lines: 95-96,99-100,103-105,108-119
- apps/website/src/platform/db/repos/blob-gc-journal.ts | lines 100.0 br 94.12 fn 100.0 | uncovered lines: 
- apps/website/src/platform/db/repos/media-grid-query.ts | lines 37.36 br 100.0 fn 0.0 | uncovered lines: 41-46,49-54,57-59,67-80,83-85,88-94,103-120,123-139,147-158,162-171,173-185
- apps/website/src/platform/db/repos/media-record-row.ts | lines 84.09 br 63.64 fn 100.0 | uncovered lines: 6-9,11-12,42
- apps/website/src/platform/db/repos/media-repo.ts | lines 98.75 br 82.21 fn 95.45 | uncovered lines: 281-282,726-732
- apps/website/src/platform/db/repos/oauth-pending-store.ts | lines 100.0 br 94.12 fn 80.0 | uncovered lines: 
