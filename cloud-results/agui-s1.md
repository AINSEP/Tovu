# agui-s1 — AG-UI S0 goldens and S1 consolidation

Run date: 2026-11-16. Status: **PARTIAL.** S0 is done except two site scenarios. S1 is done for A1, A4, B1, B2, C1, C2. A2 is blocked by the debt ratchets, A3 was not started, B3 and B4 wait on open owner decisions. Nothing from S2 onward was touched.

Branch `refactor/agui-s1` in both repos, from `origin/refactor/terra` (Jini `02edbb68`, Tovu `80b00f5b`). No force-push, no `--no-verify`, no subagents. No test process was left running.

## Commits

| Repo | SHA | Step | What |
|---|---|---|---|
| Jini | `18a150a6` | S0 | T0-2 reducer drift, T0-3 round-trip golden, T0-6 bridge replay and cancel (tests only) |
| Tovu | `7cc450c1` | S0 | T0-1 admin wire golden, T0-5 exact cancel counts, T0-2 host half (tests only) |
| Tovu | `bbd868dd` | S0 | T0-4 site chat golden (tests only) |
| Jini | `4c2ce043` | A1 | `ag-ui/entry.ts` split into `event-projection.ts` and `event-reduction.ts`; new subpath `./core/ag-ui/reduction` |
| Tovu | `f59e3f2e` | A1 pair | admin test takes the reverse names from `/reduction`; the admin type re-export shell is deleted |
| Tovu | `472e381f` | B1 | the route calls `translateRunAgentPayload`; Tovu's reducer and dispatch table are deleted |
| Jini | `8173197f` | B2 | `reduceAgentWirePayload` and `RunAgentWirePayload` deleted from `event-projection.ts` |
| Jini | `3b963dbd` | A4 + C1 (Jini half) | `ag-ui/run-input.ts` with 7 unit tests; real subpath `./server/ag-ui/run-input` |
| Tovu | `1cf25dd7` | C1 | the route parses with Jini's `resolveAgUiRunInput`; the local parsers are deleted |
| Tovu | `18038b18` | C2 | the three forwarders and the type re-export are deleted; one host value `AG_UI_TRANSLATION` |

Tovu `assistant-ag-ui.ts`: 670 → 503 lines. Each Tovu commit message names the Jini SHA it builds on. Three patch changesets were added in Jini (`chat-ag-ui-split-entry`, `chat-ag-ui-one-reducer`, `chat-ag-ui-run-input`).

## Wire bytes

The T0-1 golden changed in exactly one commit, B1, and only by the two differences the design lists:

- `CUSTOM tovu.ext.tool_input_delta` no longer appears.
- an `mcp-ui` resource gains `_meta["jini/surface-exchange"]` when the daemon sent `surfaceExchange`.

Headers and the other four scenarios were byte-identical across B1. A1, C1 and C2 pass against the golden without regenerating it. The run brief asked for bytes identical to the S0 goldens and also for one reducer (OD-2). Those two cannot both hold, so the B1 diff above is the deliberate exception.

## Pins and mutation proof

Every pin was green on the unmodified tree, then run red against a local mutation, then the mutation was reverted.

| Pin | File | Mutation that turned it red |
|---|---|---|
| T0-1 admin wire golden (5 scenarios, bytes + HTTP/1.1 headers) | Tovu `server/__tests__/assistant-ag-ui-wire.golden.test.ts` | `x-accel-buffering` value changed and an extra field on `RUN_FINISHED`: 5 of 5 scenarios red |
| T0-2 reducer drift | Jini `ag-ui/__tests__/reducer-drift.unit.test.ts` | the copy made to drop `tool_input_delta`: 1 red |
| T0-3 round-trip golden + design §5.1 examples parsed with the 0.0.58 schemas | Jini `ag-ui/__tests__/ag-ui-round-trip.golden.test.ts` | status `data` removed from the projection: 2 red |
| T0-4 site chat golden (6 scenarios) | Tovu `server/__tests__/site-chat-stream.golden.test.ts` | extra field on the `end` frame: 5 red |
| T0-5 cancel windows, exactly one cancel | Tovu `server/__tests__/assistant-ag-ui-routes.test.ts` | a doubled cancel call in the close handler: the three abort windows red |
| T0-6 bridge replay and cancel | Jini `embed-widget/browser/__tests__/frontend-session-bridge.replay-cancel.test.ts` | replay check disabled: 1 red; `cancelled` frame ignored: 1 red |
| A4 `run-input` unit tests | Jini `ag-ui/__tests__/run-input.test.ts` | binding length bound off by one, loose `secretRedacted` check, leading instead of trailing history: 3 red |

