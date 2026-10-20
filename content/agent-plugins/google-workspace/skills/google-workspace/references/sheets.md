# Google Sheets

Tools appear as `p_google_workspace__<name>`. Every spreadsheet tool takes the `connectionRef` of the
connection; tools on an existing file also take its `spreadsheetId`.

## Choosing a spreadsheet

- **Existing spreadsheet:** the person picks it with Google's file picker. That pick is what lets
  Tovu open the file. A pasted link is not enough.
- **New spreadsheet:** Tovu can create one; Tovu then has access to it automatically.
- If the person cancels the picker, keep the current settings.

## Reading and changing data

- Reads are bounded (about 500 rows or 5,000 cells at a time). For more, read the next range.
- Values a visitor or the person typed are written **as text exactly as given** (`RAW`); Tovu never
  turns them into formulas.
- Changing, clearing or deleting data shows the person a confirmation card first. Only their click
  approves it. Remote changes cannot be undone from Tovu.
- If a change comes back with `outcome: "unknown"`, ask the person to check the spreadsheet before
  trying again.

## Limits

Google allows each account about 60 requests a minute; Tovu keeps under that (about 45 per account
and 240 per site). When Google asks Tovu to wait, Tovu waits; nothing is lost.

## Tabs, sorting, filters, formatting and structure

Each of these tools takes `connectionRef` and `spreadsheetId`. Tabs are named by their numeric
`sheetId` (it survives renames); ranges are grid ranges with zero-based, end-exclusive indices, for
example `{ "sheetId": 0, "startRowIndex": 1, "endRowIndex": 10, "startColumnIndex": 0, "endColumnIndex": 4 }`
is rows 2-10, columns A-D.

| Tool | What it does | Confirmation |
|---|---|---|
| `sheets_tab_modify` | add, rename, delete, duplicate or move a tab | danger card (delete removes the tab's data) |
| `sheets_sort` | reorder rows of a range by up to 10 columns | danger card (the old order is gone) |
| `sheets_basic_filter` | get, set or clear a tab's filter | card |
| `sheets_filter_views` | list, add, update, duplicate or delete saved filter views | danger card |
| `sheets_format` | number formats, fonts, colours, alignment, wrapping, borders, frozen rows/columns, column widths | card; never changes values |
| `sheets_named_ranges` | list, add, update or delete named ranges | danger card (formulas follow the name) |
| `sheets_protected_ranges_get` | protected ranges, editors, and whether this account may edit | none (read) |
| `sheets_developer_metadata` | get metadata by id or search with data filters | none (read) |
| `sheets_batch_update` | up to 100 raw Sheets requests in one atomic call | danger card listing every request kind |
| `sheets_export_csv` | one tab (or `A1:F500` of it) as a downloadable CSV file | none (read) |
| `sheets_open_existing` | check a picked spreadsheet, or point the person to the picker | none (read) |

- `sheets_format`: give `cellFormat` together with `fields`, the exact format properties to set
  (for example `["textFormat.bold", "numberFormat"]`). Properties not listed stay as they are.
- `sheets_open_existing` without `spreadsheetId` answers `waiting`: ask the person to choose the file
  with Google's picker in the Google Workspace plugin, or offer to create a new spreadsheet.
  `file-not-granted` means the file was never picked (or was trashed); `wrong-file-type` means it is
  not a spreadsheet.
- `sheets_export_csv` reads at most 20,000 rows and 100,000 cells and writes at most 4 MiB. A bigger
  tab is refused (`limit-exceeded`), never cut short: export a range instead. It returns a file
  reference, not the data.
- Answers over 64 KiB are refused with `limit-exceeded`: narrow to one tab or fewer items.

## Raw batch updates (`sheets_batch_update`)

Each request object names exactly one request kind, for example
`{ "insertDimension": { "range": { "sheetId": 0, "dimension": "ROWS", "startIndex": 5, "endIndex": 7 } } }`.
Field masks (`fields`) must name the properties to change; `*` is refused because it resets
everything else. A batch is all-or-nothing at Google.

Supported request kinds. Changes data or protection (shown as destructive on the card):
`updateSheetProperties`, `repeatCell`, `deleteNamedRange`, `deleteSheet`, `autoFill`, `cutPaste`,
`copyPaste`, `mergeCells`, `updateCells`, `deleteDimension`, `deleteEmbeddedObject`,
`deleteFilterView`, `findReplace`, `pasteData`, `textToColumns`, `deleteRange`,
`deleteConditionalFormatRule`, `sortRange`, `addProtectedRange`, `updateProtectedRange`,
`deleteProtectedRange`, `deleteBanding`, `deleteDeveloperMetadata`, `randomizeRange`,
`deleteDimensionGroup`, `trimWhitespace`, `deleteDuplicates`, `deleteTable`.

Other changes: `updateSpreadsheetProperties`, `updateDimensionProperties`, `updateNamedRange`,
`addNamedRange`, `addSheet`, `unmergeCells`, `updateBorders`, `addFilterView`, `appendCells`,
`clearBasicFilter`, `duplicateFilterView`, `duplicateSheet`, `insertDimension`, `insertRange`,
`moveDimension`, `updateEmbeddedObjectPosition`, `updateFilterView`, `appendDimension`,
`addConditionalFormatRule`, `updateConditionalFormatRule`, `setDataValidation`, `setBasicFilter`,
`autoResizeDimensions`, `addChart`, `updateChartSpec`, `updateBanding`, `addBanding`,
`createDeveloperMetadata`, `updateDeveloperMetadata`, `addDimensionGroup`, `updateDimensionGroup`,
`updateEmbeddedObjectBorder`, `addSlicer`, `updateSlicerSpec`, `addTable`, `updateTable`.

Not supported: the Connected Sheets data-source kinds (`addDataSource`, `updateDataSource`,
`deleteDataSource`, `refreshDataSource`, `cancelDataSourceRefresh`) need a BigQuery permission Tovu
does not ask for. Any kind not listed is refused with `unsupported-request` before anything is sent.

If a batch that adds, inserts, appends, moves or deletes by position comes back with
`outcome: "unknown"`, it may already be applied: ask the person to check before sending it again.
