# D3: child supervision into `@jini-ai/sidecar` (5 runs)

Inherits `COMMON.md`. Survey step 3. Order: D3a -> D3b -> D3c1 -> D3c2; D3d is independent.

**Wait for:** xpkg lane **R11b** (it turns `sidecar/src/supervision/supervisor-node.ts` and `json-file.ts` from platform imports into ports; `sidecar -> platform` is 3 import sites today). D3a may run before R11b (it adds new files only). D3b and D3c must run **after** R11b, and D3c also after owner decision **OD-3** of the xpkg index (where Node adapters live).

## Measured (reading tree)

| File (lines) | What is generic | Verdict |
|---|---|---|
| `keyed-serializer.ts` (58, no imports) | per-key promise chain | MOVE (D3a) |
| `site-transitions.ts` (80, no imports) | "starting"/"stopping" marks per key | MOVE (D3a) |
| `site-supervisor.ts` (176, no imports) | map of live children that **observes exit** (the owner of "what is running") | MOVE (D3a) |
| `tovu-server.start.ts` (176) | `waitForBoot`: read child output until a ready line, a timeout or child end; mirrors output through a redacting sink | MOVE (D3a); the boot-line **parser** stays |
| `site-process-registry.ts` (637, about half is rationale comment) | one registry file per app instance, single writer; orphan reconcile with identity proof before terminating | MOVE most (D3b); `agentServiceRegistryPath`, argv identity rule for `tovu serve` stay |
| `tovu-server.ts` (1,103; in `size-debt.json`) | `allocatePort`, `createExitSignal`, `stopChild` (SIGTERM grace, then process-group kill; Windows tree kill), spawn wrapper | SPLIT (D3c2): about 200 to 260 lines generic; CLI plan, env, boot token, modes stay |
| `external-site-stop.ts` (213) | stop a child another launcher started, by lease identity | STAY for now (Tovu lease format); revisit after D3b |
| `desktop-agent-service.ts` (368) | one cold supervisor per instance; already **uses** `createDaemonSupervisor` + `createRespawnPolicy` | STAY (host wiring) |
| `desktop-resources.ts` (230), `desktop-memory-sampler.ts` (101) | process resource view | MOVE part (D3d) |
| `site-preview-store.ts` (214), `site-preview-scheduler.ts` (47) | preview image cache keyed by site digest | STAY (no second consumer; capture already uses desktop-host `RenderService`) |
| `admin-dev-proxy.ts` (157), `main/boot/site-backend.ts` (273), theme preview | Tovu | STAY |

Movable by this sheet: about **1.3k lines** of supervision core (490 in D3a, about 500 in D3b, 200 to 260 in D3c2) plus about 250 in D3d: **1.5 to 1.8k**. The survey's 2.5 to 3.2k also counted sleep/wake policy and previews; those are in D6e or stay.

**The three launchers (verified).** (1) `desktop-host/src/sidecar.ts` `createNodeSidecarLauncher`: spawn, `waitUntilReady(probe)`, `shutdown`; used only by desktop-host's own Electron assembly (`create-electron-desktop-host.ts:30`) and examples; **Tovu does not call it**. (2) `sidecar` `createDaemonSupervisor` (363 lines, universal, respawn loop over injected `spawnDaemonProcess`/`terminateProcess`) + `supervisor-node.ts` (358, the Node adapter). Tovu uses it for the agent daemon. (3) Tovu `startTovuServer` + `site-supervisor`. They are not three copies of one thing: (2) is a respawn loop for **one** child; (3) is spawn-ready-stop for **one** child plus a keyed **fleet** holder; (1) is a second spawn-ready-stop. The real duplication is spawn-ready-stop, twice. D3c removes it.

---

## D3a: fleet primitives and ready-line wait (Jini + Tovu pair; ~170k; proof T)

