# Website database coverage gap fill

This is the local handoff, not a file to commit. Paths in the first section are relative to `apps/website/src/`. The regression mutations were reviewed against the tests but not applied or run. No tests, builds, installs, typechecks, coverage, or mutation jobs were run.

## New test → source mutation

- `platform/db/client/__tests__/open-site-db-client.unit.test.ts`: **a failed chat open closes the content handle and preserves the original error** → Delete `await content.close()` from the second-open catch in `open-site-db-client.ts:125`. The native content handle would still be open. Replace `throw err` with a new error and the original-object rejection check fails.
- `platform/db/postgres/__tests__/db-ops-adapter.unit.test.ts`: **the Postgres adapter advertises no managed restore point and refuses capture and restore** → In `db-ops-adapter.ts:81–86` return a successful restore result or use the capture action for the restore error. The respective rejection fails. Setting the capability to an available restore cost also fails.
- `platform/db/migrations/__tests__/submission-ip-retention-step.test.ts`: **0006 refuses a missing source_ip column without discarding the submission or changing the schema** → Delete the missing-column refusal in `0006_submission_ip_retention.ts:17` (or incorrectly fall through to indexing an absent column). The expected migration diagnostic is lost.
- `platform/db/migrations/__tests__/submission-ip-retention-step.test.ts`: **0006 refuses a missing non-IP column without discarding the submission or changing the schema** → Delete the length operand at `0006_submission_ip_retention.ts:39`. All remaining names are expected, so the guard would pass and the intended diagnostic would be replaced by a later SQLite failure on `deleted_at`.
- `platform/db/migrations/__tests__/submission-ip-retention-step.test.ts`: **0006 refuses a renamed column at the original column count without discarding the submission or changing the schema** → Delete the membership operand at `0006_submission_ip_retention.ts:39`. The exact diagnostic would be replaced by a later SQLite failure on `deleted_at`.
- `platform/db/migrations/__tests__/submission-ip-retention-step.test.ts`: **0006 refuses an incoming foreign key without discarding the submission or changing the schema** → Remove the incoming-FK rejection at `0006_submission_ip_retention.ts:51–52`. The empty referencing table deliberately does not prevent the DROP, and the test must see the refusal rather than an upgraded schema.
- `platform/db/migrations/__tests__/publish-history-config-jsonb-step.test.ts`: **0016 and 0017 preserve legacy publish rows as static without inventing replay credentials** → In `0016_publish_destination_history.ts`, default the new credential or config column to non-NULL, or remove `DEFAULT 'static'` in `0017_publish_history_kind.ts`. Old and later implicit-static rows would have the wrong values.
- `platform/db/migrations/__tests__/optimistic-concurrency-versions-step.test.ts`: **0042 gives all six legacy and new editable rows a non-null version of one** → Remove one table from the list, relax `NOT NULL`, or change `DEFAULT 1` to `DEFAULT 0` in `0042_optimistic_concurrency_versions.ts`. At least one row read, insert, or constraint diagnostic then fails.
- `platform/db/migrations/__tests__/webhook-subscription-creator-kind-step.test.ts`: **0043 preserves legacy webhooks without attributing them to an agent** → Set `DEFAULT 'agent'` on the column in `0043_webhook_subscription_creator_kind.ts`. The legacy and omitted attribution rows would not read back as NULL.
- `platform/db/migrations/__tests__/project-migrations.test.ts`: **SQLite-only project vault steps leave an existing Postgres site vault untouched** → Remove the SQLite-only guard in either `project/0000_project_vault.ts:50` or `project/0001_project_credential_kinds.ts:63`. The step would try to install or rebuild the project vault on Postgres and fail or alter the site vault.
- `platform/db/__tests__/migration-manifest.test.ts`: **reseedSequenceSql applies the 63-byte limit to a column name, not a character limit** → Remove the column identifier check at `migration/manifest.ts:590`, compare JS string length at :837, or change the guard to disallow exactly 63 bytes. One of the two adjacent cases fails.
- `platform/db/__tests__/migration-manifest.test.ts`: **plugin transfer refuses a column kind from a newer or incompatible declaration** → Return a generic scalar classification instead of throwing in the default case at `migration/manifest.ts:737`. The unsupported type no longer rejects.
- `platform/db/kernel/__tests__/jini-db-facades.integration.test.ts`: **the configured Postgres pool limit is part of session-owner admission** → Stop forwarding `required.max` at `kernel/drivers/postgres.ts:9`. The kernel reports the Jini default capacity rather than 1 and no longer rejects before taking a session.
- `platform/db/kernel/__tests__/jini-db-facades.integration.test.ts`: **erasing the content schema preserves the kernel and its transaction boundary** → Return a new facade (for example a shallow copy) instead of the original object at `content-kernel.ts:32`, or rebuild when `contentKernel` is passed an already-open kernel. Identity checks fail, and a separately scoped write cannot share the same rollback.
- `platform/db/repos/__tests__/blob-gc-journal.test.ts`: **journal refuses an unspecified blob kind even when the purge reason is valid** → Drop only the kind check in `repos/blob-gc-journal.ts:37`. Either a database error replaces the domain diagnostic or the invalid row is written. The valid rendition checks that the journal and blob state read back normally.
- `platform/db/repos/__tests__/media-grid-query.test.ts`: **an empty alphabetical grid and an exact miss report numeric zero counts** → Replace `Number(value ?? 0)` with `Number(value ?? undefined)` in `repos/media-grid-query.ts:75`, or drop the workspace filter in `gridScope`. The scoped empty result/summary changes.
- `platform/db/repos/__tests__/media-grid-query.test.ts`: **alphabetical paging uses the saved cursor position after deletion and ignores another workspace's MIME** → Drop the workspace join clause at `repos/media-grid-query.ts:50`, or reinterpret the cursor by finding its live row before filtering at :105–107. The foreign-MIME item leaks into the page and counts, or the page fails after the cursor row is deleted.
- `platform/db/repos/__tests__/media-grid-query.test.ts`: **grid Trash deadlines match only requested media ids in the workspace** → Drop any one of the workspace, entity-type or ID predicates at `repos/media-grid-query.ts:181–183`. A different seeded row enters the resulting map for each mutation.
- `platform/db/repos/__tests__/media-record-row.test.ts`: **a video needs both a captions asset and a language, but not a label** → Replace the conjunction at `repos/media-record-row.ts:41` with a check for only one field, or default a missing label to an empty string at :42. At least one of the partial-row cases or the valid unlabelled case fails.
- `features/analytics/__tests__/repo.contract.test.ts`: **SQL sink limits reads to the newest 50 by default and clamps requests to 1–500** → Change either limit constant or omit the nonfinite/below-minimum handling at `repos/analytics-sink.ts:33–38`. The expected returned paths (order and selection) no longer match. Changing the batch capability at :95 also fails.
- `platform/db/sqlite/__tests__/content-db-seed.unit.test.ts`: **first boot stores portable entries with their JSON fields and reopening keeps an operator edit** → Omit the content-entry insert or the JSON serialization at `prepare-content-store.ts:63–64`. Independent reads lose the entries or their real JSON fields. Removing the workspace guard would also fail the second call.

