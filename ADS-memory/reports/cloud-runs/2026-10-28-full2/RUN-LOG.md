# RUN-LOG
- 2026-10-28T23:18:10Z STARTED. Tovu 2a0c60ac, Jini 196e0370. Sonnet 5.5, report-only.
- 2026-10-28T23:24:49Z Setup: Node 24.22, Jini install+build OK (exit 0, 0 errors), Jini typecheck exit 0, guard exit 1 (18 viol), test:scripts exit 1 (3 fail, infra-retirement reads Tovu sibling). Tovu: npm ci fails ETARGET (@jini-ai/cookie-consent/plugins ^0.6.13 unpublished) -> local uncommitted file: overrides of all @jini-ai deps to /home/user/Jini/packages in root+apps+sdk; installs OK (--ignore-scripts). Jini per-package vitest running in bg.
- 2026-10-28T23:28:47Z Tovu typecheck: root/admin/desktop/site-chat/scripts exit 0; typecheck:tests exit 2 (56 errors). Postgres 16 up (socket /tmp, user la), chromium symlinked. Tovu 8 shards (2842 test files) launched 3-at-a-time; Jini vitest loop still running.
- 2026-10-28T23:41:22Z Step 6 done (boundaries exit 167 [583 viol: 167 err/416 warn], check-architecture exit 1, madge cycles website 28/admin 97/desktop 90). Waiting on Jini vitest + Tovu shards.
- 2026-10-28T23:56:21Z still running tests (Jini vitest on later packages; Tovu shards in progress)
- 2026-10-28T23:58:22Z Jini vitest all 39 pkgs done (11 exit 1: coverage thresholds mostly; ui 1 real test fail). Jini complexity:strict aborts again (sonarjs plugin) even w/ ts-only globs; cyclomatic-only fallback: 1 fn >10 (cms/src/media/list-page.ts:13). Tovu shards 0-2 running.
- 2026-10-29T00:09:03Z Tovu shards 1,2 done (exit 1; 20+5 fails). Shard 0, 3-7 + admin vitest running.
