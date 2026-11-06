# Tovu: generating railway.json

For a coding agent or the operator's terminal, use
`tovu deploy config --target railway --region <region>` to generate `railway.json`. There is no
chat config-generation tool today: explain the gap and hand the command to the operator or a
coding agent. `railway.json` has no variables section, so the command prints a
`railway variables set` step for Tovu's production switch (`TOVU_RUNTIME_MODE=production`) and the
local site's `TOVU_SITE_ID`, then Tovu's notes (the headless-Chromium opt-in). Keep one instance:
Tovu's state is one SQLite file on the volume.


## Host details for skills/railway/SKILL.md

First check `content_read.custom_credential {}` for a saved token and reuse it.
Otherwise open **Connect Railway** with
`credential_save { kind: "plugin-provider", target: "railway" }`; it saves as `Railway API`.
The person creates the token under Account Settings → Tokens and selects the site's workspace.
A project token from a project's settings will not work here.
Never ask for a token in chat. Never offer to replace a working token unless asked.


## Host operations for skills/railway/SKILL.md

Railway has no save-time probe. `custom_credential_verify` cannot tell whether a Railway key
works: it sends a GET to the GraphQL URL, so the result is "unreachable". Use
`deployment_ops_list_targets { platform: "railway", org: "<workspace UUID>" }` to check the key.
The existing `org` input carries the workspace ID, not its display name. Omitting it lists the
personal projects accessible to an account token; supply it for a workspace token.

Call `deployment_ops_deploy` with `platform: "railway"` and the selected `target`.
`ref` accepts a full 40-character commit SHA only. Omitting it deploys the service's currently
associated commit; it does not promise the latest branch head. Branches and tags are refused.
The service must already have a source configured in Railway.

A returned `started: true` means Railway accepted the request. Keep its `runId` and pass it
with the same target to `deployment_ops_wait` until finished, then check the live URL with
`fetch_live_url`. Status without a run ID inspects the latest deployment. Unknown vendor states
remain unknown. Read bounded runtime logs with `deployment_ops_logs`; logs are snapshots,
not a stream. If a write loses its connection, check status before deciding whether to retry.
Never automatically retry a deployment or variable write.

Use `deployment_ops_list_secrets` to list names only. Use the host's masked entry/site-key flow
and overwrite confirmation with `deployment_ops_set_secret`. Values never belong in chat.
Writes use `skipDeploys: true`: stage all variables, then deploy once. Running instances keep
their current values until that deploy. Secret readback/copy is unavailable.
Removal must be done in the provider console: Railway's list has no digest or update time,
so the host cannot perform its required revision check for `deployment_ops_unset_secret`.
