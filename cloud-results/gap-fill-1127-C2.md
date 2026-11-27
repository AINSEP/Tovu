PARTIAL run C2 | jobs 5/5 | tests added 65 | files 100% 19/402 | bugs 0 | left: per-job LEFT lists below (biggest: job 12 storage/media/members routes, job 11 commerce.ts/mount-admin-system/bootstrap, job 9 agent-daemon-scope-tools/run-start branches, job 14 daemon-supervisor real-process paths, job 13 site-sharing/serving-app/tool-catalog Playwright)

# Gap fill 2026-11-27, run C2 (continuation of run C; Tovu website; jobs tv-w62-cov-web-9, -11, -12, -13, -14)

This run was unattended on Opus. Four subagents each took one job in its own git worktree: jobs 9, 11, 12 and 14. I (the coordinator) did job 13, pushed every branch, and made two small follow-up fixes to stale tests (job 11 and job 14).

What was not done: no RemoteTrigger, no `--no-verify`, no force-push. There were no edits to guards, thresholds or coverage config, no ts-ignore, no `as any` and no skipped tests. `.gitleaks.toml`, themes and packages/commerce were not touched. No production code changed.

**Secret scan, read this.** gitleaks was not installed in this container. Both attempts to download the release binary were blocked by the environment's permission classifier (once to /usr/local/bin, once to the scratchpad). The binary was never run.
- What I did instead: before every commit, a manual check of the staged diff (`git diff --cached | grep -niE 'key|token|secret|passw|bearer'`), with every hit reviewed by eye. All test values are short low-entropy fakes such as `tok-a`, `test-key` and `cred-1`.
- What you need to do: run `gitleaks protect` / `gitleaks detect` over these five branches locally before merging.

## Final pushed SHAs
`typecheck:tests` is 0 on every branch: run by each subagent after its last change, and by me for job 13.

| job | branch | run C head -> C2 head | new tests | touched test files run together |
|---|---|---|---|---|
| tv-w62-cov-web-9 | codex/tv-w62-cov-web-9 | df18b916 -> 9bc9cc6b | 6 | 54/54 |
| tv-w62-cov-web-11 | codex/tv-w62-cov-web-11 | 1e8d5a56 -> 544c0de5 | 13 (+1 stale test repointed) | 27/27, plus readiness 5/5 |
| tv-w62-cov-web-12 | codex/tv-w62-cov-web-12 | 8837e23e -> 5a946c4c | 9 | 77/77 |
| tv-w62-cov-web-13 | codex/tv-w62-cov-web-13 | 7a42921e -> eb3b6f08 | 14 | see the job 13 section |
| tv-w62-cov-web-14 | codex/tv-w62-cov-web-14 | 58042d30 -> 993419bc | 23 (+1 stale test repointed) | 23/23 new; daemon-supervisor set 133/133; callback-wiring 3/3 |

## Setup (what worked)
- Node 24.22.3 at /opt/node24. Jini at integ/merge-28-2026-11-26 d1ced6c5: `pnpm install --frozen-lockfile` and `pnpm -r build` were green.
- Tovu: `npm ci --ignore-scripts` at the root and in site-chat, then `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini`, then `tsc -p` for contracts and sdk.
- Per-job worktrees at /home/user/wt/<job>, with node_modules symlinked and the contracts/sdk dist copied. Coverage runs and typechecks were serialized with `flock` because the machine has 4 CPUs shared by 5 agents.
- **Coverage trap (new):** node's lcov writes one `SF` record per test file for the same source file. Reading only the first record under-reports coverage. Every figure in this report merges all records per line, branch and function.

## BUGs
- None new.
- BUG-2 from run C (`packages/contracts/src/routines.ts:52`, UTF-16 units counted against a byte limit) is still OPEN. It was out of scope for this run and is waiting on the owner.

## For the owner to decide
1. **gitleaks** was not run (see the top of this report). Run it locally before merging.
2. **Job 14, possible ordering issue.** If shutdown lands while desktop registration is still in flight, the desktop parent receives `withdraw` first and then a late `register`. The site refuses that connection with "shutting down". The test pins this current order.
   - Risk: the desktop may keep a stale registration unless it cleans up when the IPC link disconnects.
   - Suggested fix: check `shutdownRequested` before sending `register`.
