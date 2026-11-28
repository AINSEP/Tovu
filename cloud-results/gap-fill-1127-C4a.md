PARTIAL run C4a | jobs 1/3 complete (job 9; job 12 slice B also done apart from 1 blocked row) | tests added 114 | files newly 100/100/100: 7 strict, plus 6 where only comment/signature lines are left | bugs 0 | left: job 9 0 real (EXCEPTIONS only), job 11 ~8 files, job 12 ~6 files (slice A)

# Gap fill 2026-11-27, round 4, run C4a (Tovu website; jobs tv-w62-cov-web-9, -11, -12)

- **Times:**
  - start 03:11 UTC;
  - last subagent dispatched 05:38 UTC (cut-off 05:41);
  - report finished 05:53 UTC.
- **Subagents run in total: 18** (opus-high, one job or slice each, each in its own git worktree, up to 4 at once):
  - round 1 (4): killed by the container restart at about 03:45;
  - job 9: rounds 2, 3, 4;
  - job 11: rounds 2, 3, 4, 5, plus a repo.sqlite slice in a second worktree;
  - job 12: slice A rounds 2, 3, 4 and slice B rounds 2, 3, 4.
  - Each returning subagent was replaced right away with an updated LEFT list until the cut-off.
- **Jobs complete (LEFT empty or documented EXCEPTIONS only): 1 of 3, job 9.**
  - Job 12 slice B (rows 56-90) is also complete apart from 1 blocked row: 7 rows at 100/100/100, 27 EXCEPTION-only, 1 blocked by the environment.
  - Job 11 and job 12 slice A still have real gaps (listed below).
- **What did not happen:**
  - no RemoteTrigger, no `--no-verify`, no force-push;
  - guards, thresholds and coverage config untouched;
  - no ts-ignore, no `as any`, no skipped tests;
  - `.gitleaks.toml`, themes, packages/commerce and PageEditorChrome untouched.
  - **No production code changed.** Each branch was checked with `git diff <C3a head> <C4a head> --name-only`, filtering out `__tests__/` and `*.test.ts`: 0 non-test files on all three.
- **gitleaks was not run.** It is not installed, and the brief says not to download it. Every subagent read `git diff --cached | grep -niE 'key|token|secret|passw|bearer'` by eye before each commit, and fakes are short, low-entropy values. Run `gitleaks protect`/`detect` on the three branches before merging.

## Final pushed SHAs (C3a head -> C4a head)

| job | branch | C3a -> C4a head | commits | test()/it() added | removed | test files changed | non-test files changed |
|---|---|---|---|---|---|---|---|
| tv-w62-cov-web-9 | codex/tv-w62-cov-web-9 | c15b90f95c -> 89d14eaba5 | 17 | 35 | 0 | 11 | 0 |
| tv-w62-cov-web-11 | codex/tv-w62-cov-web-11 | 427c0030cb -> 59248f0cf8 | 20 | 31 | 0 | 13 | 0 |
| tv-w62-cov-web-12 | codex/tv-w62-cov-web-12 | 98a1c4e50f -> 064b58ddca | 23 | 48 | 0 | 21 | 0 |

- **Backup branches (can be deleted; every commit on them is cherry-picked onto the job branch, verified by patch-id):**
  - `codex/tv-w62-cov-web-12-c4a-b` (job 12 slice B);
  - `codex/tv-w62-cov-web-11-c4a-b` (job 11 repo.sqlite slice).
- The pre-existing `codex/tv-w62-cov-web-12-b` from C3a can also be deleted.

## Final verification (coordinator, on the final heads)

Each line is every test file changed this run on that branch, run together on the final head, plus `npm run typecheck:tests`:
- job 9 @89d14eaba5: 133/133 across 11 files; typecheck 0.
- job 11 @59248f0cf8: 100/100 across 13 files; typecheck 0.
- job 12 @064b58ddca: 286/286 across 21 files; typecheck 0.
- The test()/it() counts above come from grepping the diffs. Subagents also extended existing tests and wrote table-driven cases, so their own tallies are somewhat higher (about 40 / 32 / 47).

**Files newly at 100/100/100 (7):**
- job 9: agent-daemon-scope-tools; owner-passkey-routes (needs the passkey browser suites run with CHROMIUM_EXECUTABLE_PATH, see Read-first item 3).
- job 11: publish-apply.
- job 12: peer-site-reads, run-finalizer/entry, run-finalizer/watch-state, publish-content-import.

**Branches and functions at 100, only comment or signature lines left (6):**
- job 9: warm-site-control, http/widgets;
- job 12: owner-auth, assistant-ag-ui-launch, site-assistant-ag-ui-approval (re-confirmed), system-deploy (re-confirmed with route tests).

## Setup
- Node 24.22.3 (/opt/node24). Jini integ/merge-28 d1ced6c5: `pnpm install --frozen-lockfile` and `pnpm -r build`, both green.
- Tovu: `npm ci --ignore-scripts` (root and site-chat), `link:jini`, then `tsc -p` for contracts and sdk. Worktrees are at /home/user/wt/<job>.
- Coverage helper:
  - node:test with `--enable-source-maps --experimental-test-coverage` and an explicit `--test-coverage-include` per source file;
  - runs under a global flock;
  - every lcov SF record for a source is merged, which avoids the C2 multi-SF trap;
  - typecheck runs under a separate lock.

## Read this first (for the owner)

1. **The container restarted at about 03:45 UTC.**
   - It killed all 4 round-1 subagents. Their commits survived, and their uncommitted test edits survived on disk; round 2 verified, mutation-checked and committed those edits.
   - web-9 also held a half-finished mutation of production `agent-daemon-scope.ts:124` (`|| !token` dropped). The coordinator restored it with `git checkout` before anything was committed, and checked every worktree for other production diffs (none).
   - The brief then required a commit after every file.
2. **Incident: a shared-scratchpad clash, with no damage.**
   - At about 04:28-04:35, slice A ran slice B's scratchpad `mut.sh` once, at the same time as slice B's own copy. Both mutate web-12-b sources and restore them with git checkout.
   - Production files were clean afterwards.
   - Slice B re-ran all 14 of its round-2 mutants: every one still goes red. The one "survivor" (which had caused a test to be dropped) was an artefact; that test was restored and committed.
   - From then on, every agent used its own /home/user/wt/scratch/<slice>/.
   - This is the second run in a row with this kind of clash (C3a had one). For future runs, the brief should say "per-agent scratch dir" from the start.
3. **The passkey browser suites pass in the cloud when `CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` is set** (owner-passkey-browser and owner-passkey-http, 52/52 with the unit tests).
   - They cover owner-passkey-routes fn@40 (now 100/100/100) and dev-auth L622-626.
   - C3a's "chromium missing" red is environment only.
