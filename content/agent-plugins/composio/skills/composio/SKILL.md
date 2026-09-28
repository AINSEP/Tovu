---
name: composio
description: Use the user's other apps (Gmail, Calendar, Slack, Notion, GitHub, HubSpot, 1000+ more) through Composio Connect, Composio's hosted MCP server. Covers connecting from nothing (one browser sign-in to Composio, no API key), the grants the connection needs, and the per-app flow - search for a tool, read its schema, connect the app with a Composio sign-in link, then execute.
---

# Composio: the user's other apps

Composio Connect is an **external MCP server** at `https://connect.composio.dev/mcp`. It does not
expose one tool per app. It exposes a handful of meta-tools, and you reach every app through them.
Its tools arrive in chat as `mcp__composio__<TOOL>`.

| Tool | What it is for |
|---|---|
| `COMPOSIO_SEARCH_TOOLS` | Find the app tool that does what the user asked ("send an email", "create a Linear issue") |
| `COMPOSIO_GET_TOOL_SCHEMAS` | Read the exact inputs of the tools you found |
| `COMPOSIO_MANAGE_CONNECTIONS` | Check whether an app is connected; get a sign-in link for one that is not |
| `COMPOSIO_WAIT_FOR_CONNECTIONS` | Wait while the user finishes that app sign-in |
| `COMPOSIO_MULTI_EXECUTE_TOOL` | Run the app tool(s) |

## Connecting from nothing

**Never ask the user for a Composio API key, and never accept one pasted into chat.** Composio
Connect signs the user in by standard MCP OAuth in their browser. Tovu discovers Composio's
endpoints and registers its own client, so nobody types a URL, client id or secret.

1. **Turn the plugin on.** It ships disabled. Offer to enable it; on yes call `plugins_set_enabled`
   with `family: "agent-plugin"`, `pluginId: "composio"`, `enabled: true` (the user approves a
   dialog), or they use the **Agent Plugins** screen. Enabling creates the `composio` connection row.
2. **Sign in.** `external_mcp_oauth_connect { id: "composio" }` returns a link. Give it to the user
   in one line: "Sign in to Composio here (free account; sign up there if you have none)". Then check
   `content_read.external_mcp` for `oauth.status: "connected"`. If the tool refuses because
   `TOVU_PUBLIC_URL` is unset, send the user to **Settings > External MCP** to sign in there instead;
   do not retry.
3. **Grant the tools**, see [Grants](#grants), then the user clicks **Restart the assistant** on the
   External MCP admissions banner. Federation config is read once at assistant start; a grant saved
   mid-session does nothing until that restart.

Say plainly that steps 1 and 3 need a click from the user. Do not imply you can finish alone.

## Grants

In **Settings > External MCP**, row `composio`, tick these in the tool list:

- `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS`, `COMPOSIO_MANAGE_CONNECTIONS`,
  `COMPOSIO_WAIT_FOR_CONNECTIONS`, `COMPOSIO_MULTI_EXECUTE_TOOL`.
- Where the picker shows the second **"may write"** tick (it only appears for a tool that declares
  it writes), tick it for `COMPOSIO_MULTI_EXECUTE_TOOL` and `COMPOSIO_MANAGE_CONNECTIONS`. Without it
  the tool is refused `remote-declares-not-read-only` and simply never appears.

**Do not grant** `COMPOSIO_REMOTE_WORKBENCH` or `COMPOSIO_REMOTE_BASH_TOOL`. They run code on
Composio's servers; nothing the user asks for here needs them.

If an `mcp__composio__*` tool you expect is missing, do not invent a reason. Report what the
External MCP admissions banner or the refusal notice says, or say you do not know and point the
user at that banner.

## Doing a task

1. `COMPOSIO_SEARCH_TOOLS` with the user's goal in plain words.
2. `COMPOSIO_GET_TOOL_SCHEMAS` for the tool you will use. Never guess argument names.
3. `COMPOSIO_MANAGE_CONNECTIONS` for that app. If it is not connected, give the user the sign-in
   link it returns ("Connect your Gmail here"), then `COMPOSIO_WAIT_FOR_CONNECTIONS`. Each app is
   connected once; it stays connected across sessions.
4. `COMPOSIO_MULTI_EXECUTE_TOOL`.

**Ask before anything that sends, posts, pays, or deletes** (an email, a Slack message, a payment,
removing a record): show what will go out and to whom, and run it only after the user says yes.
Reading (listing emails, events, issues) needs no confirmation.

Report what the tool actually returned. If it failed, say so with its error in one plain sentence.

## When it stops working

- **"is disconnected: its authorization expired or was revoked"**: call `external_mcp_reauth_prompt`
  for `composio`. After the user signs in again, retry the original call once.
- **An app's own sign-in expired** (the app tool fails with an auth error): run
  `COMPOSIO_MANAGE_CONNECTIONS` for that app again and give the user the new link.
- **The user wants to disconnect an app**: that is done in their Composio account, not in Tovu.
