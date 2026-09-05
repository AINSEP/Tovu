# Can Tovu's assistant duplicate a site? — capability probe, 2026-09-05

## Verdict

**No.** The assistant cannot duplicate a site, and the gap is total, not partial: no
"duplicate site" capability exists anywhere in the codebase (not a tool, not an HTTP route,
not a CLI command), site create/list/activate exist only as an admin-HTTP-route the UI calls
directly (never registered as an assistant tool), and there is no "activate a theme for a
site" assistant tool either — only file-level theme-editing tools. The assistant's own live
tool search independently confirmed all three gaps in the browser before this report was
written from code.

## Tool inventory: reachable-by-assistant vs HTTP-route-only

**HTTP-route-only (admin UI, never an assistant tool):**
- `listSites`, `createSite`, `describeSiteBinding`, `persistActiveSite`/`readPersistedActiveSite`
  — `apps/website/src/platform/site-dir/site-registry.ts` + `active-site.ts`, re-exported via
  `site-dir/index.ts`, consumed ONLY by
  `apps/website/src/server/inbound/admin-http/routes/system/sites.ts`
  (`GET/POST /api/admin/v1/workspaces/:workspaceId/system/sites`,
  `POST .../system/sites/:name/activate`). Gated by `system.read`/`system.write` permissions
  and the `isSiteSwitcherEnabled()` deployment flag — but that gate is on the HTTP route, not
  on any tool wiring, because there is no tool wiring.
- `apps/website/src/assistant/tool-registrations.ts` is the single assembly point for every
  domain the assistant can call (154 tool ids across 25+ domains as of the file's own running
  count). Read in full: there is no "sites"/"site-registry"/"site-management" entry in
  `DOMAIN_SLICES`, and no `contributeSitesTools()` call in
  `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`. Confirmed by
  `find` across `apps/website/src` (excluding `dist`/`coverage`) for any `tool-registrations.ts`
  or file matching `*site-management*`/`*duplicate*` — none exists for this domain.
- `createSite` itself, even if it were wired, would not satisfy "duplicate": it is a thin
  wrapper over `initSite` (`site-dir/init-site.ts`), the exact function `tovu init <dir>`
  calls — a **blank** site (own database, uploads, themes, one starting home page), never a
  copy of an existing site's content/DB/theme. The admin Sites screen's own copy says this
  outright: *"Makes a new folder under sites/ with its own database, uploads, themes, and a
  starting home page — the same thing `tovu init` produces."* No function anywhere in the repo
  copies one site's `content.db`/`uploads/`/theme folder into a new site directory — grepped
  for `duplicate`/`clone` project-wide (excluding `dist`), zero hits outside test/doc prose.

**Reachable by the assistant (confirmed via live tool search, see below), but not what was
asked:**
- `site_get_profile` (source: `site-inspection` domain) — read-only config snapshot, does not
  create or modify anything.
- `fetch_published_page` (source: `fetch`) — read-only render check of one route.
- `theme_list`, `theme_list_files`, `theme_read_file`, `theme_write_file`, `theme_edit_file`,
  `theme_rename_file`, `theme_trash_file`, `theme_restore_trashed_file`
  (`apps/website/src/features/theme/tool-registrations.ts`) — file-level CRUD *inside* an
  existing theme's own folder. None of these sets "the active theme for a site"; there is no
  `theme_activate`/`theme_set_active` tool id anywhere in the catalog. Whether a "set active
  theme" mechanism exists at all behind the Themes admin screen was not traced (out of this
  probe's scope) — what's confirmed is that no such capability is assistant-reachable under
  any name matching that intent.

The `MCP_UI_REDEEMABLE_TOOL_IDS` gate flagged as a "known trap" in the dispatch turned out to
be unrelated to this finding: it's a hardcoded allowlist in
`apps/website/src/assistant/mcp-ui-tool-calls.ts` gating which *already-wired* tools may be
redeemed through a human-confirmation MCP-UI dialog (e.g. `content_post_delete`), not an env
var and not a gate on whether a tool exists or renders at all. It doesn't apply here because
no site-duplication tool exists to gate in the first place.

