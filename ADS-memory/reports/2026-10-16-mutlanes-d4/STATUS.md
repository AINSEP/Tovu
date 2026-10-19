# mutlanes-d4 STATUS — 2026-10-16

Real-home baseline (10:25): sites.json names [luvira, order-pinch, plannie, tovu-dev], site-keys 859, ~/Documents/Tovu = 4 sites.
Disk at start: 53 GiB free (11%). Lane copies are ~200 MB each (git archive, node_modules symlinked), so I proceeded; the runner stops claiming below 20 GiB free.

## Tooling — committed 88b36138e
development/scripts/mutation-lanes.mjs (new) + mutation-sweep.mjs (--priority, --progress, direct vitest, node flags, interrupted≠killed). Codex rounds r0, r0b, r0c, r0d (ADS-memory/.local-artifacts/codex/2026-10-16-mutlanes-d4-r0*).

## Lanes (started 10:46, pid in run/runner.pid)
- Out: ADS-memory/reports/2026-10-16-mutlanes-d4/run/ (results.tsv, SURVIVORS.md, INCONCLUSIVE.md, logs/, lanes-status.json, nohup.log)
- Copies: run/lanes -> scratchpad/mutlanes-d4/lanes (symlink; deleted on exit)
- Control: echo 3 > run/lanes.target (more lanes); echo > run/STOP (drain) / echo now > run/STOP (kill now)
- Resume: same command with same --out (done rows skipped): see HANDOFF in REPORT.md
- 2 lanes, --limit=15, mutant 180 s, file 2700 s, load gate 14, start row 18; 10-15 done rows skipped.

