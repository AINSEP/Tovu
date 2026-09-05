# Runner vs. `apps/desktop` — feature-parity matrix

Status: FILLED IN. Code-level audit only — no app was launched, no test was run, no file outside
`ADS-memory/` was modified. `/Users/la/Programming/Tovu-Runner` was read-only throughout.

## Method / sampling

Direct `rg`/`find`/`Read` exploration (Runner's `src/` is 50 files, ~9,727 lines — file counts
stayed under the codebase-analyzer skill's 500-file graph-backend threshold, so no graph backend
was used). Every line count below is a real `wc -l`, not an estimate. Files actually read in full
or near-full: `project-registry.ts`, `project-provisioner.ts`, `runner-daemon.ts`, `main.ts`,
`secure-credentials.ts`, `tovu-cli.ts` (first 280 lines), `fleet-chat-ipc.ts` (head), the three MCP
files (heads only, for their design-rationale comments), `App.tsx`/`ProjectGrid.tsx`/
`CreateWebsiteOnboarding.tsx` (heads only — renderer bodies were sampled, not read end to end).
`apps/desktop`'s all five source files were read in full (it is 1,484 lines total). Not read in
full: `runner-tools.ts`, `runner-mcp-bridge.ts`/`runner-mcp-server.ts` bodies,
`fleet-conversation-store.ts`, `working-directory-store.ts`, `App.hooks.ts` (1,209 lines — sampled
for imports/exports only), `app.css`. Confidence: High on every line count and every file:line cite
below; Medium on renderer UX detail (sampled, not exhaustively read); the sibling
`runner-vs-desktop-shots` agent's screenshots are the higher-confidence source for actual UX.

**Prior-numbers check (team lead's estimates, "treat as unverified"):**
- `project-registry.ts` ~310 → **actual 310.** Exact.
- `project-provisioner.ts` ~884 → **actual 884.** Exact.
- Contracts ~800 → **actual 828** (`chat-attachments.ts` 35 + `fleet-chat.ts` 125 +
  `fleet-conversations.ts` 52 + `project.ts` 79 + `runtime-inventory.ts` 28 + `sections.ts` 264 +
  `site-assistant-tools.ts` 228 + `working-directory.ts` 17). Close.
- Fleet chat/store/IPC ~1,950 → the literal fleet-chat/store/IPC files (`fleet-chat-ipc.ts` 204 +
  `fleet-conversation-store.ts` 224 + `contracts/fleet-chat.ts` 125 +
  `contracts/fleet-conversations.ts` 52 + `renderer/fleet-chat-transport.ts` 422) sum to **1,027**,
  not ~1,950. Adding `runner-mcp-bridge.ts` (428) + `runner-tools.ts` (487) — both of which carry
  fleet-chat tool-call plumbing — gets to 1,942, i.e. the ~1,950 figure only holds if "fleet
  chat/store/IPC" is read to include the MCP bridge and the tool registry. Stated as given, the
  number is **too high by ~2x**; corrected by widening the grouping it becomes accurate.
- Renderer (grid/onboarding/hooks/CSS) ~3,300 → `ProjectGrid.tsx` 229 + `CreateWebsiteOnboarding.tsx`
  256 + `App.hooks.ts` 1,209 + `app.css` 1,437 = **3,131**. Close (~5% low); adding `icons.tsx` (150)
  gets to 3,281, essentially exact.
- **Verdict: the individual-file numbers were exact; the two "surface" rollups were rough and one
  (fleet chat) was off by ~2x as literally stated.** Reported here as corrected.

## Parity matrix

Columns: Capability | Runner (file:line, ~lines) | apps/desktop | Gap | Needed for multi-site? | Port / Rebuild / Skip

### Project/site lifecycle (create, open, remove, list)

| Capability | Runner | apps/desktop | Gap | Needed for multi-site? | Verdict |
|---|---|---|---|---|---|
| List all sites | `project-registry.ts:60` `listProjects()` over a persisted sqlite table | None — exactly one site dir per process, held in a closure variable | Total | Yes, if "several sites" means one place to see them all | **Rebuild** — a JSON list, not a sqlite table (see Q3) |
| Create a new site (`tovu init`) | `project-provisioner.ts:328-434` `createProject`, incl. slug allocation (`:100-119`), port allocation (`:132-138`), vendor-DB "blocked" status (`:341-374`) | None directly, but `site-dir-store.cjs`'s picker (`main.cjs:75-93`) already lets you point at an *empty* folder and `resolveSiteDir` implies `tovu init` runs (needs confirming against `resolveSiteDir`'s own body, not read in full this pass) | Partial — no in-app "create with a name + DB choice" form; relies on folder-picker + implicit init | Yes, minimally | **Rebuild** — thin wrapper, no vendor-DB step needed (SQLite-only per Leona's stated direction) |
| Open an existing site | `project-provisioner.ts:436-508` `startProject` (spawn + health-check + reuse) | `tovu-server.cjs:245-315` `startTovuServer` — same shape: spawn, wait for boot line, resolve | **None** — apps/desktop's single-site version is already equivalent in spirit | No gap for one instance; needs a loop for N | **Already have it, just call it N times** |
| Remove a site | `project-provisioner.ts:551-600` `deleteProjectUnserialized` — stops, `rm -rf` install dir + logs, drops vault secret, drops registry row | None | Total | Only if "remove" means delete files, not just stop | **Rebuild**, small — mostly `rm -rf` + registry-row delete; no vault to clean up in the SQLite-only case |
| Concurrent-call safety on create/start/stop/delete | `project-provisioner.ts:301-332` `serializeByProject`/`createChain` — per-id promise chaining so a double-click can't double-spawn | None needed today (one site, one button) | Would reappear with N sites + fast clicks | Yes, if a UI exposes per-site start/stop buttons | **Port the pattern** (it's ~30 lines of generic promise-chaining, not Runner-specific) |