One more structural fact worth surfacing: `.env` sets `TOVU_AGENT_FORBID_BASH=1`, deliberately
("gap-discovery instrument… with no shell fallback, the assistant must find a registered tool
or say none exists"). That rules out the assistant faking a duplication via a shell escape
hatch — consistent with everything observed below.

## What happened when asked, live

Opened `https://localhost:5173/admin/sites` (HTTPS admin UI), opened the assistant dock, and
typed in plain language: *"Can you duplicate this site as a new site named 'fashion' and
activate a theme for it?"*

The assistant's run (visible tool-call trace in the chat pane):
1. `ToolSearch` (its own internal discovery step) against
   `mcp__jini__search_tools,describe_tool,execute_delegated_tool,execute_readonly_delegated_tool`.
2. Called `search_tools` with query *"duplicate or clone an existing site into a new site,
   copying its content, pages and configuration under a new site name"* → returned only
   `fetch_published_page` and `site_get_profile` (top scores 14.28 / not shown-in-full — no
   duplication tool anywhere in the ranked results).
3. Called `search_tools` with query *"activate or apply a theme for a site, switching the
   site's active theme"* → returned only `theme_list`, `theme_write_file`,
   `settings_list_definitions`, `theme_read_file`, `widgets_list_regions` — no activation tool.

This is independent, live confirmation of the static-analysis finding: the model's own
semantic tool search — not my reasoning about the code — came back empty for both asks.

**The run never completed to a final answer.** A Playwright tab-navigation on my end
orphaned the SSE-backed run mid-flight ("No open pages available"); resuming the persisted
conversation showed `"1 msg"` (only my human turn was ever persisted — the assistant's tool
calls above were visible live but the final text reply never landed) and the dock then showed
`"No usable CLI is selected"` / `"Failed to fetch"`. This is an artifact of my tooling losing
the page, not a claim about repo behavior — but see the incident below, which happened
immediately after.

## Incident: the dev server went down during this probe

After clicking "Switch to BYOK" to try to recover the orphaned run and re-submitting the ask,
the client entered a rapid reconnect loop (100+ console errors in ~15s: repeated
`ERR_CONNECTION_REFUSED` against `/api/agents`, `/api/frontend-sessions/stream`,
`/api/assistant/chats/.../messages`, `/api/admin/v1/workspaces/.../settings/events`). A check
immediately after found the **entire dev server process tree gone** — not the documented
tsx-watch flap (which self-resolves on retry): orchestrator pid `38007` (`dev.mjs`) and both
its children (`tsx watch`, the API server) no longer existed; both `https://localhost:5173`
and `https://localhost:3000` were unreachable with no listeners on either port.

I did not run any kill/restart/stop command — only `ps`/`lsof`/`curl`/`find`/`grep`/`ls`/`cat`.
Per the dispatch's explicit constraint I did not attempt to restart it. Reported this to the
dispatching agent immediately (before finishing this write-up) since the server is a shared
resource another concurrent session may depend on. Causation is not proven — the timing
(client reconnect storm immediately preceding the crash) is suspicious enough to flag for
whoever owns that process to check the API server's own exit reason/log once it's restarted,
but I cannot rule out an unrelated cause (e.g. the concurrent `/admin/sites` design-pass
session).

## Disk verification

`ls sites/` (both before the browser work and again after the crash): only `README.md` and
`tovu-com` — **no `fashion` directory was ever created.** This is the expected outcome given
the tool gap (the assistant never had a path to call `createSite`, let alone a duplication
function that doesn't exist), not a case of "claimed success but nothing happened" — the
assistant's own tool search made clear before any action that no matching tool existed, and
the run never reached an attempt.

## Where it stopped, precisely

At the very first step: tool discovery. The assistant correctly searched for a matching tool
for both "duplicate" and "activate a theme," found none, and (per the trace available) had not
yet produced its final natural-language answer when the run was orphaned by an unrelated
Playwright tab loss on my end. It did not get as far as attempting even the lesser capability
("create a blank new site") because that too is not wired as a tool — there is truly zero
tool-level path from the assistant into `site-dir`'s create/list/activate functions.

## Smallest changes that would close each gap

1. **"Create a new (blank) site"** — the closest existing building block. Add a
   `features/site-management/tool-registrations.ts` following the exact
   `contribute<Domain>Tools()` pattern the other 15+ registry-based domains already use (see
   `comments/tool-registrations.ts` for the shape), wrapping `listSites`/`createSite` from
   `site-dir/site-registry.ts`, gated by the same `system.write`/`isSiteSwitcherEnabled()`
   checks the HTTP route already enforces. Register it in
   `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`. This gives the
   assistant "create a new empty site," **not** duplication.
2. **"Duplicate an existing site"** — a real gap, not just a wiring gap. Nothing in
   `site-dir` copies a source site's `content.db`, `uploads/`, or theme folder into a new site
   directory; `createSite`/`initSite` only ever seeds a fresh blank site. This needs new
   platform-layer logic (e.g. `duplicateSite({ sourceName, newName })` in `site-registry.ts`)
   before it can become either an HTTP route or a tool.
3. **"Activate a theme"** — no assistant tool sets a site's active theme at all; only file
   tools exist. If an admin-UI mechanism for this exists (not traced in this probe — out of
   scope), it would need its own tool wired the same way as (1) once it's identified.

## Constraints honored

Nothing was created outside the intended "fashion" attempt (nothing was created at all — the
tool gap prevented any write). No production code was modified. No test suites were run. The
dev-server incident above was reported, not fixed.
