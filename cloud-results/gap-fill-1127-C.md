PARTIAL run C | jobs 5/5 | tests added 64 new (+ Codex partial tests run and fixed) | files 100% 15/402 | bugs 4 | left: per-job "Not reached"/"Left" lists below (biggest: daemon-supervisor.ts, agent-daemon-run-start/idle-park, site-key.ts, themes/explore.ts, other-site-keys/assistant-ag-ui gaps, tool-catalog-manifest.ts)

# Gap fill 2026-11-27, run C (Tovu website; jobs tv-w62-cov-web-9, -11, -12, -13, -14)

The run was unattended on Opus (high). Four subagents each took one job in its own git worktree (9, 11, 12, 14, continuing Codex's partial branches). The coordinator did job 13 and fixed the typecheck errors. No RemoteTrigger, no `--no-verify`, no force-push. There were no guard, threshold or coverage-config edits, no ts-ignore, no `as any` and no skips. `.gitleaks.toml` and the themes were untouched. `gitleaks protect --staged` was clean before every commit.

## Final pushed SHAs (all green on `npm run typecheck:tests`, run in each branch)
| job | branch | head | tests in the touched files |
|---|---|---|---|
| tv-w62-cov-web-9 | codex/tv-w62-cov-web-9 | df18b916 | all touched files pass (43/43 for the 4 typecheck-fixed files; the subagent's runs are listed below) |
| tv-w62-cov-web-11 | codex/tv-w62-cov-web-11 | 1e8d5a56 | 238/238 |
| tv-w62-cov-web-12 | codex/tv-w62-cov-web-12 | 8837e23e | 325/325 |
| tv-w62-cov-web-13 | codex/tv-w62-cov-web-13 | 7a42921e | 129/129 |
| tv-w62-cov-web-14 | codex/tv-w62-cov-web-14 | 58042d30 | 106/106 |

## Setup (what worked)
- Node 24.22.3 from the nodejs.org tarball, SHA verified, at /opt/node24. Jini `pnpm install --frozen-lockfile` and `pnpm -r build` were green on Jini integ/merge-28 d1ced6c5.
- Tovu: `npm ci --ignore-scripts` at the root and in site-chat, then `link:jini`, then `tsc -p` for contracts and sdk.
- Per-job git worktrees with node_modules symlinked to the main checkout, plus a copy of packages/contracts and sdk dist. Tests and `typecheck:tests` both work in a worktree (about 1.5 min each).
- Coverage: `node --test --experimental-test-coverage --test-coverage-include=<file>` over the file's importing tests. Name-matched test lists miss most covering tests. A 287-file importer run of job 13 timed out with an empty lcov, so coverage was measured per file.
- **Trap:** the subagents ran their tests through tsx, which does not typecheck. `typecheck:tests` afterwards found 16 errors on jobs 9, 11 and 12 (9 / 5 / 2), in both Codex and subagent tests. All are fixed without weakening:
  - real port shapes: a whole `MfaStore` fake whose unused methods fail the test, `toolUseId` plus `await` for the delegated principal, the Clock without `nowIso`, the required optional-argument slots;
  - Tovu's `InMemoryKeyring` takes no salt;
  - `assert.ok` before using an optional port;
  - one `as unknown as RouteDeps`, the pattern the same file's fixture already uses.

## BUGs
- **BUG-1 FIXED (job 9):** `apps/website/src/server/inbound/assistant/assistant-tool-access.ts` `staleOrEnded`. A settings writer that rejected with null or another non-object threw a TypeError, which replaced the original rejection. Covered by a test that was red before the fix.
- **BUG-2 OPEN (job 14):** `packages/contracts/src/routines.ts:52` counts UTF-16 units, not bytes, against `ROUTINE_BEACON_MAX_BYTES`. Fix and test are in the job 14 section; the test is left out of the commit until the fix lands.
- **BUG-3 FIXED (job 12):** `composition/modules/assistant-ag-ui-approval-segment.ts:54`. The SSE `id:` regex consumed the newline, so the second of two consecutive id lines was lost.
- **BUG-4 FIXED (job 12):** `composition/modules/assistant-routines.ts:134`. The adapter dropped `limit`, so routine run pages were unbounded and `nextCursor` was null.

## For the owner to decide
1. `packages/contracts/src/content-chat-title.ts:31-40`: in `'Edit the post "unfinished “Correct Title”'`, should the inner curly quote win? Codex's case expecting that was removed, and the fix is given in the job 14 section.
2. `local-site-process.ts` `tryRetire` logs the cancel failure with `describeErrorForLog` ("Error" only). `cancelRetirement` uses `formatErrorForLog`, which keeps the message. Should they match?
3. `storage-routes` `cleanup.preview` is typed as returning a Promise but throws synchronously when no port is wired.
4. Pre-existing reds seen and left alone: `webhook-delivery-worker.test.ts` (console.error argument shape), `webhook-delivery-worker.shutdown.test.ts` (trickle deadline), `open-site-content-db.integration.test.ts` (newest-five copies; seen once), and the 29 `site-deps/__tests__/*.characterization` source-scan tests.

## tv-w62-cov-web-13 (done by the coordinator; started fresh from origin/integ/merge-28-2026-11-26)
Branch codex/tv-w62-cov-web-13, head 7a42921e (11 commits a6587f0a..7a42921e). typecheck:tests 0. All 10 touched test files together: 129/129 pass.
Baseline note: running each file's importing tests showed most of the brief's gaps were shard artefacts (the covering tests sat in shards 5-7). Measured with each file's importer tests, coverage-include scoped to the file. Lines / branches / functions:

| file | brief (merge-28, 5/8 shards) | measured before | after |
|---|---|---|---|
| reset-owner.ts | 40.4 / 100 / 0 (not in lcov in the name-matched run) | 40.4 / 100 / 0 | 100 / 91.7 / 50 |
| site-import-index-state.ts | not in lcov | 97.6 / 83.8 / 91.5 | 100 / 88.1 / 93.6 |
| site-import-payload-fs.ts | 16,31-32 uncovered | 91.4 / 80 / 80 | **100 / 100 / 100** |
| retention.ts | 31-33,70 | 96.8 / 88.9 / 90 | 100 / 100 / 95 |
| plugin-credential-cards.ts | 1,18-89 ranges | 96.5 / 84.2 / 72.7 | 98.8 / 92.7 / 81.8 |
| serving-app.ts | 91-92,151-152 | 91.7 / ~60 / ~45 (outbox test file) | 91-92 covered; 151-152 open |
| retention-policies/media-bytes-deps.ts | 95-96 | 92.7 / 91.1 / 90.9 | 100 / 91.8 / 91.7 |
| public-oauth-callbacks.ts | 1-10,51-52 | 51-52 uncovered | 51-52 covered (lines 1-10 are imports) |
| site-guide-tools.ts | 126 | 126 uncovered | 126 covered (82-83 open) |
| source-control-key-binding.ts | 40-41,107-108 | 94.3 / 81.5 / 90.9 | 98.1 / 85.7 / 100 |

Tests added (32), each with the mutation that turns it red:
- composition/__tests__/reset-owner.integration.test.ts (new file; a real migrated SQLite site built by createSiteRouteDeps):
  - "missing site directory is refused…" -> remove the existsSync check (the error changes and the directory gets created).
  - "the single stored owner gets the new password…" -> wrong return value, or the reset skipped (hash unchanged). The second call with the same password keeps the hash (pins applyOwnerPasswordReset's verify-first).
  - "an explicit username must name the stored owner…" -> drop the `username` spread (a wrong name would then succeed).
  - "a site without exactly one stored owner is refused…" -> `owners.length !== 1` guard removed.
- features/site-backup/__tests__/import-history-mode.integration.test.ts (+4):
  - "legacy read whose authority moved underneath is discarded and re-read" -> return the first legacy result without the `seen` comparison.
  - "keeps moving under three attempts reports busy" -> change the attempt bound or latch BUSY (refusal() must stay undefined).
  - "an indexed session expires a lapsed owner setup…" -> drop the put(failed) or the stage rmSync, or expire non-due rows.
  - "an unreadable DB probe is an error, never 'no evidence'" -> lstatOrMissing returns undefined for every error.
- composition/__tests__/site-import-payload-fs.unit.test.ts (new, 12): kind file/dir/link/missing; ENOTDIR rethrown (-> treat every error as missing); modes, exclusive create (EEXIST), rename, rm, readdir; fsync close pairing (-> drop a closeSync); each tolerated dir-flush code x5 (-> remove one from the list); EIO and a codeless error rethrown with close (-> swallow all); a missing directory rethrows ENOENT and closes nothing.
- composition/retention.test.ts (+3): a failed report-only measurement is reported with its cause and listed as failed (-> drop reportError or the failed row); a failed free-page pass is reported, an overlapping tick and a post-stop tick start nothing (-> drop the `inFlight`/`aborted` guard); listenerReady schedules once and never after stop, and a stopped runOnce returns `{status:"stopped",dryRun:true}` (-> drop `ready` guard).
- composition/__tests__/plugin-credential-cards.unit.test.ts (+2): unreadable manifest/descriptors grant nothing beyond the plugin id, with the exact files read (-> the linkedProviderOf catch returns a provider, or the descriptor catch grants ownership); the default refusal sink prints the `[plugin-credential-cards]` prefix.
- server/__tests__/integration/serving-app-outbox-drain.integration.test.ts (+2): a metric-capable provider receives `outbox.queue_depth` gauges, and an empty-queue sample arrives (-> drop queueMetrics or the readDepth binding); no sampling without `supportsMetric` (-> invert the guard).
- retention-policies/media-bytes-deps.test.ts (+2): servingRecoveryArtifacts lists restore points plus the ops/ pre-migration copies, newest first, with sidecar bytes, and deletes nothing (-> wrong ops dir or dropped copies); a memory site lists only its restore points.
- public-http/routes/external-mcp/__tests__/oauth-callback.test.ts (+1): the failure log line for an Error and for non-Errors.
- composition/__tests__/site-guide-tools.test.ts (+1): non-input guide failures propagate unchanged (-> wrap every error as ToolInputError).
- features/source-control/__tests__/canonical-credential-lifecycle.unit.test.ts (+1): describe by the declared label, an unlabeled provider refused, an unavailable host refused, the duplicate-label identity kept, and the first token retained (-> drop the duplicate translation or the provider check).

SKIPPED-ALREADY-COVERED (measured with the importer tests): permanent-delete-deps.ts 100/96.9/100 (features/permanent-delete deps.test.ts + 3 more); site-key-recovery.ts 100/94.6/85.7; publish-content-seed-hash.ts 100/100/87.5; product-telemetry.ts 99.6/92.7/93.9 (line 1 only); plugin-runtime.ts / plugin-host.ts (the uncovered lines are type-only declarations and re-exports; plugin-host 54-64 is covered in the shards the brief measured); provider-plugins.ts 99.6/97.1/97.9; provider-settings-save.ts 98.9/89.3/97; retention-policies/database-copies.ts 100/87.5/100; site-paths.ts 100/92.3/100; site-portability.ts 98.6/94.1/100; site-import-backend.ts 100 lines; site-mailer.ts 100 lines.
EXCEPTION (the uncovered "lines" are doc comments, imports or type-only code; branches and functions are already 100): publish-trust-revocations.ts 4-28 (doc comment), tool-use-events.ts 4-23 (doc comment and interface), retention-policies/db-free-pages.ts 1-12 and 41-45 (imports, types, doc comment), plugin-runtime.ts 10-70 (type imports, interfaces, re-exports). reset-owner.ts:43 `!identity.recoveryCodes`: the SQLite identity wiring always supplies recovery storage. reset-owner.ts nowMs and newId adapters: the reset path never mints an id or reads epoch ms.
Not reached: tool-catalog-manifest.ts (commerce askHuman glue, which I left alone because packages/commerce is off limits; the post-preview error mapping; the Playwright launch), vault-boot.ts 142 and 360-361, site-event-subscriptions.ts 53-54, serving-app.ts 151-152 (routine boot interruption), site-deps/* (covered by boot integration tests; the brief lists only 1-5 lines each), trash-user-admin-override branches, and the other one-line rows.
Pre-existing reds seen (not touched): site-deps/__tests__/*.characterization.unit.test.ts, 29 tests ("slice call missing" / statement-order source scans) red on this base.

## tv-w62-cov-web-9 (subagent report, condensed)
Commits on top of Codex ef7f56f2: ad96aefd (fix 3 Codex reds incl. 1 prod bug), 00d012c2 (agent-daemon-scope-http), 7942e9dd (run-has-write-access, daemon-origin-policy), 49e30504 (recent-hits).
Codex partial: 30 test files run; 27 green, 3 red fixed:
- routes/system/__tests__/sites.tw4.pins.test.ts: wrong import `../../sites.js` -> `#src/server/inbound/admin-http/routes/system/sites` (35/0).
- admin-http/__tests__/admin-request-facts.test.ts: expected a Host header fetch never sends (forbidden header); now `new URL(server.base).host`; servingOrigin still asserted from x-forwarded-host (6/0).
- assistant/__tests__/assistant-tool-access.unit.test.ts: proved BUG-1 (fixed).
BUG-1 FIXED: apps/website/src/server/inbound/assistant/assistant-tool-access.ts staleOrEnded (~l.66): a settings writer rejecting with null/non-object made `(error as {code}).code` throw a TypeError that replaced the original rejection. Fix: `error === ended` -> true; non-object -> false; then code/name checks. Test "a settings writer rejecting with null preserves the original reason without saving consent" red before, green after.
Coverage (L/B/F, scoped neighbour runs):
- assistant/agent-daemon-scope-http.ts 90.91/85.19/61.76 -> 99.65/85.11/81.08 (line 227 messageIdForAttempt needs a durable ledger; branch % dips because 5 more functions now execute). 6 tests in agent-daemon-scope.behavior.integration.test.ts: message-claim route refuses caller without live run credential (red if authorizer admits undefined caller); delegated calls resolve the run's tracked principal, attenuated only for read-only (red if principal invented / requireReadOnly ignored / always attenuated); interrupted static publish recovers with unconfirmed-status guidance (red if every tool recovered or failed status read returns undefined); component discovery 503 when catalog unreadable (red if .catch removed); discovery searches refreshed chart catalog (red if refreshComponents skipped); discovery for credential whose run is not live fails (red if siteTools.withRun bypassed).
- assistant/run-has-write-access.ts B 85.71 -> 100: "disclosure lists several switches ... unlabelled key" (red if pronoun always "it" or `?? key` dropped).
- assistant/daemon-origin-policy.ts B 88.89 -> 100: pinned origin without port trusts scheme default (red if 80/443 swapped/default to daemon port); invalid pinned origin throws (red if TypeError swallowed).
- routes/analytics/recent-hits.ts 100/83.33/100 -> 100/100/100: analytics-error-envelope.test.ts "failure with no authenticated principal answers 500 without diagnostic details" (red if details disclosed regardless of principal).
SKIPPED-ALREADY-COVERED: routes/plugins/chart-providers.ts 100/100/100 (chart-providers-route.unit, chart-providers-wire.pin); routes/assistant/stored-credential-probe.ts 100/100/100 (stored-credential-probe.admin.test.ts); error-mapping/respond.ts 94.12/100/100 (only import line 1; respond.test.ts).
EXCEPTION (only import/doc lines uncovered, B/F 100): capability-manifest-prefix.ts 1-30, federation-admissions-route.ts 5-53, plugin-prompt-prefix.ts 1-14, run-has-write-access.ts 3-15, daemon-origin-policy.ts 1-10.
Left: agent-daemon-scope-runtime.ts 168-176 (startBridgeProbe; needs spawn fake), assistant-tool-access.ts branches 15,33,40,44, agent-daemon-idle-park, agent-daemon-run-start, agent-daemon-scope-tools, site-key, themes/explore, members/newsletter deps, external-mcp/oauth, other small branch gaps.
Touched files: sites.tw4.pins 35/0; admin-request-facts 6/0; assistant-tool-access 12/0; agent-daemon-scope.behavior.integration 19/0; run-has-write-access+daemon-origin-policy 13/0; analytics-recent-hits+analytics-error-envelope 16/0; other 27 Codex files green.

## tv-w62-cov-web-11 (subagent report, condensed)
Commits on top of Codex 531359ca: 2771a58f (reds fixed), 3d9acae9 (new tests).
Codex partial: 22 files, 225 tests, 221/4 first run. Fixed:
- composition/__tests__/browser-analytics-http.unit.test.ts (Codex's): login 401 because bare express app had no JSON parser; global express.json swallowed collector raw body -> scoped `app.use('/api/admin/v1/auth', express.json())`. No assertion changed.
- OLD reds in Codex-touched files: boot/__tests__/boot-readiness-gate.unit.test.ts:39 regex pointed at removed `#src/features/webhooks/index` -> `#src/features/webhooks/keyring.env` (exports EnvOrFileKeyring + inspectSiteKeyMaterial; same strictness). boot/__tests__/site-key-boot-notice.unit.test.ts: warnIfNoSiteKeyAtBoot moved serveBootedSite() -> prepareSiteKey(); expected fn updated + new test that serveBootedSite() awaits prepareSiteKey exactly once top-level. composition/__tests__/commerce-http.unit.test.ts: storefront failure goes through reportServerFailure/res.locals.failureReporter, not console.error -> two cases: (a) bound reporter: record called exactly [{error, step:'commerce:storefront', operation:'commerce:storefront'}, {}] and exact 503 body with reporter ERR id; (b) no reporter: 503 with UNAVAILABLE_ERROR_ID and console line exactly ['[admin-failure] reporter unavailable', {operation}]. (Redaction now the reporter's job.)
New tests:
- memory-deps/slices/trash-adapters-forms-widgets.ts 87.5/100/64.29 -> 100/100/100, new composition/memory-deps/__tests__/trash-adapters.test.ts (6 tests): form purge cascade exact order/args (red if loop dropped/reordered); form+submission markers flip deletedAt, submission purge hardDelete({workspaceId,id}); widget purge removeBySource before entryRepo.hardDelete + hide/unhide; menu hide stores priorStatus, unhide restores, falls back to "published" (red if fallback dropped), purge removeByMenu before remove.
- trash-adapters-content.ts: comment unhide -> "pending", purge stands down "version-changed"; media trashed->active incl. noop flip.
- composition/assistant-history-tools.ts 96.77/100/80 -> 100/100/100: contribution domain/risk and build(deps) binds authorize with exact {principalId, workspaceId:'site-c', permission:'admin.assistant.use'}.
SKIPPED-ALREADY-COVERED: boot/agent-daemon-wanted.ts 100/100/100 (agent-daemon-wanted.unit); boot/site-daemon-listener.ts 100/100/100 (site-daemon-listener.integration); memory-deps/slices/form-attachment-purge.ts 100/94.74/100 (form-attachment-purge.test; leftover = sort comparator equal-id branch, ids unique); composition/analytics-providers.ts 98.99/100/100 (line 74 signature artefact); modules/agent-plugin-install-route.ts 100/95.45/100 (agent-plugins install-zip integration + wire).
BUG: none. Left: bootstrap.ts, commerce.ts, deps.ts, mount-admin-system.ts, visitor-submit.ts, http-app/module-handles.ts, agent-daemon-core-rpc.ts, site-boot-readiness.ts, admin-assistant-enabled.ts, mount-* and import-line-only gaps, remaining branch-only gaps; type-only files not examined.
Touched files together: 238/238 pass.

## tv-w62-cov-web-14 (subagent report, condensed)
Commits on top of Codex 240b4957: b9c95bf7 (Codex reds), f8088140 (warm-site-retirement, local-site-process), 58042d30 (agent-daemon-port).
Codex partial: 15 files, 86 tests 83/3 -> 85/85:
- assistant-daemon-demand.unit.test.ts (OLD test, stale): read cli/commands/serve.ts but beforeStart/awaitSiteBootReadiness/agentDaemonWanted moved to cli/commands/serve-listen.ts:92-97 -> repointed, assertions unchanged.
- packages/contracts/src/__tests__/content-chat-title.test.ts: removed one Codex case `'Edit the post "unfinished “Correct Title”'` expecting "Blog post: Correct Title"; code returns 'Blog post: unfinished “Correct Title' (readQuotedContentName content-chat-title.ts:31-40, `opening ??= index` keeps earliest). SUSPECT -> owner decides; if inner “ should win: `if (character === '“') opening = index;`.
- packages/contracts/src/__tests__/routines.test.ts: removed Codex test "routine beacon wire limit counts UTF-8 bytes" -> BUG-2.
BUG-2 (low, NOT fixed, test left out): packages/contracts/src/routines.ts:52 `text.length > ROUTINE_BEACON_MAX_BYTES` counts UTF-16 units though constant is bytes; 4096-unit multibyte string passes. Desktop reader enforces byte bound before parsing (apps/desktop/src/main/boot/routine-sites.ts:156-159). Fix: `|| new TextEncoder().encode(text).byteLength > ROUTINE_BEACON_MAX_BYTES`. Test: JSON.stringify({v:1,enabled:2,updatedAt:42,note:"x".repeat(1950)+"é".repeat(1100)}): length < 4096, UTF-8 bytes > 4096, parseRoutineBeacon({text}) === null.
Coverage:
- lifecycle/warm-site-retirement.ts 78.85/58.82/62.5 -> 98.08/100/100 (line 1 header). 9 tests in warm-site-retirement.unit.test.ts: default activity probe 204 idle; 409 for injected background work, live ops/assistant-daemon.json record, live delegated pid, EPERM delegated pid (signal args [[4242,0]]), ready supervised daemon; dead-pid record and ESRCH fall through to 204 (red if any branch at 15-21 deleted/inverted); retire route inert without token + TOVU_DEV_WARM_SITES, wrong token/GET 404, DELETE cancels fence, fenced -> 503 exact JSON (red on 33/37/38/39/43 guards); client disconnect before response finishes keeps site protected (red if writableFinished check l.49 removed).
- lifecycle/local-site-process.ts B 77.42 -> tryRetire 289-302 covered: local-site-start.unit.test.ts "tryRetire asks the child's retire route with its own token..." exact URL/method/x-tovu-retire == child TOVU_DEV_RETIRE_TOKEN; 409 sends no cancel; failed POST -> DELETE; DELETE logs on 500 and on throw. Net mock now records requests/fails per method. Note: tryRetire logs cancel error via describeErrorForLog ("Error" only) vs cancelRetirement formatErrorForLog (keeps message) — pinned current behaviour, owner may want parity. Left: terminate/killNow 277-287 (real pids), 320-323.
- lifecycle/agent-daemon-port.ts 97.14/83.33/? -> 100/100/100: "a delegated desktop daemon connection outranks the resolver's origin until it is withdrawn" (red if `delegatedAssistantDaemonConnection()?.url ??` precedence dropped).
SKIPPED-ALREADY-COVERED: visitor-tools-management.ts, webhook-delivery-worker.ts, widget-render-host.ts, seed.ts, daemon-demand-fetch.ts (100/100/100 existing tests); boot-lifecycle.ts B/F 100, L 89.19 header only (boot-lifecycle.unit); assistant-daemon-registry, env-schema, site-idle-park, daemon-lifecycle-log, contracts content-chat-title (B 94.64), credential-copy, host-signals, secret-redaction, upload-limits, routines, daemon-connection: B/F 100, remaining lines headers/comments.
EXCEPTION: packages/contracts/src/desktop-storage.ts, export-report.ts, product-telemetry.ts, site-scope-key.ts type-only; packages/sdk/src/index.ts barrel; content-chat-title.ts:15 `?? ''` unreachable (split returns >=1); :49 "\n" arm unreachable from public fn.
PRE-EXISTING reds (untouched files): webhook-delivery-worker.test.ts "default log writes failure line to console.error" (error passed as 2nd arg vs expected concatenated string); webhook-delivery-worker.shutdown.test.ts "receiver trickling bytes forever is cut off by total deadline" (both runs).
Left: daemon-supervisor.ts (largest gap), local-site-host.ts 30-39, readiness-state.ts 101, plugin-tier2/worker.ts + run-in-worker.ts, assistant-native-fallbacks.ts branches, admin-failure-copy.ts, sdk content-contracts.ts/hooks.ts.
Touched files together: 106/106 pass.

## tv-w62-cov-web-12 (subagent report, condensed)
Commits on top of Codex bf5f619a: 5747c056 (Codex reds + 2 small prod fixes), a778b2b6 (new test file).
Codex partial: 28 files, 323 tests 317/6. Fixes:
1. server/__tests__/routes/member-oidc-auth.test.ts + composition/modules/__tests__/site-assistant.provider-decision.unit.test.ts: "Test home isolation required" — new tests call createRouteDeps(); added the isolated-catalog-home import first (as bootstrap-modules.unit.test.ts).
2. routes/media/__tests__/media-grid-paging.test.ts: request lacked tab/orderBy -> 400 before 501 branch; query now `?tab=all&orderBy=created&limit=7`; assertions unchanged.
3. modules/__tests__/storage-routes.unit.test.ts "storage tool owner lookup…": cleanup.preview throws synchronously without a port -> `assert.rejects(async () => …)` same message. NOTE for owner: typed as Promise-returning but throws synchronously; a `.catch()` caller would miss it. Not changed.
4. BUG-3 FIXED: composition/modules/assistant-ag-ui-approval-segment.ts:54 ID_LINE regex consumed the newline, so of two consecutive `id:` lines the second was never seen (SSE: last id wins). Fix: end pattern with `(?=\r?\n)`. Proven by Codex test "the last of two consecutive SSE id fields wins" (red before, green after); split-chunk/heartbeat tests + assistant-ag-ui-resume integration green.
5. BUG-4 FIXED: composition/modules/assistant-routines.ts:134 Jini's runs route calls `store.listRuns({ routineId, limit }, { cursor })` but the Tovu adapter dropped `limit` -> every page unbounded, nextCursor null. Fix: forward `limit` when the 2nd arg has none (3 lines). Proven by Codex test "the routines route refuses a missing id and pages persisted runs…".
New tests: modules/__tests__/site-assistant-ag-ui-approval.unit.test.ts for site-assistant-ag-ui-approval.ts: brief 69.03/71.43/52.94; measured w/ existing integration 97.74/87.18/94.74 -> 100/89.74/94.74. "a visitor whose client already holds two approvals is denied the third…" (red if confirmations.confirm({allow:false}) or early return removed — mutation applied, 1 fail confirmed, restored); "an accepted approval parks the turn, writes one interrupt…" (red if interrupt format, res.end(), segments.parked=true or nowMs()+waitMs delay changes).
Measured: open-site-content-db.ts 100/100/100 (integration test); other-site-keys.ts L 97.78 (brief 46.54; 111-113, 220-221 open); assistant-ag-ui.ts L 91.15 (394-395, 592, 599-605 open); assistant-chats.ts L 98.76 (97-98, 346-349 open); assistant-run-acceptance.ts L 97.70 (144-145, 150-151, 198 open).
EXCEPTION: mutation-actor.ts 3-9,11 comment lines (type-only source-map artefact); types.ts type-only; import-line-only rows.
Left: remaining gaps above; storage-routes, revision-thinning-routes, routine-recovery-admission, screenshot-storage, serving-routines, site-assistant, move-site-storage, media, members, public-members, branch-only rows.
Other: open-site-content-db.integration.test.ts "copies an existing unadopted file to ops/ first and keeps only the newest five copies" failed once during a coverage run (untouched; possibly flaky/env).
Touched files together: 325/325 pass.