3. **Job 14, three smaller questions:**
   - In desktop mode after shutdown, `ensureAssistantDaemonStarted()` says "never started this process boot", not "shutting down". This is wording only.
   - The parking-failure log keeps only the error class ("Error") and drops the parent's refusal reason. Is that intended redaction?
   - `local-site-process.ts` terminate/killNow (277-287, 320-323) and the `daemon-supervisor.ts` production terminate (454-455, 683) use a module-level `nodeProcessControl`. Testing them would need real pids. Suggestion: accept a `processControl` option in `LocalSiteLaunchContext`.
4. **Job 11:** `deps.ts` tests transpile the real function text and run it with injected ports. They kill every listed mutation, but node does not count this as coverage of the module, so lines 202 and 246 stay uncovered in the metric. Decide whether to also cover them through `mock.module` plus a full composition.
5. **Job 9:** `assistant-tool-access.ts:44`, the repo proxy's non-function branch. No caller reads a data property through `set`'s repo. Record it as an exception, or refactor it away?
6. **Job 12:**
   - The fixtures use `as unknown as RouteDeps` / `AssistantAcceptanceRouteDeps` and `as never`, the same style as the neighbouring tests.
   - The new delete-route test is in `assistant-chats-skill-title.unit.test.ts`, whose name is about titles. Move it to its own file?
   - The back-off abort test checks a timing bound: under 800 ms against a 1 s back-off.
7. **Job 13:**
   - `site-cookie-consent.test.ts` uses `{ headers } as unknown as express.Request`. The exclusion check throws before any request field is read.
   - `project-store.ts:242`: the `relative === ""` clause is redundant, because the next clause already refuses `""`. It is harmless.
8. **Pre-existing reds left untouched:**
   - `tool-read-wording.integration.test.ts`, "every hand-built readOnly flag site is listed here…" (a source scan; seen by job 12).
   - The run C list: webhook-delivery-worker, the shutdown trickle, open-site-content-db (flaky), and the site-deps characterization scans.

## tv-w62-cov-web-13 (coordinator)
Commits 1d658a91, df7996b0, 3d56369b, f06d9415, f273f6bb, 88bce9cc, 5e2d3033, eb3b6f08. typecheck:tests is 0. Every mutation below was applied to the source, the test went red, and the source was restored.

Coverage was measured over each file's importing tests (L/B/F, merged):

| file | before (this run) | after |
|---|---|---|
| site-cookie-consent.ts | 50.82 / 75.00 / 40.00 (`createSiteCookieConsentDeps` never ran; gate catches 57-58, 64 uncovered) | lines 22-47, 57-58 and 64 covered by the new tests |
| tool-catalog-manifest.ts | 97.57 / 94.44 / 50.00 (uncovered 508-513, 640-644, 694-701, 711) | 640-644 covered |
| vault-boot.ts | 98.15 / 93.04 / 97.30 (uncovered 27, 142, 327-328, 348, 360-361) | 142 and 360-361 covered |
| site-event-subscriptions.ts | no direct importer; the handler body had no assertion | the workspace.created log is asserted |
| public-site-guide.ts | 93.62 / 93.75 / 87.50 (23-25) | the search branch is covered (24) |
| project-store.ts | 98.11 / 87.69 / 96.30 (243-244, 268-270) | 243-244 and 268-270 covered |

Tests added (14), each with the mutation that turns it red:
- `__tests__/integration/create-app-event-subscriptions-once.integration.test.ts`, "the composed workspace.created subscription logs the event name and payload once, even after a rebuild". Red when the payload is dropped from the log call.
- `composition/__tests__/tool-catalog-post-preview.integration.test.ts` (new, 2 tests), built on the full production catalog and real deps:
  - "theme switched off … tool input error naming the theme-off reason": red when the TemplatePreviewRenderError mapping line is deleted.
  - "… not a template-render refusal propagates unchanged": red when every Error is mapped to ToolInputError.
- `composition/__tests__/vault-boot.integration.test.ts`:
  - "a legacy envelope the key cannot open is flagged unopenable and keeps its original bytes" (sqlite + pglite): red when line 142 says `missing-key`.
  - "the site vault policy reads custom and source-control secrets from their token field…": red when the `source-control` arm is dropped.
