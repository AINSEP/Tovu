# Higgsfield cold-start journey — verification and fixes

**Date:** 2026-09-09
**Branch:** `restructure/apps-website-phased`
**Scope:** the journey for a user with *no* Higgsfield integration: search → find the plugin →
connect → generate → land in Media.

---

## Answers, up front

1. **How does Higgsfield authenticate — is it actually OAuth?**
   **Yes. Real OAuth, `authorization_code` + PKCE. There is no API key.** The owner's expectation
   was correct.

2. **Can a user get from "nothing configured" to "connected" guided only by the assistant plus this
   plugin?**
   **No.** Two hard stops require the admin UI. The blocker is in the **product**, not the plugin.

3. **Does search surface the plugin while it is disabled?**
   **Yes — verified live, ranked #1.** This half of the journey works.

4. **What changed?** The plugin's SKILL.md now documents the connection path accurately (it
   previously documented only *usage*, from a run where Higgsfield was already connected), plugin
   keywords were widened to close a measured discoverability hole, and three assertions pin the new
   facts.

---

## 1. Authentication — verified, not assumed

Read from the live connection row (`sites/tovu-com/content.db`, `external_mcp_servers`) and from
Higgsfield's own published metadata, fetched live:

| Fact | Value |
|---|---|
| `auth_mode` | `oauth` |
| `oauth_grant` | `authorization_code` |
| `transport` / `url` | `streamable_http` → `https://mcp.higgsfield.ai/mcp` |
| `oauth_scopes_json` | `["openid","email","offline_access"]` |
| `oauth_status` | `connected` |
| `oauth_provider_id` | *empty* — not a registered Tovu provider |
| `oauth_client_id` | `DWjbUpAZxhRW2AgE` |

**Nobody typed that client id or those endpoints.** Both well-known documents return **200**:

- RFC 9728 `/.well-known/oauth-protected-resource` — names the authorization servers, scopes
  `openid email offline_access`.
- RFC 8414 `/.well-known/oauth-authorization-server` — `authorization_endpoint`
  `https://mcp.higgsfield.ai/oauth2/authorize`, `token_endpoint` `…/oauth2/token`,
  **`registration_endpoint` `…/oauth2/register`**, `code_challenge_methods_supported: ["S256"]`.

The stored `oauth_endpoints_json` matches that metadata **exactly**, which is the proof that the row
was self-configured by `assistant/external-mcp-oauth.ts`'s "discovery + dynamic client registration"
path (RFC 8414 discovery, RFC 7591 registration), not hand-entered. **The only value a human
supplies is the URL.**

Token lifetime is **~24h**: the row was refreshed `2026-09-09T17:58:41Z` and expires
`2026-09-10T17:58:40Z`. Re-authorization is routine, not a fault.

Two flows are offered. The protected-resource document carries a `higgsfield_auth_hints` block
advertising `authorization_code_pkce` (via `clerk.higgsfield.ai`) for redirect-capable clients and
**`device_code`** (via `fnf-device-auth.higgsfield.ai`) for clients that cannot receive redirects.
Tovu uses the authorization-code flow.

---

## 2. The cold start dead-ends twice — both in the product

### Stop A — the assistant cannot enable the plugin (unconditional)

`higgsfield-media` ships bundled and **disabled** (`seed-bundled.ts` writes
`{ enabled: false, origin: "bundled" }`). Two facts combine into a dead end:

- **A disabled plugin gets no tool.** `tool-registrations.ts:404` filters through
  `filterActiveAgentPlugins` *before* registering anything, so `agent_plugin_higgsfield_media` — the
  only way to read the SKILL.md — **does not exist** while it is off.
- **No assistant tool wraps `AGENT_PLUGIN_SET_ENABLED`.** It exists only as the admin HTTP route
  `PATCH /api/admin/v1/workspaces/:workspaceId/agent-plugins/:pluginId`. The codebase says so itself,
  in `features/agent-plugins/uninstall.ts:133`:

  > "There is no tool to disable it (no assistant tool wraps AGENT_PLUGIN_SET_ENABLED yet) — ask a
  > human operator to turn it off from the Agent Plugins admin screen instead."

So search finds the plugin and then the assistant can neither turn it on nor read its guidance. A
human must open the **Agent Plugins** admin screen. Because per-plugin tools are registered once in
`agent-daemon-server.ts`'s boot sequence, that also costs an **assistant restart**.

