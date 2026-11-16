# 09 — Jini `packages/chat/src/react/features/chat-pane/components/ChatPane.tsx`

Measured at Jini `origin/integ/wave-b-fixed`: 941 lines (766 code), 24 imports, 14 components + 9 helper functions. Over the 80-line error: `ChatPane` 755-941 (**176**). Largest other: `ChatPaneComposerArea` 57 (allowed: components are exempt from 50).

## 1. Current shape

| lines | content | concern |
|---|---|---|
| 45-61, 674-687 | `defaultHeader`, `buildChatPaneSlots` | slots |
| 70-98 | `ChatPaneRuntimeView`, `resolveRuntimeAccessView` | runtime view |
| 106-122 | `ChatPaneSuggestionsRow` | transcript |
| 141-229 | `ChatPaneNoUsableCliMessage`, `ChatPaneAvailabilityStatus` | status |
| 231-300 | `ChatPaneWorkingDirectoryStatus`, `ChatPaneTypedAnswerNotice`, `ChatPaneAttachmentError`, `ChatPaneSendError` | status |
| 302-356 | `ChatPaneStatusMessages` | status |
| 358-403 | `ChatPaneWorkingDirectoryBlock` | composer area |
| 410-508 | `resolveDropTargetProps`, `resolveComposerAttachmentPicker`, `resolveComposerWorkingDirectory`, `resolveSendBlockerNotice` (pure) | composer area |
| 480-578 | `ChatPaneComposerArea` | composer area |
| 591-623 | `CHAT_PANE_DEFAULTS`, `applyChatPaneDefaults`, `resolveAgentControlOptions` | defaults |
| 625-669 | `useComposerHandlePublisher`, `useChatPaneTranscriptProps` | hooks |
| 689-740 | `ChatPaneTranscript` | transcript |
| 755-941 | `ChatPane`: surface (759), inventory (766), runtime view (771), `pane = useChatPane({…29 lines…})` (787), file drop (825), slots (834), pending prompts (862), then a 74-line JSX return (867-940) incl. the `<style>` tag at 875 | root |

## 2. Target shape

```
chat-pane/components/
  ChatPane.tsx                          root: useChatPaneView(props) + the JSX frame (<section>, <style>, 3 areas)   ~120
  chat-pane/
    useChatPaneView.hooks.ts            lines 759-865 → { shell, status, transcript, composer } bundles
                                        (two hooks if >80: useChatPaneRuntime + useChatPaneView)                    ~150
    chat-pane-defaults.ts               591-623                                                                     ~50
    runtime-access-view.ts              70-98                                                                       ~45
    chat-pane-slots.ts                  45-61, 674-687                                                              ~50
    status/
      ChatPaneStatusMessages.tsx        302-356                                                                     ~70
      ChatPaneAvailabilityStatus.tsx    141-229                                                                     ~105
      ChatPaneNotices.tsx               231-300 (four small notices)                                                ~85
    composer-area/
      ChatPaneComposerArea.tsx          480-493, 519-578                                                            ~95
      composer-area.rules.ts            410-478, 496-508 (pure; no React)                                           ~110
      ChatPaneWorkingDirectoryBlock.tsx 358-403                                                                     ~60
      useComposerHandlePublisher.hooks.ts 625-651                                                                   ~40
    transcript/
      ChatPaneTranscript.tsx            653-669, 689-740                                                            ~90
      ChatPaneSuggestionsRow.tsx        106-122                                                                     ~30
```

14 files, largest ~150. `ChatPane.tsx` keeps its path and export (public via the pane `index.ts`, which is the package's existing entry and is not changed).

```ts
// useChatPaneView.hooks.ts
export function useChatPaneView(props: ChatPaneProps): ChatPaneView
export interface ChatPaneView { shell: { className: string; dropTargetProps: … }; status: ChatPaneStatusMessagesProps;
  transcript: ChatPaneTranscriptProps; composer: ChatPaneComposerAreaProps }
// ChatPane.tsx
export function ChatPane(props: ChatPaneProps): JSX.Element {
  const view = useChatPaneView(props);
  return (<section …view.shell><style data-jini-chat-pane-styles="true">{CHAT_PANE_STYLES}</style>
    <ChatPaneTranscript {...view.transcript} /><ChatPaneStatusMessages {...view.status} /><ChatPaneComposerArea {...view.composer} /></section>);
}   // element order and the <style> position exactly as today
```

Rules: no new DOM nodes (extracted pieces return what they returned); every component module-level; the existing prop interfaces (`ChatPaneStatusMessagesProps`, `ChatPaneComposerAreaProps`, `ChatPaneTranscriptProps`) move with their component and are reused as the bundle types — no new prop shapes. Direction: `ChatPane → chat-pane/* → hooks/*`; `composer-area.rules.ts` and `runtime-access-view.ts` import no React.

## 3. Step order

0. **Characterization (no source change):** `__tests__/components/ChatPane.dom.characterization.test.tsx` — normalised `innerHTML` for: empty pane · with messages · streaming · no usable CLI · availability warning · working-directory status · typed-answer notice · attachment error · send error · send-blocker notice · suggestions row · custom header slot · drop target active. Use the package's existing fakes for the pane's ports.
1. Pure modules: `chat-pane-defaults.ts`, `runtime-access-view.ts`, `chat-pane-slots.ts`, `composer-area.rules.ts` (+ direct unit tests for the four `resolve*` rules).
2. Leaf components, one file per commit: suggestions row, notices, availability status, status messages, working-directory block, composer handle publisher, composer area, transcript.
3. `useChatPaneView` (the 107 wiring lines; split into two hooks at the `pane = useChatPane(...)` call if over 80).
4. Shrink `ChatPane`; remove `ChatPane.tsx` + `ChatPane#1` from `scripts/size-debt.json`.

Gate per commit: package `tsc --noEmit`, `npm --prefix packages/chat run test` for `chat-pane/__tests__` (components, `composer-action-hit-targets`, the `styles-*` suites that render the pane).

## 4. Tests

Existing component and hit-target suites pin behaviour through the rendered pane. New: DOM characterization; `composer-area.rules.test.ts`; `useChatPaneView.test.tsx` asserting bundle contents from fake ports (no DOM).

## 5. Risks

| risk | de-risk |
|---|---|
| CSS selectors depend on DOM nesting (`.jini-chat-pane > …`, footer wrap rules) | no new nodes; DOM snapshot; the `styles-*` render tests |
| hook order inside `ChatPane` changes when wiring moves to `useChatPaneView` | wiring lines move as one block in the same order |
| `useComposerHandlePublisher` re-publishes on every render after extraction | its deps are unchanged; add one assertion to the characterization: publish count per scenario |

Risk: **medium-low**.

## 6. Interaction

Same three points as design 08 §6 (R4/C9b blob guards; the C0 gate on new files — stop and report on any foreign `@jini-ai/*` import; check for the other chat run). C10's `surfaces` port will change line 759 (`surface`); after this split that is a one-line edit in `useChatPaneView.hooks.ts`. Do 08 and 09 in the same lane, 08 first (09's `useChatPaneView` imports 08's `types.ts`).

## 7. Estimate

≈14 commits. Sonnet executor **≈170k tokens**.
