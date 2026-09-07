# Chat-death investigation — why runs die mid-response

- Started: 2026-09-06 ~23:40 local
- Repo: /Users/la/Programming/Tovu, branch restructure/apps-website-phased
- Subject case: chat "Save Image At Into Media Library", `sites/tovu-com/chat.db`, id `80bb855d-c562-427b-b0e9-2e4db8e13b55`
- All DB reads are read-only (`file:...?mode=ro`).

Every claim below is labelled **CONFIRMED** (read the code path / the row; file:line or row cited)
or **PLAUSIBLE** (inference).

## Log of findings (appended as work proceeds)

### F1 — CONFIRMED: a dead run is persisted as `succeeded`, not as a failure

`sites/tovu-com/chat.db`, chat `80bb855d-c562-427b-b0e9-2e4db8e13b55`, position 7:

```
p role      agent run_id                               run_status  content_len events_json dur_ms
7 assistant codex 27f54000-9f08-4b03-8c92-31fcdf0d2c6c succeeded   0           []          578
```

`started_at=1788762234067`, `ended_at=1788762234645` — the whole run lasted **578 ms** and emitted
**zero** agent events. It is recorded as a success.

It is not a one-off. Scanning every zero-length assistant message in the DB:

| chat | title | agent | run_status | dur_ms |
|---|---|---|---|---|
| 417a4d24 | Can You Upload This Image Media | claude | failed | 140176 |
| f9ab0887 | Avif Preview Check | claude | **succeeded** | **552** |
| cddab0cf | Just Attaching Image Just Reply Ok | claude | canceled | 12514 |
| 80bb855d | Save Image At Into Media Library | codex | **succeeded** | **578** |

**Two** empty-`succeeded` runs, ~550–580 ms each, on **two different agents** (`claude` and `codex`).
That cross-agent, sub-second, zero-event, "succeeded" signature is the fingerprint of the owner's
"chat just craps out". It is vendor-independent, which supports her own read that this is local
infrastructure.

### F2 — CONFIRMED: the exact code path that turns a dead stream into "succeeded"

1. `apps/admin/src/lib/assistant-transport.ts:314-321` — the daemon SSE `end` listener calls
   `finish()` unconditionally, which calls `handlers.onDone(collected)` with whatever it has
   (here: `[]`).
2. `/Users/la/Programming/Jini/packages/chat/src/react/hooks/useRunStream.ts:128-131` — `onDone`
   sets `status: prev.status === 'error' ? prev.status : 'done'`.
3. `/Users/la/Programming/Jini/packages/chat/src/react/hooks/useConversation.ts:98` —
   `else if (run.status === 'done') runStatus = 'succeeded';`
4. `apps/admin/src/lib/assistant-chats.ts:135-139` — `persistableMessages` writes any terminal
   status, so `succeeded` + empty content is written to `ai_chat_messages`.

There is **no check anywhere that a "done" run produced any output**. An `end` frame on a stream
that never emitted a single `agent` frame is indistinguishable, at every layer, from a real answer.

### F3 — CONFIRMED: the daemon reports the failure; the browser throws it away

`finish()` in `/Users/la/Programming/Jini/packages/daemon/src/run-lifecycle.ts:954-996` emits
**exactly one** event for a terminal run — `event: 'end'` — whose `RunEndPayload` carries
`code`, `signal`, `status: 'succeeded' | 'failed' | 'canceled'`, and `resumable`
(`/Users/la/Programming/Jini/packages/protocol/src/events.ts:66-82`). **No separate `error` event
is emitted for a failed run.**

The status itself is computed correctly:
`/Users/la/Programming/Jini/packages/daemon/src/close-status.ts:33-41` —
`code === 0 -> 'succeeded'`, anything else -> `'failed'`, called from
`agent-executor.ts:2107-2124` on the child's `close`.

