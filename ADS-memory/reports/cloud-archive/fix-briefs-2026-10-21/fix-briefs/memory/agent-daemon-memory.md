# Agent daemon memory investigation (2026-10-21)

Targets: agent daemon pid 47837 (`agent-daemon-server.ts --workspace workspace-local`, :64066, up ~15.5 h) and website server pid 47687 (:3000).
Method: footprint sampled every ~64 s for 16 samples (14:25-14:41); chat DB read-only; code review of Tovu `server/inbound/assistant/` plus Jini `daemon`, `chat`, `agent-runtime`; inspector enabled with `kill -USR1 47837`; two heap snapshots taken after forced GC, 11 min apart; a 9-minute sampling allocation profile that also counts objects GC later collected.

**The inspector is still listening on 127.0.0.1:9229 inside pid 47837.** It stays open until the daemon's next restart. No client is attached.

## Verdict

There are two problems. They add up to the swings the owner saw.

1. **Allocation churn (main cause of the 0.6 → 2 GB swings).** Durable-run bookkeeping in the daemon re-reads and re-parses the **whole conversation transcript**, including every message's `events_json`, several times per run and per delegated tool call. Conversation `c9fca06f` now holds **60.5 MB** of `events_json` across 16 messages, so each read costs about 100-200 MB of short-lived heap. The live heap does not grow from this; V8 lets the heap run up to 1.6-2 GB before a major GC. Evidence:
   - During the live run at 14:28 the daemon heap was `heapUsed 1620 MB`. Five seconds later it was 717 MB, and after a forced GC it was **410 MB**.
   - A 63-second turn at 14:35 (5 delegated tool calls; its own events were only 0.56 MB) moved the daemon footprint from 665 MB to **1259 MB**. In the same window the daemon allocated **4.4 GB**: 1.9 GB of SQLite row strings and 1.26 GB of `safeParse` → `toMessage` → `messages()`.
2. **A real but slow leak: the in-memory run event log is never dropped.** Every event of every run since boot stays on the heap, including base64 screenshot tool results that are stored twice. In snapshot 1 the event log held **118 MB of a 430 MB live heap**. In snapshot 2, after one more short run, it held **120 MB**. The post-GC floor moved 410 → 411 → 416 MB over 15 minutes, and it grows by roughly the size of each run's events (20-45 MB for a screenshot-heavy run). The run lifecycle's own 24 h eviction does not free this memory.

Not a leak: everything else in the live heap. About 300 MB is the tsx-compiled module graph and source strings: three 6.5 MB playwright-core sources, the 12.8 MB tsx lexer wasm memory, and code objects. Nothing else grew between the snapshots by more than about 3.4 MB of small strings.

## Footprint samples

`top` MEM is the macOS physical footprint; RSS comes from `ps`.

| time | daemon footprint | daemon RSS | website footprint | website RSS | activity |
|---|---|---|---|---|---|
| 14:25:18 | 1270M | 1063 MB | 799M | 799 MB | run ce7ef952 live (started 14:16) |
| 14:26:23 | 1068M | 1230 MB | 744M | 820 MB | live |
| 14:27:27 | 979M | 733 MB | 987M | 1109 MB | live |
| 14:28:31 | 1126M | 904 MB | 890M | 749 MB | live; inspector: heapUsed 1620 → 717 MB (natural GC) → 410 MB (forced GC) |
| 14:29:35 | 1338M | 1124 MB | 1255M | 669 MB | run ends 14:29:34 (786 events, 17.6 MB, 153 tool calls) |
| 14:30:40 | 904M | 656 MB | 617M | 618 MB | idle |
| 14:31:43 | 662M | 751 MB | 574M | 511 MB | snapshot 1 (post-GC heap 411 MB) |
| 14:32:47 | 666M | 748 MB | 639M | 574 MB | idle |
| 14:33:51 | 665M | 556 MB | 566M | 495 MB | idle |
| 14:34:54 | 665M | 557 MB | 571M | 499 MB | idle |
| 14:35:57 | 1100M | 596 MB | 1468M | 706 MB | new turn 14:35:55-14:36:58, same conversation |
| 14:37:02 | 1243M | 1063 MB | 1215M | 1169 MB | turn just ended |
| 14:38:05 | 1259M | 726 MB | 795M | 650 MB | idle |
| 14:39:09 | 666M | 445 MB | 828M | 683 MB | idle |
| 14:40:13 | 666M | 445 MB | 322M | 246 MB | idle |
| 14:41:17 | 664M | 424 MB | 393M | 349 MB | idle; snapshot 2 at 14:43 (post-GC heap 416 MB) |

When idle, the daemon settles at about 665 MB footprint. Every turn in the 60 MB conversation pushes it to 1.1-1.3 GB. The website server swings the same way, from 0.3-0.6 GB up to 1.47 GB.

## Heap snapshots (post-GC)

