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

(none yet)

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

(not started)

## 3. Rest of the window (priority 3)

(not started)

## 4. Cross-cutting seams

(not started)

## 5. Commit ledger (all 243)

(not started)
