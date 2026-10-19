Programmer(Execution): Chosen for the test setup fix. Added the existing isolation helper as the first import in all eight files. Static inspection confirmed paths and `.js` suffixes. Comments and assertions preserved.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/website/src/features/deployments/deploy-ops/__tests__/secrets.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/deployments/static-publish/__tests__/adapter.plugin-targets.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/deployments/static-publish/__tests__/observability.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/deployments/static-publish/__tests__/publish-run.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/fs-files/__tests__/wiring.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/media/__tests__/blob-store.s3.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/members/__tests__/invariants.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/deployments/static-publish/__tests__/adapter.unit.test.ts

NOT DONE: Tests, typecheck, builds, and package scripts were not run, as instructed. Git state untouched. `adapter.unit.test.ts` reaches the guard through module-scope `createRouteDeps()`; runtime success remains unverified.
