# T1 (Tovu, D0c1a): the desktop mounts its daemon routes with `@jini-ai/server`; `jini-routes.ts` stays (edits one repo: Tovu; Codex-ready after J1 lands)

Design: `../D0c-REVISION-4.md` (Q1 option C). The website's `jini-routes.ts` and its request facts are not touched.
Jini for verification: the J1 branch tip. New desktop dependency: **`@jini-ai/server`** (runtime; it brings `@jini-ai/http-kit` and `@jini-ai/registry` transitively, which today reach the desktop only inlined in the staged `jini-routes.ts` bundle). Landing manifests (COMMON section 6): `apps/desktop/package.json` only (the website does not use the new subpaths).
Named tests: `apps/website/src/server/runtime/composition/__tests__/jini-routes.unit.test.ts`, `apps/desktop/src/desktop-agent.test.ts`.
Expected staging list on `C` (8): `src/features/agent-plugins/host-signals.ts`, `src/platform/secrets/startup-secrets.ts`, `src/server/runtime/boot/process-error-guards.ts`, `src/server/runtime/composition/observability-export.ts`, `src/server/runtime/composition/product-events.ts`, `src/server/runtime/composition/product-telemetry.ts`, `src/server/runtime/composition/site-paths.ts`, `src/server/runtime/lifecycle/assistant-daemon-connection.ts` (on `P`: those plus `src/server/runtime/composition/jini-routes.ts`).

## Files to change (one commit: `refactor(desktop): daemon route lists mount through @jini-ai/server, not the website's jini-routes`)
- `apps/desktop/src/desktop-agent.ts:40`: replace the import with `import { mountRoutes } from "@jini-ai/server/mount-routes";` and `import { presetRouteHost } from "@jini-ai/server/route-host";`.
- `:381` `daemonRouteHost({ context: adapter, parserLimitBytes: 4 * 1024 * 1024 })` -> `presetRouteHost({ ... same argument object ... })`.
- `:382`, `:383` `mountJiniRoutes({ app, routes: ... })` -> `mountRoutes({ app, routes: ... })` (same arguments).
- `apps/desktop/package.json` `dependencies`: `"@jini-ai/server": "^0.7.0"` (beside `@jini-ai/sidecar`), then `npx npm@11.12.1 install --package-lock-only --ignore-scripts` in `apps/desktop` (writes `apps/desktop/package-lock.json`).
- `apps/desktop/src/dist-import-check.test.ts:111-121`: append `"server/runtime/composition/jini-routes"` to `MOVED_WEBSITE_MODULES`.
- Nothing in `apps/website`, `development` or `packages` changes.

What changes on the desktop's request path, and why it is equal (pinned by the tests below): Tovu `mountJiniRoutes` computes request facts per request (`jini-routes.ts:33-37`: `requestFactsLocals({ req }, { base: res.locals })`); Jini `mountRoutes` passes `res.locals` unchanged (`mount-routes.ts:39-43`). No desktop route reads `locals` (`rg -n locals <jini>/packages/daemon/src/http/{delegated-tools,tool-catalog}.ts` is empty; `git grep TOVU_REQUEST_FACTS -- apps/desktop` is empty). Jini adds an app-shape check (`mount-routes.ts:21-23`; Express passes it) and `recordRouteRegistrations` (`:36`; returns at once when no route guard is installed, `http-kit/src/route-registration-guard.ts:121-122`, and the desktop installs none). Same dispatcher options (`expressCompatible: true`; the desktop passed no `redactionPatterns`), same parsed body. `presetRouteHost` and `daemonRouteHost` build the same object (same reporter, scheduler, constant-time compare, `maxReserializedJsonBytes`).

## Characterization tests to add (written first on `P`, green there; values observed on `P` are written in literally)
In `apps/desktop/src/desktop-agent.test.ts`, inside the existing bridge test setup (`startBridgeServer`, as the test at `:153` does):
1. a request with a live credential to a path neither list owns (e.g. `GET /api/tools/unknown-path`) -> the status and body observed on `P` (it falls through both list layers to Express's final handler).
2. a delegated tool call with a live credential and a body the route rejects (an empty JSON object `{}`) -> the status and JSON body observed on `P`.
Existing pins, unchanged: `desktop-agent.test.ts:153-192` (bearer gate `:164-165`, catalog `:171`, delegated call `:175`, gap list `:178`, foreign run `:180`).
Red check: in `desktop-agent.ts`, delete the `mountRoutes({ app, routes: delegatedToolRoutes(...) })` line -> `:175` fails (and new case 2 changes status).

## STOP conditions
- `git grep -n "jini-routes\|mountJiniRoutes\|daemonRouteHost" -- apps/desktop` prints other lines than `src/desktop-agent.ts:40`, `:381`, `:382`, `:383`.
- `git grep -n TOVU_REQUEST_FACTS -- apps/desktop` prints anything.
- `apps/desktop/package.json` already declares `@jini-ai/server`.
- The lockfile command fails (no registry access): commit nothing more, report.
