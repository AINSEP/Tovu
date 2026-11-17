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


# Run 2 — size-02-cont (design 02 steps 4, 5 (partial), 6 (blocked), 7, phase P2)

Branch `refactor/size-02-app` (continued from `1f1455fc`), Jini `origin/refactor/terra` `02edbb68` (not edited; my Tovu commits do not name it in their messages — they were pushed before I noticed the owner rule; there is no Jini change in this run). Node 24. `app.ts`: 1,675 -> **1,003** lines (2,690 at the original base). `createRouteDeps`: 880 -> **460** code lines. `createApp` unchanged (~40).

## Commits (all pushed, in order)
| SHA | what |
|---|---|
| ef5ae2e1 | step 4 pin: `memory-root-trash-adapters.pin.test.ts` — trash/list/restore round trip for post, redirect, comment, media, form, form_submission, widget, menu through `routeDeps.trash` (9 tests) |
| d46ed911 | step 4: post/redirect/comment/media adapters -> `memory-deps/slices/trash-adapters-content.ts` |
| 547d3fb6 | step 4: form/form_submission/widget/menu adapters (deferred repos as getters) -> `trash-adapters-forms-widgets.ts` |
| 2711a212 | step 4: term/taxonomy adapters + the Map (`composeMemoryTrashAdapters`, 38-line file) |
| 3e2249e1 | step 4: attachment purge loop (27 lines) -> `form-attachment-purge.ts` (reader / remover / wiring) + 5 interface-fake unit tests |
| 78157857 | step 4: apply port + ports bag -> `publish-apply.ts`; share check script `cloud-results/work/size-02-apply-ports-share-check.cjs` |
| 323dcce3 / 4fd7b21e / 50154409 | **P2** 3a `createInMemoryApp()` in `memory-route-deps.ts` (3 tests) · 3b the 27 calls in 8 files · 3c `createApp` default removed |
| 08e06741 | step 5: five runs at once — `member-secrets`, `repos`, `identity-settings`, `site-title-settings`, `origin-newsletter` (+ `lazy-proxy.ts`, `ports.ts`) |
| 635e076b, 62844c65, 53daedbd | step 5: `taxonomy-trash-repos`, `nav-form-content-repos`, `publish-content-stores` |
| 225f954a | step 5: `memory-trash.ts` (Trash service + adapter wiring + `removePlugin`) |
| 3927ef58 | step 5/6 piece: `outbound-http.ts` (guarded client + OAuth ports) + egress-policy pin (`outbound-http.test.ts`) |
| b5980e4d, 9b1b886e, 9f8b6c62 | step 5: `seo-sitemap`, `agent-plugins` (repoints `wiring-identity` row 7), `comments` |
| 86fcc8f9 | repoints `external-mcp-oauth-loopback-wiring` (see D-R2-3) |
| c0c63b36 | **step 7**: `size-debt.json` — `createApp#1` entry deleted; `createRouteDeps` lines 879 -> 460, `app.ts` file lines 1703 -> 653; `src-complexity-debt.json` — `createRouteDeps` complexity 13 entry deleted (it is now <= 10) |

## What was NOT done (honest scope)
- **Step 5 is partial.** Moved: 14 slice files, ~500 lines. NOT moved: the 530-line `routeDeps` literal (the bulk of what is left in `createRouteDeps`) and the few statements beside it (`redirectsWriteDeps`, `pluginRuntime`, consent/plugin-exports, `publishContentSeedHash`, chat history). `createRouteDeps` is still 460 lines, so it keeps its size-debt entry. Reason: splitting the literal needs ~130 typed inputs per fragment; I had no cheap, honest typing route inside the budget and did not improvise one. Next run: build one `MemoryRootContext` type from the slices' `ReturnType`s and cut the literal into ordered fragment functions (no getters in the literal; no `routeDeps` self-reference inside it — checked by reading, not yet by script). `createRouteDeps` also still stays in `app.ts` (the P2 note "joins `memory-route-deps.ts` at the end of step 5" is therefore NOT done; `createInMemoryApp` imports it from `./app.js`, no back edge).
- **Step 6 is blocked, not done.** It needs design 01 step 6 (`composition/guarded-outbound-http.ts` shared with `deps.ts`); that file does not exist on this branch. I only moved the memory root's own copy (`outbound-http.ts`) and pinned its policy whole (`toEqual`-style, 3 fields mutated -> fails). When design 01 step 6 lands, both roots point at the shared function.
- Step 4's "apply ports shared" is **recorded, not applied**: the script shows both roots use the SAME port set (`post/media/redirect/menu`, `buildContentPublishPorts` args, `theme-files`), but the shared `publishContentPorts` belongs to design 01 (absent), so the memory root has its own two functions.

