# fix-memory-2026-10-21 REPORT (agent-daemon + website-server memory)
Branch `cloud/fix-memory-2026-10-21` in Jini and Tovu (base cloud/integration-2026-10-21). Ran 22:22-23:05 UTC. 3 subagents (Opus), all done.

## Per cause
1. **Whole-transcript reloads (durable run store)**. FIXED. Jini d33e1109 (wip) + 0f42d764; Tovu 8884a276 (type only).
   Guards, locks and tool calls read only the run's own message row plus its attempts row; the whole transcript is read only by load/accept/cancelPending and legacy rows with no attempts row. lockedRun: lock-free probe, take lock, one re-read by run_id (removes captureSession's 2nd find). writeToolEvent appends in SQL (substr/length/||, works on both SQLite and PG, output byte-identical to JSON.stringify).
   JSON.parse per call, conversation with 10→200 turns: find 13→203 before, 3 after; captureSession/completeTool/clearSession/recoveryClock/cancel 26→406 before, 2 after; guardTool 26→406 before, 3 after.
   API: new `DurableRunHead = Omit<DurableRun,"transcript">`; `DurableRunStore.find` returns it (no caller read transcript); `toMessage` exported from sql/store.ts. Corrupt non-array events_json now gets appended to instead of throwing.
2. **Event log leak**. FIXED. Jini bc968cc1; Tovu 06fefb7e.
   In-memory log compacts a run to its `end` entry `terminalRetentionMs` (default 15 min) after end. An old cursor then gets the existing replay-gap result and a replay from the start gets `truncated`; a resume cancels the compaction. `maxRuns` cap (default 1000) evicts the oldest ended runs; live runs are never evicted. Timers use the existing SchedulerPort and are unref'd. New lifecycle option `dropEventsOnEviction` (default false, because sqlite drop() deletes durable rows); Tovu agent-daemon-server enables it.
   After: 20 runs past retention 60→20 entries; 50 runs with cap 10 → 10 runs; lifecycle with drop on, 30 runs evicted → 0. "Before" = unbounded by construction (old code never evicted; not measured).
   Double base64 tool_result **not deduped**: the MCP server mints its own toolUseId (mcp/src/server/tools/delegated-tool.ts:208), so nothing links it to the CLI copy without a protocol change. The 15-min retention bounds both copies.
3. **Website checkpoints**. FIXED. Jini 7c7f40e2; Tovu 8dca082b + 69dc4aa4 (test type/lint fix; a second commit because force-push is banned).
   run-ledger parses events_json once (2→1 per checkpoint) and skips the UPDATE when nothing changed (1→0 writes). Append-only writes were not done: text deltas grow the last event in place and the merge reorders the tail, so it would not be equivalent (documented in code). Finalizer backs off to 5 s when the last payload is over 5 MB (`largeCheckpointBytes`/`largeCheckpointIntervalMs`, new optional fields). Fake-clock 20 s: 21→5 checkpoints for a large payload, 21 unchanged for a small one.
4. **tool-executor audits Map**. FIXED. Jini d7fb2446. `maxAuditRecords` (default 1000); a record enters eviction only at its terminal phase. 200 executions with cap 50 → 50; 1005 with the default → 1000.

## Tests (touched packages only)
- Jini daemon full suite: 137 files / 3434 pass (new: event-log-retention, run-lifecycle-event-drop, tool-executor-audit-bound).
- Jini chat src/store + src/server + core/durable-runs, final combined tree: 36 files / 552 pass (new: durable-run-store.reads, run-ledger).
- Tovu: agent-daemon-server.* 122/122; durable-run/run-ledger dialect suites (SQLite + PGlite) and related 138/138; finalizer users + checkpoint-backoff 105/105 + 4/4.
- Tovu tsc: errors remain only in files this job did not touch (import-site, browser-binding, backstop-service, app, deps…).

## Coverage (line/branch/function)
event-log.ts, tool-executor.ts, durable-run-store.ts, run-ledger.ts, sql/store.ts: 100/100/100.
run-lifecycle.ts 98.57/97.39/100. All new lines are covered; the gaps are older guards and catches (758-759, 804-805, 821-827).
assistant-run-finalizer.ts 97.42/93.72/87.3. All new lines are covered; the gaps are older HTTP daemon client code (33-48, 161, 201).

## Complexity (cyclomatic/cognitive, all ≤10)
compactRunLog 3/3, createInMemoryEventLog 6/2, enforceRunCap 4/4, append 7/6, evictTerminalRun 3/2, createRunLifecycle 6/1, appendEvent 3/2, retireAudit 2/1, createToolExecutor 5; find 8, readRun 8, runHead 5, lockedRun 5, load 4 (max cognitive in file 6); planCheckpoint 6/2, checkpoint txn 6/4; Tovu approximateJsonBytes 6/4, recoverySettings 9, checkpoint 7/6.

## LOCAL-RUN NEEDED
- Local soak of daemon footprint over a long screenshot-heavy chat (conversation like c9fca06f, 60 MB): post-GC heap floor should stay flat, and per-turn swings should drop from ~0.6→1.3 GB.
- Website server heap churn during a 17-24 MB turn.
- Real Postgres: `pnpm --filter @jini-ai/chat test:postgres`, Tovu TOVU_CHAT_TEST_POSTGRES_URL suites (in-SQL append and run-ledger).

## Owner questions / noted, not fixed
- Turn `dropEventsOnEviction` on for the sqlite kernel (server/kernel-base.ts)? It deletes durable event rows.
- Dedupe delegated tool_result: needs the CLI tool-use id carried across the MCP boundary (protocol change).
- Tovu poll route (assistant.ts:190 GET messageId) and assistant-chats.ts:242 still call load() → full transcript per poll.
- media-rendition marker scan churn (0.8 GB/9 min, cms marker.js:133): worth caching per entry revision.
- Behaviour change: a terminal run's full in-memory replay is gone 15 min after end (the DB copy remains).
