# Why the admin chat goes quiet for 1–2 minutes (read-only diagnosis)

Date: 2026-09-27. Scope: the admin assistant dock, Local CLI mode (Claude Code). This was a read-only
investigation: no source edits, no restarts, and no writes to any `.db` file.

## TL;DR

- **A slow agent is not the main cause of the long silences.** In 34 real owner runs (09-21 to 09-27),
  the model's own gaps between steps are 1.5–5 s each. Every gap over 20 s falls into one of four
  groups:
  1. **Cards waiting on the owner** (connect, ask-choice, publish confirm): 25 s to 300 s each, about 1,700 s in total.
  2. **Anthropic API 529 overload retries**: 254 s and 333 s, with nothing on screen except "Thinking…".
  3. **Runs the tab lost track of**: 5 rows are still stuck on `running` with no events. Each time, the owner re-sent the question 40–62 s later.
  4. **Large model outputs that are not streamed** (a whole post body or a long answer): 21–38 s.
- **The UI makes every gap look dead.**
  - After the first tool row appears, nothing on screen shows that the run is still working. "Thinking…" only shows while the message is completely empty.
  - The tool-row spinner and "shimmer" appear to be static in the admin: the spin keyframes are only in a stylesheet nothing imports, and the shimmer is `opacity: .6`. I have not checked this in a browser.
  - Three kinds of signal already reach the browser and are dropped: the 30 s `tool_progress` heartbeats (with `elapsed_time_seconds`), `thinking_tokens`, and `api_retry` (attempt n/10).
  - The 45 s "still working" notice can't fire during a long tool call, because those same stdout heartbeats reset its timer every 30 s.
- **Two real latency cuts, with measured sizes:**
  - Text streaming is off in 34/34 runs, even though the installed CLI (2.1.283) supports `--include-partial-messages`. Median time to the first words is 19 s.
  - Tool discovery costs 3 model round-trips per new tool (ToolSearch, then search_tools, then describe_tool). That is 155 calls and about 345 s of model time over 34 runs, and 13–23 s on page-creation turns.

## Data and method

- **Where the timings come from.** The daemon keeps its event log in memory, and it restarted during this investigation (pid 27000 → 54430 → 57371 → 66471), so `/api/runs/<id>/events` returns 404 for every old run. The saved `events_json` has no timestamps.
- **What I used instead:**
  - Timings come from the spawned CLI's own session transcripts: `~/.claude/projects/-Users-la-Programming-Tovu{,-sites-tovu-com}/<session_id>.jsonl`. They put a timestamp on each block: prompt, thinking, text, tool_use, tool_result, and api_error.
  - Each transcript was joined to its run using `ai_chat_messages.started_at/ended_at` and the `session_id` inside `events_json`. `sites/tovu-dev/chat.db` was opened read-only (`mode=ro`).
  - I cross-checked against the one saved SSE stream (`a5a3.sse`, which has a `ts` on every frame).
- **What counts as "visible".** Anything the admin renders: text blocks, tool rows (a row starting, or its result arriving), cards, and the end of the run. Thinking blocks are invisible.
- **The script** is in the coordinator scratchpad as `gaps.py`, with the full per-gap output in `gaps-v.txt`. To reproduce: `python3 gaps.py 1790000000000 -v`.
- **Caveat:** a transcript timestamp marks when a block finished, not when it started. That is also when the admin shows it, because streaming is off (see below).

## 1. Every gap over 20 s (34 runs)

