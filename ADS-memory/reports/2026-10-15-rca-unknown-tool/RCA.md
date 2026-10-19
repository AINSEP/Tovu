# RCA: chat run died after "unknown tool content_read" (2026-10-15)

Run `75239a9c-e59f-4bdb-8ba0-e0ce7f6b3c12`, message `8a43f2d8-…`, conversation `091b24a3-…`, site order-pinch, dev server :3000.
Scope: root cause only. No code changed, no tests run. A copy of chat.db was read and then deleted.

## Bottom line

- **The dev-server restart did not cause this.** No registration race and no stale executor. The daemon booted at 04:16:50 and the run started at 04:17:11. The failing call came 10 minutes later. `recovery_count = 0`, so the run never crossed a restart. Hypotheses (a) and (b) are **refuted**.
- **"unknown tool content_read" is correct.** The model made up a tool id. Only `content_read.<resource>` cards exist (`apps/website/src/assistant/content-read-tool.ts:136-138`; metadata keys in `contracts/core/tool-metadata/content-read.ts`). The subagent called bare `content_read` with `{type:"menu"}`, even though every skill names `content_read.menu`. It recovered by itself 15 s later using `content_read.menu`. The run then kept working for 5 more minutes.
- **The "could not continue" notice comes from a different bug.** The durable-recovery classifier in Jini (`packages/chat/src/server/durable-runs/recover.ts:40`) matches `context[_ -]?(length|window)` against the raw diagnostics, case-insensitively. Every Claude CLI `result` line contains `"modelUsage":{…"contextWindow":1000000…}`. So any attempt whose saved events include a finished CLI turn is classified **permanent**, and recovery ends it with `EXHAUSTED_NOTICE` (`recover.ts:116`) instead of continuing it.
- **The unknown-tool episode also exposed a second bug.** The durable tool guard in Tovu records a `tool_use` for a call before the Jini route refuses it. This produced the misleading 409 "may already be done", and the orphan event is still in the saved transcript (event 730).

Confidence: **90%** on the notice cause (recover.ts:40 false positive). **95%** on the guard orphan and 409 chain. **50%** on *why* the live watcher did not settle the daemon's 04:31:50 "succeeded" end. There is no finalizer logging; see "Open question".

## Timeline (UTC; source: daemon.log, server.log, chat.db events_json)

| Time | Event |
|---|---|
| 04:16:13 / 04:16:50 | tsx-watch restart; server up; daemon pid 99993 listening on :58169 (daemon.log seq 1-7) |
| 04:17:11 | Run 75239a9c accepted (`assistant_run_attempts.attempt_started_at`); prompt "…can you do that with a subagent?" |
| ~04:17 | Main agent spawns a background Opus subagent "Build Pinch theme + pages" (event 38-41) |
| ~04:19 | Main agent's first turn ends. The CLI emits `{"type":"result",…"contextWindow":1000000…}`, saved as a **raw** event (event 211). The CLI stays alive for the background task. |
| ~04:26:5x | Subagent: `execute_readonly_delegated_tool {toolId:"content_read", input:{type:"menu"}}` (event 513). **Tovu durable guard** writes a `tool_use` (MCP toolUseId `ee443024…`) to events_json. **Jini read-only preflight** then answers 403 "not registered as read-only … call it through execute_delegated_tool" (event 515). The tool never ran and no `tool_result` is ever written. |
| ~04:26:5x | Subagent follows that advice: `execute_delegated_tool` with the same id and input (event 521). The guard finds the orphan from event 513 and returns **409 TOOL_OUTCOME_UNKNOWN** "This operation may already be done" (event 523), for an operation that never existed. |
| 04:26:59 | Subagent retries with `{type:"menu",id:"main-menu"}` (event 527). It passes the guard; the bridge emits tool_use/tool_result; `ToolExecutor` throws `unknown tool "content_read"`. The route turns this into **500 INTERNAL_ERROR ERR-77D3-…** (daemon.log seq 12-13; events 528-530). `principal=(unresolved)` is only a placeholder: the HTTP route's error context has no principal (`Jini packages/daemon/src/tool-recovery/redaction.ts:135`). |
| ~04:27 | Subagent searches, finds `content_read.menu`, and reads the menu successfully (events 532-540). Work continues: theme files, pages, a publish approval card (648), screenshots. |
| 04:31:40 | Last saved progress (`last_progress_at`); last text "The mobile Shop screenshot shows the first product image blank. Checking whether that's a real bug." (event 728) |
| 04:31:50 | Daemon: `run 75239a9c ended: succeeded (code=0 …)` (daemon.log seq 22) |
| 04:31:50 → 04:39:10 | Message row stays `running`. Nothing after event 729 was ever checkpointed. |
| 04:38:59 | Next owner interaction reaches the daemon (server.log seq 12). New work starts at 04:39:57. |
| 04:39:10 | Message settled `run_status=failed`, `ended_at=04:39:10`, final event `{"kind":"status","label":"The assistant could not continue this answer. Saved work is above."}` (event 731) |

