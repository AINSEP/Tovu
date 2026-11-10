# INTEG-1110 — integrated release-candidate line `cloud/integ-1110`

Branch `cloud/integ-1110` in both repos, cut from `origin/cloud/localhost-1109`.
Inputs: Tovu localhost-1109 `3d0748bb2`, combine `7cf9658e5`, main `9e7b27bc6`; Jini localhost-1109 `8f330f4a0`, combine `e1b1bdbd6`.
Raw output: `cloud/reports/raw/integ-1110/` (`.txt`). Container: 4 cores, 16 GB, Node 24, PostgreSQL 16 (local socket, trusted role).

## 1. Merges and conflict resolutions

### Jini
`0f9539c5` Merge origin/cloud/combine (no-ff). 30 combine commits (24 non-merge, 6 merge). Conflicts:

| File | Resolution |
|---|---|
| `packages/server/src/lifecycle/boot-lifecycle.ts` + `__tests__/boot-lifecycle.characterization.unit.test.ts` (modify/delete) | localhost-1109 deleted the unused `src/lifecycle` copy (283af360: no importer, export or consumer). Combine's 1c2f0b63 edited that dead copy, so the deletion stands. Its DR-001 wording merged cleanly. The live boot lifecycle (Tovu `apps/website/src/server/runtime/lifecycle/boot-lifecycle.ts:134`) already stops prepared-but-unstarted modules. |
| `packages/ui/src/features/mcp-ui/surfaces/outcome.ts` | Took combine's open-link block (coalesce repeat clicks, 30 s deadline, 0abd656b/fa3f5d22). It already wraps localhost-1109's `result.isError` check (956fa6ac = combine 76a9e9f7), so both sides' intent is kept. |
| `packages/ui/src/features/mcp-ui/__tests__/surfaces/outcome.test.ts` | The HEAD side was empty in both hunks. Added combine's three describe blocks; no duplicate titles. |

`packages/cms/package.json` auto-merged: localhost-1109's `./core/commands` + `./forms/portable-validation` exports stay; combine's parse5 move to `dependencies` (f7ab5e9e) is in.

### Tovu
`52d5405e` Merge origin/cloud/combine (no-ff), then `0b5e2090` Merge origin/main (no-ff, clean; 9e7b27bc changes `server/runtime/composition/site-guide-tools.ts` + its test, both live Tovu files). Combine conflicts, all four in files that localhost-1109 turned into Tovu shims over Jini bodies. The shim side was kept for each:

| File | Combine change | Resolution |
|---|---|---|
| `features/agent-plugins/connect-tool.ts` | eceacef6 | patch-id identical to caaa3ee4; Jini 9d8c30642 already carries it → shim kept |
| `features/api-connections/connect.ts` | 70a9a77b | patch-id identical to 05ab227c; Jini 9d8c30642 already carries it → shim kept |
| `contracts/core/commands/revert.ts` | 59cd9a85 | shim kept; body change carried into Jini (fix A) |
| `features/plugins/data-module.ts` | 7ff1828a, da0b0526 | shim kept; net body change carried into Jini (fix B) |

No commit that exists only on `cloud/parity-argv` is in either integ branch (checked with `rev-list origin/cloud/parity-argv --not combine 1109 main`, then an ancestor test against HEAD: 0 in both repos).

## 2. Silent-loss check

Method, as in land-1109-g §1. For each repo, every file changed in `merge-base(1109, combine)..combine` was classified on the integrated tree:
- **CLEAN**: localhost-1109 never touched the file. Verified byte-identical to combine's blob on integ: Tovu 137/137, Jini 25/25. Each Tovu non-test source among them (17) still has a live importer, so none was orphaned by the extraction.
- **BOTH**: both sides changed the file. Every line combine added (net, base→combine) was looked up in the integrated file. Tovu 9 files had all lines present; Jini 10. The only misses were the four Tovu shims below.
- **GONE**: Jini `server/src/lifecycle/boot-lifecycle.ts` and its test (§1).

Tovu shims with missing lines: `connect-tool.ts` (1/1) and `api-connections/connect.ts` (1/1), both already carried (patch-identical commits); `contracts/core/commands/revert.ts` (6/6) and `features/plugins/data-module.ts` (15/15) → **LOST**, carried by fixes A and B. Tovu 9e7b27bc landed in the live `site-guide-tools.ts` → KEPT.

**Result: 3 Tovu commits LOST (59cd9a85, 7ff1828a, da0b0526) → all CARRIED (fixes A, B). 0 LOST remaining.** Merge commits (Tovu 7, Jini 6) bring nothing of their own; they are not listed.

### Tovu (66 non-merge commits, `origin/cloud/localhost-1109..origin/cloud/combine`, + main)