Author Checklist reviewed statically for each case. Failure-path cases pin error identity or diagnostics and read back durable state where relevant. Fixtures isolate the relevant guard and use non-default inputs. DB behavior runs through real scratch kernels, and the sole injected failure is at the daemon's driver port. Each new database fixture has teardown. Mutations and runtime outcomes remain unverified per dispatch.

## SKIPPED-ALREADY-COVERED

The files below already have tests driving the indicated runtime behavior. For rows with 100% reported lines and no missing-line detail, this is evidence the shipped path is exercised, not certification that every branch-counter is saturated. Target and evidence paths are shortened relative to the website app.

| Target | Existing evidence |
|---|---|
| `keep-stored-revocation.ts` | Identity and members `repo.session-revocation*.test.ts`: stale saves preserve revocation and an incoming timestamp can revoke a live row. |
| `kernel/drivers/pglite-owner.ts` | `pglite-owner.test.ts`: real owner and daemon connections, lock and stop cases. `pglite-owner.socket-dir.unit.test.ts`: explicit/default home and short-socket fallback. |
| `kernel/drivers/pglite-socket.ts` | `pglite-owner.test.ts` opens the real daemon connection and performs queries over the owner's socket. |
| `kernel/drivers/pglite.ts` | `kernel.test.ts` and `database-types.test.ts`: embedded queries and transactions, including the real schema preparation callback. |
| `kernel/drivers/sqlite.ts` | Database transfer's `table-catalog.unit.test.ts` reads real serialized snapshots through the wrapper; `jini-db-facades.integration.test.ts` exercises native/handle kernel identity. |
| `kernel/ops.ts` | `ops.test.ts`: “copyServedPgliteTo restores a served owner's rows into a new data dir without its owner lock”; shared facade tests pin refusal and compaction guidance. |
| `kernel/stopped-database.ts` | `move-sites-home.integration.test.ts`: strict JSON counts and failures for open, missing and integrity-failed databases. |
| `key-dependent-data.ts` | `key-dependent-data.test.ts`: sealed data, webhook rows, empty/restoration artifacts, open/query/close failure and empty path list. |
| `migrations/0000_legacy_baseline.postgres.ts`, `0000_legacy_baseline.ts` | `postgres-baseline.test.ts`: applied composite FK and refusal on prototype schema. `legacy-adoption.test.ts`: fresh/adopted/partial SQLite behavior. |
| `0001_post_search.ts` | `post-search-behavior.test.ts`: stemming, projection/index, no-op SQLite and PostgreSQL rollback. |
| `0002_drop_empty_legacy_chat_tables.ts` | `drop-empty-legacy-chat-tables-step.test.ts`: drops only empty tables, preserves populated ones, no-op on PGlite. |
| `0003_coercion_json_as_json.ts` | `coercion-json-as-json-step.test.ts`: keeps valid JSON and NULL, converts bare strings, records on PGlite. |
| `0004_drop_unused_deployment_tables.ts` | `drop-unused-deployment-tables-step.test.ts`: removes only obsolete tables. |
| `0005_media_createdby.ts` | `media-createdby.test.ts`: old rows stay unattributed and the new column accepts creators. |
| `0007_publish_backstop.ts` | `publish-backstop.test.ts`: upgraded columns, durable rows, direction CHECK and indexes across dialects. |
| `0008_posts_publish_at_featured_media.ts` | `posts-publish-at-featured-media.test.ts`: legacy posts survive, nullable schedule/media columns. |
| `0009_posts_author.ts` | `posts-author-migration.test.ts`: nullable author, false default, legacy content and ledger. |
| `0010_members_credentials_revoked_at.ts` | `members-credentials-revoked-at.test.ts`: nullable cutoff, legacy row retained and applied once. |
| `0011_archive_legacy_commerce.ts` | `archive-legacy-commerce.test.ts`: both dialects, populated/missing/empty/colliding cases and rollback. |
| `0011_drop_empty_core_commerce_tables.ts` | `drop-empty-core-commerce-tables-step.test.ts`: missing/empty/populated targets and invalid counts. |
| `0012_secrets_vault.ts` | `secrets-vault-step.test.ts`: exact source and envelope preservation, pointer constraints, collision handling and refusal cases. |
| `0013_unify_vault_credentials.ts` | `unify-vault-credentials-step.test.ts`: preserves envelopes and identity, rerun and rollback. |
| `0014_media_library.ts` | `media-library.test.ts`: upgrade keeps media rows and admits documents. |
| `0015_document_blob_ownership.ts` | `document-blob-ownership.test.ts`: preserves old asset blobs and adds document ownership with the correct default. |
| `0018_form_submission_remote_receipts.ts` | `form-submission-receipt-repo.dialects.test.ts`: real receipt scope/idempotence; adopted history is driven by `legacy-adoption.test.ts` and `postgres-baseline.test.ts`. |
| `0019_form_delivery_plans.ts` | `form-delivery-plans-step.test.ts`: durable plan/job keys and pull leases. |
| `0020_vault_api_connection_kind.ts` | `vault-api-connection-kind.test.ts`: rejects non-0012 DDL, including missing, duplicated and wrong table header shapes, handles both dialects. |
| `0021_site_consent_revisions.ts` | `workspace-mcp-cascade.test.ts`: runs 0021 and verifies its populated tables survive 0022; consent `service.test.ts` also round-trips revisions. |
| `0022_workspace_mcp_cascade.ts` | `workspace-mcp-cascade.test.ts`: isolated workspace cascade and direct vault restrictions. |
| `0023_mail_ledgers.ts` | `mail-ledgers-step.test.ts`: correct ledgers, defaults, uniqueness and workspace boundaries. |
| `0024_domain_bindings.ts` | `domain-bindings-step.test.ts`: key/scope/default/constraint checks. |
| `0025_mail_feedback_processed.ts` | `mail-feedback-processed-step.test.ts`: nullable processed timestamp, existing row survives. |
| `0026_domain_binding_version.ts` | `domain-binding-version-step.test.ts`: adds version starting at zero once. |
| `0027_search_index.ts` | `search-index-step.test.ts`: state, watermark, pointer, keys and SQL constraints. |
| `0028_search_index_retired.ts` | `search-index-retired-step.test.ts`: rows unique per retired site/provider/generation. |
| `0029_mail_activity_indexes.ts` | `mail-activity-indexes-step.test.ts`: creates activity storage without changing send results. |
| `0030_mail_suppression_admin.ts` | `mail-suppression-admin-step.test.ts`: adds removal audit and preserves suppressions. |
| `0031_mail_activity_retention.ts` | `mail-activity-retention-step.test.ts`: indexed purpose and retention with old outcomes unchanged. |
| `0032_member_signup_email.ts` | `member-signup-email-step.test.ts`: legacy tokens survive and member-less signups round-trip. |
| `0033_mail_activity_message.ts` | `mail-activity-message-step.test.ts`: legacy mail activity remains intact. |
| `0034_member_auth.ts` | `member-auth-step.test.ts`: legacy rows and defaults survive on both dialects. |
| `0035_member_external_identities.ts` | `member-external-identities-step.test.ts`: identity metadata migrations preserve members. |
| `0036_publish_history_config_jsonb.ts` | Existing 0036 case in `publish-history-config-jsonb-step.test.ts`: preserves JSON and NULL, correct type on both dialects. |
| `0037_media_source_metadata.ts` | `postgres-baseline.test.ts` exercises the PG upgrade and schema comparison; `legacy-adoption.test.ts` exercises the SQLite upgrade. `provenance.integration.test.ts` verifies stored source metadata survives reopen. |
| `0038_newsletter_sending_index.ts` | `runner.postgres.test.ts` has a workspace/status index assertion (see pre-existing test drift below); `postgres-baseline.test.ts` compares actual migrated indexes and `content-db-fresh.integration.test.ts` uses fresh SQLite. |
| `0039_owner_recovery_codes.ts` | `owner-recovery-codes-step.test.ts`: scoped hash uniqueness and one-time apply. |
| `0040_owner_mfa.ts` | `owner-mfa-step.test.ts`: preserves recovery kits, installs proofs and reapply protection. |
| `0041_owner_passkeys.ts` | `postgres-baseline.test.ts` exercises the upgrade and scoped PK; `passkeys.repo.dialects.test.ts` pins durable counter/ownership behavior. |
| `0044_agent_pause_creator_kind.ts` | `agent-pause-creator-kind-step.test.ts`: legacy sends and newly attributed actors, resume hold. |
| `0045_media_captions.ts` | `media-captions-step.test.ts`: nullable API and legacy rows preserved. |
| `0046_media_description.ts` | `media-description-step.test.ts`: only adds nullable description, retains legacy metadata. |
| `0047_change_set_actor_kind.ts` | `change-set-actor-kind-step.test.ts`: legacy attribution stays unknown. |
| `0048_blob_gc_journal.ts` | `blob-gc-journal-step.test.ts`: migrated schema matches fresh; `blob-gc-journal.test.ts` exercises durable operations. |
| `0050_ledger_actor_kind.ts` | `ledger-actor-kind-step.test.ts`: six actor columns added, old rows stay unattributed. |
| `chat/0000_chat_baseline.ts`, `chat/0001_sqlite_chat_tables.ts`, `chat/0002_durable_run_attempts.ts`, `chat/0003_active_run_index.ts` | `chat-migration-behavior.test.ts`: real time, defaults, indexes, ownership/cascades and dialect-specific baseline no-ops. |
| `chat/0004_chat_pinned.ts` | `chat-pinned-step.test.ts` proves idempotence and data preservation, `post-search-step.test.ts` applies the PGlite chat chain. |
| `chat/0049_scrub_assistant_chat_titles.ts` | `chat-title-scrub.test.ts`: stored title rewritten only when needed, across dialects. |
| `checksums.ts`, `source-digests.ts` | `checksums.test.ts`: pinned ledgers, independently calculated source digests and registry membership. |
| `commerce/0000_catalog.ts` | `commerce-catalog-step.test.ts`: opt-in creates catalog only, once, without importing prior data. |
| `migrations/index.ts` | `legacy-adoption.test.ts`, `post-search-step.test.ts`, `commerce-catalog-step.test.ts` and `project-store.unit.test.ts` exercise all four histories with separate ledgers. |
| `legacy-sqlite.ts:111–112,200–204` | `legacy-adoption.test.ts`: missing entry before last applied and mismatched schema/index refusal, with no adopted ledger. |
| `project/0002_site_key_attachments.ts` | `project-store.unit.test.ts`: step recorded once, no auto-attachments, peers share state. `attachments.unit.test.ts` directly applies the step. |
| `runner.ts:25` | `jini-db-facades.integration.test.ts`: no ledger before migration; ledger present afterwards, chat remains separate. |
| `publish-backstop-tables.ts` | `backstop-audit.sqlite.test.ts`: actual adapter uses the mapping and reads/writes the durable table. |
| `repos/media-repo.ts:281–282,726–732` | Route `replace.test.ts`: old metadata draft cannot replace the new SHA. `media-repo.transform-conflict.test.ts` checks wrapped cause and raw errors; media `repo.contract.test.ts` exercises both against real engines. |
| `repos/oauth-pending-store.ts` | `oauth-pending-store.test.ts`: roundtrip, replace/delete, missing rows, and ciphertext bound to workspace and server; `vault-credential-inventory.test.ts` exercises `deviceAad` in the retained-envelope readback. |

