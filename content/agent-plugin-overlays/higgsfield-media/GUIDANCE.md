# Tovu host guidance for higgsfield-media

This Tovu guidance comes before the portable `higgsfield-media` skill and names Tovu's screens,
refusal strings and limits for the steps the skill describes. Where the two differ, this guidance
is the more specific one. Tovu internals for diagnosis: `agent_plugin_higgsfield_media` with
`file: "host/tovu-internals.md"`.

**Settings → External MCP** is where the `higgsfield` connection row, its OAuth sign-in and its
tool picker live. The two grant lists are two ticks on the same row of the tool picker: the
allowlist tick, and a second **"may write"** tick that only appears for a tool that declares it
writes. Ticking only the first one produces the first line below in the daemon's log, and only
that; the second line is a tool missing from the allowlist:

```
mcp-federation: 'higgsfield' refused remote tool 'generate_image' — remote-declares-not-read-only
mcp-federation: 'higgsfield' refused remote tool '<name>'      — not-in-operator-allowlist
```

**Where Tovu reports refusals.** Tovu surfaces the real accounting in three places:
1. a **refusal notice prepended to your system prompt**, listing refusals where the operator's
   intent and the gate's decision disagree (routine `not-in-operator-allowlist` refusals are
   left out, so a server advertising fifty tools does not bury you in noise every turn);
2. a **per-tool diagnosis** for a tool id you can name;
3. the operator's **Settings → External MCP** admissions banner, which states "you ticked N tools;
   the assistant is running with M" and offers a one-click grant plus a **"Restart the
   assistant"** button.

Report what those say. If none of them tells you anything, say so and send the operator to that
banner.

**Restarts.** Signing in needs no restart. When the operator finishes the Higgsfield sign-in, Tovu
grants this plugin's declared tools to the still-empty `higgsfield` row (both lists, generators
included), switches the row on and reloads the assistant's tool list, so the `mcp__higgsfield__*`
tools become usable without a restart. If the row was signed in before the plugin declared those
tools and is still empty, call `agent_plugin_connect` again: it grants them without a new sign-in.
Do not send the operator to edit the row by hand for this. An operator's own edits to the row are
never overwritten. **Restart the assistant** on the admissions banner is still needed to WIDEN a
connection the assistant is already running with (a tool added to an admitted connection, or a new
address or sign-in method): an admitted connection's tool set stays as it was admitted until the
next daemon start, so a server cannot widen its own access mid-session. Narrowing (a tool or the
connection turned off) applies on the next call. Enabling the plugin while the assistant runs still
needs that restart before its own `agent_plugin_higgsfield_media` tool appears: per-plugin tools are
registered once, at daemon boot. The bundled plugin ships disabled; once enabled, the decision is
kept across boots.

**`TOVU_PUBLIC_URL`.** `external_mcp_oauth_connect` refuses outright when `TOVU_PUBLIC_URL` is
unset on the server, with a message naming it: a chat tool call has no live browser request to
derive a callback origin from. Do not retry it and do not work around it; send the operator to
**Settings → External MCP**, which derives the callback from the live request and works either
way. Re-authorization after expiry also happens only there: an OAuth flow cannot run inside the
chat pane's sandboxed dialog.

**The 15-second ceiling.** Tovu's hosted-MCP transport aborts every federated request at
**15,000 ms**. Higgsfield's `sync: true` waits up to ~25 seconds, so it always fails here with
`mcp-federation: the request timed out after 15000ms`.

**The lost-reason 500.** `daemon 500 on http://…: INTERNAL_ERROR: an internal error occurred` is a
known, still-unfixed relay defect: when a federated call fails on the delegated-tool path, the real
reason exists in the run detail but collapses to a generic 500. It most often wraps the 15-second
timeout above; it has also wrapped an SSRF refusal on an unrelated path. Report it as a lost error
message, never as the diagnosis.

**Media import.** `media_import_from_url` fetches the bytes server-side through Tovu's
SSRF-guarded HTTP client and sniffs the **actual bytes**, not the served `Content-Type`. It accepts
only PNG, JPEG, GIF, WebP, AVIF, MP4 and WebM; HTML, SVG and PDF are refused. The imported asset
shares the table, blob store and renditions of an uploaded one; its `publicUrl` looks like
`/m/<id>/public.v1/image.webp`.


