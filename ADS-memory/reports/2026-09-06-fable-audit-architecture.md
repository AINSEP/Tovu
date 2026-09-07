# Fable audit — ARCHITECTURE lens — window `4b89cd09..efc6847e`

- Auditor: Fable 5.1 (dispatched subagent, architecture lens)
- Audit HEAD (frozen): `efc6847ed4490d0f57cd94d16b8cf46a6489a88a`
- Window: `4b89cd09..efc6847e`, 243 commits, all 2026-09-06, ~12 parallel agents blind to each other
- Started: 2026-09-07 00:01 local
- Method: read code at the frozen SHA; check `git log efc6847e..HEAD` before reporting anything as unfixed. Read-only: no tests, builds, typechecks, servers.
- Status legend: **CONFIRMED** = imports and call sites read and named; **PLAUSIBLE** = inferred, not fully traced.
- Already fixed, not re-reported: J01, MI-01, MI-02, chat-run death path (`f682eff2`).

This file is committed roughly every five minutes. Findings below may be half-written at any commit; a later commit finishes them.

## 0. Open questions log (for the owner, not blocking)

- Q1 (answered): `use-assistant-chats.hooks.ts` `switchSeqRef` IS the self-minting shape (`const seq = ++switchSeqRef.current; … if (switchSeqRef.current !== seq) return;` at lines 532-535 and 568-573) plus one external bump at line 616 (`remove`'s empty branch), which the hook expresses as a discarded `next()`. A viable ninth adopter the sweep's name-based inventory missed. Optional, not a defect.

## 1. Desktop lifecycle claims D-01, D-02, D-03, D-06, D-07 (priority 1)

All five read at the frozen SHA. `git log efc6847e..HEAD` (as of 00:15) contains only docs commits plus `103f7ae1` (media-import) and `f682eff2` (assistant) — nothing under `apps/desktop/`, so none of these is fixed after the freeze.

### D-01 — one unreadable discovery candidate blocks startup — **CONFIRMED**, and wider than codex stated

Files: `apps/desktop/src/project-registry.cjs` (`discoverSiteDirs`, `seedDevFallbackProject`), `apps/desktop/src/site-dir-store.cjs` (`classifySiteDir`, `existingRecentSiteDirs`), `apps/desktop/src/project-ipc.cjs` (`rescanProjects`), `apps/desktop/main.cjs` (fleet boot branch → `.catch(reportBootFailure)`).

Traced: `classifySiteDir(dir)` is `existsSync` → two `existsSync` marker checks → `fs.readdirSync(dir)` when both markers are absent. Only that last call can throw (EACCES on an unreadable dir, ENOTDIR on a plain file, ELOOP on a symlink cycle). `discoverSiteDirs` guards the scan-root children with `statSync(dir, {throwIfNoEntry:false})` + `isDirectory()` — which catches ENOTDIR only; `statSync` itself throws on EACCES/ELOOP (`throwIfNoEntry` suppresses ENOENT alone), and an unreadable *directory* passes the guard and then throws inside `classifySiteDir`. Three call sites of the classifier reach the fleet boot chain unguarded:

1. `existingRecentSiteDirs(statePath)` — `readDesktopState(...).recentSiteDirs.filter((dir) => classifySiteDir(dir) === "site")`. No stat guard at all. It is the `knownDirs` thunk in `main.cjs`'s `projectDeps.recentSiteDirs`, called from `rescanProjects` *before* `discoverSiteDirs` gets to apply its own guard — so the guard in `discoverSiteDirs` is dead for every known dir; they have already been classified unguarded.
2. `seedDevFallbackProject(projectsPath, DEV_FALLBACK_SITE_DIR, classifySiteDir)` — called from the fleet branch one line before `projectDeps` is built; same classifier, no guard.
3. `discoverSiteDirs` scan-root children as codex described.

All three run synchronously inside the `app.whenReady().then(async () => {...})` fleet branch, before `openFleetWindow()`, and the chain ends in `.catch(reportBootFailure)` (`main.cjs:735`), which shows a dialog and quits. So a single bad entry in `<repo>/sites/` OR in `desktop-state.json`'s MRU takes the whole app down before any window exists.

Structural problem: `classifySiteDir` was written for one operator-picked folder, where throwing is the correct behaviour (the picker shows the error). Last night reused it as the predicate of two bulk scans (`existingRecentSiteDirs`, `discoverSiteDirs`) without changing its contract, and put a partial guard in only one of the two callers — the "fix lands in one arm" pattern. There are now two filter-the-list-by-classifier functions in two modules (`site-dir-store.cjs`, `project-registry.cjs`) that do the same job with different failure semantics.

Cost: any future scan root, MRU entry, or seed dir that becomes unreadable is a boot-blocking, dialog-and-quit failure with no way for the operator to fix it from inside the app (the Rescan button from `c201d948`/`f02ac28e` never gets a renderer to live in). Correct seam: a single `classifySiteDirSafely(dir): Kind | "unreadable"` (or the scan owning a per-candidate try/catch that logs and skips) used by *both* list filters, with `classifySiteDir` kept throwing for the single-folder picker path.

### D-02 — hosted-DB selection accepted, then silently discarded — **CONFIRMED**

Files: `apps/desktop/src/renderer/CreateWebsiteOnboarding.tsx` (`DatabasePicker`: three *enabled* radios — sqlite/supabase/custom — plus URL/key/connection fields), `apps/desktop/src/contracts/project.ts:70-73` (`CreateProjectInput { displayName; database }`), `apps/desktop/src/project-ipc.cjs` (`handleCreate` reads `input.displayName` only; `buildProjectRecord` hardcodes `database: { kind: "sqlite" }`), `apps/desktop/src/site-dir-store.cjs` (`initSiteDir` → `tovu init <dir> --name <name>` only).

The handler's own doc comment admits it: "`CreateProjectInput` is a display name plus a database choice, ported from Tovu-Runner's own provisioner-backed form. This shell has no such provisioner". So the author knew the field was dead and shipped the form with the options enabled anyway. The only user-visible caveat is the field hint "this prototype does not retain the key" — which says the *credential* is not stored, not that the *choice* is ignored.

Structural problem: the Runner UI port (`4c75f4c0`, `6a0bd61c`) copied a contract (`CreateProjectInput`) whose `database` member has no implementation on this side, and the IPC handler silently narrows it. A contract type that the main process does not honour is a divergent copy of one concept: the renderer believes in a `database` axis, main does not. Cost: the first person who adds a real hosted-DB provisioner will find every existing "created" row claiming `sqlite` with no record of what was asked for; and today an operator who enters a Supabase key gets a local SQLite site with no error. Correct seam: either drop `database` from the desktop's `CreateProjectInput` and render SQLite as the one fixed option (honest), or have `handleCreate` reject `kind !== "sqlite"` with the message the form can show. The first is smaller and matches the shell's stated "consumer of a published contract" posture.

### D-03 — webview failure recovery unwired after a normal Start — **CONFIRMED**

Files: `apps/desktop/src/renderer/App.tsx` (`ProjectWorkspace`), `apps/desktop/src/renderer/App.hooks.ts` (`useWebviewLoadFailure`).

Traced: `useWebviewLoadFailure(webviewRef, resetKey)` installs its `did-fail-load`/`did-finish-load` listeners and the 8 s stall timer inside a `useEffect` whose deps are `[webviewRef, resetKey]`, and returns early when `webviewRef.current === null`. `ProjectWorkspace` renders `<webview ref={webviewRef}>` only when `running && !failed`; otherwise `ProjectStartPanel` and the ref stays null. Two ordinary paths mount a guest without changing either dep:

- A stopped tab → Start → the 4 s poll flips `project.status` to `running` → the guest mounts. The ref *object* is stable and `resetKey` (`${reloadNonce}:${view}`) did not change, so the effect does not re-run: no listeners, no stall timer.
- The failure panel's own retry: `onStarted` bumps `reloadNonce` → effect re-runs *while* `failed` is still true (the guest is not in this render) → `setFailed(false)` and early-return on null ref → the next render mounts the guest, and again nothing re-runs.

Only "Reload while healthy" (guest already mounted; `key` change remounts it in the same commit the effect follows) attaches listeners to the node actually on screen. The recovery primitive observes the one path that needs it least.

Structural problem: a ref-keyed effect is the wrong lifetime binding for a conditionally-mounted element. The hook's own doc says listeners "must move with" the DOM node — but nothing in its inputs changes when the node appears. This is the house rule "logic belongs in a hook" applied *correctly in form* and wrong in *binding*: the hook is fine, the seam between it and the mount condition is not. Cost: every future conditional render of the guest (an "Open in tab from grid" path, a stop/start control, a status-driven remount) silently loses failure detection. Correct seam: mount the guest in a child component (`ProjectGuest`) that owns the ref and the hook, so the effect's lifetime *is* the node's; or use a callback ref that (re)installs listeners on attach.

### D-06 — a crashed project stays "running" forever; Start reuses the dead handle — **CONFIRMED**

Files: `apps/desktop/src/tovu-server.cjs` (`startTovuServer`: `finish()` single-settle guard; `child.once("exit", …)` calls `finish` — a no-op once ready has resolved; the returned handle exposes `stop()` and no exit signal), `apps/desktop/main.cjs` (`openSiteServer`: `const already = openSites.get(siteDir); if (already) return already.server;`), `apps/desktop/src/project-ipc.cjs` (`buildProjectRecord`: `running = openSites.get(row.siteDir) !== undefined`; `handleStart` → `openSiteServer`).

Traced end to end. After ready, nothing in the process observes the child's exit: not `openSites`, not `open-sites.json`, not the renderer. The renderer's `useProjectsPolling` header comment (`App.hooks.ts:54-56`, "a site can crash … so re-poll on an interval") is a false comment — polling re-reads a map that never changes on crash. `ProjectWorkspace`'s `did-fail-load` branch is the *only* thing that notices, and its "Start site" button calls `handleStart` → `openSiteServer` → returns the dead handle → `buildProjectRecord` reports the old port → the guest reloads against nothing. Wedged for the session; `before-quit` will then `await server.stop()` on a dead child (harmless — `stopChild` checks `exitCode`).

Structural problem: **this is the state-machine defect the other four are symptoms of.** The only object that knows whether a `tovu serve` is alive is the `ChildProcess` closed over inside `startTovuServer`'s promise, and the handle it returns was designed for "boot or fail" — a one-shot — not for supervision. `openSites` is documented as "this shell's registry of what is running" (`isSupervisedGuestUrl` doc) but it is a registry of what was *started* and not yet *deliberately stopped*. The `running` status the renderer, `handleOpenExternal`, and the guest-navigation policy all derive from it is therefore "was started", never "is alive".

### D-07 — two desktop instances opening one site drops the first child's crash-safety record — **CONFIRMED**

Files: `apps/desktop/src/site-registry.cjs` (`recordSiteOpened`: `[row, ...sites.filter((existing) => existing.siteDir !== row.siteDir)]`; `reconcileOrphans`: retains rows whose pid's ppid ≠ 1 as `stillSupervised`; `isOrphanedProcess` doc: "Nothing prevents two Electron instances running at once (there is no `requestSingleInstanceLock`)"), `apps/desktop/main.cjs` (no `requestSingleInstanceLock` — grep at the frozen SHA returns nothing; `startSiteBackend` → `recordSiteOpened` on every spawn).

Traced: instance B boots, `reconcileOrphansOnBoot` correctly keeps A's live row. B's `openSites` is a fresh empty `Map`, so opening site X in B runs `startTovuServer` (a *second* `tovu serve` on the same `content.db` — a second SQLite writer, its own problem) and `recordSiteOpened` replaces A's row by `siteDir`. A's child is now supervised only by A's in-memory map; if A is hard-killed, no row names it and no later boot can reconcile it.

Structural problem: the "one owner per site" invariant is enforced nowhere — not by a single-instance lock, not by the registry (replace-on-write rather than refuse-if-live-sibling), not by the site dir (no lock file), not by `tovu serve` itself. `isOrphanedProcess` was added *because* two instances can run, i.e. the codebase chose to tolerate the condition, then left the write path that the same condition breaks. Fix lands in one arm (the reap path) and not the sibling (the record path).

### The architectural question: one owner, or several?

**Several — seven, by count, and none of them owns the transition that matters.** At the frozen SHA the desktop's notion of "which sites exist and which are running" is spread over:

| # | Holder | File | Semantics | Observes child exit? |
|---|---|---|---|---|
| 1 | `ChildProcess` closure | `tovu-server.cjs` `startTovuServer` | boot-or-fail one-shot; exposes `stop()` only | yes, but discards it after ready |
| 2 | `openSites: Map<siteDir,{server,window?}>` | `main.cjs` | "started and not deliberately stopped"; read as "running" | no |
| 3 | `open-sites.json` | `site-registry.cjs` | crash-safety `{siteDir,port,pid,workspaceId}`; replace-by-siteDir | no |
| 4 | `desktop-projects.json` | `project-registry.cjs` (new last night, `65b8fd74`/`b2a46c7e`) | tracked rows + dismissal tombstones; no status | n/a |
| 5 | `desktop-state.json` `recentSiteDirs` | `site-dir-store.cjs` | MRU of site dirs (own-server mode) — a *third* on-disk list of site dirs | n/a |
| 6 | `useProjectsPolling` (4 s) | `App.hooks.ts` | renderer copy of #2 via `list` IPC; comment claims it catches crashes | no |
| 7 | `useWebviewLoadFailure` | `App.hooks.ts` | renderer *guess* at liveness from guest load events | indirectly, and only on one mount path (D-03) |

Three on-disk JSON files in `userData` each hold a list of site dirs with different keys and different lifecycle rules (#3, #4, #5); two of the three were added last night by agents who documented *why* they did not reuse the third (`site-registry.cjs` header, `project-registry.cjs` header) — each justification is individually reasonable and the aggregate is three sources of truth for "the operator's sites" that can disagree (D-01 is exactly #5 disagreeing with #4's guard). D-06 and D-07 are the same defect seen from two sides: no component owns the `running → exited` transition, so every reader of "running" is reading "started".

**Correct seam, one paragraph.** `main.cjs` should hold one `SiteSupervisor` (the fleet-scoped successor of `openSites`) that is the only holder of `ChildProcess` handles: `startTovuServer` returns the child (or the handle grows an `onExit(cb)`), the supervisor attaches the post-ready `exit` listener, transitions the entry to `{status:"exited", code, signal}` instead of deleting it, and is the sole writer of `open-sites.json` (record on ready, drop on exit or deliberate stop, refuse-not-replace when a live sibling's row exists). `buildProjectRecord` reads status from the supervisor; `handleStart` on an `exited` entry spawns a replacement instead of returning the corpse; `webContents.send("runner:projects:changed")` replaces the 4 s poll so the renderer stops guessing. The scan/MRU/tracked lists collapse behind one `classifySiteDirSafely`. That is one owner for one state machine; everything in this section then becomes a consequence rather than five separate fixes.

## 2. Commits codex left `pending` (priority 2)

(in progress — findings are filed under §4 by seam, and the ledger in §5 records which commits each covers)

## 3. Rest of the window (priority 3)

(not started)

### D-02 addendum (read after the first commit)

`useCreateWebsiteForm` (`App.hooks.ts:1162-1190`) computes `canCreate` from `supabaseReady`/`customReady` — so when Supabase or Custom is selected the form **refuses to submit until the URL and key are filled in**, then `buildCreateProjectInput` packs them, and `handleCreate` discards them. Worse than "silently discarded": the operator is forced to type a credential that is thrown away. Upgrades the cost line above; the recommended seam (drop `database` from the desktop contract) is unchanged.

## 4. Cross-cutting seams

### 4.1 `useSettlementGeneration` at 8 of 11 — **real seam, correctly drawn; inventory incomplete** — CONFIRMED

Files: `apps/admin/src/hooks/use-settlement-generation.hooks.ts` (`c171e62b`), adopters (`6df1f9a7`): `use-page-editor`, `use-post-editor`, `use-access-tokens`, `use-sites`, `use-theme-explore`, `use-themes` (×2), `use-widgets-library`. Left hand-rolled, each with a doc paragraph in the hook's own header: `use-static-publish.hooks.ts` `previewGenerationRef` (bumped by every field-edit setter via `invalidatePreview`, read by `checkPreview` — a version stamp, not a settlement id), `use-roles.hooks.ts` `permissionsGenerationRef` (minted by `loadPermissions`, peeked by `onWritePermission`), `use-users.hooks.ts` `toggleGenerationRef` (bumped by the synchronous `toggleExpanded`, threaded as a plain number into the top-level `runGrantMutation`).

Verdict: the hook models "a call guards its **own** settlement" (`next()` then `isCurrent()` after each await, same actor). All three leftovers are "one actor stamps, a different actor peeks" — a version stamp. Folding them in would require a `current()`/`peek()` method, which dissolves the invariant that makes the hook's API small (nobody can check a generation they did not mint). Leaving them out is the right call, and the hook's header records exactly why. **Not an unfinished migration.**

Gap: the sweep's inventory was by the `*GenerationRef` name. `apps/admin/src/hooks/use-assistant-chats.hooks.ts` carries four more counters under different names — `listSeqRef` (bumped externally by `markListMutated`, peeked in `refresh`: stamp shape, correctly excluded), `adoptionGenRef` (bumped by `resetAdoption`, peeked by the adoption promise: stamp shape), `paneNonceRef` (a key nonce, not a guard), and `switchSeqRef` — **PLAUSIBLE** that `switchSeqRef` in `select()` is the self-minting shape the hook was built for (not yet read; see open questions). Cost of the gap is small (one more adopter at most); the finding is that "8 of 11" was never the true denominator.

### 4.2 `escapeHtml` — nine hand-rolled copies, and the "fix every copy" commit reached four — CONFIRMED

Definitions at the frozen SHA (`git grep`, tests excluded):

| # | File | Exported? | Touched by `1044e2d5`? |
|---|---|---|---|
| 1 | `apps/website/src/server/inbound/public-http/http/site/render.ts:201` | yes | yes |
| 2 | `.../http/site/form-render.ts:164` | no | yes |
| 3 | `.../http/site/page-head.ts:194` | no | **no** |
| 4 | `apps/website/src/features/theme/static-render.ts:168` | no | yes |
| 5 | `apps/website/src/platform/export/site-exporter.ts:313` (`escapeHtmlAttr`) | no | yes |
| 6 | `apps/website/src/assistant/mcp-ui.ts:190` | yes | **no** |
| 7 | `.../routes/site/newsletter-confirm.ts:40` (inline arrow, `& < >` only) | no | **no** |
| 8 | `.../routes/site/newsletter-unsubscribe.ts:45` (inline arrow, `& < >` only) | no | **no** |
| 9 | `.../routes/site/store.ts:16` (`& < >` only) | no | **no** |

#1–#5 are the three render paths (live public render, static-render, site-exporter) each owning an escaper — the "three render paths diverge" hub already on record — and last night's fix (`1044e2d5`, "escape apostrophes in every escapeHtml/escapeHtmlAttr copy") **widened the gap rather than closing it**: it patched four copies in place and left five, so the codebase now has copies that differ on `'`. #7–#9 interpolate only into text nodes (`<title>`, `<h1>`, `<p>`), where `'` and `"` are harmless, so no security finding here — the cost is that the next escaper change (a ` ` fix, say) has nine places to land and the last commit that tried reached four. Correct seam: one `escapeHtml`/`escapeHtmlAttr` pair in `apps/website/src/platform/` (or `#src/shared/html-escape`) imported by all nine; `render.ts` already exports one, so eight imports replace eight definitions. Checked: #6 (`mcp-ui.ts`) already escaped `'` before the fix; #3 (`page-head.ts`) does **not** — it stops at `&quot;`. `page-head.ts` serialises IR into double-quoted attributes and text, so an unescaped `'` is harmless there today; the finding stands as divergence, not exposure.

### 4.3 Standing-draft autosave, posts × pages — shared core, copied shell — CONFIRMED

Shared and correctly so: `apps/admin/src/hooks/use-standing-draft-autosave.hooks.ts` (370 lines, one controller; `56a0fc09`, `10efb899`, `a60e07e8`), `apps/admin/src/lib/standing-draft-local-backup.ts`, `apps/admin/src/lib/api.ts` (`putAutosave`/`getAutosave`/`clearAutosave`, kind-blind), and one server route `routes/posts/autosave.ts` mounted once and used by both editors (`eba275f4`). Both editor ports `extends StandingDraftAutosavePort`. This is the right seam and it is where the tricky state lives.

Copied per feature, self-described as "identical": `PostAutosaveRecoveryBanner` / `PageAutosaveRecoveryBanner`, `PostAutosaveStaleBanner` / `PageAutosaveStaleBanner` (`PostEditor.tsx:690-790`, `PageEditor.tsx:228-310` — the posts doc comment says "Mirrors `features/pages/PageEditor.tsx`'s identical `PageAutosaveStaleBanner`"), and in `rules.ts` of each feature `postAutosaveBannerMessage`/`pageAutosaveBannerMessage`, `postAutosaveStaleBasisMessage`/`pageAutosaveStaleBasisMessage`, plus a `build*AutosaveInput`. The two agents (`34694309`+`f239866e` for posts; `a4b99c90`+`e5a434c3` for pages) each built the banner pair, and the second explicitly copied the first. Diffed. The two `*AutosaveRecoveryBanner`s are the same JSX apart from the `post-`/`page-` handle prefix and one divergence that is already a defect: the posts copy takes `t` and renders `{t("Restore")}`/`{t("Discard")}`; the pages copy has no `t` prop and renders bare `Restore`/`Discard` — so the Pages banner is untranslated under the admin's "copy string is its i18n key" convention. The two `*AutosaveStaleBanner`s differ only in the aria label ("this" vs "this page"). In `rules.ts`, `isAutosaveDraftStale` is defined twice (one line each), and `postAutosaveStaleBasisMessage`/`pageAutosaveStaleBasisMessage` are character-identical — `pages/rules.ts` says so itself: "Kept feature-local and character-identical to `features/posts/rules.ts`'s … the same 'no cross-feature import' boundary". That boundary is the right rule; the wrong part is that the *shared* home this feature already has (`apps/admin/src/hooks/use-standing-draft-autosave.hooks.ts`, `apps/admin/src/lib/`) was not used for the pieces that are kind-blind. Correct seam: move `isAutosaveDraftStale`, `autosaveBannerMessage`, `autosaveStaleBasisMessage` next to the hook (they depend only on the hook's types and `lib/format-timestamp.ts`), and one `<StandingDraftBanners handlePrefix=… t=…>` under `apps/admin/src/components/` — the two `rules.ts` keep only `build{Post,Page}AutosaveDraft`, which genuinely differ. Cost today: the i18n gap above; cost tomorrow: every wording or a11y change lands twice or drifts.

Also noted in the route file: three self-declared mirrors in 143 lines (`resolvePostId` "mirrors `posts/update.ts`", `allowedToWrite` "mirrors `pages/update-html.ts`", `parseAutosaveBody` "mirrors `parsePostUpdateBody`") and the `workspaceId` 404 check repeated three times inline. That is the admin-http route convention, not last night's invention — counted in the next commit.

### 4.5 `apps/desktop/main.cjs` — a 1 047-line composition root that two agents edited blind, and one gutted — CONFIRMED

`15548bef` (loopback boot token; described in `cbb727db`'s message as "the coordinator's protective commit") changed `apps/desktop/main.cjs` by −238/+20 lines, deleting `openSiteWindow`, `adoptAndOpenSite`, `promptAndOpenNewSite`, `buildAppMenu`, `refreshAppMenu`, `reportBootFailure`, `buildSelftestTracker`, `selftestTracker` and `resolveStartupSiteDirs` while leaving every call site in place — `bootOwnServerMode` (then the default) threw `ReferenceError` on entry. `cbb727db` restored all nine from the parent commit, adapted to the boot-token model, "verified by node -c only so far". Both commits are in the window; the app's default boot path was dead between them.

Structural problem: `main.cjs` is at once the composition root for three boot modes, the site-window factory, the fleet-window factory, the app menu, the selftest tracker, the guest-navigation policy, the orphan reaper's call site, and the before-quit drain. It is the one file every desktop change touches, and a partial snapshot of it (which is what a "protective commit" of a file mid-edit is) cannot be consistent. `tsc` says nothing about `.cjs` (on record), so the only guard was an E2E run that was still in flight. Cost: the next protective/partial commit of `main.cjs` will do the same thing, and the next two agents working on "desktop windowing" and "desktop auth" will collide in the same file. Correct seam: `main.cjs` becomes a ~60-line mode switch; `src/boot/fleet.cjs`, `src/boot/own-server.cjs`, `src/boot/attach.cjs` each export one `boot(ctx)`; `src/site-window.cjs` owns `openSiteWindow`/`startSiteBackend`/`openSiteServer` (and, per §1, becomes the `SiteSupervisor`); menus and selftest get their own modules. Then a partial commit of any one file is a partial commit of one concern.

### 4.6 Two server boot paths, one deduped helper pair, sequence still hand-copied — CONFIRMED

`d1eea4b2` did the right thing for what it touched: `agentDaemonWanted` (previously verbatim in `src/index.ts` and `cli/commands/serve.ts`, each re-implementing the boolean that `admin-assistant-enabled.ts`'s `shouldStartAgentDaemon` already exported with zero callers) now lives once in `server/runtime/boot/agent-daemon-wanted.ts` and delegates to that primitive; `logCriticalBootFailures` moved into `bootstrap.ts`; `export.ts` gained the migration scan. Both entry files import both.

What is still duplicated is the *orchestration*: `ensureAgentDaemonToken()` → `ensureAgentDaemonPortResolved()` → `createApp()` → `app.listen()` → `startAssistantDaemon()` inside the listen callback → `buildBootModules`/`logCriticalBootFailures` — `serve.ts`'s header narrates, step by step, that it "mirrors `index.ts`'s exact placement". Two files own the same lifecycle by convention. The concrete divergence is documented by a third agent the same night (`adopt.ts` header): `tovu serve` → `bootSiteDir` → `readSiteDir` runs the marker/schema guard before the DB opens, while `src/index.ts` "never calls `bootSiteDir` at all and opens `content.db` by path" — so a site can serve in dev and be refused by the CLI/desktop path. The agent daemon stays a child spawned from the `listen()` callback on both paths (the known tsx-watch coupling; not the chat-death cause, per the closed investigation) — but it is now spawned that way *twice*, by two owners. Correct seam: one `bootServer(input)` in `server/runtime/boot/` that takes the resolved inputs (`dbPath` or `siteDir`, `emitBootToken`, `workspaceId`) and owns the sequence; `index.ts` and `serve.ts` become input resolvers. The boot-token (`15548bef`) server half is clean and needs no change: `boot-session-token.ts` is a launcher-agnostic, process-scoped store minted in `serve.ts` and redeemed only by `dev-auth.ts`'s loopback-gated route.

### 4.7 Site-dir identity: two marker classifiers with two vocabularies, and two things called "adopt" — CONFIRMED

Website side (`d131619d`, `6998ef9c`, `8a14b56a`, `62634037`): `platform/site-dir/repair-site.ts` `classifySiteMarkers(target) → "none" | "partial" | "complete"`, `repairSite` (derives `.site-meta.json`'s schema stamp from `__drizzle_migrations` via the now-shared `readAppliedSchemaIdentity`, which `content-db-schema-guard.ts` also uses — a real dedupe), `read-site-dir.ts` `readSiteDir` (the serve contract), and the new CLI verb `tovu adopt <dir>` = "write the marker pair into a marker-less site". Desktop side (`76d7c739`): `src/site-dir-store.cjs` `missingSiteMarkers` + `classifySiteDir(dir) → "site" | "incomplete" | "empty" | "occupied"` and `adoptSiteDir` = "classify; init if empty; refuse `occupied`/`incomplete`; remember".

Two classifiers of the same two files, different vocabularies (`partial`≈`incomplete`, `complete`≈`site`, `none`→ split into `empty`/`occupied`), on opposite sides of a boundary the desktop deliberately does not import across. And the desktop never calls `tovu adopt` (`git grep` for `adopt` as a CLI arg under `apps/desktop` returns nothing): a legacy, marker-less but working site picked in the desktop classifies as `"occupied"` and is refused with "someone's real folder full of unrelated files", while the same checkout ships a verb built that night for exactly that directory. Cost: the marker convention now has two definitions; the operator-facing path with the most users (the desktop) cannot reach the repair the CLI offers; and "adopt" means two different things in the two READMEs a future maintainer will read. Correct seam: the CLI grows a read-only `tovu inspect <dir> --json` (or `adopt --dry-run --json`, which `runAdoptCommand` already supports as `dryRun`) that prints `classifySiteMarkers`' answer plus the emptiness check, and the desktop's `classifySiteDir` becomes a parser of that output — one classifier, the desktop stays a CLI consumer, and its "occupied" case can offer "Adopt this site" that shells to `tovu adopt`.

### 4.8 `RouteDeps` churn — two agents, sequential, the second corrected the first — CONFIRMED, no action

`b359e613` added `RouteDeps.contentDbPath` so the BYOK tool-audit sink could open its DB lazily; `6f32d027` (later, same day) removed `contentDbPath` and injected `toolAttemptAuditSink` instead (`SqliteToolAttemptAuditSink(db)` in `composition/deps.ts:1394`, in-memory in `app.ts:677`). The end state is the correct port; a filesystem path in `RouteDeps` was the leak. `f31e6ded` threads `RouteDeps.siteBinding` from `serve.ts` (`overrides.siteBinding ?? describeSiteBinding()` in `deps.ts:573`) so `features/sites` stops re-deriving the binding per request. One thing to verify next: `features/sites/deps.ts:94` `switcherCompatible: deps.siteBinding?.switcherCompatible ?? true` — a fail-*open* default when the binding is absent.

### 4.9 `agentHandle` sweep — one mechanism, consistently applied — CONFIRMED (negative finding)

`agentHandle` is imported from `@jini-ai/agentic` (a package entrypoint, not an internal path) at 490 call sites in 70 files under `apps/admin/src`; no parallel `data-testid`/`data-agent-*` mechanism exists outside one CSS comment. The ~20 tagging commits are consistent with each other. Residual risk: 490 string-literal handle names, 311 distinct, no registry. Three names are used twice **in the same file** — `deployment-dockerfile-load-error` (`DockerfileTab.tsx:371,386`), `page-template-choice` (`PageEditor.tsx:383,399`), `post-template-choice` (`PostEditor.tsx:1016,1053`). If both elements render at once an agent driving by handle has an ambiguous target; if they are exclusive branches it is fine. Read in the next commit.

### 4.10 Site layout: `CONTENT_DB_FILENAME` and `CONTENT_DB_FILE_NAME`, same directory, same night — CONFIRMED

`apps/website/src/platform/site-dir/layout.ts:61` exports `CONTENT_DB_FILENAME = "content.db"`; `apps/website/src/platform/site-dir/repair-site.ts:72` (`d131619d`, last night) exports `CONTENT_DB_FILE_NAME = "content.db"` — two constants for one filename, in sibling files, and `cli/commands/adopt.ts` imports the *second*. Beyond those, the literal `"content.db"` is still hand-joined at `cli/commands/export.ts:135`, `cli/commands/serve.ts:195`, `platform/site-dir/boot-site-dir.ts:73`, `platform/site-dir/init-site.ts:213`, and `runtime/composition/deps.ts:452`; `"chat.db"` and `"ops/database-journal.db"` are derived only in `composition/deps.ts:463,473` from `dirname(contentDbPath)`, while `layout.ts`'s `isPortableSiteEntry` (`0d63cfd8`, the "stop shipping private databases" fix) is the *other* place that knows which files in a site dir are private. Two modules own the site directory's layout: `layout.ts` (what is portable) and `composition/deps.ts` (where each DB lives), and they do not reference each other. Cost: the next private file added to a site dir (a second journal, a cache) has to be added in two places or `duplicateSite` ships it — which is exactly the bug `0d63cfd8` fixed for `chat.db`. Correct seam: `layout.ts` owns every filename (`CONTENT_DB`, `CHAT_DB`, `JOURNAL_DB`, `UPLOADS_DIR`, …) and the portability predicate; `composition/deps.ts` builds paths from those constants; `repair-site.ts` drops its private copy.

### 4.11 Outbox retry: the terminal-state decision found its owner — CONFIRMED, no action

`0ae3429d` added backoff + an attempt cap with the "failed" decision made inside each store (`memory-bus.ts` and `outbox-repo.sqlite.ts` — two copies); `8d041b52` moved it into `contracts/core/events/outbox-worker.ts`'s `processOutbox` (`row.attempts >= MAX_OUTBOX_ATTEMPTS ? "failed" : "pending"`, passed to `markFailed(id, message, nextAttemptAt, nextStatus)`), leaving both stores as dumb writers. That is the correct owner (one policy, N stores). Whether `row.attempts` is pre- or post-increment at that comparison is a bugs-lens question, not filed here.

### 4.12 Assistant tool executor: one stack, two consumers — CONFIRMED, no action

`08ace3ea` made `assistant/tool-executor-stack.ts`'s `createAssistantToolExecutor` (read-only guard → optional audit → failure recovery) the single constructor, consumed by `byok-tool-surface.ts` and re-exported through `agent-daemon-port.ts` for the daemon. Before it, BYOK built its own un-gated executor — a divergent copy of the stack; this closed it.

### 4.13 HTTPS egress policy — CONFIRMED, no action

`7b2a2007`/`916eb8b0`: `platform/http/egress-policies.ts` now holds `SINGLE_HOP_HTTPS_EGRESS_POLICY` and `MEDIA_IMPORT_EGRESS_POLICY`; `composition/app.ts` and `composition/deps.ts` both import them (the two composition roots are the documented rule-of-two split). No inline policy object survives (checked in the next commit).

### 4.14 Chat-attachment directory: one definition, but an inbound module importing the composition root — CONFIRMED

`3b196ffb` gave the upload directory one definition: `server/inbound/assistant/chat-attachment-directory.ts` `resolveChatAttachmentUploadDirectory()`. It computes it by importing `defaultContentDbPath` from `../../runtime/composition/deps.js` — an `inbound/` adapter reaching *up* into the composition root for a path. The composition root is supposed to hand adapters what they need, not be imported by them; the same file's sibling fix (`6f32d027`, §4.8) removed `contentDbPath` from `RouteDeps` for precisely the reason that a filesystem path is not a port. Whether dependency-cruiser has a rule for `inbound → runtime/composition` is checked next; if it does not, this is the direction that rule should declare. Cost: the daemon server's attachment directory is bound to whatever `defaultContentDbPath()` reads from env/cwd at call time — the same "resolves site from cwd, not site dir" trap already on record for the daemon.

### 4.4 Layering — clean — CONFIRMED (negative finding)

At the frozen SHA: no `@jini-ai/*/src|dist|lib` deep imports anywhere under `apps/` or `packages/`; no import from `apps/admin` or `apps/desktop` into `apps/website` source (`apps/desktop` shells out to the CLI and parses its stdout, as its header claims). The only cross-app references are two pre-window "Mirrors …" doc comments on duplicated constants (`apps/admin/src/features/sites/rules.ts:26` `SITE_NAME_PATTERN`, `apps/admin/src/features/seo/rules.ts:125` `isAbsoluteUrl`) — neither introduced in this window (`git log -S` over the window returns nothing).

## 5. Commit ledger (all 243)

(not started)
