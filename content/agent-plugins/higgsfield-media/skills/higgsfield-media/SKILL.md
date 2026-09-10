---
name: higgsfield-media
description: Generate an image with the connected Higgsfield MCP server and land it in this site's Media library. Covers the whole chain — generate_image (asynchronous, returns a job id and not an image), job_status polling (never with sync:true, which cannot complete over Tovu's federated transport), and media_import_from_url for the CDN URL. Also covers the two things that make this fail silently for a whole session: the per-tool write grant a federated write tool needs, and the account plan gate that rejects some models at submit with "Requires basic plan or higher".
---

# Higgsfield → Media library

## The one thing to say before anything else

**`generate_image` does not return an image.** It returns a *job id*, and the job is still
running when the call comes back. If you report success at that point you have reported a
generation that does not exist yet, and there is nothing to import.

The chain is four calls, not one:

```
mcp__higgsfield__generate_image   -> job id, status "pending"
mcp__higgsfield__job_status       -> "in_progress" ... repeat ... "completed" + a CDN URL
media_import_from_url             -> a real row in the Media library
```

Nothing lands in Media until that third step runs. Higgsfield's own CDN URL is *not* an asset
in this site — it is a link to somebody else's server.

---

## Before you start: is this connection actually usable?

Higgsfield is **not** a Tovu-native capability. It is an **external MCP server**, federated in,
that the operator connected themselves in **Settings → External MCP**. Three separate things
must all be true, and each one fails differently:

| What | Where the operator sets it | How it fails if missing |
|---|---|---|
| The connection exists and is enabled | Settings → External MCP | No `mcp__higgsfield__*` tool exists at all |
| The tool is in the allowlist | The tool picker's per-tool tick | Tool is refused `not-in-operator-allowlist`; you never see it |
| `generate_image` is *also* granted **"may write"** | The second tick on the same row | Tool is refused `remote-declares-not-read-only`; you never see it |