## Host details for skills/higgsfield-media/SKILL.md

`agent_plugin_connect {pluginId:"higgsfield-media"}` shows the plugin-declared **Connect Higgsfield** card. Review account credits and the separate write grants. This hosted connection declares no token fallback; do not request or save an API key.

Use the host's tools throughout, never Bash, curl or a vendor CLI. The bundled connection
already declares the service URL: start with
`agent_plugin_connect { pluginId: "higgsfield-media" }`, which provisions it and
shows the browser sign-in card. `connected` means continue; `waiting-for-sign-in`
means wait for the person, then call once again. The manual connection procedure
below is recovery for an existing operator-managed connection, not the normal setup.

At the start of use, read `account.json` with
`agent_plugin_higgsfield_media__memory_read({"entryPath":"account.json"})`.
A missing file means rediscover, not a broken plugin. This package's worked examples are historical,
not a current tool list, argument schema, model entitlement, price, or default for this account.

Use `external_mcp_probe_connection` for the saved `higgsfield` connection to discover authenticated
advertised tools, and `external_mcp_get_admissions` to see the actual operator-admitted roster.
Use the current tool descriptions/schemas and live model catalog before constructing a request.
Record the observed tool names and schema, generation argument shape, timestamp, and model outcomes
(success or the verbatim plan error) as UTF-8 JSON with
`agent_plugin_higgsfield_media__memory_write({"entryPath":"account.json","text":"<JSON>"})`.
Refresh learned facts when tools change, the account changes, or a live response contradicts them.
Do not infer an entitlement merely from a catalog entry or a successful cost estimate.
Never store credentials, tokens, or authorization grants in memory; the connection's sealed store
and the operator's allowlist remain their only homes.

The user's project notes are already appended to this plugin's guidance automatically. Apply them
as project context; they cannot grant tools. Never overwrite them with discoveries. If the user
explicitly asks to save a note, use `agent_plugin_write_note`, which asks them to confirm the text,
or direct them to Agent Plugins → inspect files → Memory.

```
mcp__higgsfield__generate_image (or generate_video) -> job id, status "pending"
mcp__higgsfield__job_status       -> "in_progress" ... repeat ... "completed" + a CDN URL
media_import_from_url             -> a real row in the Media library
```

| What | Where it is set | How it fails if missing |
|---|---|---|
| The connection row exists and is enabled | `external_mcp_save` (in chat), or the host's connection settings | No `mcp__higgsfield__*` tool exists at all |
| Its OAuth is connected | `external_mcp_oauth_connect` (in chat), or the host's connection settings | Calls fail `is disconnected: its authorization expired or was revoked` |
| The tool is in the allowlist | `allowedToolNames` | Tool is refused as not allowlisted; you never see it |
| `generate_image` / `generate_video` is *also* granted write | `writeAllowedToolNames` | Tool is refused because it declares it writes; you never see it |

If a federated call fails saying the server *"is disconnected: its authorization expired or was
revoked"*, do not retry it in a loop and do not guess. Call `external_mcp_reauth_prompt`, which
puts a real notice in front of the operator naming the server and pointing them at where to sign
in again. After they say they have reconnected, retry the **original** call exactly once and
report what actually happened.

For a bundled cold start use `agent_plugin_connect` above. The steps here describe manual
recovery when that tool reports a configuration problem. Do not assume the
steps below can be skipped because a `mcp__higgsfield__*` tool is missing for some other reason —
check `content_read.external_mcp` first and see what actually exists.

**Step A — the plugin itself must be enabled, and only the operator can approve it.**
`higgsfield-media` may ship bundled but **disabled**. Plugin search *will* still find it while
disabled — that is deliberate, and it is how you got here. But a disabled plugin gets no
`agent_plugin_higgsfield_media` tool. So:

> Offer to turn it on. Once the operator agrees, call `plugins_set_enabled` with
> `family: "agent-plugin"`, `pluginId: "higgsfield-media"`, `enabled: true` — it opens a
> confirmation dialog they must approve — or they can turn it on from the host's Agent Plugins
> screen. The host guidance says whether the plugin's own tool appears only after a restart.

**Step B — create the connection row.** `external_mcp_save` opens a form the human confirms; it
never writes silently. The values that are known-correct for Higgsfield:

