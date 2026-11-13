### jini:packages/cms/src/media/tool-registrations.ts
- **Over:** `buildMediaRegistrations` 143 (its `handlers` literal 114)
- **Phase:** now · **Batch:** size-19
- **Tests:** `src/media/__tests__/tool-registrations.test.ts`, `src/media/__tests__/list-provenance.unit.test.ts`, `src/media/__tests__/unit/document-text.unit.test.ts`. No `vi.mock` of the file (re-check with rg).
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A (stays) | `routeDeps`, `mediaWriteDeps`, `return buildDomainRegistrations(…)` | wiring |
| B | `handlers` entries `library_list`, `library_read`, `media_list_assets` | read tools |
| C | `handlers` entries `media_upload_asset`, `media_update_metadata`, `media_trash_asset` | write tools |

- **Splits:**
  1. HELPER `buildMediaReadHandlers({ routeDeps }: BuildMediaReadHandlersInput): Record<string, ToolHandler>` — module level above `buildMediaRegistrations` ← the three read entries verbatim, same key order.
  2. HELPER `buildMediaWriteHandlers({ routeDeps, mediaWriteDeps }: BuildMediaWriteHandlersInput): Record<string, ToolHandler>` ← the three write entries verbatim (`mediaWriteDeps` is the existing `() => ({…})` closure, passed as is).
  3. `const handlers: Record<string, ToolHandler> = { ...buildMediaReadHandlers({ routeDeps }), ...buildMediaWriteHandlers({ routeDeps, mediaWriteDeps }) };` — key order unchanged.
- **Importers to update:** none.
- **After:** `buildMediaRegistrations` ~32; read ~45; write ~75; file ~235.
- **Risks / notes:** handler comments move with their entries.
