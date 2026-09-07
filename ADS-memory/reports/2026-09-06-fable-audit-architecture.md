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

`agentHandle` is imported from `@jini-ai/agentic` (a package entrypoint, not an internal path) at 490 call sites in 70 files under `apps/admin/src`; no parallel `data-testid`/`data-agent-*` mechanism exists outside one CSS comment. The ~20 tagging commits are consistent with each other. Residual risk: 490 string-literal handle names, 311 distinct, no registry. Three names are used twice **in the same file** — `deployment-dockerfile-load-error` (`DockerfileTab.tsx:371,386`), `page-template-choice` (`PageEditor.tsx:383,399`), `post-template-choice` (`PostEditor.tsx:1016,1053`). Read: all three pairs are mutually exclusive render branches (early-return vs. body; `? :` arms of one `<select>`), so no ambiguity at runtime. No finding.

### 4.10 Site layout: `CONTENT_DB_FILENAME` and `CONTENT_DB_FILE_NAME`, same directory, same night — CONFIRMED

`apps/website/src/platform/site-dir/layout.ts:61` exports `CONTENT_DB_FILENAME = "content.db"`; `apps/website/src/platform/site-dir/repair-site.ts:72` (`d131619d`, last night) exports `CONTENT_DB_FILE_NAME = "content.db"` — two constants for one filename, in sibling files, and `cli/commands/adopt.ts` imports the *second*. Beyond those, the literal `"content.db"` is still hand-joined at `cli/commands/export.ts:135`, `cli/commands/serve.ts:195`, `platform/site-dir/boot-site-dir.ts:73`, `platform/site-dir/init-site.ts:213`, and `runtime/composition/deps.ts:452`; `"chat.db"` and `"ops/database-journal.db"` are derived only in `composition/deps.ts:463,473` from `dirname(contentDbPath)`, while `layout.ts`'s `isPortableSiteEntry` (`0d63cfd8`/`9051e2b5`) is an *allow-list* of portable entries (`uploads`, `themes`, `plugins`, `overrides`, `skills`, `agent-plugins`) — so a new private file is safe by default (fails closed; good), but a new portable entry must be added there while its path is still built in `composition/deps.ts`. Two modules own the site directory's layout — `layout.ts` (what is portable) and `composition/deps.ts` (where each file lives) — and they do not reference each other. Cost: moderate; the concrete defect is the duplicate constant and six hand-joined literals. Correct seam: `layout.ts` owns every filename (`CONTENT_DB`, `CHAT_DB`, `JOURNAL_DB`, `UPLOADS_DIR`, …) and the portability predicate; `composition/deps.ts` builds paths from those constants; `repair-site.ts` drops its private copy.

### 4.11 Outbox retry: the terminal-state decision found its owner — CONFIRMED, no action

`0ae3429d` added backoff + an attempt cap with the "failed" decision made inside each store (`memory-bus.ts` and `outbox-repo.sqlite.ts` — two copies); `8d041b52` moved it into `contracts/core/events/outbox-worker.ts`'s `processOutbox` (`row.attempts >= MAX_OUTBOX_ATTEMPTS ? "failed" : "pending"`, passed to `markFailed(id, message, nextAttemptAt, nextStatus)`), leaving both stores as dumb writers. That is the correct owner (one policy, N stores). Whether `row.attempts` is pre- or post-increment at that comparison is a bugs-lens question, not filed here.

### 4.12 Assistant tool executor: one stack, two consumers — CONFIRMED, no action

`08ace3ea` made `assistant/tool-executor-stack.ts`'s `createAssistantToolExecutor` (read-only guard → optional audit → failure recovery) the single constructor, consumed by `byok-tool-surface.ts` and re-exported through `agent-daemon-port.ts` for the daemon. Before it, BYOK built its own un-gated executor — a divergent copy of the stack; this closed it.

### 4.13 HTTPS egress policy — CONFIRMED, no action

`7b2a2007`/`916eb8b0`: `platform/http/egress-policies.ts` now holds `SINGLE_HOP_HTTPS_EGRESS_POLICY` and `MEDIA_IMPORT_EGRESS_POLICY`; `composition/app.ts` and `composition/deps.ts` both import them (the two composition roots are the documented rule-of-two split). No inline policy object survives (checked in the next commit).

### 4.14 Chat-attachment directory: one definition, but an inbound module importing the composition root — CONFIRMED

`3b196ffb` gave the upload directory one definition: `server/inbound/assistant/chat-attachment-directory.ts` `resolveChatAttachmentUploadDirectory()`. It computes it by importing `defaultContentDbPath` from `../../runtime/composition/deps.js` — an `inbound/` adapter reaching *up* into the composition root for a path. The composition root is supposed to hand adapters what they need, not be imported by them; the same file's sibling fix (`6f32d027`, §4.8) removed `contentDbPath` from `RouteDeps` for precisely the reason that a filesystem path is not a port. Whether dependency-cruiser has a rule for `inbound → runtime/composition` is checked next; if it does not, this is the direction that rule should declare. Cost: the daemon server's attachment directory is bound to whatever `defaultContentDbPath()` reads from env/cwd at call time — the same "resolves site from cwd, not site dir" trap already on record for the daemon.

### 4.15 `expectedVersion` — three arms of one `posts.version` column, three behaviours — CONFIRMED

The chain `be45461e` → `9c7d16bf` → `2756ac26` → `b37864c3` (+ admin `e595312f`, `f3bdd3af`) adds opt-in optimistic concurrency to `updatePost` and describes `content_post_update` as "the guard's last unwired arm". It is not. `git grep updatePost(` at the frozen SHA finds four callers: `routes/posts/update.ts` (carries `expectedVersion`), `features/post/tool-registrations.ts` (carries it), **`routes/pages/update.ts:144`** (calls `updatePost` with `...parsePageUpdateBody(req.body)` — no `expectedVersion`, and `apps/admin/src/features/pages/**` contains zero references to it), and `composition/app.ts` (wiring). A Page is a `posts` row ("kind-blind", as the autosave route says), so the Pages editor writes the same column without the guard the Posts editor now has. `routes/pages/update-html.ts` → `html-document-store.sqlite.ts:302` uses a *third* mechanism: a store-internal `lastReadVersion` compared in the UPDATE — concurrency by the store remembering what it read, not by the client stating what it loaded.

