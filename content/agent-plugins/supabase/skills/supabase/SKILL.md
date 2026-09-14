---
name: supabase
description: Connect Supabase from nothing and use it safely. Covers the cold start (enable the plugin, then an OAuth sign-in link via external_mcp_oauth_connect; only if that cannot start, a personal access token typed into a masked form via supabase_set_access_token), picking exactly one project with supabase_set_project_scope (read-only by default, and no Supabase tool is offered before a project is picked), the per-tool write grant a write tool like execute_sql or apply_migration needs, disconnecting, and what to say when the token expires or Supabase is down.
---

# Supabase

## The one thing to say before anything else

**Never ask for a Supabase token in chat, and never accept one pasted there.** A token typed
into chat text lands in the transcript, in your context, and in the provider's logs. Tovu has
two ways to get a credential that never pass through you: an OAuth sign-in link, and a masked
form. Use those. If someone pastes a token anyway, tell them to revoke it at
https://supabase.com/dashboard/account/tokens and connect again through the form.

---

## Before you start: is this connection actually usable?

Supabase is **not** a Tovu-native capability. It is an **external MCP server**
(`https://mcp.supabase.com/mcp`), federated in under the connection id `supabase`. All of these
must be true, and each one fails differently:

| What | Where it is set | How it fails if missing |
|---|---|---|
| The `supabase` plugin is enabled | `plugins_set_enabled` (family `agent-plugin`, operator confirms) or the Agent Plugins admin screen | No `supabase` connection row exists at all |
| A credential is stored | `external_mcp_oauth_connect`, or `supabase_set_access_token` as the fallback | The connection reports it has not been authorized yet |
| Exactly one project is selected | `supabase_set_project_scope` | The connection reports that no Supabase project has been selected yet, and no `mcp__supabase__*` tool exists |
| The connection is enabled and the tool is allowlisted | Settings → External MCP | Tool is refused `not-in-operator-allowlist`; you never see it |
| A write tool is *also* granted **"may write"** | The second tick on the same row (`writeAllowedToolNames`) | Tool is refused `remote-declares-not-read-only`; you never see it |

Check `external_mcp_list` first and read what actually exists before you start any step.

---

## Connecting from zero

**Step A — the plugin must be enabled, and only the operator can approve it.** If `supabase` is
not enabled, explain what it does and offer to turn it on. Once the operator agrees, call
`plugins_set_enabled { family: "agent-plugin", pluginId: "supabase", enabled: true }` — it opens a
confirmation dialog they must approve — or they can turn `supabase` on from the **Agent Plugins**
admin screen. If it is not installed at all, that call is refused; ask the operator to install it
first. Either way, ask them to **restart the assistant** afterwards. Do not call any Supabase tool
before that — the `supabase` connection row does not exist until the plugin is enabled.

**Step B — OAuth first, always.** Call `external_mcp_oauth_connect { id: "supabase" }`. Tovu
discovers Supabase's endpoints and registers its own client (RFC 9728 / 8414 discovery, RFC 7591
dynamic client registration), so nobody types a client id or secret. Hand the human the one link
it returns. You cannot finish the sign-in yourself. Detect completion by calling
`external_mcp_list` again and reading `oauth.status` — there is no "wait for it" tool.

**Step C — the fallback, only if Step B could not start.** Use it only when
`external_mcp_oauth_connect` is refused (discovery or client registration failed, or no public
callback URL is configured — the refusal names `TOVU_PUBLIC_URL`). Do not retry Step B in a loop.
Instead:

1. Send the human this link to create a personal access token:
   https://supabase.com/dashboard/account/tokens
2. Call `supabase_set_access_token` (it takes no arguments). It shows a masked form. The human
   types the token there; Tovu checks it against Supabase, seals it, and sends it to Supabase as an
   `Authorization: Bearer` header. You only ever see whether it was saved.

A token saved this way replaces any unfinished OAuth attempt on the same connection. There is
only ever one Supabase connection.

**Step D — pick the project.** Call `supabase_set_project_scope` (no arguments). It lists the
projects the credential can see and asks the human to pick exactly one. **Read-only is on by
default.** Until this step is done, no Supabase tool is offered, even if everything else is set.

**Step E — enable and allowlist.** The connection still starts disabled with empty tool lists.
Ask the operator to enable `supabase` in **Settings → External MCP**, tick the tools it may use,
and **restart the assistant** so the saved change is read.

---

## Read-only and the write grant

- Read-only on (the default) means Supabase's own server refuses writes for this connection.
- Turning read-only off in the project form grants **nothing** by itself. A write tool such as
  `execute_sql`, `apply_migration`, `deploy_edge_function`, `create_branch` or `delete_branch`
  still needs the operator to tick it in **both** lists on the row: the allowlist and
  `writeAllowedToolNames` ("may write"). Without both, it is refused
  `remote-declares-not-read-only`.
- Do not invent a reason for an absent or refused tool. Read the refusal and report it as-is.

---

## When things fail

See [failure modes](references/failure-modes.md) for every message and what to do.

- **Expired or revoked credential** ("is disconnected: its authorization expired or was revoked",
  or a 401): call `external_mcp_reauth_prompt`, tell the human in plain words that Supabase needs
  to be reconnected, and retry the original call once after they confirm. Never retry silently.
- **Supabase unavailable or slow:** say "Supabase is unavailable right now. Try again shortly."
  Do not loop.
- Never paste Supabase's raw error body back as your answer.

---

## Disconnecting

Deleting the `supabase` connection in **Settings → External MCP** deletes the stored credential,
and later Supabase calls fail as not connected. Tovu does not revoke the token at Supabase's end:
tell the human to also revoke it at https://supabase.com/dashboard/account/tokens (a personal
access token) or under their Supabase account's authorized apps (an OAuth sign-in).

---

## Do not

- Do not ask for, accept, repeat, or store a Supabase token in chat text or a tool argument.
- Do not offer the access-token form before trying the OAuth link, unless the OAuth link was refused.
- Do not call a Supabase tool when the plugin is not enabled or no project is selected.
- Do not tell the operator that turning read-only off lets you write.
- Do not work around a write refusal by using a different tool.
