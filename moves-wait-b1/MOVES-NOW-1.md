# moves-now-1 handoff (2026-11-15)
Clones: tovu-terra-moves + jini-terra-moves, branch moves/batch-now (base integ/wave-b). Sheets merged (largest version per name) at scratchpad/best/ (may be gone; re-fetch from origin/plan/*).
## DONE (6)
- DL-postgres-1: Tovu c4229304e (db-ops.integration test 14/14 pass)
- SP-object-storage-1: Jini 0be501cdb (cms test 5/5, eslint clean; needed `pnpm run build` in packages/core once), Tovu 0128f2744 (Tovu tests NOT run: installed @jini-ai/cms 0.7.0 lacks the new export; needs Jini link)
- SP-skills-1: Jini 2c1da7355 (3/3 pass), Tovu 25a9ebb18
- DD-admin-members-1: Tovu ff41bf7f0
- DD-admin-users-1: Tovu 41dae8455 (sheet said 23 `createFakeUsersPort({ ` in use-users test; real = 22 + one multi-line `({\n` at line 671; converted all 23)
- DD-admin-media-1: Jini b2dec4dad, Tovu 766ac1437
Admin tests (members/users/media) cannot run in this clone: installed Jini lacks `createDictionaryTranslator` (environmental, untouched files fail the same). eslint clean on edited lines.
## SKIPPED
- DL-object-storage-1: census has an unlisted importer content/agent-plugin-overlays/vercel/__tests__/blob-share.test.mjs:16 (+ :121) importing parseObjectStoresFile from registry.ts; sheet must add it.
- SP-skills-2: Jini packages/agentic/package.json blob 9f27c59c != sheet 2297b5ad (C2 commit 8013b147a edited it); sheet needs a refresh.
## Not run (budget), no overlap, runnable next: DL-web-1, MV-commands-1, MV-plugin-runtime-1, MV-kernel-1 (verify overlap on kernel/index.ts, sqlite-only.ts), SP-admin-jini-admin-1, media-generation slice 1, ui-admin-database slice 2, ui-admin-sites slices not touching AllSitesTab/Sites.tsx/panel-kit index, audit A03 + D03 sheets.
## WAIT-B1
SP-commands-1 (import-local.ts C5:240); DD-web-1, SP-web-1 (tool-registrations.ts C3:464/C11:202, web-page.unit.test C5:316); ui-admin-sites slices on AllSitesTab/Sites/panel-kit index; consent slice 1 (CookieConsent.tsx C2:158); media-generation slice 3 (C3:460); ui-admin-database slice 1 file use-form-submissions.hooks.ts (also BLOCKED Q-WH); repoint-commands, dedupe-site-guide, delete-plugins, ui-dashboard, move-html, delete-mail (all 3 jobs), move-entry-refs (all), split-email-templates, split-member-login (HD-1, MV-1), MV-kernel-2, split-services/split-events/stay-error-mapping (decided, after merge), ui-admin-themes slice 2.
BLOCKED (not wait): delete-error-mapping, delete-admin-analytics, move-workspace, move-admin-observability, move-events, split-asset-transfer, publish-content, HD-member-login-2.
