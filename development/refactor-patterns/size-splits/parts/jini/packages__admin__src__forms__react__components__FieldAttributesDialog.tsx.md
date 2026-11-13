### jini:packages/admin/src/forms/react/components/FieldAttributesDialog.tsx
- **Over:** `FieldAttributesDialog` 149
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/forms/react/__tests__/field-row-editing.unit.test.tsx`, `.../FieldSettingsSection.unit.test.tsx`, `.../use-field-attributes-dialog.hooks.unit.test.ts`, `packages/admin/src/forms/__tests__/field-settings.unit.test.ts` (pkg `@jini-ai/admin`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `<div className="field">` inside `<details className="field-settings-advanced">` (~L59-79) | CSS class input |
| B | `<div className="field-attrs-rows">` (~L81-146: datalist, `rows.map`, add-row button) | HTML attribute rows editor |
| C | rest (hooks, `<form>`, `FieldSettingsSection`, error, `editor-actions`) | dialog shell |

- **Splits:**
  1. SUB-COMPONENT `FieldClassNameInput({ className, onClassName, t }: FieldClassNameInputProps): JSX.Element` (same file, above) ← unit A verbatim incl. the "five-line explainer … ⓘ tip" comment.
  2. SUB-COMPONENT `FieldAttributeRows({ rows, addRow, t }: FieldAttributeRowsProps): JSX.Element` ← unit B verbatim. `rows` typed as the `useFieldAttributesView` return's `rows` (export that type from `use-field-attributes-dialog.hooks.ts` / wherever `useFieldAttributesView` lives if not already exported). Add any other names the block reads (check `displayName`, `fieldIndex`).
  3. Dialog renders both in place. Hooks untouched.
- **Importers to update:** none.
- **After:** `FieldAttributesDialog` ~60; `FieldAttributeRows` ~70; file ~180.
- **Risks / notes:** the "One dialog is ever open at a time" comment stays with `const { className, addRow, error, submit } = controller;`. `datalist id` must stay unique — still one instance.