| | snapshot 1 (14:31) | snapshot 2 (14:43) | delta |
|---|---|---|---|
| live heap (self total) | 429.9 MB | 435.6 MB | +5.7 MB |
| strings ≥ 64 KB | 839, 138.6 MB | 140.5 MB | +1.9 MB |
| event log `runs` Map, retained | **118.16 MB** | **120.10 MB** | +1.94 MB |

Top growers between the snapshots were small strings (+3.4 MB / 4.8k), arrays (+0.6 MB) and Object (+0.6 MB). That matches one short run being appended to the event log.

Snapshot 1, dominator chain of the largest retained object:
```
(GC roots) → processImmediate context → timerListMap[86400000] → TimersList → Timeout._onTimeout
  → closure context (createRunLifecycle) → eventLog → append closure context → runs: Map   118.16 MB
      → table[17] → RunLog.entries: Array   43.58 MB
      → table[20] → RunLog.entries: Array   35.58 MB
      → table[8]  → RunLog.entries: Array   22.21 MB
      → table[14] → RunLog.entries: Array   12.01 MB
```
Largest strings, all of them base64 screenshot JPEGs from `web_screenshot_page` / theme captures. They are two-byte strings because the page title contains an em dash, so each is about 2x its UTF-8 size:
```
1347 KB  {"sitePath":"/","finalPath":"/","themeId":"cinematic-travel",...       ← entries[3004].data.content
1345 KB  {"content":[{"type":"text","text":"{\"sitePath\":\"/\",...             ← entries[2992].data.content (same result, MCP-wrapped)
```
Every delegated tool result is stored twice. One copy is the bridge's own `tool_result` (Jini `daemon/src/delegated-tool-bridge.ts:246`). The other is the CLI stream's MCP-wrapped `tool_result`.

## Allocation profile (9 min, 14:33-14:42; includes the 14:35 turn)

Total sampled allocation was **4418 MB**. Idle over a 90 s window it was 37 MB.
```
1916.6 MB  all                Jini/packages/db/dist/kernel/sqlite/driver.js:34      (row strings: events_json)
1255.1 MB  safeParse          Jini/packages/chat/dist/store/sql/store.js:42          (JSON.parse of every message's events_json)
             ← toMessage store.js:57 ← map ← messages store.js:141
 819.7 MB  String.replace     Jini/packages/cms/dist/widgets/markers/marker.js:133   ← scanEmbedMarkers ← media-references.ts
                              ← scanEntryAssets/classifyEntry (Tovu public-http/routes/site/media-rendition.ts)
  42.8 MB  express res.json
```
The profiler cuts async stacks at the `await`, so `messages()` shows no caller. The code review below accounts for the volume. About 1.9 GB of reads, at roughly 60-70 MB per transcript read, is about 30 transcript loads in one 63-second turn.

## Causes, code locations, fix proposals

### Cause 1: whole-transcript reloads in the durable run store (churn; drives the swings)
- `Jini/packages/chat/src/store/runtime/durable-run-store.ts:105-143`: `find()` → `load()` → `loadSnapshot()`. `:113` calls `history.messages({ conversationId })`, which `SELECT`s and `JSON.parse`s the `events_json` of **every message in the conversation** (`Jini/packages/chat/src/store/sql/store.ts:74,89-90` `safeParse`/`toMessage`). Only `transcript.find(item => item.id === messageId)` is used, plus `acceptedRequest` on fallback.
- Callers in the daemon, per turn:
  - `captureSession` (`durable-run-store.ts:241-258`) calls `find()` **twice**. It is invoked twice per turn from `Tovu/apps/website/src/server/inbound/assistant/early-run-session.ts:36` and `:41` (once for the session id, again with the child pid). The trigger is `agent-daemon-server.ts:1029`, on the init status event. The `end` event triggers it again.
  - Delegated tool guard: `Tovu/apps/website/src/server/inbound/assistant/durable-run-routes.ts:75` makes 1 `find()` per delegated tool call, read-only ones included. For mutating tools there are also `guardTool` (`durable-run-store.ts:274`, 2× `find()` plus `writeToolEvent` `:290`) and `completeTool` (`:298`, 2× `find()` plus `writeToolEvent`), wired at `durable-run-routes.ts:82,96`. A mutating tool call therefore costs 5 transcript loads.
  - `writeToolEvent` (`:290-291`) also re-serializes the whole message's events (`JSON.stringify([...events, event])`), which is 15-24 MB per write on the big turns.
  - `accept`, `advance`, `clearSession` and `recoveryClock` (`:145-216`, `:260`) also call `find()`/`load()`.