### Window & navigation

| Capability | Runner | apps/desktop | Gap | Needed for multi-site? | Verdict |
|---|---|---|---|---|---|
| Single-instance lock | `main.ts:193-198` `host.ports.singleInstance.claim` (from `@jini-ai/desktop-host`) | **None found** — `main.cjs` has no `requestSingleInstanceLock()` call anywhere | Real gap, unrelated to multi-site | Not needed for multi-site per se, but a second launch of the desktop app today would race a second window against the site dir picker | **Rebuild** — it's a ~5-line Electron API call (`app.requestSingleInstanceLock()`), no need to pull in `@jini-ai/desktop-host` |
| One window per project, in-window tabs, guest process isolation | `main.ts:57-90` (`<webview>` per project inside one main window, `contextIsolation`, no preload leak to the guest), `main.ts:143-173` `registerGuestNavigationPolicy` (deny-by-default external nav from an embedded site) | `main.cjs:165-185` — one `BrowserWindow` per (today, only one) site, `loadURL` directly (no `<webview>` — the site *is* the window content), same deny-external-nav pattern via `setWindowOpenHandler` | apps/desktop's simpler "one window = one site" model has no tab bar and no multi-project-in-one-window UI | Yes — Leona's "multiple sites for clients" implies either N windows or a picker, not literally one `<webview>` grid (that grid is Runner's own operator-chrome design, not dictated by the product need) | **Rebuild differently, don't port** — N `BrowserWindow`s (one per open site) is simpler than Runner's one-window-many-`<webview>`s model and avoids the guest-navigation-policy complexity entirely, since each window's `webContents` IS the site, not a guest inside a host chrome |
| "View site" vs "View admin" toggle | `main.ts:360-367` `RUNNER_PROJECT_CHANNELS.openExternal`, `contracts/project.ts` `ProjectView` | `main.cjs` loads `server.adminUrl` only; no equivalent toggle | Real, minor | Nice-to-have, not blocking | **Rebuild**, trivial (one more `shell.openExternal` call) |

### Per-project chat

| Capability | Runner | apps/desktop | Gap | Needed for multi-site? | Verdict |
|---|---|---|---|---|---|
| Fleet-operator chat (a chat pane that is NOT any one project's own assistant — it calls `runner.*` verbs: create/start/stop/delete a project, navigate the UI) | `runner-daemon.ts` (373 lines, in-process `RunLifecycle`+`AgentExecutor`+`ToolExecutor`), `fleet-chat-ipc.ts` (204), `renderer/fleet-chat-transport.ts` (422), `contracts/fleet-chat.ts` (125) — an entire second agent surface | **None, and arguably shouldn't exist** — see Q2/ruling on the in-process daemon below | This is the single biggest "thing Runner has that desktop doesn't," by line count | **No** — this whole surface exists to let one chat manage a *fleet*; if the desktop UI is "N windows, each showing one site's own admin," there is no fleet-operator identity to give a chat to | **Skip entirely under the ports-not-fleet model** (see Q2) |
| Per-site assistant chat (the site's OWN chat, e.g. "help me write a blog post") | Not Runner's — this is Tovu's own site assistant, reached by Runner only by *also* registering Runner's MCP server on it (`site-assistant-mcp.ts`) so it can additionally call `runner.*` verbs | **Present for free** — it's just Tovu's admin UI, loaded whole by `loadURL` | None | N/A — already works, one per open site, no plumbing needed | **Nothing to do — inherited free** (this is the strongest instance of Q2's argument) |
| Fleet tools reachable from a site's OWN assistant (a site's chat can ask "start my other site") | `site-assistant-mcp.ts`, `contracts/site-assistant-tools.ts` (228 lines), the dual-audience bridge in `runner-mcp-bridge.ts` | None | Real, but see Q1 ranking — this is a "nice for a power user," not core to "run several sites" | Only if cross-site orchestration from inside a chat is wanted | **Skip for now** |

### Onboarding / first-run

| Capability | Runner | apps/desktop | Gap | Needed for multi-site? | Verdict |
|---|---|---|---|---|---|
| Named multi-step "create a website" form (name → DB provider → review → submit) | `CreateWebsiteOnboarding.tsx` (256) + `useCreateWebsiteForm` in `App.hooks.ts` | Native OS folder-picker only (`main.cjs:75-93`), with a message explaining why a folder was rejected (`describeRejectedDefault`, `main.cjs:65-73`) | Real UX gap — desktop's onboarding is "point at a folder," Runner's is "fill a form" | Marginal — SQLite-only means no DB-provider step is needed at all | **Skip / minimal rebuild** — Leona's direction removes the one part of Runner's onboarding (vendor-DB choice) that justified a full form; a name-only prompt is enough |

### Process supervision (spawn, health, restart, orphan reconciliation, shutdown)

| Capability | Runner | apps/desktop | Gap | Needed for multi-site? | Verdict |
|---|---|---|---|---|---|
| Spawn + wait-for-ready | `project-provisioner.ts:140-230` `launchAndTrack` (custom `waitUntilReady` via HTTP probe against `sidecarLauncher`) | `tovu-server.cjs:245-315` `startTovuServer` (parses the same `tovu serve: dir=... port=... schemaVersion=... workspaceId=...` boot line both apps read) | **None** — functionally equivalent, apps/desktop's is arguably cleaner (reads Tovu's own documented boot line instead of polling `GET /`) | N/A, already solved | **Have it** |
| Health check / liveness of an already-running child | `project-provisioner.ts:249-260` `isSidecarServing` (`GET /`, `res.ok`), used by `hasHealthySidecar` (`:453-459`) to avoid double-launching onto a wedged child | None — desktop only ever holds one child reference for its one lifetime | Real for N-instance reuse (e.g., app relaunches without quitting a child), not for cold start | Only if child processes can outlive a window without the app knowing | **Port the pattern** if orphan reconciliation is built (see Q4) — it's ~15 lines |
| Graceful stop (SIGTERM, wait, escalate) | `project-provisioner.ts:236-238` `shutdownSidecar` (via `SidecarHandle.shutdown`) | `tovu-server.cjs:192-217` `stopChild` — SIGTERM to the child, SIGKILL to the **process group** (`-child.pid`) after `stopGraceMs` (default 5s) if it doesn't exit | **None** — apps/desktop's version is arguably more correct: it group-kills on escalation (reaps the site's own agent-daemon child too), where Runner's `shutdownSidecar` relies on `SidecarHandle` for that | N/A | **Have it, already good** |
| **Identity proof before killing** (the pid-reuse question) | `project-provisioner.ts:617-631` `isProcessAlive`, `:712-716` `isProjectSidecar` (argv-substring match against `row.installDir` + `--port ${row.port}` — proves a pid is genuinely THIS row's `tovu serve`, not a recycled number), `:724-747` `terminateOrphan` (SIGTERM → poll → **re-identify via `isProjectSidecar` before escalating** → SIGKILL) | `daemon-supervisor.ts:247-260` `killCurrentChild()` — `process.kill(-pid, "SIGTERM")` guarded ONLY by `childHasExited` (an in-memory boolean), **no re-identification of any kind**, no SIGKILL escalation at all in this function. `tovu-server.cjs:192-217` `stopChild` does escalate to SIGKILL but also does no re-identification — it trusts the live `ChildProcess` object reference, never a value read back from disk. | **Real, but categorically different from what the task framed.** See Q4 — Runner's version defends against a *persisted PID surviving a restart*; today neither Tovu file persists a PID across a restart at all, so there is nothing to misidentify *yet*. The risk is real only for a **future** boot-time orphan reconciler. | Only if multi-site adds crash-safe reconciliation (see Q4) | **Port the technique, not the code** — and note a real obstacle: Runner's technique needs a discriminating substring in the *argv*; Tovu's daemon-supervisor spawns identical argv for every instance (see Q4) |
| Boot-time orphan reconciliation | `project-provisioner.ts:849-871` `reconcile()`, called from `main.ts:327` **before any IPC handler is registered** — the sole recovery path for `SIGKILL`/OOM/power-loss (`runner-daemon.ts`'s own comment; `project-provisioner.ts:850-857`) | **None.** `main.cjs:230-232`'s own comment concedes this explicitly: *"A hard kill of Electron itself... still bypasses this and can strand the child. Tovu-Runner answers that with a pid registry and boot-time orphan reconciliation; that machinery belongs with the fleet supervisor, not here, and is reported rather than ported."* | **Total, and self-acknowledged in the code already** | Yes, for N persistent site processes this becomes more likely to matter, not less | **Port when N sites are added** — see Q3/Q4 for cost |
| Crash-loop backoff / respawn policy for a wedged child | Not in `project-provisioner.ts` (Runner does not auto-respawn a crashed `tovu serve`; a crash just sets `status: 'failed'` and puts the start button back — `:166-170`) | Tovu's OWN `daemon-supervisor.ts` (`createRespawnPolicy`, `daemon-respawn-policy.ts`, not read this pass) already does this for the **agent daemon** *inside* each `tovu serve` process — this is orthogonal to the desktop shell entirely | N/A both ways | N/A | **Not a Runner-vs-desktop gap at all** — it lives one layer down, in Tovu itself, and every `tovu serve` instance (Runner-spawned, desktop-spawned, or terminal-spawned) already has it |

### Persistence / registry

| Capability | Runner | apps/desktop | Gap | Needed for multi-site? | Verdict |
|---|---|---|---|---|---|
| Project registry (sqlite, `runner_projects` table) | `project-registry.ts` (310 lines) — layered onto `@jini-ai/sqlite`'s shared `openDatabase` singleton, `runner_`-prefixed tables to avoid colliding with Jini's own schema (`:1-19`'s own header explains the singleton hazard in detail) | None | Total | Yes, minimally — need to remember which sites are "open"/known | **Rebuild as a flat JSON file**, not sqlite — `site-dir-store.cjs`'s own header (`:1-18`) already made exactly this call for the MRU list ("adding `@jini-ai/sqlite` + `better-sqlite3` to `apps/desktop`... would buy a native dependency... for nothing") and it applies with equal force to a multi-site registry |
| Recent/MRU working directories (fleet chat's folder picker) | `working-directory-store.ts` (48 lines) — a table on the shared sqlite handle | `site-dir-store.cjs` (263 lines) — **already a JSON-file port of this exact thing**, per its own header: *"Ported from Runner's working-directory-store.ts + its dialog.showOpenDialog picker, with one deliberate deviation... The MRU is a JSON file in userData instead"* | **None — already done** | N/A, done | **Already ported, precedent for Q3** |
| Per-project event log (`runner_project_events`, human-readable history: "started", "crashed", "reconciled_orphan_reclaimed", etc.) | `project-registry.ts:73,123-131,180-187` | None | Real, but purely diagnostic | No | **Skip** — `console.error`/log-file output is enough at this scale |

### Settings / credentials

| Capability | Runner | apps/desktop | Gap | Needed for multi-site? | Verdict |
|---|---|---|---|---|---|
| Vendor-DB credential vault | `secure-credentials.ts` (67 lines) — Electron `safeStorage.encryptString`/`decryptString`, **no AAD parameter of any kind**, JSON-file-backed, keyed `vault:${projectId}` | None | Total | **No** — Leona's stated direction is SQLite-only, one process per site; there is no vendor-DB credential to hold | **Skip entirely, and see the do-not-port ruling below for why even if it were needed, this exact code shouldn't be copied** |
| Runner agent-inventory (which coding-agent CLIs are installed, for the operator to pick one) | `agent-inventory.ts` (47 lines) | None | N/A | No — this is Runner's *own* operator-chat feature (picking Claude/Codex/etc. for the fleet chat), not a site feature | **Skip** (falls out with the fleet chat) |

### Updates / packaging

| Capability | Runner | apps/desktop | Gap | Needed for multi-site? | Verdict |
|---|---|---|---|---|---|
| Auto-update (`electron-updater`) | **Not present** — `electron-builder.yml` has no `publish:` block, `package.json` has no `electron-updater` dependency. Confirmed by direct grep, not assumed. | Not present | **None — parity, both absent** | No | N/A |
| Packaged installer (dmg, signed, notarized) | `electron-builder.yml`, `development/scripts/{package,notarize-dmg,build-icon,stage-tovu-runtime}.mjs` | **None** — `package.json` has only `"dev"`/`"attach"`/`"test"` scripts, no `electron-builder` dependency at all | Total | Not for "run several sites," but eventually for shipping to Leona's actual users (designers/developers) | **Out of scope for this audit's question, real for a later ship-it pass** |

## Q1. What Runner does that apps/desktop cannot do at all today

Ranked by relevance to "a designer/developer running several client sites at once":

1. **See and manage more than one site.** apps/desktop is hard-coded to exactly one site dir per
   process (`main.cjs:102-133` `resolveTarget` resolves and starts exactly one). This is the actual
   blocker for the stated use case — everything else is secondary.
2. **Boot-time orphan reconciliation.** If Electron is killed hard, the `tovu serve` child is
   stranded with nothing to reclaim it next launch. `main.cjs:230-232` already says this in a
   comment; it isn't a finding, it's a confirmed, self-documented gap.
3. **Fleet-operator chat** (create/start/stop a site by asking an agent instead of clicking a
   button). High line count (~1,940 across `runner-daemon.ts` + `fleet-chat-ipc.ts` +
   `fleet-chat-transport.ts` + `runner-mcp-bridge.ts` + `runner-tools.ts` + contracts), but ranks
   low for the stated need — see Q2, this whole surface may not need to exist in the new model.
4. Everything else in the matrix (vendor-DB support, credential vault, single-instance lock,
   packaging/notarization) — real gaps, but none of them block "run several sites."

## Q2. What apps/desktop gets for free from the Tovu server

Concretely, not inflated:

- **The entire per-site admin UI and its own site-assistant chat.** Runner had to build a whole
  second agent surface (`runner-daemon.ts`'s in-process `RunLifecycle`, the MCP bridge, the
  dual-audience credentialing in `runner-mcp-bridge.ts`) to give the *fleet operator* a chat at all,
  and then *another* module (`site-assistant-mcp.ts`) to expose fleet verbs to a site's *own*
  assistant. apps/desktop gets a working per-site chat with **zero lines of desktop code** — it's
  Tovu's admin UI, loaded whole. This is the single biggest line-count saving and it is real, not
  inflated: the fleet-chat surface Runner built is ~1,940 lines (see the corrected rollup above),
  and desktop needs none of it if there's no separate "fleet operator" identity to give a chat to.
- **Free-port self-allocation, at two layers.** `tovu-server.cjs:169-178` `allocatePort()` (site HTTP
  port) and, inside Tovu itself, `agent-daemon-port.ts`'s per-process self-allocation for the agent
  daemon's own port (confirmed via `daemon-supervisor.ts:393-397`'s comment, "Self-allocation fix
  (2026-08-28)... when neither JINI_AGENT_DAEMON_URL nor JINI_AGENT_DAEMON_PORT was set,
  agent-daemon-port.ts picked a free port for THIS process"). Two unrelated `tovu serve` instances on
  one box already don't collide on either port, with no coordination Runner-side. This is the
  concrete basis for Q3's cost estimate.
- **Graceful shutdown drain (BR-07).** `serve.ts` already stops accepting, finishes in-flight
  requests, shuts down its own agent daemon, and closes its sqlite handle on SIGTERM
  (`tovu-server.cjs:181-189`'s comment cites this explicitly). Runner had to build its own version of
  this discipline into `shutdownSidecar`; desktop inherits it from Tovu's own CLI for free.
- **The boot-line contract itself** (`tovu serve: dir=... port=... schemaVersion=... workspaceId=...`)
  is a documented, versioned interface (`api.spec.md §5` per `tovu-server.cjs:11-14`'s comment) that
  both Runner and desktop parse identically — neither had to invent process-liveness detection from
  scratch; Tovu tells you when it's actually ready.
- **Modern native-module compatibility removes an entire Runner subsystem.** Confirmed by
  `tovu-server.cjs:110-121`'s comment (dated 2026-09-05, i.e. written today): `better-sqlite3` 13 is
  N-API with prebuilds and loads unmodified under Electron 43, measured including a real SQLite
  round-trip. This is *why* `resolveNodeBinary()` (Q5) is obsolete — desktop runs the child on
  Electron's own bundled Node (`ELECTRON_RUN_AS_NODE=1`, `tovu-server.cjs:98,112-121`) instead of
  hunting for a system Node across Homebrew/MacPorts/Volta/nvm/fnm/asdf/n.

## Q3. Genuinely minimal path to "run several sites at once"

**The claim ("just different ports, some code that sees which port is free") is directionally
correct and the free-port half of it is already fully built** (see Q2) — but "a few hundred lines"
undersells it by roughly half if crash-safety is included, and is about right if it is not.

Costed, based on what actually exists today:

- **`tovu-server.cjs` (327 lines): ~0 lines change.** It is already a pure function of
  `{repoRoot, siteDir, port}` → a `{port, pid, origin, adminUrl, stop()}` handle. It has no
  assumption anywhere that only one gets created. This is the strongest evidence for the "just
  different ports" claim — the hard part (spawn, boot-line parse, free-port allocation, graceful
  stop) is already generic.
- **`main.cjs` (243 lines): the real cost, roughly 150-250 new/changed lines.**
  - Replace the single `tovuServer`/`shuttingDown` module-level variables with a
    `Map<windowId, {server, siteDir}>` (or equivalent), and change `before-quit` (`:234-239`) and
    `window-all-closed` (`:241-243`) to iterate over all open servers instead of one.
  - Add an "Open another site" entry point (a menu item or an in-window button — no UI framework
    exists yet to hang it on, since apps/desktop currently loads Tovu's admin as the ENTIRE window
    content with nothing of its own chrome) that re-runs `resolveTarget()`'s picker flow
    (`main.cjs:75-133`) for a second folder and opens a second `BrowserWindow`.
  - `resolveSiteDir`'s single-slot "most recent folder" model (in `site-dir-store.cjs`, not read in
    full this pass — flagged below as unverified) likely needs to become a list of "currently open"
    sites rather than one remembered default; the MRU list may already partially cover this but its
    exact shape needs confirming.
  - Port collision across simultaneously-open sites is already solved (`allocatePort()`'s OS-level
    `:0` bind, per-instance), so nothing new is needed there.
- **`site-dir-store.cjs`: small changes,** mostly widening its data model from "one remembered
  folder" to "N open folders" if that's not already how its MRU list works.

**Sub-total for "run several sites within one continuously-running app, no crash-safety across
restarts": roughly 150-300 lines.** This matches "a few hundred lines" as literally stated.

**What that estimate does NOT include, because Runner's version does:**
- **Boot-time orphan reconciliation** (Q1 #2, Q4) — persisting which sites/pids were running, and
  reclaiming or reporting on them at next launch. Runner's version of this cluster
  (`isProcessAlive`, `readProcessCommand`, `isProjectSidecar`, `findPortListenerPid`,
  `terminateOrphan`, `resolveOrphanPid`, `buildPortConflictDetail`, `reconcileRow`, `reconcile`,
  `project-provisioner.ts:617-871`) is **~255 lines** on its own, plus the persisted-registry write
  side it depends on. Whether this is needed depends on how much Leona cares about "app was
  force-quit while 3 sites were running" — if it matters, the honest total is **~400-550 lines**,
  not "a few hundred."

**Verdict: confirmed for the no-crash-safety version, refuted (by roughly 2x) if boot-time orphan
reconciliation is included** — which is exactly the piece `main.cjs:230-232` already flags as
deliberately deferred, not overlooked.

## Q4. What must be ported rather than rebuilt

**The identity-before-kill pattern is real, verified, and already has a documented gap in Tovu's
own code — but it does not transplant cleanly, for a specific reason worth stating precisely.**

Runner's technique (`project-provisioner.ts:701-716` `isProjectSidecar`): a pid recovered from a
restart is never trusted on its own; it is proven to still be *this row's* `tovu serve` by checking
that its live argv (`ps -ww -p <pid> -o command=`) contains BOTH the project's unique install
directory path AND its `--port <N>` flag. Only then does `terminateOrphan` (`:724-747`) escalate
past a graceful SIGTERM. This defends against pid reuse: the number in `last_pid` was recorded in a
*previous* process lifetime, and by the time a new boot reads it back, the OS may have handed that
number to something unrelated.

Tovu's actual seam, `daemon-supervisor.ts:247-260` `killCurrentChild()`, has **no such check** — it
guards only on `childHasExited`, an in-memory boolean that is only meaningful within the *same*
process lifetime that set `currentChild`. That's a real difference from Runner's problem, not an
oversight of the same size:

- **Today, single `tovu serve` instance:** `killCurrentChild`'s pid was captured by `spawn()` in
  this same running process seconds or minutes ago; nothing else in that process's lifetime reuses
  it. The risk window is narrow (OS reuses the exact pid between the child's actual exit and this
  process learning about it) and exists today regardless of multi-site.
- **With N `tovu serve` instances, each running its OWN `daemon-supervisor.ts` singleton for its OWN
  agent daemon:** the risk doesn't change in *kind*, but the SURFACE multiplies by N, and — this is
  the part worth verifying, and I did — **`spawnRealDaemonProcessFor` (`daemon-supervisor.ts:402-416`)
  spawns byte-identical argv for every instance**: always `[daemonPath]` with no site-specific
  argument (site identity travels only in the env: `TOVU_WORKSPACE`, `TOVU_SITE_DIR`,
  `buildDaemonSpawnEnvOverrides`, `:389-400`). Runner's argv-substring technique **cannot be applied
  as-is** here, because there is nothing site-specific in the argv to match against. Reading the
  child's env instead (e.g. via `ps eww`) is not a safe substitute in this codebase — it's the exact
  command this session's own operating memory flags as a credential-leak risk (`ps eww`/`pgrep -fl`
  can dump another process's secrets to your terminal/log), so it should not become the pattern this
  identity check depends on.
- **Concretely, what should be ported is the *shape* of the fix, not the code:** add one
  discriminating token to the daemon's own argv (e.g. `spawn(process.execPath, [daemonPath,
  "--workspace", input.workspaceId], ...)`), then check that substring before any future kill of a
  pid recovered from persisted state — the same proof Runner's `isProjectSidecar` makes, adapted to
  a seam that doesn't yet have anywhere to persist a pid across a restart at all (there is currently
  no equivalent of `project-registry.ts`'s `last_pid` column for the agent daemon).
- **This gap is currently latent, not active**, because nothing today reconciles daemon pids across
  a restart — the same is true of the desktop shell's own `tovu serve` child (Q1 #2). Both gaps
  become live the moment either gets a persisted "what was running" list, which is exactly the piece
  Q3 costs into "with crash-safety."

**Siblings found:** `killCurrentChild` is the only kill site in `daemon-supervisor.ts`.
`tovu-server.cjs`'s own `stopChild` (`:192-217`) has the same shape (trusts a live in-memory
`ChildProcess`, no re-identification) but is lower-risk for the identical reason — no pid is ever
read back from disk, only ever held as a live JS reference for the life of one `startTovuServer`
call. No other `process.kill`/`execFileSync('ps'...)` call sites were found in either app's process-
supervision code within the files sampled this pass (not exhaustively grepped across all of
`apps/website/src/server/`, which is out of this audit's scope).

## Q5. What should be deleted rather than ported

**`resolveNodeBinary()` and its supporting cluster — confirmed obsolete, and Tovu's own code already
says so, dated today.**

`tovu-cli.ts:206-223` `resolveNodeBinary()` (18 lines) plus its support functions
(`nodeCandidatePaths` `:142-165`, `versionedNodeBinaries` `:132-140`, `byVersionDesc` `:121-129`,
`nodeMajorOf` `:168-177`, `describeUnusableNode` `:179-187`) total **~90 lines** (`121-223`), exactly
matching the "~90 lines" estimate. Its own doc comment (`:191-205`) states the premise: Tovu ships
`better-sqlite3` as a native addon compiled for system Node's ABI, and Electron's bundled Node has a
different `NODE_MODULE_VERSION`, so the CLI must be run under a real system Node it has to hunt for.

`tovu-server.cjs:110-121`'s comment — **written today, 2026-09-05** — states that premise is no
longer true: `better-sqlite3` 13 is N-API with `prebuilds/`, and it (plus `argon2` and `sharp`) load
unmodified under Electron 43, "measured 2026-09-05, incl. a real SQLite roundtrip." apps/desktop
therefore runs the child directly on `process.execPath` with `ELECTRON_RUN_AS_NODE=1`
(`buildCliEnv`, `:95-105`), no probing at all. **`assertNodeMajorInSync()`** (referenced at
`tovu-cli.ts:66`, defined in `development/scripts/stage-tovu-runtime.mjs`, not read this pass) exists
to keep Runner's packaging build honest against the same now-obsolete premise and should be reviewed
alongside it, though it wasn't opened to confirm its own body this pass — flagged as unverified.

**Agree: delete, don't port.** Porting either function would reintroduce a system-Node dependency
the desktop shell has already proven it doesn't need.

## Prior do-not-port rulings — agreement and reasoning

**1. Runner's in-process Jini daemon — agree, do not port.**
`runner-daemon.ts:1-19`'s own header states the co-location invariant as mechanical, not stylistic:
`DelegatedToolBridge.execute()` writes into the SAME `RunLifecycle` object the chat pane is
streaming from, in the SAME process — split it across a process boundary and calls still succeed,
they just land in a different lifecycle's log, invisibly. That design is the *opposite* of Tovu's
own `daemon-supervisor.ts`, whose entire job is spawning the agent daemon as a **detached, separate
OS process** (`spawnRealDaemonProcessFor`, `detached: true`) and supervising it from outside via
`spawn`/`kill`/respawn-on-exit. Porting Runner's in-process pattern would fight the architecture
every other consumer of Tovu's assistant daemon already depends on (the HTTP proxy in
`server/modules/assistant.ts`, referenced but not read this pass). It would also need to happen N
times over for N sites, which contradicts the "just more ports" simplicity Leona described. Agree.

**2. Runner's keychain vault (no AAD binding) — agree, do not port, and I can say exactly why it's
unsafe as-is, not just "policy says no."** Read `secure-credentials.ts` in full (67 lines):
`safeStorage.encryptString`/`decryptString` take no additional-authenticated-data parameter at all —
there is no API surface on Electron's `safeStorage` to bind ciphertext to the record it belongs to.
Concretely, this means a ciphertext blob stored under `vault:projectA` could be copied into
`vault:projectB`'s slot in the JSON file and would decrypt without error under projectB's identity —
nothing detects the substitution. That is precisely the class of defect a `check:seal-aad` gate
exists to catch elsewhere in this repo (per this session's own operating memory). Also moot under
Leona's stated direction: SQLite-only, no vendor-DB credential to hold at all. Agree, for both
reasons independently.

**3. Runner's second MCP surface — agree, do not port, and the reason is structural, not aesthetic.**
`runner-mcp-server.ts:1-27`'s own header explains it exists because Runner's fleet-operator chat
and a project's OWN site-assistant chat are in different OS processes, and the fleet lifecycle verbs
(`project.start`/`stop`/`delete`) only make sense inside Runner's process — so a "dual-audience"
bridge (`runner-mcp-bridge.ts:16-27`) was built to let a site's own assistant reach across that
boundary too. If the desktop shell has no separate "fleet operator" identity at all (Q2 — each site
just IS a window running Tovu's own already-working admin+assistant), the problem this bridge exists
to solve doesn't arise in the first place. Agree — this isn't "too complex to port," it's "solves a
problem the ports-not-fleet model doesn't have."

## What could not be verified

- **`resolveSiteDir`'s and `site-dir-store.cjs`'s full body** (263 lines) — only its header comment
  was read. Its exact MRU-list shape (single slot vs. a real list) matters for Q3's cost estimate and
  should be confirmed before scoping real work.
- **`daemon-respawn-policy.ts`** and **`agent-daemon-port.ts`** — cited via other files' comments,
  not opened directly. The claim that agent-daemon ports self-allocate per-process rests on
  `daemon-supervisor.ts`'s own comment, not on reading `agent-daemon-port.ts` itself.
- **`stage-tovu-runtime.mjs`'s `assertNodeMajorInSync()`** — referenced, not read; flagged in Q5 as
  needing its own review once `resolveNodeBinary()` is removed.
- **`App.hooks.ts`** (1,209 lines) and **`runner-tools.ts`** (487 lines) were sampled by
  export/import lines only, not read end to end — the exact shape of `runnerToolNames()`'s allowlist
  and the full onboarding-form validation logic are asserted from comments in neighboring files, not
  from their own bodies.
- **Whether apps/desktop's picker flow actually calls `tovu init` on an empty folder** — inferred
  from `main.cjs`'s dialog copy ("an empty folder to start a new one") and `site-dir-store.cjs`'s
  header, not confirmed by reading `resolveSiteDir`'s body.
- No number in this report was taken from the sibling screenshot agent; there was no coordination
  between the two audits by design.
