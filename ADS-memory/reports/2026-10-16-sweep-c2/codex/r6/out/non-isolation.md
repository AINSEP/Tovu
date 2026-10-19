Programmer(Execution): Chose Programmer for root-cause tracing and minimal test-fixture repairs.

CHANGED FILES:

- [/Users/la/Programming/Tovu/apps/website/src/server/runtime/boot/__tests__/site-key-boot-notice.unit.test.ts](/Users/la/Programming/Tovu/apps/website/src/server/runtime/boot/__tests__/site-key-boot-notice.unit.test.ts)
  VERDICT: stale test since `fec2a6a9f`; the notice catches the home guard and reports an indeterminate key. Added isolation first and pinned child env, preserving its empty HOME.

- [/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts)
  VERDICT: stale test since `fec2a6a9f`; home validation precedes backend validation, masking both expected errors. Added isolation first.

- [/Users/la/Programming/Tovu/apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts](/Users/la/Programming/Tovu/apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts)
  VERDICT: stale test since `fec2a6a9f`; the child reaches the home guard during database-path resolution before readiness. Added isolation first and passed `isolatedCatalogEnv`.

Reused the existing isolation helper. Assertions and comments remain unchanged. `git diff --check` passed.

NOT DONE: Tests, typecheck, builds, and package scripts were not run, as instructed; runtime results remain unverified. No git-state changes or protected production-file edits. No additional production defect established by source inspection.
