# P6 · AG-UI everywhere (visitor chat, approvals, browser delivery, admin default)

**Bases:** Tovu `41e948ee4`, Jini `6b8e0d48a`. `W/` = Tovu `apps/website/src/`, `A/` = Tovu `apps/admin/src/`, `SC/` = Tovu `apps/site-chat/src/`, `J/` = Jini `packages/`.
**Leads:** `r62t-rsy-6.plan.md` (on `origin/plan/commit-plans-1120`) "AG-UI parity and rollout", "AG-ADMIN-DEFAULT", PARTIAL handoffs "AG2–AG4 and admin parity"; combine-11 decision 2; owner 11-21 ~9 AM "standardize on open protocols: AG-UI is the core agent↔UI protocol (admin, desktop, visitor chat) … one Jini adapter per protocol, no custom wire format where a standard exists". OpenCode ACP pilot stays **off** until parity (owner 11-20).
**Owner rules:** as in P1. The AG-UI adapter lives in Jini (`@jini-ai/chat` `./core/ag-ui`, `./transports/ag-ui`); Tovu keeps product words and wiring.

## Current state (verified)
- Prerequisites the lead required are **landed** on base: `deps/lockfile-1121` (merge `69c007249`), `codex/tv-ag1` (merge `75968833d`), AG-UI golden follows the approval interrupt (`5eb72847c`), interruption words (`a6a94d354`). `SC/../package.json:18` pins `@ag-ui/core` `0.0.58`.
- Jini adapter: `J/chat/src/core/ag-ui/event-projection.ts:56` `createAgUiTranslationState`, `:139` `translateAgentEventToAgUi`, `:173` `closeAgUiRun`, `:256` `drainRunFramesToAgUi`, `:289` `confirmationInterrupt`, `:296` `readConfirmationResume` (complexity 11, Jini BASE-RED row), `:312` `createAgUiPauseStore`; reduction `event-reduction.ts:33,101`; run input `run-input.ts:59,111`. Package subpaths `./core/ag-ui`, `./core/ag-ui/reduction`, `./server/ag-ui/run-input`, `./transports/ag-ui` (`J/chat/package.json:29–36`).
- Admin: `W/server/runtime/composition/modules/assistant-ag-ui.ts` (316 lines; drain call `:286`). Browser toggle `A/lib/assistant-transport-ag-ui.ts:37` `AG_UI_RUN_PATH = "/api/admin/v1/assistant/ag-ui-run"`, `:51–54` `isAgUiTransportEnabled()` → only `"1"` enables (default off).
- Visitor chat is **not** AG-UI: server `W/server/runtime/composition/modules/site-assistant.ts` (904 lines) — `:119` `CHAT_PATH = "/api/site-assistant/chat"`, custom SSE `sse()` `:240–246`, POST `:671`, custom events `error`, `text`, `end`, `client_directive` (`:679,754–758,802`). Approvals: `W/server/inbound/public-http/routes/site-assistant-confirm.ts:10,47` `POST /api/site-assistant/confirm`; browser `SC/tool-confirmation.ts:27` `confirmSiteAssistantTool`, `SC/vanilla-tool-confirmation.ts`. Both renderers (React `SC/SiteAssistantWidget.hooks.ts:4`, vanilla `SC/vanilla-host.ts:4`) share `SC/site-assistant-transport.ts` (355 lines; hand SSE parser `:91–186`).
- OpenCode ACP def exists but unlisted: `J/agent-runtime/src/defs/opencode-acp.ts:6–10`.

## Steps

### P6-J1 · Jini · AG-UI browser client for the visitor surface (~2 h)
Add to `J/chat/src/transports/ag-ui/` a small framework-neutral client `createAgUiRunClient({ fetch, url, headers }, { idleTimeoutMs } = {})` that POSTs `RunAgentInput`, parses the SSE AG-UI event stream with `@ag-ui/core` types, reduces with `translateAgUiEventToAgentEvent`, and exposes `onText`, `onInterrupt`, `onError`, `onEnd`, `abort()`. (If `./transports/ag-ui` already has an equivalent, reuse it — check its exports first and record the decision.) Fold `readConfirmationResume` to complexity ≤ 10 while here (BASE-RED row).
Tests first: `streams text deltas from TEXT_MESSAGE_CONTENT`, `an INTERRUPT with a confirmation yields onInterrupt with the challenge`, `idle timeout aborts once with the plain idle message`, `RUN_ERROR passes only the event message`. Mutation: forward raw transport error text. API: additive export (+changeset minor).