## Gates at the end of the run

| Gate | Result |
|---|---|
| Jini `@jini-ai/chat` full suite | 4410 passed, 1 skipped (302 files) |
| Jini `pnpm -r typecheck` | 0 errors |
| Jini `pnpm guard`, `check:size`, `check:complexity`, `check:log-safety` | pass |
| Tovu AG-UI suites (routes, translate, wire unit, wire golden) | 62 of 62 |
| Tovu admin `assistant-transport.ag-ui` + `AssistantDock.hooks` | 225 of 225; admin `tsc` 0 errors |
| Tovu `tsc` root and `tsconfig.tests.json` | 0 errors |
| Tovu `check:size` | **exit 1** |
| Tovu `check:complexity` | **exit 1** |
| Tovu `check:boundaries` | **exit 16** (16 errors, 95 warnings) |

The three red Tovu gates name no file this run touched: stale debt entries, admin complexity (`App.tsx`, `Plugins.tsx`, …) and `no-deep-imports` in feature folders. I did not run them on a clean `refactor/terra` checkout, so "already red before this run" is inferred from the file names, not measured.

## Deviations and stops

1. **A2 stopped (move `ag-ui-transport.ts` → `ag-ui/client/run-client.ts`).** The design says to move the two debt entries by hand. Both ratchets key debt by path and compare against the base commit, so the moved entries are reported as new debt: `check:size` (`createAgUiRunClient`, 113 lines) and `check:log-safety` (`stored-error-text`, 1). CI uses the PR base, so the move would fail there. A3 would clear the size entry. The log-safety entry is the `String(error)` inside the Observable's `error:` callback, which error-system E8 is scheduled to change at the final path, so the two steps block each other. The move was made, tested (214 of 214) and reverted; nothing of it is committed.
2. **A3 not started** (split `createAgUiRunClient`). It is valid in place and would remove the size debt entry.
3. **B3 skipped: OD-9 is open.** Tovu's four frame handlers, `parseDaemonFrame`, `readDaemonSseFrames` and its own `terminalReasonNotice` stay. T0-1 already holds the frame cases, so the B3 diff will be visible.
4. **B4 skipped: OD-3 is open.** The X4 field map (`status.data`, `RUN_ERROR.error`) rides with B4 and E8. T0-3 already pins `status.data` round-tripping exactly.
5. **"Move the agentic projection" not done.** Design rev 2 moves `agentic/src/core/ag-ui.ts` in S4, when it gets a user; the run brief listed it under S1. I followed the reviewed design.
6. **"Frame source" not done.** `daemon-frames-source.ts` is design step 2.4 (S2); the frame parsing swap is B3.
7. **T0-4 is short two scenarios:** confirmation expiry (needs the exchange store's timer injected through the module) and a successful `page.navigate` (needs an attached page session). The file header says so. Both are needed before S5.
8. **T0-6 did not exist.** The design lists `bridge-replay` and `bridge-cancel` as existing tests; no test covered either property, so both were written.
9. **T0-2 is split across the repos.** Jini cannot import Tovu's copy, so the Tovu copy was pinned in Tovu. That file (14 cases) was deleted in B1 with the copy it compared; Jini's file keeps every row as a single-reducer test.
10. **T0-3 frames bytes by hand** (`data: <json>\n\n`): `@ag-ui/encoder` is not a dependency of `@jini-ai/chat`. The real encoder is pinned by T0-1.
11. **`AgUiRunInput` optional fields** are typed `string | undefined` (key always present), which is what Tovu's object had; Jini's `exactOptionalPropertyTypes` rejects the `?:` form for that shape.

Test-count changes: Tovu translate 20 → 21 (one case split), wire unit 3 → 2 (parsing case moved to Jini), host drift file 14 → 0 (deleted with the copy). Jini ag-ui + conversation-cost 63 → 62 in B2 (one check folded into its row), plus 7 new `run-input` cases.

## Next step

Decide A2: either let the ratchets accept a renamed path, or land A3 and E8's change to the `error:` callback first and move the file after. Then A3, and B3 / B4 once OD-9 and OD-3 are answered.

# Run 2

Run date: 2026-11-16 (agui-s2, continuation). Status: **steps 1 to 4 done, step 5 (A2) blocked and skipped.** Branch `refactor/agui-s1` in both repos. Final heads: Jini `66735582`, Tovu `481cc12c` before this report commit. No force-push, no `--no-verify`, no subagents, no pull request. No test process was left running.

## Commits

| Repo | SHA | Step | What |
|---|---|---|---|
| Jini | `92fb3ca3` | A3 pins | six lifetime pins for `createAgUiRunClient` (tests only) |
| Jini | `ce6c9d72` | A3 | `createAgUiRunClient` split into `startRun`, `subscribeRun`, `settleRunOnce` and three small helpers; its size-debt entry removed |
| Tovu | `4a7bf89d` | B3 pins | five frame cases the wire golden does not hold (tests only) |
| Tovu | `a42d65b9` | B3 | the route reads frames with Jini's `translateRunFrame`, `readSseFrames`, `readTerminalReason`; Tovu's handlers and parsers deleted |
| Jini | `d495eca1` | B4 | tool correlation and result fields ride as extra fields, both directions, with the round-trip golden |
| Tovu | `e045af8d` | B4 pair | T0-1 golden diff and the official `HttpAgent` pipeline test |
| Tovu | `44bd32d9` | T0-4 | confirmation expiry scenario; the module takes its confirmation scheduler as an optional port |
| Tovu | `481cc12c` | T0-4 | successful `page.navigate` scenario with an attached page session (tests only) |
| Jini | `66735582` | B4 follow-up | `handleToolResultAgentEvent` takes `(required, optional = {})`; found by the args audit |

Tovu `assistant-ag-ui.ts`: 503 → 414 lines. One Jini patch changeset added (`chat-ag-ui-tool-field-fidelity`). A3 has none: its exports did not change.

## Wire bytes

**B3 (`a42d65b9`), T0-1 golden.** Headers and the no-end scenario are unchanged. The design's four differences, as they appear:

1. stdout: the echo line is gone from the `RAW` event; the heartbeat line adds `CUSTOM tovu.status` (`api_retry`).
2. the stderr chunk is a new `RAW` event.
3. the error frame adds `CUSTOM tovu.status` before `RUN_ERROR`.
4. a failed `end` is `RUN_ERROR` ("The agent process exited without answering (exit code 1, signal none, resumable no)."); a cancelled `end` is `RUN_FINISHED { result: { reason: "cancelled" } }`.

**One golden difference the design's list does not spell out:** a failed or cancelled `end` also sends the translator's notice line (`CUSTOM tovu.status`, "Run failed — the agent process exited without answering" / "Run canceled") before its terminal event. It is part of what `translateRunFrame` returns for an `end` frame, the same list that carries the `max_tool_turns` notice. I kept it, so the canary shows what the durable path shows. If the owner wants only the four listed lines, this is the one to remove.

**B4 (`d495eca1` + `e045af8d`).** Jini round-trip golden and Tovu T0-1, "every payload" scenario only: `TOOL_CALL_START` gains `toolOrigin` and `bridgeCall`; `TOOL_CALL_RESULT` gains `isError`, `media`, `outcome`. Nothing else changed. A plain call and a plain successful result are byte-identical to before (`isError` is written only when true).

**T0-4.** Two scenarios added; the six existing ones are byte-identical. The list is now complete (8 scenarios).

## Pins and mutation proof

Each pin was green on the unmodified tree, red under its mutation, and the mutation was reverted.

| Pin | File | Mutation that turned it red |
|---|---|---|
| pre-aborted signal is refused before the agent runs | Jini `assistant-client/__tests__/ag-ui-transport.test.ts` | the pre-abort check removed |
| a finished run is forgotten | same | `finish` no longer drops the agent and the listener |
| a run that failed before its first event is forgotten | same | the error path no longer drops them |
| a mid-stream failure reports before it settles | same | `finish` before `onError` |
| a run settles once | same | the settled guard removed (3 red) |
| two runs stay apart | same | stop aborting every agent |
| a frame that is not JSON; an agent frame with no type; stdout edge chunks; span status for a failed and a cancelled `end` | Tovu `assistant-ag-ui-routes.test.ts` | tolerant parse, a type check, an empty-chunk skip, `end` → failed: all 5 red |
| the reader hand-off to Jini's frame reader | same (Stop and no-end tests) | no cancel on close, and no close on done: both hang until the timeout kills them |
| field fidelity (7 cases) and the round-trip golden | Jini `ag-ui/__tests__/field-fidelity.test.ts` | written first, 5 red on the unmodified files; after the change: projection drops `bridgeCall` (7 red), always writes `isError` (1), reduction forgets `toolOrigin` (4), ignores result fields (3) |
| "ask tool, expired" | Tovu `site-chat-stream.golden.test.ts` | an expired wait counted as allow (red); the module ignoring the injected scheduler (timeout) |
| "page.navigate" | same | a navigation that does not end the turn; an end frame with reason `stop` |

## Gates at the end of the run

| Gate | Result |
|---|---|
| Jini `@jini-ai/chat` full suite (at `d495eca1`) | 4423 passed, 1 skipped |
| Jini ag-ui + assistant-client suites (at `66735582`) | 209 of 209; chat `tsc` 0 errors |
| Jini `pnpm -r typecheck` (at `d495eca1`) | exit 0 |
| Jini `pnpm guard`, `check:size`, `check:complexity`, `check:log-safety` (at `66735582`) | pass |
| Tovu AG-UI and site suites (routes 38, translate 21, wire golden 6, wire unit 2, site golden 9, site-assistant routes 16) | 92 of 92 |
| Tovu admin `assistant-transport.ag-ui` + `AssistantDock` folder | 848 of 848 (67 files); admin `tsc` 0 errors |
| Tovu `tsc` root and `tsconfig.tests.json` | 0 errors |
| Tovu `check:size`, `check:complexity`, `check:boundaries` | exit 1, 1, 16, **the same on base** |

The three red Tovu gates were measured on the base commit `2f0877c7` this time (run 1 only inferred it). Sorted output of base against the final head: no new or changed line for size and complexity. For boundaries the only changed line is the summary's count of cruised dependencies (43301 → 43305); violations are 111 (16 errors, 95 warnings) on both.

## Owner audits (self-check)

`owner-rules-audit.mjs` and `args-object-audit.mjs` were run on base and head of both repos and compared for the five production files this run changed. `hook-injection-audit.py` was not run: no `.tsx` file changed.

- Owner rules: 0 new findings. Three existing ones are unchanged (`tovu-id-in-jini` ×2 in `ag-ui-transport.ts`, `swallowed-error` ×1 in `assistant-ag-ui.ts`, `per-cli-code-in-shared-file` ×1 in `site-assistant.ts`).
- Args, Jini: `ag-ui-transport.ts` 7 → 2 findings. `event-projection.ts` had 1 new finding, fixed in `66735582`; now 0 new.
- Args, Tovu: `assistant-ag-ui.ts` 9 → 9. Two findings left (`handleDaemonFrame`, `readDaemonSseFrames`); **two new ones are flagged: `pull` and `cancel` in `streamFromReader`.** They are the methods of a `ReadableStream` source, and the platform fixes their arguments. I left them.

## Deviations and stops

1. **A2 skipped: the log-safety ratchet refuses the move.** A trial `git mv` gave: `New raw log path: [stored-error-text] packages/chat/src/core/ag-ui/client/run-client.ts (1)` and `Remove stale debt entry (run --update)` for the old path. After A3 the size ratchet no longer objects (its entry is gone); log-safety is now the only blocker. `--update` rewrites the baseline, which the brief forbids. The trial was reverted; nothing of it is committed.
2. **B3 uses a small adapter the design does not name (`streamFromReader`).** The design says to replace `readDaemonSseFrames` with `readSseFrames`. Jini's function takes a stream and holds its only reader; the route's close hook must cancel that reader so a client that leaves stops the daemon read at once. The route keeps the reader and hands Jini a stream that pulls from it. Behaviour is unchanged and pinned (row "reader hand-off" above). The other way is a signal or reader argument on Jini's `readSseFrames`, which would be a public Jini change; I did not make it.
3. **B3 changes more than the design's four items.** All follow from using the one translator; each is pinned in `assistant-ag-ui-routes.test.ts` and named in the commit:
   - the notice line before a failed or cancelled `end` (see "Wire bytes");
   - a frame that is not JSON is skipped and the run goes on (before: `RUN_ERROR` with the parser's words, and the daemon run kept running);
   - an agent frame with no `type` is skipped (before: `CUSTOM tovu.ext.undefined`);
   - an empty stdout chunk sends nothing; a split echo line is dropped in both halves;
   - the run span ends `failed` / `canceled` for those `end` frames (before: `succeeded`).
4. **B3 reason word.** The route sends `reason: "cancelled"` as the design writes it; the daemon's own frame says `canceled`.
5. **B3 notice words** come from the existing `RUN_NOTICES` in `contracts/core/assistant-run-events.ts`. That file is otherwise a set of forwarders over Jini's run-events; I did not touch it.
6. **B4: `isError` is written only when true.** The design says `isError?`; an absent field reads as success, which is also what an older server sends. The reduction rebuilds the daemon payload and calls `translateRunAgentPayload`, so both wires accept the same shapes.
7. **B4 and X4.** `status.data` already round-trips (the whole status event is the `CUSTOM` value; T0-3 pins it), so B4 changed nothing for it. `status.failure` and `RUN_ERROR.error` are E8's. AMENDMENTS-B orders S1 before E8, so nothing waited on E8.
8. **B4 fallback not needed.** The official `HttpAgent` 0.0.58 keeps the extra fields; a committed admin test proves it. A one-off probe (not committed) showed it also keeps an extra `error` field on `RUN_ERROR`, which E8's first test asks about.
9. **T0-4 expiry needed one production change:** `createSiteAssistantModule` takes an optional `siteAssistantConfirmationScheduler`. The host passes none. No code line was added inside the module function, so its three size-debt entries did not move.
10. **T0-4 navigation:** the tab's answer body (`{ navigated: true }`) is a test value; the server does not echo it to the visitor or the model.
11. **Admin runner flag.** Admin's vitest 4.1.11 rejects `--minWorkers`; admin tests ran with `--maxWorkers=2` only.
12. **The worker process restarted once**, during the A2 trial. Every commit was already pushed; the trial move was found staged and reverted.

Test-count changes: Jini `ag-ui-transport` 12 → 18, `ag-ui` folder 54 → 61. Tovu routes 33 → 38, admin ag-ui unit 51 → 53, site golden scenarios 6 → 8. No case was deleted.

## Next step

Decide A2: let the log-safety ratchet follow a renamed path, or let error-system E8 remove the `String(error)` in `subscribeRun` first and move the file after. Then S2 Jini-only steps 2.1 to 2.4 (2.5 waits for R7 P1, AMENDMENTS-A A8). Two things for the owner to confirm from this run: the notice line before a failed or cancelled `end` (deviation 3, first item), and the `streamFromReader` adapter (deviation 2).