Event 730 (`tool_use content_read {type:"menu"}`, id `ee443024…`, no `mcp__jini__` wrapper) is **not** a new call. It is the guard's orphan from event 513. `keepToolCheckpoints` (`Jini packages/chat/src/store/runtime/run-ledger.ts:80-84`) moves every saved tool event missing from the incoming stream to the *end* of each checkpoint. Exactly one bare `content_read {type:"menu"}` orphan exists. The 409 at event 523 proves the 513 orphan was in the DB, so 730 is that orphan.

## Root cause 1 (user-visible notice): recovery misreads a healthy CLI result line as a permanent failure

- `Jini packages/chat/src/server/durable-runs/recover.ts:14-26` `attemptDiagnostics` concatenates every `status` label and every **raw stdout line** of the attempt. `attemptBase` is `[]` here, so that means all 730 events.
- `recover.ts:40`: `/…|context[_ -]?(length|window)|…/i` → "permanent". `contextWindow` in the event-211 result line matches: the separator is optional and the `i` flag accepts the camelCase. I replayed all three classifier regexes over the saved events. **This is the only match**: no 4xx status text, no watchdog, no auth.
- `recover.ts:113-116`: permanent → `finalize(run, EXHAUSTED_NOTICE)` → `failed`. DB corroboration: `recovery_deadline = NULL` and `recovery_elapsed_ms = 0`. `resolveMissing` → `recoveryClock(active:true)` (`durable-run-store.ts:318`) would have set a deadline, so the decision was made at line 116, before any continuation was attempted. `budgetNotice` cannot be the source: recovery_count is 0 and staleness would have produced a different notice.
- Without this false positive, the classifier returns "retryable". Recovery would then `continueDead` and launch a continuation attempt ("Continued" divider), not kill the answer.

## Root cause 2 (the 409 and the orphan): the durable guard records calls that the daemon then refuses before running them

- `Tovu apps/website/src/server/inbound/assistant/durable-run-routes.ts:52-76` runs **before** Jini's `/api/delegated-tool-calls` route. For any tool that is not read-only, including unknown ids ("Unknown registrations fail closed as potentially mutating tools", line 46-47), it calls `store.guardTool` (line 75).
- `Jini packages/chat/src/store/runtime/durable-run-store.ts:274-288` `guardTool` writes `tool_use{id: toolUseId}` to events_json (line 285) and returns "allowed".
- Jini then refuses the call **before the bridge** (read-only preflight 403, `packages/daemon/src/http/delegated-tools.ts` `checkReadOnlyConstraint`), so no `tool_result` is ever written. The tool never ran, yet the ledger says "outcome unknown".
- The next call with the same tool and input → `hasUnknownToolCall` (`durable-run-store.ts:284`, `core/durable-runs/continuation.ts:23-33`) → 409 `UNKNOWN_MUTATION_ERROR`. The orphan is kept for the rest of the run (`run-ledger.ts:80-84`). Any continuation prompt would list it as "OUTCOME UNKNOWN: verify state before repeating" (`continuation.ts:35-40`).
- Aggravating factor: the 403 wording (`Jini packages/daemon/src/core/read-only-tools.ts:33-39`, "unknown registrations and writes share one refusal") tells the model to retry through `execute_delegated_tool`. For an *unknown* id, that retry is exactly what hits the 409 and then the 500.

## Contributing: an unknown tool id returns a redacted 500 instead of a 4xx with a hint

`Jini packages/daemon/src/tool-executor.ts:337-339` throws a plain `Error` for an unregistered id. The route's catch (`delegated-tools.ts`, around line 333-336) turns that into SEC-005 `500 INTERNAL_ERROR ERR-…`. The model gets no "did you mean `content_read.menu`". It recovered here, but only through a separate `search_tools` call.

## Open question (not determined): why the live watcher did not settle at 04:31:50

A succeeded `end` frame carries no error (`Jini packages/chat/src/core/run-events/entry.ts:340-347`, `endOutcome`). So if the in-process watcher (`Tovu …/modules/assistant-run-finalizer.ts:432-441` `applyStreamFrame`, `504-511` `resolveStreamOutcome`) had read it, the row would be `succeeded`. Nothing after event 729 was saved, so the watcher stopped receiving frames around 04:31:40. Server.log shows the daemon was slow to answer at 04:30:50 (6.9 s, during back-to-back screenshots), which suggests a dropped or stalled SSE stream. The row was then left for a later recovery pass, which root cause 1 ended. The finalizer logs nothing about drops, probes or recovery decisions, so the exact path (stream 404 → `recoverWatch("stream")` vs a `browser`/send-triggered recover at 04:38:59) cannot be reconstructed. This **does not change the fix**: whichever path ran recovery, `recover.ts:40` decided the outcome. Suggested follow-up (separate): one `console.info` line per `recoverWatch`/`decide` outcome with runId, trigger, probe and failure class.