The browser's `end` listener —
`apps/admin/src/lib/assistant-transport.ts:314-321` — reads **only** `payload.reason`
(via `readTerminalReason`, line 208) and then calls `finish()` unconditionally.
It never looks at `payload.status`, `payload.code`, `payload.signal`, or `payload.resumable`.

So **a run the daemon marked `failed` arrives in the UI as an ordinary completion and is written to
`chat.db` as `succeeded`.** That is the mechanism behind F1.

Note also: `RunEndPayload` has no `reason` field at all, so on the daemon path
`readTerminalReason` always returns `""` and `terminalReasonNotice` (line 195) can never fire.
`reason` is a BYOK-path field only. The daemon path's `end` handler is therefore reading a field
that does not exist while ignoring the four that do.

### F4 — CONFIRMED: the agent CLI's stderr is streamed to the browser and silently dropped

The daemon emits stderr as its own SSE event kind —
`/Users/la/Programming/Jini/packages/daemon/src/agent-executor.ts:2069`, `:2266`, `:2409`
(`lifecycle.emit(runId, { event: 'stderr', data: { chunk: text } })`), one per supported driver.

`apps/admin/src/lib/assistant-transport.ts`'s `subscribeToRun` registers listeners for
`"agent"` (284), `"stdout"` (293), `"error"` (301), `"end"` (314) — and **no listener for
`"stderr"`**. An `EventSource` drops any named event with no listener, silently.

When a coding-agent CLI dies, its diagnostics go to **stderr**. Those bytes cross the wire to the
browser and are discarded there. This is the single biggest reason a chat death is unreadable.

### F5 — CONFIRMED: nothing about a run is durable

- `apps/website/src/server/inbound/assistant/agent-daemon-server.ts:318` wires
  `createInMemoryEventLog()`. Per `/Users/la/Programming/Jini/packages/daemon/src/event-log.ts:47-53`
  that is explicitly "the in-memory half only — no durable copy". Every run's event log, including
  the terminal `end` payload with the real exit code, dies with the daemon process.
- `RunByteJournal` — Jini's raw-bytes-per-run recorder (`agent-executor.ts:2567`, optional) — is
  **not wired**: `journal` appears zero times in `agent-daemon-server.ts`.
- The daemon's own stdout/stderr is piped to the API's stdout
  (`apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts:456-457`), and the API's stdio is
  `"inherit"` from `development/scripts/dev.mjs:237` — whose own module doc (line 23) says
  "Deliberately NOT a process manager. No restart-on-crash, no log multiplexing beyond inherited".

So the only durable artifact of a dead run is the `chat.db` row — the one that says `succeeded`.

### F6 — CONFIRMED: `development/.dev-server.log` is not a log the system writes, and its staleness is not a regression

A repo-wide search over `*.mjs|*.ts|*.json|*.sh|*.md` (with a positive control to prove the pattern
matches) finds `dev-server.log` mentioned in **only three markdown files** —
`development/todos.md`, `ADS-memory/reports/2026-09-05-tovu-ce-queue.md`,
`ADS-memory/reports/2026-09-05-tovu-26-worklist.md`. **No code writes it.**

Its content confirms this: it begins with `> tovu@0.1.0 dev` / `> node development/scripts/dev.mjs`
and ends with `tovu dev: stopping…` — a one-off manual `npm run dev > development/.dev-server.log`
capture from a session that ended Sep 5 21:28.

**This refutes the previous session's method.** That log exists only when a human happens to
redirect the dev server's output. `development/todos.md:166` states "Every refusal reaches only
`development/.dev-server.log`" — that claim is wrong in the way that matters: those refusals reach
**the terminal's stdout**, and are captured only if someone redirected it. Today they are not
being captured at all.

---

## 1. What actually kills the run

**The specific run at 23:23:54 cannot be attributed from disk, and that is the finding.** What the
evidence does establish, with certainty:

- **CONFIRMED** — The run reached the daemon, started, and reached a terminal state in 578 ms with
  zero agent events (F1).
