# Supabase failure modes

Every message below is what the tool or the connection actually returns, followed by what it means
and what to do. Never relay Supabase's raw error body; say the plain-language line instead.

| Message you see | What it means | What to do |
|---|---|---|
| `external_mcp_oauth_connect` refuses and names `TOVU_PUBLIC_URL` | No public callback URL is configured, so the sign-in cannot start | Use the fallback: the tokens link plus `supabase_set_access_token` |
| `external_mcp_oauth_connect` fails discovery or client registration | Supabase's sign-in could not be set up automatically | Say "We couldn't start Supabase login automatically. Use a personal access token instead." Then the fallback |
| `no external MCP server is configured as 'supabase'` / `supabase_set_*` says the connection does not exist | The `supabase` plugin is not enabled yet | Step A: Agent Plugins, enable `supabase`, restart the assistant |
| `supabase_set_access_token` returns `reason: 'invalid'` | Supabase rejected the token | Say "That access token didn't work. Create a new one and try again." Nothing was stored |
| `supabase_set_project_scope` returns `reason: 'project-not-in-account'` | The chosen project is not visible to this credential | Say "That project isn't available to this Supabase account." |
| `supabase_set_project_scope` says it is not connected yet | No credential is stored | Step B (or Step C) first |
| `no Supabase project has been selected yet` | A credential exists but no project was picked, so no tool is offered | Call `supabase_set_project_scope` |
| `is disconnected: its authorization expired or was revoked` or a 401 | The token expired or was revoked at Supabase | Call `external_mcp_reauth_prompt`; say "Your Supabase connection was revoked. Reconnect to keep using it." Retry once after they reconnect |
| `not-in-operator-allowlist` | The operator has not ticked this tool | Ask the operator to tick it in Settings → External MCP |
| `remote-declares-not-read-only` | A write tool without the "may write" grant | Say "This action needs write access. Ask an admin to allow it in Integrations." |
| A timeout or connection error | Supabase is unavailable or slow | Say "Supabase is unavailable right now. Try again shortly." Do not loop |
