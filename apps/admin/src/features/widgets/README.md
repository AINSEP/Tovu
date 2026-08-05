# features/widgets

Widget instances and the regions they're placed into — four screens behind the sidebar's
**Content → Widgets** entry.

| file | what it is |
|---|---|
| `WidgetsLibrary.tsx` | List of all widget instances, create/delete. |
| `WidgetInstanceEditor.tsx` | Per-widget config editor, plus "where used" (which regions reference it). |
| `WidgetRegions.tsx` | List of widget regions (areas a theme exposes). |
| `WidgetRegionEditor.tsx` | Per-region placement editor — add/remove/reorder widget instances within a region. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **`components/WidgetConfigFields`** and **`components/WidgetPickerDialog`** — shared widget-config
  UI used by this feature (and elsewhere), kept under `components/` rather than moved here.

## Notes for anyone editing here

`WidgetsLibrary.tsx` and `WidgetInstanceEditor.tsx` have unit tests (`__tests__/`).
`WidgetRegions.tsx` and `WidgetRegionEditor.tsx` do not — treat changes there as unverified until
driven in a browser.
