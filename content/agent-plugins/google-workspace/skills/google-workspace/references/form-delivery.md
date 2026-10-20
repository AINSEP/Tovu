# Sending form submissions to Google Sheets

The **Google Sheets** form destination adds each accepted submission as a new row.

- Each form gets its own tab. Tovu remembers the tab by its id, so renaming the tab is safe.
- The first row holds the field labels. Tovu adds `_tovu_submission_id` and the submitted time. The
  visitor's IP address is never sent.
- Checkbox groups are joined with ", ". Values are written as plain text, never as formulas.
- A new form field becomes a new column at the end; existing columns never change meaning.
- Every submission stays saved in Tovu, whatever happens to the spreadsheet. If Google is slow or
  the account needs reconnecting, deliveries wait and resume.
- Delivery is **at least once**: before every append Tovu looks for the submission id in the sheet,
  so a retry normally does not add a duplicate, but a duplicate is still possible in rare cases.
- Deleting a submission in Tovu does **not** delete its row in the spreadsheet. Say so when the
  person turns the destination on.
- Turning Sheets off pauses deliveries; it does not lose them.

In this build the destination is declared but not active yet: deliveries wait in Tovu with
"Delivery to Google Sheets is not available in this build yet".
