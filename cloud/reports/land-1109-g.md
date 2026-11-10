# LAND-1109-G — merged line (cloud/localhost-1109) silent-loss check, gates, fixes

Branch `cloud/localhost-1109` in both repos. Start: Tovu `8bdbb7574` (merge), Jini `9d8c30642` (on `e857c3f89`).
Parents: Tovu extraction `a6eca7c50`, fixes `8bdbb7574^2`; Jini extraction `ebc1e0c5`, fixes `a1a12c24b`.
Both parent pairs were cloned, installed and built (Jini `pnpm -r build` exit 0 each; Tovu `npm ci` exit 0, `@tovu/sdk` built, linked to the matching Jini clone), and every red was rerun there.
Raw output: `cloud/reports/raw/land-1109-g/` (`.txt`).

## 1. Silent-loss check

Method: for every commit, each file it changed was checked on the merged line. Only 8 of the 71 files touched by the 39 Tovu commits were changed on the extraction side (`b45d2ee75..a6eca7c50`):
- three became shims: `agent-plugins/connect-tool.ts`, `api-connections/connect.ts` and `custom-credentials/credential-copy-tool.ts`. These were the merge conflicts.
- four auto-merged or conflict-resolved hub files: `apps/admin/src/lib/api.ts`, `server/routes/types.ts`, `composition/app.ts` and `composition/deps.ts`. For each, `diff(^2 → merge)` equals `diff(base → ^1)` line for line, so both sides are intact.
- one test file.

Every other touched file is byte-identical to `^2` on the merged line. Each touched non-test source file is still imported by live code, so none is dead. The 17 merge commits have empty combined diffs, so they bring no change of their own.

For the 3 shim files, the localhost hunks were compared with the Jini bodies. 9d8c30642 carries `new URL(start.authorizationUrl).pathname` into both connect bodies, and the saved-key picker behaviour into `integrations/credentialed-http/tools/credential-copy-tool.ts`. The Tovu shim supplies the new host words.

**Result: 0 LOST.** No fix was needed for lost changes.

### Tovu (39 commits, `8bdbb7574^1..8bdbb7574^2`)

