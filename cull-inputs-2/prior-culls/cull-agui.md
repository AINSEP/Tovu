# Cull of r62t-agui (owner 11-20: START NOW)

Input `o-r62t-agui/r62t-agui.md`. Bases: Tovu `c-r62t-agui` 776ce6d0f, Jini `ro-m6-jini` d3e78b387. Read-only checks.

## Plain-English summary for the owner
1. Phase 1 (now): the code that turns an agent run into AG-UI events moves from Tovu into Jini, next to the existing AG-UI code. Tovu keeps only its route, sign-in check and daemon calls. Duplicate Tovu tests are deleted.
2. No new package or lockfile change: Jini hands each event back and Tovu keeps writing it with the encoder it already has.
3. Phase 2: the site chat uses the same AG-UI stream and client as admin. The React visitor chat UI stays as it is, and confirmations work as they do today.
4. Phase 3: confirmations become AG-UI "pause and ask" (human-in-the-loop) on both admin and site.
5. Phase 4: page actions (navigate, click, fill, submit) become AG-UI browser tools through the existing per-tab tool registry. No new capabilities, no shared live editing.

Counts: CUT-TO 3 (AG-J1, TV-AG1, TV-AG0) / DROP 5 / NEEDS-DECISION 4 (phases 2–4 only, none block phase 1). The design's RETIRE rows (S0, S1, S2.1, OD-6) are agreed.

| Item | Verdict | Reason |
|---|---|---|
| S2.2–2.5 server extraction (design: OPUS-CLOUD) | **CUT-TO AG-J1 + TV-AG1** | Only `@ag-ui/encoder` blocked it. Jini does not need the encoder: it takes a `write(event)` callback, and Tovu keeps `agUiEncoder.encodeSSE` (`assistant-ag-ui.ts:128–135`), so the bytes are unchanged and there is no lockfile edit. Move only the framework-free part (`:156–223` and `:278–308`). Express, admin auth, daemon calls and the tracker stay in Tovu. |
| P1-T1 Tovu duplicate tests | **CUT-TO TV-AG0** | As designed, plus it deletes the wire test file outright: its two cases are already covered in Jini by `run-events/__tests__/payload.test.ts` and `frames.test.ts`. |
| P1-J2 port wire tests to Jini | DROP | Duplicates existing Jini coverage (above). |
| P1-J1 move the client file into `ag-ui/client/` | DROP | A pure relocation: package exports, knip, baseline and 7 importers churn with no behaviour gain. The client already lives in Jini. |
| Admin `HttpAgent` construction moved into Jini | DROP | A vendor client in Jini plus a lockfile change, with no consumer need. |
| P4 new `page.submit` capability | DROP | Scope creep; the reviewed submit path through `page.click` stays. |
| S7 shared state | DROP | No consumer. |
| P3 parallel `/chat` + `/confirm` for one release | NEEDS-DECISION D3 | **Recommend NO parallel routes**: replace `/chat` in place once all 8 visitor golden scenarios pass. `/confirm` stays until phase 3. Reverting the release is the rollback. |
| P2 site Ask pause | NEEDS-DECISION D1 | **Recommend yes**: the pause closes the HTTP response and the same bounded provider turn waits for the resume. |
| P2 admin golden changes for confirmations | NEEDS-DECISION D2 | **Recommend yes**, limited to a real pending approval and its answer. |
| P4 sibling `begin`/`stop` routes for frontend tools | NEEDS-DECISION D4 | **Recommend yes** (rev-2 OD-11). Reuse the existing admin and visitor `FrontendSessionRegistry` facades (`packages/daemon/src/http/frontend-control.ts:200–224`, `visitor-frontend-control.ts:109–117`). |

## Exact cut text — phase 1

### AG-J1 (Jini) — run frames to AG-UI events
1. **Tests first**: add `packages/chat/src/core/ag-ui/__tests__/run-frames.test.ts` (vitest). Feed SSE bytes as a `ReadableStream` reader. Build the frames the way the existing `run-events/__tests__/frames.test.ts` does, and use its `fixture.ts` notices. Collect `write` calls. Five cases:
   - (a) a text frame, then an `end` frame with a reason: text events, then `RUN_FINISHED` with that reason; returns `{ status: "succeeded" }`.
   - (b) an `end` the daemon classifies as canceled: reason `"cancelled"`, status `"canceled"`.
   - (c) an `error` frame: `RUN_ERROR` with its message, status `"failed"`.
   - (d) the stream closes with no terminal frame: close events, then `RUN_FINISHED` with reason `"stop"`, status `"succeeded"`.
   - (e) the reader rejects: `RUN_ERROR` with the error's message; returns `{ status: "failed", error }`.
