Two test-only fixes are ready to sheet: the Jini daemon test that races an early 401 against a 1 MB upload, and the Tovu identity-settings test that reads the old composition file. I found pushed fixes for the forms concurrency test, form-delivery failure codes, missing Jini exports, and the desktop sign-in log. The archive-warning refusal is approved and still open. The current ZIP implementation and several integration tests explicitly allow warned files, so that work needs a complete fixture inventory before dispatch.

This was a read-only source review. I changed no files and ran no tests or builds. Line IDs below refer to the [live bug list](<tovu>/development/open-bugs.md). The source bases were Tovu `776ce6d0f` and Jini `d3e78b387`, with pushed refs used where cited. Tovu’s `origin/claude/uiux-split` was unavailable in this clone. The corresponding Jini ref was readable.

## Disposition

### Current reports and integration regressions

| ID | Disposition | Evidence or decision |
|---|---|---|
| 1271 / J-401 | READY-FOR-CODEX | Jini `packages/daemon/src/http/__tests__/tool-execution-rpc.test.ts:335–375` still sends the entire 1 MB on the early-401 case. |
| 1315 form-delivery status | RETIRE | `jz2-b` `6a156a70e` wires the CMS `failureCodes` allowlist at `forms/delivery/retry-policy.ts:35` into `infra/src/events/outbox/worker.ts:50–64,164–170`. Confirm the Tovu status projection after merge-7. |
| 1317 in-memory daemon core RPC | PARTIAL | The report identifies separate stores at `composition/app.ts:1303` on the old branch. The current composition and test entry point need tracing together. |
| 1318 federation reload listener | OWNED-ELSEWHERE ex-err-jini | The held branch touches `packages/mcp/src/federation/reload.ts`. |
| 1319 Recharts integrity pin | OPUS-CLOUD | Needs review of the published browser artifact and a pin update against those bytes. |
| 1321 media search ranking | PARTIAL | Jini `packages/cms/src/media/agent-tools.ts:147–164` says `alt` in the description and `alt text` in the schema. Tovu’s current `md-02` query and keywords already contain `alt text`. Establish the actual ranking before editing the descriptor or baseline. |
| 1322 vendor-neutrality test | PARTIAL | Compare the exact current assertions against the provider-plugin move. The November 16 report groups multiple files. |
| 1323 L244 no-op version bump | PARTIAL | Name the four cases that still increment under the combined version policy. The report leaves the suspected migration cause open. |
| 1324 class-only log-safety regression | PARTIAL | Form outbox codes have a pushed fix. Other log and admin paths need their individual assertions and current owners. |
| 1325 vault re-seal | OWNED-ELSEWHERE security fixes | The log names Jini `afe6152a`/`f8964b70` and Tovu `d071ae5d`/`49623287`. The separate copy-overwrite residual is at 1340. |
| 1326 lost updates | OWNED-ELSEWHERE lost-updates design | `designs/lost-updates/SITES.tsv` owns the 28 writes. |
| 1327 MCP isolation | OPUS-CLOUD | The reported branch change was reverted by `a619ab3b`. The remaining contract needs verification against the real CLI version. |
| 1328 A06 default-deny design | OWNED-ELSEWHERE A06 | The security review identifies defects in the pending split brief. |
| 1329 bidi check | OWNED-ELSEWHERE security fixes | Tovu `08d4d826` is the repair named at 1340. |
| 1330 raw capability accessor | OWNED-ELSEWHERE security fixes | 1340 names Jini `515baa14` and the Tovu caller repair. |
| 1332 run finalizer | PARTIAL | Verify the Jini public entry’s consumers and reproduce F1–F3 individually before any deletion or Tovu fix. |
| 1334 confirmation owner check | OWNED-ELSEWHERE security fixes | 1340 names Jini `9f19eeb9` for the truthiness fix. |
| 1335 ACP capability and protocol defects | OWNED-ELSEWHERE ACP-3/4/5 redo | The ACP research and redo lane own these protocol changes. |
| 1337 render split collision | OWNED-ELSEWHERE render combine | The reported collision is between the render repair and split. Reassess after merge-7 if the combined source regresses. |
| 1338 vendor names in core | OWNED-ELSEWHERE provider-plugin extraction | The GitHub and Lipay decisions and the package-boundary work already cover the proposed changes. |
| 1339 identity-seed rejection text | OWNED-ELSEWHERE error-system design | The log assigns `serve-command` to that lane. |
| 1340 vault copy-overwrite residual | PARTIAL | Resolve which four open-count assertions express the intended contract on the combined code before proposing a change. |
| 1341 static Electron updater import | RETIRE | Tovu merge-6 `apps/desktop/src/main/index.ts:110,471` statically imports `electron-updater`; the job log names `3a2075d10` and `main-updater-wiring.test.ts`. |
| 1342 hook injection | OWNED-ELSEWHERE injection-debt work | The two `direct-hooks.tsv` inventories own the sweep. |
| 1344 session revocation lost update | OWNED-ELSEWHERE lost-updates design | The later log names `wave2/lu-s1` for the session repository repair. |
| 1347 source-control credential probe | OWNED-ELSEWHERE SC-H1 / D-SC4 | 1368 names `wave2/lo-sc` as the pushed repair. |
| 1355 ratchet regressions | OWNED-ELSEWHERE combine gates | This is a merge-final aggregate. Merge-6 supersedes its recorded metrics. Distinct merge-6 warnings are below. |
| 1358 daemon error response classes | PARTIAL | The report combines run-store failure, upstream stream failure, and three memory routes. Each needs a route-specific failing case and ownership check against the error-system lane. |
| 1359 four integrations test failures | PARTIAL | Identify the four failing assertions and compare against merge-7. The log has no test IDs. |
| 1360 effective settings 400 | OUT OF SCOPE | The log marks the request unchecked and records no request parameters. |
| 1361 dependency cycles | OWNED-ELSEWHERE boundary and size lanes | The report names `serve-listen`/`serve` plus three generated agent-runtime cycles. |
| 1363 `site-share-errors.ts` shell | RETIRE | Tovu merge-6 puts `sendSiteShareFailure` in `routes/system/site-share-password.ts:53`. `site-shares.ts:1` and `__tests__/site-share-failures.test.ts:10` already import it there. |
| 1365 desktop local Jini link | OPUS-CLOUD | The report requires link setup, registry snapshot verification, and packaged desktop validation. |
| 1366 unsafe hrefs / non-string input | RETIRE | Jini `2dd420c3b`, present on merge-6, repairs `packages/cms/src/navigation/href.ts:93`. `navigation/__tests__/href.test.ts:47,53,57` pins the refusal and normal relative path. |
| 1371 chat redaction regression | OWNED-ELSEWHERE simple redaction redesign | The log names the repair lane. Owner approved the simple redesign. |
| 1372 embed widget crashes on mount | NEEDS-DECISION | Jini `chat/src/embed-widget/react/embed.tsx:50–58` lacks the provider required by `useChatPaneAgentControl.hooks.ts:244`. `embed.test.tsx:12–17` mocks the pane. Should the public mount require host-supplied `ChatSurfaces`? **Recommend yes**, retaining support for direct React consumers already wrapped in the provider. |
| 1373 desktop plan commit gate | OWNED-ELSEWHERE desktop D0c | The report names `COMMON.md` and D0c1/D0c2; it concerns execution of the existing plan. |
| 1374 desktop stage script / closure | OPUS-CLOUD | Verification requires the release workflow and staged app, including the shell flag and copied import. |
| 1375 redaction follow-up | OWNED-ELSEWHERE simple redaction redesign | The report names `chat-redaction-fix-2`. The error-gate issue is tracked separately by E11. |
| 1381 Agent Plugins 503 toast | OWNED-ELSEWHERE daemon-parked-503-toast | The following entries name the dispatched lane and toast commit `404192478`. |
| 1383 cold daemon behavior | NEEDS-DECISION | The log distinguishes the cold stream response from idle park. Should opening Agent Plugins wake the daemon or show that the assistant is starting? **Recommend showing the starting state**, with an actionable error reserved for a failed start. |
| 1384 share ZIP warns and includes files | PARTIAL | Still present after `tv-xd5-publish` in `features/site-backup/share-zip.ts:36–51,116–122`. Owner approved refusal. See the exact resheet blocker below. |
| 1391 saved-key abort wrapping | NEEDS-DECISION | Should import cancellation propagate `AbortError` or surface the wrapped `InternalError`? **Recommend propagating `AbortError`**, so a cancelled import reaches the existing cancellation path. Confirm the current wrapper before sheeting. |
| 1392 batch write / local-file search tests | PARTIAL | Reproduce the two missing `written` values and the search failure separately after merge-7. |
| 1402 merge-5 Jini/Tovu mismatch | RETIRE | The mismatch was between the two merge-5 tips. Merge-6 includes the ex-log reconciliation, as recorded at 1421. |
| 1403 ex-log skipped in merge-5 | RETIRE | Superseded by the merge-6 Group 0 reconciliation at 1421. Held `ex-err-jini` remains a separate branch. |
| 1404 Jini test type errors | PARTIAL | Merge-6 reports roughly 75 ex-log failures repaired. Identify surviving test compile errors after merge-7. The old count combines compile failures and missing build output. |
| 1405 generic ex-log messages | PARTIAL | Sign-in has a pushed fix. The remaining old report lacks a list of still-affected messages. |
| 1406 nine Tovu regressions | PARTIAL | The two sign-in failures have a pushed fix. Compare deploy, catalog, content targets, members and publish-trust against merge-7 before assigning the other tests. |
| 1407 architecture surface 831 | RETIRE | Merge-6 report at 1432 records 705 against baseline 821. |
| 1408 mixed-validity batch result | NEEDS-DECISION | Should a batch with one refused item return per-item outcomes or reject the entire request? **Recommend per-item outcomes** and an assertion for both the successful write and refused item. |
| 1409 http-kit workspace specifier | OPUS-CLOUD | Manifest and frozen lockfile must agree. |
| 1410 user-management positional hook exports | OWNED-ELSEWHERE public-args lane | The log names `fs-j-hooks` and the remaining exports. |
| 1411 typed-tools and local-file test drift | PARTIAL | Refresh the source-reader targets after merge-7 and isolate the local-file search failure. |
| 1416 turn-one design plugin missing | PARTIAL | `agent-daemon-run-start.ts:322–329` invokes preflight through the existing site-tools port. The report did not capture the installed, enabled plugin candidates and relevance result for the failing run. |
| 1417 oversized design guidance | NEEDS-DECISION | Should turn one include a short load instruction whenever relevant guidance exceeds the byte cap? **Recommend yes**, using the existing load tool and leaving the byte cap in place. |
| 1418 literal dispatch marker | NEEDS-DECISION | `tv-ub` retains the intentional prefix at `agent-daemon-run-start.ts:357–388`; `agent-daemon-server.page-context-wiring.unit.test.ts:21–37` pins it. Should product chat remove the marker for every CLI? **Recommend removing it from ordinary product runs**, after deciding how repository sessions retain their existing bootstrap behavior. |
| 1419 site guide lacks design-plugin pointers | PARTIAL | Verify the actual guide contribution and current plugin IDs after the latest plugin moves before editing Tovu guidance. |
| 1421 forms concurrency flake | RETIRE | `jy-pa` `996583807`, `submit-service.host-options.test.ts:417–434`, replaces array-position assertions with one rejection, one success and exactly one stored row. |
| 1421 trash EXDEV warning | RETIRE | Owner accepted the existing refusal and gate row on 11-20. |
| 1421 preview reload control | OWNED-ELSEWHERE admin extraction | Owner assigned `ThemePreviewReloadControl` to `@jini-ai/admin`. |
| 1425 missing exports | RETIRE | `jx-c6fix` `8b9cf400c` adds the entries in the CMS, devops and http-kit manifests. Follow it with `tv-xd5-render` / `tv-xd5-publish` in merge-7. Registry verification belongs to the release lane. |
| 1426 sign-in log | RETIRE | `jx-c6fix` `8b9cf400c`, `agent-plugins/src/admin-surfaces/connections/connections.ts:129–132`, restores plugin ID and error class. Includes the log-safety test update. |
| 1427 moved-tools catalog bytes | PARTIAL | Compare the exact mismatching projection from `assistant/__tests__/moved-tools.golden.test.ts` after merge-7. The log records drift without a changed field or intended value. |
| 1428 why-comments warnings | OWNED-ELSEWHERE tv-c6fix | `8761768b17` updates `development/why-comments-debt.json`. Gate result remains a combine check. |
| 1429 two error-gate warnings | RETIRE | `tv-c6fix` `8761768b17` uses `orFallback` in `desktop/src/tovu-server.ts` and preserves the cause in `cli/commands/stdin-input.ts:11`. |
| 1430 lost function splits | RETIRE | `tv-c6fix` `8761768b17` reapplies the `dev-auth.ts` and `assistant-byok.ts` changes. |
| 1433 outbound characterization | RETIRE | `tv-b1` `b9539e80f5`, `outbound-connections.characterization.unit.test.ts:8,18–23`, already targets `composePublishingPhase` in `boot-phases.ts`. |
| 1434 visitor approval failure | OWNED-ELSEWHERE round-2 visitor approval | The log explicitly queues a fix sheet and identifies error-gate row 155. |
| 1435 core export/pin mismatch | OPUS-CLOUD | Requires the `./errors/idioms` release and updates to both Tovu lockfiles. |
| 1436 ACP cancel wire shape | OWNED-ELSEWHERE acp-jini | The log assigns the fix to `acp-jini`. |
| 1437 ACP model-selection reply | OWNED-ELSEWHERE acp-jini | `ACP-4`. |
| 1438 resource menu keyboard handling | OWNED-ELSEWHERE hygiene-a | `H2-A11Y-RESOURCE`. |
| 1439 newsletter tool cap | OWNED-ELSEWHERE hygiene-a | `H-LIST-NEWS`. |
| 1440 admin newsletter send-log cap | PARKED | The cull explicitly defers paging. Confirmed in `list-send-log.ts:23`; the repo already accepts `afterId` and `limit` at `newsletter/ports.ts:163`. |
| 1441 visitor published search cap | OWNED-ELSEWHERE hygiene-a | `H-LIST-VISITOR`. |
| 1442 saved-key cap | OWNED-ELSEWHERE hygiene-a | The existing partial design names the SQL limit in `other-site-keys.ts:142–144`. |
| 1443 media picker locale | OWNED-ELSEWHERE hygiene-b | `TV-I18N-PICKER`. |
| 1444 saved image-model selection | OWNED-ELSEWHERE practice | `M-Q3-T`. |
| 1445 translation audit false positives | OWNED-ELSEWHERE hygiene-b | The report names the audit script and the two unhandled dictionary patterns. |
| 1446 bad-frame error echo | OWNED-ELSEWHERE error system | `E9-J-FRAME`. |
| 1447 handler incident text | OWNED-ELSEWHERE error system | `E9-J-HANDLER` is queued behind its split. |
| 1448 anonymous copy-details block | OWNED-ELSEWHERE error system | `E6a-J-NOTICE` + `TV-ES1`. |
| 1449 admin boundary error IDs | OWNED-ELSEWHERE error system | `E4-T-BOUNDARY`. |
| 1450 growing error ledger | OWNED-ELSEWHERE error system | The log folds it into E11. |
| 1451 media byte-size N+1 | OWNED-ELSEWHERE feat2 | `I2-J` + `I2-T`. |
| 1452 / T-B05 | READY-FOR-CODEX | `tv-z4` still reads `../../deps.ts:8`. The corresponding composition call is in `site-deps/boot-phases.ts:91`. C08 stopped on the 73-line production function. |

