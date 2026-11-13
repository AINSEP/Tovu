### jini:packages/chat/src/react/components/ToolCard.tsx
- **Over:** file 516 lines (no function over 100)
- **Phase:** now · **Batch:** size-12
- **Package entry:** not an exports target; `src/react/index.ts` (entry `./react`) re-exports `ToolCard`, `ToolCardProps` — both STAY in ToolCard.tsx, so index.ts is untouched.
- **Tests:** `src/react/components/__tests__/ToolCard.test.tsx`, `ToolCard.batch-target.test.tsx`, `ToolCard.cli-events.test.tsx`, `ToolCard.long-chat-memory.test.tsx` (all import only `ToolCard`). `ToolCard.test.tsx` `vi.mock`s `../../../core/tool-output.js` (not this file) → still applies wherever the moved code imports it.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A dispatch (stays) | `ToolCardProps`, `JINI_TOOL_ID_PATTERN`, `ToolCard`, `ToolCardBodyArgs`, `FamilyCardRender`, `FAMILY_CARDS`, `renderRegistered`, `renderToolCardBody`, `DelegatedToolCardProps`, `DelegatedToolCard`, `GenericCard` | pick the card for a tool call |
| B parts | `RUNNING_TITLE_CLASS`, `ToolUseEvent`, `ToolResultEvent`, `CardProps`, `RetriedContext`, `ToolRowHead`, `ExpandableCard`, `CollapsedReaderText`, `ToolCallDetail`, `ErrorBadge`, `ResultBadge`, `ToolResultMedia`, `ToolResultImage`, `ToolResultImageFigure`, `FileErrorDetail`, `headSummary`, `truncate` | the row shell, badges, detail and media every card shares |
| C family cards | `FileToolCtx`, `OpenInTabButton`, `FileWriteCard`, `FileEditCard`, `FileReadCard`, `BashCard`, `GlobCard`, `GrepCard`, `WebFetchCard`, `WebSearchCard`, `SearchToolsCard`, `DescribeToolCard` | built-in per-tool-family cards |

- **Splits:**
  1. NEW `ToolCard-parts.tsx` — unit B verbatim (doc comments incl. the `RetriedContext` "read by ErrorBadge only" note and the `ExpandableCard`/`headSummary` paragraphs). Exports every moved name used by A or C (incl. `RetriedContext`, which `ToolCard` provides). Imports nothing from ToolCard.tsx.
  2. NEW `ToolCard-family-cards.tsx` — unit C verbatim. Exports the 10 card components used by `FAMILY_CARDS` + type `FileToolCtx`. Imports from `./ToolCard-parts.js` only.
  3. ToolCard.tsx imports from both; drop now-unused React imports.
- **Importers to update:** none outside the file (`ToolCard`, `ToolCardProps` stay).
- **After:** ToolCard.tsx ~115; ToolCard-parts ~165; ToolCard-family-cards ~255.
- **Risks / notes:** `ExpandableCard` keeps its own `useState` (moved verbatim; no new state, so no `.hooks.ts` needed for this file-size split). `ToolUseEvent`/`ToolResultEvent` are local aliases — export them from parts and import as types in ToolCard.tsx.
