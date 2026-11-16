# size-02-app — design 02 (Tovu `composition/app.ts`) steps 0-3

Branch `refactor/size-02-app` (from `origin/refactor/terra`), Jini `origin/refactor/terra`, Node 24. Base `app.ts`: 2,690 lines; now 1,675. `createApp` is now ~40 code lines (app, `hasBackgroundWork`, ordered calls).

## Commits (all pushed)
| SHA | what |
|---|---|
| 3f58d1c9 | step 0: four characterization pin files + route-table snapshot |
| 549336b7 | `startSettingsRegistration` -> `settings-registration.ts` (deps.ts repointed) |
| aad263bd | `CreateAppOptions` -> `create-app-options.ts` (prerequisite, see deviation D1) |
| cdf80b13 | `mountRoutes`/`startModule` -> `http-app/module-handles.ts` (pulled ahead of step 2, D2) |
| 9a1b7beb | `siteAppBootWorkByDeps` + `trackByokBootWork` -> `site-app-boot-work.ts` (deps.ts, lifecycle pin repointed) |
| 4a2bed26 | `subscribeSiteEventHandlersOnce` + WeakSet -> `site-event-subscriptions.ts` (verbatim) |
| 02103493 | split it: guard + 4 per-family functions (was 55 code lines) |
| a5f1a4bc | step 2: `applyPublicMiddleware`, `registerSiteIdlePark`, `registerAdminSpa`, `registerSiteChatBundle` -> `http-app/public-middleware.ts` |
| 6e7b3b4e | `http-app/visitor-submit.ts` (comments / analytics / forms registrations) |
| 647f5040 | `mount-public-site.ts` |
| b5e92a53 | `mount-admin-data.ts` |
| e38fc0ce | `mount-assistant.ts` (internalRouter + `bootWorkByDeps` passed in) |
| c4940979 | `mount-admin-features.ts` |
| 827ef007 | `mount-admin-system.ts` (5 sub-mounts, file order) |
| c3789f04 | `mount-members-newsletter.ts` |
| b063ec97 | its two deps builders split out (was 53 code lines) |
| 28716705 | `mount-core-content.ts` (returns `isAuthenticatedPreviewRevision`) + repoints `serving-app-boot-wiring.unit.test.ts` |

## Pins added (all green on the unmodified tree, `__tests__/create-app-*.pin.test.ts`, 32 tests)
- `route-table`: router-stack walk (index, method, path, handler names, nested routers) for default / `activateAssistantFederation` / admin assistant off / `themeIdOverride` / cookie consent present / `consentAudit` / `stopForIdle`; snapshot `fixtures/create-app-route-table.snapshot.json` (regen with `UPDATE_ROUTE_TABLE_PIN=1`).
- `precedence`: admin gate answers `/api/admin/*` (401, not the catch-all); site `/` 200 HTML; security headers; oversized body -> JSON 413 from the closing handler; `/api/admin` failure-tracker middleware.
- `lifecycle`: subscription order transcript, once per bus / again on a second deps; `siteAppBootWorkByDeps` tracking with a held-open `ready` (resolve + reject), `onBootWork`, deps without a collector; `recoverAssistantChatRuns` reaches the chats module (2 passes vs 1, none with admin assistant off); exactly one idle-stop hook with `stopForIdle`, none without; share-backend / sending-campaign veto.
- `visitor-capabilities`: registrar called once per `createApp`; salt derived once per app from the keyring (not per read), explicit env wins, rejecting keyring -> dev constant (existing behaviour, recorded); analytics/forms ports; `readUploadFreeBytes` undefined for remote media without `statfs`; exact "form uploads require the site's System principal" error.
- Mutation proof (each applied locally, pin failed, reverted; run on the original `app.ts` positions): member-pages/site-catch-all order swap, `themeIdOverride` ignored, oversized responder removed, admin locals middleware dropped, subscribe-once guard removed, boot work never removed / not handed to `onBootWork`, stop hook not registered, `recoverInterrupted` dropped, share-backend veto removed (first attempt MISSED — swallowed by the stop's catch — fixed with a spy), salt resolved lazily, remote-media still probing disk, System-principal message changed. 13/13 caught after the fix. Not re-run against the moved code (time).

## Verification
- `tsc -p tsconfig.json` 0 after every commit; `tsc -p tsconfig.tests.json` 0 after step 0 (not re-run at the end).
- `check:boundaries`: 111 violations (16 errors, 95 warnings) before and after every commit; no new cycle.
- `check:size` / `check:complexity`: no new or worsened line vs the base output in any commit. New files: every function <=50 code lines (own measure, ts-morph); eslint clean on new files.
- Test set (24 files: pins + source-reading + create-app suites): 182 tests, 181 pass; the one failure (`agent-daemon-import-graph`: "static runtime graph reaches none of ADR-070's forbidden modules") fails identically on the unmodified tree.
- Broader run (228 files in composition/server/unit/integration/boundary dirs) was stopped at the time cap, ~1,300 tests in; every failing test name there also fails on the base tree (Postgres/PGlite, packaged-provider bytes, boot-listener, vault etc.; compared by name against a base run of the 40 candidate files) — no head-only failure seen. Coverage of the 426 `createApp` importers is NOT complete.

## Deviations / findings
- D1: `CreateAppOptions` could not stay in `app.ts` (design §2): every helper/mount takes `Pick<CreateAppOptions, ...>`, which would import `app.ts` and close a cycle. Moved to `create-app-options.ts` (types only; `serving-app.ts` repointed).
- D2: `mountRoutes`/`startModule` moved before the subscriptions (step 2 item pulled into step 1), since the subscriptions call `startModule`.
- D3: the design cites `sqlite-create-site-app-module-identity.integration.test.ts` as reader of `siteAppBootWorkByDeps`; it does not reference it on this base (the lifecycle pin is the module-identity guard instead).
- D4: source-reading test `serving-app-boot-wiring.unit.test.ts` ("createTrashModule is mounted by exactly one composition, and it is app.ts") failed from c4940979 (I ran only pins per commit) until 28716705 repoints it to `http-app/mount-admin-features.ts`. Assertion kept, test count unchanged. The history therefore has one commit (c4940979..827ef007..c3789f04..b063ec97) where that one test is red.
- The `themeIdOverride` "preview switcher absent" check is carried by the route-table pin (middleware rows differ), not an HTTP render.
- Unpinned: `startModule(siteAssistantModule)` before it is mounted (observable only via its boot log); `isAuthenticatedPreviewRevision` hand-off is compiler-enforced only.
- `check:architecture` already fails on the base tree (4 regressed metrics, baseline stale); runtime propagation cost 3.16 (base) -> 3.21 after step 3 (+0.05), back-edges/API-surface unchanged vs base. Not gated by me.
- Stale-comment note: the "Built ONCE ... 53 back-edges into this file / check:architecture" comment moved verbatim into `mount-assistant.ts`; "this file" now means that file.
- Stale debt: `size-debt.json` entry `app.ts createApp#1 [max-lines-per-function] 247` is now stale (step 7 cleanup).
- Owner decision 02-a (remove the `createApp` default, `createInMemoryApp()`, 68 zero-argument callers) is phase P2 after step 7, so NOT done; left for a later run.
- Untracked test artifacts `sites/tovu-dev/...` produced by test runs were not committed.

## Next step
Design step 4 (in-place splits in the in-memory root: trash adapters Map, attachment purge loop, apply port, share-check script), then 5-7, then P2 once 02-a is applied. `app.ts` still holds both roots (`createRouteDeps` 880 lines) as designed for phase 1.
