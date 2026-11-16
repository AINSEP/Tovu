> **Revision 2:** read `## Revision 2` at the end first; it overrides the sections above where they differ.

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


## Revision 2 (2026-11-16, after the Codex judgment)

Re-verified at Jini `integ/wave-b-r2` (02edbb68): `packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts` 1,239 lines; `useChatPane` (404) is **618 code lines**; **26 module-level functions, 21 `useRef` sites, 11 effects, 25 `useCallback`s** (revision 1 said 9 helpers and 12 refs). Judge: "needs rework" (2 blockers, 3 majors). **5 accepted, 0 rebutted.** The hook body was read as an outline with exact line anchors for every hook call and effect, not statement by statement — step 0b closes that gap before any move.

### R1. Hook graph (replaces §2's `useChatPaneRefs`-first order)

Source order is already acyclic; revision 1's grouping created the cycles. Measured anchors: refs 405-440 · working directory 444 · selection memos 451-457 · `useConversation` 463 · `useComposer` 482 · queue projection 495-515 · `composer.setAgent` sync 536-560 · latest refs 575-579 · `enqueueTurn` 805 · typed answer uses it at 839/848 · `sendIntoRunningTurn` 903 (uses `enqueueTurn` 897-899) · submit 947-963 · release effect 1051 (uses `sendIntoRunningTurn` 1077). Effects in order: E1 474, E2 502, E3 513, E4 517, E5 521, E6 525, E7 537, E8 587, E9 592, E10 605, E11 1051.

| call order | hook (new file under `hooks/use-chat-pane/`) | source | owns effects | needs |
|---|---|---|---|---|
| 1 | `useChatPaneCells` | 405-440 | none (allocation only: all 21 refs incl. delivery locks, answer/conversation generations, upload controllers, batch ownership) | `options` |
| 2 | `useChatPaneSession` | 444-491 | E1 | cells → working directory, **selection resolution**, conversation, composer |
| 3 | `useQueuedInputsProjection` | 495-515 | E2, E3 | session |
| 4 | `useChatPaneSync` | 517-616 | E4-E10 (incl. selection→composer sync E7, attachment-error clearing E8, answer generation E9, batch adoption E10), `setSelection`, latest refs | cells, session, projection |
| 5 | `useTurnDelivery` | 618-1049 | none | cells, session, sync. Internally, in dependency order: uploads → `enqueueTurn` (queue **mutation**) → typed-answer delivery → `sendIntoRunningTurn` → submit; split into ≤5 files along those five groups |
| 6 | `useQueueRelease` | 1051-1082 | E11 | `sendIntoRunningTurn` from 5 (queue **release**) |
| 7 | root `useChatPane` | result assembly | none | all |

Rules: (a) the root calls 1→7 in this order; (b) **a sub-hook owns only a contiguous run of effects**, so React's effect order is E1…E11 by construction — if a cut would put two non-adjacent effects in one hook, the hook is split instead; revision 1's "reordering is allowed unless the port log differs" is deleted; (c) no hook receives a value produced by a later hook — step 0c proves it by typechecking an empty skeleton of the seven hooks with their real parameter and result types before any body moves. If the skeleton cannot typecheck in this order the executor stops and reports.

### R2. Types and the public entry

`UseChatPaneOptions` / `UseChatPaneResult` move to `hooks/useChatPane.types.ts`. The same commit repoints `chat-pane/index.ts:54-58` (it re-exports both types from the hook file today) and `components/ChatPane.tsx:24`. Published names unchanged; no type re-export is left in the hook file.

### R3. Callbacks: captured vs live (replaces the `ctx` recipe)

No context object. A callback body that becomes a module function takes its inputs as explicit arguments in two groups: **captured values** (were read from the render closure: listed in the `useCallback` dependency array, unchanged) and **live refs** (passed as ref objects, read `.current` after awaits, as today at 743-776 and 823-848). The dependency array of every `useCallback` is byte-identical before and after; a diff in any array is a review stop.

### R4. Inventory (step 0b, before any move)

`work/use-chat-pane-symbols.tsv`: all 26 module functions (incl. `recordConsumedInputs` 194, `awaitingRunReceipts` 204, the delivery exception guards 264/280, `turnFolders` 1157, `attachQueuedInput` 1237) classified pure rule / effect / id creation; all 21 refs with writer(s) and reader(s); the 11 effects with what they write; the 25 callbacks with captured and live inputs. Module functions go to `use-chat-pane/rules/` (pure) and `use-chat-pane/delivery/` (effects); no file over 500, no function over 50 (hooks exempt from 50 only).

### R5. Tests (step 0a) — must fail on the named risk

`npm --prefix packages/chat run test`. Transition tests with fake `ChatTransport`: conversation switch during an upload (late completion is dropped: batch/generation refs); receipt projection (E2/E3) after a queued turn is consumed; typed answer delivered after the conversation changed is rejected by the generation guard; **stale callback**: keep the `send` callback from render N, change draft and conversation, call the old one — it must use the values it captured and the live refs; queue release fires once per transition to idle. Effect-order log pinned for E1-E11 on mount and on conversation change. Identity table of the result's callbacks across a no-op rerender.

### R6. Boundaries and ordering

The file imports only `@jini-ai/core`, `@jini-ai/chat` types and local modules (lines 2, 33, 35) — no `@jini-ai/ui` — so no injection-debt entry is involved and new files must keep it that way. `scripts/injection-debt.json` is path-keyed: nothing is re-keyed. `pnpm guard` and `pnpm typecheck` per commit. Runs before design 09.

### R7. Owner practices check

1 DI: transport and ports arrive through `options`; no new import of a concrete package · 2: sub-hooks and module functions `(required, optional = {})` · 3: hooks exempt from 50; module functions ≤50; complexity ≤10 checked on every new file · 4: one phase per hook file · 5: `index.ts` keeps exporting from the real files; no shell at the old type path · 6: comments move · 7: imports stay inside chat + core/protocol · 8: fake transport via the package's `/testing` kit if present, else an interface fake in the test; no `vi.mock` of package internals · 9: delivery errors keep their guards and text · 10: no dependency array is edited, so no `exhaustive-deps` disable is added · 11: seven hooks, no context object · 12: no new state subscription; queue projection still derives from stored inputs per render (existing cost, O(queued inputs)).

### R8. Estimate

≈20 commits, Sonnet **≈420k tokens** (was 300k). Risk: **high**. Opus review of the step-0 sheets and skeleton before any body moves.

## Judge response

| # | sev | verdict | what changed / evidence |
|---|---|---|---|
| 1 | blocker | accepted | Anchors measured (R1). The cycles came from the grouping, not the source: `enqueueTurn` 805 → typed answer 839 → `sendIntoRunningTurn` 903 → release 1077 is one direction. New 7-hook order separates allocation / sync / mutation / release, with a skeleton typecheck gate |
| 2 | blocker | accepted | `index.ts:54-58` and `ChatPane.tsx:24` import the types from the hook file. R2 |
| 3 | major | accepted | 26 functions, 21 refs measured. R4; estimate raised |
| 4 | major | accepted | 11 effects listed; structural rule R1(b) replaces the port-log experiment; transition tests R5 |
| 5 | major | accepted | `ctx` recipe removed. R3 + stale-callback test |

Accepted 5 · rebutted 0 · blockers left 0 (both resolved in the design; R1(c) is the executable check).