| # | Tovu commit | Subject | Verdict | Where it lives now |
|---|---|---|---|---|
| 1 | `04236bde` | fix(import): keep authored menu and form code off | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 2 | `85514407` | fix(import): start a site created from a live address | KEPT | untouched by localhost-1109; identical to combine: apps/desktop/src, cloud/reports/import-fix.md |
| 3 | `a03eb633` | test(import): retain complete downloads above 100 MiB | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 4 | `144c541b` | test(import): keep timeout output specific to the origin | KEPT | untouched by localhost-1109; identical to combine: apps/desktop/src, apps/website/src, cloud/reports/import-fix.md |
| 5 | `25339add` | fix(import): retain only origins in finished history | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 6 | `7158bfc6` | fix(import): clean interrupted database staging at startup | KEPT | untouched by localhost-1109; identical to combine: apps/desktop/src, apps/website/src, cloud/reports/import-fix.md |
| 7 | `e401f890` | fix(import): distinguish notices for equally named items | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 8 | `d9979c16` | fix(import): clear old link details during history cleanup | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 9 | `7464bb53` | docs(import): record fixes and final verification | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/import-fix.md |
| 10 | `a426bb0f` | fix(import): preserve native form grouping and input hints | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 11 | `173dd6ac` | fix(import): request and reuse archive response bytes | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 12 | `50cd9988` | fix(import): keep restorable menu and form HTML off | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 13 | `9a24bda4` | fix(import): compare request replay by stored link digest | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 14 | `c5c5f2ca` | fix(import): skip unreadable menu and form rows individually | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 15 | `10e34b0d` | fix(import): continue cleanup past unavailable temporary folders | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 16 | `7d02c8d8` | fix(import): schedule best-effort database cleanup at server boot | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 17 | `d1c1a6c4` | fix(import): retain unknown temporary owners for one day | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 18 | `f991043f` | fix(import): acquire staging ownership before directory creation | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 19 | `4ff816e1` | fix(import): allow share transfers within the import deadline | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 20 | `7f232645` | fix(deploy): identify only the origin in timeout details | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 21 | `b3259b3e` | fix(import): tidy saved history at desktop startup | KEPT | untouched by localhost-1109; identical to combine: apps/desktop/src, cloud/reports/import-fix.md |
| 22 | `81feb2e4` | fix(import): preserve grouped option attributes during form checks | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 23 | `b634d5e6` | docs(import): record review fixes and verification | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/import-fix.md |
| 24 | `e80fe81a` | fix(import): leave history-only launches without a cleanup child | KEPT | untouched by localhost-1109; identical to combine: apps/desktop/src, cloud/reports/import-fix.md |
| 25 | `895b81fc` | fix(import): include query identity in replay digests | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 26 | `4c9bc3e1` | fix(import): reserve time after share downloads | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 27 | `ce28673a` | test(import): resolve form starter through its public package export | KEPT | untouched by localhost-1109; identical to combine: apps/website/src, cloud/reports/import-fix.md |
| 28 | `1c8e6215` | docs(import): record re-check fixes and final verification | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/import-fix.md |
| 29 | `eceacef6` | fix(agent-plugins): return hosted sign-in paths to cards | CARRIED | patch-identical to caaa3ee4; body already in Jini packages/agent-plugins/src/connect/connect-tool.ts (9d8c30642); Tovu file is a shim |
| 30 | `70a9a77b` | fix(api-connections): emit relative hosted sign-in links | CARRIED | patch-identical to 05ab227c; body already in Jini packages/integrations/src/api-connections/connect.ts (9d8c30642); Tovu file is a shim |
| 31 | `2aa3d4eb` | fix(admin): report refused card links to the host | KEPT | both sides changed; every added line present: apps/admin/src/components/AssistantDock/__tests__/AssistantDock.hooks.unit.test.tsx, apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx |
| 32 | `5a3eb142` | fix(desktop): keep hosted sign-in hops in isolated windows | KEPT | both sides changed; every added line present: apps/desktop/src/main/index.ts, apps/desktop/src/window-navigation-policy.test.ts, apps/website/src/contracts/core/hosted-sign-in-links.ts |
| 33 | `ed19ed32` | docs: record sign-in link validation results | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/higgsfield-fix.md |
| 34 | `1f5f0da0` | fix(desktop): restrict sign-in window permissions | KEPT | both sides changed; every added line present: apps/desktop/src/main/index.ts, apps/desktop/src/window-navigation-policy.test.ts |
| 35 | `ca4c75e6` | docs: record subagent parity implementation checkpoint | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/subagent-parity.md |
| 36 | `a42400a4` | docs: finalize subagent parity evidence and blocked integration | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/subagent-parity.md |
| 37 | `8486b0ea` | fix(assistant): inject complete pinned preflight guidance | KEPT | untouched by localhost-1109; identical to combine: apps/website/src |
| 38 | `c5eee94a` | fix(agent-plugins): retain successful preflight across turn attempts | KEPT | untouched by localhost-1109; identical to combine: apps/website/src |
| 39 | `ef22c26d` | fix(assistant): scope plugin guidance to the declared system overlay carrier | KEPT | untouched by localhost-1109; identical to combine: apps/website/src |
| 40 | `fbc2ef25` | docs: complete Tovu subagent parity evidence and totals | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/subagent-parity.md |
| 41 | `82d4a009` | fix(assistant): carry child plugin pointers and restore prompt delivery | KEPT | untouched by localhost-1109; identical to combine: apps/website/src |
| 42 | `81223888` | docs: record approved pointer redesign and validation | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/subagent-parity.md |
| 43 | `e765c615` | fix(assistant): restore inline plugin delivery across CLI adapters | KEPT | untouched by localhost-1109; identical to combine: apps/website/src |
| 44 | `b97b3f11` | docs: record scope cuts and smaller whole-branch totals | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/subagent-parity.md |
| 45 | `0af399cf` | fix(assistant): preserve adapter prompt budget in plugin preflight | KEPT | untouched by localhost-1109; identical to combine: apps/website/src |
| 46 | `d5537d31` | docs: record final prompt-budget and Off-pin fixes | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/subagent-parity.md |
| 47 | `c22e7a18` | feat(media): allow fifty local imports per batch | KEPT | both sides changed; every added line present: apps/website/src/assistant/batch-tool-inputs.ts, apps/website/src/features/media-import/__tests__/import-local-file.test.ts |
| 48 | `038f6a36` | docs: record bulk media changes and red-green evidence | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/bulk-media.md |
| 49 | `4cf7b8cc` | docs: append bulk media host redaction follow-up evidence | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/bulk-media.md |
| 50 | `50105ab7` | fix(site-backup): import expiry no longer throws on a JSON null upload or import record | KEPT | untouched by localhost-1109; identical to combine: apps/website/src |
| 51 | `7ff1828a` | fix(plugins): refuse a dataModule declare whose dbPath is not the open SQLite file | LOST → CARRIED (fix B, superseded by da0b0526) | data-module.ts became a shim over Jini packages/db/src/data-modules/data-module.ts; its DB_PATH_MISMATCH refusal was replaced on combine itself by da0b0526, whose net body is carried |
| 52 | `d9c5c5c7` | docs(media): chat-preview batches carry up to four previews, not plain JSON | KEPT | untouched by localhost-1109; identical to combine: apps/website/src |
| 53 | `c51b8e07` | test: clear the tsconfig.tests.json type errors in test code, no casts | KEPT | untouched by localhost-1109; identical to combine: apps/website/src |
| 54 | `54c61ba8` | docs(reports): BUG-BATCH report and raw outputs | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/bug-batch.md, cloud/reports/raw |
| 55 | `74fc5305` | wip(reports): bugs-sweep raw evidence and first classification part | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/raw |
| 56 | `da0b0526` | fix(plugins): a dataModule dbPath is matched by file identity and only warns | LOST → CARRIED (fix B) | data-module.ts is a shim over Jini packages/db/src/data-modules/data-module.ts; the file-identity warning and open-file snapshot/headroom are carried there |
| 57 | `2540712f` | docs(reports): BUG-BATCH-2 section and raw outputs | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/bug-batch.md, cloud/reports/raw |
| 58 | `59cd9a85` | fix(change-sets): refuse a forced revert that does not say who is asking [755] | LOST → CARRIED (fix A) | revert.ts became a shim over Jini packages/cms/src/core/commands/revert.ts on localhost-1109; the fail-closed force check is carried there |
| 59 | `ad5c37b5` | docs(reports): bugs-sweep classification and fix evidence | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/bugs-sweep.md, cloud/reports/raw |
| 60 | `72876b4a` | fix(e2e): journey panel readers follow ADMIN_PANELS = PANELS.map(...) to its literal array | KEPT | untouched by localhost-1109; identical to combine: development/e2e/journeys, development/e2e/support |
| 61 | `07fbfa73` | fix(e2e): warm pin resets pause the daemon only when one is live | KEPT | untouched by localhost-1109; identical to combine: development/e2e/support |
| 62 | `56be0d9f` | fix(e2e): visual manifest resolves a tab id written as a same-file string const | KEPT | untouched by localhost-1109; identical to combine: development/e2e/journeys |
| 63 | `7c83209a` | docs(reports): E2E-FIX report and raw outputs | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/e2e-fix.md, cloud/reports/raw |
| 64 | `7d92b987` | fix(e2e): panel map guard rejects quoted and computed id/nav overrides | KEPT | untouched by localhost-1109; identical to combine: development/e2e/support |
| 65 | `be43d06f` | fix(e2e): tab-id constant lookup accepts only one top-level const binding | KEPT | untouched by localhost-1109; identical to combine: development/e2e/__tests__, development/e2e/journeys, development/e2e/support |
| 66 | `ead21db4` | docs(reports): E2E-FIX-2 section and raw outputs | KEPT | untouched by localhost-1109; identical to combine: cloud/reports/e2e-fix.md, cloud/reports/raw |
| 67 | `9e7b27bc` | fix(assistant): Gemini admin chat replies after describing site_guide (origin/main) | KEPT | server/runtime/composition/site-guide-tools.ts + visitor-schemas-gemini.unit.test.ts: live Tovu files, untouched by localhost-1109; merged clean in 0b5e2090 |

