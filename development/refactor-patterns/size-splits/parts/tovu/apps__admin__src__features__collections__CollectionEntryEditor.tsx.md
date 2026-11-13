### tovu:apps/admin/src/features/collections/CollectionEntryEditor.tsx
- **Over:** `CollectionEntryEditor` 103 (file 400, under)
- **Phase:** now (?) · **Batch:** size-15
- **Tests:** `apps/admin/src/features/collections/__tests__/CollectionEntryEditor.unit.test.tsx`, `CollectionEntryEditor.dynamic-field.unit.test.tsx`, `collections-agent-drive.unit.test.tsx` (same folder)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | the `<label className="a11y-label-wrap">` title field (~L462) | entry title input |
| B | `EntryPageActions`, `EntrySlugField`, `EntryFieldsSection` (exist) | header actions / slug / dynamic fields |
| C | `CollectionEntryEditor` | hook call, guards, compose (stays) |

- **Splits** (same file, module level, above `CollectionEntryEditor`, after `EntrySlugField`):
  1. SUB-COMPONENT `EntryTitleField({ title, onTitleChange, t }: EntryTitleFieldProps): JSX.Element` ← the `<label className="a11y-label-wrap">` element; `setTitle` → `onTitleChange` inside. Types: `title: string`, `onTitleChange: (next: string) => void`, `t` = same type `EntrySlugField` takes.
- **Importers to update:** none.
- **After:** file ~410; `CollectionEntryEditor` ~94; `EntryTitleField` ~12.
- **Risks / notes:** keep any agent-handle spread / `aria-*` on the input verbatim.
