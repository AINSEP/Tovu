### jini:packages/chat/src/react/components/ConversationList.tsx
- **Over:** `ConversationList` 209
- **Phase:** now · **Batch:** size-11
- **Tests:** `src/react/components/__tests__/ConversationList.test.tsx`, `ConversationList.trigger.test.tsx`, `ConversationList.gaps.test.tsx`, `list-gallery.hooks.test.tsx` (same folder). No `vi.mock` of the file or of `ConversationList.hooks.ts`.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `DOUBLE_CLICK_GRACE_MS`, item/props interfaces, `runConversationListHostEffect` (+ reporter), `relativeTime`, `ConversationActions` | contract + helpers |
| B switcher | `open`, `rootRef`, `pendingSelectRef`, `cancelPendingSelect`, unmount/close/outside-click effects (~L180-214), the row-click scheduling inline handler | open/close + click-vs-double-click |
| C search | `query`, `savedServerResults`, `useConversationListTitles(...)`, `deferredQuery`, the reset-on-open effect (~L217), the search effect (~L224), `visible` | filter + server search |
| D row actions | `editingId`, `commitRename`, `startRename`, `requestDelete` | rename/delete |
| E render | the `{open ? (…)}` panel JSX and each `visible.map` row | menu + rows |

- **Splits:**
  1. In existing `ConversationList.hooks.ts` (next to `useConversationListTitles`) add (bodies verbatim, every comment moves, dependency arrays identical):
     - `useConversationSwitcher({ onSelect }: UseConversationSwitcherInput): { open; setOpen; rootRef; cancelPendingSelect; scheduleSelect(id: string): void }` ← unit B; `scheduleSelect` = the body of the row button's inline `onClick` (cancel, `setTimeout(… onSelect(id); setOpen(false); }, DOUBLE_CLICK_GRACE_MS)`); `DOUBLE_CLICK_GRACE_MS` moves here (its comment moves); `ConversationList.tsx` no longer uses it.
     - `useConversationSearch({ conversations: savedConversations, onSearch, open, t }, { setEditingId }): { query; setQuery; conversations; rawTitles; visible }` ← unit C (reset effect stays immediately before the search effect, as today).
     - `useConversationRowActions({ onRename, onDelete, confirmDelete, t, cancelPendingSelect }): { editingId; setEditingId; commitRename; startRename; requestDelete }` ← unit D. Note `requestDelete` uses `runConversationListHostEffect` if it does today — if so, move `runConversationListHostEffect` + `reportConversationListHostEffectFailure` to the hooks file and import them in the component (the hooks file must not import the component).
  2. SUB-COMPONENTS in `ConversationList.tsx` (module level, above `ConversationList`), plain props, JSX verbatim incl. JSX comments:
     - `ConversationRow({ item, active, editing, title, canRename, canDelete, now, onCommitRename, onCancelRename, onSelect, onStartRename, onDelete, t })` ← one `visible.map` item.
     - `ConversationMenu({ conversations, visible, query, onQueryChange, emptyLabel, createDisabled, onCreate, activeConversationId, editingId, rawTitles, now, …row callbacks, t })` ← the `<div className="jini-conv-menu">` block (the `onCreate` click keeps `runConversationListHostEffect('onCreate', …)` + `setOpen(false)` passed in as `onCreate`).
  3. `ConversationList` calls the hooks in order switcher → row actions (needs `cancelPendingSelect`) → search; keeps `now`, `active`, `emptyLabel`, the trigger button and `{open ? <ConversationMenu …/> : null}`.
- **Importers to update:** none outside the file (`DOUBLE_CLICK_GRACE_MS` is not exported).
- **After:** `ConversationList` ~55; `ConversationMenu` ~50; `ConversationRow` ~40; hooks ~45/~40/~30; component file ~260.
- **Risks / notes:** search needs `setEditingId` for the reset effect while row actions own `editingId` — call `useConversationRowActions` before `useConversationSearch`. Effect order today: unmount-cancel, close-abandon, outside-click, reset, search — keep that order across hook calls (switcher first). The `useState` order changes (editing before query) — allowed (stable across renders), but keep effects in order.
