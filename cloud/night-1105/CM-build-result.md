Programmer(Direct): Added the pre-0011 archive step in **77 production lines**. Populated historical commerce tables are renamed together to `_archive_0011_*`, with a clear warning. Original 0011 and its checksum remain unchanged.

Root cause: [0011:203](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/website/src/platform/db/migrations/0011_drop_empty_core_commerce_tables.ts:203) rejects populated tables.

Changed migration, registration, checksum, fresh bootstrap, drift guard, Postgres note forwarding, and regression tests. Complete file list and review evidence: [handoff](/Users/la/Programming/tovu-integration-clones/prov2-tovu/ADS-memory/reports/2026-11-05-CM-commerce-archive.md).

Tests added cover preservation, foreign keys/indexes, collisions, rollback, repeated/concurrent upgrades, and SQLite/Postgres backup restoration. **No tests ran.** Static imports, checksum comparison and whitespace checks passed. Runtime verification remains open. No owner DB, servers or commits were touched.

Cost: once per pending migration, bounded metadata probes, ≤6 scalar probes and ≤6 renames; no new polling.

Exact test commands, from the Tovu clone root; Postgres requires an existing test instance:

```bash
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-timeout=60000 --test-concurrency=2 --experimental-test-module-mocks apps/website/src/platform/db/migrations/__tests__/{archive-legacy-commerce,drop-empty-core-commerce-tables-step,checksums,postgres-baseline}.test.ts apps/website/src/platform/db/__tests__/schema-migration-drift.test.ts apps/website/src/platform/db/sqlite/__tests__/integration/content-db-fresh.integration.test.ts apps/website/src/server/runtime/composition/__tests__/commerce-data-retention.integration.test.ts

TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-timeout=60000 --test-concurrency=2 --experimental-test-module-mocks apps/website/src/platform/db/migrations/__tests__/{archive-legacy-commerce.postgres,runner.postgres}.test.ts
```