### tovu:apps/admin/src/features/publish-content/PublishContentDialog.tsx
- **Over:** `PublishContentDialog` 115 (file 287, under; `PublishContentReport` is exactly 100 — not over, leave it)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-05
- **Tests:** `apps/admin/src/features/publish-content/__tests__/PublishContentDialog.unit.test.tsx`, `publish-request.store.unit.test.ts` (same folder), `apps/admin/src/features/publish-content/hooks/__tests__/use-publish-content-confirm.hooks.unit.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | JSX `{view.peers.length > 1 && (` + `{view.peers.length === 1 && (` (~L120-150) | choose / show the target site |
| B | JSX `<span className="editor-actions">` (~L156-217) | Cancel + plan/confirm buttons |
| C | rest of `PublishContentDialog` (hook call, `<Dialog>` shell, intro paragraphs, `PublishContentNotices`, `PublishContentReport`) | the dialog (stays) |

- **Splits:** (sub-components follow this file's existing `PublishContentSectionProps` = `{ view, t }` pattern, as `PublishContentNotices`/`PublishContentReport` already do)
  1. SUB-COMPONENT `function PublishContentPeerPicker({ view, t }: PublishContentSectionProps)` (module level, below `PublishContentSectionProps`, above `PublishContentNotices`) ← the two peer blocks, wrapped in a fragment `<>…</>`; the `AgentElementRole` comment moves with it.
  2. SUB-COMPONENT `function PublishContentActions({ view, t }: PublishContentSectionProps)` (next to it) ← the whole `<span className="editor-actions">…</span>` with both comments (Cancel default-focus; "Two different buttons, keyed apart…") word for word; `key="start"` / `key="confirm"` stay on the buttons.
  3. `PublishContentDialog` renders `<PublishContentPeerPicker view={view} t={t} />` in place of A and `<PublishContentActions view={view} t={t} />` in place of B. `PublishContentSectionProps` must be declared above `PublishContentDialog`'s use only at type level — no reordering needed (interfaces hoist).
- **Importers to update:** none.
- **After:** file ~297; `PublishContentDialog` ~28; `PublishContentPeerPicker` ~32; `PublishContentActions` ~62.
- **Risks / notes:** the start/confirm button swap relies on `key` across sibling elements — both stay inside the same parent `<span>` in the new component, so remount semantics are unchanged.