**This was corroborated live, unintentionally.** Mid-task, `activations.json` changed under me:
`higgsfield-media` flipped to `enabled: true` at `2026-09-10T01:25:31Z`, `updatedBy` the owner's
principal id — *not* `system:seed`. The only path that writes that is the admin screen. The
dead-end is real, and the workaround is exactly the one predicted.

The good news: enabling **sticks**. `recordBundledAgentPluginIfAbsent` never overwrites an existing
decision, so the seeder does not re-disable it on the next boot. (`activation.ts`'s comment that the
seeder "re-writes the bundled plugin's disabled record on every boot" is misleading; the behavior is
if-absent only. Live data agrees — `tovu-deploy-fly` is bundled, enabled, and has survived reboots.)

### Stop B — `external_mcp_oauth_connect` is blocked wherever `TOVU_PUBLIC_URL` is unset

The in-chat connect surface **does exist and is fully wired** (`tool-catalog-manifest.ts:249`,
`registerToolContributor(contributeExternalMcpTools())`), giving the assistant five tools:
`external_mcp_list`, `external_mcp_save`, `external_mcp_test_connection`,
`external_mcp_oauth_connect`, `external_mcp_oauth_poll_device`. `external_mcp_save` opens a
human-confirmed MCP-UI form and never writes silently; secrets are typed by the human into the form
and are absent from every input schema.

But `external_mcp_oauth_connect`'s handler calls `resolveExternalMcpOAuthRedirectUri(id)`
**unconditionally**, which throws when `TOVU_PUBLIC_URL` is unset — a chat tool call has no live
request to derive a callback origin from. **`TOVU_PUBLIC_URL` is not set in this development
environment** (absent from `.env`, from `development/dev.mjs`, and from the running API process).

Note the throw is unconditional across grants: even a `device_code` connection — which needs no
redirect at all — cannot start from chat without it. (`beginConnect` does pass the redirect URI into
dynamic registration before branching on grant, so it is not purely gratuitous, but a device flow is
gated on a value it never uses.)

**Settings → External MCP is unaffected** — it derives the callback from the live browser request.

### Stop C — the write grant still needs a restart

Already known and already documented: `generate_image` needs to be in **both** `allowedToolNames`
and `writeAllowedToolNames`, and federation config is read once at daemon start, so a saved grant
needs an assistant restart. `external_mcp_save` *can* set both lists, so this one is at least
expressible from chat.

### The shortest honest path today

1. Human enables `higgsfield-media` on the **Agent Plugins** admin screen → **restart**.
2. Assistant reads the plugin, proposes `external_mcp_save` (id `higgsfield`, `streamable_http`,
   the URL, `authMode: oauth`, `oauthGrant: authorization_code`, both tool lists) — human confirms.
3. `external_mcp_oauth_connect` **if `TOVU_PUBLIC_URL` is set**; otherwise the human connects from
   **Settings → External MCP**. Discovery + DCR fill in endpoints and client id automatically.
4. Restart for the write grant, then generate → poll → `media_import_from_url`.

### What would close the gap

- **An assistant tool wrapping `AGENT_PLUGIN_SET_ENABLED`** (human-confirmed, like
  `external_mcp_save`). This is the single highest-value fix: it removes the one *unconditional*
  dead end, and it is the step the user hits first.
- **Set `TOVU_PUBLIC_URL` in the dev environment**, and/or skip the redirect-URI requirement for
  `device_code`. Higgsfield explicitly advertises a device flow for exactly this situation.
- Lower value: let a disabled plugin's SKILL.md be *readable* (not executable) so the assistant can
  at least explain what enabling would get the user.

---

## 3. Search surfaces the disabled plugin — verified live

Drove the **real** `loadAgentPluginSearchCandidates` + `rankInstalledAgentPlugins` against the
**real** workspace (`workspace-local`) while `higgsfield-media` was still `enabled: false`:

```
totalInstalled = 4      higgsfield-media enabled=false

"generate an image"                  higgsfield-media(17,DISABLED)  site-compliance(12) …
"connect Higgsfield"                 higgsfield-media(15,DISABLED)
"higgsfield"                         higgsfield-media(12,DISABLED)
"image generation"                   higgsfield-media(11,DISABLED)
"make me an image"                   higgsfield-media(23,DISABLED)  …
"connect an image generator"         higgsfield-media(13,DISABLED)  …
"oauth"                              higgsfield-media(4,DISABLED)
"create a picture for my blog post"  site-compliance(15)  higgsfield-media(13,DISABLED)  …
"add art to a page"                  site-compliance(18)  tovu-deploy-fly(15)  higgsfield-media(15,DISABLED) …
"photo"                              -- NO MATCHES --
"illustration"                       -- NO MATCHES --
```