### Jini (24 non-merge commits, `origin/cloud/localhost-1109..origin/cloud/combine`)

| # | Jini commit | Subject | Verdict | Where it lives now |
|---|---|---|---|---|
| 1 | `e95e9909` | fix(platform): honor explicit response byte limits | KEPT | untouched by localhost-1109; identical to combine: packages/platform/src |
| 2 | `5b8d747a` | fix(platform): identify only origins in timeout diagnostics | KEPT | untouched by localhost-1109; identical to combine: packages/integrations/src, packages/platform/src |
| 3 | `d469108b` | fix(http): keep byte-only responses out of text conversion | KEPT | untouched by localhost-1109; identical to combine: packages/core/src, packages/platform/src |
| 4 | `513ac058` | refactor(http): pass response capping inputs as one object | KEPT | untouched by localhost-1109; identical to combine: packages/platform/src |
| 5 | `76a9e9f7` | fix(ui): display refused and rejected outcome link requests | KEPT | both sides changed; every added line present: packages/ui/src/features/mcp-ui/__tests__/surfaces/outcome.test.ts, packages/ui/src/features/mcp-ui/surfaces/outcome.ts, packages/ui/src/react/mcp-ui/__tests__/useMcpUiHost.test.tsx |
| 6 | `7f730e4b` | fix(agent-plugins): return complete guidance on every explicit read | KEPT | untouched by localhost-1109; identical to combine: packages/agent-plugins/src |
| 7 | `3665df68` | fix(agent-plugins): deliver the selected preflight primary in full | KEPT | untouched by localhost-1109; identical to combine: packages/agent-plugins/src |
| 8 | `2106e74a` | fix(daemon): replay prepared Claude guidance for subagents | KEPT | untouched by localhost-1109; identical to combine: packages/daemon/src |
| 9 | `7cc21a69` | fix(agent-runtime): declare Claude plugin guidance overlay carrier | KEPT | untouched by localhost-1109; identical to combine: packages/agent-runtime/src |
| 10 | `3abec54a` | fix(daemon): deliver short child plugin pointers | KEPT | untouched by localhost-1109; identical to combine: packages/daemon/src |
| 11 | `4395cdef` | fix(agent-plugins): bound automatic primaries and expose selected guidance ids | KEPT | untouched by localhost-1109; identical to combine: packages/agent-plugins/src |
| 12 | `f6efd0af` | fix(agent-runtime): declare child hooks and Codex pointer policy | KEPT | untouched by localhost-1109; identical to combine: packages/agent-runtime/src |
| 13 | `319355f9` | fix(daemon): escape PowerShell smart quotes in hook paths | KEPT | untouched by localhost-1109; identical to combine: packages/daemon/src |
| 14 | `cefc53b2` | fix(agent-plugins): track actual delivery and avoid repeat primary injection | KEPT | untouched by localhost-1109; identical to combine: packages/agent-plugins/src |
| 15 | `4b6bacb6` | fix(agent-runtime): remove automatic plugin pointer policy | KEPT | untouched by localhost-1109; identical to combine: packages/agent-runtime/src |
| 16 | `a9c41bc8` | fix(agent-plugins): respect argv budgets and admit Off-mode pins | KEPT | untouched by localhost-1109; identical to combine: packages/agent-plugins/src |
| 17 | `51af9831` | fix(daemon): redact internal nested tool failures in batches | KEPT | both sides changed; every added line present: packages/daemon/src/__tests__/tool-executor.dispatch.test.ts, packages/daemon/src/tool-executor.ts |
| 18 | `ad2e7052` | fix(daemon): use host redaction for nested internal failures | KEPT | both sides changed; every added line present: packages/daemon/src/__tests__/tool-executor.dispatch.test.ts, packages/daemon/src/tool-executor.ts, packages/daemon/src/tool-recovery/__tests__/stack.test.ts, packages/daemon/src/tool-recovery/redaction.ts, packages/daemon/src/tool-recovery/stack.ts |
| 19 | `f7ab5e9e` | fix(cms): parse5 is a real dependency — forms/sql, forms/html and forms/express load it at impo | KEPT | both sides changed; every added line present: packages/cms/package.json, pnpm-lock.yaml |
| 20 | `9ee2680c` | fix(cms): a retention-cleared submission IP reads back as null, not an empty string | KEPT | untouched by localhost-1109; identical to combine: packages/cms/src |
| 21 | `52b035dc` | fix(ui): a read-only outcome card says when its link was refused or failed to open | KEPT | both sides changed; every added line present: packages/ui/src/features/mcp-ui/__tests__/surfaces/outcome.test.ts, packages/ui/src/features/mcp-ui/surfaces/outcome.ts |
| 22 | `0abd656b` | fix(ui): repeated Sign in clicks reuse the open request in progress | KEPT | both sides changed; every added line present: packages/ui/src/features/mcp-ui/__tests__/surfaces/outcome.test.ts, packages/ui/src/features/mcp-ui/surfaces/outcome.ts |
| 23 | `1c2f0b63` | fix(server): boot rollback also stops prepared modules that never started [750] | KEPT (no live target) | packages/server/src/lifecycle/boot-lifecycle.ts was deleted on localhost-1109 as unused (283af360: no importer, no export); DR-001 doc change kept. The live host lifecycle (Tovu apps/website/src/server/runtime/lifecycle/boot-lifecycle.ts:134) already stops prepared-but-unstarted modules |
| 24 | `fa3f5d22` | fix(ui): a sign-in open request that never answers times out after 30 seconds | KEPT | both sides changed; every added line present: packages/ui/src/features/mcp-ui/__tests__/surfaces/outcome.test.ts, packages/ui/src/features/mcp-ui/surfaces/outcome.ts |

