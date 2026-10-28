# RUN-LOG
- 2026-10-28T20:14:38Z STARTED. Branches checked out (Tovu, Jini: full). Beginning setup.
- 2026-10-28T20:25:43Z Node 24.22 + pnpm ok. Jini install ok; Jini build EXIT 1 (3 pkgs fail: memory TS2379 extraction-log.ts:194, core TS2322 records.test.ts:119, cookie-consent). Jini typecheck EXIT 1 (2 TS errors, same). guard EXIT 1 (19 violations). test:scripts EXIT 1 (3 fails: retired-package/j05 tests). Per-package vitest running in background.
- Tovu: npm ci fails (ETARGET @jini-ai/cookie-consent@^0.6.13 unpublished); used local UNCOMMITTED file: override of all @jini-ai deps + removed overrides; npm install in root/admin/desktop/site-chat ok.