## Exceptions and remaining verification

- EXCEPTION `content-database.generated.ts:1–1144` is type-only, with no executable coverage target.
- EXCEPTION `kernel/index.ts:1–11` is a re-export barrel. Its underlying functions have behavioral tests.
- EXCEPTION `kernel/drivers/pglite-socket.ts:1`, `kernel/stopped-database.ts:1`, `migration/manifest.ts:1–65`, `migrations/source-digests.ts:1–7`, `publish-backstop-tables.ts:1–6`, `repos/media-record-row.ts:6–9,11` are comments, not uncovered behavior.
- EXCEPTION `migration/manifest.ts:648–653` derives FK targets from a fixed, module-scoped schema. All referenced targets are exported today; provoking this guard would require changing or substituting that schema, not an input the public interface admits. Normal FK order is already asserted by `migration-manifest.test.ts`.
- EXCEPTION `repos/media-grid-query.ts:77–78,119` defenses for a missing aggregate row and a DB row outside the requested ID set do not occur with the real SQL. The empty aggregate and real alphabetical ordering are tested.
- Pre-existing test drift, not a production bug: `migrations/__tests__/runner.postgres.test.ts:80–83,106` pins the content ledger only through 0041 and omits chat step 0004. Its follow-up literal table count is also labelled through 0041. Update these baselines separately before using those assertions as proof of the full head.
- Other branch/function counters without named runtime gaps remain unverified until the full cloud coverage run. No coverage exclusions or thresholds were changed.