| # | Tovu commit | Subject | Verdict | Where it lives now |
|---|---|---|---|---|
| 1 | `99683539` | chore(live): carry the live tree's uncommitted todos, desktop e2e fixture and Codex runner edits onto | KEPT | development/e2e/desktop/_fixtures.ts, run-codex-shards.sh, todos.md: untouched by the extraction side; identical to ^2 |
| 2 | `9563799e` | Merge branch 'merge-1029' of /Users/la/Programming/tovu-integration-clones/prov2-tovu into localhost- | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 3 | `43dd0933` | Merge branch 'merge-1029' of /Users/la/Programming/tovu-integration-clones/prov2-tovu into localhost- | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 4 | `ea353d76` | Merge branch 'merge-1029' of /Users/la/Programming/tovu-integration-clones/prov2-tovu into localhost- | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 5 | `be1acd72` | Merge branch 'merge-1029' of /Users/la/Programming/tovu-integration-clones/prov2-tovu into localhost- | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 6 | `81fddf97` | Merge branch 'merge-1029' of /Users/la/Programming/tovu-integration-clones/prov2-tovu into localhost- | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 7 | `33a06c89` | Merge branch 'merge-1029' of /Users/la/Programming/tovu-integration-clones/prov2-tovu into localhost- | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 8 | `6df547b7` | Merge branch 'merge-1029' of /Users/la/Programming/tovu-integration-clones/prov2-tovu into localhost- | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 9 | `45780a28` | Merge branch 'merge-1029' of /Users/la/Programming/tovu-integration-clones/prov2-tovu into localhost- | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 10 | `9af11d5e` | Merge branch 'merge-1029' of /Users/la/Programming/tovu-integration-clones/prov2-tovu into localhost- | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 11 | `f01e76b0` | Merge branch 'merge-1029' of /Users/la/Programming/tovu-integration-clones/prov2-tovu into localhost- | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 12 | `00156ae7` | Merge branch 'merge-1029' of /Users/la/Programming/tovu-integration-clones/prov2-tovu into localhost- | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 13 | `ba37f604` | docs(todos): Thursday Codex list items 13–20 from the 11-03 localhost/release checks (credential-wa | KEPT | development/todos.md (identical to ^2; later todos commits rewrote some of these lines) |
| 14 | `6f89186e` | Merge branch 'merge-1029' of /Users/la/Programming/tovu-integration-clones/prov2-tovu into localhost- | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 15 | `b8b68619` | docs(todos): Thursday 21 (never-again guards from the 0.1.27 one-site assistant break) + 22 (Websites | KEPT | development/todos.md (identical to ^2; later todos commits rewrote some of these lines) |
| 16 | `b77f23fa` | docs(todos): item 23 — site server memory (profiling now; shared multi-site server only if numbers  | KEPT | development/todos.md (identical to ^2; later todos commits rewrote some of these lines) |
| 17 | `aa7091ee` | Merge branch 'merge-1029' of /Users/la/Programming/tovu-integration-clones/prov2-tovu into localhost- | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 18 | `26609374` | docs(todos): 24 (OAuth plugin described as API key while off) + 25 (one owner-level credential store) | KEPT | development/todos.md (identical to ^2; later todos commits rewrote some of these lines) |
| 19 | `564aeaef` | docs(todos): item 23 updated with the 11-04 server memory profile and ranked fixes | KEPT | development/todos.md (identical to ^2; later todos commits rewrote some of these lines) |
| 20 | `1ba93706` | docs(todos): item 24 — agents read every installed plugin even when off (only running needs it on) | KEPT | development/todos.md (identical to ^2; later todos commits rewrote some of these lines) |
| 21 | `4b764797` | docs(todos): 26 — assistant turns on anything with one approval card | KEPT | development/todos.md (identical to ^2; later todos commits rewrote some of these lines) |
| 22 | `f806f4a7` | Merge branch 'merge-1029' of /Users/la/Programming/tovu-integration-clones/prov2-tovu into localhost- | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 23 | `6be576a9` | Merge cloud/combine (bf68d6758) into localhost-1103 | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 24 | `830172d5` | Merge remote-tracking branch 'origin/cloud/combine' into localhost-1103 | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 25 | `a7b8636f` | Merge remote-tracking branch 'origin/cloud/combine' into localhost-1103 | KEPT | merge with no change of its own (empty combined diff); its second parent is already in the extraction parent |
| 26 | `4af069f6` | feat(media): allow fifty local imports per batch | KEPT | apps/website/src/assistant/batch-tool-inputs.ts (Tovu, live) |
| 27 | `0b05623b` | feat(keys): a key saved on any site of this install can be used on any other | CARRIED | Tovu parts KEPT (project-keys/service.ts, composition/other-site-keys.ts, admin Copy keys UI, credential-copy route). credential-copy-tool.ts was a conflict: the merge kept the shim with the new tool/card descriptions and host words; the picker body (keys from other sites, locked keys, outcomes, used id) CARRIED by Jini 9d8c30642 into packages/integrations/src/credentialed-http/tools/credential-copy-tool.ts + credential-tool-host.ts. deps.ts hunk kept by the conflict resolution |
| 28 | `8beb8b93` | fix(keys): the saved-key listing stays off the Secrets page and never shows a token-shaped label | CARRIED | service.ts listChoices / other-site-keys.ts / routes KEPT; the picker's listChoices call CARRIED by 9d8c30642 |
| 29 | `caaa3ee4` | fix(agent-plugins): return hosted sign-in paths to cards | CARRIED | 9d8c30642 → Jini packages/agent-plugins/src/connect/connect-tool.ts (pathname for cards); Tovu file is a shim |
| 30 | `05ab227c` | fix(api-connections): emit relative hosted sign-in links | CARRIED | 9d8c30642 → Jini packages/integrations/src/api-connections/connect.ts; Tovu file is a shim |
| 31 | `13b7863a` | fix(admin): report refused card links to the host | KEPT | apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx |
| 32 | `27c750a6` | fix(desktop): keep hosted sign-in hops in isolated windows | KEPT | apps/desktop/src/main/index.ts, apps/website/src/contracts/core/hosted-sign-in-links.ts |
| 33 | `ae3fa1d8` | fix(desktop): restrict sign-in window permissions | KEPT | apps/desktop/src/main/index.ts |
| 34 | `f5d1b789` | fix(theme): a theme with more media than the listing cap still lists its pages | KEPT | apps/website/src/features/theme/theme-files.ts |
| 35 | `11724e87` | fix(admin): Extra large media cards differ from Large at every width | KEPT | apps/admin/src/features/media/rules.ts, styles/media.css |
| 36 | `f8e80e5a` | feat(media): add a thumb rendition for image grids | KEPT | apps/website/src/features/media/bootstrap.ts |
| 37 | `c53c64d0` | feat(agent-plugins): load declared plugin scripts and hosts on public pages | KEPT / CARRIED | Tovu page CSP, export runtime, publish tools KEPT; app.ts/deps.ts/types.ts hunks (embedConsentOff) CARRIED by the merge's conflict resolution |
| 38 | `f3524960` | feat(admin): offer Stop on the serving site card | KEPT | apps/admin/src/features/sites/* , apps/admin/src/lib/api.ts |
| 39 | `791eabb1` | fix(pages): let the assistant edit doc-format pages without losing them | KEPT / CARRIED | pages/tool-registrations.ts, site/render.ts, peer-site-reads.ts KEPT; app.ts/deps.ts/types.ts hunks CARRIED by the conflict resolution |

### Jini (5 commits, `ebc1e0c5..a1a12c24b`)

| # | Jini commit | Subject | Verdict | Where it lives now |
|---|---|---|---|---|
| 1 | `abf089de` | fix(daemon): redact internal nested tool failures in batches | KEPT | packages/daemon/src/tool-executor.ts (untouched by extraction) |
| 2 | `a5299418` | fix(daemon): use host redaction for nested internal failures | KEPT | packages/daemon/src/tool-executor.ts, tool-recovery/* |
| 3 | `956fa6ac` | fix(ui): display refused and rejected outcome link requests | KEPT | packages/ui/src/features/mcp-ui/surfaces/outcome.ts:104 (extraction moved only the spec type to core; the `.then(...isError...)` hunk is intact. The second `openLink` at line 129 is unwrapped on the fixes parent too) |
| 4 | `8cddc73c` | feat(agent-plugins): plugin exports declare scripts, external hosts and a Calendly embed | KEPT (calendly made host-neutral, fix 1) | packages/agent-plugins/src/lifecycle/exports.ts, packages/cms/src/widgets/html/*, packages/agent-plugins/calendly (package.json exports/files merged with both sides) |
| 5 | `a1a12c24` | fix(agent-runtime): valid Gemini schemas for collapsed unions; report silent post-tool turns | KEPT | packages/agent-runtime/src/providers/google-*.ts |

## 2. Fixes (MERGE-CAUSED reds; failing test first, one commit per fix)

| Fix | Red (merged line) | Parent check | Change | Commits | Evidence |
|---|---|---|---|---|---|
| 1 | Jini `plugins-host-neutrality.test.ts` › `calendly loads unchanged in another host`: `expected undefined to be defined` (`manifest.extensions.jini`) | Extraction parent has the test but not calendly. Fixes parent has calendly but not the test. → MERGE-CAUSED | `calendly/plugin.json`: key `tovu` → `jini`. The id stays `tovu/calendly`, so saved embeds still resolve. The skill drops Tovu tool names and the `tovu/calendly` markup. That text moves unchanged to the new Tovu overlay `content/agent-plugin-overlays/calendly/GUIDANCE.md`, with an overlay test written first (red: ENOENT). The `bundled-package.test.mjs` pin of `"plugin":"tovu/calendly"` moves to that overlay test. | Jini `8f330f4a`, Tovu `5b4728b1` | `fix1-red-host-neutrality.txt` (1 failed/35), `fix1-red-tovu-overlay.txt`; green `fix1-green-host-neutrality.txt` (35/35, calendly node:test 4/4), `fix1-green-tovu-overlay.txt` (2/2), `fix1-green-tovu-overlay-unit.txt` (overlay single-copy + overlay units 53/53) |
| 2 | Tovu `extract-s8-c2p2-host-inputs.test.ts` (4 reds) and `extract-s8-c2p2c-ports.test.ts` (1 red): `projectKeys.listChoices is not a function`, then the old-entry hash pins, then `Cannot read properties of undefined (reading 'dismissed')` | Pass on the extraction parent. Neither file exists on the fixes parent. → MERGE-CAUSED | Test-only changes. The shared fake `ProjectKeysPort` gains `listChoices` (8beb8b93 added it to the port, and the picker reads it). The acme host gets the host words 9d8c30642 made required (`outcomes`, `emptyCardDescription`, `lockedLabel`). A dismissed answer now expects `{granted:false, reason:'dismissed', message}`. `copyCard` and `copyDescriptors` are re-recorded: `cdf8d669…`→`cb44d9f7…` and `b2a05ee1…`→`2c672a02…`. `createCard` and `credentialDescriptors` are unchanged. The copy card and descriptors were dumped on the extraction parent and on the merged line. They differ only by 0b05623b's card description and tool description (`fix2-copy-card-diff-ext-vs-head.txt`). | Tovu `c91aa56d` | red `fix2-red.txt`; green `fix2-green.txt` (29/29 with `credential-copy-tool.test.ts`) |
| 3 | Tovu `a10b-connect-seam.unit.test.ts` › `R4 other host…`: `+ 'show:/widget'  - 'show:https://idp.test/widget'` | Passes on the extraction parent. The file does not exist on the fixes parent. → MERGE-CAUSED | The pin now reads `show:/widget`. Cards get the same-origin path from caaa3ee4, carried by 9d8c30642. | Tovu `f6f85e8a` | red `fix3-red.txt`; green `fix3-green.txt` (57/57 with `connect-tool.unit.test.ts`) |

No production code changed in Tovu. No Jini package imports another package; fix 1 touches only plugin content.

## 3. Gates

Jini (linked into Tovu via `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini`):
- `pnpm install` exit 0; `pnpm --no-bail -r build` exit 0, no errors (`jini-install.txt`, `jini-build.txt`).
- vitest `--maxWorkers=2 --minWorkers=1`, for packages touched by the merge, 9d8c30642 or the fixes:

  | Package | Result |
  |---|---|
  | agent-plugins, before fix 1 | 2 failed / 1667 passed / 2 skipped |
  | agent-plugins, after fix 1 | **125/125 files, 1669 passed, 2 skipped**, exit 0 |
  | agent-plugins content | **1410/1410** |
  | integrations | **96 files, 2015 passed** |
  | daemon | **206 files, 4055 passed**, 1 skipped |
  | ui | **655 files, 8918 passed** |
  | cms | **329 files, 3985 passed** |
  | agent-runtime | **186 files, 4297 passed**, 1 skipped |

  The two agent-plugins failures before fix 1 were the calendly red (fix 1) and `folder-zip-node.test.ts` › `local folder collection bounds directory entries as well as files`, a 5000 ms timeout while 3 other jobs were running. That test passes alone in 876 ms (`jini-agent-plugins-folder-zip-rerun.txt`) and in the full post-fix run, so it was load, not the merge.
- `pnpm check:cross-package` with `JINI_DECLARATION_BASELINE_DIR` set to a fresh snapshot: **"XP1–XP5 clean"**, exit 0. The snapshot is a clean clone at `35c4961af718…`; install 0, core build 0, recursive build 0, `--write-baseline` gives "3308 source mappings", the same count as X2-G (`xp3-snapshot.txt`, `jini-cross-package.txt`).
- `pnpm guard`: exit 1 with **2 violations, both expected**:
  - R10-chatpane-public-surface `packages/chat/src/react/features/chat-pane/components/ChatPane.tsx` imports `Icon` from outside the public barrel. PRIOR.
  - R13-model-fallback-freshness `packages/agent-runtime/src/defs/claude.ts` is missing `claude-fable-5-2` from the live picker cache. ENV.
  - Hardwiring: all "0 new" (`jini-guard.txt`).

Tovu:
- `npm ci` exit 0 (`tovu-npm-ci.txt`). npm skipped install scripts, so `npm rebuild better-sqlite3 argon2 esbuild` was run; both native modules load. `apps/admin` needed its own `npm ci` (exit 0). `@tovu/sdk` built before `link:jini`; link exit 0.
- `typecheck` (root + e2e): **exit 0** (`tovu-typecheck.txt`).
- lint `biome lint . --max-diagnostics=none --diagnostic-level=error`: **600 errors**, the same as 600. The per-file/per-rule key diff against X2-G's `gate-tovu-lint.txt.keys` is empty, so **0 new** (`tovu-lint.txt`, `.keys`, `tovu-lint-perfile-vs-x2g.txt`).
- Tool-metadata golden: SHA-256 `a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6`, **unchanged**; `tool-metadata-projections.test.ts` 4/4 (`tovu-tool-metadata-golden.txt`). 0b05623b did change the `credential_copy_from_project` description and card text. Those bytes are outside the golden; fix 2 pins them.
- Test selection (`selected-tests.txt`, 250 files, the cap): 25 test files changed by 8bdbb7574 or the 39 commits, then tests importing a file changed by 8bdbb7574 or by the 3 Tovu shims of 9d8c30642's bodies, ranked by path distance to the changed file. 545 importers were found; the cut fell at distance 2. Results:
  - website, node:test `--test-concurrency=1`, 164 files: before fixes **2290 tests, 2269 pass, 16 fail, 5 skipped**; after fixes **2290 tests, 2274 pass, 11 fail (all PRIOR, below), 5 skipped** (`tovu-tests-website.txt`, `tovu-tests-website-after-fix.txt`).
  - admin vitest `--maxWorkers=2`, 85 files: **85/85, 1359 passed**. Vitest 4 rejects `--minWorkers`, so the first try exited with `Unknown option`; `tovu-tests-admin.txt` is the rerun.
  - desktop `window-navigation-policy.test.ts`: **31/31**. The root has no `build:preload`, and this test does not need the preload build (`tovu-desktop-preload.txt`).
  - all overlays `content/agent-plugin-overlays/**/__tests__` (node:test): **446 tests, 445 pass, 1 fail** (U1, PRIOR, below) (`tovu-overlay-tests.txt`).

### PRIOR reds (listed only; same title and assertion on a parent, see `reds-on-ext.txt`, `reds-on-fix.txt`, `reds-detail-*.txt`)

| Test | Fails on | Note |
|---|---|---|
| `render-form-layout.test.ts`: a successful contact form is hidden by the emitted stylesheet in a browser; contact form fallback error and success colors apply in both modes without theme tokens; checkbox fields render inline before their label with only the emitted stylesheet | both parents | browser-based layout tests |
| `app-federation-reload.observability.test.ts`: a roster change after createApp traces the agent daemon's federation reload with RouteDeps.observability | both parents | |
| `connect-tool.api-connections.unit.test.ts` (4): a declared API connection connects through the real host…; API sign-in displays only the declaring plugin oauth card copy; a failed connected-card update never turns a real connection into a tool failure; with no poll interval or wait bound configured… | fixes parent (same assertions) | These pin the absolute sign-in URL. 05ab227c changed it on the localhost line without updating them. They pass on the extraction parent. |
| `api-connection-slice.test.ts` (2): vertical slice: connect -> public callback -> plugin access token -> form-delivery credential; security: a form-delivery credential stays on the job's frozen account… | fixes parent (same assertions) | same cause (05ab227c) |
| `surface-adapters.security.test.ts`: workspace: every connection-ref operation names the port's workspace… | fixes parent (same assertions) | same cause (05ab227c) |
| overlay `google-login/__tests__/exports.test.mjs` › U1: every bundled public export template passes the single CMS fragment validator (`executable or unsupported widget element`) | fixes parent (`u1-on-fixes-parent.txt`) | The fixture passes no `url` prop to calendly's iframe export. On the merged line it was hidden until fix 1, because U1 reads `extensions.jini` and calendly still used `extensions.tovu`. |

## 4. Last green pair

Tovu `f6f85e8a` + Jini `8f330f4a`: the build, typecheck, cross-package and post-fix test runs above. Remaining reds are only the PRIOR list, plus guard R10 (PRIOR) and R13 (ENV).

## Commits pushed

- Jini `cloud/localhost-1109`: `8f330f4a` fix(agent-plugins): calendly ships host-neutral like every bundled plugin
- Tovu `cloud/localhost-1109`: `5b4728b1` calendly overlay; `c91aa56d` extract-s8 pins; `f6f85e8a` a10b pin; then the report commit.

LAND-1109-G DONE