### Earlier reports marked open

| ID | Disposition | Evidence or decision |
|---|---|---|
| 103 Shared Keys cancellation | OPUS-CLOUD | Code fix recorded as `0b05623ba`; real chat and packaged verification remain. |
| 104 site-to-site key reuse | OPUS-CLOUD | Same commit; exercise existing-site keys and approval in the packaged flow. |
| 145 duplicate tool calls | PARTIAL | Distinguish duplicate provider/bridge events from genuinely repeated calls in the current feed. Related to 580. |
| 146 `search_tools` rejects `max_results` | PARTIAL | Find whether current guidance or schema still advertises that argument. The historical rejection alone establishes neither. |
| 150 elapsed time misses startup | PARTIAL | Identify which current run start timestamp drives the elapsed label, then pin a startup delay with a fake clock. |
| 152 offline model picker / Escape | OPUS-CLOUD | Requires a real picker flow for first-open model discovery and keyboard behavior. |
| 153 repeated Composio lock timeout | PARTIAL | Obtain a current owner/recovery trace and distinguish live contention from an abandoned lock. See 575–576. |
| 154 ambiguous registry display name | PARTIAL | Locate the current selector and confirm two same-name registrations still omit the usable IDs. |
| 155 theme overwrite on redesign | NEEDS-DECISION | Should a reference-driven redesign require explicit approval before editing or activating the existing theme? **Recommend yes**, through the existing approval path. |
| 156 summary contradicts live nav | OPUS-CLOUD | Reproduce with a real agent turn and compare the summary against rendered navigation. |
| 157 disk-full publish | PARTIAL | Trace the current refusal and incident ID through peer transport. Proactive capacity warnings are a separate product change. |
| 158 just-published media shows conflict | PARTIAL | Capture the returned hash/baseline for a completed publish and the inputs to the next planning request. |
| 161 export picker appearance | OWNED-ELSEWHERE ui-agent | Picker labels and button width. |
| 163 truncated model name | OWNED-ELSEWHERE ui-agent | Composer layout and dark appearance. |
| 176 model reports seven items for six | OPUS-CLOUD | Real tool receipts are needed to isolate incorrect summarization from incorrect counts in the results. |
| 198 localhost canonical URL | OWNED-ELSEWHERE SEO/public-origin s1 | Existing job is named in the log. |
| 213 untranslated screens | OWNED-ELSEWHERE hygiene-b | Existing locale inventory and jobs. |
| 217 Antigravity per-tool limits | OPUS-CLOUD | Current provider capability and real CLI behavior need verification. |
| 218 desktop memory pill | OPUS-CLOUD | Native process accounting must be reproduced in Electron. |
| 249 local consent 403 | PARTIAL | Compare the current verified-origin path against the historical cross-port/scheme case. |
| 313 sign-in theme styling | OWNED-ELSEWHERE ui-agent | Skip-link visibility and CTA styling. |
| 339 glued-secret redaction | OWNED-ELSEWHERE simple redaction redesign | Log cites prior fix `cf5571045`; any remaining scope belongs to the approved redesign. |
| 348 newsletter `bodyJson` discarded | NEEDS-DECISION | Should the Tovu campaign persist `bodyJson` and include it in revisions? **Recommend yes**, with an additive migration in the campaign owner and matching create/update tests. |
| 355 legacy wildcard test listeners | PARKED | `c7b9477c3` guards new call sites. The log marks baseline migration low priority. |
| 366 unquoted paths redacted | OWNED-ELSEWHERE simple redaction redesign | Log cites `cf5571045`; residual path heuristics belong to the same design. |
| 383 result target label | OWNED-ELSEWHERE prior Jini fix | Log cites `7ff16cd1f` and `f5373f58a` for the nested error-envelope case. |
| 384 repeated tool-result parsing | OWNED-ELSEWHERE prior Jini fix | Log cites `7ff16cd1f` and memoization. |
| 390 same-file calls at different offsets | OWNED-ELSEWHERE ui-agent | The batched target fix is recorded as `bcca849ed`; identical-looking offsets remain presentation work. |
| 395 refused receipt folded into success | OWNED-ELSEWHERE prior Jini fix | `ab7c3b92e` + `1148c3bfc` are named in the log. |
| 400 direct-call batch schema | OWNED-ELSEWHERE prior Jini fix | `7a2b4f7f9` adds required properties and guidance. |
| 401 read-only catalog guidance | OWNED-ELSEWHERE prior Jini/Tovu fix | `c0f133709` + `7ab029266`; daemon build verification remains. |
| 404–412 code fixed, user-path checks owe | OPUS-CLOUD | The log gives commits/tests for packaged parser, cross-build import, embeds, timezone, readiness, native imports, blank landing, retry rows and chart legend. No new code sheet. |
| 440 demo clip site names | OWNED-ELSEWHERE demo reel | Footage edit. |
| 441 demo clip brand/sample posts | OWNED-ELSEWHERE demo reel | Footage and fixture correction. |
| 443 agent closes another Chrome tab group | OPUS-CLOUD | Needs a real concurrent browser-session test. |
| 444 video upload above Chrome tool cap | OPUS-CLOUD | Needs the real upload path and limits verified. |
| 446 npm pack output compatibility | OWNED-ELSEWHERE prior Jini fix | Log cites `88e8f9fcb` and `5701267ae`. |
| 453 cloned tool descriptors | OWNED-ELSEWHERE prior Jini fix | Log cites `ab7c3b92e`. |
| 454 plan-mode schema guidance | OWNED-ELSEWHERE prior Jini fix | Log cites `ab7c3b92e`. |
| 455 accepted redaction residual | PARKED | Accepted residual in the log. |
| 456 lint rule on `useConversation` | OWNED-ELSEWHERE prior Jini fix | Log cites `ab7c3b92e`. |
| 458 stale running-lease lock | PARTIAL | Trace the current lease and file-lock owners. Related to 575 and 612. |
| 463 release-script type errors | OWNED-ELSEWHERE prior Jini fix | The later report at 446 says the scripts compile after the named changes. |
| 492 / 577 Jini identity namespace | OWNED-ELSEWHERE product-name removal | `jy-pay` emits canonical `jini` manifests. `agent-plugins/src/core/identity-namespace.ts:14–31,63–95` still has legacy product aliases. Owner’s full removal order tracks that remaining work. |
| 493 generic agent-plugin placement | OWNED-ELSEWHERE plugin extraction | The owner’s existing extraction and UI/UX lanes cover placement and copy drift. |
| 494 vendor-plugin package policy | OWNED-ELSEWHERE provider-plugin organization | The record concerns approved package ownership and includes a package-removal option. |
| 495 minified Recharts donor | OPUS-CLOUD | Artifact provenance, package relink and integrity checks. |
| 496 desktop coverage | OWNED-ELSEWHERE coverage | Existing measurement job. |
| 499 cross-package coverage | OWNED-ELSEWHERE coverage | Existing coverage work. |
| 503 face/provider shared ID collision | OWNED-ELSEWHERE prior Jini fix | Log cites `144b65862`. |
| 509 vendor scan ignores relocated manifests | PARTIAL | Recheck current selection and manifest discovery after provider-plugin changes. |
| 519 / 536 Railway control characters | OWNED-ELSEWHERE prior Jini fix | Log cites `77bdd6ee9` at 554; the early entry points to `p-w4`. |
| 521 / 542 teardown can skip later hooks | PARTIAL | Verify the current `vitest-compat` scheduler and isolate `after` and `afterEach` cases. |
| 522 delete-tool guidance aliases | PARTIAL | Historical latent case. Establish a current guidance target and policy expectation before sheeting. |
| 523 unpublished agentic range | OPUS-CLOUD | Registry resolution and lock refresh. |
| 524 / 555 coverage union | OWNED-ELSEWHERE coverage | Per-line LCOV redesign. |
| 525 / 553 node-pty helper mode | OPUS-CLOUD | Packaged arm64 terminal and release backport verification. |
| 526 Recharts separator truncation | OWNED-ELSEWHERE ui-agent | Log cites Jini `885c7adcf`; consumer Chrome check remains. |
| 527 Skills English strings | OWNED-ELSEWHERE hygiene-b | Locale inventory. |
| 528 menu `rel` schema wording | PARTIAL | Verify the current tool descriptor and normalization behavior on the consumer path. |
| 529 bundled plugin env path | OWNED-ELSEWHERE prior Tovu fix | Log cites `aef024808` and `t-bundled-dir2`. |
| 531 / 545 staged `tsx` closure | OPUS-CLOUD | Release-build and staged-payload verification. 555 records closure and preload fixes. |
| 532 chart capability manifests | OWNED-ELSEWHERE INT tidy / chart packaging | The log explicitly queues the manifest and catalog fix. |
| 535 Fly-template assertions | OWNED-ELSEWHERE coverage | Existing coverage gap. |
| 539 staged caller-supplied roots | PARTIAL | Tovu uses the `0ef92c015` workaround. Verify the Jini case in the staging API that survives merge-7. |
| 541 linked UI dist export | OPUS-CLOUD | Requires the Jini build artifact. |
| 552 build scripts shipped | OPUS-CLOUD | Check the final staged payload against the repairs named at 555. |
| 556 review fixes, Tovu | OWNED-ELSEWHERE fix-rev-tovu | Follow-up at 559 names the patches, including `28e0689db` and `386631b14`. |
| 557 review fixes, Jini | OWNED-ELSEWHERE fix-rev-jini | Follow-up at 560 names the patches, including `7385542c0`, `fefae364b` and `d3064f359`. |
| 558 post-publish dependencies and pins | OPUS-CLOUD | Requires registry artifacts and lockfiles. |
| 561 isolated devops resolution | OPUS-CLOUD | 563 says the dependency was deliberately moved to the root. Verify clean installation before considering manifest changes. |
| 564 integration clone migrates live user DB | OPUS-CLOUD | Existing live-state recovery and dev isolation need a disposable-workspace run. |
| 565 reference-theme overflow | OWNED-ELSEWHERE ui-agent | Visual acceptance issue. |
| 566 plugin sign-in has no Skip | NEEDS-DECISION | Should an operator be able to decline sign-in and continue the current turn? **Recommend yes**, through the existing dismissal outcome. |
| 567 Stop-button overlap | OWNED-ELSEWHERE ui-agent | Composer hit target. |
| 568 missing connection status / MCP connect failure | PARTIAL | The status projection and the two tool invocation paths require separate repros. Later sign-in-grant work is recorded at 584. |
| 570 approval expires | PARTIAL | Determine the active approval lifetime and which CLI or card timer cancelled the observed run. |
| 571 second-tab chat loses draft | OPUS-CLOUD | Two live tabs are required to establish the current route, run and draft ownership. |
| 572 chart zero-value rectangle | PARTIAL | Confirm the assertion against the current chart provider artifact before deciding whether to change the rendering or test. |
| 573 newsletter search rank | PARTIAL | Rerank the named query against the combined catalog and identify the competing hit. |
| 574 supporting-files test drift | PARTIAL | Recheck fixture-installed plugin and overlay ordering against current guidance. |
| 575 abandoned durable-JSON lock | PARTIAL | Identify which clock or lease assertion survives current platform changes. |
| 576 live-holder lock eviction | NEEDS-DECISION | Should lock age allow stealing from a demonstrably live owner? **Recommend no** and update the age-rule test to require proof that the owner is gone. |
| 578 theme write confirmations / retention | PARTIAL | Verify each write tool against the existing review and revision lanes. The log groups multiple operations under one entry. |
| 579 analytics with consent disabled | NEEDS-DECISION | Should vendor analytics run with the gate off when a previously issued visitor receipt exists? **Recommend keeping the gate closed.** |
| 580 Gemini/OpenCode deduplication | PARTIAL | Capture both current event pairs and match their provenance before adjusting the reducer. |
| 581 tests write live receipts | PARTIAL | Identify the current test boot that resolves a real site directory before changing the harness. |
| 582 tests miss composed bundle env | OPUS-CLOUD | Verify a clean composed bundle and test startup. |
| 583 hardwiring/types/coverage aggregate | PARTIAL | Refresh individual source failures after merge-7. Coverage remediation belongs to coverage. |
| 584 empty-list plugin MCP reload | OWNED-ELSEWHERE ex-err-jini | Held branch touches `mcp/src/federation/reload.ts`. |
| 585 dev announces readiness after boot refusal | PARTIAL | Reproduce against the present boot supervisor and locate the success message’s emitter. |
| 586 Send-button overlap | OWNED-ELSEWHERE ui-agent | Composer hit target. |
| 587 misleading auto title | PARTIAL | Identify whether current title generation receives page context and user text separately. |
| 588 theme activation argument retry | PARTIAL | Verify the current first-call schema and guidance against the reported rejected field. |
| 589 squeezed folder chip | OWNED-ELSEWHERE ui-agent | Composer layout. |
| 590 cookie banner opens by default | OPUS-CLOUD | Verify the effective policy on a clean browser and current build. |
| 591 image attachment opens with failed read | OPUS-CLOUD | Needs a real picture-to-theme CLI run against current attachment guidance. |
| 596 desktop memory by process | OPUS-CLOUD | Needs packaged process attribution. |
| 597 / 598 redaction gaps | OWNED-ELSEWHERE simple redaction redesign | Empty labeled values and nested errors fall in the approved lane. |
| 599 federation failure exposes raw reason | PARTIAL | Check the current returned diagnostic and callers after the error-system and reload work. |
| 600 preview IPC sender hypothesis | OUT OF SCOPE | The log marks the finding plausible and unchecked. |
| 601 chart install-root hypothesis | OPUS-CLOUD | Requires packaged lookup-path verification. |
| 602 failed Higgsfield wait | OPUS-CLOUD | Exercise current plugin polling through the real agent. |
| 603 duplicated cover image | OPUS-CLOUD | Verify the tool writes and published rendering on the real authoring path. |
| 605 Recharts activation argument retry | PARTIAL | Check the provider-exposed schema and tool guidance against the current agent path. |
| 607 TLS site-start readiness | OPUS-CLOUD | Needs a real local TLS start and readiness check. |
| 608 scrubbed file path | OWNED-ELSEWHERE simple redaction redesign | Same false-positive class as 366. |
| 609 replaced media retains old provenance | PARTIAL | Identify the current media replacement owner and restamp test before changing the projected provenance. |
| 610 `.mp4` original URL 404 | RETIRE | `media-rendition.ts:670` on both `tv-bl` and `tv-xd5-render` registers `/m/:assetId/original.:ext`. |
| 611 tool execution principal binding | PARTIAL | Current daemon test and routes have been reorganized. Verify the active server-side binding and coverage before assigning any residual. |
| 612 lease recovery instruction | OWNED-ELSEWHERE desktop batch 2 G | Existing job named by the log. |
| 613 restart screen with no API | OPUS-CLOUD | Same live-tree migration/boot incident as 564. |
| 614 switcher disabled | NEEDS-DECISION | Should web admin allow starting another site when `TOVU_ENABLE_SITE_SWITCHER` is off? **Recommend preserving the off setting’s current scope.** |
| 615 theme screenshot | OWNED-ELSEWHERE ui-agent | Theme artwork. |
| 616 static publish consent choices | PARTIAL | Establish whether the server omits the choices or the current admin client drops them. |
| 617 Vercel project name prefill | PARTIAL | Verify current publish-history read and form hydration against the named target. |
| 618 preview switcher shipped | OWNED-ELSEWHERE ui-agent | Site-specific theme output. |
| 619 Chrome resize | OPUS-CLOUD | Actual browser tooling behavior. |
| 620 cut-off look cards | OWNED-ELSEWHERE ui-agent | Site-specific layout. |
| 621 narrow viewport overflow | OWNED-ELSEWHERE ui-agent | Site-specific layout. |
| 622 existing running site refusal | OPUS-CLOUD | Requires the real multi-process dev/supervisor flow. |
| 623 mobile motion fallback | OWNED-ELSEWHERE ui-agent | Theme design guidance and rendering. |
| 624 kUInetic length parsing | OWNED-ELSEWHERE kUInetic | Identified upstream library owner. |
| 625 scroll-jump counter | OWNED-ELSEWHERE ui-agent | Site-specific theme behavior. |
| 626 touch tooltips | OPUS-CLOUD | Needs a real touch/coarse-pointer test. |
| 633 bundled-file warning false positive | PARTIAL | After `tv-xd5-publish`, `share-zip.ts:58–63` exempts exact installed bytes. Include the older installed digest when resheeting the approved refusal. |
| 770 infra retirement and browser failures | OPUS-CLOUD | The log identifies shim release, outbox handoff, browser runtime and install dependencies. |
| 771 coverage and layout verification | OWNED-ELSEWHERE coverage / ui-agent | Existing coverage floor and browser layout work. |
| 775 desktop import verification | OPUS-CLOUD | Packaged import, owner recovery and real share-link flow. |
| 776 old website test failures | PARTIAL | Compare the named assertions that survive merge-7. Historical totals include interrupted workers and repaired fixtures. |
| 778 desktop import residuals | OPUS-CLOUD | Verify the Electron flow after the later import fixes. Visual alignment belongs to ui-agent. |
| 785 edited starter imports raw | OWNED-ELSEWHERE import-fix-3 | The following entry names Tovu `73fa8a730`. |
| 786 import platform checks | OPUS-CLOUD | Windows, packaged mode and cleanup timer remain environment checks. |
| 881 stale registry record | PARTIAL | Documented safe picker behavior. Verify which current recovery flow should remove a dead registry entry. |
| 882 Secrets redirect | OUT OF SCOPE | Single occurrence around restart, cause unverified. |
| 883 Personal MCP first-run consent | OWNED-ELSEWHERE MCP-DEFAULT | The log records the owner decision and `cloud/mcp-default`. |
| 984 tool-failure audit aggregate | PARTIAL | Compare each named failure class against the current catalog, approval and Chrome lanes. The aggregate count cannot identify surviving bugs. |
| 1254 Recharts pin gate | OPUS-CLOUD | Verify the gate against the actual published package bump. |
| 1256 visitor navigation failure | OWNED-ELSEWHERE visitor-page-tools P0 | 1258 names the slug/id regression and existing plan. |
| 1257 visitor form fill | OWNED-ELSEWHERE M5 | Owner approved the same-origin receiver behind consent, off by default. |
| 1258 visitor slug rejected | OWNED-ELSEWHERE visitor-page-tools P0 | `development/plans/2026-11-13-visitor-page-tools-plan.md`. |
| 1263 Apple notarization | OPUS-CLOUD | Account holder acceptance and release rerun. |
| 1264 MCP-UI teardown | OUT OF SCOPE | Marked plausible and unconfirmed in the log. |
| 1265 unused site-chat package | OPUS-CLOUD | `apps/site-chat/package.json:24` still declares `@mcp-ui/client`. Removal needs lockfile reconciliation. |
| 1273 mail HTTP ABI | OWNED-ELSEWHERE mail ABI lane | A2 continuation records the adapter mutation check; confirm whether the later Tovu cast is a separate surviving caller. |
| 1277 args caller batch | OWNED-ELSEWHERE args caller repairs | The log explicitly says the fix is in progress. |
| 1279 Express in core | OWNED-ELSEWHERE untangle C4/server-port | Existing L6 debt and named lane. |
| 1280 untangle C0 package resolution | OPUS-CLOUD | Needs a clean install against the combined manifests. |
| 1284 repoint applier fails open | OWNED-ELSEWHERE P-APPLY2 | Named existing applier work. |