```
id: D3a-fleet-primitives
moves:
  apps/desktop/src/keyed-serializer.ts   -> packages/sidecar/src/supervision/keyed-serializer.ts    export "./keyed-serializer" (universal)
  apps/desktop/src/site-transitions.ts   -> packages/sidecar/src/supervision/child-transitions.ts   export "./child-transitions" (universal)
  apps/desktop/src/site-supervisor.ts    -> packages/sidecar/src/supervision/fleet-supervisor.ts    export "./fleet-supervisor" (universal)
  apps/desktop/src/tovu-server.start.ts  -> packages/sidecar/src/supervision/ready-line.ts          export "./ready-line" (node: stream types)
tests move with them (4 desktop test files; find: rg -l "keyed-serializer|site-transitions|site-supervisor|tovu-server.start" apps/desktop/src -g '*.test.*')
```
1. **Existing owner search first:** `rg -n -i "serializ|mutex|keyed|perKey|queueBy" packages/core/src/primitives packages/sidecar/src packages/platform/src -l`. The planner's search for `KeyedSerializer|createKeyedMutex|serializeByKey|KeyedLock` found nothing. If you find an equivalent with the same ordering and error contract (a rejected task must not block the next task for the key), use it, delete Tovu's file, and report; do not add a second one.
2. Renames inside the moved code only where the word is Tovu's: `Site*` -> `Child*`, `siteDir` key -> `key: string`. The types keep their generic parameter (`FleetSupervisor<E extends FleetEntry>`). One commit per file: Jini add, then Tovu repoint + delete (pair).
3. `ready-line.ts`: today `waitForBoot` imports `createRedactedOutputSink` from the website (after D0b: from `@jini-ai/diagnostics`). sidecar may import neither. The mirror arrives as a port: `mirror: { stdout: Writable; stderr: Writable }` built by the host from the diagnostics sink. The **line parser** is a required argument `parseReadyLine: (r: { line: string }) => T | null`; Tovu passes its `parseBootLine`. Keep as separate outcomes (lesson 7): ready, timeout, child ended before ready (with code and signal), stream error.
4. Lesson 3 (late reads): `BootState` is mutated while streams are read. Inventory every state cell and its single writer in the report before moving; the moved function must not capture a value at construction that today is read at chunk time.
5. Comments: `site-supervisor.ts` and `site-process-registry.ts` carry long defect histories. They move with the code; Tovu-only history ("D-06", `main.ts`) is kept verbatim under a `History (from the first host)` heading. S6 applies.

**Tests first** (vitest in sidecar; the desktop tests converted, assertions unchanged) plus: serializer: second task for a key starts only after the first settles, and still starts when the first rejects; fleet: an exited child is no longer reported live and a start after the exit spawns again (the defect the file was written for; fails if exit observation is removed); ready-line: an unterminated final line is still parsed at stream end; a ready line split across two chunks is found; the timeout rejects and **removes its stream listeners** (count listeners on a fake stream).

Tovu consumers to repoint (inventory, do not trust): `main/index.ts`, `main/boot/site-backend.ts`, `project-ipc.ts`, `project-ipc.site-lifecycle.ts`, `tovu-server.ts`, their tests.

---

## D3b: per-instance child registry and orphan reconcile (Jini + Tovu pair; ~230k; proof T, then **P** on Windows and macOS)

