### jini:packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFileRow.tsx
- **Over:** `AssetTreeFileRow` 140 (file 162, fine)
- **Phase:** now · **Batch:** size-36
- **Tests:** `src/features/asset-tree-browser/__tests__/react/components/AssetTreeFileRow.test.tsx`, `src/features/asset-tree-browser/__tests__/index.test.ts` (smoke: any `AssetTreeBrowser*.test.tsx` under `src/features/asset-tree-browser/__tests__` — complete with `rg -l "AssetTreeFileRow|AssetTreeBrowser" packages/ui/src/features/asset-tree-browser --glob '*.test.*'`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `lastActivationRef`, `handleNameKeyDown`, `handleMenuTrigger` | keyboard double-activation + menu-anchor handlers |
| B | first `<span className="asset-tree-row-check" …>` | hover-revealed select checkbox |
| C | `<div className="asset-tree-row-name-wrap">` (rename `<input>` vs name `<button>`) | name cell / inline rename |
| D | row shell, glyph, size/time cells, `⋯` menu span | row layout — stays |

- **Splits** (in order):
  1. NEW `AssetTreeFileRow.hooks.ts` — job: row handlers. `export function useAssetTreeFileRowHandlers({ path, onOpen, onSelectPreview, onOpenMenu }: UseAssetTreeFileRowHandlersInput): { handleNameKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void; handleMenuTrigger: (event: MouseEvent<HTMLSpanElement> | KeyboardEvent<HTMLSpanElement>) => void }` ← `const lastActivationRef = useRef…`, `function handleNameKeyDown…`, `function handleMenuTrigger…` verbatim, then `return { handleNameKeyDown, handleMenuTrigger };`. Input types: `Pick<AssetTreeFileRowProps, 'path' | 'onOpen' | 'onSelectPreview' | 'onOpenMenu'>` — to avoid a cycle, type the four fields explicitly (`path: string; onOpen: (path: string) => void; onSelectPreview: (path: string) => void; onOpenMenu: (path: string, anchor: MenuAnchorRect) => void`) instead of importing the props type. Imports `useRef`, React event types, `isDoubleActivation`, `MenuAnchorRect` from `../../rules.js`. Copy the doc sentence "Keyboard parity with the mouse: Enter/Space … row name button)." above the hook as well (keep it on the component too).
  2. SUB-COMPONENT in the original above `AssetTreeFileRow`: `AssetTreeRowCheckbox({ selected, displayName, onToggle }: AssetTreeRowCheckboxProps): JSX.Element` ← unit B verbatim, with `onToggleSelect(path)` replaced by `onToggle()`; parent passes `onToggle={() => onToggleSelect(path)}`. Calls `useT()`.
  3. SUB-COMPONENT `AssetTreeFileRowName({ displayName, kindLabel, renaming, onSelect, onOpenFile, onNameKeyDown, onRenameDraftChange, onCommitRename, onCancelRename }: AssetTreeFileRowNameProps): JSX.Element` ← unit C verbatim; `() => onSelectPreview(path)` → `onSelect`, `() => onOpen(path)` → `onOpenFile` (parent passes `onSelect={() => onSelectPreview(path)}` `onOpenFile={() => onOpen(path)}`), `handleNameKeyDown` → `onNameKeyDown`. Calls `useT()`.
  4. `AssetTreeFileRow` keeps `t`, `relativeTime`, `timeLabel`, calls `const { handleNameKeyDown, handleMenuTrigger } = useAssetTreeFileRowHandlers({ path, onOpen, onSelectPreview, onOpenMenu });`, and renders D with B/C. Remove `useRef`/`isDoubleActivation` imports if unused.
- **Importers to update:** none (no export moves).
- **After:** file ~175; `AssetTreeFileRow` ~60; `AssetTreeFileRowName` ~45; `AssetTreeRowCheckbox` ~25; hooks file ~30.
- **Risks / notes:** `autoFocus` and the `data-skip-rename-commit` blur guard stay on the same `<input>`. Only the `onClick`/`onDoubleClick` closures change form (inline arrow → passed arrow) — same calls. No `vi.mock` of this file.