### Standing exclusions

| ID | Disposition | Evidence |
|---|---|---|
| hygiene-a | OWNED-ELSEWHERE hygiene-a | Active cloud cull. |
| hygiene-b | OWNED-ELSEWHERE hygiene-b | Active cloud cull. |
| practice | OWNED-ELSEWHERE practice | Active cloud cull. |
| launch-44-41 | OWNED-ELSEWHERE `jy-*`, `tv-y1`, `tv-y2` | Treat the eight lanes as predecessors. |
| ACP-3/4/5 | OWNED-ELSEWHERE ACP redo | Explicit exclusion. |
| RT-J3 | OWNED-ELSEWHERE RT-J3 | Explicit exclusion. |
| Tier-2 class tokens | PARKED | Later, per screen. |
| todos L | PARKED | Owner hold. |
| 424 UI functions over 50 lines | PARKED | Tabled by owner. |
| fn50 / c6fix sizing | OWNED-ELSEWHERE fn50 / c6fix | Existing pushed work. |
| coverage | OWNED-ELSEWHERE coverage | Explicit exclusion. |
| mutation-testing program | OWNED-ELSEWHERE mutation testing | Sheet mutations still apply to the two named regressions. |
| held error files | OWNED-ELSEWHERE ex-err-jini | Prescribed branch diff reports 89 files. Neither ready sheet edits a held file. |

