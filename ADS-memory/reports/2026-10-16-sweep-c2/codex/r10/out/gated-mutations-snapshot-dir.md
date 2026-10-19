Programmer(Execution): Programmer persona selected for the minimal test correction.

CHANGED FILES:
- [gated-mutations-real-composition.unrun.integration.test.ts](/Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/gated-mutations-real-composition.unrun.integration.test.ts:167)

Reused `site.deps.siteStoragePaths.contentDbPath` to derive the expected directory. Source tracing confirms snapshots are written beside content.db, now under `data.nosync/`. Header and comments preserved.

NOT DONE: Tests, typecheck, builds, package scripts, and git mutations, as instructed.

VERDICT: stale test since `1cffdf3cf5e9e09f724cc32d1a5d0d0c3d890283` (2026-10-09), which introduced the database layout.
