Software Architect(Direct): **Verdict: needs rework.**

Reviewed design `7d75f120`, Tovu `65302ee5`, and Jini `02edbb68`. Source was read through Git without checkout or edits. No project test suites were run; one read-only probe validated the resume example against installed `@ag-ui/core` 0.0.58.

Below, `D` means `designs/ag-ui/DESIGN.md`; `T` and `J` identify the pinned Tovu and Jini trees.

1. **Blocker — The proposed admin confirmation producer does not exist.**

   **Evidence:** D:340 and D:607 assume daemon confirmations arrive as `surface_request { surfaceKind: "confirmation" }`. J:`packages/protocol/src/events.ts:157–167` explicitly describes these events as scaffolding with no producing driver.

   The actual admin registration loop applies `applyToolApprovalPolicy` and states that the server’s human chat-card exchange already owns page approval: T:`apps/website/src/server/inbound/assistant/agent-daemon-scope.ts:405–412`. Its existing integration test observes an **`mcp-ui`** emission and answers through `MCP_UI_TOOL_CALLS_PATH`: `.../__tests__/agent-daemon-server.page-confirmation.integration.test.ts:59–107`.

   D:437’s claim that admin page calls currently use the browser’s `pageApproval` dialog is also stale. T:`apps/admin/src/App.hooks.ts:1085–1095` supplies no such option.

   **Fix:** Redesign S3 around the actual human-confirmation owner and reply contract. Preserve its frozen input, principal binding, navigation snapshot and approval policy. OD-5 cannot authorize a duplicate mechanism without explicitly resolving that existing ownership.

2. **Blocker — FT-3 does not prevent denied browser executions.**

   **Evidence:** D:362 assumes clients execute declared frontend tools on `TOOL_CALL_END`. D:368 nevertheless emits that event for denied calls, followed by a result “in the same write,” and D:370 claims protection for every client.

   One SSE write does not make several events an atomic client operation. A client following D:362 can execute between processing `TOOL_CALL_END` and `TOOL_CALL_RESULT`. J:`packages/agentic/src/core/ag-ui.ts:29–42` likewise describes END as the argument-completion boundary. AG-UI exposes these as distinct events; any stronger batching guarantee needs separate evidence. [Official event documentation](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/concepts/events.mdx).

   **Fix:** Never emit an executable frontend-tool handoff for a denied invocation. Define a refusal representation that cannot trigger execution, and test with a client fake that executes immediately on END.

3. **Major — Removing the cancellation channel permits effects after server cancellation.**

   **Evidence:** Today, registry cancellation calls the attachment’s cancellation callback: J:`packages/daemon/src/frontend-session-registry.ts:370–374`. The browser receives `cancelled` and aborts the invocation controller: J:`packages/chat/src/embed-widget/browser/frontend-session-bridge.ts:388–390`. Queued page work checks that controller before executing: `:303–307`.

   D:404 replaces cancellation with a result on the paused run’s **next response**. During browser execution there may be no open response: that response starts only after the browser submits its result. A queued or delayed operation can therefore execute after the tool timed out or the run was cancelled.

   **Fix:** Preserve a cancellation delivery mechanism until an AG-UI replacement can reach pending browser work before its effect. Add tests for cancellation while queued, during asynchronous preparation, and before result submission.

4. **Major — Parking has no defined transfer away from the original request’s lifetime.**

   **Evidence:** D:216 passes a request signal into `start`; D:414 gives `attachRun` a signal. Yet D:484 says disconnect after parking does nothing.

   Existing implementations attach cancellation directly to those signals: J:`packages/daemon/src/http/frontend-control.ts:218–223`; T:`apps/website/src/assistant/site/visitor-confirmations.ts:50–51`; T:`apps/website/src/assistant/site/visitor-confirmation-gate.ts:57–58,76–82`. Merely changing `settleRun`’s decision cannot undo those listeners.

   There is also no defined paused-run Stop operation. Today Stop aborts the active HTTP agent: J:`packages/chat/src/core/assistant-client/ag-ui-transport.ts:204–207`. After an interrupt response has ended, aborting that fetch cannot reliably cancel the parked server run.

   **Fix:** Define separate response and logical-run lifetimes, including explicit handoff, disposal and paused-run cancellation. Test disconnect and Stop on both sides of the park transition.

5. **Major — One composite `ownerKey` cannot enforce the stated independent quotas.**

   **Evidence:** D:491 proposes one pause per guest and two per IP “through `ownerKey` composition.” D:205 defines only one equality key.

   A `guest+IP` composite counts each pair separately; it cannot aggregate several guests on one IP or one guest across IP changes. Adding tab identity for D:533’s ownership guarantee fragments quotas further.

   The existing implementation deliberately separates these concepts: T:`apps/website/src/assistant/site/visitor-frontend-control.ts:27–35` resolves ownership and supplies independent `ip:` and `guest:` capacity keys. Visitor confirmations separately track turns and IP counts: `visitor-confirmations.ts:27–33`.

   **Fix:** Keep authorization identity separate from quota identities. Specify atomic admission against independently counted guest, IP and global limits, with explicit thresholds.