## Tooling fixes after launch
- 9f0b1b3a8 copy packages/*/dist + site-chat/dist into copies (sdk dist missing → false BASELINE-RED)
- c072d7f36 temp-tarball extraction (EPIPE killed run at 11:06); row errors non-fatal
- 9469f4ae6 preload isolated-catalog-home for node:test (suites missing it are red on HEAD; reported to tovu-d4)
- Restarted 11:21 with 3 lanes.

## Baseline-red on HEAD (real test bugs, reported to tovu-d4)
- "Test home isolation required" class: publish-agent-tools, admin-assistant-execution-credential-routes, taxonomy-trash-routes, assign-terms.not-live, static-security-headers, mcp-ui-tool-calls-route.static-publish.integration, oauth-error-mapping, tool-registrations.contracts

## Codex survivor rounds
- r1 (11:50, high, 2 at a time): a handshake.ts+handshake-client.ts, b grant/connect/provisioning, c site-key.ts route (6 rejectUnlessAuthorized guards survived), d assign-terms/site+execution-credential-store/switch-on-saved-token/endpoint-safety/worker-sandbox, e admin hooks (visitor-credential-form, use-roles, composer-capabilities) + desktop webview-guest-policy, f lanes explicit-tests per TARGETS row. Out: ADS-memory/.local-artifacts/codex/2026-10-16-mutlanes-d4-r1/out

## Commits
- 88b36138e, 9f0b1b3a8, c072d7f36, 9469f4ae6 (tooling)

## r1 results
- a+b committed 57f0ee959 (GREEN 85/85 on HEAD). Re-mutation (remut-r1ab/, explicit tests): handshake.ts 15 killed/0 survived (was 8 survived), handshake-client.ts 8/0 (was 5), grant.ts 15/0 (was 9), connect.ts 3 killed/1 survived (:79, equivalent per Codex), provisioning.ts 15/0 (was 1).
- f committed b33dd7517 (explicit tests per TARGETS row).
- c (site-key.ts: auth guards were already covered by admin-site-key-routes.test.ts, which discovery missed), d, e: tests written, GREEN run queued on the machine lock.
- r2 launched 12:45: 9 shards (rows 18..96 survivors), out ADS-memory/.local-artifacts/codex/2026-10-16-mutlanes-d4-r2/out
- Env-limited rows (not test bugs): 48 secret-scan-guard, 64 sync-originals (tests run git; copy is not a repo), 86 credential-copy (website source tested by admin vitest; runner picks node by path).

## Successor mutlanes2-d4 (from 13:05)
- 13:06 lanes alive (103/548 rows, 226 survivors). Real home unchanged (4 names, 859 keys, 4 dirs).
- GREEN batch 1 queued on lock: website+desktop uncommitted r1e/r2 tests + admin-site-key-routes (log scratchpad/mutlanes2-d4/green1-*.log). Admin vitest batch next.
- Codex r3 (13:07, high, 2 shards): s01 site-key route bug (unreadable meta → 500, should be 409 SITE_META_UNREADABLE; root cause mintSiteMetaForBootIfAbsent → buildSiteMetaForNewKey re-parses malformed meta), s02 isolation import in 8 known-red suites. Out: ADS-memory/.local-artifacts/codex/2026-10-16-mutlanes2-d4-r3/out
- Home-isolation static list: import closure reaching sites-home.ts without the helper = 914/1917 node tests (548 if http-test-server + registry-deps imported it) — closure over-approximates runtime reach, so not actionable as a per-file list. Known-red residual (from today's BASELINE-RED rows) = 8 → s02. The 10-15 day-runner list is already fixed on HEAD. Tool: scratchpad/mutlanes2-d4/tools/homeiso.py.
- 13:16 r3 done: s01 route-only guard in site-key.ts generateSiteKey (existing-but-unreadable meta → 409 before ensureSiteKeyForSite; boot unchanged, shared-helper contract fix deferred — boot logs/returns undefined already); s02 8 one-line imports. Both join GREEN batch 1.
- 13:28 Codex r4 launched (3 at a time, 6 shards, rows 75 76 97 99 101 103-106 108-111 114-116 119 122 126 133 151 158; skipped dirty 102 107 112 121 131 152). Out: ADS-memory/.local-artifacts/codex/2026-10-16-mutlanes2-d4-r4/out. Prompts add: never edit dirty files.
- 13:58 Codex r5 launched (3 shards, rows 159-165 168). Lanes 156/548, 287 survivors.
- 14:21 GREEN batch 1: 44 website files 623/623 + 4 desktop 47/47. Real home unchanged.
- Commits: 32bf29255 fix(site-key) unreadable meta → 409 (RED 500≠409 on HEAD → GREEN); 5bdc3e4c9 isolation imports ×8; 9b3154338 39 test files (r2 + r4 + r5, website+desktop).
- 14:30 re-mutation lane remut2/ started (1 lane, 62 rows: r1 d, site-key 34, r2/r4/r5 non-admin rows; TARGETS with explicit tests). Admin rows (15) wait for GREEN batch 2 (admin vitest, queued on lock).
- 14:45 Codex r6 launched (5 shards, rows 102 121 131 152 166 167 169 171-173 175-179 181; skipped dirty 107 112 170 174). Lanes 171/548, 347 survivors.
- 14:55 r6 reviewed (13 files, no BUG); GREEN batch 3 chained after batch 2.
- 15:01 GREEN batch 2 (admin vitest, 10 files): 198/200. Committed 649720023 (8 passing files). FAILED (Codex-written tests, back to Codex r7 s00): use-visitor-credential-form "ignores stored-key models that arrive after switching providers" (idle≠loading), composer-skill-ranking "preserves discovery groups for drafts without a slash command" (group ids a:a vs a).
- 15:05 Codex r7 launched: s00 the 2 failing admin tests + 3 survivor shards (rows 107 112 170 174 182 183 186-189 192). Lanes 180/548, 370 survivors.
- 15:25 r7 (3 shards) + r7b (s00 rerun after Codex 503) done, no BUG. Website files → batch 3; admin 3 files → batch 4 (chained).
- 15:45 GREEN batch 3 (19 website files): 208/211. Committed 809d73c60 (17 passing files). FAILED → Codex r8 s01: test-agent-mock-module new subtest (model omitted → 'mocked-cli' not found on PATH, breaks parent test), theme-static-assets new child-process test (spawnSync ETIMEDOUT 30 s; overbuilt).
- remut2: rows 22 14/0, 24 10/0, 27 9 killed/2 survived, 29 3/0; row 25 BASELINE timeout under load (env, retry later).
- 15:50 Codex r8 launched: s01 the 2 failing website tests + rows 190 191 193 195-197.
- 15:58 load 43, main lanes.target=1 (coordinator). Codex r9 launched (rows 199 200). r8 done: test-agent subtests moved before detector state changes; theme-static-assets :152 EQUIVALENT (child test removed). GREEN batch 5 chained after batch 4.
- 16:06 GREEN batch 4 (admin, 3 files) 63/63 → 55ed187a6. 16:15 GREEN batch 5 (8 website files) 98/98 → f253a540f. Real home unchanged.
- remut2 progress 9/62: rows 34, 35, 39 (and 25) BASELINE-RED = baseline TIMEOUT under load 40 (suites pass, just slow; logs/<row>.err) — env, retry in a later run with a longer --mutant-timeout. 37 endpoint-safety 2 survived (one was EQUIVALENT :39 in fda996e7f).
- 16:20 remut3 started (1 lane, 49 rows: admin rows + r6..r9 rows, --mutant-timeout=420 for load). Control: echo N > remut3/lanes.target.
- 16:29 main run STOPPED by someone ("STOP now", load 260+, RAM exhausted; not my processes); remut2 SIGTERM 16:32. Reported to tovu-d4; main run left stopped pending their word.
- 16:35 remut2 (ok rows 22 24 27 29 37) + remut3 merged into ONE runner remut4/ (106 rows, 1 lane, --mutant-timeout=420, load gate 14). remut2/remut3 stopped.
- 17:30 mutlanes2-d4 handoff written (context 250k): ADS-memory/.local-artifacts/handoffs/2026-10-16-mutlanes2-d4.md
