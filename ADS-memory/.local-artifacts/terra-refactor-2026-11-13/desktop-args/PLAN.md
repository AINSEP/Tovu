# Desktop args batch (apps/desktop): PLAN

Built 2026-11-15 from `integ/wave-b` @ `c6d5b56af` in `/Users/la/Programming/tovu-codex-trial-terra`, extracted with `git archive`, so the files the local splitter is editing do not affect it. Planning only: no repo edits, no tests.

## 1. Headline

- **`args-object-audit.mjs` on apps/desktop:** 2,309 functions. **Exported VIOLATIONS: 0**, 30 exported "unsure", 138 non-exported violations, 198 unsure in total.
  - Terra wave 2 shard d and earlier waves already converted desktop's plain exported functions.
  - What is left is hidden from the audit:
    - "unsure" named-type params (arrays, class instances, two positional objects);
    - functions exported through `export { a, b }` lists, which the audit tags non-exported;
    - Tovu **port/function TYPES**, which the audit never scans. `scan-scripts/ports.cjs` lists 312 such members in `ports-in.txt`.
- **Work items: 127** (`items.tsv`): 97 F (functions; F61–F64 are one CONVERT-TABLE), 26 P (CONVERT-PORT), 4 X (ports, done now).
  - **About 120 files**, all inside apps/desktop (`OWNERS.tsv`: file, lane, items).
  - Nothing outside apps/desktop calls them. The only outside importer is `development/e2e/support/start-journey-site.mjs`, which imports `initSiteDir`/`startTovuServer`; it passes only `spawnFn`, which stays EXEMPT. apps/admin and apps/website import nothing from desktop. Lanes still run the repo-wide AST scan.
- **Callers incl. tests:** `callers.tsv`, from `scan-scripts/callers.cjs` (AST, alias/namespace/by-reference aware). Summary per item: `node scan-scripts/callers.cjs <root> items.tsv out.tsv development/e2e/support/start-journey-site.mjs`, about 3 s.

## 2. Classification rules (batch-1 precedent, A-46 "Target shape", applied as-is)

**Shapes to use:**
- Required object first, `optional = {}` second.
- No-required shape: `(_required: Record<string, never> = {}, { … } = {})`.
- Never `_optional?: Record<string, never>`.
- Keep `= {}`; extract a helper if complexity would pass 10.

**Already done (no edit):** a single param whose type is an interface/alias of the function's inputs or deps. Desktop examples:
- `violationKey(violation)`, `databaseLabel(project)`, `deleteActionCopy`, `loadResetKey`, `allLayoutClaimsHold`, `treeQuietProblems`, `describeRejectedDefault`, `resolveNpmLsCommand`, `buildDefaultPort`;
- `createWorkspaceChatTransport(bridge)`, `openFirstSite(app)`, `readGuestZoom`, `selftest add(window: SelftestWindow)`, `bind(updater)`;
- runner-controller single-`core` helpers;
- callbacks typed `(current: ProjectsFile)`;
- `loadOrRemount.load(target)`.

**CONVERT:** arrays, scalars and unions, class or platform instances (`Page`, `BrowserWindow`, `File`, `Dirent`, `ReactElement`, `RefObject`, `Dispatch`), and any 2+ positional params. Two required objects merge into one required object.

