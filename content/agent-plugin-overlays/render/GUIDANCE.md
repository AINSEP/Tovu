# Tovu: generating render.yaml

For a coding agent or the operator's terminal, use
`tovu deploy config --target render --region <region>` to generate `render.yaml`. There is no chat
config-generation tool today: explain that gap and hand the command to the operator or a coding
agent. The command passes Tovu's production switch (`TOVU_RUNTIME_MODE=production`) and the local
site's `TOVU_SITE_ID`, and prints Tovu's notes (the headless-Chromium opt-in) after the plugin's.
Keep one server instance: Tovu's state is one SQLite file on the persistent disk.


## Host details for skills/render/SKILL.md

Choose the card yourself from its `usedFor` list. Reuse a saved key or working
sign-in for that task. Never offer a replacement unless the person asks.
Check `content_read.custom_credential {}` for a saved key first.
Otherwise open **Connect Render** with
`credential_save { kind: "plugin-provider", target: "render" }`; it saves as `Render API`.
The person creates the key under Account Settings → API Keys. A deploy hook URL
is not a key.
Saving a key deploys nothing. Untested: this connection has not been tried end to end.
Never ask for a key in chat. Never offer to replace a working key unless asked.


## Host operations for skills/render/SKILL.md

Use `deployment_ops_list_targets` with platform `render` to discover server
services. Optional `org` filters by workspace ID. Choose the existing `srv-…`
service; discovery refuses incomplete results at 500 services rather than hiding
choices. Then use `deployment_ops_deploy` with that target. Omit `ref` to use the
latest commit on the service's connected branch. Only a full 40-character commit
SHA is supported as an explicit `ref`; branch and tag names are refused.
The API must accept the request before the tool reports it started. A connection
failure may mean the request was accepted: inspect Render before retrying.

Keep the returned `dep-…` runId for `deployment_ops_status` and
`deployment_ops_wait`. A deploy queued behind a running one returns no runId; wait on
the service's latest deployment instead. Accepted does not mean live. Unknown states remain unknown.
`deployment_ops_logs` resolves the service's workspace and returns a bounded page
(at most 100 lines) of recent **service logs**, newest first, defaulting to Render's last-hour window.
These logs are not isolated to the selected deployment; a supplied runId is
checked through the service-scoped deployment endpoint. Branch filters are unsupported.
Check the live service after the deployment becomes healthy.
