# D0c design (UNJUDGED DRAFT, written by the wave3/desktop-d0c run, 2026-11-18)

Status: **draft for the judge. Edits no source.** The D0 sheet requires this design to exist and be judged before D0c1/D0c2 run. It was written from the tree `origin/refactor/terra` + `origin/wave2/desktop-d0` (merge `9a3fe339`) by reading imports with a script (`#src/` and relative specifiers resolved, type-only imports not followed). Nothing was built or run, so every "green alone" boundary below is designed, not proven.

## 1. Drift from the sheet's table (this is the STOP)
Run inventory command from the sheet, on the merged base:

| Sheet row | Sheet path | Now |
|---|---|---|
| 13 | `server/runtime/boot/startup-secrets.ts` | **moved** to `platform/secrets/startup-secrets.ts` (`747caa90a`); both desktop importers (`main/index.ts:115`, `tovu-server.ts:31`) use the new path; the sheet's "tests that move" list names the old directory |
| new | - | `server/runtime/composition/jini-routes.ts` (60 lines; `desktop-agent.ts:40` imports `daemonRouteHost`, `mountJiniRoutes`). Not in the sheet: added by daemon R7-G1 |
| 16 | `site-paths.ts` (221) | now **367** lines; closure is 12 files / 1283 lines |
| 9-12, 14, 15 | as listed | unchanged paths |

Set is 9 modules, not 8: a different set is a STOP in the sheet's own words. `stage-website-shared.ts` line 9 still names the old startup-secrets path in its header.

