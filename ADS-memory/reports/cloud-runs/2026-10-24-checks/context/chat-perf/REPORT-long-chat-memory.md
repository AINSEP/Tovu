Programmer(Execution): Programmer persona selected for the scoped React fix and regression coverage.

Collapsed panels caused the original DOM growth. This baseline already lazy-mounts them; I closed remaining gaps: unbounded error tooltips, duplicated error previews, and truncated expanded text.

Changed files:

- [ToolCard.tsx](/Users/la/Programming/tovu-integration-clones/jini-perf/packages/chat/src/react/components/ToolCard.tsx): bounded, redacted error sinks; complete text on expansion.
- [ToolCard.test.tsx](/Users/la/Programming/tovu-integration-clones/jini-perf/packages/chat/src/react/components/__tests__/ToolCard.test.tsx): updated expansion assertions.
- [ToolCard.long-chat-memory.test.tsx](/Users/la/Programming/tovu-integration-clones/jini-perf/packages/chat/src/react/components/__tests__/ToolCard.long-chat-memory.test.tsx): added 713-card DOM budget, real reader, and error-bound tests.
- [.changeset/chat-long-chat-memory.md](/Users/la/Programming/tovu-integration-clones/jini-perf/.changeset/chat-long-chat-memory.md): patch release.

Reader found: `page.find_elements(withState)` → `createDomPageDriver.describeState` → `textContent`. The compact hidden summary remains readable without expansion; tests cover pending and completed results.

Skipped windowing to preserve scrolling, search, and ordering. Static syntax and whitespace checks pass; changed production CCNs: **6, 4, 8, 4**. **No tests run; no commits.**

```bash
cd packages/chat && npx vitest run src/react/components/__tests__/ToolCard.test.tsx src/react/components/__tests__/ToolCard.long-chat-memory.test.tsx src/core/__tests__/tool-call-detail.test.ts --maxWorkers=2 --minWorkers=1
```
