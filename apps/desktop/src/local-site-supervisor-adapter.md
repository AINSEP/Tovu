# Local CMS supervisor adapter seam (2026-10-08)

The server's `platform/site-dir/local-site-supervisor.ts` exposes `LocalSiteProcessPort`:
`isPortFree({port})`, `launch({name, port, daemonPort})`, `schedule({run, delayMs})`.
A launched handle exposes `pid`, `onExit({listener})`, `ready()`, `terminate()` (verified whole tree),
and `killNow()` (synchronous signal path). `LocalSiteSupervisorPort` owns cap, port reservations,
readiness/crash transitions, start/stop and a stopped-site lane for folder mutations.

Desktop currently owns arbitrary project paths (`site-dir-store.ts` / `project-ipc.ts`), windows,
partitions, persisted process registries and its Map-compatible `site-supervisor.ts` crash observer.
That observer is a window registry, not a launcher/cap/readiness lifecycle. No second IPC owner is
wired by this change. Keep HTTP local management disabled for packaged desktop children today.

Follow-up: extend Jini sidecar with the generic capacity/readiness/reservation policy (the source
was outside this dispatch's writable roots), then adapt `startTovuServer` to this process port.
Map stable project identities to canonical arbitrary paths; do not key unrelated folders by basename.
Compose windows around the shared lifecycle; expose its states through existing runner IPC;
replace desktop permanent card deletion with recoverable Trash and dedicated confirmed Trash UI.
Give the desktop host its own restart port rather than forwarding the web dev restart request file.
Do not enable the HTTP capability until the desktop registry and this lifecycle share one owner.

Default setting for the web host: `TOVU_LOCAL_SITE_LIMIT=3` (integer 1..20). Each child owns an API
process and an agent daemon, plus any storage worker it needs. The admin production bundle is shared
once per host; no per-site Vite watcher. Memory/CPU were not measured because execution was forbidden;
budget scales approximately with these processes, database buffers, plugins and active agent work.