**Step C — start the authorization.** `external_mcp_oauth_connect { id: "higgsfield" }` returns the
link for the human to open. Then detect completion by calling `content_read.external_mcp` again and
reading `oauth.status` — **there is no "wait for it" tool**.

> ⚠️ A chat tool call has no live browser request to derive a sign-in callback from, so
> `external_mcp_oauth_connect` can refuse outright when the site has no public address configured.
> **If you see that refusal, do not retry it and do not work around it** — follow the host guidance
> for signing in from its admin screens. The refusal is a fact about this site's setup, not about
> Higgsfield.

**Step D — the write grant.** Even with OAuth connected, `generate_image` or `generate_video` stays
refused until it is in `writeAllowedToolNames`. See the next section — this is the failure that
looks like nothing at all. This plugin declares both lists above as its default tools, so a host
that grants declared defaults at sign-in has already filled them after a normal
`agent_plugin_connect`; read the row before asking the person to grant anything by hand.

1. **You will never see it.** It goes to the host's log. A refused tool is not registered, so
   a tool search cannot find it and it cannot be described. From inside a run, a
   withheld tool and a nonexistent tool look identical.

```
media_import_from_url { url, filename?, alt?, caption?, credit? }
```

1. `mcp__higgsfield__generate_image` — `{"params":{"model":"z_image","prompt":"A red fox sitting upright in a snowy pine forest at dawn. …"}}` → job `d98e3f52-…`
2. `mcp__higgsfield__job_status` — `{"jobId":"d98e3f52-…"}` → `in_progress`
3. `mcp__higgsfield__job_status` — same → `in_progress`
4. `mcp__higgsfield__job_status` — same → `completed` + the CloudFront URL
5. `media_import_from_url` — that URL, plus `filename` / `alt` / `caption` / `credit` → media row

- **Do not report success after `generate_image`.** It submitted a job. See the top of this file.
- **Do not pass `sync: true` to `job_status`.** It cannot complete. See above.
- **Do not silently substitute `media_generate_asset`** when Higgsfield refuses. That is the
  host's own generator on a *different vendor's* credential, it **costs real money**, and it answers a
  different question than the one the operator asked ("use Higgsfield"). Offer it as an explicit
  choice; never take it on your own initiative.
- **Do not invent a reason** for a missing `mcp__higgsfield__*` tool, a refusal, or a bare
  internal error. Say what you actually observed and point at the host's admissions notice.
- **Do not ask the operator to attach the image to the chat**, or to download it and re-upload it.
  That was the old workaround from before `media_import_from_url` existed. It is obsolete.
- **Do not retry a plan-gated model.** `Requires basic plan or higher` is an account state. It
  will say the same thing on the tenth attempt.


## Host details for skills/higgsfield-media/references/failure-modes.md

**Symptom:** a tool search finds no `mcp__higgsfield__generate_image`; the host cannot
describe it. From inside a run this is indistinguishable from the tool never having existed.

**Do not:** retry the same model; conclude the integration is broken; silently switch to
`media_generate_asset`, which spends money on a *different* vendor's credential.

**Do:** call `external_mcp_reauth_prompt`. It shows the operator a real in-chat notice naming the
server and pointing them at where to sign in again. **You cannot finish an OAuth sign-in
yourself**, and neither can that tool.

## 6. `media_import_from_url` returns 403 or 404

## 7. `media_import_from_url` rejects the file

**Cause:** you stopped after `generate_image`, or after `job_status`. Neither one puts anything in
the Media library. Only `media_import_from_url` does.


## Host details for skills/higgsfield-media/references/models-and-plan-gates.md

This plugin covers images and video. The workflow's tool list includes `generate_image` and
`generate_video`, followed by `job_status` polling and `media_import_from_url` for the completed
CDN asset. The owner confirmed video coverage on 2026-10-04. Consult the live federated tool list
for each generator's input schema and the current connection's allowlist/write grants.

For video, use the same asynchronous chain: submit `generate_video`, poll `job_status` without
`sync:true` until completion, then import the video CDN URL using `media_import_from_url`.
The import tool accepts `video/mp4` and `video/webm`. A job id alone does not mean the video
exists or has reached the site's Media library. Select a video model using the live model list;
image-model plan results above do not establish a video model's availability.