## 3. Fixes (LOST changes carried; red first, one commit per fix)

The failing tests are combine's own Tovu tests. They merged cleanly but now run against the Jini body through the shim. No MERGE-CAUSED red was found apart from these two (§4).

| Fix | Red (integ, before) | Change | Commit | Evidence |
|---|---|---|---|---|
| A | Tovu `contracts/core/commands/__tests__/revert.unit.test.ts` › `L079: force without principal kind is refused before any write`: `assert.rejects` got no rejection. 22/23. | `packages/cms/src/core/commands/revert.ts`: after the agent-cannot-force check, a `force` with `principalKind === undefined` throws `RevertForbiddenError(…, "FORCE_NEEDS_PRINCIPAL_KIND")`. Same text and doc comment as 59cd9a85. The callers (Tovu change-sets route, content deps, tool registrations) already pass a kind. | Jini `a0413c6a` | red `fixA-red-revert.txt` (22/23); green `fixA-green-revert.txt` (23/23) |
| B | Tovu `features/plugins/__tests__/data-module.test.ts` + `data-module.dialects.test.ts`: `a dbPath naming a different real file warns, still installs, and snapshots the open database` (measured the named file, not the open one), and `a Postgres kernel takes no snapshot … whatever dbPath says` [sqlite] (snapshot crashed on `/nonexistent`). 52/54. | `packages/db/src/data-modules/data-module.ts`: the net body of 7ff1828a + da0b0526. The open file comes from `pragma_database_list`; a named path that is a different file by (dev, ino) gets a plain-words `console.warn` and the install proceeds; headroom, `recoverable` and the snapshot use the open file. Uses Jini's `isInMemoryDbPath({ dbPath })` object form. | Jini `d80000c8` | red `fixB-red-data-module.txt` (52/54); green `fixB-green-data-module.txt` (54/54) |