## Ready sheets

Apply these rules to both candidate briefs. Preserve behavior outside the named fix. New public functions take `(required, optional = {})`, with framework signatures exempt. Keep moves verbatim. Use only named declarations, no re-export shells, new dependencies, `eslint-disable`, `@ts-ignore`, `as any` or `as never`. Functions must be at most 50 lines and complexity at most 10. Record files exceeding 500 lines in root `COMMIT-PLAN.md` and continue. Stop only the affected sheet for missing declarations, an unlisted production importer, a required cast, or a function limit violation. Record test-only repoints in `REFRESH.md`. Keep hooks injected as props and vendor code in provider packages. Keep framework code outside Jini domain packages. No repository-wide scans, codebase-memory-mcp, tests, builds, installs, type checks or linters in the Codex edit job. Keep `.git` read-only. Cloud verifies red, green and the named mutation. Lockfiles, new dependencies and new packages go to Opus Cloud.

### J-401 — Remove the upload race from the daemon auth-order test

**Jini · merge-6 `d3e78b387` · 1,200 executor tokens.** No pushed source overlap found for this test. Recheck after merge-7 before dispatch.

- **Test first.** In `packages/daemon/src/http/__tests__/tool-execution-rpc.test.ts:366–375`, use the existing raw HTTP case to require a 401 and zero executor calls while the client sends headers declaring an oversized JSON body without streaming the body. Keep the authenticated request with the actual body as the 413 control. The prior intermittent red is `write ECONNRESET`. In cloud, mutate auth to run after body reading. A 413 or the existing test deadline must turn the unauthenticated assertion red.
- **Edit.** At `:370`, call the existing `rawRequest` without `body`, supplying `headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) }`. The existing helper at `:335–349` already forwards headers and ends the request. Its implementation, the production route and the authenticated 413 control stay as written.
- **Imports and debt.** Existing imports throughout the file. No repoints, new exports, manifest, API baseline or injection-debt rows. No Chrome/Electron check. Cloud repeats the focused auth-order case.
- **Stop** if the combined harness drains the request before replying, if the raw helper no longer permits explicit headers, or if a timeout or transport change beyond the named test would be required.

