# Cull of r62t-acp (owner 11-20: "fix client and pilot opencode")

Input `o-r62t-acp/r62t-acp.md` + plan `origin/plan/acp-research-2026-11-16:research/acp/DESIGN.md` §3.7–3.10, Phase A. Base Jini `ro-m6-jini` d3e78b387. Anchors read directly; read-only.

## Plain-English summary for the owner
1. Jini's existing ACP client gets six small repairs: it answers requests it does not know, resume works end to end, model and effort failures say what went wrong, a signed-out agent says "sign in", leftover child processes are stopped, and cancel is sent the way the protocol expects.
2. OpenCode gets a second, ACP-based entry ("opencode-acp") that reuses the client and OpenCode's current tool delivery; the normal OpenCode entry is untouched.
3. The switch is simply whether that entry is in Jini's agent list: it stays OFF (not listed) until the cloud parity check below passes; turning it on is a one-line change.
4. Visible changes for existing agents: AMR resume starts working (it already claimed it), unknown agent requests get a reply instead of a 10-minute hang, cleanup now also stops leftover helper processes.
5. Dropped: the profile/request object, the catalog switch, usage/cost work, HTTP tool descriptors, output masking (became a check), Claude/Pi/Amp/Codex ACP.

Counts: 7 sheets in one Jini job + 1 HELD (switch on). No Tovu sheet (switch off = nothing to wire).

## Verdicts
| Item | Verdict | Cut |
|---|---|---|
| A6 unknown requests | KEEP → ACP-1 | One `-32601` reply; notifications ignored as today. |
| A5 auth required | CUT-TO ACP-2 | Reuse the existing account-failure shape (`AUTH_REQUIRED`, action `sign_in`); only `-32000` whose text says auth (tests already use `-32000` for other errors). No `authMethods` storage. |
| A3 + A1 resume | CUT-TO ACP-3 | A1 shrinks to reading `agentCapabilities.loadSession` in the initialize ack. No profile; one def flag `resumesSessionViaAcpLoad` gates forward + finish. |
| A7 model/effort | CUT-TO ACP-4 | No "legacy profile": keep `session/set_model` fallback, but a rejected explicit model fails with a plain message. Effort: set via `thought_level` config option, else plain failure, no prompt. Fixes the reported null-id bug in the same predicate. |
| A9 teardown | CUT-TO ACP-5 | One optional `beforeRelease` hook; daemon records descendants while the child is alive and stops them before staged-file cleanup. Crash-time descendants and output masking DROPPED (masking → parity check 9). |
| (found) `session/cancel` sent with an `id` | NEW ACP-6 | ACP defines it as a notification; `session-run.ts:562` sends a request. Real bug → owner + open-bugs. |
| C OpenCode | CUT-TO ACP-7 | New def `opencode-acp`, not in `BASE_AGENT_DEFS`. No variant switch (B1 retired). |
| switch ON | HELD ACP-8 | Add `opencodeAcpAgentDef` to `BASE_AGENT_DEFS` after parity passes. |
| A0, A2, A4, A8, B1, B2, D, E, Claude/Pi/Amp, Gemini parser | DROP / RETIRED / DEFERRED | Per owner 11-20. |

## Sheets (Jini, base merge-6 d3e78b387, one job, in order)
Paths under `packages/`. AR = `agent-runtime/src/agent-protocol/acp`, DA = `daemon/src/agent-executor`.

