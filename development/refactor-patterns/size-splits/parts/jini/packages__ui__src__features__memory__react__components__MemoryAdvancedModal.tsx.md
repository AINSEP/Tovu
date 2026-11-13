### jini:packages/ui/src/features/memory/react/components/MemoryAdvancedModal.tsx
- **Over:** `MemoryAdvancedModal` 172 (file 176, fine)
- **Phase:** now · **Batch:** size-35
- **Tests:** `src/features/memory/__tests__/react/components/MemoryAdvancedModal.test.tsx`, `src/features/memory/__tests__/index.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `MemoryAdvancedModal` portal shell (backdrop, dialog, head) | modal chrome + open/host guard |
| B | first `<details className="library-group memory-advanced-card">` (MEMORY.md index textarea + Reset/Save row) | raw index editor |
| C | `treeFolders.length > 0 ? (<details ...>` block | technical memory-tree view |
| D | body of `treeFolders.map((folder) => { ... })` | one folder card with its child rows |

- **Splits** (same file, sub-components at module level above `MemoryAdvancedModal`, in this order; each calls `const t = useT();` itself like the parent; JSX moved verbatim incl. inline styles):
  1. SUB-COMPONENT `MemoryTreeFolderCard({ folder, nodes, onStartEdit }: MemoryTreeFolderCardProps): JSX.Element` ← the JSX returned inside `treeFolders.map` (the `<div key={folder.id} className="library-card" ...>` element, minus `key`), with the local `children` renamed `nodes` (a prop named `children` would collide with React's). Props: `folder: MemoryTreeNode; nodes: MemoryTreeNode[]; onStartEdit: (id: string) => void`. The parent map keeps `const children = treeChildren.get(folder.id) ?? [];` and renders `<MemoryTreeFolderCard key={folder.id} folder={folder} nodes={children} onStartEdit={onStartEdit} />`.
  2. SUB-COMPONENT `MemoryTreeDetails({ memoryTree, treeFolders, treeChildren, onStartEdit }: MemoryTreeDetailsProps): JSX.Element` ← the `<details ...>` of unit C (the `treeFolders.length > 0 ? ... : null` guard stays in the parent).
  3. SUB-COMPONENT `MemoryIndexEditorDetails({ index, indexDraft, onIndexDraftChange, onSaveIndex, busy }: MemoryIndexEditorDetailsProps): JSX.Element` ← unit B's `<details>` verbatim.
  4. `MemoryAdvancedModal` keeps `useT`, the `if (!open || !modalHost) return null;` guard, `createPortal(...)`, backdrop (with its "why" comment on `onMouseDown`), dialog, head, body/stack, and renders B and C.
- **Importers to update:** none (no exports move; sub-components are module-private).
- **After:** file ~185; `MemoryAdvancedModal` ~45; `MemoryIndexEditorDetails` ~55; `MemoryTreeDetails` ~22; `MemoryTreeFolderCard` ~50.
- **Risks / notes:** pure JSX lift; DOM order and classNames unchanged so tests' queries keep working. No mocks of this file.