### T-B05 — Read the identity call from its current boot phase

**Tovu · after `tv-z4` `8ad68c9aea` · 900 executor tokens.** Follow merge-7 if dispatched from the combined tree. `tv-b1` independently repairs the neighboring outbound test.

- **Test first.** Use the existing red B05 call-placement case in `apps/website/src/server/runtime/composition/site-deps/__tests__/identity-settings.characterization.unit.test.ts:18–23`. It looks in `composeSiteRouteDeps`. The actual order at `site-deps/boot-phases.ts:90–92` is `composeSitePluginRuntime`, `composeIdentitySettings`, `startBootData`. Mutation restores the old file and function target and must fail the placement case.
- **Edit.** In that test at `:8`, set `const DEPS = new URL("../boot-phases.ts", import.meta.url);`. At `:18–19`, name and read `composeSiteServicesPhase`. Keep the preceding-plugin-runtime assertion and the existing B05 declaration-order and lazy-read cases.
- **Imports and debt.** No import changes. The relative `new URL` above is the sole file repoint. No production edits, new exports, manifest, API baseline or injection-debt rows. No Chrome/Electron check.
- **Stop** if the phase or immediate predecessor has moved again, or the production slice changes as part of a restarted C08. The oversized production function is outside this test repair.

## Batch order and remaining work

