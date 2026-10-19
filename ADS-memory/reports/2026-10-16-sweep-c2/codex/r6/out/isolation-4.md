Programmer(Execution): Chose Programmer for the minimal test setup change.

Added the existing isolation helper as the first import in all ten tests, matching sibling style. Static verification confirmed correct paths and preservation of every pre-existing byte, including comments.

CHANGED FILES:

```text
/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/__tests__/create-app-comments-rate-limit.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/__tests__/create-app-page-head-registry.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/__tests__/create-site-app-theme-override.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-failure-release.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/__tests__/create-site-route-deps.pglite.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/__tests__/declared-content-types-wiring.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/__tests__/deps-observability-wiring.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/__tests__/open-site-store.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/__tests__/pages-html-revisions-wiring.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/__tests__/redirects-phase-disposed-on-store-close.integration.test.ts
```

NOT DONE: Tests, typecheck, builds, and package scripts were not run, as instructed. Runtime success remains unverified. No git commands were run; Jini was untouched.