| Run | Prompt | Gap | Silent between | Cause |
|---|---|---|---|---|
| 747d63a0 (canceled) | "add video below to media…" | **254 s** | start → cancel | CLI got the prompt at +12 s; 7 × `api_error 529 overloaded` (backoff up to 37 s); the owner cancelled. Screen showed only "Thinking…" (the slow-run notice did fire once). |
| 7da4a3c6 (failed) | "add to media. kuinetic…" | **333 s** | text → "API Error: 529" | 10 × `api_retry` frames (in stdout, dropped by the UI), then failure |
| ad8b807a (stuck `running`) | "just add the video to media please" | 50 s | start → owner re-sent | CLI prompt written, **no model output at all** for 50 s (same 529 window) |
| bbd0bc92 (stuck `running`) | "dont i get two free databases…" | 60 s | start → owner hit Stop + re-sent | Agent ran `get_organization` (+6 s) and opened an ask-choice card (+10 s) that was cancelled at +60 s. The row was never finalized, so we can't tell whether the card ever rendered. |
| eb73452e / 8f48030d (stuck `running`) | "connect my Supabase account" ×2 | 49 s, then 111 s | owner opened a **new chat** twice | Each opened a connect card (+11 s) that waited for sign-in until 21:48:14. One OAuth completion released all three waits at once, including a5a36afa's `supabase_get_database`. |
| 92e10c3d (stuck `running`) | "do we have hungarian translations?" | 45 s | → owner sent follow-up | The CLI ran (text at +11 s) but the row was never finalized |
| eccc8415 | "connect to supabase please" | 300 s | connect card | Sign-in wait timed out (`connect-tool.ts:77`, 5 min) |
| a5a36afa | "I need a database" | 39 s, 300 s | connect card; ask-choice ("$10 a month") | The second one **expired** after 5 min (`ask-choice-tool.ts:109`) |
| 99d228f8 | "can you publish now?" | 301 s, 300 s | publish confirm card, then ask-choice | "Tool execution cancelled", `fetch failed`, then the ask-choice expired |
| e23b0396 | "can you try publishing now?" | 104 s | publish card (approval + upload) | The split between approval and upload is unknown |
| 6dd2dafb (failed) / 767c4163 (canceled) | "try again" / "Publish my site's content…" | 167 s / 149 s | publish card → run end | The card never came back |
| 81794557 / 69b802de | "Generate 3 images with Higgsfield…" | 38 s / 25 s | → `content_post_create` | The model was writing a large post body as tool input. Tool input isn't streamed, so nothing showed. |
| fd3d84df | "what? bullshit. ive edited lots of pages" | 25 s | ask-choice card | owner answering |
| fefce2c3 | "Back up this site…" | 21 s | → final text | Long answer, not streamed |

Two runs also **failed instantly right after a Stop**: 53622092 at 21:55:42 today and 910d7a28 on 09-21. Both showed "Run failed — the agent process exited without answering", in 0.1 s. The cancelled CLI turn was still exiting on the same session: it wrote "No response requested." about 7 s later. The owner had to send the message a third time.

## 2. Causes ranked by total silent seconds

"Silent" means no new visible event. Totals are over 34 runs.

| # | Cause | Total | Count | Typical | Who is waiting? |
|---|---|---|---|---|---|
| 1 | Held cards: connect, ask-choice, publish confirm (including tails that end in cancel/fail) | ~1,700 s | 13 | 25–300 s | the owner (card is on screen) |
| 2 | Model think time between steps, excluding 529 | ~905 s | ~380 | 1.5–5 s; max 38 s | the model |
|   | … of which discovery (ToolSearch 22, search_tools 72, describe_tool 61) | ~345 s + 23 s executing | 155 | ~2 s per round | the model |
|   | … of which writing text that isn't streamed | ~241 s | 66 | 3.6 s avg; max 21 s | the model |
| 3 | API 529 overload retries | 587 s | 2 runs | 254–333 s | Anthropic |
| 4 | First response (spawn + first model turn), excluding 747d63a0 | ~203 s | 34 | median 5.4 s to first row | CLI spawn (median 2.4 s, max 12.5 s) + model |
| 5 | Lost runs (stuck `running`; owner gave up and re-sent) | ~250 s of owner wait | 5 | 40–62 s | unknown; see §5 |
| 6 | Real tool execution (non-card tools, external MCP, discovery) | ~120 s | ~330 | 0.1–1 s; Glob 12 s | tools |

Median time to the **first visible row** is 5.4 s. Median time to the **first words** is 19.3 s, and 24–47 s on multi-step turns (fefce2c3, 1e5792c1, fd3d84df, 7da4a3c6, 81794557). Before the first words, the owner sees only rows like "Search tools" and "Describe tool".

## 3. What the admin shows during each kind of gap

The chat package is `node_modules/@jini-ai/chat`, a symlink to `/Users/la/Programming/Jini/packages/chat`.