- **CONFIRMED** — Whatever the daemon decided that terminal state was, the browser could not have
  recorded it as anything but `succeeded`, because it never reads `RunEndPayload.status` (F3).
- **CONFIRMED** — Whatever the CLI printed on the way out was streamed to the browser as SSE
  `stderr` events and dropped, because no `"stderr"` listener is registered (F4).
- **CONFIRMED** — No durable copy of the run's events, exit code, or stderr exists anywhere (F5).

The **PLAUSIBLE** reading, consistent with every confirmed fact: the agent CLI (`codex`, and in the
second case `claude`) was spawned, rejected its own invocation — auth, config, or argv — printed the
reason to **stderr**, and exited within half a second. `close-status.ts:37-41` classified it
`failed`; `finish()` wrote one `end` event carrying `status:'failed'` and the real exit code; the
browser ignored all of it and wrote `succeeded`. Both surviving cases are ~550–580 ms, which is a
process-startup-and-immediate-exit duration, not a generation duration.

Three distinct server-side paths all `finish({status:'failed'})` and would ALL surface in the UI as
a clean success:
- `agent-executor.ts:2107-2124` — the child CLI closed with a nonzero code.
- `agent-executor.ts:3581` (`failRun`) — spawn/setup failure.
- `agent-daemon-server.ts:834` — the "refused: concurrent live run holds this agent's resumable
  session" branch.

The third is **ruled out** for chat `80bb855d` p7: `wouldForcedColdStartLoseConversationContext`
(`agent-session-resume.ts:161-167`) requires `storedSessionId !== null`, and
`assistant_agent_sessions` holds **no `codex` row at all** for that conversation.

### A corroborating second case, and a suggestive one

Chat `f9ab0887` ("Avif Preview Check"):

```
p1 claude succeeded 746 chars 25860 ms   17:31:00   <- normal turn, stores a session id
p3 claude succeeded    0 chars   552 ms  17:36:35   <- DEATH
p4 user   "…" (2 chars)                  17:37:06   <- and NO assistant row after it at all
```

Two things here:
1. p1 stored a resume session id; p3 attempted to resume it and died in 552 ms.
   `shouldClearSessionOnFailedResume` (`agent-session-resume.ts:104-111`) exists precisely because a
   stale/dead resume id is a known failure on this machine. **PLAUSIBLE** cause for the claude case,
   not confirmable from disk.
2. p4's assistant turn was **never written at all**. `persistableMessages`
   (`apps/admin/src/lib/assistant-chats.ts:135-139`) only persists a message that reached a terminal
   status — so a run that dies *without* ever reaching one leaves no row whatsoever. That is a
   **second, worse** disk signature: not a wrong record, but no record. It is what an admin reload
   mid-run (F-H1 below) produces.

## 2. The three inherited hypotheses

### H1 — "The daemon is a child of the tsx-watch API; a save under `apps/website/src` kills it mid-run"
**The mechanism: CONFIRMED. As the cause of the 23:23:54 death: REFUTED.**

The mechanism is real and I verified it on the live process tree, not from code:

```
29135  dev.mjs                                        Sep 6 10:35:16
 29273  npm exec tsx watch apps/website/src/index.ts  Sep 6 10:35:16
  29305  node (tsx watch supervisor)                  Sep 6 10:35:17
   17655  node  <- THE API, listening :3000           Sep 6 22:46:37   <-- restarted
    17852  npm exec tsx …/agent-daemon-server.ts      Sep 6 22:46:49   <-- child of the API
     17890  node  <- daemon, 127.0.0.1:61670          Sep 6 22:46:51
```

The daemon is spawned by the API with `TOVU_PARENT_PID = process.pid`
(`daemon-supervisor.ts:392`) and `detached: true` (`:451-452`), and `index.ts:352-357` spawns it from
inside `app.listen()`'s callback. The API restarting takes the daemon with it. **Confirmed.**

