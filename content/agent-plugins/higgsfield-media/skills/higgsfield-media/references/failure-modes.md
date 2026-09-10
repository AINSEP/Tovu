# Failure modes

Every string in this file was observed on this integration. Match the symptom, then act — do not
reason from first principles about what a federated failure "probably" means. That habit is what
produced an invented explanation and cost this project two sessions.

---

## 1. The tool is not there at all

**Symptom:** `search_tools` finds no `mcp__higgsfield__generate_image`; `describe_tool` cannot
describe it. From inside a run this is indistinguishable from the tool never having existed.

**Three different causes, all invisible from here:**

```
mcp-federation: 'higgsfield' refused remote tool 'generate_image' — remote-declares-not-read-only
mcp-federation: 'higgsfield' refused remote tool '<name>'      — not-in-operator-allowlist
```

or the connection is disabled/absent entirely.

**What to do:** do **not** guess which. Tovu surfaces the real accounting in three places, and at
least one of them is available to you:

1. A **refusal notice prepended to your system prompt**, listing refusals where the operator's
   intent and the gate's decision disagree. (Routine `not-in-operator-allowlist` refusals are
   deliberately excluded — a server advertising fifty tools against an allowlist of seven would
   otherwise bury you in noise every turn.)
2. A **per-tool diagnosis** for a specific tool id you can name.
3. The operator's **Settings → External MCP** admissions banner, which states "you ticked N
   tools; the assistant is running with M" and offers a one-click grant plus a **"Restart the
   assistant"** button.

If none of them tells you anything, say exactly that and send the operator to the banner.

**Remember the restart.** Config is read at daemon start and the admitted set is frozen for the
process lifetime. A grant ticked five seconds ago is not live yet, and no amount of retrying will
make it live. That round trip is intentional.

---

## 2. `Error starting generation: Requires basic plan or higher.`

**Cause:** an account entitlement gate on the selected model. Not a bad model id, not a broken
connection, not an auth problem.

**Do:** try a model that is not gated (`z_image` is verified working on this account). If they
are all gated, stop and put the choice to the operator.

**Do not:** retry the same model; conclude the integration is broken; silently switch to
`media_generate_asset`, which spends money on a *different* vendor's credential.

Full detail in `models-and-plan-gates.md`.

---

## 3. `mcp-federation: the request timed out after 15000ms`

**Cause, when it follows a `job_status` call with `sync: true`:** a structural incompatibility,
not a slow network. Higgsfield's `sync` mode polls server-side for **up to ~25 seconds**. Tovu's
hosted-MCP transport aborts every federated request at **15,000 ms**. 25 > 15, so the request is
always killed before it can answer.

**Do:** call `job_status` again **without** `sync`, and poll. It returns instantly and it works.

**Do not:** tell the operator Higgsfield is slow or down. Nothing is wrong with Higgsfield here.

> **Note for maintainers, not for the agent:** this ceiling is `connectTimeoutMs` (15 s) being
> applied as the per-request bound on the hosted transport, while the configured `callTimeoutMs`
> (30 s) is only ever applied on the stdio transport. If that is ever corrected, `sync: true`
> would fit inside a 30 s ceiling and this failure mode would disappear. Until then, treat
> polling as the only supported path.

---

## 4. `daemon 500 on http://…: INTERNAL_ERROR: an internal error occurred`

**Cause:** a known, still-unfixed relay defect. When a federated call fails on the
delegated-tool path, the real reason exists in the run detail but collapses to a generic 500 on
the way out to you. Observed here wrapping the 15 s timeout above; also observed wrapping an SSRF
refusal on an unrelated path.

**Do:** treat it as "the reason was lost", not as "an unknown catastrophe". Re-run the same call
on a path that reports properly, or drop the flag that most likely caused it (`sync: true` is the
usual culprit on this integration). Report it honestly as a lost error message.

**Do not:** invent a cause. **Do not** report it to the operator as though `INTERNAL_ERROR` were
the actual diagnosis.

---

## 5. The server "is disconnected: its authorization expired or was revoked"

**Cause:** the OAuth access token has expired. It is short-lived — on the order of a day.

**Do:** call `external_mcp_reauth_prompt`. It shows the operator a real in-chat notice naming the
server and pointing them at Settings → External MCP, which is the only place the sign-in can
happen. **An OAuth flow cannot run inside the chat pane's sandboxed dialog**, so you cannot fix
this yourself and neither can that tool.

After the operator confirms they have reconnected, retry the **original** failed call exactly
once, and report its real outcome.

**Do not:** call this tool for any other kind of failure. **Do not** keep retrying the failing
call while the notice is up.

---

## 6. `media_import_from_url` returns 403 or 404

**Cause:** almost always an expired vendor URL. Higgsfield's CDN links are time-limited.

**Do:** get a fresh URL from `job_status` for the same job id and import that.

**Do not:** retry the same dead URL, and do not fall back to downloading the file and re-uploading
it — you do not need to hold the bytes, and there is no path for you to do so anyway.

---

## 7. `media_import_from_url` rejects the file

**Cause:** the format is outside the accepted set. Tovu sniffs the **actual bytes**, not the
served `Content-Type`, and accepts only PNG, JPEG, GIF, WebP, AVIF, MP4 and WebM. A URL that
returns HTML (an error page, a login wall) or an SVG or PDF is refused rather than stored as a
broken asset.

**Do:** check that the URL you passed is the `uri` from the completed `job_status` resource link,
not a page URL. Report the refusal as-is — it is the guard working.

---

## 8. Everything succeeded but nothing is in Media

**Cause:** you stopped after `generate_image`, or after `job_status`. Neither one puts anything in
the Media library. Only `media_import_from_url` does.

**Do:** run step 4. Then confirm by the returned `media.id` and `media.publicUrl` — not by the
fact that earlier calls returned 200.