Both fixes touch only the one body file each and add no imports beyond `node:fs`. They introduce no package-to-package import (`check:cross-package` clean, §4). Tovu is unchanged: no production code changed in Tovu.

## 4. Gates (on Jini `d80000c8` + Tovu `0b5e2090` with Jini linked)

### Environment note (a setup race, not a code red)
The first Tovu setup ran `link:jini` while `apps/admin` and `apps/site-chat` `npm ci` were still running. npm then unpacked the published `@jini-ai/*` tarballs through the fresh symlinks into `/home/user/Jini/packages`. It overwrote 65 tracked files with their published (older) content, added 9 `LICENSE` files and replaced built `dist/`. All of it was in the working tree only; nothing was committed or pushed. Both fix reds captured in that state were invalid (`ERR_PACKAGE_PATH_NOT_EXPORTED ./core/commands`) and were discarded.

Recovery: the clobbered files were backed up, the 65 tracked files were rewritten from HEAD and the 9 LICENSE files moved out. Every `dist/` was moved aside and Jini was rebuilt from scratch (`pnpm --no-bail -r build` exit 0, 0 errors). Then, strictly in sequence, admin/desktop `npm ci` ran, then `link:jini`. `git status` in Jini stayed clean for the rest of the run (`npm-clobber-restored-files.txt`). Every number below comes from the clean state.

### Jini
- `pnpm install` exit 0; `pnpm --no-bail -r build` exit 0, 0 `error TS` (`jini-install.txt`, `jini-build.txt`). The fix rebuild of `db` + `cms` exited 0 (`fixAB-rebuild-db-cms.txt`).
- **Every package's full suite**: 41 packages, vitest `--maxWorkers=2 --minWorkers=1` (`jini-tests/<pkg>.txt`). `commerce` and `search` already pin workers in their own scripts, so the extra flag made vitest refuse to start ("Expected a single value for option --maxWorkers"). Both were rerun with their own scripts. Commerce ran with `COMMERCE_PG_URL` on the local PostgreSQL (the socket URL form was rejected as `Invalid URL`; TCP 127.0.0.1 used).

  | Package | Files | Tests | Result |
  |---|---|---|---|
  | admin | 211 passed (211) | 2847 passed (2847) | exit 0 |
  | agent-plugins | 1 failed , 124 passed (125) | 1 failed , 1682 passed , 2 skipped (1685) | **exit 1** (PRIOR, §5) |
  | agent-runtime | 186 passed (186) | 4297 passed , 1 skipped (4298) | exit 0 |
  | agentic | 73 passed (73) | 1555 passed (1555) | exit 0 |
  | analytics | 14 passed (14) | 197 passed (197) | exit 0 |
  | artifacts | 14 passed (14) | 204 passed (204) | exit 0 |
  | capability-providers | 18 passed (18) | 198 passed (198) | exit 0 |
  | chat | 1 failed , 293 passed , 1 skipped (295) | 1 failed , 4235 passed , 1 skipped (4237) | **exit 1** (PRIOR, §5) |
  | cli | 31 passed (31) | 575 passed (575) | exit 0 |
  | cms | 2 failed , 327 passed (329) | 3 failed , 3982 passed (3985) | **exit 1** (PRIOR, §5) |
  | commerce | 72 passed (72) | 1472 passed (1472); + node:test 52/52, kernel config 10/10 | exit 0 |
  | cookie-consent | 18 passed (18) | 178 passed (178) | exit 0 |
  | core | 115 passed (115) | 1857 passed (1857) | exit 0 |
  | daemon | 207 passed , 1 skipped (208) | 4069 passed , 1 skipped (4070) | exit 0 |
  | db | 94 passed (94) | 739 passed (739) | exit 0 |
  | desktop-host | 80 passed , 1 skipped (81) | 688 passed , 1 skipped (689) | exit 0 |
  | devops | 76 passed (76) | 1109 passed (1109) | exit 0 |
  | diagnostics | 58 passed (58) | 956 passed (956) | exit 0 |
  | http-kit | 28 passed (28) | 579 passed (579) | exit 0 |
  | infra | 14 passed (14) | 144 passed (144) | exit 0 |
  | integrations | 96 passed (96) | 2015 passed (2015) | exit 0 |
  | mcp | 92 passed (92) | 1566 passed (1566) | exit 0 |
  | memory | 15 passed (15) | 332 passed (332) | exit 0 |
  | oauth | 42 passed (42) | 755 passed (755) | exit 0 |
  | platform | 1 failed , 156 passed (157) | 1 failed , 3080 passed , 6 skipped (3087) | **exit 1** (PRIOR, §5) |
  | plugin-catalog | 1 passed (1) | 65 passed (65) | exit 0 |
  | plugin-fixture-provider | 1 passed (1) | 2 passed (2) | exit 0 |
  | plugins | 66 passed (66) | 813 passed (813) | exit 0 |
  | protocol | 10 passed (10) | 106 passed (106) | exit 0 |
  | provider-plugins | 51 passed (51) | 806 passed (806) | exit 0 |
  | registry | 19 passed (19) | 355 passed (355) | exit 0 |
  | sandbox | 17 passed (17) | 132 passed (132) | exit 0 |
  | search | 12 passed (12) | 320 passed (320) | exit 0 |
  | server | 24 passed (24) | 451 passed , 1 skipped (452) | exit 0 |
  | sidecar | 17 passed (17) | 245 passed , 2 skipped (247) | exit 0 |
  | sqlite | 4 passed (4) | 9 passed (9) | exit 0 |
  | ui-kit | 19 passed (19) | 225 passed (225) | exit 0 |
  | ui | 655 passed (655) | 8922 passed (8922) | exit 0 |
  | user-management | 97 passed (97) | 1172 passed (1172) | exit 0 |
  | vibecoding | 22 passed (22) | 360 passed (360) | exit 0 |

  Postgres-only suites (excluded from the default configs): `daemon test:postgres` **8/8**, `db test:postgres` **28/28** (`jini-tests/daemon-postgres.txt`, `db-postgres.txt`).
  **Totals: 4 packages with reds, 6 failing tests, all PRIOR (§5).**