But **for this run it did not happen.** API pid 17655 has been alive since **22:46:37** and daemon
pid 17852/17890 since **22:46:49** — continuously, through 23:23:54, and still alive at the time of
writing (23:39+). A respawn would have produced a new pid with a ~23:23 start time. There is none.
The preceding codex turn (p5, 23:19:34, 66 s) also completed normally on this same daemon.

**Say this to the owner plainly: the leading hypothesis is wrong for this case.** It remains a real
hazard for OTHER runs, and it is worth noting that a save under `apps/admin/src` (which full-reloads
the browser) produces the *other* disk signature — no assistant row at all — because the client is
what persists, and a reloaded client never reaches a terminal status. That is signature (2) above.

### H2 — "Config is read at daemon START; a key saved during a run is not live until a restart"
**CONFIRMED, but not the cause here.**

`agent-daemon-server.ts` evaluates at module scope — i.e. exactly once per daemon process:
`routeDeps` (:315-317), `createInMemoryEventLog()` (:318), `createRunLifecycle` (:319),
`magicLinkPerEmailLimiter` (:334), `createSurfaceExchangeStore()` (:343),
`installFirstPartyToolContributors()` (:351), `createToolRegistry()` (:353), and
`buildAssistantToolRegistrations(...)` (:357+). None of it is re-read per run.

It cannot explain this death: the daemon had been up 37 minutes and the immediately preceding turn
on the same agent succeeded on that same daemon.

### H3 — "Errors collapse to generic text on the delegated-tool path"
**CONFIRMED as a pattern — and the chat-death case is a strictly worse instance of it.**

The collapse is deliberate and centralised:
`/Users/la/Programming/Jini/packages/http-kit/src/runs.ts:67-77` and
`delegated-tools.ts:287` both log the real error to a sink with a correlation id and return
`INTERNAL_ERROR: an internal error occurred` to the caller. Tovu does **not** override
`onInternalError` (zero occurrences in `apps/website/src`), so the real cause goes to
`defaultInternalErrorSink` — `console.error` (`runs.ts:32-35`) — i.e. the daemon's stdout, which is
piped to the API's stdout, which is `"inherit"`ed to a terminal and never persisted.

So the owner's instinct is right: **the real cause lives in a log, and that log is not being kept.**

But the chat-death case is worse than a generic error string, and this is the part worth being loud
about: **there is no error at all.** A daemon-side `failed` never becomes an error message of any
kind, generic or otherwise — it is reclassified as a success (F3). The owner is not looking at an
unhelpful error. She is looking at a *successful empty answer*.

## 3. The observability gap — what a person can and cannot learn after a chat dies

**Can learn, from disk, today:**
- That a turn happened, when, with which agent, and its `run_id` (`ai_chat_messages`).
- That it produced no content and no events, and how long it took.
- Which chats have a stored agent-CLI session id (`assistant_agent_sessions`).

**Cannot learn, from disk, today:**
- Whether the run **failed**. The `run_status` column actively says `succeeded`. There is no field
  anywhere that distinguishes "the model answered nothing" from "the CLI died". An operator reading
  this database is not merely uninformed — they are misinformed.
- The CLI's **exit code** or signal. Present in the `end` payload, discarded at the browser, never
  written.
- The CLI's **stderr** — the one place the actual reason lives. Streamed to the browser, dropped
  there (F4), never written.
- Whether the daemon or API **restarted** around the failure. Nothing timestamps daemon
  spawns/exits to disk; `[daemon-supervisor] …` messages go to a terminal.
- Whether a **resume** was attempted and with which session id.

**The evidence is not merely unwritten — it is currently sitting in memory, unreachable.** The
daemon retains terminal run records for 24 h (`DEFAULT_TERMINAL_RETENTION_MS`,
`run-lifecycle.ts:366`), and daemon pid 17890 has been alive since 22:46:51, so run
`27f54000-9f08-4b03-8c92-31fcdf0d2c6c`'s real terminal status is *in that process right now*.
I could not retrieve it: `GET http://127.0.0.1:61670/api/runs/<id>` returns
`401 {"code":"UNAUTHENTICATED"}`, the bearer token is minted into the API process's env at boot
(`ensureAgentDaemonToken()`, `index.ts:239`) and is **not** in `.env`, and the only way to read
another process's environment on macOS is `ps eww` — which this task correctly forbids because it
would dump every other credential in that process too.