| Gap | What the owner sees | Evidence |
|---|---|---|
| Before any event (spawn, first token, 529 before first output) | Static faint italic "Thinking…". The daemon's `status: initializing` event is translated but **no component renders `kind: 'status'`**. | `MessageRow.tsx:104-106` (only while there is no content and no tool rows), `:368-372`; `assistant.css:440-443`; `assistant-transport.ts:119-120`; `SlowRunNoticeCard.tsx:17-22` confirms status is unrendered |
| Model thinking between steps, once any row or text exists | **Nothing new.** Finished rows show checkmarks; "Thinking…" is gone for good. The only cue is the composer's Stop button. | `MessageRow.tsx:253,368`; `Composer.tsx:591` |
| Model writing text or a big tool input | Nothing, then the whole paragraph or row appears at once. No `stream_event` frames in 34/34 runs. | `defs/claude.ts:181-183` only adds `--include-partial-messages` if `agentCapabilities` says so; `detection.ts:162-176` fills that map from a `claude -p --help` probe (5 s timeout; any failure leaves caps `{}`). `claude -p --help` on this machine **does** list the flag (CLI 2.1.283). |
| Long tool / held card | A row with a "Running" spinner and a dimmed title, apparently static (see next column). No elapsed time. Heartbeats arrive every 30 s but are dropped. | Spinner `ToolCard.tsx:474-479` uses class `jini-icon-spin`, whose keyframes exist only in `src/react/styles/reference.css:88`. `assistant.css:490` says nothing imports that file, and the injected `styles.ts:798-799` animates only `.jini-composer-spinner`/`.jini-runtime-spinner`. The shimmer is `styles.ts:1235` `opacity: .6` (not animated). Not checked in a browser, since another agent owns Chrome. |
| Heartbeats (`tool_progress`, `elapsed_time_seconds` 30/60/90…), `thinking_tokens`, `api_retry` (attempt, delay, 529) | **Nothing.** These arrive as `stdout` frames, are wrapped as `kind: 'raw'`, stored in `events_json`, and never rendered. | `assistant-transport.ts:521-527` (stdout → raw), `:144-145`; `core/events.ts:56` (no renderer for raw) |
| "Still working" notice | Fired only in the two 529 runs. It **cannot fire during a long MCP tool**, because the daemon counts every emit (including stdout heartbeats every 30 s) as activity against its 45 s threshold. | `run-lifecycle.ts:388` (45 s), `:949-950` (`noteActivity()` on every `emit`); `agent-executor.ts:2211,2238,2242` (stdout emits). The suspend at `agent-executor.ts:2139` covers only daemon-native tool execution. |
| Card waits | The card itself, e.g. connect's "Waiting for you to sign in…". There's no countdown, and nothing says it will expire. The ask-choice card expires silently at 5 min and the model then continues. | `connect-card-ui.ts:56`; `connect-tool.ts:77`; `ask-choice-tool.ts:109`; `tool-surface-exchanges.ts:144` (5.5 min cap) |

## 4. Proposed fix: one generic "live activity line", plus two latency cuts

### A. UX fix (changes what the owner sees, not how long things take)

1. **Run activity line.** One status line under the newest assistant message, shown the whole time `runStreaming` is true. It replaces the "Thinking…" placeholder and stays after rows appear.
   - It is driven by one pure reducer over the events the tab already receives, with a 1 s client tick for the clock. The event→label mapping lives in a single table, and no tool gets special-casing.

   | Latest signal | Line |
   |---|---|
   | nothing yet, or `status: initializing` | "Starting…" → "Thinking… 8 s" |
   | tool result, or `thinking_tokens` frames | "Thinking… 12 s" |
   | an open ToolSearch/search_tools/describe_tool row | "Finding the right tool… 4 s" |
   | an open tool row | "Running *\<humanized tool\>*… 1 m 20 s" (uses `tool_progress.elapsed_time_seconds` when present, otherwise the local clock) |
   | an open card (mcp-ui/a2ui with no result) | "Waiting for your answer above · expires in 3:40" |
   | `api_retry` | "Claude's servers are busy — retrying (4 of 10)…" |
   | no visible change for 20 s | append "· still working"; at 60 s, point to Stop |

   - **Where the mapping should live.** Ideally the daemon's `claude-stream` parser turns `system/thinking_tokens`, `system/api_retry`, and `tool_progress` into typed agent `status` events with a `code`. Then every CLI driver benefits, and the admin renders the `status` kind that already exists in the protocol (`assistant-transport.ts:119`). A client-side fallback can parse the same lines out of `kind: 'raw'`.
