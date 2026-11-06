# Tovu host guidance for composio

This Tovu guidance comes before the portable `composio` skill and names Tovu's screens and rules
for the steps the skill describes. Where the two differ, this guidance is the more specific one.

**Sign-in from chat needs `TOVU_PUBLIC_URL`.** If `agent_plugin_connect { pluginId: "composio" }`
refuses because `TOVU_PUBLIC_URL` is unset, send the user to **Settings > External MCP** to sign in
there instead; do not retry. That screen derives the sign-in callback from the live browser
request, so it works either way.

**Grants live in Settings > External MCP**, row `composio`. Tick the five tools the skill lists in
the tool list. Where the picker shows the second **"may write"** tick (it only appears for a tool
that declares it writes), tick it for `COMPOSIO_MULTI_EXECUTE_TOOL` and
`COMPOSIO_MANAGE_CONNECTIONS`. Without it the tool is refused `remote-declares-not-read-only` and
simply never appears.

**Then the restart.** The user clicks **Restart the assistant** on the External MCP admissions
banner. Federation config is read once at assistant start; a grant saved mid-session does nothing
until that restart. Say plainly that granting and restarting need a click from the user.

**A missing `mcp__composio__*` tool.** Report what the External MCP admissions banner or the
refusal notice says, or say you do not know and point the user at that banner.

**Sign-in expired.** `external_mcp_reauth_prompt` for `composio` points the user at
**Settings > External MCP**, the only place that sign-in can happen.


## Host details for skills/composio/SKILL.md

`agent_plugin_connect {pluginId:"composio"}` shows the plugin-declared **Connect Composio** card. Review each app’s sign-in permissions and grant only the requested tools. This hosted connection declares no token fallback; do not request or save a Composio API key.

| Tool | What it is for |
|---|---|
| `COMPOSIO_SEARCH_TOOLS` | Find the app tool that does what the user asked ("send an email", "create a Linear issue") |
| `COMPOSIO_GET_TOOL_SCHEMAS` | Read the exact inputs of the tools you found |
| `COMPOSIO_MANAGE_CONNECTIONS` | Check whether an app is connected; get a sign-in link for one that is not |
| `COMPOSIO_WAIT_FOR_CONNECTIONS` | Wait while the user finishes that app sign-in |
| `COMPOSIO_MULTI_EXECUTE_TOOL` | Run the app tool(s) |

1. **Turn the plugin on.** It ships disabled. Offer to enable it; on yes call `plugins_set_enabled`
   with `family: "agent-plugin"`, `pluginId: "composio"`, `enabled: true` (the user approves a
   dialog), or they use the **Agent Plugins** screen. Enabling creates the `composio` connection row.
2. **Sign in.** Call `agent_plugin_connect { pluginId: "composio" }`. It provisions the declared
   connection, shows the secure browser sign-in card and waits. On `status: "connected"`, continue;
   on `status: "waiting-for-sign-in"`, wait for the person to return, then call it again once.
   Say: "Sign in to Composio (free account; sign up there if you have none)." If it refuses because
   the site is not set up for sign-in from chat, follow the host guidance for signing in elsewhere;
   do not retry. Never create a second connection or use Bash, curl or a remote workbench to sign in.
3. **Grant the tools**, see [Grants](#grants). The host guidance says where grants are made and
   whether a saved grant needs an assistant restart before it takes effect.

- `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS`, `COMPOSIO_MANAGE_CONNECTIONS`,
  `COMPOSIO_WAIT_FOR_CONNECTIONS`, `COMPOSIO_MULTI_EXECUTE_TOOL`.
- Where the host asks for a separate write grant (it applies only to a tool that declares it
  writes), grant it for `COMPOSIO_MULTI_EXECUTE_TOOL` and `COMPOSIO_MANAGE_CONNECTIONS`. Without it
  the host refuses the tool and it simply never appears.

1. `COMPOSIO_SEARCH_TOOLS` with the user's goal in plain words.
2. `COMPOSIO_GET_TOOL_SCHEMAS` for the tool you will use. Never guess argument names.
3. `COMPOSIO_MANAGE_CONNECTIONS` for that app. If it is not connected, give the user the sign-in
   link it returns ("Connect your Gmail here"), then `COMPOSIO_WAIT_FOR_CONNECTIONS`. Each app is
   connected once; it stays connected across sessions.
4. `COMPOSIO_MULTI_EXECUTE_TOOL`.

- **"is disconnected: its authorization expired or was revoked"**: call `external_mcp_reauth_prompt`
  for `composio`. After the user signs in again, retry the original call once.
- **An app's own sign-in expired** (the app tool fails with an auth error): run
  `COMPOSIO_MANAGE_CONNECTIONS` for that app again and give the user the new link.
- **The user wants to disconnect an app**: that is done in their Composio account, not on this site.
