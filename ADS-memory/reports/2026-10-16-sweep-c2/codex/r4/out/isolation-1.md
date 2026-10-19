Programmer(Execution): Chosen for the minimal test-only import repair.

Added the existing isolation helper as the first import in all ten files. Static inspection confirmed every relative path and `.js` suffix. Existing comments and test logic were preserved.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/website/src/features/trash/__tests__/tool-registrations.purge-ban.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/widgets/__tests__/integration/html-taxonomy-embeds.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/workspace/__tests__/tool-registrations.list.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/site-export/__tests__/route-manifest.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/site-export/__tests__/site-exporter.observability.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/site-export/__tests__/site-exporter.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/site-inspection/__tests__/deps.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/site-inspection/__tests__/published-page.observability.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/skills/__tests__/integration/skill-tool-search-ranking.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/skills/__tests__/unit/install-service.unit.test.ts

NOT DONE:

- Tests, typecheck, builds, and package scripts were not run, as instructed; runtime results remain unverified.
- No git commands were run or git state touched.