6. **Major — FIFO pairing assumes a correspondence that existing gated calls do not have.**

   **Evidence:** D:424–429 pairs each frontend invocation with a held model `tool_use`, FIFO by capability.

   Existing approval preparation invokes `page.find_elements` through the audited executor before presenting an opaque-click confirmation: T:`apps/website/src/assistant/page-approval-context.ts:28–33`. That nested invocation is not a delegated model call and does not necessarily have a corresponding emitted `tool_use`. The protocol emission occurs in the delegated bridge: J:`packages/daemon/src/delegated-tool-bridge.ts:267–284`.

   Additionally, two same-capability model calls can pass asynchronous gates in a different order. D:429 acknowledges swapped display IDs, but later `tool_result` events still reference the original IDs; the displayed arguments and results can consequently disagree.

   **Fix:** Define correlation at the execution/delivery boundary, including nested calls without model events. Do not infer identity from capability name and arrival order. Test nested approval reads and reversed gate-completion order.

7. **Blocker — S1 contains intermediate commits that cannot pass as specified.**

   **Evidence:**

   - D:586 deletes `ag-ui/entry.ts`, but omits J:`packages/chat/src/core/assistant-client/__tests__/ag-ui-transport.test.ts:4`, which imports it.
   - D:587 deletes `reduceAgentWirePayload`, but omits its remaining caller in J:`packages/chat/src/core/__tests__/conversation-cost.test.ts:54–57`.
   - D:590 says to remove two export lines when moving `agentic/core/ag-ui.ts`. J:`packages/agentic/src/core/index.ts:76–83` exports **six names** from that file; removing only the named two leaves an unresolved module.
   - D:591 makes Tovu consume `run-input.ts` and `daemon-frames-source.ts`, but D:170–177 publishes neither implementation. Leaving internal imports or adding forwarding shells would violate the proposed boundary rules.
   - Moving `ag-ui-transport.ts` also requires repointing J:`packages/chat/src/core/assistant-client/transport.ts:8`; the S1 caller list does not name it.

   **Fix:** Supply a complete per-commit importer/export map, publish real implementation subpaths, and introduce shared contracts before their implementations. Include tests, package export metadata and host consumers in each affected commit.

8. **Major — Reusing `translateRunFrame` cannot preserve the promised S1 wire bytes.**

   **Evidence:** D:65, D:589 and D:591 replace Tovu’s frame handling with the canonical frame reducer while requiring byte-identical output.

   Those handlers differ beyond D:96–103’s payload table:

   - Tovu forwards stdout chunks verbatim: T:`apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts:369–371`. Jini suppresses echo chunks and generates heartbeat statuses: J:`packages/chat/src/core/run-events/entry.ts:587–615`.
   - Tovu ignores stderr: T:`.../assistant-ag-ui.ts:403–420`. Jini handles it: J:`.../run-events/entry.ts:667–669`.
   - Tovu emits only RUN_ERROR for an error frame: T:`.../assistant-ag-ui.ts:377–380`. Jini additionally produces a status event: J:`.../run-events/entry.ts:689–693`.
   - Tovu reports an end frame as succeeded: T:`.../assistant-ag-ui.ts:416–418`. Jini reads failed/cancelled terminal classifications: J:`.../run-events/entry.ts:639–648`.

   **Fix:** Inventory frame-level differences separately. Either preserve them through explicit compatibility behavior or approve and schedule their observable changes. OD-2’s payload-reducer decision does not cover them.

9. **Major — The site preflight cannot simply remain in front of the new request format.**

   **Evidence:** D:615 keeps the public preflight before the new AG-UI route. The existing preflight expects `body.message` and `body.history`, rejects a missing message, and only then applies the chat rate limiter: T:`apps/website/src/server/runtime/composition/modules/site-assistant.ts:297–325`.

   An AG-UI start request uses `messages`; D:327’s resume request intentionally has `messages: []`. Both fail that preflight if retained literally. Re-running the original provider-start path on resume would also conflict with continuing a live parked turn.

   **Fix:** Specify separate start and resume admission paths. Reuse the existing enablement, origin, error and quota owners, while mapping AG-UI messages explicitly and continuing the held provider turn without constructing another one.

