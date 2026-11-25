BUGS chat / AG-UI client and run starts: 3 sheets, 4 bugs covered, 9 skipped (earlier-class ownership or outside run lifecycle)

Read-only plan against Tovu `6ace8e8fb2` and Jini `50f8dfcd9`, the tip of the requested Jini ref. The ledger cites Jini `7727d518c` for its count. The touched Jini chat files have no diff between those revisions. No files changed and no tests ran.

For each sheet, write the named tests first and record the mutations in `COMMIT-PLAN.md`. Stop the affected step if its named anchor no longer matches. Keep new functions on `(required, _optional = {})`, inject effects, keep hooks as required props if any are touched, and keep functions within 80 lines and complexity 10. No schema migrations, theme changes, or new hooks are needed.

## 1. Shared AG-UI transport lifecycle

**Bugs covered** — H1986, H1994.

**Root cause**  
`subscribeRun` conflates a delivery segment ending with a logical run succeeding. It can return an unaccepted segment ID, repeat failure callbacks, and drop accepted-run frames before the live observer sees them.  
`acceptedRuns` has no release path. Before `RUN_STARTED`, explicit Stop only latches locally, despite Tovu already having a cancellation route keyed by assistant-message identity.

**Anchors after extraction** — Jini `packages/chat/src/core/assistant-client/ag-ui-transport.ts` (`cf908d8c5`) and `__tests__/ag-ui-transport.test.ts` (`607d32822`) stay at those paths on `w3-r2allj`, both `r3-w1*j`, and the three `adm-*` refs checked. Tovu `apps/admin/src/lib/assistant-transport-ag-ui.ts` (`91492c3b21`) stays in Tovu on the corresponding admin and extraction refs. The browser test below is new. The metadata leg uses the unchanged Jini `packages/chat/src/core/index.ts` and Tovu `apps/website/src/server/runtime/composition/modules/assistant-ag-ui-approval-segment.ts` (`b0e7f46ff6`).

**Tests first**

| File | Test and assertion | Mutation |
|---|---|---|
| Jini `packages/chat/src/core/assistant-client/__tests__/ag-ui-transport.test.ts` | Update the existing RUN_ERROR and late-stream-error cases to assert one error followed by one completion with the partial transcript. A late transport error after `RUN_FINISHED` emits no error. | `terminal-not-latched` — allow a second terminal callback through. |
| Same | “An AG-UI stream ending without a terminal verdict is not success.” Text then EOF reports one interruption and retains the partial transcript. An expected durable start ending before any acceptance or explicit legacy acknowledgment rejects and never binds or returns a segment ID. | `eof-is-success` and `unaccepted-segment-id` — restore the old EOF outcomes independently. |
| Same | “An accepted interrupt reaches the live observer without replaying the transcript.” The observer sees the interrupt. Segment text, failure, and completion do not reach transcript handlers after acceptance. The follower still completes the turn once. | `drop-before-live-observer` — restore the early drop. |
| Same | “Accepted-run routing survives segment EOF and ends with the follower.” After the segment closes, an active canonical run still routes Stop once. After follower completion, or detach without Stop, it is no longer registered. Another live run is unaffected. | `retain-accepted-entry` — omit release. |
| New Tovu `apps/admin/src/lib/__tests__/assistant-transport.ag-ui.pending-stop.unit.test.ts` | “Stop before acceptance posts the owned message cancel before headers.” Hold the AG-UI response and fire `cancelSignal`, then detach. Assert the cancel POST carries the prepared message and conversation IDs, does not inherit the aborted delivery signal, and is not followed by another cancel when acceptance wins the race. | `latch-until-acceptance` — omit the pending request. |
| Jini `packages/chat/src/core/__tests__/surface-recovery.test.ts` | “The public chat core exports the key written on recoverable surfaces.” Assert the `core/index.ts` export equals the actual emitted `_meta` key. | `hide-exchange-meta-export` — remove the public export. |

**Exact fix**

