# Tovu host guidance for google-workspace

This Tovu guidance comes before the portable `google-workspace` skill and names Tovu's tools and
screens for each job the skill describes. In the skill, "this site" and "the host" mean Tovu. Where
the two differ, this guidance is the more specific one.

## Tovu tools for each job

| Job | Tovu |
|---|---|
| Turn the plugin on | `plugins_set_enabled` (family `agent-plugin`, `pluginId: "google-workspace"`), or the person uses the Agent Plugins screen |
| Connect (the skill's "connect action") | `agent_plugin_connect { pluginId: "google-workspace" }`. It answers `{ status, connectionRef }`; when already connected it answers at once without a new sign-in, so call it again if you lost `connectionRef` |
| Open the own-client card | `credential_save { kind: "plugin-provider", target: "google-workspace-oauth-client" }` |
| Plugin tools | Tovu shows each plugin tool as `p_google_workspace__<name>`, for example `p_google_workspace__account_info { connectionRef }` and `p_google_workspace__sheets_get` |

## Tovu screens and routes

- The plugin's admin page is **Agent Plugins → Google Workspace** (tabs Google Workspace, Choose
  spreadsheet, Form destinations).
- Tovu's own Google sign-in app shows **Tovu** on Google's consent screen.
- Own OAuth client: the **Web application** redirect URI is
  `<this site's address>/api/agent-plugins/connections/oauth/callback`; choose **Desktop app** for
  Tovu desktop. Use **Admin → Access Tokens → Add custom provider** only if the plugin card is
  unavailable, and fix a wrong saved client under **Admin → Access Tokens**.
- Submissions stay saved in Tovu's form submissions whatever happens to the spreadsheet.


## Host details for skills/google-workspace/references/connection.md

To go back to the host's own client, delete that saved credential and reconnect. On a hosted site the file
picker uses the site's Picker settings (`TOVU_GOOGLE_PICKER_BROWSER_KEY`, `TOVU_GOOGLE_PICKER_APP_ID`):
with your own client the operator sets them to that project's browser key and project number, or the
picker cannot open the chosen files.



## Host details for skills/google-workspace/references/form-delivery.md

- Each form goes to its own tab. This site remembers the tab by its id, so renaming the tab is safe.
- The first row holds the headers: `_tovu_submission_id`, `_tovu_submitted_at`, then the field
  labels. The visitor's IP address is never sent.
- Checkbox groups are joined with ", ". Values are written as plain text, never as formulas.
- A new form field becomes a new column at the end. This site tags each column it writes with the
  field's id (hidden spreadsheet metadata, not visible in cells), so existing columns never change
  meaning: editing a field's label, renaming a header, or inserting or moving columns keeps each
  field's answers in its own column. Deleting a column removes its tag; the field then gets a new
  column.
- Every submission stays saved in this site, whatever happens to the spreadsheet. A delivery that cannot
  go through yet (Google slow or asking this site to slow down, Google unavailable, Sheets turned off) is
  retried about 8 times over about a day; after that it is marked failed and is not sent again.
  A sign-in problem (`authorization-required`) fails the delivery at once.
- Delivery is **at least once with best-effort dedupe**: before every append this site looks for the
  submission id in the `_tovu_submission_id` column (and looks again if Google's answer was lost),
  so a retry normally does not add a duplicate. A duplicate is still possible in rare cases (for
  example another person or tool writing to the same tab at the same moment). When this site finds the
  same submission id on two or more rows it does not add another, and the delivery counts as done.
  This site does not show such duplicates anywhere yet: if the person suspects one, sort or filter the
  sheet by `_tovu_submission_id` and delete the extra row.
- Deleting a submission in this site does **not** delete its row in the spreadsheet. When the person
  turns this destination on, tell them: "Rows already sent to Google Sheets stay in the spreadsheet
  if you delete the submission in this site."
- Turning Sheets off does not pause deliveries indefinitely: they are retried for about a day, then
  marked failed. Turn Sheets back on within that window.

| code | what it means | what to do |
|---|---|---|
| `authorization-required` | Google no longer accepts the sign-in (reconnect required), a permission is missing, or the destination still belongs to the account used before a switch. | Same account: reconnect Google Workspace. After a switch: choose the spreadsheet again in Form destinations (or tick it when confirming the switch). The failed delivery stays listed in this site as failed; it is not sent again. |
| `resource-not-granted` | The connected account cannot open this spreadsheet. | Choose the spreadsheet again with the file picker. |
| `configuration-invalid` | The destination does not name a tab for this form, or the tab was deleted. | Choose the tab again in the destination settings. |
| `mapping-invalid` | The columns cannot be matched: `_tovu_submission_id` or `_tovu_submitted_at` is missing from row 1, a header appears twice, two fields share a label, or one field's hidden column tag appears on two columns (another tool copied it). | Repair the headers in row 1 (or give the fields distinct labels); for a doubled tag, delete the extra column. |
| `destination-limit` | The tab has more than 50,000 rows, too many to check for duplicates. | Point the form at a new tab or spreadsheet. |
| `rate-limited` | Google asked this site to slow down. | Usually nothing; it retries after the wait, for about a day at most. |
| `outcome-unknown` | Google did not confirm the append and the row was not found. | Nothing; the next try checks again before appending. |
| `adapter-unavailable` | Sheets is turned off for the plugin. | Turn Sheets on. Deliveries still being retried (about a day) then go through; older ones stay failed. |
| `delivery-failed` | Google was unavailable or answered unexpectedly. | Usually nothing; it retries for about a day, then the delivery stays failed. |
