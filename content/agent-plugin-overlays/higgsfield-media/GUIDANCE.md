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

**Restarts.** Federation config is read once, at daemon start, and the admitted tool set is frozen
for the life of the process, so a server cannot widen its own access mid-session. A grant saved
mid-session does nothing until the operator clicks **Restart the assistant** on the admissions
banner; that round trip is expected. Enabling the plugin also needs that restart before its own
`agent_plugin_higgsfield_media` tool appears: per-plugin tools are registered once, at daemon
boot. The bundled plugin ships disabled; once enabled, the decision is kept across boots.

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
