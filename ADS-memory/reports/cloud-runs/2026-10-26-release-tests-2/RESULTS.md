# RESULTS — release-1026 tests run 2

## 2026-10-27T00:55:45Z — STARTED
Tovu HEAD 8cbefadf (cloud/release-1026 checked out OK). Node on image: v22.22.0 (need 24). Starting setup.

## 2026-10-27T01:02:35Z — PROGRESS: setup + build gates + targeted reruns
Setup: Node 24.22.0; Jini cloned from cloud/release-1026; cookie-consent dep pointed at file:/root/Jini (package.json/lock edits NOT committed); `npm ci` fails with the edited dep (lock mismatch) so `npm install` used; link:jini ok (60 links); sdk built AFTER link; desktop @jini-ai symlinked.

### Build gates
- Jini `pnpm --no-bail -r build`: **exit 0, no failing packages** (was failing in run 1).
- Tovu typecheck: `apps/website/tsconfig.json` does not exist (brief path). `npx tsc -p tsconfig.json --noEmit` (repo's `npm run typecheck` root config) against linked Jini: **0 errors** (run 1 had ~13). Note: `tsc -p apps/site-chat/tsconfig.json` gives 61 errors (react not resolvable from that config) — ENV/config artifact, not the gate.

### Targeted reruns (alone)
1. publish-agent-tools.unit.test.ts "publish cards can save distinct unattached project keys…" — FAIL, test line 1248: `assert.equal(rows.every(row => !row.isDefault), true)` → actual false, expected true (strictEqual `false !== true`). i.e. at least one of the 3 vault rows saved unattached is marked isDefault. Class: UNSURE→likely REGRESSION (still failing after the fix).
2. provider-plugins.unit.test.ts "env configured: product catalog projection…" — FAIL, line 776 deepStrictEqual: actual has an extra second event `{name:'site_created', properties:{}, userId:'00000000-0000-4000-8000-000000000001'}` after the expected `site_created {source:'admin',…}`. Class: UNSURE→likely REGRESSION (duplicate site_created emitted with empty properties).
3. agent-plugin-search-discovery negative control (13/14 pass, 1 fail): 
   - "What plugins are installed on the site?" → top hit **search_agent_plugin_local (9.044)**, then content_read.plugin (8.960), agent_plugins_install (7.961), plugins_install (7.624), agent_plugins_update (7.559). Test expects content_read.plugin first → FAIL (cannibalization by new tool).
   - "Can you show me which plugins are enabled versus disabled?" → top hit **content_read.plugin (18.327)** → PASS.
   (The brief's "…enabled" phrasing = the second one; only the "installed" phrasing is cannibalized.)
