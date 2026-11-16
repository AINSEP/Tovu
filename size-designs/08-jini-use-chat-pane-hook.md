# 08 — Jini `packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts`

Measured at Jini `origin/integ/wave-b-fixed`: 1,239 lines (946 code). `useChatPane` is 404-1138 (**618** code lines). Hooks are exempt from the 50-line target, not from the 80-line error. Listed NOT REACHED / deferred on `refactor/size-jini-chat-runtime`.

## 1. Current shape

| lines | content |
|---|---|
| 52-170 | `UseChatPaneOptions`, `UseChatPaneResult` |
| 182-402, 1141-1235 | 9 module-level helpers: `unconsumedQueuedInputs`, `findMidRunTarget`, `findTypedAnswerTarget`, `deliveredEveryStagedAttachment`, `uploadAttachmentBatch`, `resolvePaneSendBlocker`, `steerableMidRunTarget`, `unansweredTypedAnswerTarget`, `queuedMidRunTarget` |
| 405-443 | 22 state/ref declarations (upload count, attachment error, stored queue, 12 refs) |
| 444-499 | working directory, selection (requested → resolved), conversation, surfaces subscription (E1), composer, activity, queued inputs/turn |
| 500-533 | `releaseStateRef` render-phase write; window effect (E2); queue sync (E3); `onActivityChange` (E4); `onMessagesChange` (E5); mounted (E6) |
| 535-562 | controlled selection: effect (E7), `setSelection` |
| 564-616 | `sendBlocker`, `canSend`, six `latest*Ref.current = …` render-phase writes; attachment-count (E8), typed-answer conversation (E9), batch conversation (E10) effects |
| 618-739 | `addAttachments` (34), `recordAcceptedInput`, `consumeDeliveredAttachments`, `restoreQueuedDraft`, `restoreRefusedDraft`, `finishPromptSend` |
| 743-821 | `sendGuardedPrompt` (33), `sendPrompt`, `sendComposerPrompt`, `enqueueTurn` |
| 823-848 | `answerWaitingQuestion` |
| 850-924 | mid-run: `clearDeliveredDraft`, `retainAcceptedMidRunInput`, `finishMidRunSend`, `sendIntoRunningTurn` |
| 927-1047 | `sendOrdinaryTurn` (38), `send` (32), `retrySend`, `sendAsNewMessage`, `interruptSend`, `discardQueuedUploads`, `cancelQueued`, `cancelQueuedMessage` |
| 1051-1137 | queued-turn release effect (E11), `reset`, result object (28 members) |

The coupling is the **12 refs**: nearly every callback reads `latestComposerRef`/`mountedRef`/the queue refs, which is why it was never split.

## 2. Target shape

```
chat-pane/hooks/
  useChatPane.hooks.ts                 root hook (~60 code lines): calls the sub-hooks, builds the result      ~150
  use-chat-pane/
    types.ts                           UseChatPaneOptions, UseChatPaneResult (52-170)                           ~125
    send-targets.rules.ts              the 8 pure helpers (no React)                                            ~230
    upload-attachment-batch.ts         uploadAttachmentBatch                                                    ~40
    useChatPaneRefs.hooks.ts           the ref bundle: creates the 12 refs, does the render-phase writes
                                       (500, 573-586), owns the mounted effect (E6)                             ~110
    useChatPaneSelection.hooks.ts      444-462, 535-562 (E7)                                                    ~110
    useChatPaneConversation.hooks.ts   463-499, 513-515 (E1, E3, E4, E5)                                        ~110
    useChatPaneAttachments.hooks.ts    upload count, attachment error, addAttachments, E8, E10,
                                       consumeDeliveredAttachments, discardQueuedUploads                        ~160
    useChatPanePromptSend.hooks.ts     662-801                                                                  ~180
    useChatPaneTypedAnswer.hooks.ts    typed-answer state/refs, E9, answerWaitingQuestion                       ~90
    useChatPaneMidRunSend.hooks.ts     850-924                                                                  ~120
    useChatPaneQueuedTurn.hooks.ts     enqueueTurn, cancelQueued*, E2, E11                                      ~140
    useChatPaneSendActions.hooks.ts    sendOrdinaryTurn, send, retrySend, sendAsNewMessage, interruptSend, reset ~180
```

13 files, largest ~230. `useChatPane.hooks.ts` keeps its path and export; the pane's `index.ts` and `ChatPane.tsx` are untouched. Type importers of `UseChatPaneOptions/Result` are repointed to `use-chat-pane/types.ts` (no re-export from the hook file).