2. **Make the running spinner actually spin.** Move `.jini-icon-spin` keyframes into the injected `CHAT_PANE_STYLES`, and give the shimmer a real animation. This is a one-rule change; check it visually first.
3. **Slow-run watchdog.** Count only user-visible agent events as activity, not stdout heartbeats, so the notice can actually fire. Alternatively, retire the notice once the activity line exists, since it covers the same need.
4. **Cards.** Show an expiry countdown on held cards. When a card expires, show a visible outcome line instead of the model silently carrying on.

### B. Cuts that remove real latency

1. **Turn text streaming on.** Find out why `agentCapabilities.get('claude').partialMessages` is falsy in the daemon process. The probe may never run there, or it may hit the 5 s timeout. Log the spawned argv once to confirm. With streaming on, words appear as they are written instead of 2–21 s later. The 25–38 s "writing a post body" gaps also turn into visible progress through `input_json_delta`.
   - Expected effect: first words drop from a 19 s median to roughly the first-token time. The biggest perceived gain.
2. **Cut discovery round-trips.**
   - (a) Preload the `jini` MCP tools so the CLI doesn't spend a ToolSearch `select:` round at the start of every run (22 calls, about 2 s each).
   - (b) Return each hit's input schema inside `search_tools` results so `describe_tool` isn't needed (61 calls, about 97 s of model time).
   - Expected effect: about 4–5 s per typical turn, and up to about 20 s on page-creation turns (11–16 discovery calls).
3. **After Stop, don't fail the next send.** Wait for the previous CLI turn on the same `--resume` session to exit, or queue the message, instead of ending the new run in 0.1 s. This saves a forced re-send.
4. **Spawn (median 2.4 s, up to 12.5 s).** The spawned CLI runs the *developer's own* `~/.claude` SessionStart hooks. The codebase-memory "CRITICAL – Code Discovery Protocol" text gets injected into the site assistant's context on every run. Isolating the spawned CLI from user-level settings/hooks cuts part of the spawn time and removes context that doesn't belong there.
5. **529 overload.** Nothing to cut locally. A1 makes it visible. Optionally, cap retries sooner or offer a fallback model.

## 5. Open questions (not resolved read-only)

- **Why do rows end up stuck on `running` with no events** (bbd0bc92, eb73452e, 8f48030d, 92e10c3d, ad8b807a, and older ones)?
  - The daemon-side run went on normally; the tab's copy never received or never saved a terminal state.
  - In three cases the owner moved to a new chat or re-sent within 40–62 s. That suggests the tab stopped showing the run, not that the owner was just impatient.
  - Deciding needs the live stream. The old daemons' in-memory logs are gone.
  - Recommendation: have the daemon persist run events (with `ts`) so these can be replayed, and re-check once the chat/card rewrite lands.
- **Whether the ask-choice card in bbd0bc92 ever rendered** (the owner hit Stop 50 s after it opened).
- **How e23b0396's 104 s splits** between owner approval and the actual upload.

## Relevant files

- `/Users/la/Programming/Tovu/apps/admin/src/lib/assistant-transport.ts` (119-176, 512-541)
- `/Users/la/Programming/Tovu/apps/admin/src/components/AssistantDock/SlowRunNoticeCard.tsx`, `AssistantDock.tsx:205`
- `/Users/la/Programming/Tovu/apps/admin/src/styles/assistant.css:440,490`
- `node_modules/@jini-ai/chat/src/react/components/MessageRow.tsx` (104-106, 253, 368-372), `ToolCard.tsx` (161-166, 474-479), `features/chat-pane/styles.ts` (798-799, 1235), `styles/reference.css:88`
- `node_modules/@jini-ai/daemon/src/run-lifecycle.ts` (388, 949-950), `agent-executor.ts` (2139, 2211)
- `node_modules/@jini-ai/agent-runtime/src/defs/claude.ts` (104-112, 181-183), `detection.ts` (162-176)
- `/Users/la/Programming/Tovu/apps/website/src/features/agent-plugins/connect-tool.ts:77`, `connect-card-ui.ts:56`, `apps/website/src/assistant/ask-choice-tool.ts:109`