- root `test:scripts`: **50 files, 801 passed, 2 failed, 32 skipped**. Both failures are PRIOR on localhost-1109 (`jini-test-scripts.txt`).
- root `test:agent-plugins:content`: **1410/1410** (`jini-agent-plugins-content.txt`).
- `pnpm check:cross-package` with `JINI_DECLARATION_BASELINE_DIR` = a fresh snapshot (a clean checkout at `35c4961af718…`; core build 0, recursive build 0, `--write-baseline` → "3308 source mappings", the same count as land-1109-g; `xp3-snapshot.txt`): **"XP1–XP5 clean", exit 0** (`jini-cross-package.txt`).
- `pnpm guard`: exit 1 with the **same 2 violations as land-1109-g**: R10-chatpane-public-surface (`ChatPane.tsx` imports `Icon` outside the barrel; PRIOR) and R13-model-fallback-freshness (`claude.ts` missing `claude-fable-5-2` from the live picker cache; ENV). Hardwiring HW1–HW9 all "0 new" (`jini-guard.txt`).

### Tovu
- `npm ci` exit 0. npm skipped install scripts, so `npm rebuild better-sqlite3 argon2 esbuild` was run; both natives load (`tovu-rebuild-natives.txt`). `apps/admin`, `apps/desktop` and `apps/site-chat` `npm ci` exit 0. `@tovu/sdk` was built before `link:jini`; link exit 0.
- `typecheck` (root + e2e): **exit 0** (`tovu-typecheck.txt`).
- lint `biome lint . --max-diagnostics=none --diagnostic-level=error`: **601 errors, 1 more than 600**. The per-file/per-rule key diff against land-1109-g's `.keys` has exactly one new key: `apps/website/src/features/agent-plugins/automatic-agent-plugins.ts lint/suspicious/noAssignInExpressions` (line 93, `entry.preflight ??= …`). That file is byte-identical to combine (c5eee94a / 0af399cf). The same diagnostic is reported on a combine checkout (`tovu-lint-on-combine.txt`). → **0 MERGE-CAUSED new; 1 PRIOR from combine** (`tovu-lint.txt`, `.keys`, `tovu-lint-perfile-vs-land1109g.txt`).
- Tool-metadata golden: SHA-256 `a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6`, **unchanged**.
- admin vitest `--maxWorkers=2` (vitest 4 has no `--minWorkers`): **883 files, 14371 passed, 2 failed, 2 skipped**. Both failures are PRIOR (`tovu-admin.txt`).
- desktop `npm test` (its `pretest` runs `build:preload`): **2230 tests, 2215 pass, 5 fail, 10 skipped** (`tovu-desktop.txt`). 4 are PRIOR. The 5th, `e2e-harness-import.test.ts` › `the desktop journey harness loads through Playwright…`, failed with `spawnSync node ETIMEDOUT` under full load and passes alone on integ (`desktop4-on-integ.txt`) → LOAD.
- **Root `npm test` globs** (website, content agent-plugins + overlays, site-chat, packages, development scripts, eslint-rules; 3126 files), node:test `--test-concurrency=1`, PG on the local socket. The full set did not fit in the 2-hour cap: CLI integration tests each spawn `tovu init` and take 30–400 s. The run was sharded:
  - part 1: 3 alphabetical shards. 305 files completed, then the run was stopped to re-prioritise (`tovu-root-part1-shard*.txt`).
  - part 2: 3 shards in priority order: first the 21 test files combine/main changed, then 162 tests importing a Tovu source file combine/main changed, then unit tests, then integration tests (`tovu-root-part2-shard*.txt`).
  - part 3: 2 extra lanes on the unit-test tail (`tovu-root-part3-extra*.txt`). Then the remaining content overlays (`tovu-content-rest.txt`).
  - **Files completed: 2388 / 3126**, including **all 183 priority files**, **site-chat 26/26**, **content agent-plugins 2/2 + overlays 75/75**, website 2253/2960, development scripts 32/62. Not reached: 707 website files (mostly integration, sorted last), 30 development-script tests, `packages/sdk` (1). Lists: `tovu-root-completed-files.txt`, `tovu-root-not-run.txt`.
  - Totals over all outputs (overlapping lanes counted twice): **25377 pass, 40 fail, 20 skipped**. The 40 fails are 39 unique titles. Each was rerun alone on integ and on both parents: 36 PRIOR/ENV and 3 LOAD (§5). No MERGE-CAUSED red remains. Interrupted files report as `cancelled`; none counted as pass or fail.