- **Fix:**
  - (a) Split `loadSnapshot` into a light `loadRunHead` (message row columns without `events_json` plus the `assistant_run_attempts` row) for every guard, fence and lock check: `find`, `captureSession`, `guardTool`'s staleness check, `clearSession`, `recoveryClock`, and the Tovu guard route. Load the transcript only in the path that needs `acceptedRequest`'s transcript fallback, which is legacy rows with no `accepted_json`.
  - (b) Where a single message's events are needed (`guardTool`'s unknown-tool check, `writeToolEvent`), select only that row's `events_json`.
  - (c) Make `writeToolEvent` append with SQLite JSON (`json_insert(events_json, '$[#]', json(?))`) instead of a full JS parse and stringify.
  - (d) In `captureSession`, drop the second `find()` inside the same transaction once the lock is held, or compare generation via the attempts row.

  Expected effect: per-turn allocation falls from GBs to MBs, and the 0.6 → 1.3 GB swings disappear. The cost now grows with conversation size × tool calls, so this needs fixing first. Long screenshot conversations get steadily worse.

### Cause 2: in-memory event log never dropped (true leak)
- `Jini/packages/daemon/src/event-log.ts:63-66`: `runs = new Map<string, RunLog>()` with no cap unless `maxEntriesPerRun` is passed. `drop()` (`:140`) is **never called** in production code: grep finds only tests.
- `Jini/packages/daemon/src/run-lifecycle.ts:657-663`: `evictTerminalRun` deletes the lifecycle record after the 24 h retention or the 1000-run cap, but never calls `eventLog.drop({ runId })`. Event data outlives its own run record forever.
- `Tovu/apps/website/src/server/inbound/assistant/agent-daemon-server.ts:455`: `createInMemoryEventLog({})` is created with no `maxEntriesPerRun`.
- Doubling: `Jini/packages/daemon/src/delegated-tool-bridge.ts:246` emits a raw `tool_result`, and the CLI's MCP-wrapped `tool_result` for the same call is also appended. Base64 images are retained twice.
- **Fix:**
  - (a) In `evictTerminalRun`, call `void eventLog.drop({ runId })`. One line in Jini; it gives the event log the same lifetime as the run record.
  - (b) Shorten the terminal retention for the event payloads. The durable copy lives in `ai_chat_messages.events_json`, so a terminal run's in-memory log only has to cover reconnect-and-replay, which takes minutes, not 24 h. Options: pass `terminalRetentionMs` around 10-30 min from the daemon, or drop the log a few minutes after `end` while keeping the small status record for 24 h.
  - (c) Bound `tool_result` content in the event log: store the media out of band (the bridge already extracts `media` for the UI), or truncate `content` above a size limit with a marker. Also stop retaining both copies of one tool result.

### Cause 3 (website server, secondary, same root): per-second checkpoints re-parse the run's events
- `Tovu/apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts:373` `checkpoint()` runs at most once per `checkpointIntervalMs` (default 1000, `:240`) for the whole run. Each call goes to `Jini/packages/chat/src/store/runtime/run-ledger.ts:160-176`, which SELECTs the row's full `events_json`, `JSON.parse`s it **twice** (`readEvents` on `:166` and `:167`) and `JSON.stringify`s it again. For a 17-24 MB turn that is about 100 MB of garbage per second. The website footprint swings (0.3 → 1.47 GB) line up with the turns. Admin transcript reloads of the 60 MB conversation probably add to this; that was not profiled, because the inspector was only opened on the daemon.
- **Fix:** parse once and reuse it for `hasNewToolProgress`. Better: keep the last checkpointed event count in the `Watch` and append only new events, using SQLite JSON functions or an events side table, instead of rewriting the whole column every second. Back the interval off for large payloads, for example 5 s when `events_json` exceeds 5 MB.

### Minor / noted
- `Jini/packages/daemon/src/tool-executor.ts:237,274`: the `audits` Map gets one record per tool execution and is never deleted (`getAuditRecord` reads it). Records are small, about 1 KB each, but growth is unbounded. Fix: evict on terminal phase after a short TTL, or keep an LRU of about 1000 records.
- The daemon's media-rendition marker scan (`media-rendition.ts` `classifyEntry` → `scanEntryAssets` → `scanEmbedMarkers`, Jini `cms/.../marker.js:133`) allocated 0.8 GB of `replace` strings in the 9-minute window, most likely while screenshot tools render pages. This is churn, not retention. It is worth caching per entry revision.

## Artifacts (scratchpad)
`~/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/a8a0157a-d3bf-46f1-8c8f-b34ce4ce16e8/scratchpad/leak/`: `samples.txt`, `gc-floor.txt`, `s1-summary.{txt,json}`, `s2-summary.{txt,json}`, `diff-s1-s2.txt`, `alloc-9min.txt`, `alloc-idle-90s.txt`, plus the scripts (`sampler.sh`, `insp.mjs`, `alloc.mjs`, `summ.mjs`, `diff.mjs`). The `.heapsnapshot` files were deleted after summarising. No source files were edited, no tests were run, and no process was signalled except the single `kill -USR1 47837`. The sampler has exited and no inspector clients remain.