2. **Move**: append to `packages/chat/src/core/ag-ui/event-projection.ts` (it is the `./core/ag-ui` entry, so no package.json or new entry is needed). Move these from Tovu `apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts`, verbatim with their doc comments: `streamFromReader` (`:156–179`), the frame context interface (`:181–186`), `writeAllAgUiEvents` (`:188–193`), `writeFrameOutcome` (`:195–223`), and `drainAgUiStream` (`:278–308`), exported as **`drainRunFramesToAgUi`**. Only these changes are allowed:
   - the context type is `{ reader: ReadableStreamDefaultReader<Uint8Array>; threadId: string; runId: string; state: AgUiTranslationState; notices: RunNotices; write: (event: AgUiEvent) => void }`, and `drainRunFramesToAgUi(required)` takes it as its one argument (`reader` moves into it);
   - every `writeAgUiEvent(ctx.res, e)` / `res.write` becomes `ctx.write(e)`, and `writeAllAgUiEvents` takes `{ write, events }`;
   - delete the three `ctx.res.end()` calls (the host ends its response);
   - `RUN_NOTICES` becomes `ctx.notices`;
   - `AgentRunStatus` becomes the literal union `"succeeded" | "failed" | "canceled"`.

   Add `import { readSseFrames, readTerminalReason, translateRunFrame, type RunFrameCarry, type RunFrameOutcome, type RunNotices } from '../run-events/entry.js';`. `EventType` is already imported.
3. Changeset: minor `@jini-ai/chat`. COMMIT-PLAN lists the baseline row combine owes (`./core/ag-ui` → `drainRunFramesToAgUi`).

STOP if `run-events` imports anything from `ag-ui` (an import cycle), a cast is needed, or a moved function goes over 50 lines or complexity 10.

### TV-AG1 (Tovu, WAIT AG-J1) — repoint the admin route
In `assistant-ag-ui.ts`:
- Delete the five moved declarations (`:156–223` and `:278–308`; `startDaemonRun` and `subscribeToDaemonEvents` at `:225–276` stay).
- Replace `:389` with:
  ```ts
  const outcome = await drainRunFramesToAgUi({ reader: subscribedReader, threadId: run.threadId, runId: run.runId, state, notices: RUN_NOTICES, write: (event) => writeAgUiEvent(res, event) });
  res.end();
  ```
- Add `drainRunFramesToAgUi` to the existing `@jini-ai/chat/core/ag-ui` import.
- Remove the imports that are now unused (check each in the file with `grep -n`): `closeAgUiRun`, `readSseFrames`, `readTerminalReason`, `translateRunFrame`, `RunFrameCarry`, `RunFrameOutcome`, and `AgentRunStatus` if it is no longer used.
- Rename `drainAgUiStream` to `drainRunFramesToAgUi` in the comments at `:329,341`.

No other edits. The route suite and `assistant-ag-ui-wire.golden.test.ts` are the byte witnesses (combine runs them). Admin Chrome look owed.

### TV-AG0 (Tovu-only, now) — delete duplicate tests
P1-T1 exactly as designed, plus: delete `apps/website/src/server/runtime/composition/modules/__tests__/assistant-ag-ui.wire.unit.test.ts`. Before deleting each case, name its Jini counterpart in COMMIT-PLAN (`run-events/__tests__/payload.test.ts`, `frames.test.ts`, `ag-ui/__tests__/translation.test.ts`). STOP for any case without one: keep it and record why.

## Phases 2–4 (next design pass, after phase 1 lands and D1–D4 are answered)
- **P2 site transport.** Point the site route that runs the existing provider turn (`site-assistant.ts:689–727`) at `translateAgentEventToAgUi` and SSE. Both renderers' `createSiteAssistantTransport` (`SiteAssistantWidget.hooks.ts:32`, `vanilla-host.ts:25`) use Jini `createAgUiRunClient`. All 8 visitor golden scenarios must pass. `/confirm` is unchanged.
- **P3 confirmations.** A pending Ask becomes `RUN_FINISHED.outcome.type="interrupt"`, and `resume[]` settles it through the existing exchange (visitor `visitor-confirmation-gate.ts:62–83`; admin surface exchange). Tests: accept, deny, expire, wrong owner, replay, second settle. Delete `/confirm` after this.
- **P4 page tools.** Executable calls come only from the registry's authorized `deliver`, matched by `invocationId`. `begin` happens before every page effect. Keep the publication resolver and authorization in Tovu.

## Run plan (batching rule: every half < 4 sheets → DRAFT, nothing launched)
- `j-ag-jini-DRAFT.md`: AG-J1 (Jini merge-6).
- `j-tv-ag-only-DRAFT.md`: TV-AG0 (Tovu merge-6, independent).
- `j-tv-ag-DRAFT.md`: TV-AG1 (after AG-J1 lands; the combine supplies the Jini build; no lock edit in the job).
