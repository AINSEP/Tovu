### tovu:apps/admin/src/features/taxonomy/hooks/use-term-picker.hooks.ts
- **Over:** `useTermPicker` 164 (file 237, under)
- **Phase:** now (survey label `?`) · **Batch:** size-06
- **Tests:** `apps/admin/src/features/taxonomy/__tests__/use-term-picker.unit.test.tsx`, `TermPicker.unit.test.tsx` (same folder)
- **Responsibility map:**

| unit | statements in `useTermPicker` | job |
|---|---|---|
| A | `names`, `openAdds`, `createTarget` (+ comment) states, `clearNewTermName`, `setNewTermName`, `setAddOpen` | per-taxonomy "new term" field state |
| B | `createMutation`, `groupOf`, `addTerm`, `pickSuggestion`, `onNewTermKeyDown` (+ IME/Escape/Enter comments), `showAddInput`, and the return's `showAddTrigger`, `newTermName`, `creating`, `createError`, `suggestions` closures | create-and-tick a new term |
| C | queries, `draft`/`message`, reset effect, `selected`, `canCreate`, `saveMutation`, `tick`, `toggle`, `add`/`remove`/`dirty`, `save`, `error`, `hidden/loading`, return | assigned-term selection + save (stays) |

- **Splits** (same file, module level, above `useTermPicker`, in run order):
  1. SUB-HOOK `useNewTermFields(): { names; openAdds; createTarget; setCreateTarget; clearNewTermName; setNewTermName; setAddOpen }` ← unit A verbatim.
  2. SUB-HOOK `useNewTermEntry({ port, locale, taxonomies, canCreate, selected, tick, fields }: UseNewTermEntryInput): Pick<TermPickerController, "showAddInput" | "showAddTrigger" | "setAddOpen" | "newTermName" | "setNewTermName" | "onNewTermKeyDown" | "addTerm" | "pickSuggestion" | "creating" | "createError" | "suggestions">` ← unit B; `fields` = step 1's result; the five return closures move verbatim into this hook's return object.
  3. `useTermPicker`: call `useNewTermFields()` where the `names` state is now, `useNewTermEntry({...})` after `tick` is declared (keep `createMutation`'s hook position relative to `saveMutation`: after it), and replace the eleven moved return fields with `...newTermEntry` at the same place in the return (after `canCreate`).
- **Importers to update:** none.
- **After:** file ~250; `useTermPicker` ~72; `useNewTermEntry` ~70; `useNewTermFields` ~25.
- **Risks / notes:** `taxonomies: AdminTaxonomyGroup[]`-like type — reuse the type of `taxonomiesQuery.data.items` (the existing `NO_TAXONOMIES` constant's type). `tick` must be passed after its declaration (it is a plain function; hoisting would allow earlier, but keep order). The `t({ locale, key })` in `createError` is the module import, not the hook's `t` closure.
