Programmer(Direct): Chosen for minimal fixture repairs and failure tracing; persona loaded.

Reused catalog isolation, temporary-directory APIs, and composition teardown. Assertions and “why” comments remain intact.

CHANGED FILES:

- `/Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts`
  VERDICT: stale test since `b6dc01809`; added temporary site/database paths and teardown.
- `/Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/publish-content-export-no-leak.integration.test.ts`
  VERDICT: stale test since `b6dc01809`; added temporary paths and server/store/database teardown.
- `/Users/la/Programming/Tovu/apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts`
  VERDICT: stale test since `fec2a6a9f`; added isolation as the first import.
- `/Users/la/Programming/Tovu/apps/website/src/cli/__tests__/unit/export-command-boot-work.unit.test.ts`
  VERDICT: stale test since `fec2a6a9f`; isolation prevents the pre-composition throw.
- `/Users/la/Programming/Tovu/apps/website/src/cli/__tests__/unit/plugin-command.unit.test.ts`
  VERDICT: stale test since `fec2a6a9f`; isolation lets execution reach plugin validation.
- `/Users/la/Programming/Tovu/apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts`
  VERDICT: stale test since `fec2a6a9f`; isolation lets execution reach the composition mock.

NOT DONE:

- Tests, typechecks, builds, and package scripts were not run, as instructed. Results remain unverified.
- Git state, Jini, and protected production files were untouched.