- `composition/__tests__/site-cookie-consent-deps.unit.test.ts` (new, 4 tests): "scriptDeclarations / browserPlugins / regionResolvers reuse one load for a minute, then read the plugins again", and "without a trusted ingress the region readers never consult the plugins". Red when the bridge TTL becomes `<=`, and when the region cache ignores the TTL.
- `public-http/middleware/__tests__/site-cookie-consent.test.ts`, "a failing exclusion check or receipt read fails closed…". Red when either catch (line 58 or line 64) rethrows.
- `composition/__tests__/public-site-guide.test.ts`, "an anonymous search matches only the public content card, by every word…". Red when search returns the plain overview.
- `composition/__tests__/project-store.unit.test.ts`:
  - "Shared Keys are refused when the app-data folder is the sites root or inside it…": red when the throw is disabled.
  - "the Shared Key label lookup finds one project key by kind and label, and refuses an ambiguous label": red when the ambiguity bound becomes `> 2`. Note: a custom credential's project row is stored as kind `vendor`. The unique label index covers only vendor and source-control, so another kind can repeat a label.

SKIPPED-ALREADY-COVERED (measured with importer tests): trash-user-admin-override.ts 100/100/100; publish-trust-grants.ts 100/100/100.

EXCEPTION (the uncovered "line" is a signature, comment or import, a source-map artefact; branches and functions are 100 or not affected):
- telemetry-consent.ts:29, site-key-write-bindings.ts:38, site-guide.ts:95, provider-config-source.ts:207
- provider-revision-watch.ts:9-10 (comments)
- site-update-binding.ts:1-7 (imports)
- vault-boot.ts:27 (import)
- vault-boot.ts:327-328 and 348: the production-default keyring and plugin-lifecycle ports. Every test injects them.
- public-site-guide.ts:23: `topic === undefined` is unreachable, because `readSiteGuideInput` always returns a topic for search.