## 5. PRIOR reds (listed only)

Every red on integ was rerun on the parents. Clean worktrees of `origin/cloud/combine` and `origin/cloud/localhost-1109` were set up in both repos: Jini install 0 and build 0 each; Tovu `npm ci` 0, natives rebuilt, `@tovu/sdk` built, then linked to the matching Jini parent; admin/desktop installed where needed (`parent-*.txt`). Each failing title on integ was compared with the parent runs. In every group, all of integ's failing titles also fail on a parent with the same assertion (checked by script on the `✖` titles, then by eye on the assertion text). **No MERGE-CAUSED red besides fixes A/B.**

| Suite | Test | Fails on | Same assertion | Evidence |
|---|---|---|---|---|
| Jini agent-plugins | `load-supporting-files.unit.test.ts` › enable, load and supporting reads share admission after loading, including revocation and refused files | combine (passes on 1109) | `expected { status: 'loaded' } to deeply equal { status: 'already-loaded' }`. Combine 7f730e4b removed `already-loaded` for explicit reads and updated only `automatic-use` tests | `prior-jini-load-supporting-files-on-*.txt` |
| Jini chat | `useChatPaneAgentControl.test.tsx` › refuses to send while a run is streaming, with a reason instead of a silent bypass | both | `expected … matching /streaming/ but got 'cannot send: A reply is still running…'` | `prior-jini-chat-cms-on-*.txt` |
| Jini cms | `identity-extraction.boundary.test.ts` › CMS removes identity entry points while preserving the media import subpath | combine (passes on 1109) | `expected undefined to be true` | same |
| Jini cms | `integration-package.contract.test.ts` › keeps exports and entry runtime metadata synchronized; › keeps the folded domain entries and optional adapter peers explicit | combine (passes on 1109) | `expected { @jini-ai/core, parse5, … } to deeply equal { @jini-ai/core, unpdf, … }` (f7ab5e9e moved parse5 to dependencies; the contract test still pins it as a peer) | same |
| Jini platform | `source-boundaries.test.ts` › platform source never references host source paths or aliases | combine (passes on 1109) | flags `src/__tests__/fetch-with-timeout.test.ts` (5b8d747a fixture URL names the host) | `prior-jini-platform-boundaries-on-*.txt` |
| Jini test:scripts | `agent-plugin-subpaths.test.ts` › every table row is a real plugin folder published as its own subpath…; `standalone-agent-plugin.integration.test.ts` › the tarball passes the packed isolation gate and carries no test folder | localhost-1109 (pass on combine) | `calendly` missing from the table / `core package publishes plugin payload calendly/plugin.json` | `prior-jini-scripts-calendly-on-*.txt` |
| Jini guard | R10-chatpane-public-surface (PRIOR); R13-model-fallback-freshness (ENV: live picker cache) | as land-1109-g | — | `jini-guard.txt` |
| Tovu lint | `automatic-agent-plugins.ts:93` noAssignInExpressions | combine | same diagnostic | `tovu-lint-on-combine.txt` |
| Tovu admin | `chat-fab-z-order-css.unit.test.ts` › chat FAB z-order › sits above every in-page layer… | both | `expected [ Array(1) ] to deeply equal []` | `prior-tovu-admin-on-*.txt` |
| Tovu admin | `credential-copy-card-frame.unit.test.ts` › saved-key cards grow from content rather than reserving blank frame space (approve=false) | localhost-1109 | `expected { granted: false, …(2) } to deeply equal { granted: false }` | same |
| Tovu desktop | `main-agent-runtime-wiring.test.ts` › quit waits for owned runtime disposal…; `main-shutdown-wiring.test.ts` › before-quit waits on in-flight teardowns…, › Quit during a card Stop waits for its tracked teardown…; `runner-ipc-stubs.test.ts` › every channel the contracts declare has a stub or a real handler | both | `ReferenceError: stopRunningImports is not defined` (source-slice eval) / same deep-equal | `desktop4-on-*.txt` |
| Tovu website | `moved-tools.golden.test.ts` › moved tools, cards, approvals and counters match the golden recorded before any move | localhost-1109 (passes on combine) | `catalog` bytes. Golden 751493; 1109 752230; integ 752102. The 128-byte difference from 1109 is combine's tool text. | `prior-tovu-golden-allowlist-on-*.txt`, `red-golden-allowlist-integ.txt` |
| Tovu website | `mcp-ui-allowlist-completeness.test.ts` › every surfaceExchanges.open(...) call names a toolId constant this scan can resolve | both | `cli/commands/import-local.ts:151: file` | same |
| Tovu website | `introspect-command.integration.test.ts` (2) | both | `introspect must list the real registered commands…` (`import-local`) | `reds4-on-*.txt` |
| Tovu website | `vendor-neutrality.test.ts` › no generic seam file names the first provider | both | `bundled-catalog.ts:43/44`, `shared-owner.ts:81`, +`overlay-guidance-single-copy…:33` on 1109 and integ | same |
| Tovu website | `bundled-mail-credential-cards.unit.test.ts` › calendly: declared key and sign-in cards have usable copy… | localhost-1109 | `calendly: missing sign-in permissions` | same |
| Tovu website | `bundled-automatic-relevance.unit.test.ts` › Auto suggests only relevant bundled plugins (5 prompts) | combine (passes on 1109) | same expected lists (`site-import`, `ui-ux-design`, `vercel`) | `reds2-on-*.txt` |
| Tovu website | `extract-s8-x-host-operations.test.ts` › old entries retain the four independently recorded card/descriptor hashes | localhost-1109 | `copyCard cb44d9f7… ≠ cdf8d669…`, `copyDescriptors 2c672a02… ≠ b2a05ee1…` (land-1109-g fix 2 re-recorded these in the c2p2 file only) | same |
| Tovu website | `connect-tool.api-connections.unit.test.ts` (4), `surface-adapters.security.test.ts` (several), `agent-plugin-connections.vertical-slice.test.ts` (several): 13 titles | both (land-1109-g PRIOR list, from 05ab227c) | 13/13 on combine, 13/13 on 1109 | `reds-api4-on-*.txt` |
| Tovu website | `submission-ip-retention.dialects.test.ts` › migration preserves every column… [sqlite], [pglite] | combine (passes on 1109) | `published DTO gets an empty display string for the cleared IP` (Jini 9ee2680c now returns null) | `red-retention-on-*.txt` |
| Tovu website | `no-vendor-in-core.boundary.test.ts` › real core tree has only reviewed pattern exceptions, each with its exact current total | both | `Vendor knowledge belongs in its plugin. Uncovered file/vendor/count pairs` (same list head) | `red-core-patterns-on-*.txt` |
| Tovu website | `playwright-browser.integration.test.ts` › observes real rendered evidence from a real page; `preview-switcher-layout.test.ts` (7: preview tag under fixed/hostile/sticky at 390/1440px, phone scroll) | both (ENV) | `browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/…` (the container has another Playwright browser build) | `red-browser-on-*.txt` |
| Tovu website | `render-form-layout.test.ts` (3: contact form hidden by stylesheet; fallback colours; checkbox inline), `app-federation-reload.observability.test.ts` › a roster change after createApp traces… | both (also land-1109-g PRIOR) | same titles | `red-last-on-*.txt` |
| Tovu website | `no-raw-sqlite.boundary.test.ts` › no new raw SQLite outside the storage kernel (ratchet) | both | same title | same |
| Tovu website | `preview-switcher.integration.test.ts` › live server chooses per request; cookie persists, reset clears… | localhost-1109 (passes on combine) | same title | same |

