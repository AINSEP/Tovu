# Sending form submissions to Google Sheets

The **Google Sheets** form destination adds each accepted submission as a new row.

The person picks where each form goes in the plugin's **Form destinations** tab: the form's short
name, a spreadsheet (one already chosen, or Google's file picker), and a tab. Tovu checks with Google
that the account can open that spreadsheet and that the tab exists before saving; a pasted id that
was never chosen is refused. Saving asks them to confirm that rows stay in the spreadsheet. Saving
turns delivery on for that form straight away: there is nothing to copy into Tovu's settings, and
removing the destination there stops new rows (rows already written stay in the spreadsheet).

- Each form goes to its own tab. Tovu remembers the tab by its id, so renaming the tab is safe.
- The first row holds the headers: `_tovu_submission_id`, `_tovu_submitted_at`, then the field
  labels. The visitor's IP address is never sent.
- Checkbox groups are joined with ", ". Values are written as plain text, never as formulas.
- A new form field becomes a new column at the end. Tovu tags each column it writes with the
  field's id (hidden spreadsheet metadata, not visible in cells), so existing columns never change
  meaning: editing a field's label, renaming a header, or inserting or moving columns keeps each
  field's answers in its own column. Deleting a column removes its tag; the field then gets a new
  column.
- Every submission stays saved in Tovu, whatever happens to the spreadsheet. If Google is slow or
  asks Tovu to slow down, deliveries wait and resume.
- Delivery is **at least once with best-effort dedupe**: before every append Tovu looks for the
  submission id in the `_tovu_submission_id` column (and looks again if Google's answer was lost),
  so a retry normally does not add a duplicate. A duplicate is still possible in rare cases (for
  example another person or tool writing to the same tab at the same moment). When Tovu finds the
  same submission id on two or more rows it does not add another; the delivery says "duplicate
  submission id: review" with the row numbers, so the person can delete the extra row.
- Deleting a submission in Tovu does **not** delete its row in the spreadsheet. When the person
  turns this destination on, tell them: "Rows already sent to Google Sheets stay in the spreadsheet
  if you delete the submission in Tovu."
- Turning Sheets off pauses deliveries; it does not lose them.

## When a delivery fails

| code | what it means | what to do |
|---|---|---|
| `authorization-required` | Google no longer accepts the sign-in (reconnect required) or a permission is missing. | Reconnect Google Workspace with the same account; the failed delivery stays listed in Tovu. |
| `resource-not-granted` | The connected account cannot open this spreadsheet. | Choose the spreadsheet again with the file picker. |
| `configuration-invalid` | The destination does not name a tab for this form, or the tab was deleted. | Choose the tab again in the destination settings. |
| `mapping-invalid` | The columns cannot be matched: `_tovu_submission_id` or `_tovu_submitted_at` is missing from row 1, a header appears twice, two fields share a label, or one field's hidden column tag appears on two columns (another tool copied it). | Repair the headers in row 1 (or give the fields distinct labels); for a doubled tag, delete the extra column. |
| `destination-limit` | The tab has more than 50,000 rows, too many to check for duplicates. | Point the form at a new tab or spreadsheet. |
| `rate-limited` | Google asked Tovu to slow down. | Nothing; it retries after the wait. |
| `outcome-unknown` | Google did not confirm the append and the row was not found. | Nothing; the next try checks again before appending. |
| `adapter-unavailable` | Sheets is turned off for the plugin. | Turn Sheets on; waiting deliveries resume. |
| `delivery-failed` | Google was unavailable or answered unexpectedly. | Usually nothing; it retries. |