- In Jini, make `subscribeRun` and `settleRunOnce` share one terminal verdict. A pre-start failure rejects without firing stream callbacks. After delivery-only start, a non-abort `RUN_ERROR` or non-abort EOF without a terminal frame reports one error before one `onDone`. `RUN_FINISHED`, including an interrupt, ends the segment cleanly. Ignore late terminal notifications. An intentional abort does not show an error. Preserve the documented delivery-only lane when no durable identity was prepared or the server explicitly acknowledges the client segment with `RUN_STARTED`. Bare EOF is not that acknowledgment.
- In `durableStartEvent` and `subscribeRun`, forward validated frames **after** acceptance to the injected `onLiveEvent` before dropping their transcript projection. Do not forward them to `RunHandlers`. Keep the current Tovu approval tap, which also supplies the request and thread identity.
- In `acceptDurableTurn`, wrap the follower’s `onDone` to release that accepted entry after forwarding the callback. Release on detach too, but keep an explicit Stop addressable through its in-flight cancellation so `useRunStream`’s cancel-signal → detach → `stopRun` sequence cannot issue a second cancel. Segment EOF alone must not release the entry or remove the active follower’s cancel listener. Reopened turns use the existing owned cancellation path in `transport.ts`’s `stopTransportRun`.
- Add the optional host capability `AgUiDurableLocalCliBinding.cancelPendingRun({ messageId, conversationId }, _optional = {}): Promise<void>`. Have `requestDurableStop` start it on explicit pre-acceptance Stop when both IDs exist. Keep the latch, and have `cancelAcceptedOnce` share the pending result. Only a failed pending request falls back to the existing canonical cancel if acceptance arrives. Hosts without the capability keep their existing latch. In Tovu, inject `AdminAgUiDurablePorts.cancelPendingRun` into `adminAgUiDurableBinding` and post to the existing `/api/runs/pending/cancel` route with the two IDs and same-origin credentials. Do not tie that request to the delivery abort or count a non-2xx response as a successful pending cancel. No new server endpoint.
- Export the existing `SURFACE_EXCHANGE_META` from Jini `core/index.ts`. Import it from `@jini-ai/chat/core` in Tovu’s `readCardMeta` module and remove the duplicate literal and its stale explanation. Do not change the wire key or approval classification.

**Order** — Jini tests and implementation, then the Tovu binding and metadata consumer against that package. Keep the existing server integration witness for cancellation before acceptance and during subscribe.

**Real-app check** — In the admin AG-UI canary, delay start response headers and press Stop. Verify that the cancel reaches the server before the headers are released, no executor starts if cancellation wins, and no error banner or duplicate cancel appears. Reload a separate active turn without pressing Stop and verify that it continues.

**BUILDER: SOL**

## 2. Admin approval resume acknowledgment

**Bug covered** — H1995.

**Root cause**  
`resumeParked` sets `claimed` before the POST and returns `true` for every repeated answer, even after the POST was refused.  
`routeApprovalToolCall` interprets that synthetic `true` as “Answer sent.” The first refusal reaches the dock correctly.

**Anchors after extraction** — Tovu `apps/admin/src/lib/ag-ui-approval-relay.ts` (`602d35f115`) and `apps/admin/src/lib/__tests__/assistant-transport.ag-ui.approvals.unit.test.ts` (`a1a38a422c`) stay at those paths on the checked `tv-adm*`, `tv-r3-w1*`, and `tv-w3-ext-a` refs. No Jini renderer change.

**Test first** — Extend “an expired resume shows the plain refusal once.” Send the same AG-UI card decision twice after a 400 refusal. Assert both results say “Answer not sent” with `isError: true`, exactly one resume POST, no MCP-UI fallback call, and one dock error. Keep the existing concurrent-success case, which requires both callers to receive success from one POST. Mutation `claimed-means-sent` restores `true` for the second caller without posting again.

**Exact fix** — In `createAgUiApprovalRelay`’s `answer({ exchangeId, allow }, _optional = {})`, give `ParkedInterrupt` one stored answer promise. Install it before invoking the injected resume, and share its boolean outcome with repeat clicks while the exchange is owned by the relay. Preserve the claim-before-send order, `releaseAnsweredPause` behavior, and existing `resumeParked` refusal mapping. A refused exchange stays consumed. Do not reset it for retry or send it to the fallback route. Leave `routeApprovalToolCall`’s result shape and normal turn disposal unchanged.

**Order** — Independent of Sheet 1. No server or wire change.