## Can desktop / prod users hit it?

**Yes. Nothing here depends on tsx watch.**
- Root cause 1 hits **any** durable recovery of a Claude run whose current attempt already contains a finished CLI turn (a `result` line). That includes runs that use background subagents or `ScheduleWakeup`, which are now common. Triggers:
  - a dropped or stalled event stream (as here)
  - desktop app relaunch or site-server restart mid-run (boot `reconcileInterrupted` → `recover("boot")`)
  - an `end` frame with `failed`
  - browser-triggered recovery

  Each of these ends the answer with "could not continue" instead of continuing it. Desktop and prod use the same `@jini-ai/chat` recover coordinator.
- Root cause 2 hits any model that calls the read-only gateway with a non-read-only or invented id and then retries through `execute_delegated_tool` with the same input. The guard is Tovu server code, so desktop is affected too. The result is a spurious 409 and a permanent "outcome unknown" orphan in the transcript.

## Smallest fix (in priority order)

### Fix 1: Jini `packages/chat/src/server/durable-runs/recover.ts:40` (1 line)
Require a real separator so a camelCase JSON key cannot match. Change `context[_ -]?(length|window)` to `context[_ -](length|window)`. This still catches `context_length_exceeded`, "context length" and "context window", and the line already has `maximum context`.
Optional hardening (~3 lines, same file, in `attemptDiagnostics`): skip raw lines that parse as JSON with `type === "result" && is_error === false`. Raw stdout JSON also carries task descriptions written by the user or model, for example a `task_progress` description containing "forbidden" or "billing". The same class of bug was hit before with "OAuth-authenticated", per the comment at recover.ts:110-112.
**Regression test** (fails before): `Jini packages/chat/src/server/durable-runs/__tests__/recover.test.ts`, next to "still retries an HTTP 429 rate-throttled attempt" (line 87):
```ts
it("a healthy CLI result line (modelUsage.contextWindow) is not a permanent failure", async () => {
  const h = harness({ events: [{ kind: "raw", line: JSON.stringify({ type: "result", subtype: "success", is_error: false,
    modelUsage: { "claude-opus-5-5": { contextWindow: 1000000, maxOutputTokens: 128000 } } }) }], probe: "dead" });
  expect(await h.recovery.recover({ messageId: "answer", trigger: "attempt-failed" }, {})).toBe("continued");
  expect(h.settlements).toEqual([]);
});
```
Today it returns `"finalized"` with `EXHAUSTED_NOTICE`.

### Fix 2: Tovu `apps/website/src/server/inbound/assistant/durable-run-routes.ts:54` (1 line)
Do not ledger read-only-gateway calls. The Jini route either runs them as a genuine read-only tool (the guard already allows those, line 74) or refuses them with 403 before any execution. Either way no mutation can happen, so there is nothing to protect against repeating:
`if (typeof body.runId !== "string" || typeof body.toolId !== "string" || (req.body as { requireReadOnly?: unknown }).requireReadOnly === true) { next(); return; }`
The stale-attempt fence (line 73) would then be skipped for read-only calls. If that fence must stay, move the check after line 73 instead: `if (requireReadOnly || isReadOnly(...)) return "allowed"` (still 1 line).
**Regression test** (fails before): `Tovu apps/website/src/server/inbound/assistant/__tests__/durable-run-routes.unit.test.ts`. POST `{runId, toolUseId:"u1", toolId:"content_read", input:{type:"menu"}, requireReadOnly:true}` with a downstream stub that answers 403. Then POST the same toolId and input without `requireReadOnly` (toolUseId "u2"). Expect the second call to reach `next()` (no 409 `TOOL_OUTCOME_UNKNOWN`), and expect no `tool_use` "u1" in the stored events.

### Fix 3 (optional UX): Jini daemon unknown tool id → 4xx with a hint (~5 lines)
In `delegatedToolExecuteRoute.handle` (`packages/daemon/src/http/delegated-tools.ts`), before `bridge.execute`: if `deps.toolRegistry` lists no tool with that id, return `400 BAD_REQUEST` "unknown tool "X"". List ids that start with `X.` when any exist, e.g. "did you mean content_read.menu, content_read.post, …". In `read-only-tools.ts:37-38`, separate unknown ids from writes so the 403 stops telling the model to retry an invented id through `execute_delegated_tool`. Test: route unit test, unknown `toolId` → 400 whose message names the `content_read.*` candidates, and no `[tool-failure]` sink call.

Fix 1 alone would have turned this incident into an automatic continuation. Fix 2 removes the phantom 409 and the orphan event. Fix 3 removes the model's dead-end retry.