### P6-T1 · Tovu · AG2-T: visitor `/chat` → AG-UI in place (server + both renderers together) (~2 h; after P6-J1 consumable)
Server `site-assistant.ts:671`: same path, now writes AG-UI events via the Jini translator (`translateAgentEventToAgUi`, `closeAgUiRun`) and `drainRunFramesToAgUi(ctx, { interruptionMessage: <visitor-safe sentence> })`. Visitor words stay Tovu's (from `SC/site-assistant-errors.ts`). Navigation/form directives (`:754–758`) become AG-UI `CUSTOM` events only where no standard event exists (owner: no custom wire format where a standard exists — `client_directive` has no AG-UI equivalent, keep it as one `CUSTOM` name). Browser: replace the hand SSE parser in `SC/site-assistant-transport.ts:91–186` with P6-J1's client; React and vanilla renderers keep their props.
Do **P4-T4 sheet C first** (same transport file) or fold it in here.
Tests first (`W/server/runtime/composition/modules/__tests__/site-assistant*.test.ts`, `SC/__tests__/site-assistant-transport*.test.ts`): `a visitor turn emits RUN_STARTED … TEXT_MESSAGE_* … RUN_FINISHED`, `no-reply turn ends with one terminal event and the plain no-reply sentence`, `idle timeout`, `page navigation still navigates`, `both renderers render the same transcript from one recorded AG-UI stream`. Red now: custom events. Mutation: emit the old `text` event; drop `RUN_FINISHED`.
Visitor Chrome (both renderers) owed. STOP if any public site's cached loader (old site-chat bundle) talks to the new server — then serve both formats keyed on `Accept` for one release (record as owner question 1).

### P6-T2 · Tovu · AG3-T: approval resume replaces `/confirm` (visitor + admin) (~2 h; after P6-T1)
Server: when a visitor or admin tool needs confirmation, emit `confirmationInterrupt` (Jini `event-projection.ts:289`) and park the exact invocation in `createAgUiPauseStore` (`:312`); a follow-up `RunAgentInput` carrying the resume (`readConfirmationResume`, `:296`) resumes it **once**. Bind to the same principal/session and the invocation's challenge ID; expiry → plain "This request expired. Ask again." Remove `POST /api/site-assistant/confirm` (`site-assistant-confirm.ts:47`) and `SC/tool-confirmation.ts:27` in the **same** change as the replacement; admin keeps its card UI but answers through the resume.
Tests first: `accept resumes the parked call exactly once`, `decline runs nothing`, `expired resume is refused in plain words`, `another visitor/owner cannot resume`, `replayed resume does nothing`, `ordinary non-approval cards still render`. Red: no interrupt path for visitors. Mutation: resume without checking the challenge owner; allow double resume.
STOP if the parked invocation cannot outlive the HTTP response in the current runtime (name the timeout file:line).

### P6-T3 · Tovu · AG4-T: authorized browser delivery (~1.5 h; after P6-T2)
Browser-side effects (page navigation, form fill, visitor page control) delivered as AG-UI tool calls bound to the run's invocation ID; the browser acts only on calls from its own run, calls `begin` immediately before the effect, and returns an invocation-bound result. Fix B192 here: if page control fails to attach, the turn continues as plain chat ("I couldn't open that page, but here's what I found…" stays model text; transport just omits page control).
Tests first: `an effect from another run is ignored`, `result carries the invocation id`, `attach failure still answers the question` (B192 red now: `SC/visitor-page-control.ts:79` rejects after 10 s). Mutation: accept unbound calls.

### P6-T4 · Tovu · admin parity combine checklist (~1.5 h, test-only + fixes it finds)
Write the six live-path witnesses from the lead's table as tests against the admin AG-UI path: **Resume** (reattach to the actual run after reload; no duplicate deltas; replace the pin at `A/lib/__tests__/assistant-transport.ag-ui.unit.test.ts:627–635`), **Approvals** (from P6-T2), **Stop** (before headers, during start, streaming, parked approval), **Errors** (pre-stream refusal, provider failure, disconnect, no-reply), **Attachments** (reach the agent, survive reopen), **Cost footer** (one final usage, not lost or doubled on reconnect; `tovu.usage` reducer). Any red found → one fix per finding inside this step if ≤ 30 min, else listed for a follow-up step.
Chrome + Electron looks owed for every row (Local CLI with Claude, Codex, agy; BYOK keeps its explicit provider mode).

### P6-T5 · Tovu · AG-ADMIN-DEFAULT (~0.5 h; only after P6-T4 is all green)
As written in rsy-6: `isAgUiTransportEnabled` (`A/lib/assistant-transport-ag-ui.ts:51–54`) returns `value === null || value === "1"`; `"0"` is the rollback override; tests at `assistant-transport.ag-ui.unit.test.ts:74–97` (unset → true, `"0"` → false) and the routing cases from `:694`. Mutation: restore the old equality; make `"0"` truthy. STOP if any P6-T4 row is red.

### P6-J2 · Jini · OpenCode ACP pilot stays off (no code)
Keep `opencode-acp` out of `BASE_AGENT_DEFS` until the owner's parity list (resume, model/effort, cancel, permissions, a real Jini tool call) passes on a machine with OpenCode installed (OWED-LOCAL; C065). Listed so implementers do not enable it.

## Owner questions (recommendations)
1. Old cached visitor loaders during AG2 cutover: **recommend** one release serving both formats (negotiated by `Accept: text/event-stream; agui=1`), then remove.
2. `client_directive` (navigate / form accepted) as one AG-UI `CUSTOM` event name? **Recommend yes** — AG-UI has no standard navigation event; it is the only custom name left.

## Dependencies / batches
P6-J1 → (Jini release or local link, P7-J2) → P6-T1 → P6-T2 → P6-T3 → P6-T4 → P6-T5. Sequential (same files). P4-T4 sheet C before P6-T1.

## Estimate
~12 h (J1 2, T1 2, T2 2, T3 1.5, T4 1.5 + fixes, T5 0.5).
