# Desktop code audit

Agent: Code Inspection (Advisory). Inputs: user audit mandate, frozen HEAD efc6847ed4490d0f57cd94d16b8cf46a6489a88a, window 4b89cd09..HEAD. Scope: surviving production desktop source, correctness and wiring. Tests, builds, compiler checks, runtime probes, source changes, and database opens are excluded by user instruction. Findings are appended immediately as confirmed.

Graph discovery returned no nodes for the new project-registry symbols; direct HEAD reads are used as the freshness fallback. Coverage is recorded separately in `02-desktop-coverage.json`. No live process or credential values are included.

## Findings

### D-01 — Medium — A single unreadable discovery candidate prevents desktop startup

- **Location:** `apps/desktop/src/project-registry.cjs:303–304`; `apps/desktop/main.cjs:1001`; sibling MRU path `apps/desktop/src/site-dir-store.cjs:98–99,127–132`.
- **Status:** **CONFIRMED** by reading the whole discovery-to-boot error path; not executed.
- **Concrete scenario:** `<repo>/sites` contains an ordinary directory whose contents the current user cannot read and which lacks both site markers. `discoverSiteDirs` stats the directory successfully, then calls `classifySiteDir`; its `readdirSync` throws EACCES. Only root enumeration is caught in discovery. The error therefore escapes `rescanProjects` at fleet boot before `openFleetWindow`, reaches `reportBootFailure`, and exits the whole app without showing any otherwise valid project. A symlink loop whose `statSync` throws likewise escapes; `throwIfNoEntry:false` covers missing entries, not all filesystem errors. The `knownDirs` thunk also calls the unguarded classifier before discovery can filter candidates, so a remembered directory replaced by a plain file produces the same boot failure via ENOTDIR.
- **Impact:** One unrelated or stale on-disk candidate blocks the default desktop launch. The renderer rescan-error fix cannot help because the renderer has not opened yet.
- **Required action / routing:** Isolate candidate classification failures and preserve discoverable projects; make the boot scan best-effort with a visible/logged failure. `IMPLEMENTATION_FIX_REQUIRED`; operator owns follow-up.

### D-02 — Medium — Hosted database selection is accepted, then silently discarded

- **Location:** `apps/desktop/src/project-ipc.cjs:113–122` (also `:69`); selectable controls `apps/desktop/src/renderer/CreateWebsiteOnboarding.tsx:68–70`.
- **Status:** **CONFIRMED** by reading the whole form → renderer callback → preload → IPC handler → `adoptSiteDir` → CLI invocation path; not executed.
- **Concrete scenario:** An operator selects Supabase, fills its URL and key (or selects Custom DB Provider and fills its fields), and submits an otherwise valid name. `buildCreateProjectInput` passes that database choice through `createProject`. The real main handler reads only `input.displayName`; it calls `adoptSiteDir` with no database configuration. `initSiteDir` invokes only `tovu init <dir> --name <name>`. The handler then reports success with a record that unconditionally says `database: { kind: "sqlite" }`. Thus a supported-looking, enabled choice creates the same local site as SQLite without warning that the requested provider was ignored. Both hosted-provider siblings are affected.
- **Impact:** The stored site does not use the database the operator selected. The form’s prototype text does not prevent the real success path or explain this substitution.
- **Required action / routing:** Disable/reject unsupported choices until their full provisioning path exists, or honor them end to end. `IMPLEMENTATION_FIX_REQUIRED`; operator owns follow-up.

### D-03 — Medium — Webview failure recovery is unwired after a normal Start site

- **Location:** `apps/desktop/src/renderer/App.tsx:512,585–639`; `apps/desktop/src/renderer/App.hooks.ts:652–687`.
- **Status:** **CONFIRMED** by reading the component lifecycle and hook dependencies end to end; not executed.
- **Concrete scenario:** Open any stopped project tab. `ProjectWorkspace` mounts with a null `webviewRef` because it renders `ProjectStartPanel`, so `useWebviewLoadFailure` returns before installing any listener or timer. Click Start site. The poll later changes `project.status` to running and mounts the webview, but the effect depends only on the stable ref object and `reloadNonce:view`; neither changed. The newly mounted guest therefore has no `did-fail-load`/`did-finish-load` listeners and no stall timeout. A failed or hung first admin load stays blank instead of displaying the recovery panel. The same hole recurs when a failure panel is retried: the reset effect runs while `failed` is still true and the ref is null; its state reset mounts a new guest only on the next render, after the effect has already returned.
- **Impact:** The implemented recovery primitive does not observe the guests produced by the ordinary startup/retry paths. Reloading a healthy mounted guest happens to reattach listeners, so that sibling alone works.
- **Required action / routing:** Bind observation to the actual guest node/lifetime (or a child mounted with it), including both status transition and failure retry. `IMPLEMENTATION_FIX_REQUIRED`; operator owns follow-up.

### D-04 — High — A stale created-project row authorizes deletion of a replacement directory