LOAD (not reds): `serve-command-wiring.unit.test.ts` › runServeCommand pins the site before boot… (12.8 s under 5 parallel lanes; passes alone on integ, `reds4-on-integ.txt`) `site-exporter.test.ts` › exportSite: a paged post listing exports every page… (Bug C) (passes alone on integ, `red-last-on-integ.txt`) and desktop `e2e-harness-import.test.ts` (`spawnSync ETIMEDOUT` under load; passes alone on integ).

## 6. Last green pair

Jini `d80000c8` + Tovu `0b5e2090`, with Jini linked. Build, typecheck, cross-package and guard (2 known) pass. Every Jini package suite, the Postgres suites, test:scripts, content, admin, desktop, site-chat, content overlays and 2388/3126 root files ran. The only reds are on the PRIOR/ENV/LOAD list. Fixes A and B are green.

## 7. Commits pushed (`cloud/integ-1110`)

- Jini: `0f9539c5` merge combine; `a0413c6a` fix A (cms revert); `d80000c8` fix B (db data-module).
- Tovu: `52d5405e` merge combine; `0b5e2090` merge main; then this report commit.

No main, combine, localhost-1109 or extract-s10 ref was touched. Nothing was published or force-pushed. Nothing from `cloud/parity-argv` is included. All test, server and Postgres processes were stopped at the end.

INTEG-1110 DONE