| Id | Files | Test first (red on base) |
|---|---|---|
| ACP-1 | AR `rpc.ts`, `session.ts` | `session.test.ts`: agent request `{id:'x-7',method:'fs/read_text_file'}` → reply frame `-32601`; run still completes |
| ACP-2 | AR `constants.ts`, `session-results.ts` | `session.test.ts`: `-32000 "Authentication required"` on id 2 → error code `AUTH_REQUIRED`, action `sign_in` |
| ACP-3 | AR `session-results.ts`; DA `acp-events.ts`, `launch.ts` | client: no `loadSession` → no load frame, `resume_failed`; durable id = `sessionId`. daemon: eligible def gets `resumeSessionId`; `end.sessionRef` = `getDurableSessionId()` |
| ACP-4 | AR `models.ts`, `session-results.ts`, `session-run.ts`, `session-state.ts`, `session-types.ts`; DA `acp-events.ts`, `launch.ts`; daemon `ports/agent-runtime-sessions.ts` | rejected explicit model → plain message; null-id error no longer prompts; effort offered → `set_config_option` then prompt; not offered → fail, no prompt; daemon forwards `reasoning` |
| ACP-5 | AR `session-run.ts`, `session-types.ts`; DA `acp-events.ts`, `contracts.ts`; ports copy | client: with hook, stdin not ended / child not killed until hook settles. daemon: recorded descendants stopped on close |
| ACP-6 | AR `session-run.ts` | cancel frame has no `id` |
| ACP-7 | AR `defs/opencode-acp.ts` (new), `defs/index.ts`, `env.ts`, `executables.ts`; DA `launch.ts` | def test: args `['acp']`, `acp-json-rpc`, `opencode-env-content`, not in `BASE_AGENT_DEFS`; env housekeeping isolates project config for `opencode-acp` |
| ACP-8 HELD | AR `registry.ts` | after cloud parity |

Changesets: `@jini-ai/agent-runtime` patch (ACP-1..6), minor (ACP-7); `@jini-ai/daemon` patch (ACP-3/4/5/7).

## Cloud parity check (paste into the combine run)
Run on the combined Jini tip, real `opencode` CLI (record `opencode --version`), through `createAgentExecutor` with `getAgentDef` returning `opencodeAcpAgentDef` for `opencode-acp`, MCP injection configured with HTTP. Compare each item against native `opencode` on the same prompt. PASS = every item passes; then ACP-8.
1. Handshake: `initialize` result advertises `loadSession: true`; record its `agentCapabilities` and session/new `configOptions`/`models`.
2. Streaming: text arrives as `text_delta`, finish `succeeded`, `usage` present.
3. Resume: run 2 with run 1's `end.sessionRef` sends `session/load`, answers a question only run 1 knew; a bogus id → `resume_failed`, host reseeds.
4. Model: a picker model id from `opencode models` is accepted (via `set_config_option` or `set_model`); a bad id → plain "did not accept the model" error, no prompt sent.
5. Effort: report whether `thought_level` is offered. If yes, setting one value works (follow-up: add `reasoningOptions` to the def). If no, effort stays unavailable, same as native.
6. Cancel mid-turn: run ends `cancelled` within 5 s; no `opencode` process (or LSP/MCP child) left under the run (`ps`).
7. Permissions: restricted run → a write/shell tool asks (`acp_permission` status) and is denied; bypass → allowed once. If OpenCode never asks, record "same as native".
8. Real Jini tool call: the agent calls one Jini tool over the HTTP MCP endpoint and the result reaches the chat.
9. Secrets: the run's stored stdout/stderr journal contains neither `JINI_DAEMON_TOKEN` nor the HTTP endpoint token.
10. Clean finish leaves no descendant process; staged files removed after.
11. Signed-out OpenCode (empty auth) → `AUTH_REQUIRED` sign-in message, not a raw RPC error.
12. Regressions: AMR resume now works or fails to the reseed path (check 3 on AMR if available); the 12 existing ACP defs still pass `agent-executor-acp.integration.test.ts`.

## Run plan
- `j-acp-jini-DRAFT.md`: ACP-1..7 on Jini merge-6. Not launched.
- Combine owes: Jini full agent-runtime + daemon suites, the parity check above, then ACP-8 if PASS.
- Bug to log now: `session/cancel` sent as a request with an id (`session-run.ts:558–567`).