The third row is the one that has cost this project the most time. See
[the write grant](#the-write-grant-two-lists-not-one) below.

**How Higgsfield authenticates: OAuth, and you cannot do it.** The connection uses an
authorization-code OAuth grant against `https://mcp.higgsfield.ai/mcp`, and the access token is
short-lived — on the order of a day. Only the operator can sign in, and **the sign-in cannot
happen inside this chat**: an OAuth flow will not run in the chat pane's sandboxed dialog.

If a federated call fails saying the server *"is disconnected: its authorization expired or was
revoked"*, do not retry it in a loop and do not guess. Call `external_mcp_reauth_prompt`, which
puts a real notice in front of the operator naming the server and pointing them at Settings →
External MCP. After they say they have reconnected, retry the **original** call exactly once and
report what actually happened.

---

## The write grant: two lists, not one

`mcp-federation/trust.ts` holds a federated tool to a stricter posture than a native Tovu tool.
Rule R3 of that posture is the one that matters here:

> A remote tool whose own annotations declare `readOnlyHint: false` — i.e. the server admits the
> tool writes — is **refused**, even when the operator has allowlisted it, unless the operator has
> **also** named it in a second list, `writeAllowedToolNames`.

`generate_image` declares that it writes. So it needs to be in **both** lists. In the admin UI
that is two ticks on the same row of the External MCP tool picker: the allowlist tick, and a
second **"may write"** tick that only appears for a tool that declares it writes.

Ticking only the first one produces this, and only this:

```
mcp-federation: 'higgsfield' refused remote tool 'generate_image' — remote-declares-not-read-only
```

**Two things about that line you must internalise.**

1. **You will never see it.** It goes to the daemon's log. A refused tool is not registered, so
   `search_tools` cannot find it and `describe_tool` cannot describe it. From inside a run, a
   withheld tool and a nonexistent tool look identical.

2. **Therefore: never explain an absent `mcp__higgsfield__*` tool by guessing.** This is the
   specific failure this plugin exists to prevent — asked why it could not generate an image, the
   assistant once invented a plausible, wrong cause, and two sessions were lost before someone
   read the log. Tovu now surfaces the real accounting in three places: the operator's
   **Settings → External MCP** admissions banner, a refusal notice prepended to the system prompt,
   and a per-tool diagnosis. **Report what those say. If you have nothing, say you have nothing
   and send the operator to that banner.**

**A saved grant does nothing until the assistant restarts.** Federation config is read once, at
daemon start, and the admitted tool set is frozen for the life of the process — deliberately, so
a server cannot widen its own access mid-session. An operator who ticks the box and asks you to
try again *in the same session* is asking for something that cannot work yet. The admissions
banner has a **"Restart the assistant"** button; that is the round trip, and it is expected.

---

## The pipeline

### Step 1 — Choose a model, and expect a paywall

`generate_image` takes its arguments **nested under `params`**:

```json
{ "params": { "model": "z_image", "prompt": "…", "count": 1, "aspect_ratio": "16:9" } }
```

`model` is required and is a model id from Higgsfield's own catalog
(`mcp__higgsfield__models_explore`).

**Model choice is an account paywall, not a quality knob.** On the account connected here,
verified 2026-09-09:

| Model | Result |
|---|---|
| `gpt_image_2` (Higgsfield's own default) | ✗ `Error starting generation: Requires basic plan or higher.` |
| `recraft_v4_1` | ✗ Same error, identical wording |
| `z_image` | ✓ Generated a real 2048×1152 PNG |

Start with **`z_image`** unless the operator asks for something specific. See
`references/models-and-plan-gates.md` for how to read that error correctly — in particular, why
it is an *account* gate and not a bad model id, and why the free-trial "unlim" allowance is not a
fallback.

### Step 2 — It submitted a job. Poll it.

A successful submit returns text beginning `Submitted 1 job` and a structured result whose
`results[0]` carries `{ id, type: "image", status: "pending", model, params }`. **That `id` is
the job id.** Take it and poll:

```json
{ "jobId": "d98e3f52-9eb6-471d-927a-b005cd9f6bc6" }
```

`job_status` returns instantly. A non-terminal response says `in_progress` and carries
`poll_after_seconds` — honour it. Higgsfield's own guidance is that an image typically takes
10–20 seconds in total. In the verified run this was **three `job_status` calls**:
`in_progress`, `in_progress`, `completed`.

### ⚠️ Never pass `sync: true`

`job_status` accepts `sync: true`, which asks Higgsfield to poll internally and return only on a
terminal state. **It cannot work here, ever.** Higgsfield's own description of that flag says the
server polls for **up to ~25 seconds**. Tovu's hosted-MCP transport aborts any federated request
at **15,000 ms**. The server-side wait outlives the client-side ceiling by design, so the call
is aborted before it can answer — every time, regardless of how fast the image actually is.

What you get instead, both observed live:

- direct: `mcp-federation: the request timed out after 15000ms`
- through the delegated-tool path: `daemon 500 on http://…: INTERNAL_ERROR: an internal error occurred`

That second one is a real, still-unfixed defect in how a federated failure is relayed — the true
reason exists in the run detail and collapses to a generic 500 on the way out. **If you see that
bare `INTERNAL_ERROR` after a federated call, do not treat it as "Higgsfield is broken."** It is
very often this timeout. Retry the same call *without* `sync`.

Polling without `sync` is not a workaround you should apologise for. It is the correct way to
use this tool.

### Step 3 — Take the CDN URL

A completed `job_status` carries the finished asset twice: once as a line of text, and once as a
structured `resource_link` with `uri`, `name`, `mimeType`, and the prompt as `description`. The
URL looks like:

```
https://d8j0ntlcm91z4.cloudfront.net/user_<account>/hf_<yyyymmdd>_<hhmmss>_<jobId>.png
```

### Step 4 — Import it, or it never happened

```
media_import_from_url { url, filename?, alt?, caption?, credit? }
```

Tovu fetches the bytes server-side through its SSRF-guarded HTTP client. **You do not download
the image, hold it, or base64 it.** Pass the URL.

Fill in the optional fields — they are the difference between an asset someone can find later
and an untitled blob:

- `alt` — a real description of what is in the image, for screen readers. Not the prompt.
- `caption` — short, human.
- `credit` — say where it came from, e.g. `Generated with Higgsfield (z_image)`.

On success you get back the same `media` shape every other media tool returns: `id`, `title`,
`alt`, `caption`, `credit`, `sha256`, `status`, `version`, `publicUrl`, `sourceUrl`. The asset is
now indistinguishable from one a human uploaded — same table, same blob store, same renditions.
`publicUrl` (e.g. `/m/<id>/public.v1/image.webp`) is live immediately and can go straight into a
page or post.

**Import promptly.** Vendor CDN URLs expire. A `403` or `404` from this step usually means the
URL has already gone stale — ask for a fresh one via `job_status` rather than retrying the dead
URL.

---

## The complete verified run

This exact sequence produced media asset `c881a51f-5b41-4aec-b806-e5624e1e1208` on 2026-09-09.
The stored blob is byte-identical to the Higgsfield original (3,419,670 bytes, PNG 2048×1152,
sha256 `0919769f…`), and its public rendition serves 200.

1. `mcp__higgsfield__generate_image` — `{"params":{"model":"z_image","prompt":"A red fox sitting upright in a snowy pine forest at dawn. …"}}` → job `d98e3f52-…`
2. `mcp__higgsfield__job_status` — `{"jobId":"d98e3f52-…"}` → `in_progress`
3. `mcp__higgsfield__job_status` — same → `in_progress`
4. `mcp__higgsfield__job_status` — same → `completed` + the CloudFront URL
5. `media_import_from_url` — that URL, plus `filename` / `alt` / `caption` / `credit` → media row

---

## Do not

- **Do not report success after `generate_image`.** It submitted a job. See the top of this file.
- **Do not pass `sync: true` to `job_status`.** It cannot complete. See above.
- **Do not silently substitute `media_generate_asset`** when Higgsfield refuses. That is Tovu's
  own generator on a *different vendor's* credential, it **costs real money**, and it answers a
  different question than the one the operator asked ("use Higgsfield"). Offer it as an explicit
  choice; never take it on your own initiative.
- **Do not invent a reason** for a missing `mcp__higgsfield__*` tool, a refusal, or a bare
  `INTERNAL_ERROR`. Say what you actually observed and point at the admissions banner.
- **Do not ask the operator to attach the image to the chat**, or to download it and re-upload it.
  That was the old workaround from before `media_import_from_url` existed. It is obsolete.
- **Do not retry a plan-gated model.** `Requires basic plan or higher` is an account state. It
  will say the same thing on the tenth attempt.

---

## References

- `references/models-and-plan-gates.md` — reading Higgsfield's plan and credit errors correctly,
  what `models_explore` actually tells you, and why the free-trial "unlim" allowance is not a
  fallback path.
- `references/failure-modes.md` — every failure string observed on this integration, its real
  cause, and what to do. Read this before diagnosing anything.
