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
