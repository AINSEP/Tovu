# Split plan: packages/chat/src/react/features/chat-pane/components/ChatPane.tsx (Jini)

## 1. Header
- Over: file **766** counted (942 raw), limit 500. Function `ChatPane` **176**, limit 100. Nothing else is over.
- Phase: **NOW.** The file is in Jini already and the Tovu->Jini move takes nothing from it.
- Executor: Opus/Fable. Moved code is byte-for-byte. Independent of `useChatPane.md` (different files). `ChatPane` keeps importing `useChatPane`/`UseChatPaneResult` from `../hooks/useChatPane.hooks.js`.
- Names deviation (rule 3): this `components/` folder uses one PascalCase component per file (`AgentRuntimePicker.tsx`, `RuntimeDropUp.tsx`), so the new files are named after their main component. Pane hooks live in `hooks/useChatPane<X>.hooks.ts`, so the view hook goes to `hooks/useChatPaneView.hooks.ts` (rule 9's `<Component>.hooks.ts` adapted to the folder).
- Rule 9 note: sub-components keep their existing `pane: UseChatPaneResult` prop (`ChatPaneComposerArea`, `ChatPaneTranscript`, `ChatPaneWorkingDirectoryBlock`). That is today's interface; changing it is out of scope (no behavior change). Pure prop resolvers (`resolveDropTargetProps`, `resolveComposerAttachmentPicker`, `resolveComposerWorkingDirectory`) hold no state or effects, so they stay beside the component that spreads them.

## 2. Responsibility map
Units: **C** = `components/ChatPane.tsx` (stays), **S** = `components/ChatPaneStatusMessages.tsx`, **A** = `components/ChatPaneComposerArea.tsx`, **X** = `components/ChatPaneTranscript.tsx`, **G** = `components/ChatPaneSuggestionsRow.tsx`, **V** = `hooks/useChatPaneView.hooks.ts`.

| Decl (outline line) | Unit | Job |
|---|---|---|
| `WorkingDirectoryControlPlacement` L1 | A | placement union (only A's props use it) |
| `EMPTY_AGENTS` L43 | V | default agents |
| `defaultHeader` L45 | C | default header JSX |
| `chatPaneClassName` L63 | C | root class |
| `ChatPaneRuntimeView` L68-78 [export from V] | V | runtime view shape |
| `resolveRuntimeAccessView` L80 | V | host vs inventory runtime view |
| `ChatPaneSuggestionsRowProps`, `ChatPaneSuggestionsRow` L100-122 | G [export component] | example-prompt chips (used by C and X) |
| `ChatPaneNoUsableCliMessage` L124-175 (+doc), `ChatPaneAvailabilityStatusProps` L177, `ChatPaneAvailabilityStatus` L187-229 (+doc), `ChatPaneWorkingDirectoryStatus` L231, `ChatPaneTypedAnswerNotice` L255-277 (+doc), `ChatPaneAttachmentError` L279-288, `ChatPaneSendError` L290-300, `ChatPaneStatusMessagesProps` L302, `ChatPaneStatusMessages` L314-356 [export] | S | the stack of status/error banners |
| `ChatPaneWorkingDirectoryBlockProps` L358, `ChatPaneWorkingDirectoryBlock` L365-403 | A | below-composer dir picker |
| `resolveDropTargetProps` L405-415 (+doc), `resolveComposerAttachmentPicker` L417, `resolveComposerWorkingDirectory` L432-478 (+doc), `ChatPaneComposerAreaProps` L480 | A | composer prop resolvers |
| `resolveSendBlockerNotice` L495-508 | V (private) | input type becomes `{ pane: UseChatPaneResult; unavailable: boolean; t: (key: string) => string }` (same three field types as the old `Pick<ChatPaneComposerAreaProps, …>`, which avoids an A<->V type cycle) |
| `ChatPaneComposerArea` L510-578 [export] | A | drop target + composer + dir block; its L533-534 (`useId` + `resolveSendBlockerNotice` call) is replaced by one call to V `useChatPaneSendBlockerNotice` |
| `ChatPaneDefaultedProp` L580-585, `ResolvedChatPaneProps` L587 [export], `EMPTY_SUGGESTIONS` L589, `CHAT_PANE_DEFAULTS` L591, `applyChatPaneDefaults` L609 | V | prop defaults |
| `resolveAgentControlOptions` L617 | V | agent-control options |
| `useComposerHandlePublisher` L625 | V | publish composer handle |
| `useChatPaneTranscriptProps` L653 [export, for X's types] | V | memoized transcript props |
| `buildChatPaneSlots` L671-687 [export] | V | composer slots |
| `ChatPaneTranscriptProps`, `ChatPaneTranscript` L689-740 [export] | X | transcript or empty state |
| `showsControlsSuggestions` L742-746 | C | controls-row suggestions rule |
| `ChatPane` [export] L748-941 | C | statement map below |

`ChatPane` statement groups:
| Anchor | -> |
|---|---|
| L756 `p`, L757 `base`, L758 `t`, L759-764 `surface`, L765 `composerPlaceholder`, L766-770 `inventory`, L771-778 `runtimeView`, L779-786 comment + `apiModeConfigured`, L787-815 `pane`, L816 publisher, L817-820 comment + agent control, L821-824 comment + `unavailable`, L825-833 `fileDrop`, L859 controls height, L860 `selectSuggestion`, L861 `openLinkInNewTab`, L862-865 transcript props | V `useChatPaneView`, same order, verbatim |
| L834-857 `const slots = buildChatPaneSlots({` | stays in C after the `useChatPaneView` call. The inline `<AgentRuntimePicker …/>` (L838-855) moves verbatim into C's new `renderChatPaneRuntimePicker`. It is a pure element build with no hooks, so evaluating it after the hooks changes nothing |
| L867-940 `return (` | stays in C; one edit: L918 `inventory.runtimeInventoryError` -> `runtimeInventoryError` |

## 3. Target layout (imports form a DAG: G <- X; V <- X, A, C; S, A, X, G <- C; V imports none of the components)
- **V `hooks/useChatPaneView.hooks.ts`** (~255). Job: everything `ChatPane` computes before rendering. Exports `type ChatPaneRuntimeView`, `type ResolvedChatPaneProps`, `useChatPaneTranscriptProps`, `buildChatPaneSlots`, `useChatPaneView`, `useChatPaneSendBlockerNotice`. New:
  - `useChatPaneView({ props }: { props: ChatPaneProps })` -> `{ p, base, t, surface, composerPlaceholder, runtimeView, runtimeInventoryError: inventory.runtimeInventoryError, pane, unavailable, fileDrop, rootRef, controlsRef, selectSuggestion, openLinkInNewTab, pendingPrompts, projectFileNameSet }` (~84 counted). Hook order is identical to today's.
  - `useChatPaneSendBlockerNotice({ pane, unavailable, t }: SendBlockerNoticeInput)` -> `{ sendDisabledReasonId, sendDisabledReason, showsNotice }`. Body: `const sendDisabledReasonId = useId();` then the L534 call verbatim. It is called by A in the same component and the same hook position.
  - Imports: react `useEffect, useId, useMemo, useRef, type ReactNode`; `useAgentHandle` (`@jini-ai/ui`); `appendComposerDiscovery`; `useT`; `type ComposerSlots`; `definedProps`; types `ChatPaneAgent, ChatPaneProps, ChatPaneRuntimeAccess`; rules `chatPaneSendBlockerNeedsNotice, describeChatPaneSendBlocker, isChatPaneApiModeConfigured, isChatPaneFileDropEnabled`; `useChatPane, type UseChatPaneResult`; `useChatPaneAgentControl`; `useChatPaneComposerPlaceholder`; `useChatPaneControlsHeight`; `useChatPaneNewTabLinks`; `useChatPaneSurface`; `useChatPaneSuggestion`; `useChatPaneFileDrop`; `useChatPaneRuntimeInventory, type UseChatPaneRuntimeInventoryResult`. These are all names `ChatPane.tsx` already imports, so R10 is satisfied.
- **S `components/ChatPaneStatusMessages.tsx`** (~190). Exports `ChatPaneStatusMessages`. Imports `type ReactNode`, `type TypedAnswerNotice`, `describeAttachmentError, describeTypedAnswerNotice` (`'../rules.js'`).
- **A `components/ChatPaneComposerArea.tsx`** (~165). Exports `ChatPaneComposerArea`. Imports `type ReactNode`, `WorkingDirPicker` (`@jini-ai/ui`), `Composer`, `Icon`, `type ComposerSlots`, `definedProps`, types `ChatPaneProps, ChatPaneWorkingDirectoryAccess`, `type UseChatPaneResult`, `type ChatPaneFileDropTargetProps, type UseChatPaneFileDropResult`, V `useChatPaneSendBlockerNotice`.
- **X `components/ChatPaneTranscript.tsx`** (~65). Exports `ChatPaneTranscript`. Imports `type ReactNode`, `MessageList`, `definedProps`, `type ChatPaneProps`, `type UseChatPaneResult`, G, and V `type ResolvedChatPaneProps, type useChatPaneTranscriptProps` (`typeof` usage; `import type`).
- **G `components/ChatPaneSuggestionsRow.tsx`** (~25). Exports `ChatPaneSuggestionsRow`. Imports `type ReactNode`.
- **C `components/ChatPane.tsx`** (~160). Keeps `defaultHeader`, `chatPaneClassName`, `showsControlsSuggestions` and `ChatPane` (header JSDoc kept). Adds `renderChatPaneRuntimePicker({ base, runtimeView, pane, p }: { base: string | undefined; runtimeView: ChatPaneRuntimeView; pane: Pick<UseChatPaneResult, 'selection' | 'setSelection'>; p: Pick<ResolvedChatPaneProps, 'runtimePickerPlacement' | 'executionMode' | 'apiModeAvailable' | 'onExecutionModeChange' | 'byokRuntime' | 'onByokModelChange' | 'nativeToolPolicy'> }): ReactNode`. It returns the L838-855 element verbatim and sits above `ChatPane`. The final `ChatPane` (~88 counted) is:
  ```
  const { p, base, t, surface, composerPlaceholder, runtimeView, runtimeInventoryError, pane, unavailable, fileDrop,
    rootRef, controlsRef, selectSuggestion, openLinkInNewTab, pendingPrompts, projectFileNameSet } = useChatPaneView({ props });
  const slots = buildChatPaneSlots({ surfaceSlots: surface.composerSlots, embed: surface.embed,
    renderRuntimePicker: () => renderChatPaneRuntimePicker({ base, runtimeView, pane, p }) }, { leadingAccessory: p.leadingAccessory });
  return ( …L867-940… );
  ```

## 4. Steps (one commit each, explicit paths; message `refactor(chat): split ChatPane by responsibility (size, step Cn)`)
Test command: `pnpm --filter @jini-ai/chat exec vitest run <file> --maxWorkers=2`, one file at a time, then `pnpm --filter @jini-ai/chat run typecheck`. Every importer of `ChatPane.tsx` imports only `ChatPane` (rg), so no importer changes. No `vi.mock` targets these files. Remove imports that become unused in C at each step.
- **C1 — S.** Move L124-356 to S; C imports `ChatPaneStatusMessages`. Tests: `src/react/features/chat-pane/__tests__/components/ChatPane.test.tsx`, `…/components/ChatPane.cov-j2.test.tsx`, `…/components/ChatPane.redaction-notice.test.tsx`, typecheck. C ≈ 585.
- **C2 — V.** Create V with the moved declarations + `useChatPaneView` + `useChatPaneSendBlockerNotice` (the latter unused until C4 is fine). Rewrite `ChatPane` as in §3, adding `renderChatPaneRuntimePicker`. `ChatPaneTranscript` (still in C) imports its two types from V. Tests: `…/components/ChatPane.test.tsx`, `…/components/ChatPane.typing-render.test.tsx`, `…/components/ChatPane.agent-handles.test.tsx`, `…/components/AgentRuntimePicker.native-policy.unit.test.tsx`, `src/react/__tests__/folder-chips.test.tsx`, typecheck. C ≈ 395, `ChatPane` ≈ 88.
- **C3 — G + X.** Move L100-122 to G and L689-740 to X. Tests: `…/components/ChatPane.test.tsx`, `…/components/ChatPane.long-transcript.bench.test.tsx`, `src/react/components/__tests__/sending-label.unit.test.tsx`, `src/react/components/__tests__/mid-run-transcript.test.tsx`, typecheck. C ≈ 320.
- **C4 — A.** Move L1 + L358-578 to A, minus `resolveSendBlockerNotice` (-> V, private), and switch L533-534 to `useChatPaneSendBlockerNotice`. Tests: the full set, which is `…/components/ChatPane.test.tsx`, `ChatPane.cov-j2`, `ChatPane.agent-handles`, `ChatPane.redaction-notice`, `ChatPane.typing-render`, `ChatPane.long-transcript.bench`, `AgentRuntimePicker.native-policy.unit`, `src/react/__tests__/folder-chips.test.tsx`, `src/react/hooks/__tests__/secret-redaction.test.tsx`, `src/react/components/__tests__/sending-label.unit.test.tsx`, `src/react/components/__tests__/mid-run-transcript.test.tsx`, `src/react/features/chat-pane/__tests__/index.test.ts` and `src/embed-widget/react/__tests__/embed.test.tsx`. Then typecheck, `node --import tsx ./scripts/check-chatpane-public-surface.ts` from the Jini root (fallback `pnpm guard:drift`), `npx eslint <6 files>`, and `outline.mjs --check <6 files>`.

## 5. After (counted, estimates)
| File | Lines | Largest function |
|---|---|---|
| `ChatPane.tsx` | ~160 | `ChatPane` ~88 |
| `ChatPaneStatusMessages.tsx` | ~190 | `ChatPaneStatusMessages` 41 |
| `ChatPaneComposerArea.tsx` | ~165 | `ChatPaneComposerArea` ~56 |
| `ChatPaneTranscript.tsx` | ~65 | `ChatPaneTranscript` 37 |
| `ChatPaneSuggestionsRow.tsx` | ~25 | 17 |
| `useChatPaneView.hooks.ts` | ~255 | `useChatPaneView` ~84 |
There are no exception candidates.

## 6. Risks
- Hook order inside `ChatPane` must stay: `applyChatPaneDefaults` -> `useAgentHandle` -> `useT` -> `useChatPaneSurface` -> `useChatPaneComposerPlaceholder` -> `useChatPaneRuntimeInventory` -> `useChatPane` -> `useComposerHandlePublisher` -> `useChatPaneAgentControl` -> `useChatPaneFileDrop` -> `useChatPaneControlsHeight` -> `useChatPaneSuggestion` -> `useChatPaneNewTabLinks` -> `useChatPaneTranscriptProps`. All of these are now inside `useChatPaneView` in that order. Effects (publisher, agent control, controls height …) keep their order.
- `ChatPane.typing-render.test.tsx` and `long-transcript.bench` depend on `MessageList` memoization, so `useChatPaneTranscriptProps` must move unchanged (same `useMemo` deps).
- Type cycles: X and A import types from V. V must never import from `components/`. `resolveSendBlockerNotice`'s input type is restated (same fields) for that reason.
- R10 guard: the new files reach outside `features/chat-pane/` only for names `ChatPane.tsx` already imported.
- Not a package entry (`index.ts` re-exports `ChatPane` from this path, unchanged). The `embed.test.tsx` mock targets `react/chat-pane.js`, which is unaffected.
- No bug was noticed.
