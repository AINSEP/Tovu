### jini:packages/admin/src/forms/react/components/FormFieldsEditor.tsx
- **Over:** `FormFieldsEditor` 204 · `<arg of rows.map>` 110
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/forms/react/__tests__/field-row-editing.unit.test.tsx`, `.../use-form-fields-editor.hooks.unit.test.tsx`, `.../forms-view.hooks.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `<td data-label={t("ID")}>`, `"Label"`, `"Type"` cells | identity + type cells of one row |
| B | `<td data-label={t("Required")}>`, `"Max length"`, `"Settings"`, `form-field-remove-cell` | row options + actions cells |
| C | `<tr key={index}>` wrapper = `rows.map` callback | one field row |
| D | `<table>` head/tfoot, dialog, hooks | table shell |

- **Splits:**
  1. SUB-COMPONENT `FormFieldIdentityCells({ row, t }: FormFieldIdentityCellsProps): JSX.Element` (fragment `<>…</>`) ← the ID, Label, Type `<td>`s verbatim; reads the row fields (`field, index, isExisting, base, onId, onLabel, onType, typeGroups`) from `row`.
  2. SUB-COMPONENT `FormFieldOptionCells({ row, onChange, t }: FormFieldOptionCellsProps): JSX.Element` ← Required, Max length, Settings, remove `<td>`s verbatim (`onChange` only if the remove cell reads it).
  3. SUB-COMPONENT `FormFieldRow({ row, onChange, t }: FormFieldRowProps): JSX.Element` ← the `<tr key={index}>` element; renders 1 + 2. `row` type = element type of `useFormFieldsView`'s `rows` (export `FormFieldsViewRow` from `forms-view.hooks.ts` if not exported). The `rows.map` becomes `rows.map((row) => <FormFieldRow key={row.index} row={row} … />)` — key moves from `<tr>` to the component.
  4. `FormFieldsEditor` keeps table/thead/tfoot/dialog (incl. the "MAX LENGTH" header comment and the field-id uniqueness comment).
- **Importers to update:** none.
- **After:** `FormFieldsEditor` ~95; `FormFieldRow` ~15; cells ~45 / ~65; file ~230.
- **Risks / notes:** `ref` from row is a callback ref on an input — pass through `row`, unchanged. Destructuring in the old callback params disappears; inside sub-components destructure from `row` so JSX stays verbatim.