**Confirmed:** disabled plugins are returned, ranked #1 for the natural phrasings, with `enabled`
reported rather than used as a filter. Step 3 of the journey works.

**Two real gaps found:** `"photo"` and `"illustration"` scored **zero** — and
`rankInstalledAgentPlugins` *drops* zero-scoring candidates, so the plugin was unreachable by either
word. Two more phrasings ranked an unrelated plugin above it.

After widening the keywords, re-run through the same code path:

```
"photo"                              higgsfield-media(4)      # was: no matches
"illustration"                       higgsfield-media(4)      # was: no matches
"create a picture for my blog post"  higgsfield-media(17)  site-compliance(15)   # was 2nd
"add art to a page"                  higgsfield-media(24)  site-compliance(18)   # was 3rd
"connect Higgsfield"                 higgsfield-media(19)     # was 15
"oauth"                              higgsfield-media(7)      # was 4
```

---

## 4. What changed

| File | Change |
|---|---|
| `content/agent-plugins/higgsfield-media/skills/higgsfield-media/SKILL.md` | Rewrote the connection sections. Replaced the 3-row prerequisite table with 4 rows naming the in-chat tools; added **"How Higgsfield authenticates"** (OAuth not API key, discovery + DCR, scopes, PKCE, ~24h token) and **"Connecting from zero"** (Steps A–D, with the `TOVU_PUBLIC_URL` refusal called out and the honest "this is not fully in-chat" summary). Updated the frontmatter description. |
| `content/agent-plugins/higgsfield-media/plugin.json` | Description now covers the cold start; keywords 15 → 35, adding the image synonyms (`photo`, `picture`, `illustration`, `art`, …) and the connect vocabulary (`connect`, `login`, `authorize`, `setup`, …). |
| `…/__tests__/unit/bundled-higgsfield-media-package.unit.test.ts` | +3 tests pinning the new facts: OAuth-not-API-key + self-configuration; the two admin-UI stops (`AGENT_PLUGIN_SET_ENABLED`, `TOVU_PUBLIC_URL`); and the keyword synonyms. |

**No `apps/website/src` runtime file was touched**, so no API restart and no downtime for other
agents. `mcp-federation/bootstrap.ts`, `apps/admin/**`, `features/pages/**` and
`ask-choice-tool.ts` were not touched.

### Correction to the dispatch's premise

The dispatch expected the SKILL.md to say nothing about connecting. It actually *did* carry an
OAuth paragraph — which was directionally right about the grant but **wrong or incomplete on three
points**: it stated flatly that the operator connects "in Settings → External MCP" (the five in-chat
`external_mcp_*` tools were wired 2026-09-07/08 and it did not know about them), it never mentioned
discovery/DCR (so a reader would think a client id and endpoints must be found somewhere), and it
never mentioned the enable step that actually blocks the journey first.

---

## 5. Testing

Ran **only** the two files covering the diff, from the repo root:

```
apps/website/src/features/agent-plugins/__tests__/unit/bundled-higgsfield-media-package.unit.test.ts
apps/website/src/features/agent-plugins/__tests__/integration/bundled-higgsfield-media-injection.integration.test.ts
```

**22 pass, 0 fail** (19 pre-existing + 3 new) — count checked against what was passed. No repo-wide
`tsc`, no unscoped runs.

**RED proven without reverting the working tree:** every new assertion was checked against
`git show b6d23d67:…` (the committed version). All six SKILL.md patterns matched **0 times**, and
none of `photo`/`illustration`/`picture`/`art`/`login`/`authorize` existed as keywords.

One new assertion went genuinely RED on first run for a real reason — it read
`parseAgentPluginManifest(...).keywords` instead of `.manifest.keywords`, so it silently saw `[]`.
Fixed; it now exercises the real parsed manifest.

---

## 6. Still broken (not mine to fix here)

- **No assistant tool for `AGENT_PLUGIN_SET_ENABLED`** — the unconditional dead end.
- **`TOVU_PUBLIC_URL` unset in dev** blocks in-chat OAuth, including for grants that need no
  redirect.
- **The existing Higgsfield MCP server was NOT deleted or modified.** Cold start was reasoned from
  the real row plus live vendor metadata plus a sandboxed copy of the workspace tree under the
  scratchpad — never by destroying the working connection, which is unrecoverable in-app.
