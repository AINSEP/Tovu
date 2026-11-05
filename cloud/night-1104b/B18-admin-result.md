Programmer(Direct): Implemented P18’s alias, wrapper adjustment, and focused tests.

Root causes: unknown `/assistant` routes reached the Dashboard fallback in [App.tsx:220](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/admin/src/App.tsx:220); the four adapters had redundant outer lazy imports.

Files changed:

- [App.tsx](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/admin/src/App.tsx:125): exact alias matching, query-byte preservation, existing replacement redirect reused.
- [panel-pages.ts](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/admin/src/panel-pages.ts:27): Comments, Redirects, SEO, and Widgets adapters eager; Jini pages remain deferred.
- [Alias tests](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/admin/src/__tests__/unit/app-assistant-alias.unit.test.tsx): direct/SPA navigation, history, trailing slash, fallback, no Dashboard mount.
- [Loading tests](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx): synchronous adapters, deferred loaders, cached reuse.
- [Boot tests](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/admin/src/__tests__/app-boot-request-volume.test.tsx:95): stable shell/dock and unchanged bootstrap/settings counts across navigation.

Tests were written first but **not run**, as instructed. Whitespace checks passed. No builds, servers, commits, or changes to other jobs. Added API reads/writes/polls: **0 × 0 bytes**; emitted wrapper-byte impact remains unmeasured.

| Assessment | Disposition | Remaining evidence |
|---|---|---|
| Parser and loading changes | Inconclusive | Test execution, coverage, Chrome trace |

For the trace, use an isolated deployment away from ports 3000/5173 on a quiet Mac: one admin tab, no active chats/background jobs, no throttling. Record [Performance runtime traces with screenshots](https://developer.chrome.com/docs/devtools/performance/reference/), separating first visits from repeat visits and development from production. Repeat the same route sequence five times before/after; compare click-to-useful-paint and loading duration. Inspect request bytes, initiators, queueing, TTFB, and script evaluation; confirm SPA navigation adds no Document or `/auth/me` request. Export traces and a sanitized [HAR](https://developer.chrome.com/docs/devtools/network/reference/). Route splitting and prefetch remain deferred.

Exact focused test command—**not run**:

```bash
cd /Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/admin
npx --no-install vitest run --maxWorkers=2 --testTimeout=60000 \
  src/__tests__/unit/app-assistant-alias.unit.test.tsx \
  src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx \
  src/__tests__/app-boot-request-volume.test.tsx
```