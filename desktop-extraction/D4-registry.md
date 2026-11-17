# D4: project registry and folder identity (4 runs)

Inherits `COMMON.md`. Survey step 4. Order: D4a1 -> D4a2 -> D4b -> D4c. Needs D1b1 merged (it reshapes `project-ipc.ts`'s registration block) and D3a (the lifecycle code imports the moved supervisor types).

## Measured (reading tree)

| File (lines; functions) | Verdict |
|---|---|
| `project-ipc.ts` (1,730; 58 functions; 30 exports; 23 IPC registrations; in `size-debt.json`) | **SPLIT first** (D4a). `refactor/desktop-args` already took `project-ipc.site-lifecycle.ts` (364) out of it. |
| `site-relocation.ts` (277; 9) moved-folder healing by a stable id | MOVE the rule (D4b); id reading (`siteId` / `siteKeyId` from Tovu's `config.json`) stays as a port |
| `project-delete-guard.ts` (190; 5) real-path containment + "still the recorded folder" check before erase | MOVE `resolveRealPath`, `isInsideDirectory`, the erase decision (D4b); `readSiteIdentity` stays as a port |
| `add-site-pointer.ts` (206; 3) | MOVE `normalizeSiteDirPath` + the refusal rules that are not Tovu's (D4b); classifier stays |
| `site-dir-store.ts` (650; 17; touched by wave-b) | SPLIT in D4b: MRU list (`MAX_RECENT_SITE_DIRS`, `rememberSiteDir`, `existingRecentSiteDirs`, about 150 to 200 lines) moves; `initSiteDir` (`tovu init`), dev fallback, marker names stay |
| `remove-site-tree.ts` (35) make-writable then remove | MOVE (D4b) |
| `site-folders.ts` (164), `shared-sites.ts` (221), `site-directory-identity.ts` (113), `durable-json-file.ts` (56) | STAY: they are already bindings over `@jini-ai/platform/fs` (`createNodeDirectoryWorkspace`, `createDirectoryRegistry`, durable JSON) with Tovu names |
| `tracked-sites.ts` (716; 25), `site-config.ts` (167), `nested-sites-migration.ts`, `move-site-home.ts`, `site-archive-import.ts`, `site-discovery*.ts`, `site-name*.ts` | STAY (Tovu file formats and migrations) |
| Renderer: `use-site-rename.hooks.ts` (220), `use-site-locate.hooks.ts` (74), `use-delete-confirmation.hooks.ts` (59), `use-site-folders.hooks.ts` (95), `use-sites-folders-dialog.hooks.ts` (68), `use-site-list-prefs.hooks.ts` (69) | MOVE part to `@jini-ai/ui/site-card` (D4c) |

Movable: about 800 to 1,000 lines main-process (D4b) + about 400 to 580 renderer (D4c) = **1.2 to 1.6k** (survey: 1.8 to 2.6k; the difference is `shared-sites`/`site-folders`/identity, which turned out to be bindings already).

Existing Jini owners (searched): `platform/src/fs/` has `directory-registry.ts`, `directory-workspace.ts` (`canonicalNodeDirectory`), `directory-running-lock.ts`, `verified-directory-move.ts` (`moveDirectoryVerified`, `directoryFingerprint`), `verified-file-relocation.ts`, `strict-containment.ts` (`resolvePathWithin`), `user-data-directories.ts`. **`isInsideDirectory`/`resolveRealPath` overlap `strict-containment.ts` and `canonicalNodeDirectory`: compare before adding.**

---

## D4a1 and D4a2: split `project-ipc.ts` (Tovu only; ~180k each; proof T, then E)

No behaviour change; no Jini edit. Target files (each <= 500 lines, functions <= 50):

| New file | Takes | Run |
|---|---|---|
| `project-ipc.records.ts` | `buildSiteRecord`, `siteRecordLifecycle`, `foreignServerMessage`, `unreadableRegistryMessage`, `handleList`, `rescanSites` | a1 |
| `project-ipc.folders.ts` (the **generic folder verbs**) | `handleLocate`, `handleRename`, `handleDelete` + `deleteProject` + `eraseProjectDirectory`, `handleAddSite` + `pickSiteFolder`, `handleAddSiteFolder`, `handleOpenExternal`, `handleGetPreview` | a1 |
| `project-ipc.create-import.ts` (**Tovu verbs**) | `planNewSiteDir`, `handleCreate`, `pickArchive`, `archiveSource`, `handleImportArchive`, `importSharedSiteDiscovery`, `handleTokenSignInPlugins` | a2 |
| `project-ipc.power.ts` | `handleStart`, `explainMissingSiteDir`, `handleStop`, `stopExternalServer`, `stopSiteServer`, `createSitePresence`, keep-running | a2 |
| `project-ipc.ts` (stays; registration table only) | `SITE_IPC_CHANNELS` re-declaration if any, the 23 registrations, `deps` type | a2 |

**Do not partition by this table alone (lesson 1).** First build the real graph: for each of the 58 functions list (a) who calls it, (b) which module-level `const`/`let` it reads or writes, (c) which closure variables of the registration function it captures (`states`, `ctx`, `relocationGate` are created inside the registration function and passed as `{ ...deps, siteRuntime: states }`). Put the table in the report. A function moves only with every private helper that only it uses; a helper with callers in two targets goes to `project-ipc.shared.ts`. Any module-level mutable state gets exactly one owning file and is reached by function call, not by import of a `let`.
- `project-ipc.test.ts` and `project-ipc-dispatch.test.ts` (both among the 13 conflicted files) and any test that reads `project-ipc.ts` as text (`rg -l "project-ipc" apps/desktop/src -g '*.test.*'`): update imports in the same commit as the move they follow; no assertion changes.
- One commit per target file, each green (`npm run typecheck && npm test`), each with the `size-debt.json` entry for `project-ipc.ts` lowered or removed by its real new size (never raised; no new key).
- Security gates on this path (class: destructive filesystem action from IPC; location: delete handler): the erase path calls `mayEraseSiteDirectory` before removing anything, and refuses when a foreign server is live. Characterization test first: delete is refused (a) when the folder's identity no longer matches the row, (b) when the real path escapes every scan root through a symlink, (c) while a foreign server holds the folder; each test fails if its guard call is deleted. (Class: opening a path or URL from IPC; location: open-external handler): `handleOpenExternal` validates its input surface against the record before calling the shell port; test with an id that is not a known site and with a surface outside the allowed set.
Proof E: sites home: add folder, rename, locate a moved folder, delete (with and without files), start/stop, import archive.

---

## D4b: folder rules to `@jini-ai/platform/fs` (Jini + Tovu pair; ~220k; proof T)

```
id: D4b-fs-rules
new (Jini, each an export key under ./fs/..., runtime node):
  packages/platform/src/fs/directory-relocation.ts   <- site-relocation.ts: planRelocations, planRow, relocationTarget, movedRow, childPathsOf, createRelocationGate
  packages/platform/src/fs/directory-erase-guard.ts  <- project-delete-guard.ts: the erase decision (+ resolveRealPath/isInsideDirectory unless step 1 finds an owner)
  packages/platform/src/fs/recent-directories.ts     <- site-dir-store.ts MRU functions
  packages/platform/src/fs/remove-tree.ts            <- remove-site-tree.ts
stays (Tovu): readRelocationId, readSiteIdentity, classifySiteDir, file names, log copy ("tovu desktop: healed moved site ..."), repointTrackedSite (writes Tovu's projects file)
```
1. **Owner comparison first.** `isInsideDirectory({ target, container })` vs `resolvePathWithin({ root, segment })` and `resolveRealPath` vs `canonicalNodeDirectory`: table of inputs and outputs for: equal paths, a case-only difference on a case-insensitive volume (the guard's header names `/repo/Sites` vs `/repo/sites`), a symlinked parent, a missing leaf, a Windows drive-letter case difference, a UNC path. If an existing function gives the same answers, use it; if not, the new function lives beside it and the report says why two exist.
2. Ports: `readIdentity: (r: { dir: string }) => string | null`, `classify: (r: { dir: string }) => 'project' | 'empty' | 'other'`, `filesystem` (the subset of `node:fs` each function uses, as the neighbouring files do), `log`. The generic code never reads `config.json` or names a marker file.
3. Lesson 7: relocation today distinguishes "moved", "merged" (stale duplicate removed), "ambiguous" (two candidates carry the id) and "missing". Keep four outcomes in the return type; ambiguous must never pick one.
4. **Windows:** relocation compares directory paths; add cases with backslashes and mixed case. `remove-tree`: read-only files on Windows need the writable pass before removal (that is what `makeSiteTreeWritable` is for); test with a fake filesystem that refuses `rm` until `chmod` ran.
5. `site-dir-store.ts` was edited by wave-b (40 lines): read the current file; move only functions whose bodies name no Tovu marker.

Tests first: the four desktop test files move (converted to vitest, assertions unchanged, count reported) and gain: erase guard refuses when identity is unreadable (`null`), not only when different; relocation gate runs one plan at a time and a second call during a run gets the same promise; MRU keeps at most N, drops missing directories only when asked, never reorders on read.
Tovu commit: the four desktop files become bindings (ports wired to `site-config`/`tracked-sites`) or are deleted where nothing Tovu-specific is left; importers repointed (`project-ipc.folders.ts`, `main/index.ts`, `add-site-pointer.ts`, tests).

## D4c: project list hooks to `@jini-ai/ui/site-card` (Jini + Tovu pair; ~200k; proof T, then **E**; UI: review by Opus)

`@jini-ai/ui/site-card` exists (293 lines: `SiteCard.tsx`, `SiteListToolbar.tsx`, `use-site-list-view.hooks.ts`, `site-list-view.ts`) and the desktop already imports it in 4 places. Move the **logic** of rename (validation, optimistic update, error line), locate, delete confirmation and list preferences from the six renderer hooks into that feature folder as hooks that take a `ProjectListPort` (`rename`, `locate`, `remove`, `readPrefs`, `writePrefs`); Tovu binds the port to `runner-api.ts`. Rules: every hook a component uses is a prop defaulted to the real hook (S2); copy arrives as arguments (no `desktop-i18n` import in Jini; `useT` is injected); storage arrives as a port (today `use-site-list-prefs` takes `storage = windowStorage`: keep that injection, the desktop-args plan notes a default-slot `useListPrefs = useSiteListPrefs` in `SiteGrid` that must stay injected). Inventory first: each hook's exports, its callers (`SiteGrid.tsx` 749 lines, in `size-debt.json`), tests, and which strings are Tovu's. If a hook's generic part is under 40 lines, leave it. `ui` may import only itself, core, protocol and `@jini-ai/ui-kit/react`.
Proof E (2x screenshots, light and dark): grid and list view; rename inline with an invalid name; locate; delete dialog.