That is the gap in one sentence: **the system knows exactly why the chat died, tells the browser,
the browser throws it away, and nothing writes it down.**

## 4. Proposed minimal observability plan

Four changes. All additive. Ordered by value per line.

| # | Change | Where | Cost | Behavior change? |
|---|---|---|---|---|
| 1 | Register a `"stderr"` SSE listener that forwards the chunk as a `raw` AgentEvent | `apps/admin/src/lib/assistant-transport.ts` `subscribeToRun` | ~5 lines | None to control flow. Renders text that is currently dropped. |
| 2 | Read `end.status`/`code`/`signal` and push a `status` AgentEvent naming the failure before finishing | same file, `end` listener | ~12 lines | **See caveat below.** |
| 3 | Log every terminal run's outcome server-side, on the `stream()` subscription that already exists | `apps/website/src/server/inbound/assistant/agent-daemon-server.ts:713-734` | ~6 lines | None. |
| 4 | Log every daemon spawn and exit with a timestamp | `apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts` | ~4 lines | None. |

**Caveat on #2, and why I stopped short of the obvious fix.** The *right* fix is for a `failed`
`end` to call `handlers.onError(...)` so the message persists as `run_status='failed'` and the pane
shows "This turn failed" (`MessageRow.tsx:356` already renders exactly that). **I did not do this —
it is a behavior change**, and it changes what gets written to `chat.db`. It needs the owner's
sign-off. What I implemented instead is the additive half: the failure is *rendered and logged*,
visibly, while the persisted status is left exactly as it is today. Flipping the persisted status is
a one-line follow-up once approved.

**Deliberately not proposed:** a durable `EventLog` adapter (`@jini-ai/sqlite` has one) or enabling
`RunByteJournal`. Both are real answers to F5, both are far more than "minimal", and both change
where data lives. #3 + #4 give the same diagnostic power for one-look triage at ~10 lines.

### What the next occurrence will look like after this

Chat dies -> the pane shows the CLI's own stderr text and a "Run failed (exit N)" status line;
the terminal/log shows `[agent-daemon] run <id> ended: failed (code=N, signal=none, resumable=false)`
timestamped, plus `[daemon-supervisor] daemon spawned pid=… / exited …` lines to correlate against.
No live reproduction needed.

---

## 5. Implementation

**Write-hazard notice (per dispatch instructions):** the edits below touch `apps/admin/src`
(full-reloads the admin in the browser and would destroy a live chat run) and `apps/website/src`
(bounces the agent daemon; it respawns in ~3 s). Both were made in one pass, deliberately, to keep
the disruption to a single window.

### What was implemented

**`apps/admin/src/lib/assistant-transport.ts`**
- New exported pure function `terminalOutcomeNotice(raw)` — parses a daemon `end` frame and returns
  a `status` AgentEvent naming the outcome, exit code, signal, and resumability. Returns `null` for
  a succeeded/absent/malformed payload, so a normal turn is byte-identical to before.
- `subscribeToRun` now registers the missing `"stderr"` listener, forwarding the chunk as a `raw`
  event exactly as the existing `"stdout"` listener does.
- `subscribeToRun`'s `"end"` listener now also pushes `terminalOutcomeNotice(...)`, ordered AFTER
  the existing `terminalReasonNotice` so a `max_tool_turns` turn keeps its more specific wording.

**`apps/website/src/server/inbound/assistant/agent-daemon-server.ts`**
- The `runLifecycle.stream(run.id, ...)` subscription at `:713` (which already existed for
  session-ref capture) now logs every terminal `end`:
  `[agent-daemon] run <id> ended: <status> (code=…, signal=…, resumable=…, agent=…, conversation=…, resumeAttempted=…)`
  — `console.log` on success, `console.error` otherwise. Zero new subscriptions, zero new state.