## Gates (final tree `c0c63b36`)
- `tsc -p tsconfig.json` 0 · `npm run typecheck:tests` 0 (after 3c, no zero-arg caller left; the compiler found exactly the 27 calls in 8 files the amendment predicted — 26 zero-arg + 1 `createApp(undefined, {onBootWork})`; no dev script / desktop file calls it without a root). `tsc -p development/tsconfig.scripts.json` shows 3 errors that are identical on the unmodified tree.
- `check:boundaries`: 111 violations (16 errors, 95 warnings) = base; no new cycle (type-only cycles avoided: `CreateRouteDepsOptions` still lives in `app.ts`, so no slice reads `options`).
- `check:size`: no new/worsened line; the base "Worsened createRouteDeps 880 (baseline 879)" and "Delete stale createApp#1" lines are gone. `check:complexity`: no new line; one stale entry removed. (Both still exit 1 on other files' pre-existing violations.)
- Tests: final set = 43 files (the 18 baseline files + source-reading tests naming `app.ts` + all pins + the 4 new files + the 8 files of 3b): **448 tests, 446 pass, 2 fail — both fail identically on the unmodified tree** (`agent-daemon-import-graph` ADR-070; `site-title-preservation` AC-12; the second one I confirmed by checking out `1f1455fc`).
- Owner-rule audits (`origin/tools/owner-audits-2026-11-16`, whole repo, filtered to my files): `owner-rules-audit` 1 finding (`swallowed-error`, `void siteTitleReady.catch(() => undefined)` in `site-title-settings.ts:44` — the line moved verbatim from `app.ts` line 409 at `1f1455fc`; not new code); `args-object-audit` 31 findings in my files, all in **moved verbatim** lambdas (`findById: required => …`, `hardDelete`, `transaction`, Proxy `get`/`has` traps) — every function I wrote is `(required, _optional = {})` or typed `required`. New findings from new code: 0.
- No new `eslint-disable` / `@ts-ignore`; every new file function <= 50 code lines (own AST measure; `eslint` on `memory-deps/` clean).

## The 13 mutations, re-run against the MOVED code (`cloud-results/work/size-02-mutate.py`; pins: lifecycle, precedence, route-table, visitor-capabilities, boot-work)
**13/13 caught** — each applied to the file that now holds the code, pin failed, reverted (tree clean afterwards): 1 member-pages/site-catch-all order swap (`mount-public-site.ts`; 8 fails incl. route table) · 2 `themeIdOverride` ignored (`public-middleware.ts`; route table) · 3 oversized responder removed (`app.ts`; 9) · 4 admin locals middleware dropped (`app.ts`; 1) · 5 subscribe-once guard removed (`site-event-subscriptions.ts`; 1) · 6a boot work never removed / 6b not handed to `onBootWork` (`site-app-boot-work.ts`; 2 / 5) · 7 idle-stop hook not registered (`public-middleware.ts`; 4) · 8 `recoverInterrupted` dropped (`mount-assistant.ts`; 2) · 9 share-backend veto removed (`app.ts`; 1) · 10 comments salt resolved lazily (`visitor-submit.ts`; 1) · 11 remote media still probes disk (`visitor-submit.ts`; 1) · 12 System-principal message changed (`visitor-submit.ts`; 1).
New-code mutations also caught: trash markers (status/deletedAt/priorStatus, hide/show), reader keyset (`>=`, limit+1), remover no-op, missing-adapter message, apply-port `contentTypeStore` / menu `bindingRepo` / `runRepo`, egress policy (`denyPrivateAddresses`, `maxRedirects`), `createInMemoryApp` memoized root / dropped options.

## Deviations / findings
- D-R2-1: step 4 was done **at the moment of the move** (builders written straight into slice files), not as in-place splits in `app.ts` first — an in-place split would have grown `app.ts`, which is under the shrink-only ratchet. Every builder body is verbatim (script-extracted, why-comments included).
- D-R2-2: commit `08e06741` carries five slice moves (they were generated as one batch); the other 10 are one responsibility each.
- D-R2-3: **red commits.** `3927ef58` (outbound-http) through `9b1b886e` (agent-plugins, 3 commits + `b5980e4d`) leave `external-mcp-oauth-loopback-wiring.unit.test.ts` red (it reads `app.ts` for the `createTovuOAuthHttpPorts` call); fixed forward in `86fcc8f9` (file list repointed, assertions unchanged, 2 tests before = after, title now names `../memory-deps/slices/outbound-http.ts`). I ran the pins + a fast set per commit, not every source-reading test, until `agent-plugins` exposed this. Violates "no red commit"; recorded.
- D-R2-4 (**characterization gaps found, not closed**): (a) swapping the `term`/`taxonomy` entries in the memory Map is NOT caught by any test (both are SQL table adapters; the hermetic taxonomy repos have no seeded rows to trash); (b) the "one hoisted instance" identities (`assetRenditionRepo` shared with `mediaRepo`, `newsletterSubscriberDirectory` reading the same `memberRepo`) are not observable through any existing test — I mutated both and nothing failed. These are exactly the risks of the remaining slices; add observability pins before moving the literal.
- D-R2-5: `trash-adapters-taxonomy.ts` / `memory-trash.ts` etc. type inputs with the in-memory class names and `ReturnType<typeof slice>`; `memory-deps/ports.ts` holds `MemoryClock` / `MemoryIdGen` (two 3-line types shared by slices).
- D-R2-6: `createLazyProxy` moved to `memory-deps/lazy-proxy.ts` (not "private beside its user" as designed: it has two users — the content db and the consent store).
- D-R2-7: tool detail: moves were script-generated; the scripts are in `cloud-results/work/size-02-*.cjs` (AST statement listing, slice extraction, unused-import pruning).
- Untracked test artifacts (`chat.db`, `sites/tovu-dev/...`) deleted, not committed. No test process left running.

## Next step
(1) Add the two missing observability pins (D-R2-4). (2) Split the `routeDeps` literal into ordered fragments over a `MemoryRootContext`. (3) Move `createRouteDeps` into `memory-route-deps.ts` and repoint its ~488 importers by symbol. (4) Step 6 after design 01 step 6.
