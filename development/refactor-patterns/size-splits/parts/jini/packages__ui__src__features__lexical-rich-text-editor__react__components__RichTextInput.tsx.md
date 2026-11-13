### jini:packages/ui/src/features/lexical-rich-text-editor/react/components/RichTextInput.tsx
- **Over:** `EditorSurface` 136 (file 214, fine)
- **Phase:** now · **Batch:** size-37
- **Tests:** `src/features/lexical-rich-text-editor/react/components/RichTextInput.test.tsx`, `src/features/lexical-rich-text-editor/react/components/RichTextInput.onError.test.tsx`, `src/features/lexical-rich-text-editor/__tests__/serialize.test.ts`, `src/features/lexical-rich-text-editor/index.test.ts`
- **Responsibility map** (inside `EditorSurface`):

| unit | statements | job |
|---|---|---|
| A | props destructure, `useLexicalComposerContext`, the seven plugin hooks (`useSyncedOnChange` … `useMentionColorStamping`), the JSX `return` | editor surface rendering + behaviour plugins — stays |
| B | `knownMentionsRef`/`triggersRef`/`mentionTriggerIdRef` (+ their "`knownMentions`/`triggers`/`mentionTriggerId` can change…" comment) and `useImperativeHandle(ref, () => ({ getText, setText, clear, focus, insertText, insertMention, replaceActiveTrigger }), [editor])` | the imperative `RichTextInputHandle` |

- **Splits** (in order):
  1. NEW `RichTextInput.hooks.ts` (sibling) — job: the imperative handle.
     - `createRichTextInputHandle({ editor, knownMentionsRef, triggersRef, mentionTriggerIdRef }: CreateRichTextInputHandleInput): RichTextInputHandle` ← the object literal returned by the `useImperativeHandle` factory, verbatim (all inner comments: "Belt-and-suspenders…", the `selectEnd()` guarantee, "See the identical…", "Drop whichever trigger's query…"). Refs (not values) are passed so every method still reads `.current` at call time. Input types: `editor: LexicalEditor`; `knownMentionsRef: MutableRefObject<RichTextInputProps['knownMentions']>`-equivalent — write the element types out from the props' declared types WITHOUT importing `RichTextInputProps` (cycle): import the underlying types (`RichTextTriggerConfig`, the mention type) from where `RichTextInput.tsx` imports them.
     - `useRichTextInputHandle({ ref, editor, knownMentions, triggers, mentionTriggerId }: UseRichTextInputHandleInput): void` ← unit B's three ref pairs (with the comment) then `useImperativeHandle(ref, (): RichTextInputHandle => createRichTextInputHandle({ editor, knownMentionsRef, triggersRef, mentionTriggerIdRef }), [editor]);`. `ref: ForwardedRef<RichTextInputHandle>`.
     Moves the lexical imports only B uses (`$getSelection`, `$isRangeSelection`, `$getRoot`, `RangeSelection`, `$createMentionNode`, `deleteActiveTrigger`, `buildTriggerDeletionRegex`, `buildAnyTriggerDeletionRegex`, `serializeRichText`, `setRichTextFromPlainText`, `MentionInsert`) — same module specifiers adjusted for the sibling location (same folder → identical relative paths).
  2. `EditorSurface` keeps unit A and calls `useRichTextInputHandle({ ref, editor, knownMentions, triggers, mentionTriggerId });` where the refs used to be declared (before the plugin hooks, keeping hook order as close as possible: call it right after `useLexicalComposerContext()` — note `useImperativeHandle` then runs before the plugin hooks; acceptable, it only sets the ref object). Remove now-unused imports.
- **Importers to update:** none (no exports move; `RichTextInput` and its props/handle types stay).
- **After:** file ~125; `EditorSurface` ~50; hooks file ~115 (`createRichTextInputHandle` ~80, `useRichTextInputHandle` ~12).
- **Risks / notes:** `RichTextInput.onError.test.tsx` `vi.mock('../../mention-node.js', …)` — the hooks file sits in the same folder and imports the same module, so the mock still covers `$createMentionNode`. The `sel as RangeSelection` casts are pre-existing (not `as any`/`as unknown as`) — move as is. Header "Origin:" doc on `RichTextInput` stays.