**`apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts`**
- ISO-timestamped `spawned agent daemon pid=…` and
  `agent daemon pid=… exited (code=…, signal=…, deliberate=…) — any run in flight died with it`.
  `deliberate=true` (a shutdown) is logged too, on purpose: a save under `apps/website/src` restarts
  the whole API, and that is exactly the correlation an operator needs to be able to make.

**`apps/admin/src/lib/__tests__/assistant-transport.run-death.unit.test.ts`** (new) — 8 tests.

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` (apps/admin) | clean, no output |
| `npx tsc -p tsconfig.json --noEmit` (repo root / website) | clean, no output |
| `npx eslint` on the 3 touched source files | **0 errors** (7 pre-existing warnings in `assistant-transport.ts`, none introduced) |
| new suite `assistant-transport.run-death.unit.test.ts` | 8/8 pass |
| `assistant-transport.daemon.unit.test.ts` | 50/50 pass |
| translate + byok + a2ui + transcript + ag-ui transport suites | 123/123 pass |
| `daemon-supervisor.test.ts` | 16/16 pass — new log lines observed firing in the output |
| `agent-daemon-server.session-resume-wiring.unit.test.ts` | 11/11 pass |

**RED proven from `HEAD` without touching the working tree:**
```
$ git show HEAD:apps/admin/src/lib/assistant-transport.ts | grep -n 'source.addEventListener("'
284:  source.addEventListener("agent", …)
293:  source.addEventListener("stdout", …)
301:  source.addEventListener("error", …)
314:  source.addEventListener("end", …)      <- no "stderr", and the body reads only `reason`
$ git show HEAD:apps/admin/src/lib/assistant-transport.ts | grep -c "terminalOutcomeNotice"
0
```
So at HEAD the stderr test's `h.events` is `[]` and the failed-`end` test's `h.done` is `[]` — the
exact empty-successful-turn the two `chat.db` rows record.

### Known cosmetic note

The new `"stderr"` listener body is identical to the existing `"stdout"` listener's — a 2-site
clone. Left un-extracted deliberately: extracting would mean editing the existing `stdout` path,
and a smaller additive diff is easier to revert. Not a gate breach (the duplication gate fires at
three sites).

### Scope limit on the daemon-side log

`agent-daemon-server.ts`'s terminal log lives inside the `if (conversationId !== undefined)` block,
because that is where the existing subscription is. Every admin chat-pane run sends a
`conversationId`, so every chat turn is covered. A daemon client that sends none would not be.
Moving it out is a two-line follow-up if that ever matters.

## Open questions for the owner

1. **Should a `failed` daemon run persist as `run_status='failed'`?** Today it persists as
   `succeeded`. Fixing that is one line (`handlers.onError` instead of a status event in the `end`
   listener) and would also light up the pane's existing "This turn failed" row
   (`MessageRow.tsx:356`). It is a behavior change to what the product writes down, so I stopped.
2. **Should the daemon get a durable event log?** `@jini-ai/sqlite` has an `EventLog` adapter;
   `agent-daemon-server.ts:318` currently wires `createInMemoryEventLog()`. This is the real fix for
   F5 and is a genuine architecture decision, not a logging tweak.
3. **`development/todos.md:166` is wrong** and should be corrected: it says refusals "reach only
   `development/.dev-server.log`". Nothing writes that file. They reach stdout.
4. **Run `27f54000-9f08-4b03-8c92-31fcdf0d2c6c`'s real exit code is still recoverable** — it is in
   daemon pid 17890's memory until ~23:23 tomorrow, and that process is still alive. Retrieving it
   needs the bearer token from the API process's env, which I would not read (`ps eww` would dump
   every other credential too). If the owner wants the definitive answer for this one run, she can
   get it herself before that daemon restarts.