| Order | Candidate branch | Base and order | Tokens |
|---|---|---|---|
| 1 | `codex/bugs-jini-daemon` | Jini merge-7, then `J-401` | 1,200 |
| 2 | `codex/bugs-tovu-composition` | Tovu merge-7 including `tv-z4`, then `T-B05` | 900 |

Both branches are **held for batching**. Each has one ready sheet, below the requested six-to-eight-sheet minimum. The table records the order for a later dispatch.

The highest-priority partial is **BK-R archive refusal**, after `jx-c6fix` and `tv-xd5-publish`. `addEntry` scans and appends at `share-zip.ts:36–51`. `addBackupEntry:58–63` applies the exact-installed-bytes exemption. `share-zip.unit.test.ts:56–105`, `credential-warnings.integration.test.ts:54–120`, `share.integration.test.ts:199,259` and archive-sanitization cases currently exercise warned bytes being retained. A dispatchable sheet needs the complete list of conflicting assertions and a red-first case that proves no ZIP is emitted for a warned file. The narrow implementation boundary is the share ZIP writer. The shared scanner also serves import verification and static ZIP generation.

For the other **PARTIAL** rows, the missing evidence is identified in the table. In particular, merge-7 output is needed to distinguish live catalog, test-harness and logging regressions from superseded merge-4/5 reports. I could verify branch changes and source boundaries in this pass. The remaining historical reports do not yet have the current file, caller and failing-test evidence required for literal execution.