- **Location:** `apps/desktop/src/project-delete-guard.cjs:104–107`; `apps/desktop/src/project-ipc.cjs:152–167`.
- **Status:** **CONFIRMED** by reading creation/provenance storage, record-to-UI policy, and deletion end to end; not executed.
- **Concrete scenario:** The shell creates a site in an empty directory outside the repo and records `{siteDir, origin: "created"}`. Later the operator moves that site elsewhere and reuses its former pathname for unrelated files or another site. The project registry does not record a workspace identity or original directory identity. `handleDelete` fetches the stale row; `mayEraseProjectDirectory` verifies only the stored origin and current containment outside the checkout. It never checks that the current directory is the site the app created, or even that it still contains site markers. Confirming delete on the stale card recursively erases the replacement directory.
- **Impact:** Permanent deletion of files the desktop app did not create, despite the guard’s stated guarantee. The separate provenance and containment checks do not establish the identity of the current directory at that path.
- **Required action / routing:** Bind destructive authorization to the created workspace/directory identity and verify it immediately before removal, failing closed when missing or replaced. `IMPLEMENTATION_FIX_REQUIRED`; operator owns follow-up.

### D-05 — High — Delete can erase a project while its Start operation is still opening it

- **Location:** `apps/desktop/src/project-ipc.cjs:151–167,205–211,279–281`; `apps/desktop/main.cjs:569–575`.
- **Status:** **CONFIRMED** by reading renderer navigation, IPC dispatch, serializer use, and server publication end to end; interleaving not executed.
- **Concrete scenario:** Click Start site in an existing created-project tab, return to All while startup is pending, and confirm delete. `handleStart` validates the row and enters the per-id serializer, but `openSiteServer` only adds the entry to `openSites` after awaited server startup/authentication. Delete does not enter that serializer. It can observe no `openSites` entry, skip stopping the child that is already starting, untrack the row, and call recursive `rm` on its site directory. Startup can subsequently finish and publish an untracked running entry. The reverse ordering also permits a start whose row was read before delete to continue after deletion because row validation occurs outside the serialized operation.
- **Impact:** Site files can be removed under an opening database, and an in-flight start can resurrect supervision for a project that just disappeared. This contradicts the deletion path’s claim that the child is always stopped before directory removal.
- **Required action / routing:** Serialize start and delete on the same site key and perform tracked-row/identity validation within that ordering boundary. `IMPLEMENTATION_FIX_REQUIRED`; operator owns follow-up.

### D-06 — Medium — A crashed project remains running forever and Start site reuses its dead handle

- **Location:** `apps/desktop/src/tovu-server.cjs:467–471,514–517`; `apps/desktop/main.cjs:569–575`; `apps/desktop/src/project-ipc.cjs:54–71`.
- **Status:** **CONFIRMED** by reading child exit handling, the live map, list/start handlers, and the recovery button end to end; not executed.
- **Concrete scenario:** A fleet project boots successfully, then its `tovu serve` process exits or crashes. `startTovuServer` has already set `settled = true`, so its only exit listener's `finish` call is a no-op; the returned handle exposes no exit notification and nothing removes this entry from `openSites`. Every 4-second list poll therefore still reports running. If the guest load fails and the operator clicks Start site in the recovery panel, `handleStart` calls `openSiteServer`, which returns the same dead server handle because the map entry exists. No replacement child starts. Closing/reopening its tab also reuses the entry.
- **Impact:** A recoverable child crash wedges the project for the rest of the desktop session and keeps the running count/status false. The source comment claiming polling catches sites that crash is unsupported by the producer of that status.
- **Required action / routing:** Propagate post-ready exit events into supervision state, clear only the matching handle, and allow explicit start to spawn a replacement. `IMPLEMENTATION_FIX_REQUIRED`; operator owns follow-up.

### D-07 — Medium — Opening one site from two desktop instances drops the first child’s crash-safety record

- **Location:** `apps/desktop/src/site-registry.cjs:86–88`; `apps/desktop/main.cjs:569–575`.
- **Status:** **CONFIRMED** by reading boot reconciliation, process spawn/reuse, and registry writes end to end; not executed.
- **Concrete scenario:** Desktop instance A opens site X. Start instance B with the same userData; the new parentage guard correctly retains A’s live child row. B’s `openSites` map is nevertheless empty. Opening X in B starts another `tovu serve`, and `recordSiteOpened` replaces the existing registry row purely by siteDir, discarding A’s PID. If A is subsequently hard-killed, no persisted row names its stranded child. Later launches cannot reconcile it, and no status poll rewrites A’s row. This is a deterministic same-directory replacement, even without simultaneous JSON writes.
- **Impact:** The live-sibling protection fixes termination but leaves its sibling spawn/registration path able to erase the very crash-safety record it preserved. A second server is allowed over the same site, and the first can become permanently undiscoverable to reconciliation after a crash.
- **Required action / routing:** Enforce one owner for each site or record independently identified owner/child instances instead of replacing a live sibling’s row by pathname. `IMPLEMENTATION_FIX_REQUIRED`; operator owns follow-up.

