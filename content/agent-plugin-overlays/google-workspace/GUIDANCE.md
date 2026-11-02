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
