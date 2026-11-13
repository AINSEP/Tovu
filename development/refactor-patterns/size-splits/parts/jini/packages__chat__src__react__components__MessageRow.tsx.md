### jini:packages/chat/src/react/components/MessageRow.tsx
- **Over:** `AssistantMessageRow` 159
- **Phase:** now · **Batch:** size-11
- **Tests:** `src/react/components/__tests__/MessageRow.test.tsx`, `MessageRow.display.test.tsx`, `MessageRow.terminal-extension.test.tsx`, `MessageRow.usage.test.ts`, `MessageRow.usage.l199.characterization.test.ts`, `mid-run-transcript.test.tsx`, `MidRunUserMessage.test.tsx`, `answered-question.test.tsx`, `surface-question-replay.test.tsx`, `durable-run-notice.test.tsx`, `sending-label.unit.test.tsx`, `standalone-approval.test.tsx`, `MessageList.test.tsx` (all in `src/react/components/__tests__/`), `src/react/__tests__/index.test.ts`. Complete with `rg -l "MessageRow" packages/chat/src --glob '*.test.*'`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `MessageRowProps`, `UsageSummary`, `RunAccessNotice`, `ThinkingBlock`, `AssistantMessageFooter`, `NO_ATTACHMENTS`, `MessageRow`, `UserMessageRow`, `answerRenderProps`, `transcriptSections`, `isUserSection`, `RunActivityLine` | render pieces |
| B view model | hooks + derivations in `AssistantMessageRow` from `const registry = useExtEventRendererRegistry();` through `const flatExtGroups = …` (excluding the two render closures) and pure helpers `isPendingWithNoContent`, `isRunInProgress`, `messageBlocks`, `flatToolGroups`, `messageAwaitingAnswer`, `assistantTerminalNotice`, `lastFinishedReplyIndex`, type `AssistantBlock` | derive what one assistant message shows |
| C tool rendering | closures `renderToolCard`, `renderTools` | render tool groups/cards |
| D ext rendering | closure `renderExtGroup` | render one extension event group in its error boundary |
| E text rendering | closure `renderTextSegments` | markdown + inline question forms |
| F (stays) | `renderBlock`, `renderExtBlock`, `renderAssistantSection`, the two returns | lay out sections |

- **Splits:**
  1. NEW `MessageRow.hooks.ts` — job: assistant message view model. Moves the pure helpers of unit B and type `AssistantBlock` (export; all their comments move). Adds `useAssistantMessageView({ message, usageSummary, runStreaming, runSucceeded, toolCallDisplay, showThinking, showUsageLine }: UseAssistantMessageViewInput): AssistantMessageView` ← unit B statements verbatim in order (the "Artifact stripping trims/replaces text…" comment moves); returns `{ registry, extGroups, answeredCards, terminalNotice, visibleContent, displayBlocks, blocks, pending, runInProgress, awaitingAnswer, usage, footerUsage, lastFinishedReply, timeline, retriedRows, flatTools, flatExtGroups }`. Imports nothing from `MessageRow.tsx`.
  2. Module-level render helpers in `MessageRow.tsx` (above `AssistantMessageRow`; plain functions returning `ReactNode`, NOT components — keys and element identity stay exactly as today):
     - `renderToolGroup({ rows, key, retriedRows, toolCallDisplay, runStreaming, runSucceeded, projectFileNames, onRequestOpenFile }: RenderToolGroupInput): ReactNode` ← `renderTools` with `renderToolCard` as a private module function `renderToolCard({ row, … })` (the "Hidden mode reuses…" comment moves). `ToolCallGroup`'s `renderRow` gets `(row) => renderToolCard({ row, … })`.
     - `renderExtEventGroup({ group, registry, message, runInProgress, runSucceeded, awaitingAnswer, answeredCards }: RenderExtEventGroupInput): ReactNode` ← `renderExtGroup` (the boundary-key comment moves).
     - `renderTextSegments({ text, keyPrefix, questionFormInteractive, questionFormSubmittedAnswers, onQuestionFormSubmit }: RenderTextSegmentsInput): ReactNode`.
  3. `AssistantMessageRow` keeps one-line adapters `const renderTools = (rows, key?) => renderToolGroup({...})`, `const renderExtGroup = (group) => renderExtEventGroup({...})`, `const renderText = …` so `renderBlock`/`renderExtBlock`/`renderAssistantSection`/returns are unchanged.
- **Importers to update:** none (`MessageRow`, `MessageRowProps` stay; moved helpers were not exported). `transcriptSections`/`isUserSection` import type `AssistantBlock` from `./MessageRow.hooks.js`.
- **After:** `AssistantMessageRow` ~80; `useAssistantMessageView` ~30; file ~330; hooks file ~95.
- **Risks / notes:** hooks order inside `useAssistantMessageView` = today's (`useExtEventRendererRegistry`, `useMessageUsage`, `useToolTimeline`, `useExtEventGroups`, `useAnsweredCards`). Do not turn render helpers into components (would add a component layer and change keys/reconciliation, e.g. the footer must not remount). `section[0]!.key` is existing code, untouched.