**Real-app check** — Let a disposable approval expire in the AG-UI canary and answer the stale card. Verify one resume POST, one expiry message, and no success acknowledgment on a repeat interaction. Separately, use the real daemon to complete a turn with two approval segments. Compare segment usage frames, the authoritative checkpoint, and the final footer. Verify resume starts after the parked cursor without replaying the card or earlier text. Keep `finalTranscript`’s last-usage rule unchanged unless this check shows the values are segment-local rather than cumulative.

**BUILDER: SOL**

## 3. Durable admin start field parity

**Bug covered** — H1998.

**Root cause**  
Jini’s `prepareLocalRunStart` already builds `pageContext`, `folders`, and `agentPluginState`. Tovu’s browser allowlist drops all three.  
The matching Tovu server projection cannot read them. The shared acceptance path and daemon already know how to process them.

**Anchors after extraction** — Tovu `apps/admin/src/lib/assistant-transport-ag-ui.ts` (`91492c3b21`) and `apps/website/src/server/runtime/composition/modules/assistant-ag-ui-launch.ts` (`55ef2a82eb`) stay in Tovu on the checked admin and extraction refs. `apps/website/src/server/__tests__/assistant-ag-ui-durable.integration.test.ts` stays at the same path. Use the `tv-w3-p4mounts` / `tv-r3-w1*` blob `b2152ded27`, which adds reporter wiring but retains the launch assertion. The browser test below is new.

**Tests first**

- New `apps/admin/src/lib/__tests__/assistant-transport.ag-ui.launch-context.unit.test.ts`, “Durable AG-UI sends the three prepared context fields and no claimed authority.” Capture the actual request from `createAdminAgUiRunClient`. Assert exactly those fields alongside the existing allowed launch fields, with no browser principal, recovery session, recovery mode, or routine marker. Mutation `drop-client-launch-context` restores the current four-key allowlist.
- Extend the attachment/reopen case in `assistant-ag-ui-durable.integration.test.ts`. Send a named page, an existing temporary directory, and a non-default selection/exclusion state. Assert the real run-start decoder sees the capped page context, the picked-folder prompt block, and the plugin decision. Verify the accepted launch retains them and that replay still uses the original launch exactly once. Mutation `drop-server-launch-context` removes the three server projections while leaving the browser payload intact.

**Exact fix** — Extend `wireLaunchFields` in Tovu’s `assistant-transport-ag-ui.ts` to pick exactly the three additional defined fields from the prepared `contextRef`. Change its existing signature to `wireLaunchFields({ contextRef }, _optional = {})` and update its one caller. Extend `AgUiLaunchFields` and `readAgUiLaunchFields({ durable }, _optional = {})` in `assistant-ag-ui-launch.ts`. Reuse the existing page-context decoder for bounded page data. Pass picked folders unchanged to the existing acceptance intake, which calls `readPickedFolders` before ledger admission, and preserve the existing `readChatAgentPluginState` decoding at daemon start. Do not add a second filesystem read or spread arbitrary `launch` keys. `assistant-ag-ui.ts` already spreads the parsed launch and stamps the authenticated principal, so no change there. Do not change Jini’s launch projection, replay logic, or legacy starts.

**Order** — Independent of Sheet 2. Apply after Sheet 1 if both touch `assistant-transport-ag-ui.ts`.

**Real-app check** — In the admin AG-UI canary, send from an open page editor with a picked local folder and a saved plugin selection. Verify that “this page” refers to the open entry, the selected folder reaches the Local CLI context, and the plugin decision survives reopen without a second launch.

**BUILDER: SOL**

### Skipped near-matches

- **Security** — B115 / H1962 is sender-frame admission, even though the affected IPC channels belong to chat.
- **Large files/media** — O1731, O1732, O1733 cover attachment capacity, buffering/staging, and large media upload limits. Run start is where one symptom appears, not where the class is owned.
- **Admin UI** — Today’s UI item 5 is the 846 px layout and clipped title. The prior “Clean up chats does not open” bug passed the new check and was not reopened.
- **Code rules/tech debt** — H2001 and H2061 are file-size violations, not run-start behavior defects.
- **Outside run lifecycle** — H1115 is newsletter update semantics. H1905 is publish-connect candidate wiring. Both happen through assistant tools, but neither depends on chat transport or run admission.