4. **Refactor candidates (dead or unreachable code), new this run:**
   - agent-daemon-scope's self-built idle park is never `start()`ed. Both production callers pass `idlePark`, so make it required.
   - dev-auth br 653: no Jini caller passes `{ name }` to replaceSession.
   - publish-site's `inspectStaticPublish` dependency is never called.
   - system-mail `authorize` forwarder @234.
   - commerce.ts (website) br 242: the guard is repeated downstream.
   - commerce.ts br 67: the eviction "no oldest" throw.
   - publish-content-backstop 98/146: the ports are always set.
   - other-site-keys type-required stubs @40/@68/@88.
5. **Surviving or equivalent mutants worth knowing:**
   - assistant-ag-ui:299, `resume.length !== 1` (looks redundant behind Jini's readConfirmationResume);
   - ag-ui:231;
   - agent-daemon-scope `hasExchanges: () => false` (needs a bound admin tab);
   - principalOfLiveRun always returning "owner" (the run end revokes the credential anyway);
   - other-site-keys:202;
   - repo.sqlite 155/168: the two workspace-count tests refuse, but the refusal does not pin those guards.
6. **Pre-existing reds, left untouched.** These are C3a's environment-drift list plus:
   - members-public-complete-sign-in "session-repo failure surfaces as a 500";
   - composition-boot-order.unit "content.db schema guard and site key run before the composition root opens the database";
   - open-site-content-db.integration "copies an existing unadopted file to ops/ …";
   - publish-site-route ×2;
   - createApp route-table pin ×7.
   - None of these are in test files changed this run, and none were investigated.
7. **BUGs: none new.** These are still open and were out of scope: C3a's commerce.ts shutdown-race finding, and BUG-2 from run C (contracts routines.ts:52).

## LEFT (real gaps, per job)

- **Job 9: no real gaps.** Every remaining item is an EXCEPTION with its reason in the round notes:
  - agent-daemon-scope br 270 and @211;
  - dev-auth br 653;
  - publish-site fn@102;
  - run-tool-access 109/132/174/184;
  - admin-json-route-ports 316/406/461;
  - peer-transport 91;
  - scope-attachments 128;
  - signature and comment lines.
  - owner-passkey fn@40 and dev-auth L622-626 are covered once the browser suites run with CHROMIUM_EXECUTABLE_PATH.
- **Job 11, real gaps:**
  - commerce.ts (website) br 141, 149, 262, 322, 355-357, 361, 362, 456, 471; fns 106, 337. Failure-only paths; 141 and 149 need a Postgres kernel or one that fails on purpose.
  - trash-and-content fns 125, 135, 165, 175, 222.
  - assistant-and-site fns 32, 59, 60, 106, 118, 149, 159.
  - publish-export fns 82, 175, 244.
  - deps.ts br 155/168/170; fns 102, 107, 109, 139, 162, 163, 165. Part of deps.ts is tested only through a vm-transpiled copy, which coverage cannot see.
  - memory-trash fn 86.
  - mount-admin-features fn 71.
  - mount-admin-system br 266.
  - app.ts br 140, 453. Its 11 late-bound getter fns are EXCEPTION or refactor candidates.
  - repo.sqlite is done apart from EXCEPTIONS.
  - Type-only, not loadable, EXCEPTIONS: routes/types.ts, credentials-deps.ts, create-app-options.ts, memory-deps/route-deps/context.ts.
- **Job 12 slice A, real gaps:**
  - assistant-byok: 191, 210-212; br 174, 176, 221, 223, 253, 259, 260, 291; fns 119, 170, 171, 190, 209, 264. Mostly the default-surface path, the desktop handoff singleton or the 4 s lowering timeout.
  - assistant-byok-turn br 163, 205, 285, 330, 331, 334, 353, 366, 382; anon@206.
  - assistant.ts: 161-162 and 16 branch lines; fn@125.
  - assistant-chats 143-145 (needs a live daemon registry record).
  - public-members br 102, 274.
  - assistant-routines br 136, 142, 143, 147 (all proposed as EXCEPTIONS by C3a).
- **Job 12 slice B:** only row 61, site-assistant-turn br 189/231/247, is left. It is blocked because page tools never reach a browser tab in this environment (the same cause as the golden page.navigate red), and there is no injection seam. The full 35-row table is below.

# Per-round notes (tests -> mutation, before -> after, EXCEPTIONS)

## Job 9, C4a round 2 (round 1 killed by the restart: it left uncommitted agent-daemon-scope tests, 26/26 green, each mutation-checked, one non-proving assertion removed). Commits 00504c113c, 7fe1b1b344, db259ccbfb, 3efaf7e75d, b2c0aaea15, a577b6a015; typecheck 0 before every commit. 28 tests.
- Before -> after (L/B/F):
  - agent-daemon-scope: L341-346, br 124/131/270, 12 fns uncovered -> 100/96.88/68 (3 importers)
  - agent-daemon-run-tool-access 88.64/85.71/88.46 -> 100/95.35/100
  - admin-json-route-ports 100/94.90/96.97 -> 99.79/98.80/100
  - peer-transport 100/76.19/100 -> 100/95.24/100
  - admin-request-facts: L82-85 already covered when merged over all importers
  - run-launch br 143: covered (mutation red)
- Tests -> the mutation that turns each red:
  - scope "refused without site dir / RPC credential / daemon endpoint / proxy credential" x4 -> each operand of the two `||` checks dropped. This is the mutation that was left in production by the killed round 1 (restored).
  - scope "another workspace releases the inventory and rethrows" -> inventory dispose no-op
  - scope "reports both failed cleanups and rethrows the startup error" -> cleanup log dropped / catch rethrows / dispose no-op
  - scope "site settings read fails at run start, run still launches" -> warn port no-op
  - run-tool-access.setup x9: alternatives / declined card / no qualified agent / signed-out reason / host-locked switches / routine and person runs with no definition / allowed and alternative consent returns / revoked before preparation -> the matching guard or spread removed
  - run-launch-dispatch "withdrawn during the launch's fresh policy read" -> liveness check dropped
  - admin-json-route-ports x4: failureFor override / no reporter / shared default ports / same-origin write refusal at registration
  - unexpected-route-errors peers x3: details hidden when signed out / shown when signed in / copy names method and route
  - peer-transport.routes.pins x3: push plan/confirm/execute without a signed-in person -> discloseDetails forced true
- EXCEPTIONS:
  - run-tool-access 109, 132, 174 (no-definition path goes to SETUP first)
  - run-tool-access 184 `def ?? {}` (equivalent mutant)
  - admin-json-route-ports 406 (`:workspaceId` param is always present), 316 (undefined reporter = omitted), L461 (signature line)
  - peer-transport 91 (Express always sets res.req)
  - admin-request-facts L97 (signature line)
  - scope-attachments 128 (refs come from byPath.keys())
- Note: three alternative-filter mutants hang until the 300 s test timeout instead of failing at once. They still go red.

## Job 9, C4a round 3. Commits 487cb2f80a, a4e59fc2e7, 55721033a6, 73106f8313, d1eb37abc2, 2a318ba8f5; 6 tests; typecheck 0 before each commit.
- Before -> after:
  - owner-passkey-routes 100/100/75 -> 100/100/95 (fn@40 left)
  - warm-site-control B95.65 -> 98.44/100/100 (L1 comment). Br 36 is covered with real openssl certificates and a real HTTPS parent.
  - agent-daemon-scope-tools: fn@63 covered -> 99.29/92.86/100
  - agent-daemon-scope F68 -> F72 (principalOfLiveRun covered)
  - widgets br 68 was already covered when merged over its 3 importers -> B100 F100 (L77 signature)
  - site-shares br 75 and scope-attachments br 222 covered (mutations red)
- Tests -> the mutation that turns each red:
  - owner-passkey-ceremony-http.integration (new; real HTTP + sqlite identity, no browser) "removal, login refusal and storage incidents" -> body closure returns {} / 204 to 200 / incident to 400 / wrong service. A same-service, wrong-workspace variant survives: a never-issued token is refused either way.
  - share-download-refusals "a client that drops mid-stream gets its socket destroyed" (real socket, 32 MiB ZIP) -> res.destroy() dropped / headersSent check false
  - scope-attachment-upload-owner.unit (new) "uploads owned by the forwarded principal header" -> `?? ""` / owner hard-coded / idle park not held
  - scope-tools.frontend-bind "tab stream owned by the forwarded admin principal and tab" -> resolveOwner fixed / principal hard-coded
  - agent-daemon-scope.behavior "a bridge credential minted for a live run admits claims until the run ends" -> principalOfLiveRun returns undefined. The always-"owner" mutant survives because ending the run revokes the credential; the test comment says so.
  - warm-site-control.tls.unit (new) "with the dev TLS pair present, the warm child relays to an HTTPS parent" -> certificate undefined
- EXCEPTIONS:
  - owner-passkey-routes fn@40 and dev-auth L622-626: need a verified WebAuthn assertion. Only the browser integration tests cover them, and those fail here: the Playwright chromium build is missing.
  - dev-auth br 653: no Jini caller passes `{ name }` to replaceSession. Refactor candidate.
  - publish-site fn@102: inspectStaticPublish is never called by this composition; the type requires it. Refactor candidate.
  - agent-daemon-scope br 270: the real bridge probe spawns the CLI.
  - signature/comment lines: site-tools L225, widgets L77, warm-site-control L1
- Pre-existing reds: owner-passkey-browser / owner-passkey-http integration (chromium missing).

## Job 9, C4a round 4. Commits 6535b4ceff, 6adf2a701d, 1b7e3b8090, 3b122019a3, 89d14eaba5; typecheck 0; 6 tests; final merged run over the 4 importers 49/49.
- Passkey, settled with no commit:
  - With `CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`, owner-passkey-browser and owner-passkey-http pass (52/52 with the unit tests).
  - owner-passkey-routes -> 100/100/100 (fn@40) and dev-auth L622-626 are covered.
  - The "chromium missing" red is environment only; set that variable when running these suites in the cloud.
- Before -> after:
  - agent-daemon-scope-tools 99.29/92.86/100 -> 100/100/100
  - agent-daemon-scope 100/96.88/72 -> 100/97.67/92. Now covered: br 294 (disposed and revoked sides), @219 readSnapshot/execute, @241 mintRunCredential, @258 getAttachmentStore, @272 hasExchanges.
- Tests -> the mutation that turns each red:
  - frontend-bind "discovery uses the listener origin without a callback origin; with neither it fails fast" -> listener fallback dropped / `?? ""` to a default host
  - behavior "the minted bridge credential is admitted until tool access is lowered, then cannot be re-minted" -> revokedToolRuns check dropped / fixed runId
  - behavior "once disposing, no credential can be minted for a live run" -> isDisposed() check dropped
  - behavior "chat_settings_get answers the launch snapshot to its own principal only, nothing after lowering" -> principal ignored / revocation ignored
  - behavior "a run naming an unregistered attachment fails before launch as unreadable" -> getAttachmentStore returns undefined
  - behavior "an opaque click with no admin tab reads through the audited executor, then refuses without parking" -> execute bypasses the executor / hasExchanges always true. The `hasExchanges: () => false` mutant survives: killing it needs a bound admin tab, which the harness lacks.
- Harness change: `controls.injection` records the mcpJsonInjection handed to the agent executor.
- EXCEPTIONS:
  - agent-daemon-scope @211: the self-built idle park is never start()ed, and both production callers pass idlePark. Refactor candidate: make idlePark required.
  - agent-daemon-scope br 270: the real probe spawns the CLI.
  - carried from earlier rounds: dev-auth br 653, publish-site fn@102, signature lines site-tools L225, widgets L77, warm-site-control L1

## Job 11, C4a round 2 (round 1 killed by the restart; its commits fdd1b08bf8 and dbf169a016 kept). Commits 21c96e4c2a, b0dae43fa1, 83b2b16e6b, 45e4e7b806; typecheck 0 at head.
- b0dae43fa1 does not typecheck on its own (wrong argument shape); 83b2b16e6b fixes it.
- Merged measurement over 3 batches: 103 + 43 + 22 test files (composition app/create-*/memory*/commerce*/serving-app*/boot* tests, plus every direct importer). Merging runs makes branch % noisy, because per-run branch keys differ.
- Before -> after (L/B/F):
  - publish-apply 98.55/100/50 -> 100/100/100
  - memory-trash 100/83.33/57.14 -> 100/100/57.14
  - mount-public-site 93.94/100/50 -> 93.94/100/100
  - mount-assistant 94.59/100/33.33 -> 94.59/90.00/100
  - app.ts 96.17/86.67/66.67 -> 97.18/86.36/74.36
  - trash-and-content 97.02/81.82/53.33 -> 98.72/77.27/73.33
  - public-middleware 95.69/100/100 -> 95.69/96.15/100
  - deps.ts 88.35/82.14/48 -> 88.35/79.07/52
  - repo.sqlite first measured: 100/85.07/93.10
  - installed-extension-tools 77.97/100/100: only lines 1-26 left (import/header)
- Tests (7), each with the mutation that turns it red:
  - site-imports-wire "a form over the 8 kB limit is refused by the parser…" -> parseForm always resolves (mount-admin-system:347)
  - memory-slices "a replaced theme folder rescans the served roster in place" -> rescanThemes call removed (publish-apply:67)
  - memory-slices "a post rollback failure is reported on the console" -> console.error dropped (publish-apply:44)
  - memory-slices "refuses to compose when the trash registry has no term / taxonomy / form entry" x3 -> each `!entry ||` guard dropped (memory-trash:66)
  - memory-root-form-trash-mover "unknown form not-found, known form trashed with name+slug, repeat not-found" -> reason changed / version: marker.version -> 1 / title and subtitle swapped (trash-and-content:59-62)
- EXCEPTIONS:
  - type-only, not loaded by any test: routes/types.ts, route-deps/credentials-deps.ts, create-app-options.ts, memory-deps/route-deps/context.ts
  - source-map header/import/export lines: app.ts 32, 71, 99, 103, 210-211, 310, 324, 370-374, 449; mount-* 1-6 and their export lines; installed-extension-tools 1-26; commerce.ts 1
- Pre-existing reds, not in changed files: createApp route-table pin x7; memory root ordered key list; runServeCommand listen host; stock seed blob hydration; Postgres boot x4; admin-trash "list:" x4; others.

## Job 11, C4a round 3. Commits 03461f1d97, 1ddf14c714, 5f45185ecd, ffc247401b, 4f012be253; typecheck 0; touched test files 37/37. 9 tests.
- Results:
  - commerce.ts (website composition) 96.97/90.13/94.12 -> 98.37/92.31/95.10
  - publish-export B80 -> 100: br 121 and fns 177-187 covered
  - app.ts br 456/478 covered; mount-admin-system fn 137 covered; public-middleware br 114 was already covered by create-app-lifecycle
- Round-2 LEFT items that were only measurement gaps (they were already covered once the right test files were in the run):
  - members-media 37-40, fns 77/79 (server-modules.unit)
  - trash-and-content br 193/194, fn 223
  - mount-assistant br 31/42 (create-app-routine-wiring)
  - deps.ts 202, 253-258: tested only through a vm-transpiled copy that coverage cannot see (tooling limit)
- Tests -> the mutation that turns each red:
  - commerce-attention "caller readiness decides catalog visibility" -> && to || (:468)
  - commerce-attention "failing catalog read warned once per read" -> warn dropped (:478)
  - commerce-attention "unreadable activation pauses storefront, warns once per outage" -> reset / guard dropped (:114-116)
  - commerce-attention "closed runtime stops handing out the webhook receiver" -> !storage.closed dropped (:456)
  - commerce-attention "failing operator status read reports unavailable, logs a redacted cause" -> warn dropped / failure swallowed (:432-433)
  - storage-tool-wiring "storage report for the owner's session only" -> ownerPrincipalId getter returns another id (mount-admin-system:137)
  - create-app-lifecycle "stopForIdle: a share backend or campaign repo that cannot answer counts as busy" -> `!== false` to `=== true` / `?? true` to `?? false` / branch disabled (app.ts:454/456)
  - memory-root-shared-instances "hermetic root loaders read the bundled plugins' own declarations" -> sourceRoot pointed at a missing dir, one mutation per line (publish-export:177-188)
  - memory-root-shared-instances "supplied peer client is the one the root dials" -> option dropped (publish-export:121)
- EXCEPTIONS:
  - repo.sqlite 191: process entry
  - repo.sqlite br 128: the kernel always has a connection
  - commerce.ts br 242: guard duplicated downstream; refactor candidate
  - commerce.ts fn 264: grants unreachable in one-time checkout
- LEFT:
  - commerce.ts 65-69, 401; br 141, 145, 149, 262, 270, 272, 322, 351, 355-357, 361, 362, 400, 471; fn 65, 106, 337
  - deps.ts br 155/168/170; fns 102, 107, 109, 139, 162, 163, 165
  - repo.sqlite: child-process helper, round-2 items not started
  - app.ts br 140, 440, 442, 453; fns 152, 153, 158, 171, 178, 192, 195, 279, 281, 289, 323
  - trash-and-content br 63; fns 125, 132, 133, 135, 165, 175, 222
  - publish-export fns 82, 147, 175, 244
  - assistant-and-site fns 32, 59, 60, 106, 118, 149, 159
  - not re-measured: memory-trash, model-comments-plugins, mount-admin-features 71, mount-admin-system br 266

## Job 11, C4a round 4. Commits 096518ac9f, 8ca099fa80 (fixes TS2339 from 096518ac9f), a2dedf758d, ff90b452e1, 8e46f1386b; typecheck 0; 6 tests.
- Results:
  - commerce.ts (website composition) 98.37/92.31/95.10 -> 99.77/94.78/96.08 (all 5 importers, 55/55). Covered: 65-69, 401; br 145, 270, 272, 351, 400; fn 65.
  - trash-and-content fns 132/133 + isTrashableEntityType covered
  - publish-export fn 147 covered
  - app.ts br 440/442 covered
- Tests -> the mutation that turns each red:
  - commerce.errors "payment alerts warned once per payment; dedupe forgets only the oldest past 1000" -> eviction dropped / newest evicted / has-check dropped (:66-69, 271-272)
  - commerce.errors "migration failing during warmup is retried next worker cycle" -> reset catch dropped (:145) / worker ensurePaymentSchema dropped (:328). The stub ledger can't serve the inbox step, so the test checks only the 2 migration runs and a non-migration second error.
  - commerce.errors "alert without a payment id dedupes by kind and detail" -> `?? alert.detail` / kind dropped (:270)
  - memory-root pin "trash sweep purges an expired post; only adapter-backed types trashable" -> entityPolicy false / isTrashable true / transaction short-circuit (trash-and-content:132-135)
  - memory-root pin "resolveStorefrontProducts reads the catalog on routeDeps" -> bind dropped / list undefined (publish-export:147)
  - create-app-lifecycle pin "siteFailureReporter: injected wins, one per site" -> app.ts:440 / :442
- EXCEPTIONS:
  - commerce.ts 1: import line
  - commerce.ts br 67: eviction runs only with >= 1000 entries; refactor candidate
  - carried: br 242, fn 264
- LEFT:
  - commerce.ts br 141 (needs a Postgres kernel with no pool size), 149 (needs a kernel that fails on purpose), 262, 322, 355-357, 361, 362, 456, 471; fns 106, 337 (failure-only paths)
  - trash-and-content br 63; fns 125, 135, 165, 175, 222
  - assistant-and-site fns 32, 59, 60, 106, 118, 149, 159
  - publish-export fns 82, 175, 244
  - app.ts br 140, 453; late-bound getter fns 152, 153, 158, 171, 178, 192, 195, 279, 281, 289, 323 (EXCEPTION/refactor candidates)
  - deps.ts br 155/168/170; fns 102, 107, 109, 139, 162, 163, 165
  - memory-trash 60/61 (plugin trash adapter locate/forget), 86 (onChanged onError)
  - mount-admin-features fn 71; mount-admin-system br 266

## Job 11, C4a round 5 (short). Commits 4ab142665d, 0c8ad5d2a3; typecheck 0; 2 tests.
- memory-trash F 71.43 -> 85.71 (fns 60/61 covered; L100 B87.5; fn 86 onError sink left; br 66 carried EXCEPTION). trash-and-content br 63 covered.
- Tests -> the mutation that turns each red:
  - memory-root-shared-instances.pin "removing a plugin parks its folder; purging deletes it and forgets its activation rows" (real temp installDir) -> forget no-op (memory-trash:61)
  - memory-root-form-trash-mover "a form edited between the mover's read and its trash write is refused with the trash service's own outcome" (real concurrent repo.update) -> :63 `return marker` replaced with not-found
- Not reached: trash-and-content fns 125, 165, 175, 222; assistant-and-site fns 32, 59, 60, 106, 118, 149, 159.

## Job 11 repo.sqlite slice, C4a (local c4a/web-11-b, cherry-picked). Commits 76aac76e29, 9210e70078; typecheck 0; 4 tests in import-schema-version.integration.
- repo.sqlite merged over 10 site-backup test files (85/85): 100/85.07/93.10 -> 100/89.23/96.55. br 93, 155, 157 and fn 157 now covered.
- Tests -> the mutation that turns each red:
  - "schema-identical db with a menu location bound to a missing menu is refused" -> :93 never throws
  - "schema-identical db with a damaged page in an unshared table is refused before projection" -> :157 integrity check off (without it the import silently drops the table and succeeds)
  - "second workspace / no workspace refused" (2): cover br 155 but do NOT pin it. They stay green with 155 and 168 both off, because later steps also refuse, and the worker exits 1 with no message. Real refusal tests, not guard-specific.
- EXCEPTIONS:
  - br 66: SQLite always stores CREATE text for tables
  - br 129: freshly rebuilt db
  - br 168: 155 already enforces exactly one workspace
  - br 181/184: sanitize always fills them (comment at :183)
  - fn 172: no share table declares an FK
  - carried: 191, br 128

## Job 12 slice A, C4a rounds 1-2. Round 1 was killed by the restart after 3 commits: 282d8d9413 recovery-binding, plus 2. Round 2 commits: 3ac97e6878, 1bf5af49d0, d8c81405d6, d070128fae; typecheck 0.
- Now at 100/100/100: run-finalizer/entry.ts and run-finalizer/watch-state.ts (merged over all 24 finalizer test files).
- Before -> after:
  - assistant-ag-ui 92.48/90.08/86.36 -> 92.31/96.53/88.64 (L drops only because signature line 592 now shows)
  - run-daemon-http-client: br 78 and 79 covered; only signature line 129 left
  - assistant-routines: fn @247 covered
  - forms: br 64 covered
  - assistant-byok-preflight -> 100/94.74/100
- Tests -> the mutation that turns each red:
  - ag-ui-durable "chosen agent only when sent; 404" -> :210 always {} / 404 body without code
  - ag-ui-durable "malformed durable identity keeps the legacy start" -> :176 / :175 clauses dropped
  - ag-ui-durable "reader leaves while the stream is connecting" -> :232 detached block removed
  - ag-ui-resume "malformed addressing refused before any claim" -> :301 length bound dropped
  - ag-ui-resume "exchange carries the bearer only with a token" -> :288 always bearer / :289 catch removed
  - finalizer.http-client "launch waits on the shared demand gate" -> :79 default gate
  - finalizer.http-client "no principal refuses before readiness" -> :78 guard removed
  - routines.integration "injected run handler records via the composed updateRun" -> :247 no-op
  - forms-events-v2 extended with a deleted-form case -> :64
- EXCEPTIONS:
  - source-map doc/signature/import lines: ag-ui 3-46, 592; forms 2-19, 52; backstop 208, 226; import 171, 176; ingest 79, 84; external-mcp 244, 255; plugins 277; run-daemon-http-client 129
  - ag-ui 442 and byok-preflight 116 `req.body ?? {}`: Express json always sets body
  - ag-ui 298: body guaranteed by isResumeBody
  - ag-ui 434: placeholder tracker is replaced synchronously
  - recovery-binding 54, 60: Jini exclusion() finalizes principal-less runs first
- Surviving mutant: ag-ui:299, `resume.length !== 1` dropped. Looks redundant; probably Jini's readConfirmationResume refuses later.
- INCIDENT: slice A ran slice B's scratchpad mut.sh once (~04:28-04:35) concurrently with slice B. Production files were clean afterwards. Slice B was asked to re-verify its round-2 mutants. The brief now requires per-agent scratch dirs.

## Job 12 slice A, C4a round 3. Commits f414f8db81, 8c06250fd7, 6ef6925607, 109532007d, 94d0cc1e78, a956dbc67d; typecheck 0; 6 tests.
- Now at 100/100/100: publish-content-import (merged over its 9 importers).
- Before -> after:
  - assistant-byok (42 importers) 97.73/68.29/81.25 -> 98.48/73.17/81.25
  - assistant-byok-turn 100/87.38/97.06 -> 100/88.35/97.06
  - plugins -> 100/100/97.50. fn@221 still shows, but its getter mutant turns the new test red: a coverage-attribution artefact.
  - assistant-ag-ui: fn 406 now runs
- Tests -> the mutation that turns each red:
  - byok.error-report "fails before stream opens -> host error middleware" -> :236 next(error) to res.end()
  - byok.inputs-pin "saved credential's maxTokens reaches the provider" -> byok-turn:410 false
  - provider-settings-route "save with project keys answers with what the key port attached" -> plugins:221 getter undefined
  - set-enabled-gap-fill "provider OFF lowers tool access for the provider and every face" -> plugins:179 providerFaces not forwarded
  - ag-ui-routes "daemon refusal with an unreadable body keeps status + report reference" -> ag-ui:406 catch removed
  - backstop-import-ui "raw row with unreadable live values previewed as unavailable, logged once" -> publish-content-import:107 warn no-op
- EXCEPTIONS:
  - byok 286/288/289: ids always come from the same `selected` map
  - byok-turn 288/320/400: createRun is required by type
  - byok-turn 49, ag-ui 154: HTTP/1.1 only here
  - byok-turn 223: express.json always sets body
  - ag-ui 229/232/274: web stream cancel does not reject
  - backstop 104: checks metadata built one line earlier
  - backstop 78: listSkipped optional; possibly defensive, unconfirmed
- LEFT:
  - assistant-byok 191, 210-212; br 174, 176, 221, 223, 253, 259, 260, 291; fns 119, 170, 171, 190, 209, 264 (default surface / desktop handoff singleton / 4 s lowering timeout)
  - byok-turn br 163, 205, 285, 330, 331, 334, 353, 366, 382; anon@206
  - backstop br 98, 146
  - ag-ui br 231, 424
  - routines br 102, 301; fn @246
  - not reached: assistant.ts, assistant-chats 142-145, public-members br 274, owner-auth, assistant-ag-ui-launch

## Job 12 slice A, C4a round 4. Commits d22865e9a4, 064b58ddca (the second removes a test-order-dependent assertion added in the first); typecheck 0; 1 test.
- Re-measured, merged over importers:
  - owner-auth 85.29/100/100: only doc lines 1-5 (EXCEPTION)
  - assistant-ag-ui-launch 78.95/100/100: only doc lines 1-7, 37 (EXCEPTION)
  - public-members 100/97.50/100: br 102, 274
  - assistant-chats 96.19/85.93/91.07: 143-145, fn@144 need a live daemon registry record
  - assistant.ts 99.74/90.86/98.28: 161-162; br 150, 160, 171, 202, 218, 222, 267, 285, 293, 297, 495, 510, 519-521, 691; fn@125
  - assistant-routines 100/95.93/94.92
  - publish-content-backstop 100/95.70/100
  - assistant-ag-ui 91.11/97.22/88.64, br 424 now covered (the importer set differs from earlier rounds)
- Test -> the mutation that turns it red:
  - ag-ui-routes "daemon fails between accepting the run and the subscribe -> the subscribe's own 503, never an AG-UI stream" -> :424 status 500 before `return null`. Adds an "ok-then-daemon-fails" behaviour to the fake daemon.
- EXCEPTIONS:
  - backstop 98/146: toPublishContentDeps always sets the backstop ports
  - routines fn@246: observe is not exposed by the caller-facing approvals type
  - routines br 102: one 0-hit block, but all 3 outcomes are already asserted; likely a source-map artefact (not proven)
  - ag-ui 231: the branch runs, but its mutant is equivalent (the 503 has already ended)
- Reds seen, likely Jini drift: member-password-auth:449 "challenge CAS rejection…" (known from C3a); members-public-complete-sign-in "session-repo failure surfaces as 500".
- LEFT:
  - assistant-byok-turn br 163, 205, 285, 330, 331, 334, 353, 366, 382; anon@206
  - assistant-byok 191, 210-212; br 174, 176, 221, 223, 253, 259, 260, 291; fns 119, 170, 171, 190, 209, 264
  - assistant-chats 143-145
  - public-members br 102, 274
  - assistant.ts (list above)

## Job 12 slice B, C4a round 2 (round 1 was killed by the restart with 6 test files uncommitted; round 2 verified, mutation-checked and committed them). Commits 8ed0939405, ff6d43ba49, 01d595d8bb, c256c1d8fc (local branch c4a/web-12-b, backup origin/codex/tv-w62-cov-web-12-c4a-b); typecheck 0.
- Before -> after (L/B/F):
  - site-assistant 97.22/92.16/78.57 -> 98.02/93.55/100
  - site-assistant-turn 100/88.57/100 -> 100/93.58/100
  - serving-routines 96.69/93.33/72.41 -> 100/96.23/90
  - peer-site-reads 100/99.25/98.21 -> 100/100/100 (C3a's "pagesHtmlStore@235" was really isSiteSwitcherEnabled)
- Tests: 15 added, 1 dropped. The dropped one was the resume "visitor tab on canonical origin issued credentials" test: the `canonicalOrigin: async () => null` mutant survived it.
- Each test, with the mutation that turns it red:
  - body-errors "confirm reply whose enabled check fails" -> site-assistant:191 code changed
  - body-errors "error after reply started handed on" -> :196 headersSent guard set to false
  - default-edges "wake whose reconcile fails is logged" -> serving-routines:151 log no-op
  - default-edges "routines that fail to compose" -> :154 event renamed
  - default-edges "no injected timers never hold the process open" -> :50 unref removed
  - run-handler "late run, installed agent, catch-up copy in local time" -> :124 toISOString / :123 fake agent id
  - peer idle-and-ports "schema stamp names a different migration line" -> peer-site-reads:443 if(false)
  - peer "page HTML store reads the peer's own page body" -> :238 postId changed
  - peer "tool deps turn the site switcher off" -> :235 () => true
  - resume "process shutdown denies a parked approval" -> site-assistant:124 shutdown no-op
  - resume "shutdown denial that fails is logged once" -> :164 code changed
  - resume "canonical-origin lookup that fails" -> :158 code changed
  - turn "consented visitor's committed tool attempt goes to the visitor tracker" -> site-assistant-turn:136 / :296
  - turn "without a visitor tracker, site tracker" -> :296
  - turn "append-only sink / refused / no delivery check captures nothing" -> :135 / :295
- EXCEPTIONS (proposed):
  - site-assistant 113-118 + br 113: dead cli branch; resolveSiteAssistantMode only returns byok
  - site-assistant 178 `!target`: the only caller has already normalized the origin
  - serving-routines @136: settle placeholder overwritten synchronously
  - serving-routines @144 + br 144: fallbacks run only with no hooks, and then no store opens
  - site-assistant-turn 214: `undefined as never` behind an exhaustive switch
- Pre-existing reds: site-chat-stream.golden page.navigate; peer-site-reads.test.ts x5; catalog "posts" tests; tool-read-wording.
- Lock contention between agents cost about 25 min.

## Job 12 slice B, C4a round 3. Commits b84778c6d3, 41d055b3fb, d5c4cbfdb4, ef67f9a23c; typecheck 0. 6 tests.
- Scratchpad-clash re-check: all 14 round-2 mutations re-run on site-assistant / -turn / peer-site-reads, and every one still goes red. The dropped "visitor tab on the canonical origin" test was re-written; it now goes red under its mutant (the round-2 survivor was an artefact) and is committed.
- Before -> after:
  - other-site-keys 100/93.33/89.36 -> 100/96.72/89.36
  - site-assistant-turn 100/93.58/100 -> 100/94.55/100
  - site-assistant 98.02/93.55/100 -> 98.02/95.08/100
  - unchanged: site-search 100/96.95/100; storage-routes 99.50/98.77/97.30
  - ag-ui-approval 100/100/100 (re-measured)
- Tests -> the mutation that turns each red:
  - osk "source site whose meta moves it off SQLite" -> :136 if(false) (kills the C3a survivor)
  - osk "saved key with no stored value refused as empty" -> :126
  - osk "value with no token field never merged into an empty Shared Key" -> :193 `?? payload`. The :202 mutant is equivalent.
  - turn "tool call whose arguments are JSON null is checked as no-args" -> :190 `call.input ?? {}` to `call.input` (kills the round-2 survivor)
  - resume "visitor tab on the canonical origin is issued its credential" -> :158 canonicalOrigin returns null
  - body-errors "turn failing on a reply begun upstream ends it with one error frame" -> :236 `stream.writer!` / finish removed
- EXCEPTIONS (proposed):
  - other-site-keys @40 x2 (type-required stubs), @68 x2, @88 (now/newId stubs), br 70/71/89 (defensive authorize), br 52 (object meta impossible from SQLite TEXT)
  - site-assistant-turn 127 (writer always set by the only caller), 194 (no capability returns a directive), 214 (exhaustive switch)
  - site-assistant 226 (no clean seam to throw after the resume segment opens)
  - site-search 167, 422, 439, 440 (type/caller invariants)
  - storage-routes 118 (authorizeOwner refuses first), @157 (placeholder replaced by the owner binding)
- Blocked: site-assistant-turn br 189, 231, 247. Page tools never reach the tab in this environment, the same cause as the pre-existing golden page.navigate red.
- Not reached: re-measuring the other rows 56-90.

## Job 12 slice B, round 4: the full rows 56-90 table (no tests; re-measured at ef67f9a23c)

# Job 12 slice B, rows 56-90: coverage at head ef67f9a23c (C4a round 4)
"r4" = re-measured this round, merged over every test file that imports the file (directly, or through the route test that mounts it).
Other rows: the round that last confirmed them, unchanged since (head unchanged; no slice-B source edits).

| # | file | L/B/F | remaining uncovered | status |
|---|---|---|---|---|
| 56 | modules/serving-routines.ts | 100/96.23/90 (r4, 5 tests files) | br 144; fn @136, @144 | EXCEPTION-only (@136 settle placeholder overwritten synchronously; @144 + br 144 hook fallbacks run only with no hooks, then no store opens) |
| 57 | modules/settings.ts | 99.18/100/100 (C3a r4) | 223, 257 | EXCEPTION-only (source-map artefacts) |
| 58 | modules/site-assistant-ag-ui-approval.ts | 100/100/100 (C4a r3) | - | 100 |
| 59 | modules/site-assistant-ag-ui.ts | 99.34/100/100 (C3a r3) | 133 | EXCEPTION-only (signature line) |
| 60 | modules/site-assistant-preflight.ts | 97.93/98.31/100 (C3a r3) | 261-269 | EXCEPTION-only (dead cli branch; mode is always byok) |
| 61 | modules/site-assistant-turn.ts | 100/94.55/100 (C4a r3) | br 127, 189, 194, 214, 231, 247 | real gap: br 189, 231, 247 are BLOCKED (page tools never reach a tab here; same cause as the golden page.navigate red); 127/194/214 EXCEPTION |
| 62 | modules/site-assistant.ts | 98.02/95.08/100 (C4a r3) | 113-118 + br 113, br 178, 226 | EXCEPTION-only (dead cli branch; origin already normalized; no seam to throw after resume segment opens) |
| 63 | modules/site-previews-route.ts | 96.77/100/100 (r4, site-previews.wire) | 26 | EXCEPTION-only (signature line under source maps; fn is covered) |
| 64 | modules/site-search.ts | 100/96.95/100 (C4a r3) | br 167, 422, 439, 440 | EXCEPTION-only (type/caller invariants) |
| 65 | modules/site.ts | 100/100/66.67 (C3a r4) | fn @47 | EXCEPTION-only (dead authorize forwarder on direct mount; refactor candidate) |
| 66 | modules/sites.ts | 100/100/100 (C3a r4) | - | 100 |
| 67 | modules/storage-routes.ts | 99.50/98.77/97.30 (C4a r3) | 218; br 118; fn @157 | EXCEPTION-only (sig line; authorizeOwner refuses first; placeholder replaced by owner binding) |
| 68 | modules/system-assistant.ts | 99.07/100/100 (C3a r4) | 110 | EXCEPTION-only (artefact) |
| 69 | modules/system-credentials.ts | 99.78/98.70/96.88 (C3a r4) | 463; br 206; fn @236, @244 | EXCEPTION-only (artefact; null registry ruled out by type; per-request placeholders) |
| 70 | modules/system-deploy.ts | 100/100/100 (r4, 13 test files incl. route tests) | - | 100 |
| 71 | modules/system-mail.ts | 100/100/96.88 (r4, 7 test files incl. mail-status-route) | fn @234 | EXCEPTION-only (activity `shared.authorize` forwarder: every activity spec checks via checkPermission/mailDomainDepsFrom; refactor candidate) |
| 72 | modules/system-site-backups.ts | 98.08/100/85.71 (C3a r3) | 41; fn @47 | EXCEPTION-only (sig line; dead authorize forwarder) |
| 73 | modules/system-site-shares.ts | 99.28/93.48/91.89 (C3a r4) | 118; br 57-59; fn @96-98 | EXCEPTION-only (artefact; feeds the Jini upload spec Tovu does not mount; refactor) |
| 74 | modules/system-telemetry.ts | 100/100/75 (C3a r4) | fn @36 | EXCEPTION-only (inert fail-closed forwarder) |
| 75 | modules/theme-explore.ts | 98.93/100/100 (C3a r4) | 184, 190 | EXCEPTION-only (artefacts) |
| 76 | modules/theme-held-back.ts | 100/100/100 (C3a r4) | - | 100 |
| 77 | modules/themes.ts | 96/100/100 (C3a r4) | 41, 51 | EXCEPTION-only (artefacts) |
| 78 | modules/tool-execution-caller-express.ts | 75/100/100 (r4, 2 test files) | 1-7, 22 | EXCEPTION-only (file doc comment + signature line under source maps) |
| 79 | modules/trash.ts | 99.30/100/96 (C3a r4) | 151; fn @84 | EXCEPTION-only (artefact; dead authorize forwarder) |
| 80 | modules/types.ts | not in lcov | type-only file | EXCEPTION-only (no runtime code) |
| 81 | modules/users.ts | 99.41/100/95.65 (C3a r4) | 145; fn @60 | EXCEPTION-only (artefact; dead authorize forwarder) |
| 82 | modules/widgets.ts | 99.54/100/97.14 (C3a r3) | 198; fn @84 | EXCEPTION-only (sig line; isSameOrigin never consulted per its own comment) |
| 83 | move-site-storage.ts | 83.04/93.33/100 (r4, 3 test files) | 112-130; br 111 | EXCEPTION-only (live Postgres only: move-site-storage.postgres.test.ts, no server here) |
| 84 | mutation-actor.ts | 70/100/100 (r4, 8 test files) | 3-9, 11, 33 | EXCEPTION-only (doc comments + signature line under source maps) |
| 85 | observability-export.ts | 97.87/100/100 (C3a r4) | 1 | EXCEPTION-only (artefact) |
| 86 | open-site-content-db.ts | 100/100/100 (r4, 9 test files) | - | 100 |
| 87 | open-site-store.ts | 100/98.08/91.67 (C3a r5) | 105, fn @106 | EXCEPTION-only (Postgres success path + pool close, live server only) |
| 88 | other-site-keys.ts | 100/96.72/89.36 (r4, 2 test files) | br 52, 70, 71, 89; fn @40 x2, @68 x2, @88 | EXCEPTION-only (object meta impossible from SQLite TEXT; defensive authorize; type-required now/newId stubs) |
| 89 | peer-site-reads.ts | 100/100/100 (C4a r2) | - | 100 |
| 90 | pending-agent-plugin-tokens.ts | 100/100/100 (r4, 3 test files) | - | 100 |

Totals: 100/100/100 = 7 rows (58, 66, 70, 76, 86, 89, 90); EXCEPTION-only = 27; real gap = 1 (row 61, blocked).
Reds seen in the r4 runs, all at the unchanged head (no source or test edits this round): known in C3a: tool-read-wording "every hand-built readOnly flag site…"; move-site-storage.postgres.test.ts x5 (no Postgres server); publish-site-route "publish-targets…registry load failure is a fixed 500" and "publish preview logs registry refusals…" (match C3a's 'publish list/delete 500, publish preview'). NOT named in C3a (new to this report, not investigated): composition-boot-order.unit "index.ts main(): the content.db schema guard and site key run before the composition root opens the database"; open-site-content-db.integration "copies an existing unadopted file to ops/ first and keeps only the newest five copies".

## Coordinator timeline

# Gap fill 2026-11-27, round 4, run C4a (Tovu website; jobs tv-w62-cov-web-9, -11, -12)

- Start 2026-11-28 03:11 UTC. Cut-off for new subagents: 05:41 UTC. Report final by 06:06 UTC.
- Setup: Node 24.22.3 (/opt/node24); Jini integ/merge-28 d1ced6c5 (`pnpm install --frozen-lockfile` + `pnpm -r build`, both green); Tovu `npm ci --ignore-scripts` (root + site-chat), `link:jini`, then `tsc -p` contracts + sdk. Worktrees at /home/user/wt/<job>.
- Coverage helper: node:test `--enable-source-maps --experimental-test-coverage` with explicit `--test-coverage-include` per source file, under a global flock. All lcov SF records for a source are merged (avoids the C2 multi-SF trap). Smoke check: credentials-host-ports reproduces C3a's 100/100/100.
- Round 1 dispatched 03:17 UTC: job 9, job 11, job 12 slice A (rows 1-55, /home/user/wt/web-12), job 12 slice B (rows 56-90, local branch c4a/web-12-b, cherry-picked onto the job branch; not pushed).
- **Container restart at ~03:45 UTC** killed all 4 round-1 subagents mid-work. Commits already made survived: job 11 fdd1b08bf8, dbf169a016; job 12 282d8d9413 + 2 (all pushed). Uncommitted test edits survived on disk in web-9, web-11 and web-12-b. web-9 also held a half-finished mutation of production `agent-daemon-scope.ts:124` (`|| !token` dropped); the coordinator restored it with `git checkout` and checked every worktree for other production diffs (none).
- Round 2 dispatched 03:52 UTC: the same 4 slices. Each was told to verify, finish and commit the leftover edits first. The brief now asks for a commit after every file.
- 04:26 job 11 round 2 returned (7 tests, publish-apply 100/100/100; details in the per-round section). Job 11 round 3 dispatched right away.
- 04:45 job 12 slice B round 2 returned (15 tests, peer-site-reads 100/100/100); slice B round 3 dispatched. 04:46 job 9 round 2 returned (28 tests); job 9 round 3 dispatched.
- 05:01 job 12 slice A round 2 returned (8 tests + 1 extended; run-finalizer entry/watch-state 100/100/100). Incident: shared-scratchpad mut.sh clash between slice A and slice B (~04:28-04:35); production files clean afterwards; slice B asked to re-verify its round-2 mutants; brief now requires per-agent scratch dirs. Slice B commits (6) cherry-picked onto codex/tv-w62-cov-web-12 -> cbf7329985. 05:02 slice A round 3 dispatched.
- 05:08 job 9 round 3 returned (6 tests; warm-site br 36 via real certs; owner-passkey F75 -> F95); job 9 round 4 dispatched (incl. running the passkey browser tests with CHROMIUM_EXECUTABLE_PATH).
- 05:12 job 11 round 3 returned (9 tests; commerce.ts 96.97/90.13/94.12 -> 98.37/92.31/95.10; publish-export B80 -> 100); job 11 round 4 dispatched.
- 05:21 job 12 slice B round 3 returned (6 tests; re-ran all 14 round-2 mutants after the scratchpad clash, all still red; the dropped round-2 test restored); slice B round 4 dispatched (re-measure every remaining row 56-90).
- 05:23 job 12 slice A round 3 returned (6 tests; publish-content-import 100/100/100). Slice B round-3 commits d5c4cbfdb4, ef67f9a23c cherry-picked (the other 6 were in the 05:00 batch; patch-ids verified; every slice-B file identical on both branches) -> fa55eb0ce5. 05:24 slice A round 4 dispatched. All four last-round subagents are due by 05:58.
- 05:31 job 12 slice B round 4 returned (0 tests: re-measured all 35 rows 56-90 -> 7 at 100/100/100, 27 EXCEPTION-only, 1 blocked real gap). 05:32 last dispatch before the 05:41 cut-off: job 11 repo.sqlite slice in /home/user/wt/web-11-b (local c4a/web-11-b, to be cherry-picked).
- 05:31-05:50: job 9 r4, job 11 r4, job 11 repo.sqlite and job 12 slice A r4 returned; job 11 r5 (dispatched 05:38) returned 05:50. The repo.sqlite slice was cherry-picked onto job 11 (-> 59248f0cf8). Final verification ran on all three heads.