**EXEMPT (no edit; owner's list plus precedent).** Each row of `ports-in.txt` / `audit.json` that is not in `items.tsv` falls in one of these:

| class | desktop examples |
|---|---|
| Electron-dictated | `ipcMain.handle/on` listeners, `.on/.once/.off/removeListener`, `webContents.send`, MenuItem `click(item, window)`, `loadURL/loadFile`, `setWindowOpenHandler`, `replaceMisspelling`, `onBeforeSendHeaders`, `showErrorBox`, `conflictHandler`, `crashReporter`, `dock.setIcon`, `denyDownload(event)` |
| Built-in-signature slot (T-a18 Storage precedent) | `out/err = process.stdout.write.bind`, `exists = existsSync`, `writeFile`, `readDirectory`, `spawn/spawnSync/Init/List/ImportSpawn`, child `once`, `GateFs`/`SeedFs`/`VerifyPackageFs`/`WritableTreePort`, `setTimeout/delay`, `stdout.write`, `fetch`, `cpSync filter`, `warn/report = console.warn`, `removeDir = fs.rmdirSync`, `pathExists`, `readText/readDir/readFile` defaults, `ZoomStorage getItem/setItem`, `Writable.write`, `Log(...args)`, Map-shaped `SiteSupervisor`/`OpenSitesPort`/`openSites get/set/has/delete`, `ProbeRequestFn` (http.request), `ExecPort` |
| DOM | `addEventListener`, `getElementById`, `clipboardData.getData`, EventSource, `onKeyDown/onSubmit/onDrag*/onEscape` event handlers, ErrorEvent handlers |
| React | component callback props (`onOpen`, `onDelete`, `onSiteUpdated`, `onSelectTab`…), ref callbacks (`guestRef`, `inputRef` node), `useState` setters (`setOpen`, `setDraft`, `setName`), reducers `(state, action)`, hook functions bound by reference to props (`select/remove/rename/onMessagesChange`, `setAddress`, `refuse`, `prefill`, `onRefused`, `onStarted`, `onLocated`, `registerGuest`/`registerLiveGuest`/`registerZoomGuest`, `selectSection`, `useApplySiteRecord`'s returned fn), test-harness React mirrors |
| Jini contract | `ChatTransport` (`open/startRun/reattachRun/fetchRunStatus/stopRun`), `ChatPaneWorkingDirectoryAccess`, `useAsyncAction` `describeError`, `startRenderBridge` `captureUrl`, node-toolchain `isReadOnlyVolume`, desktop-mcp-http `warn`→Jini, `lifecycle.stream` `onEvent`, `host.subscribe` listener |
| Type guards / assertion fns | `isSmallMap`, `validBytes`, `isWholeViewCount`, `isRecord`, `record`, `isProjectsShape`, `isMediaBlock`, `assertManifest` |
| IPC bridge surface (preload contextBridge, also consumed by apps/admin) | `preload.mts` bridge fns, `getPathForFile`, bridge event listeners (`onMaximumLiveSiteViewsChanged`, `onFindResult`, `onZoomCommand`, `onNavigate`, `onSiteHistory`) |
| Other | Promise `.then(commit)`, module loader `resolve` hooks, `globSync exclude` |

## 3. Work items (ids → `items.tsv`; callers/files → `callers.tsv`)

Tests are counted inside "files". **BYREF** means the function is passed by reference somewhere: wrap it at that site (`(x) => fn({ x })`) or convert the slot type with it.

### Lane R1: renderer, sites grid and site hooks (31 files, 15 tests)

| id | function (file) | action | callers (files) | note |
|---|---|---|---|---|
| F10 | `siteCardTone` (renderer/SiteGrid.hooks.ts) | CONVERT | 2 | |
| F11 | `closeMenuThen` return `(act)=>…` | CONVERT (return type) | 2 | `choose({ act })` |
| F13 | `useSectionNav(setActiveTab)` | CONVERT | 1 test | |
| F14 | `useSiteListPrefs(storage = windowStorage)` | CONVERT → `(_required = {}, { storage } = {})` | 3 | BYREF: default slot `useListPrefs = useSiteListPrefs` in SiteGrid: **keep the injection** (P2 lesson) |
| F15 | `powerControl(status, {external})` | CONVERT | 5 | also `use-tab-close-ask.hooks.ts` |
| F16 | `useSiteRescan(setProjects, {getBridge})` | CONVERT | 1 test | |
| F17 | `useApplySiteRecord(setProjects)` | CONVERT (param only) | 1 test | the returned `(record, previousId?)` stays (bound to the `onSiteUpdated` prop) |
| F18 | `countRunningSites(projects[])` | CONVERT | 1 test | |
| F19 | `trackGuestNavigation(guest, dispatch)` | CONVERT | 2 | |
| F58 | `showAddedSite(added, {…})` | CONVERT (merge) | 1 | |
| F59 | `mergeAddedSite(current[], added)` | CONVERT | 3 | `export {}` re-export in use-add-site |
| F60 | `refValue(ref)` | CONVERT | 1 | |
| F73 | `titleCase(pluginId)` | CONVERT | 1 | BYREF `.map(titleCase)`: wrap |
| P1 | `SitePower.errorOf(id)` | CONVERT-PORT | 6 | ResourcesPanel hit: check it is the same type |
| P2/P3 | `SiteLocate.errorOf(id)`, `locate(id)` | CONVERT-PORT | 4 | |
| P4 | `UseAddSite.addDroppedFolder(folder)` | CONVERT-PORT | 2 | the `onDropFolder` prop stays positional; wrap in App.tsx |
| P5/P6 | `CreateSitePluginTokens.inputRef(pluginId)`, `withTokens(onCreate)` | CONVERT-PORT | 4 | the returned ref callback stays |
| P8 | SettingsControl `save(next)` | CONVERT-PORT | 2 | |

### Lane R2: renderer chat, harnesses, main chat IPC (25 files, 13 tests)

| id | function | action | callers | note |
|---|---|---|---|---|
| F3 | `sectionsInGroup(group)` | CONVERT | 1 test | |
| F12 | `persistableMessages(messages[])` | CONVERT | 2 | |
| F39 | `addresseeForStart(input, resolve)` (workspace-chat-ipc) | CONVERT (merge) | 2 | |
| F44 | harness `key(el, init)` (app-render-harness) | CONVERT | 5 (4 tests, 29 calls) | |
| F45 | harness `render(next)` (component-harness) | CONVERT | 4 (3 tests) | |
| F46/F47 | `attachmentKind(file)`, `pairFileItemsWithFiles(items[], files[])` | CONVERT | 1 each | |
| F48–F56 | runner-conversation-controller `publish`, `withConversation`, `commitSelection`, `rename`, `flush`, `saveMessage`, `claimAdoption`, `adoptConversation`, `afterAdoption` `(core, …)` | CONVERT (merge into `{ core, … }`) | same file | match the file's existing `remove({ core, id })` |
| F57 | `toolPath(kind)` | CONVERT | 1 | |
| F61–F64 | `PayloadTranslator` table + `translateToolUse/InputDelta/Result`, `translateAgentPayload` | CONVERT-TABLE | same file | BYREF `as PayloadTranslator`: convert every table entry |
| F65–F68 | `applyAgentEvent`, `applyRunEndEvent`, `applyRunEvent`, `toChatRunStatus` | CONVERT | same file | |
| P7 | `resolvePending(confirmed)` | CONVERT-PORT | 2 | |
| X1–X4 | `DesktopChatMainDeps.revealPath`/`broadcast`/`readSiteName` (+ `resolveTrackedAddressee` ports), `WorkspaceChatIpcDeps.pickDirectory` | CONVERT-PORT | 5 (3 tests) | BYREF pass-throughs (`readSiteName: deps.readSiteName`, `pickDirectory: deps.pickDirectory`); `pickDirectory` → `(_required = {}, { currentDirectory } = {})`. desktop-agent.ts only mentions these in a comment |

### Lane M: main process, windows, policies (34 files, 14 tests)

| id | function | action | callers | note |
|---|---|---|---|---|
| F36 | `applyGuestWebPreferences(webPreferences, options)` | CONVERT | 3 | |
| F37/F38 | `installAppWindowNavigationPolicy` / `installSitesHomeNavigationPolicy(contents, options)` | CONVERT | 3 each | |
| F40 | `summarizeAgent(def, ports)` | CONVERT | 2 | |
| F41/F42 | `navigateTool(navigate)`, `sitesKeyOf(sites[])` | CONVERT | 1 each | |
| F43 | `trackAppWindow(window: BrowserWindow)` (main/index.ts) | CONVERT | main only | BYREF `trackWindow: trackAppWindow` ×2: wrap |
| F69–F71 | `onNameRow(name, menu)`, `release(sender, owner)`, `trusted(sender)` ×2 | CONVERT | same file | |
| P9+P10 | `StartupSiteDirPorts.pickDir(rejectedDefault)` + site-dir-store `PickDirFn` (one unit) | CONVERT-PORT | 4 | BYREF `pickDir: ports.pickDir`; impl main/index.ts:739 |
| P11/P12 | `isTrustedSender(senderUrl)` (import-handoff-ipc, speech-ipc) | CONVERT-PORT | 3 / 4 | impls main/index.ts:838/847; removes the speech-ipc adapter |
| P13/P14 | `openExternal(url)` (`AppWindowPolicyOptions`, sites-home options), `ShellPages.isSupervisedSite(url)` | CONVERT-PORT | 9 / 3 | generic name: edit only the types in window-navigation-policy; guest-navigation already uses `({ url })` |
| P15/P16 | `GuestSourceOptions.isAllowedSource(src)` + `SitesHomePorts.isSupervisedGuestUrl(url)` | CONVERT-PORT (together) | 3 / 3 | BYREF `isAllowedSource: ports.isSupervisedGuestUrl` |
| P17–P21 | `MovePromptDeps.readExistingVersion`/`openExisting`/`showError`/`showInfo`/`move` | CONVERT-PORT | 2 | wired in main/index.ts ~1074; `conflictHandler` stays (Electron) |
| P22/P23 | `SpellCheckMenuHandlers.replace(word)` / `addToDictionary(word)` | CONVERT-PORT | 3 / 2 | |
| P24 | `AutoUpdateControllerDeps.isAlive(pid)` | CONVERT-PORT | 2 | removes the adapter at auto-update-controller.ts:39 |
| P25 | `removeSiteTree` optional `remove(entry)` | CONVERT-PORT | 2 | the project-ipc.ts hits are other `.remove` members; never edit project-ipc |

### Lane T: gates, scripts, staging (30 files, 9 tests)

| id | function | action | callers |
|---|---|---|---|
| F1/F2 | `diffAgainstBaseline(baseline[], current[])`, `countByKey(violations[])` | CONVERT | 2 / 1 |
| F4–F7 | coverage-floors `runnerSplitDrift`, `formatArea`, `unionAxis`, `countedEntries.keyOf(m)` slot | CONVERT / CONVERT-PORT (local) | 2–3 |
| F8 | `jsBackslideOffenders(paths[], allowlist=[])` | CONVERT | 2 (15 calls) |
| F9 | `formatSummary(gates[], outcomes)` | CONVERT | 2 |
| F32–F35 | `gitDirtyProblem`, `movingProblem`, `unionFiles`, `onlyIntelZip` | CONVERT | same file |
| F72 | `rawFrames(events[])` | CONVERT | same file |
| F74–F82 | scripts: `toRepoRelative`, `warnForeignImages`, `rootFromArgv` (exported via list; test), `snapshotsDiffer`, smoke-native ×4, `sharedImports` | CONVERT | 1–2 |
| F83–F97 | `verify-find-in-page.ts` ×6, `verify-site-power.ts` ×9 `(win: Page…)` | CONVERT | same file |
| P26 | `withInterruptSignal` `run(signal)` | CONVERT-PORT | 2 |
| **T-hold** F20–F31 | `resolveTargets(env, host)`, `prebuildServesTarget`, `isWalkable`, `stagePayloadCli({argv, desktopDir}, ports)` (merge ports into required), stage-payload-run `(layout, ports)` ×8 | CONVERT | 4 |

**T-hold note:** the live tree `/Users/la/Programming/Tovu` has uncommitted edits in `stage-payload-lib.ts`, `stage-payload-run.ts` and `stage-payload-run.test.ts` (desktop release work). Run F20–F31 **last**, as a separate commit. The coordinator may drop that commit to avoid a merge conflict with the release; the rest of lane T does not depend on it.

## 4. Follow-ups (not this batch)

- **The 4 files being split:** `desktop-agent-service.ts`, `desktop-agent.ts`, `project-ipc.ts`, `tovu-server.ts`. After the split lands, re-run the audit plus `ports.cjs` on the new files. Their audit rows today are all EXEMPT-shaped (Jini `createDaemonSupervisor`/`createToolGapCollector`/`createNodeIpcChannel`/`exitSignal` callbacks, `change(current)` already done). project-ipc also has `(input, deps)` two-required-object handlers (`handleCreate`, `handleCreateInto(deps, siteDir, id)`, `buildSiteRecord(row, deps)`), which need converting there.
- **Owner call:** `(required, requiredDeps)` two-required-object shapes, such as `startDesktopChat(deps, optional)`, which is fine, versus `handleCreate(input, deps)`. The audit counts them as ok. Batch 1 left them. Not included here.
- **Test-support `site(id, fields)`** in `renderer/app-hooks.test-support.ts`: the audit skips `.test-support`. Left alone.
- **Audit gap to fix later:** `args-object-audit.mjs` does not tag `export { a, b }` lists as exported and never scans type members. Add `ports.cjs`-style member scanning before trusting "0 exported".

## 5. Lanes

- Four lanes, file-disjoint by construction (`OWNERS.tsv`, 0 overlaps), run in parallel in `tovu-codex-trial-terra`.
- Executor: **Sonnet 5.5 high**, one agent per lane. Each lane is about 60–110k tokens, so no lane should need a handoff.
- A file not in OWNERS.tsv: claim it with an atomic `mkdir` under `desktop-args/claims/<path with / as _>` (lane letter in `lane`), same as batch 1. A file owned by another lane: append to `desktop-args/deferred/from-<lane>.tsv`. After all lanes finish, one short P2 agent applies the deferrals. Expected: none.
- Never edit the 4 excluded files. A needed edit in one of them goes to `deferred/excluded.tsv` and the item is reported as skipped "FOLLOW-UP".

### Exact steps per lane (put them in each brief verbatim, after the 300k clause)

1. **Record your base:** `BASE=$(git -C /Users/la/Programming/tovu-codex-trial-terra rev-parse HEAD)`. Write it at the top of `desktop-args/handoffs/lane-<L>.md`.
2. **AST caller scan BEFORE** (read-only, about 3 s):
   - Run `awk -F'\t' '$2=="<L>"' desktop-args/OWNERS.tsv` to get your files.
   - Build your items with `grep -E '^(<your ids>)\t' desktop-args/items.tsv > <scratch>/items-<L>.tsv`.
   - Run `node desktop-args/scan-scripts/callers.cjs /Users/la/Programming/tovu-codex-trial-terra <scratch>/items-<L>.tsv <scratch>/callers-<L>.tsv development/e2e/support/start-journey-site.mjs`.
   - Then `rg -n "\bNAME\b" apps packages development content scripts -g '!**/node_modules/**' -g '!**/dist/**'` for every exported name.
   - Every `call`, `BYREF`, `export`, `m-call`, `m-BYREF`, `impl`, `type` and `destructure` row (member rows: `imp` only, unless the code proves it is the same type) is a site you must handle.
3. **Convert, per the batch-1 A-46 recipe:**
   - **CONVERT:** rewrite the signature, then every call.
   - **CONVERT-PORT:** change the type, then every implementation (including test fakes), then every invocation, together.
   - **CONVERT-TABLE:** change the table type and every entry.
   - **BYREF:** wrap at the reference.
   - **No-required shape:** `(_required: Record<string, never> = {}, { … } = {})`.
   - **Never** `_optional?:`. Keep `= {}`. Move JSDoc `@param`. Never delete a "why" comment.
   - **Never strip a test injection or default slot** (P2 lesson).
   - **Production impl is a built-in/Electron/DOM/Jini function by reference:** STOP converting that item and report it as EXEMPT with the reason.
4. **eslint** your touched files: `npx eslint <files>` from the repo root, at most about 40 per run. Fix the complexity limit (≤10) and the size limits (50 warn / 80 error) by extracting a helper. Never use `eslint-disable`.
5. **Desktop type-check of touched projects only, no emit:** `cd apps/desktop && npx tsc -p tsconfig.main.json --noEmit`, plus `tsconfig.renderer.json` for R1/R2 and `tsconfig.preload.json` only if preload changed (it should not). Cap: one tsc at a time machine-wide. If it can't run (load or memory), skip it and say so; the cloud gate covers it.
6. **Commit** `git -C … commit -F <scratch msg> -- <your paths>`:
   - subject `refactor(args): desktop <L> …`;
   - Sonnet co-author line;
   - never `add -A`, stash, checkout, reset or push.
7. **AST scan AFTER** (read-only, about 80 s):
   - `cd /Users/la/Programming/tovu-codex-trial-terra && BASE=<step-1 sha> OUT_DIR=<scratch> node /Users/la/Programming/Tovu/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/desktop-args/scan-scripts/conv.cjs && OUT_DIR=<scratch> node …/scan-scripts/scan.cjs`.
   - **Expect `high` = 0.** Triage every `byref` and `spread` row that points at your items.
   - Fix, commit again, re-run until clean.
   - Re-run `callers.cjs` with the same items: every old-shape call must be gone.
8. **Report** in `handoffs/lane-<L>.md` and as your message:
   - items converted / EXEMPT-on-inspection / FOLLOW-UP;
   - files; eslint and tsc results; after-scan counts; SHAs;
   - bugs seen. Log bugs to `development/open-bugs.md` (local only).
9. **No tests run by lanes** (owner rule: fixers run no tests; one batched cloud or central run after all lanes). Leave no process running.

## 6. After the lanes

1. One **Opus check**, a single batched reviewer:
   - re-run `conv.cjs`/`scan.cjs` across `<first base>..HEAD`;
   - re-run `args-object-audit.mjs` (desktop exported VIOLATION must stay 0) and `ports.cjs` (only the EXEMPT classes in §2 may remain);
   - sample-read the BYREF wraps and the T-hold commit.
2. **Desktop test suite**, scoped, through the central test lock or the cloud: `npm --prefix apps/desktop test`, which needs `build:preload` first, and `npm --prefix apps/desktop run gates`.
3. **Packaged-desktop check (release gate, memory: "fixed = PACKAGED app").**
   - Main-process (M), staging (T-hold) and renderer (R1/R2) changes all ship in the packaged app. A wrong by-reference wrap fails silently: the window-open policy (`openExternal`/`isSupervisedSite`), the trusted-sender guards and the move-to-Applications prompt only run packaged.
   - Before the next desktop release, run:
     - `npm --prefix apps/desktop run package`, which already runs `verify-package`, `smoke-native` and `smoke-bridge`;
     - `smoke:packaged-chat`;
     - one manual pass in the packaged app: open a site, external link → browser, import handoff, spellcheck menu, Settings save, find-in-page.
   - Release only after that. This batch does not trigger a release by itself.

## 7. Token estimate

| step | agent | est. tokens |
|---|---|---|
| R1 (20 items, 31 files) | Sonnet 5.5 high | ~110k |
| R2 (30 items, 25 files, 3 dense same-file groups) | Sonnet 5.5 high | ~90k |
| M (27 items, 34 files, main/index.ts hub: read by range) | Sonnet 5.5 high | ~110k |
| T (50 items, 30 files, most same-file) | Sonnet 5.5 high | ~80k |
| P2 deferrals (likely none) | Sonnet | 0–20k |
| Opus check | Opus | ~120k |
| **Total** | | **~0.5M tokens** (4 Sonnet lanes in parallel, about 1–1.5 h wall-clock) |

## Files in this folder

- `items.tsv`: id, file, name, mode
- `OWNERS.tsv`: file, lane, items
- `callers.tsv`: every pre-scan hit
- `audit.json`: audit non-ok rows
- `ports-in.txt`: 312 port-type members, minus the 4 files
- `scan-scripts/callers.cjs`: before-scan (new)
- `scan-scripts/conv.cjs` and `scan.cjs`: batch-1 after-scan, now taking `ROOT`/`BASE`/`OUT_DIR` from env; smoke-tested
- `scan-scripts/ports.cjs`: port-member scan
