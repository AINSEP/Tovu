# Tovu host guidance for supabase

This Tovu guidance comes before the portable `supabase` skill. Where the two differ, this guidance
is the more specific one.

**Links.** Tovu opens chat links in a new tab, so the chat stays open while the person signs in or
looks at their database.

**Approval.** `mcp__supabase__execute_sql` and `mcp__supabase__apply_migration` show Tovu's own
approval card with the exact SQL: **Allow** / **Allow for this chat** / **Cancel**. That card is
the only confirmation; do not ask first.

**A step refused by Tovu.** When a Supabase call is refused as not allowed, an admin of this Tovu
site turns that step on in Tovu's settings. Say so in plain words; do not retry.


## Host details for skills/supabase/SKILL.md

`agent_plugin_connect {pluginId:"supabase"}` shows the plugin’s own **Connect Supabase** sign-in card, including what it connects and the permissions involved. Only if browser sign-in cannot start, open `credential_save {kind:"plugin-provider",target:"supabase"}` for the plugin’s access-token fallback. It links to personal access token creation, explains Management API permissions, probes the token and saves it on the MCP connection; it never saves a project anon or service-role key.

Call `agent_plugin_connect { pluginId: "supabase" }` before any Supabase tool, every time, even if
you think it is already connected (it returns at once when it is).

1. Call `mcp__supabase__list_organizations`. Normally there is one; use it. If there are several,
   ask with `assistant_ask_choice` using their names.
2. Call `mcp__supabase__list_projects`. Keep the ones in that organization.
3. If they already have databases, ask with `assistant_ask_choice`:
   - **Make a new database** (first option, recommended)
   - **Use "<name>"** for each existing one

- $0: say nothing about money.
- More than $0 (a paid account): ask with `assistant_ask_choice`:
  - **Create it ($<amount>/<recurrence>)**, using the exact numbers returned
  - **Cancel**

1. Say in one plain sentence what will change, and show the SQL in a code block:
   > I'll make a table called "signups" with an id column. This is the SQL:
2. Call the tool right away. Do NOT ask first with `assistant_ask_choice` or in words ("Shall I
   run this?"): the host's own approval card is the confirmation, and asking twice is annoying. The
   person sees the card with the exact SQL and **Allow** / **Allow for this chat** / **Cancel**;
   nothing runs until they allow it. Keep to one change per call. A card marked as able to delete
   data is expected for these tools.
3. After it runs, check the result (for example `mcp__supabase__list_tables`) and say what changed
   in plain words.

Ask with `assistant_ask_choice` (one option per active database for the first two):


## Host details for skills/supabase/references/failure-modes.md

`agent_plugin_connect` returned `{ status: "waiting-for-sign-in" }` (nobody finished within a few
minutes, which is normal during a new sign-up).

On "done" (or "I'm back"), call `agent_plugin_connect { pluginId: "supabase" }` once more. Never call
it again on your own.

`agent_plugin_connect` failed with an error instead of showing the sign-in card. Say:

Call `credential_save { kind: "plugin-provider", target: "supabase" }` once. It shows the box and waits. On
`{ saved: true }` go to Step 2. On `reason: "invalid"`: "That key didn't work. Make a new one and try
again." Never ask for the key in chat.

Call `external_mcp_reauth_prompt` for `supabase`, and say:
