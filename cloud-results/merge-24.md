PARTIAL T 01582000b0 J 4e5de358 | FILES LEFT 975/447 | left: desktop `npm run gates` tests/coverage gate intermittently red inside check-gates only (suite 2174/0 + 739/0 in 8 direct runs); typecheck:tests 37 errors left in changed files (600 total); sheet 14 (Jini PluginProviderSettingField unprefixed classes); sheets 18/21 (Jini R01.CHAT.J / R01.USER-MANAGEMENT.J absent); p11rest T1–T3 + T-e blob journal (J1 remainder, OQ-11a); T4c/T5b real binders (G1–G3 hold); T6 backups/held-copy listing, Tidy, two-window cases; T8 packaged Mac run; ext-w1 T11 permanent-delete half (Jini J12 registrar absent); T-GATE retirement steps 1–3 + J3a/J3b (Jini, now unblocked by T-GATE)

# MERGE-24 continuation — Tovu side (2026-11-26)

Unattended cloud run on Tovu `integ/merge-24-2026-11-25`. Opus coordinated at high effort. It read `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.5) first. 12 Opus-high subagents in total, at most 4 alive at once, each in its own git worktree. No codebase-memory tools, no RemoteTrigger, no `--no-verify`, no force-push, no tag or publish. `main`, `release/*` and merge-23 were not touched. Jini was not pushed.

**Start:** merged `origin/integ/merge-23-2026-11-25` into merge-24 (`e2860ed3`; brought in `9029c8d42e` GitHub rename-upgrade test and `685039d820` desktop S2 hermetic fix). No conflicts.

**Environment:**
- Node 22.23.5 (the repo pins 24): `RegExp.escape` reds are ENV.
- Jini `pnpm install` + `pnpm -r build`. Tovu `npm ci --ignore-scripts --legacy-peer-deps` in root/admin/desktop/site-chat (contracts `prepare` suppressed during install only, then restored), then `link:jini` and contracts + sdk build.
- Local Postgres 16 started (socket `/tmp`, role `la`): the `*.postgres.test.ts` reds in the earlier run were ENV.
- A merge-23 baseline (Tovu `merge-23` + Jini `2c2961d5`, both built and linked) was set up so every red file could be re-run on merge-23 for NEW-vs-old triage.
- **End:** relinked to the parallel Jini run's latest tip `4e5de358` (built in a separate worktree), rebuilt contracts/sdk, re-ran every red once (below).

## Pushed commits (Tovu `integ/merge-24-2026-11-25`)
Coordinator: `e2860ed3` (merge-23), `5087e8fd` (mail dialects), `ead627cb` (migrated-copy pin), MCP-UI allowlist carve-outs, `eba26954`/`87932607` (node_modules symlinks untracked, `.gitignore` hardened), `1aedad36`, `757229e5`, `bf9eaed9` (T-GATE/actor test fixtures), open-bugs, this report.
Merged subagent branches (all on origin): `wip/merge-24c-t4t5` (`6f7babf4`, `66ab6ecb`), `-arch` (`3c724537`, `b3284ae6`), `-tgate` (`f16b207e`…`0d987bb0`), `-arch2` (`92ec058b`…`cfd332c9`), `-mut` (`bc70f6fa`), `-t6` (`06a8fc79`…`3b55eeb5`), `-t8` (`e3cbb715`, `1a80e006`), `-t6b` (`6c834000`, `fb603c5e`), `-reds` (`868cd13e`…`04aa10c1`), `-tsc` (`4f182900`…`c9cdf6e9`), `-ta` (`77a1cdf3`, `12b84e74`), `-tc` (`851b264f`), `-td` (`f380e736`, `8e63a8ff`, `e37d4ccb`).
Not merged (on origin): `wip/merge-24c-arch-s14wip` / `wip/merge-24c-arch2-s14` (sheet 14, 5 red, Jini bug).

## Continuation items

| item | status | evidence |
|---|---|---|
| 3. website changed-test run | **done, triaged** | 645 changed test files, per file, concurrency 3, ≤300 s each: 581 green / 64 red files, 7333 pass / 186 fail, no timeouts. Plus 224 *unchanged* route-mounting test files (T-GATE fallout sweep): 201 green / 23 red, none from T-GATE. Every red file re-run on merge-23: all NEW tests fixed (list below). Final re-run on Jini `4e5de358`: 79 candidate files → 71 red / 224 failing tests, **0 NEW** after T-a (every remaining failing test name is also red on merge-23). |
| 5. typecheck:tests | **partial** | 761 → **600** total; changed-file errors **188 → 37** (previous report's 780/207 was at an older tip). Mail dialects (52) fixed by typing the kernel as `ContentKernel` (the Jini repos were already generic). Left: `library-share.integration` 5, byok `inputs-pin`/`early-disconnect`/`run-usage` 9 (NewsletterRouteDeps shape), `admin-mount-opt-ins` 4, `retention.test` 3, a few singles. |
| 6. H2 migration tests | **done** | 56 files in `platform/db/migrations/__tests__` + `features/post/__tests__/repo.rows.test.ts`: 209 pass / 6 fail. NEW 1 (`migrated-copy` still pinned 50 ledger rows; now 51 with `0050_ledger_actor_kind`), fixed. Old (identical on merge-23): `checksums` ×2 (0002 chat, 0012), `runner.postgres` ×2, `postgres-baseline`, `chat-package-adoption`. `ledger-actor-kind-step`, `no-vacuum` green. `UPDATE_DATABASE_TYPES=1` regenerate: `content-database.generated.ts` already current (no diff). |
| 7. desktop `npm run gates` | **not green (flaky)** | 4 full runs: tree-quiet, typecheck, complexity (254 files 9/9, 0 new), js-backslide always PASS. Run 1 coverage FAIL (under a concurrent Jini build), run 2 coverage FAIL, runs 3–4 **tests** FAIL with coverage PASS. The same suites outside the runner: 8/8 runs green (node 2174/0, tsx 739/0), including the exact coverage args and an exact `spawnSync("npm test", {shell, stdio:[ignore,pipe,pipe], maxBuffer:1e6})` replica (status 0, 717 KB stdout). Failure only reproduces inside `check-gates.ts`; root cause not found. |
| 8. p4mounts T-GATE | **built** | `errors: RouteErrorPorts` required on the 4 wrappers + startup guard `requireRouteErrors`; ~42 unbound mounts bound (forms, integrations-admin, all publish-content registrars, publish-site, external-MCP OAuth/probe, plugin install, mail feedback, site-assistant confirm, analytics ingest, newsletter, SEO documents); 140 test mounts bound. Closure tests + mutations `allow-unbound-wrapper` and `reuse-reporter-from-other-site` red→green. Website tsc 0. Left: retirement gate steps 1–3 (OriginContext repoints), then Jini J3a/J3b. |
| 8. p11rest T4c | **built, dark** | `cli/commands/storage-program.ts` (program.ts 345→306 lines); `compact` + `--resume`/`--resolve restore-copy\|keep-current` registered only with a binding (none bound). 14/14; mutation `M7b-register-compact-unbound` red. Left: the real compaction binder (G1–G3). |
| 8. p11rest T5b | **built, disabled** | Own free-page schedule in `retention.ts` + shutdown drain; `serving-app.ts` `optional.dbFreePages` unset. 11/11 (owner pin line 87 green); mutation `M7c-enable-global-sweep` red. Left: the real `dbFreePages` binder. |
| 8. p11rest T1–T3 | **left** | Need J1 remainder (journal kind/reason, OQ-11a) — see Jini report T-e. |
| 8. T6 renderer/IPC | **built, dark** | `contracts/storage-sheet.ts` (`STORAGE_SHEET_ENABLED = false`), preload named channels, `StorageSheet.tsx` (required `useStorageSheet`), main binding with exact sites-home main-frame check, real sources (`storage-sheet-sources.ts`: strict list, J3 `listAmbiguousPartitions`, report CLI, OS Trash checks). Confirmed-removal race against the real Jini interlock: test added (`desktop-partition-pass.test.ts` 8/8). Mutations `M18-trust-renderer-target`, `M18-entry-visible-when-dark`, `M18-list-deletes`, `M18-skip-fresh-claims` red. Left: backups/held-copy listing, Tidy (T7), two-window/updater/profile cases, CSS + Web Design. |
| 8. T8 probe | **built** | `scripts/measure-partition-cache/{main,probe-step,electron-host,packaged-entry}.ts` + `electron-builder.probe.yml` (Electron 43.8.6, own appId) + `probe:partition-cache:package`. 7/7 + verdict 5/5; mutations `M1a-clear-storage-in-place-of-cache`, `M1a-one-partition-is-enough` red. Packaged Mac run is external; `PACKAGED_CACHE_EVIDENCE` stays empty. Note: `scripts/**/*.test.ts` are outside `npm test`'s globs. |
| 8. w3b-arch sheet 27 | **built** | `features/agent-plugins/identity-read-policy.ts` passed at every entry incl. desktop preboot; 12 legacy-fixture test files fixed. Mutations `M-bind-lifecycle-but-not-preboot`, `M-bind-card-parse-but-not-destination-check` red. |
| 8. sheet 14 | **blocked** | Fallback branch, 5 red: Jini `PluginProviderSettingField` emits unprefixed classes (bug logged). |
| 8. sheets 18 / 21 | **blocked** | Jini R01.CHAT.J (no `jini-chat-*`) and R01.USER-MANAGEMENT.J (no `UserManagementClasses`) still absent on `4e5de358`. |
| 8. arch-crp 6 named mutations | **6/6 killed** | 5 red first time; `M-host-queries-retired-table-class` survived a vacuous absence check → test-only fix (`expectLiveSelectorAbsentFrom`), now red. `M-migrate-assistant-as-confirmer` is killed by `tool-registrations.database-recovery.test.ts` (the previous run never ran that file). Gap: `tool-catalog-manifest.ts:549` origin has no witness. |
| Jini report T-a | **built** | Tovu-owned `content-analyzer/plugin.ts` over `createContentAnalyzerPlugin`; trusted imports narrowed to the factory subpath; one documented type-only cast (Jini binding not generic). worker-import-allowlist 17/17. |
| Jini report T-b | **done** (= sheet 27) | |
| Jini report T-c | **built** | Tovu `fs-files/agent-tools.ts` deleted; one host binding `getHostFsFilesAgentToolCatalog()`; catalogs diffed identical before deletion; mutation `M-tc-unbound-catalog` red. ext-w1 T11 permanent-delete half blocked (Jini J12 registrar absent). |
| Jini report T-d | **built** | `apps/admin/src/features/email/email-panel.tsx` over J10; old Tovu Email views deleted; 152/152 email tests; admin tsc 0; mutation (drop `encodeURIComponent`) red. |
| Jini report T-e | **left** | Needs OQ-11a (owner) + J1 remainder. |

## Gates NEW vs old (old = same test name red on merge-23 + merge-23 Jini)
- Website `tsc`: **0**. `typecheck:e2e`: **0**. Admin tsc: **0**. Desktop typecheck: **0**.
- `typecheck:tests`: 600 (merge-24 start 761). 37 in changed files.
- Website changed tests: NEW fixed — `mcp-ui-allowlist-completeness` (new non-exchange opens), `external-mcp-connection-source.operator-read-only` + `manifest.default-tools-read` (sheet 27 policy), `migrated-copy`, `change-set-repo.sqlite`, `blob-share` (vercel overlay), `worker-import-graph` budgets (+2 Jini render modules from CRP, named), `publish-content-manifest` + `library-publish-transport` (trusted actor fixtures), `worker-import-allowlist` (**production bug**), `site-assistant-confirm` (30), `upload-route`, `site-share-failures`, `agent-probe-characterization`, `plugin-contributions` #6. ENV: postgres-socket reds (server now started). Old reds remaining: 71 files / 224 tests, identical names on merge-23 (e.g. `checksums`, `serve-command-wiring`, `tw2-L224-characterization`, member-login providers, fly host-signals, `no-vendor-in-core` #16, upload-route #5).
- Desktop gates: see item 7.

## FILES LEFT (excl. themes; planner / true)
**975 / 447** at `acf3faa8f8` / `01582000b0` (−2 / −2 vs `1b05ab3763` = 977 / 449). Calibrated exactly: 977/449 at `1b05ab3763`, 1060/527 at `fa958cb01`. Left the set: 4 admin Email views, `fs-files/agent-tools.ts`. Entered: `email-panel.tsx`, `identity-read-policy.ts`, `content-analyzer/plugin.ts` (no keep rule matches). Method: `combine-18-plan.mjs` + `plans/P9-data/tools/scan.mjs` + **507** anchored keep rules from `plans/count-1124/*.md` (the "3615" figure in the previous report was not the reproducing set). Top areas (true/planner): adm-other 62/162, public-http 45/84, adm-shell-components 29/46, agent-plugins 29/45, admin-http 28/63, site-backup 27/35, deployments 23/28, post 22/29.

## Bugs
Logged in `development/open-bugs.md` → "MERGE-24 continuation". Highlights:
- **Fixed, production:** the content-analyzer built-in failed to import in tier-2 workers (`import.meta.resolve` under tsx's CJS loader).
- **Fixed, repo hygiene:** a worktree commit tracked `apps/*/node_modules` symlinks and the merge replaced the real installs; untracked and `.gitignore` now ignores links named `node_modules`.
- **OPEN (Jini):** `PluginProviderSettingField` unprefixed classes (sheet 14); `ContentAnalyzerPluginBinding` not generic; fly `plugin.json` lacks `deploymentAdvice`; J12 registrar absent; R01.CHAT.J / R01.USER-MANAGEMENT.J absent.
- **OPEN (Tovu):** desktop gates flake only inside `check-gates.ts`; `tool-catalog-manifest.ts:549` origin unpinned; Storage sheet gaps.

## Continuation (exact)
1. Desktop gates: instrument `check-gates.ts` locally (print the failing child's stdout tail / `not ok` lines on failure) and find the test that only fails under the runner; then `npm run gates` until green.
2. `typecheck:tests`: the 37 changed-file errors (byok NewsletterRouteDeps shape first).
3. Jini (other run): fix `PluginProviderSettingField` prefixes → merge `wip/merge-24c-arch2-s14` and run `M-host-emits-retired-provider-spinner`; land R01.CHAT.J / R01.USER-MANAGEMENT.J → Tovu sheets 18/21; J12 registrar → ext-w1 T11; J3a/J3b now that T-GATE landed (after Opus retirement steps 1–3).
4. Owner: OQ-11a → J1 remainder → Tovu T1–T3 / T-e; G1–G3 → real T4c/T5b binders.
5. Mac: run the T8 packaged probe and review its evidence.
