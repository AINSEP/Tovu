Programmer(Direct): Implemented the trim’s three points in source: exact-byte comparison, verified development-file omission, and scanner false-positive fixes.

Root cause: [ZIP assembly](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/website/src/features/site-backup/share-zip.ts:41) scanned every plugin entry; [scanner rules](/Users/la/Programming/tovu-integration-clones/prov2-jini/packages/diagnostics/src/core/secrets-only.ts:167) matched instructional prose and translated labels.

Nine files changed, including regression tests across four files. [Exact files, costs, and handoff](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/codex/2026-11-04-night/G-export-warning-build-result.txt).

Both permitted Jini type checks passed. **No tests run.** Other jobs’ files were untouched.

Derived plugin-only ZIP size: **1,844,603 → 1,844,603 bytes**; this installed package already excludes development files. The affected site archive was unavailable. Added cost: one installed-file read per selected plugin entry per export; no polling.

**Open:** integrate both changed Jini packages before runtime validation; Tovu’s installed npm copies are older.

Exact test commands, after integration:

```bash
cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/agent-plugins
npx vitest run --maxWorkers=2 src/lifecycle/__tests__/unit/bundled-file-policy.unit.test.ts

cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/diagnostics
npx vitest run --maxWorkers=2 src/core/__tests__/secrets-only*.test.ts src/__tests__/secrets-only.test.ts

cd /Users/la/Programming/tovu-integration-clones/prov2-tovu
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node \
  --import tsx \
  --import ./development/test-support/composed-bundle-env.ts \
  --test --experimental-test-module-mocks \
  --test-timeout=60000 --test-concurrency=2 \
  apps/website/src/features/site-backup/__tests__/bundled-export-file-policy.unit.test.ts \
  apps/website/src/features/site-backup/__tests__/share-zip.unit.test.ts \
  apps/website/src/features/site-backup/__tests__/credential-warnings.integration.test.ts
```