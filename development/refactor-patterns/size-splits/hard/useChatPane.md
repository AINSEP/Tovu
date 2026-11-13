# Split plan: packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts (Jini)

## 1. Header
- Over: file **946** counted (1240 raw), limit 500. Function `useChatPane` **618** counted, limit 100. Every other declaration is under 100.
- Phase: **NOW.** The file already lives in Jini (`@jini-ai/chat`); the Tovu->Jini move takes nothing from it. The only survey mention (`u013-2.md` item 14) is the `'jini:release-check'` literal (L508), which has no shared constant yet. If the dedupe lane later adds one, it edits `useChatPaneReleaseCheck` in the new `useChatPaneTurnState.hooks.ts`. That does not block this split.
- Executor: Opus/Fable. Bodies move **byte-for-byte**. Each sub-hook destructures its inputs in its signature under the original local names, so the only edits are signatures, the call sites in `useChatPane` and the listed `return`/`sendBlocker` lines in `useChatPane`. Every `useCallback`/`useEffect`/`useMemo` dependency array stays text-identical. Do this file before or after `ChatPane.md`; they touch different files.
- Deviation from CONVENTIONS rule 3 (names): sibling hook files are named `useChatPane<Concern>.hooks.ts`, not `useChatPane.hooks-<job>.ts`. This folder has 11 hook files, each named that way (e.g. `useChatPaneWorkingDirectory.hooks.ts`). The one pure module is `chat-pane-queued-input.ts`, in kebab case like the folder's root-level helpers (`create-daemon-attachment-uploader.ts`). No new folder.
- Deviation from rule 2 (helpers stay in the same file): the file would still be about 1300 counted lines after the extraction, so the shared-state hooks and the send paths go to siblings (rule 2's ">500" clause). The sub-hooks only `useChatPane` uses stay in this file, directly above it.

## 2. Responsibility map

Unit keys. **P** = `useChatPane.hooks.ts` (stays). **Q** = `chat-pane-queued-input.ts`. **T** = `useChatPaneTurnState.hooks.ts`. **U** = `useChatPaneUploads.hooks.ts`. **N** = `useChatPaneNewTurn.hooks.ts`. **L** = `useChatPaneLiveDelivery.hooks.ts`. **R** = `useChatPaneSendRouting.hooks.ts`.

### Top-level declarations
| Decl (outline line) | Unit | Job |
|---|---|---|
| imports L1-50 | P (each sibling copies the subset it uses, §3) | |
| `UseChatPaneOptions` [export] L52 | P | public options type (index.ts re-exports it from this path; unchanged) |
| `UseChatPaneResult` [export] L92 | P | public result type (same) |
| `QueuedChatInput` L172-176 (+doc) | Q [export] | queued-message record |
| `unconsumedQueuedInputs` L178-192 (+doc) | Q [export] | hide inputs whose consumption receipt arrived |
| `recordConsumedInputs` L194 | Q (private) | collect a receipt's ids and aliases |
| `awaitingRunReceipts` L201-208 (+doc) | Q [export] | wait for the run's terminal status before a live copy flushes |
| `ATTACHMENTS_ONLY_PROMPT` L210-211 | R (private) | stand-in prompt |
| `composerPrompt` L213-221 | R (private) | the prompt a composer send carries |
| `isRepeatedComposerSubmission` L223-229 | R (private) | repeated-Enter guard |
| `composerDeliveryBlocked` L231-237 | R (private) | delivery/starting/repeat guard |
| `resolveRunContext` L239 | N (private) | host run context for a send |
| `assertPromptSendable` L245 | N (private) | throw for an empty or blocked prompt |
| `createChatLocalId` L253 | Q [export] | local ids (used by P, U, L, Q) |
| `deliverTypedAnswerSafely` L258-272 (+doc) | L (private) | throw-safe typed-answer delivery |
| `deliverMidRunMessageSafely` L274-288 (+doc) | L (private) | throw-safe mid-run delivery |
| `resolveChatPaneActivity` L290-300 | P (stays in place) | activity from agent + conversation |
| `waitingForLiveInput` L302-309 | R (private) | hold input for uploads or a human card |
| `findMidRunTarget` L311-328 | R (private) | mid-run delivery target |
| `findTypedAnswerTarget` L330-349 | R (private) | typed-answer target |
| `deliveredEveryStagedAttachment` L351-366 | U (private) | whether to rotate the batch after a delivery |
| `uploadAttachmentBatch` L368-402 | U (private) | one upload, gated by `stillWanted` |
| `useChatPane` [export] L404 | P | composition only (§2 statement map) |
| `resolvePaneSendBlocker` L1140-1154 | P (stays in place) | Send blocker |
| `turnFolders` L1156-1162 | N (private) | folders a send carries |
| `transportSecretRedaction` L1164-1167 | N (private) | transport redaction flag |
| `newQueuedInput` L1169-1176 | Q [export] | fresh queued input |
| `steerableMidRunTarget` L1178-1198 | R (private) | can a new turn steer into the run |
| `unansweredTypedAnswerTarget` L1200-1218 | R (private) | the question this send answers |
| `queuedMidRunTarget` L1220-1235 | R (private) | can a flushed queue steer |
| `attachQueuedInput` L1237 | Q [export] | add a late upload to its queued input |

### `useChatPane` statement groups (anchor = first line as the outline prints it)
| Anchor | -> sub-hook (unit) |
|---|---|
| L405 `const guard = useUserTextGuard(options);` | stays in `useChatPane` |
| L406 `[activeUploadCount, setActiveUploadCount]`, L407 `[attachmentError, …]`, L410-411 comment + `queuedUploadOwnersRef`, L431 `attachmentGenerationRef`, L432-437 comment + `[initialAttachmentBatchId]`, L438 `attachmentBatchIdRef`, L440 `activeUploadsRef` | `useChatPaneUploadState` (U) |
| L408-409 comment + `[storedQueuedInputs, setQueuedInputs]`, L412-413 comment + `queuedForLiveDeliveryRef`, L426-429 comment + `queuedConversationIdRef`, L495 `const queuedInputs = useMemo(`, L496-499 `const queuedTurn = useMemo(` | `useChatPaneQueuedInputs` (T) |
| L414 `submittedComposerRef`, L415 `startingPromptRef`, L416 `refusedSendRef` (inline type -> `RefusedComposerSend`), L417 `[typedAnswerNotice, …]`, L418-419 comment + `deliveringTypedAnswerRef`, L420-421 comment + `answeredQuestionIdRef`, L422-424 comment + `typedAnswerGenerationRef`, L430 `mountedRef` | `useChatPaneSendState` (T) |
| L425 `const typedAnswerConversationRef = useRef(options.conversationId);` + L592-598 `useEffect(() => { const previous = typedAnswerConversationRef.current;` | `useChatPaneTypedAnswerGeneration` (T) (the ref moves into the only hook that reads it) |
| L439 `const batchConversationIdRef = useRef(options.conversationId);` + L600-616 comment + `useEffect(() => { const previousConversationId` | `useChatPaneBatchOnConversationSwitch` (U) (the ref moves into the only hook that reads it) |
| L441-443 `[internalSelection, setInternalSelection]`, L450 `requestedSelection`, L451-454 `resolvedSelection`, L455-461 comment + `selection`, L462 `selectedAgent` | `useChatPaneSelection` (P) |
| L444-449 `const workingDirectoryState = useChatPaneWorkingDirectory(` | stays in `useChatPane` |
| L463-473 `const conversation = useConversation(` + L474-481 `useEffect(() => options.subscribeToSurfaces?.(` | `useChatPaneConversation` (P) |
| L482-491 `const composer = useComposer(definedProps(` | argument -> pure `chatPaneComposerOptions` (P); the `useComposer(...)` call stays |
| L493 `const activity …` | stays |
| L500-501 `releaseStateRef` + L502-511 `useEffect(() => { if (typeof window` | `useChatPaneReleaseCheck` (T) |
| L512-515 comment + `useEffect(() => { if (queuedInputs.length !== storedQueuedInputs.length)` | `useDropConsumedQueuedInputs` (T) |
| L517-519 `useEffect(() => { options.onActivityChange` + L521-523 `useEffect(() => { options.onMessagesChange` | `useChatPaneHostNotifications` (P) |
| L525-533 `useEffect(() => { mountedRef.current = true;` | `useChatPaneUnmountCleanup` (U) |
| L535 `selectionControlled`, L536 `setComposerAgent`, L537-555 `useEffect(() => { if (!selection.agentId)`, L557-562 `const setSelection = useCallback(` | `useChatPaneSelectionSync` (P) |
| L564-572 `const sendBlocker = resolvePaneSendBlocker({` | stays (one edit: `activeUploadCount,` -> `activeUploadCount: uploads.activeUploadCount,`) |
| L573 `const canSend …` | stays |
| L574-582 comment + the four `latest*Ref` pairs | `useChatPaneDraftMirror` (T) |
| L584-590 comment + `attachmentCountRef` + `useEffect(() => { if (composer.attachments.length <` | `useClearAttachmentErrorOnRemoval` (U) |
| L618-659 `const addAttachments`, L683-689 comment + `consumeDeliveredAttachments`, L1024-1033 comment + `discardQueuedUploads` | `useChatPaneAttachmentActions` (U) |
| L661-681 comment + `const recordAcceptedInput` | `useRecordAcceptedInput` (T) |
| L691-702 comment + `restoreQueuedDraft`, L704-714 comment + `restoreRefusedDraft`, L850-854 `clearDeliveredDraft` | `useChatPaneDraftMirror` (T) |
| L716-739 `const finishPromptSend` | `useFinishPromptSend` (N) |
| L741-776 comment + `sendGuardedPrompt`, L778-780 `sendPrompt`, L782-801 comment + `sendComposerPrompt` | `useChatPanePromptSend` (N) |
| L803-821 comment + `enqueueTurn`, L1035-1041 `cancelQueued`, L1043-1047 `cancelQueuedMessage` | `useChatPaneQueueActions` (N) |
| L823-848 `const answerWaitingQuestion` | `useChatPaneTypedAnswer` (L) |
| L856-878 comment + `retainAcceptedMidRunInput`, L880-899 `finishMidRunSend`, L901-924 comment + `sendIntoRunningTurn` | `useChatPaneMidRunSend` (L) |
| L926-966 comment + `sendOrdinaryTurn` | `useChatPaneOrdinaryTurn` (R) |
| L968-1000 `send`, L1002-1010 `retrySend`, L1012-1018 `sendAsNewMessage`, L1020-1022 comment + `interruptSend` | `useChatPaneSendActions` (R) |
| L1049-1082 comment + `useEffect(() => { if (queuedTurn === null)` | `useChatPaneQueueFlush` (R) |
| L1084-1106 `const reset = useCallback(` | `useChatPaneReset` (P) |
| L1108-1137 `return {` | stays (field edits listed in §3 P) |

## 3. Target layout

Import graph (arrow = imports). No cycles, and no sibling imports P:
`Q` <- `T` <- `U` <- `N` <- `L` <- `R` <- `P`. Each module imports only modules to its left (T imports Q; U imports Q,T; N imports Q,T,U; L imports Q,T,U,N; R imports Q,T,U,N,L; P imports Q,T,U,R). Siblings cannot import `UseChatPaneOptions` (that would be a cycle), so T declares the structural `ChatPaneSendOptions`. P passes its own `options` object, and that works because the field declarations are copied exactly.

Types every module uses in an exported signature are exported (`declaration: true` emit). Type-only imports use `import type` (`verbatimModuleSyntax`). `UserTextGuard` = `ReturnType<typeof useUserTextGuard>`, via `import type { useUserTextGuard }`.

### Q — `hooks/chat-pane-queued-input.ts` (pure; ~40 counted)
Job: the queued-input record, its local ids, and the pure transforms over it.
- Exports: `type QueuedChatInput`, `createChatLocalId`, `unconsumedQueuedInputs`, `awaitingRunReceipts`, `newQueuedInput`, `attachQueuedInput`. `recordConsumedInputs` stays private.
- Imports: `acceptedInputEvent, projectAcceptedInputEvents, type AcceptedChatInput` from `'../../../../core/accepted-input.js'`; `type UserTextRedaction` from `'../../../../core/user-text-redaction.js'`; `type ChatAttachment, ChatMessage` from `'@jini-ai/chat'` (same specifier as the original).
- Signatures unchanged (moved verbatim).

### T — `hooks/useChatPaneTurnState.hooks.ts` (~165 counted)
Job: the turn state the send paths coordinate through. That is the send locks, the queued inputs, the composer draft mirrors and accepted-input recording, plus the effects that keep them current (release check, dropping consumed queue entries, typed-answer generation).
- Exports (types): `UserTextGuard`, `ChatPaneSendOptions` (interface with `conversationId?: string | null; uploadAttachments?: (files: File[], options?: ChatPaneAttachmentUploadOptions) => Promise<ChatAttachment[]>; runContext?: ChatPaneRunContext; onActivityChange?: (activity: ChatPaneActivity) => void; deliverTypedAnswer?: DeliverTypedAnswer; deliverMidRunMessage?: DeliverMidRunMessage;`, declared exactly as in `UseChatPaneOptions` with no `| undefined` added), `RefusedComposerSend` (= the L416 inline object type), `ChatPaneSendState`, `ChatPaneQueuedInputs`, `ChatPaneDraftMirror`, `RecordAcceptedInput`. Each is `ReturnType<typeof useX>` of its hook.
- Exports (hooks):
  - `useChatPaneSendState()` -> `{ submittedComposerRef, startingPromptRef, refusedSendRef, typedAnswerNotice, setTypedAnswerNotice, deliveringTypedAnswerRef, answeredQuestionIdRef, typedAnswerGenerationRef, mountedRef }`. No input, no effects. Statements L414-424, L430.
  - `useChatPaneReleaseCheck({ conversation, queuedInputs, activeUploadsRef, sendState: { startingPromptRef, deliveringTypedAnswerRef } }: UseChatPaneReleaseCheckInput): void`. Input type `{ conversation: Pick<UseConversationResult, 'isStreaming'>; queuedInputs: readonly QueuedChatInput[]; activeUploadsRef: RefObject<Set<AbortController>>; sendState: Pick<ChatPaneSendState, 'startingPromptRef' | 'deliveringTypedAnswerRef'> }`. Statements L500-511 verbatim. **Effect E2.**
  - `useChatPaneTypedAnswerGeneration({ options, sendState: { typedAnswerGenerationRef } }: { options: Pick<ChatPaneSendOptions, 'conversationId'>; sendState: Pick<ChatPaneSendState, 'typedAnswerGenerationRef'> }): void`. Statements L425, L592-598. **Effect E9.**
  - `useChatPaneQueuedInputs({ conversation }: { conversation: Pick<UseConversationResult, 'messages'> })` -> `{ storedQueuedInputs, setQueuedInputs, queuedForLiveDeliveryRef, queuedConversationIdRef, queuedInputs, queuedTurn }`. Statements L408-409, L412-413, L426-429, L495-499. No effects.
  - `useDropConsumedQueuedInputs({ queue: { queuedInputs, storedQueuedInputs, setQueuedInputs } }: { queue: Pick<ChatPaneQueuedInputs, 'queuedInputs' | 'storedQueuedInputs' | 'setQueuedInputs'> }): void`. Statements L512-515. **Effect E3.**
  - `useChatPaneDraftMirror({ composer, sendState: { refusedSendRef } }: { composer: UseComposerResult; sendState: Pick<ChatPaneSendState, 'refusedSendRef'> })` -> `{ latestComposerRef, latestDraftRef, latestFoldersRef, latestAttachmentsRef, restoreQueuedDraft, restoreRefusedDraft, clearDeliveredDraft }`. Statements L574-582 (render-time `.current =` assignments stay unconditional at the hook's top level), L691-702, L704-714, L850-854. No effects.
  - `useRecordAcceptedInput({ composer, conversation, sendState: { submittedComposerRef } }: { composer: UseComposerResult; conversation: Pick<UseConversationResult, 'setMessages'>; sendState: Pick<ChatPaneSendState, 'submittedComposerRef'> })` -> `recordAcceptedInput`. Statements L661-681 verbatim (deps `[composer, conversation.setMessages]`).
- Imports: react `useCallback, useEffect, useMemo, useRef, useState, type RefObject`; `acceptedInputUserEvent, projectAcceptedInputEvents, type AcceptedChatInput` (core/accepted-input); `type UserTextRedaction`; `import type { useUserTextGuard }`; `appendQueuedTurn` from `'../rules.js'`; types from `'../types.js'` (`ChatPaneActivity, ChatPaneAttachmentUploadOptions, ChatPaneRunContext, DeliverMidRunMessage, DeliverTypedAnswer, TypedAnswerNotice`); `type ChatAttachment` from `'@jini-ai/chat'`; `type UseComposerResult`; `type UseConversationResult`; Q `type QueuedChatInput, unconsumedQueuedInputs`.

### U — `hooks/useChatPaneUploads.hooks.ts` (~165 counted)
Job: attachment uploads. That is their state, the lifecycle effects, and the upload, consume and discard actions.
- Private: `deliveredEveryStagedAttachment`, `uploadAttachmentBatch` (verbatim, with docs), placed above `useChatPaneAttachmentActions`.
- Exports: types `ChatPaneUploadState`, `ChatPaneAttachmentActions` (ReturnType). Hooks:
  - `useChatPaneUploadState({ options }: { options: Pick<ChatPaneSendOptions, 'conversationId'> })` -> `{ activeUploadCount, setActiveUploadCount, attachmentError, setAttachmentError, queuedUploadOwnersRef, attachmentGenerationRef, attachmentBatchIdRef, activeUploadsRef }`. Statements L406-407, L410-411, L431-438, L440. No effects.
  - `useChatPaneUnmountCleanup({ sendState: { mountedRef }, uploads: { attachmentGenerationRef, activeUploadsRef } }: { sendState: Pick<ChatPaneSendState, 'mountedRef'>; uploads: Pick<ChatPaneUploadState, 'attachmentGenerationRef' | 'activeUploadsRef'> }): void`. Statements L525-533. **Effect E6.**
  - `useClearAttachmentErrorOnRemoval({ composer, uploads: { setAttachmentError } }: { composer: Pick<UseComposerResult, 'attachments'>; uploads: Pick<ChatPaneUploadState, 'setAttachmentError'> }): void`. Statements L584-590. **Effect E8.**
  - `useChatPaneBatchOnConversationSwitch({ options, uploads: { attachmentBatchIdRef } }: { options: Pick<ChatPaneSendOptions, 'conversationId'>; uploads: Pick<ChatPaneUploadState, 'attachmentBatchIdRef'> }): void`. Statements L439, L600-616. **Effect E10.**
  - `useChatPaneAttachmentActions({ options, composer, uploads: { attachmentGenerationRef, attachmentBatchIdRef, activeUploadsRef, setActiveUploadCount, setAttachmentError, queuedUploadOwnersRef }, sendState: { submittedComposerRef, mountedRef }, draft: { latestComposerRef, latestAttachmentsRef }, queue: { setQueuedInputs } }: UseChatPaneAttachmentActionsInput)` -> `{ addAttachments, consumeDeliveredAttachments, discardQueuedUploads }`. Input fields: `options: Pick<ChatPaneSendOptions, 'conversationId' | 'uploadAttachments'>`; `composer: UseComposerResult`; the other groups use `Pick<…>` of exactly the destructured names. Statements L618-659, L683-689, L1024-1033 verbatim. No effects.
- Imports: react `useCallback, useEffect, useRef, useState`; `cacheAttachmentPreviewSource` (`'../../../hooks/attachment-preview-cache.js'`); `readCachedAttachmentBatchId, writeCachedAttachmentBatchId` (`'../../../hooks/composer-draft-cache.js'`); `type ChatAttachment`; `type ChatPaneAttachmentUploadOptions`; `type UseComposerResult`; Q `createChatLocalId, attachQueuedInput`; T types `ChatPaneSendOptions, ChatPaneSendState, ChatPaneDraftMirror, ChatPaneQueuedInputs`.

### N — `hooks/useChatPaneNewTurn.hooks.ts` (~180 counted)
Job: starting a new turn (guarded prompt send and its settle step) and queueing or cancelling turns behind a run.
- Private: `resolveRunContext`, `assertPromptSendable`, `turnFolders`, `transportSecretRedaction` (verbatim), above the hook that uses them.
- Exports: types `ChatPanePromptSend`, `ChatPaneQueueActions` (ReturnType). Hooks:
  - `useFinishPromptSend({ sendState: { refusedSendRef }, draft: { restoreQueuedDraft, restoreRefusedDraft, latestDraftRef, latestComposerRef }, attachments: { consumeDeliveredAttachments } })` -> `finishPromptSend`. Statements L716-739 verbatim.
  - `useChatPanePromptSend({ options, guard, conversation, composer, selection, workingDirectoryState, sendBlocker, sendState: { startingPromptRef, typedAnswerGenerationRef, mountedRef }, draft: { latestDraftRef, latestAttachmentsRef, latestFoldersRef, latestComposerRef, restoreRefusedDraft }, recordAcceptedInput, finishPromptSend })` -> `{ sendGuardedPrompt, sendPrompt, sendComposerPrompt }`. Field types: `options: Pick<ChatPaneSendOptions, 'runContext' | 'onActivityChange'>`; `guard: Pick<UserTextGuard, 'redact'>`; `conversation: UseConversationResult`; `composer: UseComposerResult`; `selection: ChatPaneAgentSelection`; `workingDirectoryState: Pick<UseChatPaneWorkingDirectoryResult, 'workingDirectory'>`; `sendBlocker: ChatPaneSendBlocker | null`; `recordAcceptedInput: RecordAcceptedInput`; `finishPromptSend: ReturnType<typeof useFinishPromptSend>`. Statements L741-801 verbatim.
  - `useChatPaneQueueActions({ options, composer, uploads: { activeUploadsRef, queuedUploadOwnersRef }, sendState: { submittedComposerRef }, queue: { queuedConversationIdRef, queuedForLiveDeliveryRef, setQueuedInputs }, draft: { latestComposerRef }, recordAcceptedInput, attachments: { discardQueuedUploads } })` -> `{ enqueueTurn, cancelQueued, cancelQueuedMessage }`. `options: Pick<ChatPaneSendOptions, 'conversationId'>`. Statements L803-821, L1035-1047 verbatim.
- Imports: react `useCallback`; `type AcceptedChatInput`; `type UserTextRedaction`; `describeChatPaneSendBlocker, type ChatPaneSendBlocker` (`'../rules.js'`); types `ChatPaneAgentSelection, ChatPaneRunContext, ChatPaneRunContextInput`; `type ChatAttachment, RunContext` (`'@jini-ai/chat'`); `definedProps`; `type UseComposerResult`; `type UseConversationResult`; `type UseChatPaneWorkingDirectoryResult` (`'./useChatPaneWorkingDirectory.hooks.js'`); Q `newQueuedInput, type QueuedChatInput`; T types; U `type ChatPaneUploadState, ChatPaneAttachmentActions`.

### L — `hooks/useChatPaneLiveDelivery.hooks.ts` (~140 counted)
Job: delivering into a live run, either a typed answer to its open question or a mid-run message.
- Private: `deliverTypedAnswerSafely`, `deliverMidRunMessageSafely` (verbatim with docs).
- Exports hooks:
  - `useChatPaneTypedAnswer({ guard, sendState: { typedAnswerGenerationRef, deliveringTypedAnswerRef, mountedRef, setTypedAnswerNotice, answeredQuestionIdRef }, draft: { latestDraftRef, latestComposerRef }, recordAcceptedInput, queueActions: { enqueueTurn } })` -> `answerWaitingQuestion`. `guard: Pick<UserTextGuard, 'redact' | 'redactText'>`. Statements L823-848 verbatim.
  - `useChatPaneMidRunSend({ options, composer, conversation, sendState: { typedAnswerGenerationRef, deliveringTypedAnswerRef, mountedRef, setTypedAnswerNotice }, queue: { queuedConversationIdRef, setQueuedInputs }, draft: { latestDraftRef, latestComposerRef, restoreQueuedDraft, clearDeliveredDraft }, recordAcceptedInput, attachments: { consumeDeliveredAttachments }, queueActions: { enqueueTurn } })` -> `sendIntoRunningTurn`. `options: Pick<ChatPaneSendOptions, 'conversationId'>`. Statements L856-924 (retain, finishMidRunSend, sendIntoRunningTurn; the last two stay local consts inside the hook) verbatim. About 78 counted lines.
- Imports: react `useCallback`; `acceptedInputEvent, projectAcceptedInputEvents, type AcceptedChatInput`; `type UserTextRedaction`; types `DeliverMidRunMessage, DeliverTypedAnswer, MidRunMessageDelivery, TypedAnswerDelivery`; `type ChatAttachment`; `type UseComposerResult`; `type UseConversationResult`; Q `createChatLocalId, type QueuedChatInput`; T types; U `type ChatPaneAttachmentActions`; N `type ChatPaneQueueActions`.

### R — `hooks/useChatPaneSendRouting.hooks.ts` (~320 counted)
Job: routing a send. It decides between steer, typed answer, queue and new run, owns the Send/Retry/send-as-new actions, and flushes the queue. It also composes all the send paths.
- Private pure (verbatim, ordered above their users): `waitingForLiveInput`, `findMidRunTarget`, `steerableMidRunTarget` (above `useChatPaneOrdinaryTurn`); `ATTACHMENTS_ONLY_PROMPT`, `composerPrompt`, `isRepeatedComposerSubmission`, `composerDeliveryBlocked`, `findTypedAnswerTarget`, `unansweredTypedAnswerTarget` (above `useChatPaneSendActions`); `queuedMidRunTarget` (above `useChatPaneQueueFlush`). The two `find*Target` helpers move together with their first user. Keep each helper's doc comment.
- Private hooks:
  - `useChatPaneOrdinaryTurn({ options, guard, conversation, composer, sendBlocker, canSend, uploads: { activeUploadsRef, attachmentError }, queue: { queuedForLiveDeliveryRef, queuedTurn, queuedInputs }, sendComposerPrompt, sendIntoRunningTurn, enqueueTurn })` -> `sendOrdinaryTurn`. `options: Pick<ChatPaneSendOptions, 'deliverMidRunMessage'>`. Statements L926-966.
  - `useChatPaneSendActions({ options, guard, conversation, composer, sendBlocker, uploads: { activeUploadsRef }, sendState: { deliveringTypedAnswerRef, startingPromptRef, submittedComposerRef, setTypedAnswerNotice, answeredQuestionIdRef, refusedSendRef }, draft: { latestDraftRef }, sendOrdinaryTurn, answerWaitingQuestion, sendGuardedPrompt })` -> `{ send, retrySend, sendAsNewMessage, interruptSend }`. `options: Pick<ChatPaneSendOptions, 'deliverTypedAnswer'>`. Statements L968-1022.
  - `useChatPaneQueueFlush({ options, conversation, sendBlocker, uploads: { activeUploadCount, attachmentError }, queue: { queuedTurn, queuedInputs, queuedForLiveDeliveryRef, queuedConversationIdRef, setQueuedInputs }, cancelQueued, sendIntoRunningTurn, sendGuardedPrompt }): void`. `options: Pick<ChatPaneSendOptions, 'conversationId' | 'deliverMidRunMessage'>`. Statements L1049-1082. **Effect E11.**
- Exports: `type ChatPaneSendPaths`, and the composite
  `useChatPaneSendPaths({ options, guard, conversation, composer, selection, workingDirectoryState, sendBlocker, canSend, uploads, sendState, queue, draft, attachments }: UseChatPaneSendPathsInput): ChatPaneSendPaths`
  with input `{ options: ChatPaneSendOptions; guard: UserTextGuard; conversation: UseConversationResult; composer: UseComposerResult; selection: ChatPaneAgentSelection; workingDirectoryState: Pick<UseChatPaneWorkingDirectoryResult, 'workingDirectory'>; sendBlocker: ChatPaneSendBlocker | null; canSend: boolean; uploads: ChatPaneUploadState; sendState: ChatPaneSendState; queue: ChatPaneQueuedInputs; draft: ChatPaneDraftMirror; attachments: ChatPaneAttachmentActions }`. The children use `Pick`s of exactly what they read; the composite forwards whole groups. Body, in this exact order: `recordAcceptedInput = useRecordAcceptedInput({ composer, conversation, sendState })`; `finishPromptSend = useFinishPromptSend(…)`; `{ sendGuardedPrompt, sendPrompt, sendComposerPrompt } = useChatPanePromptSend(…)`; `queueActions = useChatPaneQueueActions(…)`; `answerWaitingQuestion = useChatPaneTypedAnswer(…)`; `sendIntoRunningTurn = useChatPaneMidRunSend(…)`; `sendOrdinaryTurn = useChatPaneOrdinaryTurn(…)`; `sendActions = useChatPaneSendActions(…)`; `useChatPaneQueueFlush(…)` (**last statement before return**); then `return { sendPrompt, ...sendActions, cancelQueued: queueActions.cancelQueued, cancelQueuedMessage: queueActions.cancelQueuedMessage }`. About 48 counted lines.
- Imports: react `useCallback, useEffect`; `isAwaitingAnswer` (`'../../../../core/run-activity.js'`); `findAwaitedTypedAnswerId, findMidRunMessageRunId, isChatPaneQueueableBlocker, type ChatPaneSendBlocker`; types `ChatPaneAgentSelection, DeliverMidRunMessage, DeliverTypedAnswer`; `type ChatMessage`; `type UseComposerResult`; `type UseConversationResult`; `type UseChatPaneWorkingDirectoryResult`; Q `awaitingRunReceipts, type QueuedChatInput`; T `useRecordAcceptedInput` + types; U types; N `useFinishPromptSend, useChatPanePromptSend, useChatPaneQueueActions`; L `useChatPaneTypedAnswer, useChatPaneMidRunSend`.

### P — `hooks/useChatPane.hooks.ts` after (~320 counted)
Keeps `UseChatPaneOptions`, `UseChatPaneResult` (both exports unchanged, so no re-export is needed and `index.ts` / `useChatPaneAgentControl.hooks.ts` are untouched), `resolveChatPaneActivity`, `resolvePaneSendBlocker`. New in-file sub-hooks, directly above `useChatPane` in run order:
- `useChatPaneSelection({ options }: { options: Pick<UseChatPaneOptions, 'agents' | 'selection' | 'initialSelection'> })` -> `{ requestedSelection, selection, selectedAgent, setInternalSelection }`. Statements L441-443, L450-462 verbatim. Memos only.
- `useChatPaneConversation({ options, guard, selection }: { options: Pick<UseChatPaneOptions, 'transport' | 'redactUserText' | 'initialMessages' | 'refreshSignal' | 'conversationId' | 'subscribeToSurfaces'>; guard: Pick<ReturnType<typeof useUserTextGuard>, 'notifyRedaction'>; selection: Pick<ChatPaneAgentSelection, 'agentId'> })` -> `conversation`. Statements L463-481 verbatim (`useConversation` then **E1**).
- `chatPaneComposerOptions({ options, conversation, selection }: { options: Pick<UseChatPaneOptions, 'initialDraft' | 'composerHistoryScope' | 'composerHistoryStorage' | 'composerHistoryCap' | 'conversationId' | 'validateAttachments'>; conversation: Pick<UseConversationResult, 'messages'>; selection: ChatPaneAgentSelection })` returns the `definedProps({ source: {…} })` expression of L482-491 verbatim (pure).
- `useChatPaneHostNotifications({ options, activity, conversation }: { options: Pick<UseChatPaneOptions, 'onActivityChange' | 'onMessagesChange'>; activity: ChatPaneActivity; conversation: Pick<UseConversationResult, 'messages'> }): void`. Statements L517-523. **E4, E5.**
- `useChatPaneSelectionSync({ options, composer, selection, requestedSelection, setInternalSelection }: { options: Pick<UseChatPaneOptions, 'agents' | 'selection' | 'onSelectionChange'>; composer: UseComposerResult; selection: SelectionState['selection']; requestedSelection: ChatPaneAgentSelection; setInternalSelection: SelectionState['setInternalSelection'] })` -> `setSelection`. Here `SelectionState = ReturnType<typeof useChatPaneSelection>` (same file). Statements L535-562 verbatim. **E7.**
- `useChatPaneReset({ options, guard, conversation, composer, uploads: {…6 names}, sendState: {submittedComposerRef, setTypedAnswerNotice, typedAnswerGenerationRef, refusedSendRef}, queue: {queuedConversationIdRef, queuedForLiveDeliveryRef, setQueuedInputs} })` -> `reset`. `options: Pick<UseChatPaneOptions, 'initialMessages'>`. The uploads names are `attachmentGenerationRef, attachmentBatchIdRef, activeUploadsRef, setActiveUploadCount, setAttachmentError, queuedUploadOwnersRef`. Statements L1084-1106 verbatim.
- Final `useChatPane` body (~75 counted lines), in this exact order:
  ```
  guard = useUserTextGuard(options)
  uploads = useChatPaneUploadState({ options })
  sendState = useChatPaneSendState()
  workingDirectoryState = useChatPaneWorkingDirectory(definedProps(…))      // L444-449 verbatim
  { requestedSelection, selection, selectedAgent, setInternalSelection } = useChatPaneSelection({ options })
  conversation = useChatPaneConversation({ options, guard, selection })   // nested effects, then E1
  composer = useComposer(chatPaneComposerOptions({ options, conversation, selection }))
  activity = resolveChatPaneActivity(selectedAgent, conversation)          // L493 verbatim
  queue = useChatPaneQueuedInputs({ conversation })
  useChatPaneReleaseCheck({ conversation, queuedInputs: queue.queuedInputs, activeUploadsRef: uploads.activeUploadsRef, sendState })  // E2
  useDropConsumedQueuedInputs({ queue })                                   // E3
  useChatPaneHostNotifications({ options, activity, conversation })        // E4, E5
  useChatPaneUnmountCleanup({ sendState, uploads })                        // E6
  setSelection = useChatPaneSelectionSync({ options, composer, selection, requestedSelection, setInternalSelection })  // E7
  sendBlocker = resolvePaneSendBlocker(…)    // L564-572; only edit: `activeUploadCount: uploads.activeUploadCount,`
  canSend = …                                // L573 verbatim
  draft = useChatPaneDraftMirror({ composer, sendState })
  useClearAttachmentErrorOnRemoval({ composer, uploads })                  // E8
  useChatPaneTypedAnswerGeneration({ options, sendState })                 // E9
  useChatPaneBatchOnConversationSwitch({ options, uploads })               // E10
  attachments = useChatPaneAttachmentActions({ options, composer, uploads, sendState, draft, queue })
  sendPaths = useChatPaneSendPaths({ options, guard, conversation, composer, selection, workingDirectoryState, sendBlocker, canSend, uploads, sendState, queue, draft, attachments })  // E11 inside, last
  reset = useChatPaneReset({ options, guard, conversation, composer, uploads, sendState, queue })
  return { … }   // L1108-1137, key order unchanged; value edits only:
     isUploadingAttachments: uploads.activeUploadCount > 0, attachmentError: uploads.attachmentError,
     addAttachments: attachments.addAttachments, send/sendPrompt/retrySend/sendAsNewMessage/interruptSend/
     cancelQueued/cancelQueuedMessage: sendPaths.<same>, queuedPrompt: queue.queuedTurn?.text ?? null,
     queuedMessages: queue.queuedInputs.filter(…) (comment kept), typedAnswerNotice: sendState.typedAnswerNotice
  ```
- P imports: drop the names that moved (rules: keep `findChatPaneSendBlocker, resolveChatPaneSelection, type ChatPaneSendability, type ChatPaneSendBlocker`; core: keep only `type AcceptedChatInput`, `type UserTextRedactionOptions`); add Q `createChatLocalId`, T/U hooks, R `useChatPaneSendPaths`. Keep the `type` imports the public interfaces need.

### Effect order (how it is kept)
React runs the passive effects of one component in call order, and nested custom hooks are flattened into that order. Unmount cleanups follow the same order. The original order is: [useUserTextGuard, useChatPaneWorkingDirectory, useConversation internals] -> E1 surfaces (L474) -> [useComposer internals] -> E2 release check (L502) -> E3 drop consumed (L513) -> E4 activity (L517) -> E5 messages (L521) -> E6 unmount (L525) -> E7 selection sync (L537) -> E8 attachment-count (L587) -> E9 typed-answer generation (L592) -> E10 batch switch (L605) -> E11 queue flush (L1051). The final `useChatPane` calls its sub-hooks in exactly that sequence (comments in the body above). Sub-hooks that have no effects (`useChatPaneUploadState`, `useChatPaneSendState`, `useChatPaneSelection`, `useChatPaneQueuedInputs`, `useChatPaneDraftMirror`, `useChatPaneAttachmentActions`, `useChatPaneReset`) can sit anywhere their data allows. Inside `useChatPaneSendPaths`, the flush is the only effect and it is the last call. Two ordering-neutral moves, called out for the reviewer:
1. `useState`/`useRef` slots move. For example, `internalSelection` is now created after `useChatPaneWorkingDirectory`, and the queue state after `useComposer`. Slot order has no observable effect.
2. `typedAnswerConversationRef` and `batchConversationIdRef` are now created inside E9's and E10's hooks. `useRef(init)` reads `options.conversationId` only on the first render, so the value is the same.
The `[initialAttachmentBatchId]` lazy `useState` (a cache read) still runs after `useUserTextGuard` and before `useChatPaneWorkingDirectory`, as before.

## 4. Steps (each a commit: `git add -- <paths> && git commit -F msg -- <paths>`, message `refactor(chat): split useChatPane by responsibility (size, step Un)`)
Paths are relative to `packages/chat`. Test command: `pnpm --filter @jini-ai/chat exec vitest run <file> --maxWorkers=2`, one file at a time. Then `pnpm --filter @jini-ai/chat run typecheck`. No `vi.mock`/`mock.module` exists in any test of this file (checked with rg). No importer outside this file uses a moved name, because every moved declaration was private. Importers of the file (`index.ts`, `useChatPaneAgentControl.hooks.ts`, `ChatPane.tsx`, 8 tests) keep importing `useChatPane`/`UseChatPaneOptions`/`UseChatPaneResult` from the same path and do not change.

Bridging rule for U3-U6. When a group hook replaces inline locals that later inline code still uses, add one bridge line right after the call, e.g. `const { submittedComposerRef, … } = sendState;`, listing only the names the remaining inline code reads. That way the untouched inline code compiles unchanged. U7 deletes every bridge.

- **U1 — Q.** Create `hooks/chat-pane-queued-input.ts` with the 7 declarations (§3 Q). P imports them. Tests: `src/react/features/chat-pane/__tests__/hooks/useChatPane.test.tsx`, `…/hooks/useChatPane.mid-run.test.tsx`, typecheck. Expected: P ≈ 905, `useChatPane` 618.
- **U2 — in-file sub-hooks.** Add `useChatPaneSelection`, `useChatPaneConversation`, `chatPaneComposerOptions`, `useChatPaneHostNotifications`, `useChatPaneSelectionSync` above `useChatPane`. Replace their statements with calls at the positions of the statements they replace. The selection call goes right after the `useChatPaneWorkingDirectory` call (where L450 was; it has no effects, so moving L441's `useState` there is neutral). The conversation call goes at L463, the composer at L482, the notifications at L517 and the selection sync at L535. Tests: `…/hooks/useChatPane.test.tsx`, `…/hooks/useChatPane.surfaces.test.tsx`, `…/hooks/useChatPane.refresh.test.tsx`, `…/hooks/useChatPaneAgentControl.test.tsx`, typecheck. Expected: P ≈ 930, `useChatPane` ≈ 545.
- **U3 — T.** Create `useChatPaneTurnState.hooks.ts` (all 7 hooks + types). In P, call `useChatPaneSendState()` at L414's position, `useChatPaneQueuedInputs` at L495, `useChatPaneReleaseCheck` at L500, `useDropConsumedQueuedInputs` at L513, `useChatPaneDraftMirror` at L575, `useChatPaneTypedAnswerGeneration` at L592 and `useRecordAcceptedInput` at L662, each with bridges. `activeUploadsRef` is still an inline local here and is passed as is. Tests: `…/hooks/useChatPane.release-check.test.tsx`, `…/hooks/useChatPane.test.tsx`, `…/hooks/useChatPane.mid-run.test.tsx`, `src/react/hooks/__tests__/secret-redaction.test.tsx`, typecheck. Expected: P ≈ 800, `useChatPane` ≈ 455.
- **U4 — U.** Create `useChatPaneUploads.hooks.ts`. In P, call `useChatPaneUploadState` at L406, `useChatPaneUnmountCleanup` at L525, `useClearAttachmentErrorOnRemoval` at L586, `useChatPaneBatchOnConversationSwitch` at L605 and `useChatPaneAttachmentActions` at L618 (its result bridges `addAttachments, consumeDeliveredAttachments, discardQueuedUploads`). Tests: `…/hooks/useChatPane.test.tsx`, `…/hooks/useChatPane.cov-j2.test.tsx`, typecheck. Expected: P ≈ 690, `useChatPane` ≈ 380.
- **U5 — N.** Create `useChatPaneNewTurn.hooks.ts`. In P, call `useFinishPromptSend` + `useChatPanePromptSend` at L716 and `useChatPaneQueueActions` at L805, with bridges. `recordAcceptedInput` is still the U3 parent call; U7 moves it into the composite. Tests: `…/hooks/useChatPane.test.tsx`, `…/hooks/useChatPane.cov-j2.test.tsx`, `src/react/hooks/__tests__/secret-redaction.test.tsx`, typecheck. Expected: P ≈ 600, `useChatPane` ≈ 290.
- **U6 — L.** Create `useChatPaneLiveDelivery.hooks.ts`. In P, call `useChatPaneTypedAnswer` at L823 and `useChatPaneMidRunSend` at L856. Tests: `…/hooks/useChatPane.mid-run.test.tsx`, `…/hooks/useChatPane.test.tsx`, typecheck. Expected: P ≈ 540, `useChatPane` ≈ 215.
- **U7 — R + finish.** Create `useChatPaneSendRouting.hooks.ts` with the private hooks and `useChatPaneSendPaths`. In P, replace every send-path call and the inline L926-1082 with the one `useChatPaneSendPaths` call. Add `useChatPaneReset` and remove all bridges. Write the final `return` (§3 P) and prune P's imports. Tests: all 8 hook-level files, which are `…/hooks/useChatPane.test.tsx`, `…/hooks/useChatPane.cov-j2.test.tsx`, `…/hooks/useChatPane.mid-run.test.tsx`, `…/hooks/useChatPane.refresh.test.tsx`, `…/hooks/useChatPane.release-check.test.tsx`, `…/hooks/useChatPane.surfaces.test.tsx`, `…/hooks/useChatPaneAgentControl.test.tsx` and `src/react/hooks/__tests__/secret-redaction.test.tsx`. Then `src/react/features/chat-pane/__tests__/components/ChatPane.test.tsx`, `…/components/ChatPane.cov-j2.test.tsx`, `src/react/components/__tests__/mid-run-transcript.test.tsx`, `src/react/features/chat-pane/__tests__/index.test.ts` and typecheck. Then the R10 surface check from the Jini root, `node --import tsx ./scripts/check-chatpane-public-surface.ts` (if it does not run standalone, use `pnpm guard:drift`), plus `npx eslint <7 files>` and `node <TOVU>/development/refactor-patterns/size-splits/outline.mjs --root <jini root> --check <7 files>`. Expected: §5.

## 5. After (counted, estimates; the outline `--check` is the gate)
| File | Lines | Largest function |
|---|---|---|
| `useChatPane.hooks.ts` | ~320 | `useChatPane` ~75 |
| `chat-pane-queued-input.ts` | ~40 | `unconsumedQueuedInputs` 11 |
| `useChatPaneTurnState.hooks.ts` | ~165 | `useChatPaneDraftMirror` ~40 |
| `useChatPaneUploads.hooks.ts` | ~165 | `useChatPaneAttachmentActions` ~65 |
| `useChatPaneNewTurn.hooks.ts` | ~180 | `useChatPanePromptSend` ~68 |
| `useChatPaneLiveDelivery.hooks.ts` | ~140 | `useChatPaneMidRunSend` ~78 |
| `useChatPaneSendRouting.hooks.ts` | ~320 | `useChatPaneSendActions` ~62 |
The total grows from 946 to about 1330, because of explicit input types and signatures. There are no owner-exception candidates.

## 6. Risks
- **Mocks:** none. `rg "vi\.mock\(|mock\.module\(|jest\.mock\("` over `features/chat-pane/__tests__`, `react/hooks/__tests__`, `react/components/__tests__` and `react/__tests__/folder-chips.test.tsx` finds no hits. `embed-widget/react/__tests__/embed.test.tsx` mocks the `react/chat-pane.js` entry, which is unaffected.
- **Re-exports:** this file is not a package entry (`./react/chat-pane` -> `react/chat-pane.ts` -> `features/chat-pane/index.ts` -> this file). Its exported names do not move. Do NOT add the new modules' exports to `index.ts`.
- **R10 public-surface guard** (`scripts/check-chatpane-public-surface.ts`). A new file under `features/chat-pane/**` may import from outside the folder only names already in `src/react/index.ts`. The plan only reuses names the original file imported, but run the check anyway.
- **Mutable closures:** the four `latest*Ref.current =` assignments and `releaseStateRef.current =` run during render. They must stay unconditional top-level statements of their hooks, and refs pass as ref objects, never as `.current` values. No `useCallback` gains or loses a dependency. Refs destructured from a group are the same stable objects the original read.
- **Types:** `exactOptionalPropertyTypes`. `ChatPaneSendOptions` fields copy `UseChatPaneOptions`' declarations exactly (`?: T`), so `options` stays assignable, and the group `Pick`s are the only contract. If `chatPaneComposerOptions`' inferred return does not satisfy `useComposer`, annotate it `Parameters<typeof useComposer>[0]`; never cast. `verbatimModuleSyntax` requires `import type` for type-only imports.
- **Pre-existing `!` (rule 10).** Five non-null assertions move verbatim and are NOT new: L673 and L674 (`inputs[0]!` ×3) go to T `useRecordAcceptedInput`, L814 (`accepted.at(-1)!`) to N `enqueueTurn`, and L866 (`accepted[0]!`) to L `retainAcceptedMidRunInput`. Per rule 6 the executor keeps them as they are. A reviewer grepping for added `!` should match them against the original lines.
- **Order hazards:** do not move `useChatPaneQueueFlush` out of last position, do not call `useChatPaneAttachmentActions` after `useChatPaneSendPaths` (no effect, but keep it), and do not merge E8/E9/E10 into one hook in a different order.
- Stale data files mention the old line numbers (`packages/daemon/docs/call-shape-sweep.tsv`, `caller-ledger.csv`, `packages/chat/dbpkg-chat/changed-files.json`). They are generated or historical, so leave them alone.
- No real bug was noticed.