LEFT:
- tool-catalog-manifest.ts 508-513: commerce askHuman confirm glue. Not attempted; it needs a commerce-enabled deps.
- tool-catalog-manifest.ts 694-701 and 711: the Playwright browser launch for `web_fetch_page` rendering. Environment-dependent.
- serving-app.ts 151-152: the routine boot-interruption barrier. Needs a full serving app with routines.
- site-deps/site-sharing.ts 88-91 and 125-138: share context and peer resolution.
- site-deps/* rows with no direct importer (trash-adapters and others). Not re-measured.
- The rows after project-store in the brief (product-events and later) were still being measured when this report was written.

## tv-w62-cov-web-9 (subagent)
Commits 7a93f693 (scope-runtime bridge probe), 92958a31 (assistant-tool-access) and 9bc9cc6b (agent-daemon-run-start).

Coverage:
- agent-daemon-scope-runtime.ts: 171-175 covered. Line 168 is the signature.
- assistant-tool-access.ts: B 86.49 -> 97.62 (41/42), L 100, F 100.
- agent-daemon-run-start.ts: L 95.87 -> 98.07, B 61.11 -> 79.25 (from that one test file).

Tests added (6), each with its mutation:
- Bridge probe, 2 tests: an ok line when the bridge answers initialize, and a FAILED line when it exits first. The spawn port is injected and runs a real child node process. Red when `if (result.ok)` is inverted; the ok test is also red when the host env is dropped.
- Tool access:
  - The consent snapshot carries a reason only under a host lock. Red when the reason is always added.
  - Allow turns the assistant on only when the card asked for `enabled`. Red when it is set unconditionally.
  - A run that ends during the settings transaction. Red when the post-run isLive check at line 40 is removed.
- Run start: a rejected terminal wait is logged for both holds and attachment cleanup still runs. Red when `.finally(releaseRun)` is removed, and when the cleanup log is removed.

SKIPPED-ALREADY-COVERED:
- agent-daemon-idle-park.ts: 97.7 / 100 / 100.
- external-mcp/oauth.ts: 100 / 100 / 100 over 40 importers.
- newsletter/deps.ts:128 and members/deps.ts:36: covered by existing tests.
- themes/explore.ts: the brief lines (511, 541-542, 555-559, 570-575) are covered by its 3 importers: 97.11 / 84.62 / 94.74. I measured this.
- routes/system/site-key.ts: L 100, B 89.93, F 100 over 15 importers. The brief lines are covered; I measured this.

EXCEPTION:
- idle-park.ts 1 and 3; members/deps.ts 1-8; newsletter/deps.ts 1-15 (all imports or comments).

LEFT:
- agent-daemon-scope-tools.ts 83-84 and 98-99: frontend bind-token errors. Reaching them needs a full @jini-ai/daemon/http bind.
- run-start branches 201, 239, 273, 313, 347, 350, 403, 415, 418, 424.
- explore.ts branch gaps 230, 257, 318, 327, 398, 419, 421, 572.
- site-key.ts branch gaps 230, 292, 294, 461, 471, 473, 567-570, 583-596, 610.
- The small branch rows of the brief.

## tv-w62-cov-web-11 (subagent, plus 1 coordinator fix)
Commits d80b948d (deps.ts), 9a78ff42 (agent-daemon-core-rpc.ts), c43338e7 (visitor-submit.ts) and 544c0de5 (coordinator).

Coverage:
- agent-daemon-core-rpc.ts: B 87.14 -> 95.95.
- visitor-submit.ts: 101-103 and 113-118 covered by the new http-app/__tests__/visitor-submit.unit.test.ts.
- deps.ts: behaviour is tested through the transpile seam, but the metric is unchanged (owner item 4).

Tests added (13), each with its mutation:
- deps.ts, 3 tests:
  - `requestedWorkspaceId` dropped from the line-246 overrides;
  - `closeSqliteConnection` dropped from the catch;
  - the sqlite-only chat-orphan warning forced on.
- agent-daemon-core-rpc consent, 5 tests:
  - the getAgentDef check deleted;
  - `runStatus ?? ""` changed to `?? "queued"`;
  - the line-42 throw changed to `return null`;
  - `?? "claude"` changed to `?? "codex"`, and separately `cancelReason ||` removed;
  - `?? "metadata"` changed to `"full"` (at line 145 and at line 27).
- visitor-submit, 5 tests:
  - the isMediaRemote early return removed;
  - `bavail*bsize` changed to `bavail`;
  - `await identityReady` removed;
  - the `status === "active"` filter removed;
  - the no-principal throw removed.

Coordinator fix 544c0de5: `boot/__tests__/site-boot-readiness.unit.test.ts`, "both top-level boot paths await the shared list", was red. The CLI readiness await moved from `cli/commands/serve.ts` to `serve-listen.ts:96`, which `serve.ts` calls. This is not a regression. I repointed the source scan and left the assertions unchanged. Red when the await in serve-listen.ts is replaced.

EXCEPTION:
- Doc comments or imports only: site-boot-readiness.ts 1-26 and 28; admin-assistant-enabled.ts 1-23 and 25-27; module-handles.ts 12, 15 and 20-28; agent-daemon-core-rpc.ts:1; mount-admin-system.ts 2-6; commerce.ts:1.
- agent-daemon-core-rpc.ts 102 and 120: zod already rejects unsupported operations, so these defaults are unreachable.

SKIPPED-ALREADY-COVERED: module-handles.ts mountRoutes/startModule; visitor-submit.ts registerCommentsSubmit/registerAnalyticsIngest.

LEFT:
- agent-daemon-core-rpc.ts:151, the foreign settings workspace branch.
- deps.ts 202 and 246 (metric only).
- mount-admin-system.ts branches 157, 224, 231, 266, 318, 347.
- commerce.ts: lines 65-69 and 261-262, about 20 branches, and evictOldestAlert. One of its importers needs a local Postgres socket.
- bootstrap.ts: not started.

## tv-w62-cov-web-12 (subagent)
Commits 55a5f43e (other-site-keys), 50c24c35 (assistant-ag-ui routes and error sink), aa745cbf (assistant-run-acceptance), 09bf0374 (assistant-chats) and 5a946c4c (typecheck fix).

Coverage:
- other-site-keys.ts: 97.78 / 84.76 / 84.78 -> 100 / 86.24 / 87.23.
- assistant-ag-ui.ts: 394-395 and 604-605 covered.
- assistant-run-acceptance.ts: L 78.41 -> 97.73 (unit file only).
- assistant-chats.ts: 97-98 and 346-349 covered.

Tests added (9), each with its mutation:
- other-site-keys, 2 tests: the permission lookup when the row is missing, and the locked row when listing fails. Red when `if(!row) return null` becomes a stub or meta becomes `{}`, and when `locked` is dropped.
- ag-ui routes: refusal-code sanitizing. Red when the SAFE_REFUSAL_CODE check is dropped.
- error sink: an error before the stream starts. Red when `next(error)` becomes `next()`.
- run-acceptance, 3 tests:
  - start capture: red when `userId` becomes `run.principalId`;
  - back-off abort: red when the abort listener is removed;
  - no durable ledger: literal expectations.
- chats, 2 tests:
  - an unsaved title: red when `catch` becomes `finally`;
  - delete cancels and recovers: red when the status list is narrowed, or the recover call is removed.

EXCEPTION:
- assistant-ag-ui.ts 3-46: doc comment, a source-map artefact.
- Candidate: assistant-run-acceptance.ts 144-145 and 212-213, `if (!client.launch) throw`. The HTTP client always provides launch.

LEFT:
- storage-routes, revision-thinning-routes, routine-recovery-admission, screenshot-storage, serving-routines, site-assistant, move-site-storage, media, members, public-members, and the branch-only rows.
- assistant-ag-ui.ts partial branches 154, 175-176, 210-211, 231-232, 288, 298-299, 424, 442.
- other-site-keys.ts partial branches.

## tv-w62-cov-web-14 (subagent, plus 1 coordinator fix)
Commits cdd2f6e5 (daemon-supervisor-wrapper and local-site-host-warm unit tests), a584d3c3 (daemon-supervisor-taskkill) and 993419bc (coordinator).

Coverage:
- daemon-supervisor.ts: 96.38 / 80.65 / 84.62 -> 99.70 / 96.00 / 94.03.
- local-site-host.ts: 87.50 / 85.37 / 83.33 -> 97.32 / 83.33 / 89.47. The branch figure fell because the newly reached code has partly-taken branches.

Tests added (23, in 3 new files):
- Wrapper tests: kill 24 of 26 applied mutations (lines 266, 409, 554-555, 565-569, 582-593, 613, 655, 697, 711-739, 755-802, and the TOOL_EXEC_TOKEN delete).
  - The 2 survivors are redundant defences: the inner try at 271, which the Jini sidecar's terminate already swallows, and the shutting-down check at 753, which `ensureReady` refuses with the same message.
- Taskkill tests: red when `/T` is dropped, and when the `SystemRoot ??` fallback is dropped.
- local-site-host-warm: literal expectations (URL, port 3000 default, SITE_NOT_FOUND).

Coordinator fix 993419bc: `boot/__tests__/site-daemon-callback-wiring.unit.test.ts` was red. The CLI daemon-callback wiring moved from `serve.ts` to `serve-listen.ts`. I repointed the scan and left the assertions unchanged. Red when `siteCallbackOrigin: daemonCallback.origin` is removed.

EXCEPTION:
- daemon-supervisor.ts 296 and 426: the `isCompiled` branch runs only from a built dist.
- plugin-tier2/worker.ts 1-13 and run-in-worker.ts 1-11: header and import lines.
- packages/sdk content-contracts.ts: type-only.
- readiness-state.ts:101: a function signature. The function runs in the supervisor tests.

SKIPPED-ALREADY-COVERED: worker.ts; run-in-worker.ts; admin-failure-copy.ts 100/100/100; sdk hooks.ts.

LEFT:
- daemon-supervisor.ts 454-455 and 683 (module-level process control), 640 and 644 (the real port and registry), and 697 (the non-Error side).
- local-site-host.ts 36-38 (a real child).
- local-site-process.ts 277-287 and 320-323.
- assistant-native-fallbacks.ts:82 (one side of the byAgent spread).
- Out of scope: BUG-2 and the content-chat-title curly-quote question.