```ts
export interface ChatPaneRefs { mounted; latestComposer; latestDraft; latestFolders; latestAttachments; attachmentCount;
  releaseState; queuedUploadOwners; queuedForLiveDelivery; submittedComposer; startingPrompt; refusedSend }   // RefObjects
export function useChatPaneRefs(input: { composer; conversation; queuedTurn }, _options = {}): ChatPaneRefs
export function useChatPanePromptSend(input: { refs: ChatPaneRefs; conversation; composer; guard; selection; attachments }, _options = {}): ChatPanePromptSend
```

**Keeping each sub-hook ≤80 lines:** the callbacks themselves move to module level as plain functions taking a context object, and the hook only wraps them — the technique already used on `refactor/size-jini-chat-runtime` (`buildModule` closures → module functions taking `ports`). Example: `function sendGuardedPrompt(ctx: PromptSendContext, input: …): Promise<…>` + `const sendGuarded = useCallback((i) => sendGuardedPrompt(ctx, i), [same deps as today])`. Refs are passed as ref objects, never as `.current` snapshots.

Direction: root → sub-hooks → `send-targets.rules.ts`; sub-hooks never import each other — the root passes one sub-hook's result into the next.

## 3. Step order

0. **Characterization (no source change):** (a) `useChatPane.identity.characterization.test.tsx` — render, re-render with identical options, record which of the 28 result members changed identity; again after a draft change and after a stream tick. (b) `useChatPane.effect-order.characterization.test.tsx` — fake transport/ports that log calls; scripted scenarios (send, send while streaming → queue → release, mid-run steer, typed answer, upload then send, reset, unmount mid-upload); snapshot the ordered log.
1. `types.ts`, `send-targets.rules.ts`, `upload-attachment-batch.ts` (pure moves; add direct unit tests for the rules).
2. `useChatPaneRefs` — first, because everything else takes it.
3. One sub-hook per commit in this order: Selection → Conversation → Attachments → TypedAnswer → PromptSend → MidRunSend → QueuedTurn → SendActions.
4. Remove `useChatPane` (+ nested callback) entries from `scripts/size-debt.json`.

**Effect order.** React runs effects in declaration order; today it is E1…E11. The root calls sub-hooks in an order that keeps that sequence wherever two effects share a ref or state: Conversation (E1) → QueuedTurn's window effect (E2) → Conversation's sync effects (E3-E5) cannot be interleaved once grouped, so **E2 moves into `useChatPaneConversation`'s call position by making it a separate tiny hook `useChatPaneReleaseGuard` called between them only if the step-0 log shows the order is observable**; otherwise it stays in QueuedTurn. The executor decides from the log, not by reasoning. Same rule for E8/E9/E10.

## 4. Tests

Pins that exist: `useChatPane.test.tsx`, `.mid-run`, `.refresh`, `.release-check`, `.surfaces`, `.cov-j2` (all through the public hook, with fakes) — unchanged. New: the two characterizations; `send-targets.rules.test.ts`. No test may be weakened; counts before/after in the report.

## 5. Risks

| risk | de-risk |
|---|---|
| stale closure: a callback captured `composer` where it used to read `latestComposerRef.current` (or the reverse) | context objects carry refs; callback bodies move verbatim; `react-hooks/exhaustive-deps` unchanged set; mid-run + release-check suites |
| effect order change (queue released before the draft is restored) | step-0 ordered log; rule above |
| callback identity churn → downstream effects re-fire (`ChatPane`'s handle publisher) | identity characterization |
| unmount during upload (`mountedRef`) | scenario in step 0 |

Risk: **high** for its size — the most closure-coupled of the ten.

## 6. Interaction

- Untangle **R4** (chat, wave E) and **C9b** (chat kit, wave C) edit files in this folder and guard by blob: an R-lane SKIPs a file whose blob changed. Run this design **before the R4 sheets are generated, or after R4 lands** — not between.
- Gate C0 (`L5-injected-edge`): a *new* file importing a non-base `@jini-ai/*` package has no debt key and fails. The new files must import only `react`, this package, `@jini-ai/core`, `@jini-ai/protocol`; if a moved callback needs a foreign import today, **stop and report** (it belongs to R4's port work).
- `refactor/size-jini-chat-runtime` says chat/daemon were deferred because "another run is on them" — check for that branch before starting (see INDEX, owner decisions).
- Nothing here is Tovu vocabulary; nothing to move between repos.

## 7. Estimate

≈14 commits. Sonnet executor **≈300k tokens**.