Structural problem: one column, three concurrency contracts (client-stated, store-remembered, none), split along the feature boundary (`posts/` vs `pages/`) that the data model does not have. The autosave work (§4.3) makes this visible to the operator: the Pages stale-basis banner says "someone else saved… autosaving has paused", and the next explicit Save on Pages overwrites them silently. Cost: the divergent-copies pattern of §4.3 again, now with a correctness consequence. Correct seam: `parsePageUpdateBody` gains the same `parseExpectedVersion` call `parsePostUpdateBody` has (the helper was extracted in `2756ac26` precisely "so a second arm can share it" — the second arm it was thinking of was the tool, but Pages is the one with users), the Pages port/hook/api gain `expectedVersion` the way `f3bdd3af` did for Posts, and `html-document-store` either accepts an explicit `expectedVersion` or documents why its read-remembered version is the stronger contract.

### 4.16 `server/inbound` importing `server/runtime/composition` — the layering rule that is missing — CONFIRMED

Seven imports at the frozen SHA go from `apps/website/src/server/inbound/**` *up* into `server/runtime/composition/**`: `admin-http/routes/plugins/uninstall.ts` (`plugin-runtime`), `admin-http/routes/system/deployment-overview.ts` (`deps` — `defaultContentDbPath`, `mediaUploadsDir`), `admin-http/routes/system/sites.ts` (`site-switcher-enabled`), `assistant/agent-daemon-server.ts` ×3 (`app.js` `createRouteDeps`, `deps.js` `createSqliteRouteDepsForWorkspace`, `tool-catalog-manifest.js`), and last night's `assistant/chat-attachment-directory.ts` (`deps.js` `defaultContentDbPath`, §4.14). The daemon server is a second composition root that happens to live under `inbound/`; the others are adapters reaching for defaults the root should have handed them. `check:architecture` is on record as staying RED, so whatever `.dependency-cruiser.mjs` says about this direction is not enforced on a diff. Cost: every such import binds an adapter to process-global resolution (`TOVU_CONTENT_DB`/`siteDir()`/cwd) instead of the site the root actually booted — the exact class of bug `f31e6ded` fixed for `siteBinding` the same night. The correct seam is not a new rule so much as an enforced one: `no-inbound-to-composition` in dependency-cruiser with the seven current edges baselined by path, so the eighth is a failing check.

## 3. Rest of the window (priority 3)

### 3.1 Complexity ceiling (9) — verified by reading, not by running eslint

Codex's isolated SonarJS pass (`cognitive-results.json`) names five functions at 10–12. Read at the frozen SHA:

| Function | File:line | Verdict | Window commit(s) |
|---|---|---|---|
| `mapErrorToCliOutcome` | `apps/website/src/cli/errors.ts:178` | **CONFIRMED** >9 — a seven-arm `instanceof` chain with a nested three-way inside the `CommanderError` arm and a trailing ternary; grew again with `SiteRepairRefusedError` (`62634037`) | `62634037`, `d1eea4b2` |
| `performRename` | `apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:665` | **CONFIRMED** >9 — try/catch/finally each with a `!isCurrent(generation)` early return (+3 branches from the settlement adoption alone), a nested ternary chain in the catch, and a conditional before | `6df1f9a7` |
| `buildCreateProjectInput` | `apps/desktop/src/renderer/App.hooks.ts:1092` | **CONFIRMED** ≥10 — two nested ternary chains plus three conditional spreads; and per D-02 the whole `database` branch it computes is discarded by main | `4c75f4c0` |
| `ProjectWorkspace` | `apps/desktop/src/renderer/App.tsx:487` | **PLAUSIBLE** 10 — `running`/`failed`/`stalled` nested ternaries, a `map`, `expanded` ternaries, className ternaries; also the D-03 site | `9e77a778`, `204e01a7` |
| `start` | `apps/website/src/server/inbound/assistant/agent-daemon-server.ts:1037` | **PLAUSIBLE** 10 — read only the first 45 lines; not fully counted | `0d9e41d5` |

Pattern worth naming: the `useSettlementGeneration` adoption adds three guard branches to every adopter (`try`, `catch`, `finally`); `performRename` was already near the ceiling and crossed it. The hook could absorb the pattern (`settlement.run(async (isCurrent) => …)` or a `guard(generation, fn)` helper) so adopters pay one branch, not three.

### 3.2 Logic in `.tsx` — house rule

`apps/admin`: of the 58 component `.tsx` files changed in the window (excluding `.hooks.tsx`, tests, and the off-limits `MenuEditor.*`), six contain React hook calls at the frozen SHA (`ExternalMcpSettingsPanel.tsx` ×3, `Themes.tsx`, `AgentPluginDetailsModal.tsx`, `StaticSiteTab.tsx`, `widget-embed-extension.tsx`, `AssistantDock.tsx` ×1 in a comment) and **none of those lines were added by the window** (`git diff 4b89cd09..efc6847e` adds no `use*(` line in any of them). Last night's admin work respected the rule; the 26 `<Name>.hooks.tsx` files follow the 2026-09-05 convention. Negative finding.

`apps/desktop` (landed in the window): `App.tsx` `ProjectWorkspace` holds `useState(view)`, `useState(reloadNonce)`, `useRef(webviewRef)`, the derived `url`/`running`, and the `openInBrowser` handler inline in the component (`App.tsx:487-520`) — a **CONFIRMED** violation, and not a cosmetic one: D-03 is the consequence of the mount condition living in the `.tsx` while the listener binding lives in the hook. Moving the ref + hook + mount condition into one `useProjectGuest(project)` hook (or the child-component seam named in §1) fixes both.

### 4.4 Layering — clean — CONFIRMED (negative finding)

At the frozen SHA: no `@jini-ai/*/src|dist|lib` deep imports anywhere under `apps/` or `packages/`; no import from `apps/admin` or `apps/desktop` into `apps/website` source (`apps/desktop` shells out to the CLI and parses its stdout, as its header claims). The only cross-app references are two pre-window "Mirrors …" doc comments on duplicated constants (`apps/admin/src/features/sites/rules.ts:26` `SITE_NAME_PATTERN`, `apps/admin/src/features/seo/rules.ts:125` `isAbsoluteUrl`) — neither introduced in this window (`git log -S` over the window returns nothing).