```
id: D3b-child-registry
from: apps/desktop/src/site-process-registry.ts (637)
new:  packages/sidecar/src/supervision/child-registry.ts        export "./child-registry" (universal: ports only)
      packages/sidecar/src/supervision/orphan-reconcile.ts      export "./orphan-reconcile" (universal: ports only)
stays (Tovu, same file, shrunk): REGISTRY_DIR_NAME, LEGACY_REGISTRY_FILE_NAME, legacy single-file migration, agentServiceRegistryPath,
      the row type {siteDir, port, workspaceId, pid, updatedAt}, isServeProcessForSite (argv must contain the site dir AND `--port <n>`), and the port bindings
```
**Ports (all required; no default that touches the machine):**
- `files`: read JSON with "unreadable is not empty" semantics, atomic write (temp + fsync + rename), quarantine: the shape Tovu's `durable-json-file.ts` exposes today over `@jini-ai/platform/fs/durable-json`. Declare it structurally in `child-registry.ts`; Tovu binds it. Check `@jini-ai/core/contracts/runtime/fs.ts` for an existing port that already matches (`AtomicFileWriterPort.writeJson` exists; a matching **read** port was not verified) and reuse what fits.
- **Process observation, synchronous (round-1 judge finding 4).** `observe: { isAlive(r: { pid }): boolean; readCommandLine(r: { pid }): string | null; readParentPid(r: { pid }): number | null }`, declared in `child-registry.ts`. It is synchronous because its consumers are: `isLiveServeRow` returns a plain boolean (`site-process-registry.ts:318-320`) and is called inside `Array.filter` by `liveForeignServers` (`project-ipc.ts:897-900`). `ProcessControlPort.listProcessSnapshots` returns a promise (`core/src/contracts/runtime/process.ts:48`) and is **not** used here; no caller becomes async in this sheet. `null` means "could not find out" and is never treated as a match.
- **Termination, identity-checked (blocker 2).** `signal: (r: { pid; signal: 'term' | 'kill' }) => 'sent' | 'gone' | 'denied'`. `ProcessControlPort.stopProcesses` is **not** used: it signals, waits, then signals the survivors with no identity re-check (`platform/src/process.ts:570-583`) and its port has no identity callback (`process.ts:47-50`). The escalation sequence stays in `orphan-reconcile.ts`, exactly today's (`site-process-registry.ts:489-521`): term → wait `graceMs` on the injected clock → **re-read the command line and re-run `isSameChild`** → kill only if it is still the same child → observe exit before the row is cleared.
- Node bindings of `observe` and `signal` (today's `ps` calls and `process.kill`, plus the Windows branch) live in the owner-approved new `@jini-ai/node-adapters` (`./process-observation`), created by this run's first Jini commit if absent (package.json, `jini` metadata, build, one test; `pnpm guard` green). `sidecar` declares the ports and does not import the adapters; Tovu binds them. This also answers xpkg OD-3 for this sheet.
- `isSameChild: (r: { commandLine: string; row }) => boolean` (identity proof), `clock`, `sleep`, `instanceId`.

**Behaviour checks before any move (lesson 12, 21). Write these as tests against today's code and the real platform adapter, on the OS the run has, and say which OS:**
1. Does the synchronous `observe` binding return the **full argv** and the **parent pid** for another process? Spawn `node -e "setTimeout(()=>{},60000)" --port 4321 <long tmp path>` and assert both tokens and the ppid are present. If the command line is truncated or missing, the identity proof would never match and orphans would never be cleaned: **STOP** and report; do not fall back to `ps`.
2. Escalation parity and the identity re-check: characterize today's `terminateOrphan` with a fake clock and fake `observe`/`signal`: (a) same child survives the grace → exactly `term` then `kill`; (b) **the pid's command line changes during the grace interval (pid reuse) → `term` only, no `kill`, the row is left for the next reconcile**; (c) the process exits during the grace → no `kill`. Test (b) must fail when the re-check before escalation is removed. Matching signal names and timeouts is not the proof.
3. **Windows.** Record what today's code does with `platform: 'win32'` injected (the `ps` path has a platform parameter; whether it identifies anything on Windows was not verified). The rule that must hold after the move, on every OS: **identity unknown means do not terminate**.
4. `isProcessAlive` exists twice already: here and in `sidecar/src/daemon-registry.ts`. Compare their handling of a permission error on signal 0 (a live process owned by another user). Keep **one** (sidecar's, if equal); if they differ, keep both behaviours as an explicit option and report.

**Security gates (class: terminating a process by a recorded pid; location: orphan reconcile). Two decisions, two kinds of evidence (lesson 33; round-1 judge blocker 3). Round 1 merged them; they stay separate.**
| Decision | Evidence required (all of it) | Source today |
|---|---|---|
| **Terminate a child process** | (a) the pid is alive; (b) its live command line passes `isSameChild` (pid reuse); (c) **child parentage**: the child's own parent pid shows it is orphaned — `isOrphaned({ pid })`, built on `observe.readParentPid`; an unknown parent (`null`) is **not** orphaned | `site-process-registry.ts:432-458` (`isOrphanedProcess`), `:569-574` (the three-part guard) |
| **Delete or quarantine a registry file** | the owner instance named by the file name (pid + nonce) is gone; an instance only rewrites its own file | `:585-598` |
The registry owner's liveness never authorizes a kill, and child parentage never authorizes deleting a file: a recycled owner pid can keep a file alive while that file's orphaned children are still reconciled (`:538-542`); the nonce stops another instance adopting the file name, it proves nothing about a live pid.
Characterization matrix (tests on today's code first; each row asserts **both** outcomes; each guard has one row that fails only when that guard is removed):
| Case | Child terminated? | File removed? |
|---|---|---|
| live owner, its child alive with a live parent | no | no |
| owner gone, child alive, same command line, orphaned | yes | yes, after the rows are cleared |
| owner pid **recycled** by an unrelated process (file looks owned), child orphaned and same command line | yes | no |
| owner gone, child pid reused by another program (command line differs) | no | yes |
| owner gone, child alive, **parent pid unknown** (`null`) | no | row kept, file kept |
| owner gone, command line unreadable (`null`) | no | row kept, file kept |
| legacy row without the newer identity fields (`rg -n "legacy" apps/desktop/src/site-process-registry.ts` for the exact shape) | as today: read the code, pin it | as today |
| Windows (`platform: 'win32'` injected): whatever `observe` cannot determine | no (identity unknown means never terminate, OD-5) | as today |

**Two runs (revision 2; one would pass the 250k cap).** **D3b1** (Jini + Tovu tests only, about 150k): step (1) plus the `@jini-ai/node-adapters` `./process-observation` bindings with their tests on the run's OS and with `platform: 'win32'` injected; nothing in Tovu production code changes, so it is green alone. **D3b2** (about 200k): steps (2)-(5), needs D3b1 and xpkg R11b.
Steps: (1) characterization tests on today's file, green; (2) Jini `child-registry.ts` + tests with fakes; (3) Jini `orphan-reconcile.ts` + tests; (4) Tovu: `site-process-registry.ts` becomes bindings + Tovu rules; its exported predicates keep their **synchronous** signatures (`isLiveServeRow`, `isOrphanedProcess`, `isServeProcessForSite`), so `project-ipc.ts:897-900` and the `ProjectIpcDeps` type are untouched and `project-ipc-dispatch.test.ts:77`'s fake still fits; `terminateOrphan` stays async as today (it keeps its exported names that Tovu code calls: this is a host module with real content, not a shell; if nothing but re-exports would remain, delete it and repoint callers); (5) delete dead helpers.
Proof P: on a packaged build, kill the app hard with two sites running, relaunch: both orphaned children are gone and unrelated processes are untouched; repeat on Windows.

---

## D3c1 and D3c2: one spawn-ready-stop (Jini, then Tovu; ~150k + ~200k; proof T, then **P**)

**Design (fixed here; needs OD-3 and a short owner yes, INDEX OD-4, because it changes a public desktop-host default).**
- New `packages/sidecar/src/supervision/child-launch.ts` (export `./child-launch`, universal, ports only): `launchChild(required: { spawn; processes: ProcessControlPort; clock; scheduler }, optional: { stopGraceMs })` returning `{ pid, exited: Promise<{ code, signal }>, waitUntilReady(probe or ready-line), stop() }`. `stop()` is Tovu's sequence, which is the most complete of the three: polite signal to the child; after the grace, kill the whole tree (POSIX process group; Windows tree kill); resolve only when exit is observed. `createDaemonSupervisor` is **unchanged**: its `spawnDaemonProcess`/`terminateProcess` can be bound to `launchChild` by a host.
- `desktop-host` keeps the **port** `SidecarLauncherPort` and its token; the Node implementation `createNodeSidecarLauncher` and `appendSidecarLifecycleLog` leave `desktop-host/src/sidecar.ts`. `createElectronDesktopHost` loses its default: `sidecarLauncher` becomes a **required** argument (a default would need desktop-host to import sidecar, which the package rule forbids). Hosts bind it with a 20-line adapter over `launchChild`.
- The Node pieces (`spawn` from `node:child_process`, tree kill) follow whatever OD-3 decides for `supervisor-node.ts`; they sit beside it.

**D3c1 (Jini).** Inventory: `rg -n "createNodeSidecarLauncher|SidecarLauncherPort|SidecarHandle|appendSidecarLifecycleLog|SidecarLauncherToken" packages examples` (planning: 4 non-test files in desktop-host, the Tauri launcher which implements the same port and is untouched, examples `reference-desktop` and, after D2, `notes-desktop`; desktop-host root `index.ts` re-exports `sidecar.ts`). Tests first, on today's `sidecar.ts`: readiness probe retried until `isReady`; a child that exits early rejects `waitUntilReady`; `shutdown` calls `requestShutdown`, waits, then kills; then the same tests run against `launchChild` through the adapter (one contract suite, two subjects). Windows case with `platform: 'win32'`: no negative pid is ever signalled; the tree-kill port is called with the child's own pid. Then switch the examples, delete the old implementation, update desktop-host's root entry (the type exports stay; the function exports go; S4).

**D3c2 (Tovu).** `tovu-server.ts` is 1,103 lines, has 25 functions, is in `size-debt.json`, and is one of the files the size-design programme may also split: check `git log -5 -- apps/desktop/src/tovu-server.ts` and the size-design index first; if a split is scheduled, this run goes **after** it. Tests first (characterization on today's `startTovuServer` with its existing fake `spawnFn` seam, which stays exempt from object args): (1) stop sends the polite signal, then after `DEFAULT_STOP_GRACE_MS` kills the group; on `win32` runs the tree kill with the positive pid; (2) a boot timeout stops the child and rejects with the redacted output tail; (3) the boot token never appears in mirrored output (class: launch-credential redaction; `redactBootToken` stays in Tovu and is applied **before** the mirror); (4) `createExitSignal` resolves once for exit and for spawn error. Then replace `stopChild`, `taskkillTree`, `createExitSignal` and the spawn wrapper by `launchChild` + D3a's ready-line; `allocatePort` is replaced by sidecar's `port.ts` only if its contract is equal (compare: does either one hold the port open? report). Delete the `size-debt.json` key only if the file drops under 500 lines.
Proof P: packaged start and stop of a site on macOS and Windows, quit with two sites running leaves no child (the release workflow's desktop e2e `two-sites-assistant` covers macOS).

---

## D3d: process resource data to `desktop-host` (Jini + Tovu pair; ~120k; proof T, then E)

`desktop-resources.ts` (230) builds per-site memory and CPU figures from `@jini-ai/platform/process` snapshots and Electron app metrics; `desktop-memory-sampler.ts` (101) samples them. desktop-host already owns `electron/electron-process-memory.ts` (20 lines). Inventory both files' functions first and classify each: **generic** (group a process tree under a root pid; sum memory; sample on an interval with a visibility gate) versus **Tovu** (site ids, the `contracts/resources.ts` row shape, warnings copy). Move only the generic functions to `packages/desktop-host/src/electron/process-resources.ts` (export `./electron/process-resources`), taking `processes: ProcessControlPort` and the Electron metrics function as ports (desktop-host may not import platform). If the generic part is under 80 lines, **do not move anything**: report "not worth a module" and close the sheet. Cost bound to keep (acceptance): no more than one process-table read per sample tick, and no tick while no window is visible. Proof E: the resources panel shows the same figures before and after for two running sites.
