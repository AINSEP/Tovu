# Handoff — chataudit3-d4 (2026-10-16), stopped at the 250k context line

Scratch: /Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/e7a0cf00-8f42-429e-9598-d07588e3fb4c/scratchpad/chataudit3-d4/
Codex rounds: ADS-memory/.local-artifacts/codex/2026-10-16-chataudit/r3a (4 jobs), r3b (trim). No Codex job running.

## Done
1. Jini commits on general-work (not pushed), all RED on HEAD → GREEN, core/chat/devops dist rebuilt:
   - c7557838 core: requireNumber/requireObject received-keys + items[] hint (RED 8 → 53/53).
   - 13e90536 chat: F5.2 failure reason saved as notice detail; F5.3 AWAITING_ANSWER_NOTICE (RED 11 → 27/27).
   - 0de2f161 devops: static export crawls/rewrites `<video poster>`; ExportReport.droppedReferences (RED 5 → 44/44).
   Hashes sent to team-lead.
2. F5.1 verified on the real export code:
   - Claim (a) "multi-segment redirects never trigger" was TRUE at the time (turn 21 = 2026-10-14 21:51). Fixed by 731eb1e2e (23:35 the same night: nested-path fallback in pages.ts).
   - Proof on real data: a scratch copy of order-pinch (no chat db) served on :3971 with an isolated HOME. All 13 redirects enabled through the admin PATCH API on the COPY; each answered 301 to its target, and every target answered 200. Then `tovu export <copy>` at HEAD wrote 28/28 routes and 44/44 assets, with a meta-refresh stub for all 13 (e.g. pages/contact → /contact, policies/subscription-policy → /cancellation-policy). Result: all 13 are PROVEN, and none needs to stay disabled.
   - Claim (b) "export drops `<video poster>`" was TRUE (the scan was href/src/srcset only). Fixed in 0de2f161. On the copy the poster file still exported, because the in-app agent had added the poster as an `<img>` too. Claim "every /m/ image missing on Vercel" was NOT reproduced: every /m/ reference in the exported HTML exists in the export.

## Remaining (numbered)
1. The Tovu round-3 RED/GREEN batch has NOT run. The lock queue held it for over 60 min, so I killed my own queued waiter before stopping, and nothing of mine is left running. Run `scratchpad/chataudit3-d4/tovu-batch.sh` ONCE under the lock. Output goes to stdout plus `tovu-green.tap`. The script swaps sources to HEAD for RED and then restores them through a trap with a cmp check. It needs `--import ./apps/website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.ts`, which is already in the script; without it every suite throws "Test home isolation required" on HEAD. The scoped tsc over the changed files already PASSED (rc=0).
2. If GREEN: commit the Tovu changes by explicit paths. Uncommitted, all mine:
   - diagnose tool: features/deployments/{agent-tools,capability-card,export-run,tool-registrations}.ts, static-publish/adapter.ts (pointer sentence only), site-export/site-exporter.ts (comments), cli/commands/export.ts, contracts/core/tool-metadata/deployments.ts, assistant/__tests__/fixtures/tool-metadata.baseline.json.
   - Tests for the diagnose tool: deployments/__tests__/{diagnose-static-export.unit (new),export-run,publish-agent-tools.unit,integration/tool-registrations.integration}.test.ts, static-publish/__tests__/{adapter.unit,adapter.provider-errors.unit}.test.ts, source-control/__tests__/{commit-site.unit,tool-registrations.unit,tool-registrations.dry-run}.test.ts, cli/__tests__/unit/export-command-boot-work.unit.test.ts, site-export/__tests__/site-exporter.test.ts (multi-segment redirect export test).
   - auto-memory off: server/inbound/assistant/{assistant-system-overlay,agent-daemon-server}.ts + __tests__/{assistant-system-overlay.unit,agent-daemon-server.tool-restriction-wiring.unit}.test.ts. Live-verified with Claude Code 2.1.301: `--settings '{"autoMemoryEnabled":false}'` removes the auto-memory prompt (YES → NO).
   - Forms hint: features/forms/agent-tools.ts + __tests__/agent-tools.unit.test.ts (new).
   - tsc fixes: server/__tests__/routes/publish-trust-gate.test.ts, server/inbound/admin-http/__tests__/dev-auth.unit.test.ts.
   - Guard tests: server/inbound/assistant/__tests__/durable-run-routes.unit.test.ts (+19 tests).
   - NOT mine, don't stage: the publish-trust/* test changes, seo/*, vault-*, parity-*, bundled-inactive-gating, admin/*.
3. Re-enable the 13 order-pinch redirects on the REAL site through the admin path. I did not do this yet. The same method as on the copy works:
   - `node --import tsx apps/website/src/cli/main.ts serve ~/Documents/Tovu/order-pinch --port 3972 --host 127.0.0.1 --emit-boot-token`, from the Tovu root, with the real HOME and only while the desktop app isn't serving order-pinch.
   - POST `{token}` to `/api/admin/v1/auth/boot-session`, keeping the cookie.
   - For each id, PATCH `/api/admin/v1/workspaces/workspace-local/redirects/<id>` with `{"status":"active"}` and an `origin` header.
   - Then stop the server. Ids are in `scratchpad/chataudit3-d4/redirects-copy.json` (the same ids as the real site).
4. Mutation sweeps, under the lock, on the committed clean files:
   - Jini: registration-kit.ts, recover.ts, transforms.ts, runner.ts.
   - Tovu: export-run.ts, durable-run-routes.ts, assistant-system-overlay.ts.
   - Tovu sweeps need `--preload=./apps/website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.ts`. Survivors go to a Codex follow-up.
5. Delete `scratchpad/chataudit3-d4/site` (89 MB copy), `export-head`, `home` and `red/` when done.

## Decisions
- Trimmed Codex overbuild (r3b):
  - The regex broadening was reverted to the original quoted shape plus poster.
  - droppedReferences was removed from the static-publish outcome, snapshot and agent result. The new `deployment_diagnose_static_export` tool is where an agent gets that list. The refusal message points to it.
- G4 tool: `deployment_diagnose_static_export` is read-only (system.read). It runs one export into an OS temp dir through the injected engine, deletes the dir, and shares export-run's single-flight.

## Warnings
- sites.json md5 changed during my session. Only tovu-dev's lastOpened moved (13:12 local, the :3000 server), which is not mine; still 4 entries, and site-keys stayed at 859.
