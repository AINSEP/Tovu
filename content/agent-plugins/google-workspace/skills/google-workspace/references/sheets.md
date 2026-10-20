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

## Spreadsheet, values and search tools

All names below take the `p_google_workspace__` prefix. Every call needs `connectionRef`; calls on an
existing file also need `spreadsheetId` (the id from the picker or from `sheets_create`).

| To… | Use | Asks the person first? |
|---|---|---|
| See the title, URL and tabs (tab ids for other tools) | `sheets_get` | no |
| Read one range | `sheets_values_get` with `range`, for example `'Leads'!A1:D50` | no |
| Read several ranges at once (up to 20) | `sheets_values_batch_get` | no |
| Find cells containing a text (up to 20 ranges) | `sheets_find` | no |
| Read by data filter (A1, grid range or developer metadata) | `sheets_get_by_data_filter` (metadata) or `sheets_values_by_data_filter` with `action: "get"` (values) | the second one does |
| Make a new spreadsheet | `sheets_create` | yes |
| Copy a whole spreadsheet | `sheets_copy` | yes |
| Copy one tab into another spreadsheet | `sheets_copy_tab` with the numeric `sheetId` | yes |
| Add rows after the existing table | `sheets_values_append` | yes |
| Overwrite cells | `sheets_values_update` (one range) or `sheets_values_batch_update` (up to 100) | yes, as a destructive change |
| Clear cells | `sheets_values_clear` or `sheets_values_batch_clear` | yes, as a destructive change |
| Replace a text everywhere on a tab or in every tab | `sheets_find_replace` (`sheetId` or `allSheets: true`) | yes, as a destructive change |

### Reading a lot of data

A read returns at most 500 rows, 5,000 cells or 64 KiB. When there is more, the result has
`continuation`: call `sheets_values_get` with exactly that range to read the next part. Do not guess
the next range yourself. `sheets_get` and `sheets_get_by_data_filter` have no continuation: when
their answer would be too large they fail with `limit-exceeded`; ask for fewer ranges or leave out
grid data. `sheets_find` searches at most 50,000 cells and returns at most 100 matches
(`truncated: true` means there were more); narrow the ranges when it says `limit-exceeded`.

### Writing values

- Values are stored **as text exactly as given** (`RAW`). Only pass
  `valueInputOption: "USER_ENTERED"` when the person explicitly wants Sheets to interpret the values
  (formulas, dates); never for text a visitor typed.
- One write body is at most 1 MiB; split bigger writes into several calls.
- `sheets_values_append` inserts new rows below the table, so nothing under it is written over.

### When the answer is lost

`sheets_values_append`, `sheets_create`, `sheets_copy`, `sheets_copy_tab` and `sheets_find_replace`
are never repeated automatically. If one fails with `uncertain-outcome` (`outcome: "unknown"`), ask
the person to look at the spreadsheet (or their Drive) first; repeating it could add the rows, the
file or the replacement twice.

### Errors these tools add

- `invalid-input`: the request was refused before anything was sent (for example a malformed id or
  range). Fix it and try again.
- `limit-exceeded`: the request or its answer is bigger than the tool allows. Ask for less.
