# features/forms

Form definitions and submissions — the two screens behind the sidebar's **Content → Forms** entry.

| file | what it is |
|---|---|
| `FormsList.tsx` | List view of form definitions, create/delete. |
| `FormEditor.tsx` | Per-form field builder plus the submissions table (`DataTable`) and notify settings. Pulls in `styles/form-field-attrs.css`. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- The public-facing form-rendering/submission runtime — this feature only edits the definition and
  reads submissions already recorded.

## Notes for anyone editing here

Both `FormsList.tsx` and `FormEditor.tsx` have unit tests (`__tests__/`).