## 5. Commit ledger (all 243)

Status: `reviewed` = read at the frozen SHA and traced to a section; `skipped` = docs/tests/out-of-app (no production code in scope); `not reached` = production code not yet read — regenerated on every commit, see the final count at the end of the run.

| Commit | Status | Subject | Note |
|---|---|---|---|
| `efc6847e` | skipped | docs(ads-memory): handoff for session tovu-14 | docs/tests/out-of-app — no production code in scope |
| `0bfd3430` | skipped | docs(ads-memory): record that commit trailers misattribute the model | docs/tests/out-of-app — no production code in scope |
| `b06b4ec7` | skipped | docs(todos): close the two entries tonight's work shipped | docs/tests/out-of-app — no production code in scope |
| `37ac1943` | reviewed | feat(admin/settings): show the operator which external MCP tools the assistant refused | §4 — admin admissions banner; .hooks.tsx convention followed |
| `f02ac28e` | reviewed | fix(desktop/projects): stop a failed rescan blanking the grid, and unstack the header | §1 D-01 — renderer rescan error; boot path unaffected |
| `c201d948` | reviewed | feat(desktop/projects): add a Rescan control so discovery is not only a boot step | §1 D-01 — Rescan button; cannot help a boot-time throw |
| `65b8fd74` | reviewed | feat(desktop/projects): scan for sites on disk at boot, so one made outside the shell appears | §1 D-01 — discovery scan; unguarded classifier |
| `4ede4562` | not reached | fix(e2e/types): type the desktop-shell application-menu walk instead of leaving it implicitly any | (pending — reason recorded at end of run) |
| `0d9e41d5` | reviewed | feat(mcp-federation): tell the MODEL which external tools were refused, and why | §4 — refusal prefix; second sink of one report, by design |
| `e56965a6` | not reached | fix(admin/types): clear the 31-error tsc baseline in apps/admin | (pending — reason recorded at end of run) |
| `8e973578` | not reached | fix(admin/workspace): refuse deleting the server's own bound workspace (INV-05) | (pending — reason recorded at end of run) |
| `8a4e405d` | not reached | fix(admin/menus): log the update-tree catch-all 500 instead of discarding it | (pending — reason recorded at end of run) |
| `b2a46c7e` | reviewed | feat(desktop/projects): record removals, so the seed guard can ask about the directory | §1 — dismissal tombstones; 4th list of site dirs |
| `24bdafc1` | skipped | test(media-import): prove the bytes, not that a row exists | docs/tests/out-of-app — no production code in scope |
| `a346b3ec` | reviewed | feat(assistant): make media_import_from_url findable, and close the catalog gap | search keywords only |
| `dd187ece` | not reached | feat(media-import): add media_import_from_url, the missing import-by-URL tool | (pending — reason recorded at end of run) |
| `b1ce2d0a` | not reached | feat(platform/http): make the guarded HttpResponse byte-capable | (pending — reason recorded at end of run) |
| `fb5ad748` | skipped | docs(todos): mark the non-basic theme shells out of scope | docs/tests/out-of-app — no production code in scope |
| `0ea4f887` | skipped | docs(ads-memory): record three commits carrying another commit's message | docs/tests/out-of-app — no production code in scope |
| `fa70c175` | skipped | docs(ads-memory): record that the media-seed fix DID deploy, and the regression since | docs/tests/out-of-app — no production code in scope |
| `68ce4909` | skipped | docs(todos): close the HTML-Page fallback-shell entry against a live measurement | docs/tests/out-of-app — no production code in scope |
| `570e5822` | not reached | fix(scripts): stop backfill-external-mcp-aad defaulting --db to the live site database | (pending — reason recorded at end of run) |
| `b27cdba4` | not reached | refactor(admin/menus): move ItemRow's Remove-confirmation logic into MenuEditor.hooks.tsx | (pending — reason recorded at end of run) |
| `9e77a778` | reviewed | feat(desktop): restore the tab strip and embedded project workspace | §1 D-03/D-06 — ProjectWorkspace + poll |
| `204e01a7` | reviewed | feat(desktop): embed a project as a tab, not a new BrowserWindow | §1 — embedded tab model; openSiteServer |
| `c2e206db` | skipped | docs(ads-memory): map Tovu Runner and its connection to Tovu | docs/tests/out-of-app — no production code in scope |
| `3bc9a415` | reviewed | fix(desktop/e2e): stop the e2e suite writing into the real Electron userData dir | §1 — e2e userData override; no arch finding |
| `fc3bff7c` | skipped | docs(todos): file the single-window desktop shell and two gaps found live | docs/tests/out-of-app — no production code in scope |
| `2b69b327` | not reached | fix(admin/settings): restore the tsc baseline in the field-spec test | (pending — reason recorded at end of run) |
| `f50b8463` | skipped | test(admin/settings): add exhaustive route-vs-field-spec coverage for External MCP | docs/tests/out-of-app — no production code in scope |
| `6df1f9a7` | reviewed | refactor(admin/hooks): adopt useSettlementGeneration at 8 call sites | §4.1 — 8 adopters |
| `cc01bce7` | skipped | docs(todos): settle the footer menu content-ref-vs-raw-URL question | docs/tests/out-of-app — no production code in scope |
| `6bf0fc86` | skipped | docs(todos): re-measure the footer dead-links entry against the running site | docs/tests/out-of-app — no production code in scope |
| `ae13e739` | not reached | fix(admin): add the missing writeAllowedToolNames field spec | (pending — reason recorded at end of run) |
| `c171e62b` | reviewed | feat(admin/hooks): extract shared useSettlementGeneration guard | §4.1 — useSettlementGeneration |
| `13acf9d3` | skipped | docs(ads-memory): explain the AAD backfill scripts and the --db asymmetry | docs/tests/out-of-app — no production code in scope |
| `01146403` | not reached | fix(admin): drop invalid button-in-anchor nesting on 8 more screens | (pending — reason recorded at end of run) |
| `ab022bae` | skipped | docs(ads-memory): record boot-orchestration dedup fix report | docs/tests/out-of-app — no production code in scope |
| `d1eea4b2` | reviewed | refactor(boot): dedupe agentDaemonWanted/logCriticalBootFailures; close export's migration-scan gap | §4.6 — boot dedupe |
| `ed397627` | skipped | chore(scripts): add operator-invoked cleanup for stale owner sessions | docs/tests/out-of-app — no production code in scope |
| `8d041b52` | reviewed | refactor(outbox): move the retry-cap terminal-state decision into the worker | §4.11 — decision moved to worker |
| `874ee54d` | skipped | docs(ads-memory): correct C1 -- the .btn-* fix was never missing | docs/tests/out-of-app — no production code in scope |
| `530d6122` | not reached | fix(admin): drop invalid button-in-anchor nesting on 3 more back/create links | (pending — reason recorded at end of run) |
| `a44148a1` | not reached | fix(admin/collections): drop invalid button-in-anchor nesting; correct stale CSS comment | (pending — reason recorded at end of run) |
| `4c6a0797` | reviewed | refactor(auth): delegate mintSessionForPrincipal to Jini's shared minter | dev-auth delegates to Jini minter; read |
| `1044e2d5` | reviewed | fix(render): escape apostrophes in every escapeHtml/escapeHtmlAttr copy | §4.2 — 4 of 9 escapeHtml copies |
| `4c65e392` | not reached | fix(admin-voice-input): release the mic if held released mid-permission-prompt | (pending — reason recorded at end of run) |
| `f31e6ded` | reviewed | fix(sites): thread the real boot-resolved site binding through RouteDeps instead of re-deriving it per request | §4.8 — siteBinding through RouteDeps |
| `00bc4bd6` | not reached | fix(admin-security): stop "Make default" from also toggling its own row | (pending — reason recorded at end of run) |
| `ee14d334` | skipped | test(backfill-execution-aad): refresh fixture tripwire for migration 0058 | docs/tests/out-of-app — no production code in scope |
| `527077b6` | skipped | test(assistant): fix stale audit-detail assertion in byok-tool-surface INCIDENT FIX test | docs/tests/out-of-app — no production code in scope |
| `80e69410` | skipped | docs(reports): mark the AAD backfill dedupe report complete | docs/tests/out-of-app — no production code in scope |
| `a68526dd` | not reached | refactor(scripts): migrate backfill-external-mcp-aad.ts onto the shared runner | (pending — reason recorded at end of run) |
| `a19708d3` | skipped | test(scripts): add a characterization test for backfill-external-mcp-aad.ts | docs/tests/out-of-app — no production code in scope |
| `916eb8b0` | reviewed | refactor(deps): wire deps.ts onto the shared single-hop HTTPS egress policy | §4.13 |
| `7b2a2007` | reviewed | refactor(platform/http): extract the shared single-hop HTTPS egress policy | §4.13 |
| `384790fa` | skipped | docs(reports): admin visual polish — six-combination proof of the Settings light pin | docs/tests/out-of-app — no production code in scope |
| `f1b13b38` | skipped | test(admin/settings): pin that the Settings page cannot render dark | docs/tests/out-of-app — no production code in scope |
| `7caa2b71` | reviewed | fix(post): enqueue entry.published when a post/page is created already published | read; both create routes + tool patched |
| `7b138c50` | not reached | refactor(scripts): migrate backfill-site-assistant-credential-aad.ts onto the shared runner | (pending — reason recorded at end of run) |
| `0af0748e` | not reached | refactor(scripts): migrate backfill-media-provider-credential-aad.ts onto the shared runner | (pending — reason recorded at end of run) |
| `3f0c9915` | not reached | refactor(scripts): migrate backfill-execution-credential-aad.ts onto the shared runner | (pending — reason recorded at end of run) |
| `08ace3ea` | reviewed | fix(assistant): route BYOK's tool executor through the shared read-only-gated stack | §4.12 |
| `11aa4708` | not reached | fix(identity): register this repo's pages.edit_html grant in the backfill script, without crashing its dry run | (pending — reason recorded at end of run) |
| `6be26ddb` | skipped | test(site-glue): fix REQ-8 assertion that relied on the pre-fix immediate-reclaim bug | docs/tests/out-of-app — no production code in scope |
| `d3161f2e` | not reached | refactor(scripts): migrate backfill-connector-credential-aad.ts onto the shared runner | (pending — reason recorded at end of run) |
| `947c0fa1` | not reached | refactor(scripts): migrate backfill-composio-config-aad.ts onto the shared runner | (pending — reason recorded at end of run) |
| `5ae37c8b` | skipped | docs(reports): admin visual polish — add the two Settings-pin commits to the commit list | docs/tests/out-of-app — no production code in scope |
| `ea8c660b` | skipped | docs(reports): admin visual polish — Settings pinned to light, inert-control consequence | docs/tests/out-of-app — no production code in scope |
| `89c8c380` | not reached | design(admin/settings): pin the page to light and take it fully out of the card | (pending — reason recorded at end of run) |
| `5182994a` | not reached | refactor(scripts): add shared AAD backfill scaffold, not yet wired to any script | (pending — reason recorded at end of run) |
| `7d7ae169` | not reached | fix(members): correct decideTiersAccess's @complexity from O(t) to O(t·a) | (pending — reason recorded at end of run) |
| `0ae3429d` | reviewed | fix(outbox): stop immediate re-queue, add exponential backoff and an attempt cap | §4.11 — outbox backoff |
| `a9a6e3a9` | not reached | fix(export): scheme-check the redirect stub's href sinks | (pending — reason recorded at end of run) |
| `d10f6708` | skipped | docs(reports): record theme content-template naming drift investigation | docs/tests/out-of-app — no production code in scope |
| `2b039738` | skipped | test(auth): add the boot-session route's first server-side test; fix a false comment | docs/tests/out-of-app — no production code in scope |
| `563e58af` | skipped | docs(reports): admin visual polish pass, 2026-09-06 | docs/tests/out-of-app — no production code in scope |
| `933c69e9` | not reached | design(admin): give the Database and Sites tab rows the icons every other tab row has | (pending — reason recorded at end of run) |
| `bc22ff14` | not reached | design(admin): apply the form measure to the Users and Integrations create forms | (pending — reason recorded at end of run) |
| `b8c321ef` | skipped | docs(reports): excess/dead-code review of the 2026-09-01 to 09-03 commits | docs/tests/out-of-app — no production code in scope |
| `ad20fc76` | skipped | docs(review): add architecture/DI review for 2026-09-01 to 2026-09-03 | docs/tests/out-of-app — no production code in scope |
| `9f13f0e3` | not reached | design(admin/settings): take the Settings surface out of its card when it renders light | (pending — reason recorded at end of run) |
| `262a596b` | skipped | docs(reports): bug-hunt review of 2026-09-01 to 09-03 commits (292, unreviewed window) | docs/tests/out-of-app — no production code in scope |
| `e332ec33` | reviewed | fix(desktop): stop minting a fresh 30-day session on every launch | §4.5 — startSiteBackend session reuse; read |
| `b357e70c` | skipped | docs(architecture): reconcile ADR-INDEX with three missing ADRs and the ADR-047 audit-gap | docs/tests/out-of-app — no production code in scope |
| `26985a2d` | not reached | design(admin/media): draw the tab strip with the shared TabBar, with icons | (pending — reason recorded at end of run) |
| `fe0046dd` | not reached | design(admin/sites): make the card's head its status strip; demote the second pill to a footnote | (pending — reason recorded at end of run) |
| `ff5513fa` | skipped | docs(ads-memory): consolidated handoff from session tovu-8f | docs/tests/out-of-app — no production code in scope |
| `645f3221` | not reached | design(admin): give single-column forms one shared measure instead of the full column | (pending — reason recorded at end of run) |
| `9051e2b5` | reviewed | fix(site-dir): stop duplicateContentDb wiping every plugin's data from the copy | §4.10 — portable allow-list |
| `96f656cd` | skipped | docs(todos): pass 8 additions — record the tovu-8f peer handoff | docs/tests/out-of-app — no production code in scope |
| `b3553dd9` | not reached | fix(media): escape the last three literal NUL bytes in tracked source | (pending — reason recorded at end of run) |
| `5152128e` | skipped | docs(ads-memory): close out the todos de-stale report | docs/tests/out-of-app — no production code in scope |
| `e99249e2` | skipped | docs(todos): de-stale pass 7 — the tail sections | docs/tests/out-of-app — no production code in scope |
| `c71c5923` | skipped | docs(todos): de-stale pass 6 — Master Build Inventory sections 19-25 | docs/tests/out-of-app — no production code in scope |
| `210b3751` | skipped | docs(todos): de-stale pass 5 — Master Build Inventory sections 1-18 | docs/tests/out-of-app — no production code in scope |
| `ea5f3a42` | not reached | fix(repo): escape literal NUL bytes in source so git and grep can read them | (pending — reason recorded at end of run) |
| `27ccb328` | not reached | fix(admin-security): name every access-token dialog and give ambiguous per-row buttons distinct names | (pending — reason recorded at end of run) |
| `00718e89` | not reached | fix(admin-database): give every timeline row's Recovery link a distinct accessible name | (pending — reason recorded at end of run) |
| `ec725ad8` | not reached | fix(admin-recovery): give every row's Restore button a distinct accessible name | (pending — reason recorded at end of run) |
| `af8d083a` | skipped | docs(todos): de-stale pass 4 — Accomplish, ADR map, research backlogs | docs/tests/out-of-app — no production code in scope |
| `0d63cfd8` | reviewed | fix(site-dir): stop duplicateSite shipping the source site's private databases | §4.10 — private DBs excluded |
| `6528ed5a` | skipped | docs(todos): restore four sections pass 3 deleted by mistake | docs/tests/out-of-app — no production code in scope |
| `ef7fa9c8` | reviewed | feat(chat-db): detect conversations stranded in content.db by the chat.db split | §4.10 — chat-orphan check; read |
| `abfc98fe` | not reached | fix(admin-taxonomy): term rows get a real role, valid selected-state, and a clean name | (pending — reason recorded at end of run) |
| `e2aafba6` | not reached | fix(admin-sites): give every site card's Activate button a per-site accessible name | (pending — reason recorded at end of run) |
| `3d702539` | not reached | fix(admin-plugins): give repeated Enable/Disable/Inspect buttons a per-row accessible name | (pending — reason recorded at end of run) |
| `30288302` | skipped | docs(todos): de-stale pass 3 — Active Working Items AW-1..AW-7 | docs/tests/out-of-app — no production code in scope |
| `d10486d5` | not reached | fix(admin-themes): give repeated Activate/Explore/Download buttons a per-card accessible name | (pending — reason recorded at end of run) |
| `6442b34f` | not reached | fix(form-render): setInputValueAttr can't span an embedded opposite quote char | (pending — reason recorded at end of run) |
| `5e593ab4` | skipped | docs(todos): de-stale pass 2 — Admin Section Spec Sweep + 2026-08-10 slice | docs/tests/out-of-app — no production code in scope |
| `cb3789a9` | not reached | fix(gitignore): close chat.db + db-snapshot leak opened by the content.db split | (pending — reason recorded at end of run) |
| `df07b37c` | skipped | docs(todos): de-stale pass 1 — top-of-file dated entries | docs/tests/out-of-app — no production code in scope |
| `fe76057d` | not reached | fix(admin-media): give the upload toolbar's file/alt inputs a real accessible name | (pending — reason recorded at end of run) |
| `552e806d` | skipped | docs(reports): code-inspection bug hunt for the 2026-09-04/05 commits | docs/tests/out-of-app — no production code in scope |
| `0b298d86` | reviewed | feat(assistant): serve a staged chat attachment's bytes back to its uploader | §4.14 — read route |
| `3b196ffb` | reviewed | refactor(assistant): give the chat-attachment upload directory one definition | §4.14 — attachment dir |
| `efeeb67a` | not reached | fix(admin-themes): remove invalid button-in-anchor nesting on ThemeExplore's back control | (pending — reason recorded at end of run) |
| `f239866e` | reviewed | feat(admin-posts): tell the operator when autosave has stopped, instead of nothing | §4.3 — posts stale banner |
| `e5a434c3` | reviewed | feat(admin-pages): tell the operator when autosave has stopped, instead of nothing | §4.3 — pages stale banner copy |
| `52caa8cc` | skipped | docs(reports): scrub a NUL byte the report tool itself introduced; note it as F4 evidence | docs/tests/out-of-app — no production code in scope |
| `a9aac85b` | skipped | docs(reports): un-corrupt the 2026-09-04..05 excess-code review (literal NUL -> escape text) | docs/tests/out-of-app — no production code in scope |
| `ee304d5e` | skipped | docs(reports): architecture & DI review of the 2026-09-04/05 commits | docs/tests/out-of-app — no production code in scope |
| `ef79b352` | skipped | docs(reports): excess/dead-code review of the 2026-09-04..05 commits | docs/tests/out-of-app — no production code in scope |
| `6f32d027` | reviewed | refactor(website): inject the tool-attempt audit sink; drop RouteDeps.contentDbPath | §4.8 — audit sink injected; contentDbPath dropped |
| `0c1a1324` | not reached | chore(architecture): register cli/commands/adopt.ts as a composition root | (pending — reason recorded at end of run) |
| `b37864c3` | reviewed | feat(post-tools): wire expectedVersion through content_post_update, the guard's last unwired arm | §4.15 — "last arm" claim false: pages route |
| `2756ac26` | reviewed | refactor(posts): lift expectedVersion's boundary out of the route so a second arm can share it | §4.15 |
| `2bb817f6` | skipped | test(admin-seo): make the cleared-field test assert what its name claims | docs/tests/out-of-app — no production code in scope |
| `62634037` | reviewed | feat(cli): add `tovu adopt <dir>` -- the missing route from an existing site dir to serve | §4.7 — tovu adopt; desktop never calls it |
| `6998ef9c` | reviewed | refactor(site-dir): expose the marker-pair classification repairSite already computed | §4.7 — classifySiteMarkers exposed |
| `a50458bf` | reviewed | fix(desktop): reap orphaned tovu serve on every boot mode, never a live sibling's | §1 D-07 — reconcileOrphans parentage guard; record path left |
| `d033ffb8` | not reached | fix(admin-seo): let an operator clear an SEO override, not just blank it | (pending — reason recorded at end of run) |
| `90e68e8f` | reviewed | docs(posts-autosave): correct a route comment that described client logic which never existed | §4.3 — comment fix |
| `a60e07e8` | reviewed | fix(admin-autosave): act on putAutosave's `applied` instead of discarding it | §4.3 |
| `ed5fae17` | reviewed | fix(desktop): refuse to rm a project directory the app did not create | §1 — delete guard + origin; read |
| `72e1e529` | reviewed | fix(assistant): stop every source edit from destroying staged chat attachments | §4.14 — read |
| `f3bdd3af` | reviewed | feat(admin-posts): send the loaded version and surface the 409 without losing the operator's work | §4.15 — posts editor only |
| `fb473613` | not reached | feat(admin-settings): pass agentHandle to the 11 @jini-ai/ui-mounted Settings tabs | (pending — reason recorded at end of run) |
| `b359e613` | reviewed | fix(website): add RouteDeps.contentDbPath and make the BYOK tool-audit sink lazy | §4.8 — superseded by 6f32d027 |
| `e595312f` | reviewed | types(admin-api): let api.updatePost carry an optional expectedVersion | §4.15 |
| `76d7c739` | reviewed | fix(desktop): one adoption chokepoint for every site-dir entry point | §4.7 — desktop adoptSiteDir chokepoint; 2nd classifier |
| `ffc37e59` | skipped | docs(ads-memory): refactor review of the 2026-09-06 commits - excess and dead code | docs/tests/out-of-app — no production code in scope |
| `b81d57b1` | skipped | docs(ads-memory): code-inspection bug hunt over the 2026-09-06 commits | docs/tests/out-of-app — no production code in scope |
| `4e64e467` | skipped | docs(ads-memory): architecture and DI review of the 2026-09-06 commits | docs/tests/out-of-app — no production code in scope |
| `eb678ed3` | not reached | feat(voice-input): add a "Disabled for now" tooltip to the mic button | (pending — reason recorded at end of run) |
| `9c7d16bf` | reviewed | feat(posts-route): forward expectedVersion and give the version 409 its own code | §4.15 |
| `a9f84cdc` | not reached | refactor(admin-pages): bring PageEditor under the 9/9 complexity ceiling | (pending — reason recorded at end of run) |
| `0b7b6de1` | not reached | fix(admin-pages): let a newly created page accept hand-authored HTML | (pending — reason recorded at end of run) |
| `be45461e` | reviewed | feat(post): add opt-in optimistic-concurrency check to updatePost | §4.15 — expectedVersion in updatePost |
| `f92e835f` | skipped | docs(ads-memory): record the f3579456 authorship misattribution | docs/tests/out-of-app — no production code in scope |
| `bbd297d8` | reviewed | fix(desktop): make Projects-screen seeding survive an emptied registry | §1 — seed guard per-directory; read |
| `013ca04e` | skipped | docs(ads): record the outstanding worklist from session tovu-f6 | docs/tests/out-of-app — no production code in scope |
| `7afe17a7` | skipped | docs(admin): correct pages/posts as done, not permanently excluded | docs/tests/out-of-app — no production code in scope |
| `48bf42c8` | not reached | fix(admin-posts): tag PostEditor's delete ConfirmDialog with agentHandle | (pending — reason recorded at end of run) |
| `f3579456` | not reached | feat(admin-pages): tag PageEditor's remaining view/device controls | (pending — reason recorded at end of run) |
| `3ad87f39` | not reached | feat(admin-pages): tag ThemePagesTab and ThemePageDetailsModal controls | (pending — reason recorded at end of run) |
| `2202253d` | not reached | feat(admin-pages): tag Pages.tsx's list and tab controls | (pending — reason recorded at end of run) |
| `56f6b46b` | not reached | feat(admin-posts): tag Posts.tsx's list controls | (pending — reason recorded at end of run) |
| `6462865e` | skipped | docs(admin): correct the Access Tokens live-verification handle names | docs/tests/out-of-app — no production code in scope |
| `fe5c8974` | skipped | docs(admin): record Phase 4 - ai-assistant, media, and the 8 spot-check screens | docs/tests/out-of-app — no production code in scope |
| `c84559e8` | not reached | fix(admin-security): tag credential fields and Cancel/trigger buttons | (pending — reason recorded at end of run) |
| `34a69401` | not reached | fix(admin-deployment): tag the two remaining external links on Static Site | (pending — reason recorded at end of run) |
| `273b43cb` | not reached | fix(admin): tag remaining agent-driveable gaps in sites and collections | (pending — reason recorded at end of run) |
| `935762a5` | not reached | fix(admin-media): pass agentHandle to the purge ConfirmDialog | (pending — reason recorded at end of run) |
| `978a7ca3` | not reached | feat(admin-ai-assistant): tag AiAssistant screen's Tovu-owned controls | (pending — reason recorded at end of run) |
| `125b8dcc` | skipped | docs(admin): record pages/posts as permanently excluded from the agent-tag sweep | docs/tests/out-of-app — no production code in scope |
| `8383d732` | skipped | docs(admin): record Phase 3 live verification and handoff for the agent-tag sweep | docs/tests/out-of-app — no production code in scope |
| `ffc6ce5e` | skipped | docs(admin): update agent-tag coverage report through the settings pass | docs/tests/out-of-app — no production code in scope |
| `7637876d` | not reached | feat(admin-settings): tag the Tovu-owned controls on /admin/settings | (pending — reason recorded at end of run) |
| `feb8a777` | reviewed | feat(assistant): add chat_list_pending_attachments so the model can find unclaimed uploads | §4.14 — read |
| `fb5a1909` | not reached | feat(admin-themes): tag the remaining controls on the main Themes screen | (pending — reason recorded at end of run) |
| `98e3021c` | not reached | feat(admin-payments): tag the three cross-links on /admin/payments | (pending — reason recorded at end of run) |
| `d52258af` | not reached | feat(admin-plugins): tag Plugins, AgentPlugins, and the plugin details modal | (pending — reason recorded at end of run) |
| `10efb899` | reviewed | fix(autosave): flush the pending standing draft on exit instead of cancelling it | §4.3 |
| `eb10f5de` | not reached | fix(seo): allow clearing a per-entry SEO override via null | (pending — reason recorded at end of run) |
| `c08155f2` | not reached | feat(admin-redirects): tag every control on /admin/redirects | (pending — reason recorded at end of run) |
| `be0f582a` | not reached | feat(admin-integrations): tag the remaining controls on /admin/integrations | (pending — reason recorded at end of run) |
| `b5439d94` | not reached | feat(admin-workspace): tag the rename form and delete button | (pending — reason recorded at end of run) |
| `a5dd5e09` | not reached | feat(admin-recovery): tag every control on /admin/recovery | (pending — reason recorded at end of run) |
| `c629c0e6` | not reached | feat(admin-widgets): tag every control across all four widgets screens | (pending — reason recorded at end of run) |
| `cdb205a5` | not reached | feat(admin-dashboard): tag every link on the Overview screen | (pending — reason recorded at end of run) |
| `f7b8af1c` | skipped | test(assistant): prove media_promote_chat_attachment is generic, not AVIF-specific | docs/tests/out-of-app — no production code in scope |
| `6e71742c` | not reached | feat(admin): wire agentHandle onto every remaining untagged ConfirmDialog | (pending — reason recorded at end of run) |
| `1d5c0376` | skipped | docs(desktop-e2e): correct a comment that promised isolation the suite does not have | docs/tests/out-of-app — no production code in scope |
| `f281d3a2` | reviewed | feat(assistant): add media_promote_chat_attachment, bridging chat uploads into the media library | §4.14 — read |
| `e804d16d` | not reached | feat(admin-comments): tag every control on /admin/comments | (pending — reason recorded at end of run) |
| `cbbda021` | not reached | feat(admin): tag Members' remaining controls and wire ConfirmDialog handles | (pending — reason recorded at end of run) |
| `54051fe3` | reviewed | fix(desktop): rename the fleet window title from Tovu Runner to Tovu | trivial title rename |
| `7198436e` | not reached | feat(admin-seo): tag the per-entry override editor and picker for agent driving | (pending — reason recorded at end of run) |
| `a53c80df` | reviewed | feat(desktop): make the Projects screen the default front page | §1 — fleet UI default; boot branch |
| `a4efd9c2` | not reached | feat(admin-roles): tag the remaining untagged controls on /admin/roles | (pending — reason recorded at end of run) |
| `4f2052f6` | not reached | fix(admin-assistant): move the composer mic button next to the "+" | (pending — reason recorded at end of run) |
| `79ade955` | not reached | feat(admin-database): tag every interactive control on /admin/database | (pending — reason recorded at end of run) |
| `ab5f4b0f` | not reached | feat(admin): wire agentHandle through every Placeholder-backed nav page | (pending — reason recorded at end of run) |
| `8cfb8eb9` | skipped | docs(admin): audit agentHandle coverage across every nav-listed admin page | docs/tests/out-of-app — no production code in scope |
| `27a05955` | skipped | docs: handoff for the rotated-out autosave-drafts agent | docs/tests/out-of-app — no production code in scope |
| `34694309` | reviewed | wip(posts): autosave recovery banner in PostEditor, state unverified | §4.3 — posts banner (wip commit on branch) |
| `a4b99c90` | reviewed | feat(pages): render the standing-draft recovery banner in PageEditor | §4.3 — pages banner copy |
| `559655cb` | reviewed | feat(posts): wire standing-draft autosave into usePostEditor; fix slug URLs | §4.3 — posts wiring |
| `0911b45d` | skipped | docs: record that both handoff tasks belong to the peer session | docs/tests/out-of-app — no production code in scope |
| `3f6097dc` | not reached | design(admin/seo): drop the Entry caption and take Pages & posts full width | (pending — reason recorded at end of run) |
| `24386850` | skipped | docs: handoff for a second session - mic button, and the AVIF upload bridge | docs/tests/out-of-app — no production code in scope |
| `05782b71` | reviewed | feat(pages): wire standing-draft autosave + add the missing unsaved-work guard | §4.3 — pages wiring |
| `3a3dea2b` | skipped | docs(admin/seo): correct the file header the de-carding made stale | docs/tests/out-of-app — no production code in scope |
| `613ea7e2` | not reached | design(admin/seo): take the per-entry panels out of their boxes too | (pending — reason recorded at end of run) |
| `9ac963e0` | reviewed | fix(posts): standing-draft autosave carries title explicitly | §4.3 |
| `f8fc6b8e` | not reached | design(admin/seo): take the defaults form and sitemap panel out of their cards | (pending — reason recorded at end of run) |
| `56a0fc09` | reviewed | feat(admin): shared standing-draft autosave hook + api client functions | §4.3 — shared hook |
| `eba275f4` | reviewed | feat(posts): standing-draft autosave persistence + HTTP surface (posts+pages) | §4.3 — autosave persistence + route |
| `868cfe72` | reviewed | feat(desktop): route project cards to their own window, strip the webview model | §4.5 — windowing churn; superseded by 204e01a7 same night |
| `04806e6b` | not reached | feat(media): accept AVIF in the admin upload surfaces, with regression tests | (pending — reason recorded at end of run) |
| `72a8dcb6` | not reached | feat(admin-roles): convert /admin/roles to a two-tab screen | (pending — reason recorded at end of run) |
| `e94da8f8` | reviewed | feat(posts): add nullable posts.autosave_json column for standing-draft autosave | §4.3 — migration 0058 |
| `20be2646` | skipped | docs(tasks): refresh - 23 commits landed, four agents in flight, five new findings | docs/tests/out-of-app — no production code in scope |
| `cbb727db` | reviewed | fix(desktop): restore own-server boot mode gutted by the boot-token commit | §4.5 — restored own-server mode |
| `56e87ae0` | not reached | feat(admin-seo): convert /admin/seo to a three-tab screen | (pending — reason recorded at end of run) |
| `2c6e0b07` | not reached | fix(post-editor): move preview-fallback notice above the frame, mirroring Pages | (pending — reason recorded at end of run) |
| `cf05115c` | skipped | docs(desktop): handoff for the rotated-out runner-ui-port agent | docs/tests/out-of-app — no production code in scope |
| `15548bef` | reviewed | feat(auth): loopback boot token — the desktop admin comes up with no password | §4.5/§4.6 — boot token; gutted main.cjs |
| `0a1fb89e` | not reached | fix(admin-settings): remove the peach background from /admin/settings | (pending — reason recorded at end of run) |
| `30e68c54` | not reached | fix(admin-editors): compress the action row's band and give it a left anchor | (pending — reason recorded at end of run) |
| `de1e1e2e` | skipped | test(desktop-e2e): assert the admin comes up authenticated | docs/tests/out-of-app — no production code in scope |
| `2aa317ab` | reviewed | feat(desktop): the admin comes up authenticated — no login screen | §4.5 — desktop auth (superseded by 15548bef) |
| `fb996e8f` | reviewed | feat(desktop): use the Tovu logo as the app and nav mark | asset only |
| `29a7f036` | not reached | feat(admin-editors): move Published/Save/Delete to their own row under the toolbar | (pending — reason recorded at end of run) |
| `8e5a9d74` | not reached | feat(admin-editors): centre the editor title, move the back link to the far left | (pending — reason recorded at end of run) |
| `5178eea5` | skipped | design(landing): gold, black and white — the filled pill goes gold in dark mode | docs/tests/out-of-app — no production code in scope |
| `717273e8` | skipped | docs(tasks): no SITE password at all, and the default-owner-password finding | docs/tests/out-of-app — no production code in scope |
| `b3f613a6` | skipped | design(landing): cycle the hero verb with kUInetic's word-cycler, as x.ai does | docs/tests/out-of-app — no production code in scope |
| `14167454` | skipped | test(desktop): first E2E that actually launches apps/desktop, and one RED | docs/tests/out-of-app — no production code in scope |
| `f66ef907` | skipped | design(landing): rebuild the xAI-language homepage sample around x.ai's structure | docs/tests/out-of-app — no production code in scope |
| `af67f51e` | skipped | docs(desktop): manifest v2 — option-2 scope, N-BrowserWindow model | docs/tests/out-of-app — no production code in scope |
| `6a0bd61c` | reviewed | feat(desktop): port the Runner preload and add TOVU_DESKTOP_UI=runner | §1 D-02 — Runner preload port |
| `4c75f4c0` | reviewed | feat(desktop): port Tovu-Runner s renderer and shared contracts | §1 D-02 — Runner renderer + contracts port (database axis) |
| `10fb9215` | reviewed | build(desktop): stand up the renderer build inside apps/desktop | build wiring only; read |
| `098e3466` | skipped | docs(desktop): record the Tovu-Runner UI port manifest before any code lands | docs/tests/out-of-app — no production code in scope |
| `46513d83` | skipped | docs(ads-memory): hand off tovu-c0 — three owner-only commands, and apps/desktop never launched | docs/tests/out-of-app — no production code in scope |
| `32af5802` | skipped | docs(index): record the reverted HTTP/2 attempt (Node-core crash, reproduced 3x) | docs/tests/out-of-app — no production code in scope |
| `2cd019cd` | not reached | fix(assistant,settings): drop the Connection header on HTTP/2 SSE streams | (pending — reason recorded at end of run) |
| `848ddd09` | not reached | fix(admin-dev-proxy): strip hop-by-hop headers before relaying Vite's response | (pending — reason recorded at end of run) |
| `d131619d` | reviewed | feat(site-dir): add repairSite — write marker files into a pre-marker-convention site | §4.7/§4.10 — repairSite; 2nd CONTENT_DB constant |
| `8a14b56a` | reviewed | refactor(site-dir): extract readAppliedSchemaIdentity, shared by the boot guard and repair-site | §4.7 — readAppliedSchemaIdentity shared; good |
