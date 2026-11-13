### tovu:apps/admin/src/features/menus/MenuEditor.tsx
- **Over:** `MenuEditor` 102 (file 424, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/menus/__tests__/MenuEditor.unit.test.tsx`, `MenuEditor.remove-hook.unit.test.tsx`, `menu-html-mode.unit.test.tsx`, `legacy-page-picker.unit.test.tsx`, `html-embed.unit.test.tsx`, `menu-authoring-ux.unit.test.tsx`, `menus-i18n.unit.test.ts` (same folder)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `MenuItemTargetFields`, `MenuItemAttrsFields`, `ItemRow`, `MenuModeTabs`, `MenuEditorHeader` (exist) | row / tabs / header markup |
| B | the `: ( <div className="menu-tree">` branch of `{mode === "html" ? (` | options-mode item tree + "+ Add item" |
| C | `MenuEditor` | hook call, loading/error, title row, mode switch |

- **Splits** (same file, module level, directly above `MenuEditor`):
  1. SUB-COMPONENT `MenuItemTree({ items, pages, onChangeAt, onRemoveAt, onAddChildAt, onMoveAt, onAddRootItem, t }: MenuItemTreeProps): JSX.Element` ← the `<div className="menu-tree">` element (incl. the "Secondary, not bare/primary" comment). Prop types: `MenuEditorController["items"]`, `["pageChoices"]`, `["changeAt"]`, `["removeAt"]`, `["addChildAt"]`, `["moveAt"]`, `["addRootItem"]`, `["t"]` (import the controller type from `./hooks/use-menu-editor.hooks` — already exported). `MenuEditor` renders `<MenuItemTree items={items} pages={pageChoices} onChangeAt={changeAt} … />` in the else branch.
- **Importers to update:** none (no export moves; `targetForKind` re-export untouched).
- **After:** file ~435; `MenuEditor` ~82; `MenuItemTree` ~28.
- **Risks / notes:** `ItemRow`'s `key={item.id}` and `path={[i]}` move unchanged. Props only (no `editor` object passed to the new component).
