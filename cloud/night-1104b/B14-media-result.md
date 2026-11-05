Programmer(Direct): Implemented the trimmed P14 source changes.

Root cause: [media precheck](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/website/src/features/media/publish-content.ts:217) missed changed bytes, and apply lacked trusted overwrite intent.

Changes preserve strict imports, bind replacement to the reviewed live source/version, atomically replace metadata/type/renditions, protect rollback, and show actual completion outcomes. [Full file list, tests added, costs, and handoff](/Users/la/Programming/tovu-integration-clones/prov2-tovu/ADS-memory/reports/2026-11-04-p14-media-overwrite-programmer.md).

Tests remain **unrun**. Focused complexity checks passed. Final CMS typecheck reports an unrelated forms error at `attachment-purge.ts:57`. Updated Jini CMS must be integrated into Tovu before runtime verification. No commits, builds, installs, or servers run.

```bash
cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/cms
npx vitest run src/media/__tests__/{replace-media-file,media-service}.test.ts --maxWorkers=2

cd /Users/la/Programming/tovu-integration-clones/prov2-tovu
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-timeout=60000 --test-concurrency=2 \
  apps/website/src/features/media/__tests__/{publish-content.overwrite,replacement.dialects,import-media-entity,publish-content.apply,publish-content.write,library-publish}.test.ts \
  apps/website/src/features/publish-content/__tests__/{planner,apply-loop,gated-hooks.confirmed-report}.test.ts \
  apps/website/src/features/publish-content/ui/__tests__/{phase,report-rows}.test.ts

cd /Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/admin
npx vitest run \
  src/features/publish-content/hooks/__tests__/use-publish-content-confirm.guards.unit.test.ts \
  src/features/publish-content/__tests__/PublishContentDialog.unit.test.tsx \
  src/features/publish-content/__tests__/publish-content-L057.characterization.unit.test.tsx \
  --maxWorkers=2
```