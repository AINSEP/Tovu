### tovu:apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts
- **Over:** `useMenuEditor` 190 (file 317, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/menus/__tests__/use-menu-editor.hooks.unit.test.tsx`, `MenuEditor.unit.test.tsx`, `menu-html-mode.unit.test.tsx`, `legacy-page-picker.unit.test.tsx`, `html-embed.unit.test.tsx`, `page-choices.hooks.unit.test.tsx`, `menu-authoring-ux.unit.test.tsx` (same folder), `apps/admin/src/__tests__/fqfix-editor-reopen.unit.test.tsx`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `items` state + `changeAt`, `removeAt`, `addChildAt`, `moveAt`, `addRootItem` | tree edits |
| B | `needsPages`, `pageQueryFetch`, `pageQuery`, `pageChoices` | page options for page-link items |
| C | `hydratedRoute`, `loadNavigation`, the load `useEffect(() => { if (hydratedRoute.current === menuId)…` | route-param load + stale guard |
| D | `copyFeedback`, `copyHtmlEmbed` | copy HTML embed marker |
| E | `savingRef`, `saving`, `save` | save with re-entry + stale guards |
| F | rest (`isNew`, loader, `write`, form states, `original`, `useDirtyGuard`, `activeMenuIdRef`, `changeTitle`, `changeSlug`, `changeMode`, return) | form state (stays) |

- **Splits** (same file, module level, above `useMenuEditor`, in run order; repo ESLint loads no react-hooks plugin, so setters passed into sub-hooks raise no deps warnings):
  1. SUB-HOOK `useMenuItemsTree({ itemIdSource }: UseMenuItemsTreeInput): { items; setItems; changeAt; removeAt; addChildAt; moveAt; addRootItem }` ← `const [items, setItems] = useState<AdminMenuItem[]>([]);` + the five tree functions (signatures unchanged; they are returned closures).
  2. SUB-HOOK `useMenuPageChoices({ port, items }: UseMenuPageChoicesInput): AdminPage-list type of pageQuery.data | undefined` ← `const needsPages = hasPageLinks({ items });` through `const pageChoices = needsPages ? …`.
  3. SUB-HOOK `useMenuHtmlEmbedCopy({ menu, menuId, clipboard, slug, activeMenuIdRef, t, error, message }: UseMenuHtmlEmbedCopyInput): { copyFeedback; setCopyFeedback; copyHtmlEmbed }` ← `const [copyFeedback, setCopyFeedback] = useState<string | null>(null);` + `async function copyHtmlEmbed()`. Move `activeMenuIdRef` (+ its "Stale-response guard, save() half" comment and the `.current = menuId` line) up so it is declared before this call.
  4. SUB-HOOK `useMenuRouteLoad({ menuId, isNew, loader, navigate, slugEdited, setters }: UseMenuRouteLoadInput): void` with `interface MenuRouteLoadSetters { setCopyFeedback; setMenu; setTitle; setSlug; setItems; setMode; setHtml; setOriginal; setLoading; setError }` ← `const hydratedRoute = useRef<…>(undefined);`, `const loadNavigation = useRef(navigate);`, `loadNavigation.current = navigate;`, and the whole load `useEffect` (deps array `[menuId, isNew, loader]` unchanged; destructure `setters` at the top of the sub-hook). The 2026-08-12 "Stale-response guard" comment moves with `loadNavigation`.
  5. SUB-HOOK `useMenuSave({ menuId, isNew, menu, title, slug, items, mode, html, pageChoices, write, port, navigate, t, activeMenuIdRef, setMenu, setItems, setHtml, setOriginal, setMessage, setError }: UseMenuSaveInput): { saving: boolean; save: () => Promise<void> }` ← `const savingRef = useRef(false);` (+ S4a comment), `const [saving, setSaving] = useState(false);`, `async function save()`.
  6. Call order in `useMenuEditor`: isNew/fetchMenu/menuKey/loader/write → menu/title/slug/slugEdited → `useMenuItemsTree` → mode/html → `useMenuPageChoices` → message/error/loading/original → `activeMenuIdRef` → `useMenuHtmlEmbedCopy` → `useMenuRouteLoad` → `useDirtyGuard` → `useMenuSave` → changeTitle/changeSlug/changeMode → return.
- **Importers to update:** none (no export moves).
- **After:** file ~345; `useMenuEditor` ~80; `useMenuRouteLoad` ~55; `useMenuSave` ~45.
- **Risks / notes:** `save`'s `savingForMenuId` vs `activeMenuIdRef.current` guard must read the SAME ref object as `copyHtmlEmbed` — pass the ref, not `.current`. Hook order changes by grouping only.
