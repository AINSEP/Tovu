# ADR-070: The agent daemon is a slim, on-demand process; site tools run in the server

- Status: Accepted; desktop placement amended by the approved lane-a review (2026-11-03).
  Shared desktop activation/acceptance still requires coordinator wiring and cloud validation.
- Date: 2026-10-26
- Amends: ADR-049 (the architecture correction recorded in `agent-daemon-server.ts:24–41`,
  "tool execution could not be split off"). ADR-049's process split and Decision 2 (gated Jini
  `ToolExecutor`) stand unchanged.
- Owner decision: 2026-10-26 — chat stays a separate slim process that stops when idle.

## Context
Each site runs a server (~187 MB) and an agent daemon (~174 MB idle). The daemon boots a second
full site composition and a second copy of every tool, although the server already builds the
identical gated tool surface for BYOK chat. Most sites are idle most of the time.

## Decision
1. The daemon keeps agent runs: runtime, RunLifecycle, event log, durable-run routes, run
   ownership, MCP bridge injection, frontend-control tools, and the chat attachment store (sole
   owner of uploads, claims and cleanup).
2. Site tools execute in the server through the existing BYOK `ToolExecutor` stack, reached by a
   loopback NDJSON RPC (`POST /internal/tool-executions`): dedicated per-boot token, socket-peer
   loopback check, auth before body parsing, mounted before the public JSON parser.
3. Execution is at-most-once: the client never retries; a failure after dispatch is "outcome
   unknown" and is recorded so the durable mutation guard requires verification before a repeat.
4. The daemon's tool catalog is fetched per principal at run start, uncached, and held only while
   that principal has a live run.
5. The daemon opens the site DB through a leaf client (configured driver only); migrations, seeds,
   repairs and plugin-migration recovery belong to server boot.
6. External MCP federation lives only in the server.
7. The daemon starts on first chat use and exits after N idle minutes (default 15, 0 = never).
   Passive streams do not hold it awake; every active run, pending approval and in-flight tool
   call does. The supervisor treats the park exit code as "parked", not a crash.
8. A desktop instance supervises one shared slim daemon, with a private scope per authenticated
   server workspace. Each scope keeps the existing composition, credential/ownership middleware,
   leaf DB client, runtime/inventory, settings, attachments, events and run maps. Explicit copied
   environments and site credentials arrive only through inherited native child IPC; the shared
   child environment/argv and per-instance discovery record contain no site credentials. A URL
   prefix names only a routing candidate: that scope's own existing auth must pass before effects.
   Standalone serve and a disconnected desktop server's local fallback use the same scope factory.
   Jini's supervisor, Node adapter and atomic registry remain the process lifecycle owners.

## Consequences
+ ~95–115 MB less per site while chatting; ~174 MB less while parked; tools no longer duplicated.
+ One gate, one audit trail, one federation per site.
− A desktop server restart withdraws/drains that site's scope and ends its runs. Other sites keep
  using the same process. Standalone restarts still end their local daemon. Interrupted runs use
  durable recovery and fencing, never automatic replay of a possibly dispatched mutation.
− Attached desktop instances retain the owning server's binding. Automatic takeover after owner
  exit is deliberately deferred by the lane-a review; it is not an implemented acceptance gate.
− Heavy tools share the server event loop (already true for BYOK).
− First chat after a park pays a 1–3 s (compiled) wake, mostly hidden by the chat-open pre-warm.

## Fitness rule (governance)
The daemon entry must not statically import `composition/deps.ts`, `composition/app.ts`,
`open-site-store.ts`, tool registrations, admin HTTP routes or DB migrations. Enforced by
`agent-daemon-import-graph.unit.test.ts`.

## Re-evaluation triggers
Daemon idle footprint > 80 MB after the lean cut; shared crash impact or scope-isolation failures;
a need for runs to survive server restarts or automatic hosting takeover after owner exit.