## 2. Closure per module (leaf class: PURE / NODE / LOC = derives a root from its own file / HOST = host composition)
| Module | Closure inside website | Location use | Verdict |
|---|---|---|---|
| `process-error-guards.ts` (165) | itself only; externals `@jini-ai/core/primitives`, `@jini-ai/diagnostics/observability(+/node)` | none | **MOVES.** Closed. Independent installs (sheet decision 3) |
| `product-events.ts` (108) | itself only; `@jini-ai/daemon/tool-audit`, `@jini-ai/analytics/product` | none | **MOVES.** Closed |
| `observability-export.ts` (48) | + `contracts/core/runtime-mode.ts` (33) + `platform/site-dir/product-root.ts` (176) | **LOC** via `resolveCheckoutRoot` default `fromDir = import.meta.dirname` (product-root.ts:137) | **MOVES with an injected seam**: the existing option `checkout` becomes **required** (`{ env, packagedDesktop, checkout }`); the website passes `existsSync(path.join(resolveCheckoutRoot({}), '.git'))`, the desktop passes its own. `runtime-mode.ts` (pure, 33 lines) must move too (it is shared by `build-release.ts`): see D0c1 step 2. Changing the default changes behaviour in a packaged build, so P is owed |
| `product-telemetry.ts` (267) | + product-events, observability-export, runtime-mode, product-root, `build-release.ts` (45; `processBuildRelease` calls `resolveProductRoot({})`) | **LOC**: `INSTALL_ROOT` (`:35`, five levels up), `KEEP_ROOTS` (`:37`), `resolveOptions.paths` (`:124`), `createRequire(import.meta.url)` (`:117`); DYN (`:120-121`) | **SPLIT.** Desktop uses only `bootProductTelemetry` and `createProductConsentReader`. `loadProductProviders`, `INSTALL_ROOT`, `KEEP_ROOTS`, both dynamic imports STAY in the website (sheet decision 1). `createProductConsentReader` (`:53`, `node:fs` seams, no roots) MOVES. `bootProductTelemetry` MOVES only if `loadProductProviders` is passed in (port `ProductProviderLoader`); the `sanitize` at `:159` takes `keepRoots` as a required argument. The desktop twin in `main/updates/` supplies `{ installRoot, keepRoots, release, providers }` from the desktop's own roots, importing providers statically |
| `startup-secrets.ts` (44) | itself; `@jini-ai/sidecar/supervisor/node` | none; **module state** | **MOVES.** One instance per process in each app (website child and desktop main are different processes: correct). Name list is an installation compatibility surface: unchanged |
| `assistant-daemon-connection.ts` (47) | + `assistant/daemon-access.ts` (103) + startup-secrets | none; module state | **SPLIT** per sheet: schemas + `DaemonSiteRegistration` type + `daemonEndpoint`/`daemonControlRequest`/`siteIdleStopReply` as needed by `desktop-agent-service.ts:19` go to `@tovu/host-shared/daemon-connection`; module-state setters STAY. NOTE: the desktop imports **three functions + a type**, not "three schemas + one type" as the sheet says: re-read the consumer before moving; if the functions pull `daemon-access.ts` (103) the closure is still under 400 lines |
| `features/agent-plugins/host-signals.ts` (85) | + `bundled-contribution-sources.ts` (18) + `bundled-catalog.ts` (169) = 272 lines; `@jini-ai/agent-plugins/manifest`, `@tovu/contracts/host-signals` | none (reads dirs passed in) | **MOVES** (272 < 400, so the sheet's "do not move" rule does not trigger) |
| `site-paths.ts` (368) | 12 files, 1283 lines, `product-root.ts` LOC, `js-yaml`, worker_threads | **LOC** | **STAYS.** The desktop needs only `bundledAgentPluginsDir`, which `site-paths.ts:213` re-exports from `product-root.ts:173` and which defaults to a location-derived root. Do not move product-root. `desktop-host-signals.ts:27` should receive `bundledSourceRoot` as a required argument computed by the desktop from its own packaged resources (the same dir as in the staged payload), or `bundledAgentPluginsDir` gets an injected `productRoot`; decide in D0c2 step 0 after reading `stage-payload-lib.ts` |
| `jini-routes.ts` (60) | itself; `@jini-ai/http-kit`, `@jini-ai/http-kit/node-bridge`, `node:crypto` | none | **MOVES** (closed). Candidate for Jini `http-kit` instead of host-shared: it imports only Jini packages and has no Tovu vocabulary. Owner question (section 5) |

## 3. Package shape
`packages/host-shared` -> `@tovu/host-shared`, `tsc` NodeNext like `packages/contracts`, `exports: "./*"` mapping to `dist/*.js`, `file:` dependency of `apps/website` and `apps/desktop`. Runtime dependencies it would need: `@jini-ai/core`, `@jini-ai/diagnostics`, `@jini-ai/daemon`, `@jini-ai/analytics`, `@jini-ai/sidecar`, `@jini-ai/agent-plugins`, `@jini-ai/http-kit`, `zod`. These are many runtime deps for one package and every one of them must be inside the packaged closure (P). Because `@tovu/contracts` is `private: true` with `files: ["dist"]` and no `node_modules` ancestor exists for the staged website copy, the package must be listed in `stage-payload-lib.ts` before the staging step is deleted.

## 4. Commit list (one responsibility per commit; each green alone)
D0c1 (telemetry boot; needs P on a published Jini snapshot per DX-OD10):
1. `packages/host-shared` scaffold + build + both apps' `package.json` + lockfiles (npm; not the Jini pnpm lockfile trap). No code. Gate: `npm run build` in the package; `npm ci` at root and `apps/desktop`; desktop `typecheck`.
2. Move `runtime-mode.ts` -> `@tovu/contracts/runtime-mode` (pure; it is also read by `build-release.ts`). Repoint importers (census first; may exceed 80 files: then repoint commit then move commit).
3. `process-error-guards` (characterization first: two installs add two listeners; disposing first leaves one; disposing second returns to baseline; first disposer twice removes nothing more). Move + repoint website importer + desktop `product-telemetry-boot.ts:9`. Tests: move `process-error-guards.unit.test.ts`, `process-error-reporting.unit.test.ts` (check each reads the new path), `agent-daemon-installs-unhandled-rejection-guard.unit.test.ts` as an importer.
4. `product-events` move; desktop `product-telemetry-ipc.ts:3`.
5. `observability-export` with `checkout` required; website call sites pass the value they computed before; desktop `product-telemetry-boot.ts:10` passes the desktop's. Mutation: flipping the default packaging fact must turn one test red.
6. `product-telemetry` split (consent reader + boot with injected loader; website keeps `loadProductProviders`); desktop twin in `main/updates/`. S3: the twin contains no `import(`.
7. P steps 1-3 for D0c1 (stage, package, `verify-staged-closure.ts --asar`) once a Jini snapshot exists.

D0c2: `startup-secrets` (module-state test: second `initializeStartupSecrets` returns the same promise; `startupSecretEnvironment({ env: {} })` has no secret key); `daemon-connection` split; `host-signals` move + `bundledSourceRoot` argument; `jini-routes` (or Jini `http-kit`); last commit: remove `cpSync(... 'website')` at `verify-staged-closure.ts:39-40`, add the assertion that `@tovu/host-shared` and `@tovu/contracts` resolve inside the archive, delete `stage-website-shared.ts`, drop the `extraResources` entry, then P.

## 5. Questions for the judge / owner
1. Is `process-error-guards` + `jini-routes` (Jini-only imports, no Tovu vocabulary) better placed in Jini (`diagnostics`, `http-kit`) than in `@tovu/host-shared`? DX-OD1 says "8 shared Node modules"; there are now 9 and two of them look generic. Needs a yes before step 3.
2. `observability-export` default `checkout` becomes a required argument (behaviour-neutral for the two callers, but it removes the only location-derived default). Accept?
3. `bundledAgentPluginsDir`: inject the root (desktop computes it) vs add an injected `productRoot` to `product-root.ts`. Decide with D0c2 step 0.
4. The sheet's D0c2 statement "three schemas + one type" does not match `desktop-agent-service.ts:19` (three functions + a type). Re-read before dispatch.

## 6. What was not verified
No build, no typecheck, no test run for this design. Closure resolution is a regex walk (it follows `import`/`export ... from`, not `import()`), so DYN sites were flagged by a second regex and not traced. Closures of `@jini-ai/*` externals were not examined.