10. **Major — Pause failure semantics contradict existing behavior and lack a complete port contract.**

    **Evidence:** D:349 says expiry settles confirmation as refusal; D:492 instead cancels the entire site turn. Today an expired exchange produces `false` at T:`apps/website/src/assistant/site/visitor-confirmations.ts:56–57`, and the confirmation gate resumes the executor with `"deny"` at `visitor-confirmation-gate.ts:56–58`.

    D:491 also promises that capacity refusal fails only the tool and continues the run. But the exposed handle at D:221–228 provides only `next`, whole-run `cancel`, and `park`; it has no operation for refusing the current pause while continuing that response.

    **Fix:** Distinguish tool refusal, expired confirmation, requester abandonment and whole-run cancellation. Define the source operation and cleanup for each outcome. Any change from denial to whole-turn cancellation needs an explicit behavior decision.

11. **Major — The claimed event round trip omits correlation fields and has no complete migration step.**

    **Evidence:** D:296 claims exact reverse mapping with only two listed losses. D:98 and INDEX:46 recommend retaining canonical tool correlation.

    J:`packages/chat/src/core/run-events/entry.ts:53–58,140–142` preserves `bridgeCall` and `toolOrigin`. The AG-UI projection drops both at J:`packages/chat/src/core/ag-ui/entry.ts:148–154`; reverse translation reconstructs neither at `:241–251`. D:278 says this mapping is unchanged and specifies no replacement encoding.

    These fields affect existing duplicate-call matching: J:`packages/chat/src/core/tool-events.ts:195–200`. They are not merely decorative metadata.

    The migration also lacks an explicit behavior-changing commit for OD-3/OD-6’s result extras and activity mapping; S1 expressly preserves wire bytes.

    **Fix:** Enumerate field-level fidelity, encode required correlation, and schedule the projection, reverse reducer, event-union and consumer changes together. Goldens must include populated optional fields.

12. **Minor — The documented resume request fails the installed schema.**

    **Evidence:** D:327–328 omits `context`. Installed `node_modules/@ag-ui/core/dist/index.d.ts:2305` defines `RunAgentInputSchema`; its context array is required. A direct `safeParse` of the example returned:

    ```text
    context: Required
    ```

    The interrupt `RUN_FINISHED` example passed validation.

    **Fix:** Add `context: []` and schema-validate every complete wire example against the locked package.

13. **Minor — An object-shape difference is incorrectly classified as a wire difference.**

    **Evidence:** D:103 lists missing `detail` versus `detail: undefined`; D:105 calls the listed differences observable on the wire. T:`apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts:153` creates the undefined property, whereas J:`packages/chat/src/core/ag-ui/entry.ts:43` omits it. JSON serialization omits the undefined property, so these produce the same wire object.

    **Fix:** Separate reducer-object parity from serialized-wire parity. Apply the appropriate assertion to each.

Inventory spot-checks: **18 rows sampled against source.** Here `A` is Tovu’s `apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts`, `P` is Jini’s `packages/chat/src/core/ag-ui/entry.ts`, and `R` is Jini’s `packages/chat/src/core/run-events/entry.ts`.

| Design inventory row | Source evidence | Result |
|---|---|---|
| F1: browser canary switch | T:`apps/admin/src/lib/assistant-transport-ag-ui.ts:43–54` | Matched |
| F2: in-process site provider turn | T:`apps/website/src/server/runtime/composition/modules/site-assistant.ts:784–826` | Matched |
| F3: existing projection/reverse reducer | P:158,273 | Matched |
| F4: three payload reducers | A:182; P:62; R:132 | Matched |
| F5: core 0.0.58 | T:`package-lock.json:127–129` | Matched |
| Type re-export shell | A:62 | Matched |
| Route constant stays host-owned | A:71 | Matched |
| Message parser moves | A:102–109 | Matched |
| Duplicate reducer deletes | A:182–187 | Exists; migration defects in finding 7 |
| Existing terminal-notice owner | A:195; R:243 | Matched |
| Three projection forwarders | A:227–241 | Matched |
| Express module stays wiring | A:651–669 | Matched |
| Existing frame-parser owner | A:289; R:410 | Matched |
| Frame-handler replacement | A:362–420; R:639–693 | Parity claim fails; finding 8 |
| Daemon start remains host binding | A:492–517 | Matched |
| Daemon subscription remains host binding | A:528–535 | Matched |
| Tool-result media/outcome drift | A:157–162; R:154–169 | Matched |
| Missing-detail wire drift | A:153; P:43 | Misclassified; finding 13 |

I did not verify an actual stock CopilotKit client’s execution behavior, the unpublished Node bridge, bundled widget size, or production replay retention. Those uncertainties cannot substantiate the design’s stronger compatibility claims.

## Recurring mistake classes

- **A transport write is not a consumer transaction.** Security must survive event-by-event processing regardless of network chunk boundaries.
- **Authorization identity and quota identity are different dimensions.** Composite ownership keys cannot replace independent aggregate limits.
- **A shared capability name is not a correlation identifier.** Nested executions and asynchronous gate completion invalidate FIFO matching between independent streams.
