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
