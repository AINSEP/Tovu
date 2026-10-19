Programmer(Execution): Loaded Programmer for the narrow test setup fix. Added the existing isolation helper as the first import in all ten files. Static inspection confirmed paths and ordering; existing comments and assertions were preserved.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/create-app-event-subscriptions-once.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/database-migration-reconciliation-boot.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/design-c-package-themes-dir-wiring.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/dev-capability-origin-scheme.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/hydrate-blob-store-boot.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/observability-wiring.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/publish-content-export-no-leak.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/serving-app-outbox-drain.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/serving-app-trash-sweep.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/site-title-write-composition-roots.integration.test.ts

NOT DONE: Tests, typecheck, builds, package scripts, and git operations were not run, as instructed. Runtime results remain unverified.
