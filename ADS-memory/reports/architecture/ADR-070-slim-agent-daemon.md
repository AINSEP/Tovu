# ADR-070: The agent daemon is a slim, on-demand process; site tools run in the server

- Status: Proposed (flip to Accepted when W3-C lands; record parking when W5-E1 lands)
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

## Consequences
+ ~95–115 MB less per site while chatting; ~174 MB less while parked; tools no longer duplicated.
+ One gate, one audit trail, one federation per site.
− A server restart still ends the daemon; runs resume through durable recovery, not live survival.
− Heavy tools share the server event loop (already true for BYOK).
− First chat after a park pays a 1–3 s (compiled) wake, mostly hidden by the chat-open pre-warm.

## Fitness rule (governance)
The daemon entry must not statically import `composition/deps.ts`, `composition/app.ts`,
`open-site-store.ts`, tool registrations, admin HTTP routes or DB migrations. Enforced by
`agent-daemon-import-graph.unit.test.ts`.

## Re-evaluation triggers
Daemon idle footprint > 80 MB after the lean cut; multi-site desktops routinely chatting on 3+
sites at once (revisit a shared daemon); a need for runs to survive server restarts.
