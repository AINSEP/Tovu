# Assistant tool coverage audit: what a human can do that the chat assistant can't (2026-09-07)

Software Architect. Bootstrap confirmed: `AI-Dev-Shop/agents/software-architect/skills.md` loaded.
Design/audit only — no source touched.

Builds on `ADS-memory/reports/2026-09-07-page-tool-gap.md` (page-copy gap, confirmed and not
re-reported below except where a sibling gap it did NOT cover is called out). `content_post_duplicate`
+ `adminUrl` + copy/duplicate keywords are being built by agent F-PAGECOPY — treated as fixed here.

## Method

Two enumerated lists, diffed. List A = every tool actually wired into the authenticated admin
assistant's catalog, sourced from `server/runtime/composition/tool-catalog-manifest.ts` (the 30
`registerToolContributor(...)` calls) plus `assistant/tool-registrations.ts`'s residual `DOMAIN_SLICES`
(demo/meta tools + `external-mcp-reauth`) plus dynamic `agent_plugin_<id>` tools. List B = every admin
HTTP route directory under `server/inbound/admin-http/routes/` (74 route-file directories), each
route being the thing a human admin UI action ultimately calls. Cross-checked catalog `agent-tools.ts`
files directly (not the manifest alone) since several domains (`identity`, `navigation`, `settings`,
`workspace`, `media`, `content-types`, `entries`, `taxonomy`) are thin re-export shims over
`@jini-ai/cms/*` catalogs — read from `/Users/la/Programming/Jini/packages/cms/src/*` (source, not
`node_modules` symlink target's `dist`).

## List A — the admin assistant's actual tool surface (by domain)

Wired via `installFirstPartyToolContributors()` (`tool-catalog-manifest.ts`), 30 domains:

| Domain | Tools |
|---|---|
| comments | list_moderation_queue, get_settings, update_settings, approve_comment, mark_comment_spam, trash_comment, restore_comment |
| content-types (`@jini-ai/cms`) | collections_content_type_{define,deprecate,list,reactivate,tombstone,update_fields}, collections_{plan,execute}_cleanup |
| custom-credentials | list, verify, make_request, set_username, set_token, create |
| database | get_health, get_schema_state, list_pending_migrations, query_timeline, list_restore_points, plan/execute_migrate_forward, backup_create_restore_point, get_restore_guidance |
| deployments | trigger_export, get_export_status, list, get/set_dockerfile |
| entries (`@jini-ai/cms`) | collections_entry_{create,list,publish,unpublish,update} |
| forms | list/create/update_definition, set_definition_status, list_submissions, get_submission |
| identity (`@jini-ai/cms`) | identity_role_{assign,create,delete,list,rename}, identity_policy_{attach,create,delete,list,update}, identity_user_{create,disable,enable,list,update_email} |
| webhooks | list_subscriptions, get_deliveries, create/pause/delete_subscription |
| media (`@jini-ai/cms` + Tovu publicUrl) | list_assets, trash_asset, update_metadata, upload_asset |
| media-generation | generate_asset |
| media-import | import_from_url |
| members | list, get_by_id, disable, request_magic_link |
| navigation/menus (`@jini-ai/cms`) | menus_{assign_location,create_menu,get_menu,list_menus,update_menu_tree} |
| newsletter | list/get_campaign, list_lists, list_subscriptions, list_send_log, create/update/cancel/pause_campaign, create/archive_list, create/remove_subscription, resend_confirmation |
| pages | read_html, write_html |
| plugin-runtime | plugins_list, plugins_set_enabled |
| post | content_post_{search,list,get,create,update,delete} |
| recovery | backup_list_restore_points, backup_get_capabilities, backup_plan/execute_restore, backup_create_restore_point, recovery_get_status, recovery_resolve_deep_link |
| redirects | list, get, get_hits, create, update, tombstone, import |
| seo | get_entry_meta, analyze_entry, set_entry_overrides, get/set_settings, regenerate_sitemap |
| settings (`@jini-ai/cms`) | clear, get_effective, get_raw, list_definitions, register_definitions, reset, set, set_ui_preference |
| site-evidence | site_collect_page_evidence |
| site-inspection | site_get_profile, fetch_published_page |
| sites | sites_duplicate_site |
| source-control | source_control_execute_commit, source_control_get_capabilities |
| static-publish (`deployments/publish-agent-tools.ts`) | preview/execute_static_publish, get_static_publish_capabilities, propose_custom_provider_credential, generate_bucket_hosting_setup |
| taxonomy (`@jini-ai/cms`) | taxonomy_{assign_terms,create_taxonomy,create_term,list,rename_term}, taxonomy_plan_merge_term (6 of 7 wired — `taxonomy_execute_merge_term` deliberately unwired, see Deliberate section) |
| theme | theme_list, theme_list_files, theme_{read,write,edit,rename,trash}_file, theme_restore_trashed_file (8; several deliberate absences, see below) |
| widgets | list/get_instance, list/get_region, create/update/trash_instance, bind_region, set_region_placements, insert/remove/reorder_embed |
| workspace (`@jini-ai/cms`) | workspace_{create,get,update,delete} |

Not part of the 30-domain rollout but wired separately, same catalog:
- `site-evidence`, `custom-credentials`, `media-generation`, `sites` — new domains added post-rollout (see manifest header), already counted above.
- `agent-plugins` — one dynamic tool per installed Agent Plugin (`agent_plugin_<pluginId>`), wired at daemon boot (`agent-daemon-server.ts`), not through the manifest.
- Legacy `DOMAIN_SLICES` residue in `assistant/tool-registrations.ts`: 4 demo/meta UI-transport tools (`demo-choices`, `demo-a2ui`, `demo-image`, `render-ui`), `component-catalog` (search/describe components), `ask-choice`, and **`external-mcp-reauth`** (`external_mcp_reauth_prompt` — a re-auth *notice* tool only, NOT the external-mcp management tools; see Gap #1).
- `page.navigate`/`page.*` — `@jini-ai/agentic`'s `PAGE_CAPABILITIES`, spread into the admin assistant's frontend-control tool set via `frontend-control-capabilities.ts`. Navigates admin SPA *screens* (by `ADMIN_AGENT_PAGE_PATHS` id), unrelated to CMS content — already documented in the prior report.
- Federated/external MCP tools: once a human has connected an external MCP server (via the admin Settings form — chat cannot do this, Gap #1), that server's own tools become reachable through `execute_delegated_tool`. Not enumerable statically; scoped per connected server.

**Separate, deliberately read-only surface — NOT the admin assistant:** `assistant/site/*` (ADR-054, anonymous visitor chat) exposes exactly 3 read tools (`search_published_entries`, `get_published_entry`, `list_categories`) plus 3 navigation directives. Confirmed by the prior report; restated here only so this audit's "no tool for X" findings are not misread as applying to that surface — they don't, it was never meant to write anything.

## List B — the admin's actual capability surface (HTTP route directories)

74 leaf directories under `server/inbound/admin-http/routes/`. Grouped by whether List A has a
domain-level match:

**Full or near-full tool parity:** comments, content-types, database(+database-recovery), deployments,
entries, forms, media (mostly), members, menus, newsletter, pages(mostly), plugins(mostly), posts(mostly),
redirects, seo, settings, taxonomy(mostly), themes(mostly), widgets, workspace, recovery, source-control
(via `system/source-control-credentials`), site (site/profile.ts).

**No tool-domain match at all (human-only, zero chat coverage):**
- `analytics/recent-hits.ts` — read-only recent hit log (explicitly not a dashboard yet, Tier-3 deferred).
- `api-keys/{create-principal,issue,revoke}` — API key lifecycle, including the one route in the whole
  admin API that returns a raw secret (`issue.ts`'s own doc: "the only response... that contains a live secret").
- `assistant/*` — the chat assistant's OWN configuration (models, credentials, execution credentials,
  test-agent). Self-referential by nature.
- `change-sets/{get,list,revert}` — the audit-trail/undo system. **`revert` has no tool anywhere.**
- `commerce/status.ts` — read-only payment-provider status.
- `connectors/*` (Composio-backed third-party data connectors: connect/disconnect/list/get-config/put-config/statuses) — **zero assistant tools reference Composio anywhere in the codebase.**
- `marketplace/{list,download}` — browse/install themes from the local marketplace fixture.
- `skills/list.ts` — Agent Plugin skills listing (partially covered indirectly: each installed plugin's
  skills are folded into its own `agent_plugin_<id>` tool description, but there's no direct
  "what skills are installed" read tool).
- `system/{vendor-credentials,dockerfile-source(partial),module-status,deployment-overview}` — built-in
  (non-custom) vendor credential management has no tool; `custom_credential_*` only covers
  Access-Tokens-page custom providers.
- `presentation/{get,patch-active-theme,rescan-themes}` — **no tool anywhere reads or sets the active
  theme, or triggers a theme rescan.** `theme_list` (List A) lists discovered themes but never says
  which is active, and cannot switch it.
- `users/reset-password.ts` — deliberately excluded from `identity_*` (see Deliberate section).

**Route exists, tool domain exists, but the SPECIFIC operation is missing:**
- `themes/explore.ts` imports and wires `copyThemeFile` (theme file duplicate) for the human Explore
  screen — no `theme_copy_file` tool exists in `theme/agent-tools.ts`'s 8-tool catalog. Same
  correct-primitive/unwired-call-site pattern as `content_post_duplicate`, one layer down (file-level
  instead of row-level).
- `themes/explore.ts` also wires a "publish a standalone theme page" route
  (`isPublishableThemePageCandidate`/`isStandaloneThemePage`, tested by
  `explore-page-publish-route.test.ts`) — no corresponding tool.
- `plugins/uninstall.ts` — real, wired route (`DELETE .../plugins/:pluginId`, Milestone 2, 2026-08-20,
  calls `uninstallPlugin`). **`plugin-runtime/agent-tools.ts`'s own header is now factually wrong**: it
  says "There is no install/uninstall/upload tool. `features/plugin-runtime` has no admin ROUTE for
  either operation at all" — that was true when written, is false today. The comment predates (or was
  never updated for) the uninstall route.
- `external-mcp/*` (admissions, delete, list, oauth, probe, put) — `features/external-mcp/agent-tools.ts`
  defines a complete 5-tool catalog (`external_mcp_list/save/test_connection/oauth_connect/
  oauth_poll_device`) whose own header states the exact product goal ("a non-technical site owner
  should be able to type 'connect me to Higgsfield' into the admin assistant chat"), refers to "this
  file's handler" in `tool-registrations.ts` — **which does not exist.** No `contributeExternalMcpTools`
  function exists anywhere, no `DOMAIN_SLICES` entry, nothing in the 30-call manifest. A fully designed,
  reviewed, permission-scoped catalog that was never wired at all. Only `external_mcp_reauth_prompt` (a
  different, narrower tool for an already-broken connection) reached the assistant.

## Gap #0: repo-wide "no single-row duplicate" pattern — confirmed, extended

Confirmed as reported. Extending the entity list: posts/pages (being fixed by F-PAGECOPY),
collection entries (`collections_entry_*` has create/list/publish/unpublish/update, no duplicate),
media assets (no duplicate), redirects (no duplicate — plausible bulk-editing ask), widgets/widget
instances (no duplicate), forms (no duplicate), taxonomy terms (no duplicate, though `merge_term` is
adjacent), menus (no duplicate), **theme files** (route-level primitive exists, `copyThemeFile`, tool
does not — see List B). `sites_duplicate_site` remains the only "duplicate" verb in the entire tool
catalog.

## Gap: `theme_*` is not full CRUD — confirmed, extended

Confirmed: theme-level create/delete/rename-folder are deliberately excluded (owner decision,
documented in `theme/agent-tools.ts`'s own header — folder name IS the theme id; renaming/deleting
risks breaking live active-theme resolution). File-level hard-delete is also deliberately excluded
(soft-trash only). **Not previously flagged, and NOT disclosed as deliberate anywhere:** switching the
*active* theme and triggering a theme rescan have no tool at all — `theme/agent-tools.ts`'s own header
just says active-theme selection is "a separate, already-exposed operation" (meaning the HTTP route),
never argues it should stay human-only. Nor does `theme_copy_file` exist despite the route-level
primitive already existing.

## Ranked gaps

Ordered by (likelihood × failure severity); effort noted per gap.

### 1. `external_mcp_*` — the entire "connect an external MCP server from chat" catalog is unwired
- **Entity + operation:** external-mcp — list/save/test/oauth-connect (5 tools, fully designed, zero handlers).
- **Likelihood:** High — this is the owner's own literal example use case, per the catalog's header ("type 'connect me to Higgsfield' into the admin assistant chat"), not a hypothetical.
- **What happens today:** Silent-ish failure via misdirection, not a crash — the model has no tool at all, so it either fabricates a plan, or falls back to `assistant_admin_screen_link` pointing at Settings and tells the human to do it by hand, defeating the entire feature's stated purpose. No error surfaces that says "this should have worked."
- **Effort:** Small — write `features/external-mcp/tool-registrations.ts` mapping the 5 already-defined `agent-tools.ts` entries to their existing service functions (`external-mcp-store.ts`, `save-form.ts`), then two edits to `tool-catalog-manifest.ts` (import + `registerToolContributor` call), exactly the registration pattern every other domain follows. No new design work — the catalog, permission, and secret-handling design are already done and reviewed.

### 2. `change-sets` revert — no undo tool anywhere
- **Entity + operation:** change-set — revert.
- **Likelihood:** High — "undo that" / "revert my last change" is one of the most natural things to ask an assistant that just made an edit, especially right after a mistake.
- **What happens today:** The assistant has no way to know a revertible change-set even exists. It would either refuse, or attempt to manually reconstruct the prior state via `content_post_update`/etc. — lossy and error-prone (loses exact field-level history `revertChangeSet` guarantees), with no signal to the user that a cleaner mechanism was skipped.
- **Effort:** Medium — new tool(s), e.g. `changeset_list`/`changeset_revert`, need a design pass: what happens if the model calls revert on a change-set it doesn't fully understand the blast radius of (this looks structurally similar to `backup_execute_restore`/`database_execute_migrate_forward` — likely needs the same actor-class/confirmation gating, not a bare wire-through).

### 3. `theme_copy_file` — file-level duplicate primitive exists, unwired
- **Entity + operation:** theme file — copy/duplicate.
- **Likelihood:** Medium — "duplicate this template so I can try a variant" is a plausible theme-editing ask, same shape as the page-copy gap.
- **What happens today:** No tool exists; the model would have to `theme_read_file` then `theme_write_file` to a new path — works today (unlike the page case, no known hidden-coupling trap analogous to widgetEmbed placements, since theme files don't reference row-scoped placement ids), but nothing tells the model to compose it this way, and no `tool-search-keywords.ts` entry mentions "copy"/"duplicate" for any `theme_*` tool. Fails by the model not trying, not by producing a wrong result.
- **Effort:** Small — either wire `copyThemeFile` as `theme_copy_file` (mirrors the exact shape `content_post_duplicate` is getting), or just add copy/duplicate keywords to `theme_write_file`'s search entry so the model reliably finds the compose-it-yourself path. Cheapest fix is the keyword one.

### 4. `plugins_uninstall` — route shipped, tool catalog's own justification for omitting it is now false
- **Entity + operation:** plugin — uninstall.
- **Likelihood:** Medium — "remove this plugin" is a reasonable admin ask once plugins accumulate.
- **What happens today:** No tool; the model has no path to it at all (not even a documented "ask the human" fallback specific to this), and the one design document that exists (the catalog header) asserts the operation doesn't exist in the admin surface, which is now wrong — a future engineer reading that file will not know to reconsider.
- **Effort:** Small-medium — `uninstallPlugin` already exists and is called by a reviewed, gated route; wiring a `plugins_uninstall` tool is mostly permission/actor-class-rule design (is uninstall irreversible enough to need the same treatment as `theme_delete_file`'s human-only carve-out? `uninstall.ts`'s own doc says it's deliberately NOT wrapped in the revert/change-set machinery — "no meaningful restore" — which argues for at least the same caution `backup_execute_restore` gets, not a bare wire-through).

### 5. Presentation — no tool to switch or query the active theme
- **Entity + operation:** presentation — get/set active theme, rescan themes.
- **Likelihood:** Medium — "switch to the theme I just installed" / "use the light theme" is a plausible ask once more than one theme exists.
- **What happens today:** No tool, no fallback pointer — `theme_list` will tell the model what's discovered but not what's active, and nothing lets it change it. The model likely defaults to `assistant_admin_screen_link` (Settings/Presentation) if it thinks to, but nothing steers it there specifically for this ask.
- **Effort:** Small — `features/presentation` has no `tool-registrations.ts` at all yet; needs one new small domain (2 tools: get/set active theme, maybe a third for rescan), following the `site-inspection`/`site-evidence` "new standalone domain" pattern in the manifest.

### 6. Composio `connectors` — a whole integration surface unreachable from chat
- **Entity + operation:** connectors — list/connect/disconnect/get-config/put-config/status.
- **Likelihood:** Low-medium — plausible ("connect my Google Drive") but the OAuth-redirect step genuinely needs a human browser in the loop for at least the connect step, same constraint `external_mcp_oauth_connect` (Gap #1) already designed around (hand back a link, poll for completion).
- **What happens today:** No tool at all, not even a read-only "what connectors are available/connected" — worse coverage than external-mcp's design (which at least separates the read-only list from the human-gated connect step).
- **Effort:** Medium — the external-mcp catalog (once wired, Gap #1) is the template: read-only list/status tools are cheap; the connect flow needs the same link-handoff design already worked out there.

### 7. Built-in vendor credentials — no tool, likely deliberate but unconfirmed
- **Entity + operation:** vendor-credentials (AWS/GitHub/etc. built-in providers) — list/status.
- **Likelihood:** Low — credential entry itself should almost certainly stay human-typed (same secret-in-transcript reasoning `external_mcp_save`/`deployment_propose_custom_provider_credential` already codify), but a read-only "what's configured" parallel to `custom_credential_list` has no equivalent and isn't discussed anywhere.
- **What happens today:** No tool; the model cannot even tell the human what's already connected without navigating them to Settings.
- **Effort:** Small, if wanted — a read-only list tool only; do not add a write path (matches the established secret-handling doctrine in this codebase).

### 8. `users/reset-password`, `identity` `writePolicyPermission` — CONFIRMED DELIBERATE, not gaps
Both are explicitly disclosed and reasoned in `identity/agent-tools.ts`'s own header (account-takeover
primitive with no grant-authority clamp; ripple-to-untargeted-principals blast radius). Listed here
only so they are not mistaken for open items by a reader of this audit.

### 9. `taxonomy_execute_merge_term` — CONFIRMED DELIBERATE
Declared unwired in `features/taxonomy/tool-registrations.ts`'s own header: destructive, fails the
gateway's actor-class rule for agent-initiated destructive ops, no confirmation transport exists for
it. `taxonomy_plan_merge_term` (the safe preview half) IS wired.

### 10. `theme_delete_file`, `theme_create`/`theme_delete`/`theme_rename_folder` — CONFIRMED DELIBERATE
Already covered by the prior report; re-confirmed directly against `theme/agent-tools.ts`'s own
header, including a named regression test (`tool-registrations.themes.test.ts`) certified to keep
failing if either is added back.

### 11. `plugins` install/upload — CONFIRMED DELIBERATE (route genuinely doesn't exist)
Unlike uninstall (Gap #4), there really is no admin HTTP route for plugin install/upload — v1 install
is a filesystem-only operation per `ui.spec.md`. A tool cannot be written against an operation that
doesn't exist at any layer. Not a gap.

### 12. `api-keys` issue/revoke — LIKELY DELIBERATE, unconfirmed
Not discussed in any file header the way identity's exclusions are, but `issue.ts`'s own doc
("the only response in the admin API that contains a live secret") makes the reasoning obvious by
extension of this codebase's established doctrine (no tool ever receives or returns a raw secret via
the model). Flagged as *likely* rather than *confirmed* deliberate because, unlike identity/theme, no
file actually says "and therefore no tool" — worth a one-line ADR note if this audit prompts a review,
but not urgent.

## Silent-failure surface checks

1. **`tool-search-keywords.ts`.** Beyond the already-confirmed `content_post_*` copy/duplicate gap
   (being fixed by F-PAGECOPY): no `theme_*` entry mentions "copy"/"duplicate" (Gap #3's cheapest fix).
   Spot-checked `identity_*`, `webhooks_*`, `taxonomy_*`, `widgets_*`, `redirects_*`, `members_*`,
   `plugins_*` entries — vocabulary looks representative of how a user would actually phrase requests
   (e.g. `identity_user_disable`: "lock out block ban suspend deactivate revoke disable"). No second
   instance of a wired-but-unfindable tool turned up in this spot check; superseded by the full,
   completed diff below.
2. **Registration wiring.** Two confirmed instances beyond Gap #1: none — `external_mcp_*` is the only
   fully-cataloged-but-never-registered domain found. Everything else in `features/*/agent-tools.ts`
   that defines a catalog does reach a `contribute*Tools()`/manifest call, confirmed by cross-referencing
   every `features/*` directory containing an `agent-tools.ts` or catalog-shim `tool-registrations.ts`
   against the 30 manifest calls plus `DOMAIN_SLICES` — plus, closing a gap in that cross-reference
   itself, the two daemon-only registrations (`media_promote_chat_attachment`,
   `chat_list_pending_attachments`) called directly in `agent-daemon-server.ts` outside any of those
   mechanisms (found while reconstructing the tool count for the consolidation addendum, §1 there) —
   both ARE wired, just via a third registration pattern this pass had not accounted for.
3. **Misleading descriptions.** Not systematically re-audited beyond the keyword diff below; the
   one confirmed instance is `plugin-runtime/agent-tools.ts`'s stale "no uninstall route exists" claim
   (Gap #4), which is a documentation-accuracy problem, not a description a model reads.

## `tool-search-keywords.ts` — completed diff (every catalog id vs. every keyword entry)

Closed out, at the owner's request for completeness. Extracted every `name: "..."` id from every
`features/*/agent-tools.ts` (Tovu) and every `@jini-ai/cms/*/agent-tools.ts` (the 8 shimmed domains) —
**178 catalog-declared ids** (wired and deliberately-unwired together, e.g. `taxonomy_execute_merge_term`)
— and every keyed entry in `tool-search-keywords.ts` — **158 ids**. Diffed both directions:

**26 catalog ids with NO keyword entry at all** (indexed on their raw `description` field only, per
`tool-catalog-query.ts`'s `indexedDescriptionFor` — not unfindable, but missing whatever extra
synonym coverage the keyword layer exists to add):

`backup_execute_restore`, `collections_execute_cleanup`, `collections_plan_cleanup`,
**`content_post_duplicate`** (the tool F-PAGECOPY just added has the identical keyword gap its own
sibling `content_post_create` was flagged for — needs closing in the same change), all six
`custom_credential_*` (list/verify/make_request/set_username/set_token/create — the ENTIRE domain has
zero keyword coverage), `database_execute_migrate_forward`, `database_get_restore_guidance`, all five
`external_mcp_*` (moot until Gap #1 is wired, but will need this too when it is), `redirects_import`,
`settings_clear`/`settings_register_definitions`/`settings_reset`/`settings_set`, **`sites_duplicate_site`**
(the SAME "duplicate"-keyword gap as `content_post_*`, in the one tool that already IS a duplicate
operation — "copy this site for a new client" may not find it either), `taxonomy_execute_merge_term`
(moot, deliberately unwired), `workspace_create`, `workspace_delete`.

**Read as a pattern, not a list of 26 unrelated misses: every domain's WRITE-ish/execute-tier
operations and every "duplicate" verb specifically are the two clusters most often missing keywords.**
That is consistent with, and extends, the original report's finding on `content_post_create` — this
is not an isolated miss, it is close to a systemic gap in how "copy"/"duplicate" and "execute" verbs
get keyworded across the whole catalog, not just the one domain already reported.

**6 keyword entries with no matching id in this pass's 178-id extraction — verified as extraction
gaps in THIS audit, not stale entries in the source file:** `assistant_render_ui`, `describe_component`,
`search_components` (the `DOMAIN_SLICES` meta/UI tools, defined outside any `features/*/agent-tools.ts`
file, so outside this pass's glob — real, current tools); `source_control_execute_commit`/
`source_control_get_capabilities` (declared inline in `features/source-control/tool-registrations.ts`,
not a separate `agent-tools.ts` — also missed by the glob, also real); `media_promote_chat_attachment`
(the daemon-only tool found in §2, item 2 above — real, and its own keyword entry is present and
correct). All six checked individually against source and confirmed live — **zero actually-stale
keyword entries found.**

## Admin route parity — precise accounting of what was and wasn't opened

The original pass matched most routes by directory name against the tool list's own operation names
rather than opening every file. Stated precisely, per the owner's request: route **bodies** were read
in full for every route this report treats as a gap or ambiguous (`connectors/*`, `change-sets/*`,
`commerce/status.ts`, `marketplace/*`, `api-keys/*`, `analytics/recent-hits.ts`, `themes/explore.ts`,
`plugins/uninstall.ts`, `presentation/*`) plus the ones probed for the consolidation addendum
(`agent-daemon-server.ts`, `byok-tool-surface.ts`, `mcp-injection.ts`, `frontend-control-capabilities.ts`).
**Name-matched only, not opened field-by-field, in the "full or near-full tool parity" bucket:**
`comments/*` (6 files), `content-types/*` (5), `database/*`+`database-recovery/*` (4),
`deployments/list.ts` (1), `entries/*` (4), `forms/*` (8), `media/*` (10, except `get-providers.ts`/
`put-providers.ts`, whose header was read to confirm the vendor-credential-parity gap), `members/*` (4),
`menus/*` (6), `newsletter/*` (14), `pages/*` (5, `update-html.ts` cross-checked by name against
`pages_write_html` only), `plugins/list.ts`+`set-enabled.ts` (2), `posts/*` (7 — `autosave.ts`/
`template-preview.ts` specifically not opened, judged low-likelihood-ask), `redirects/*` (8), `seo/*`
(6), `settings/*` (9), `taxonomy/*` (7), `widgets/*` (14), `workspace/*` (6), `recovery/*` (5),
`source-control` (inferred via `system/source-control-credentials.ts` only), `site/profile.ts` (1).
That is the exact scope of "matched by name, not verified field-by-field" — roughly 130 individual
route files across 22 directories. A field-level pass over all of them (checking every route's
request/response shape against its matching tool's input/output schema) was judged out of proportion
to this audit's purpose (finding MISSING tools, not subtly-mismatched ones) and was not done; flagging
the exact scope here rather than re-asserting "full parity" as a checked fact.

- **Federated/external MCP tools** (tools belonging to an already-connected external server) are
  real additional surface once Gap #1 is fixed or a server is connected by hand, but are per-installation
  and not enumerable statically — not included in List A's count (quantified precisely as "0 by
  default" in the consolidation addendum, §1).
- Did not re-verify F-PAGECOPY's in-flight work beyond confirming `content_post_duplicate` is now
  present in source (used directly in the consolidation addendum, §2/§5) — its keyword coverage, noted
  above, is the one open item against it.

---

# Addendum (owner request): should the tool surface consolidate?

Owner's framing: fewer, more flexible tools ("twenty that do a lot of different things with different
arguments") instead of one tool per operation. Answered from code, not from the premise.

**Revision note:** the first pass of this addendum understated the registered count (it only measured
`buildAssistantToolRegistrations`'s own output) and did not yet have empirical confirmation from a real
run. Both are corrected below — §1 has a higher, more precisely-sourced count, and §3 now cites a real
captured admin-assistant transcript in `sites/tovu-com/chat.db`, not just source-code reasoning. The
conclusion is unchanged and, if anything, more strongly supported by the correction: a bigger true
count makes the discovery-layer's job more necessary, not less.

## 1. Current tool count — corrected, per surface

No live measurement was taken (not permitted to boot the server this pass); reconstructed from the
codebase's own dated comments plus a full accounting of every registration call site (not just the
main manifest), which is the most a static audit can honestly claim:

**Admin assistant (authenticated), full registry — ~182 tools, in three layers:**
1. `buildAssistantToolRegistrations()` (the 30-domain manifest + `DOMAIN_SLICES` residue): a literal
   runtime measurement in `assistant/tool-registrations.ts`'s own header — 2026-08-26,
   `buildAssistantToolRegistrations(createRouteDeps())` after `installFirstPartyToolContributors()`
   returned **154** distinct tool ids ("Trust the measurement, not the table"). Additions dated after
   that, each named in source: `assistant_admin_screen_link` (+1, 09-03), `external_mcp_reauth_prompt`
   (+1, 09-02), `search_components`/`describe_component` (+2, 08-30), `assistant_ask_choice` (+1,
   08-30), `custom_credential_*` (+6, 08-31), `media_generate_asset` (+1, 09-02),
   `sites_duplicate_site` (+1, 09-05). Subtotal: **154 + 12 = ~166-167** (±1 depending on whether
   `site_collect_page_evidence`, also dated 08-26, landed before or after that day's measurement).
2. **Two daemon-only tools, registered directly in `agent-daemon-server.ts`, NOT part of
   `buildAssistantToolRegistrations`'s measured output** (confirmed by reading the registration code
   directly: `registry.register(buildPromoteChatAttachmentTool(...))` and
   `registry.register(buildListPendingChatAttachmentsTool(...))`, both called on the same `registry`
   after the loop over `assistantRegistrations` has already finished) — `media_promote_chat_attachment`
   and the chat-attachment discovery tool. **+2.**
3. **`FRONTEND_CONTROL_CAPABILITIES`, also registered separately** (`frontendControl.toolRegistrations`,
   wired via `createFrontendControl` — this is `page.navigate` and its siblings, previously discussed
   only qualitatively in the gap section above): `PAGE_CAPABILITIES` (`@jini-ai/agentic`) is exactly 7
   (`page.find_elements/highlight/scroll_to/click/fill/select_option/navigate`, counted directly from
   `page-capabilities.ts`); `CHAT_CAPABILITIES` (`@jini-ai/chat/core`) is 7, minus exactly 1 filtered
   out (`chat.reset_conversation`, confirmed by the file's own comment: "requires a confirmation
   transport this host does not have") = 6; `TOVU_FRONTEND_CAPABILITIES` is 1
   (`admin.capture_screenshot`). **+14.**

Total: **~166 + 2 + 14 ≈ 182** tools live in the admin assistant's `ToolRegistry` today. Recommend the
owner treat this as accurate to within a few tools, not exact — the only way to pin it exactly is a
one-line runtime measurement (`registry.list().length`), which this pass could not run.

**Anonymous visitor site chat (ADR-054):** 3 model-callable tools (`search_published_entries`,
`get_published_entry`, `list_categories`) + 3 client-side navigation directives
(`navigate_to_entry`/`scroll_to_entry`/`highlight_entry`), confirmed against `assistant/site/tools.ts`
and `assistant/site/client-directives.ts`. **6 total**, all read-only by design.

**Federated MCP:** **0 by default**, growing only per externally-connected server. `mcp-federation/
presets.ts` is a registration mechanism (a preset registry keyed by `presetId`), not a fixed tool list
— a workspace with no external MCP server connected contributes zero tools from this layer; each
connected server contributes whatever tools IT declares, which is unenumerable statically and unrelated
to Tovu's own ~182. This is precise, not an evasion: the honest answer to "how many federated MCP
tools" is "however many the operator has connected, currently indeterminate from source alone."

**This number is not "hundreds" — it's ~182 — and, more importantly, per §3 below, it is also not the
number that reaches the model.**

## 2. Near-duplicate families (the real consolidation candidate list)

Grouping by "same entity, same arg skeleton, different verb" — genuine candidates only, not tools that
merely share a wrapper:

| Family | Tools | Arg skeleton | Permission(s) |
|---|---|---|---|
| `content_post_*` | search, list, get, create, update, duplicate, delete (7 — `duplicate` confirmed already landed in `features/post/agent-tools.ts` as of this pass, F-PAGECOPY's work) | `{id?, filters?, fields}` | 2: `content.read` (search/list/get), `content.write` (create/update/duplicate/delete) |
| `collections_entry_*` | create, list, publish, unpublish, update (5) | `{entryId?, contentType, fields}` | mixed read/write |
| `collections_content_type_*` | define, list, update_fields, reactivate, tombstone, deprecate (6) + plan/execute_cleanup (2) | `{contentTypeId?, schema}` | mixed |
| `identity_role_*` | assign, create, delete, list, rename (5) | `{roleId?, name?, principalId?}` | one identity-management permission tier |
| `identity_policy_*` | attach, create, delete, list, update (5) | `{policyId?, rules?}` | same tier |
| `identity_user_*` | create, disable, enable, list, update_email (5) | `{userId?, email?}` | same tier |
| `taxonomy_*` | assign_terms, create_taxonomy, create_term, list, rename_term, plan_merge_term (6) | `{taxonomyId?, termId?}` | `admin.taxonomy.manage` (4 of 6) + one inline-checked read (`taxonomy_list`) + one gateway-checked plan |
| `widgets_*_instance` | list, get, create, update, trash (5) | `{instanceId?, regionId?, config}` | mixed |
| `redirects_*` | list, get, get_hits, create, update, tombstone, import (7) | `{redirectId?, match, target}` | mostly one permission, `import` likely stricter |
| `theme_*_file` | list_files, read_file, write_file, edit_file, rename_file, trash_file, restore_trashed_file (7) | `{themeId, path}` | `theme.set` (read) vs a separate write permission (see prior section) |
| `workspace_*` | create, get, update, delete (4) | `{workspaceId?, name?}` | clean CRUD |
| `comments_*_comment` | approve, mark_spam, trash, restore (4) | `{commentId}` | **NOT clean** — 3 of 4 share `comments.moderate`, `trash` alone requires `comments.delete` (see §4) |

This is a representative sample (~12 families covering roughly 60 of ~182 tools), not an exhaustive
classification of the full registry — doing that for all ~182 was outside this pass's budget, and a
partial list flagged as partial is more honest than a claim of full coverage. Every family shown
passed a real check against source (permissions read directly from each domain's `agent-tools.ts`,
not assumed from naming) — this is the same rigor the gap section above used, applied to the
consolidation question.

## 3. THE HINGE: does the model ever see the full catalog? No — confirmed in code, both execution paths

This is the load-bearing fact for the whole recommendation, so it is stated with its exact evidence
rather than summarized:

**BYOK path** (`assistant/byok-tool-surface.ts`, in-process, no spawned CLI): the full registry is
built (`buildAssistantToolRegistrations`, ~166 of the ~182 tools — the frontend-control/daemon-only
layers in §1 are daemon-specific and not part of this path) — but the model is **never shown it**.
`META_TOOL_DESCRIPTORS` (lines 126-193 of that file) is a fixed array of exactly **3** tool
descriptors — `search_tools`, `describe_tool`, `execute_delegated_tool` — and the file's own comment
states the reason and the measurement directly: *"publishing the real catalog costs ~119 KB (~30k
tokens) on EVERY message of every conversation — measured, not estimated, against the live registry.
These 3 descriptors are under 1 KB."* Every real tool call goes through `execute_delegated_tool`,
resolved by id after a `search_tools`/`describe_tool` round-trip.

**Spawned-CLI path** (`agent-daemon-server.ts` spawning Claude Code/Codex via `@jini-ai/daemon`'s
`AgentExecutor`, wired through `assistant/mcp-injection.ts`): the spawned CLI is handed an MCP server
(`jini-mcp`'s `bin/serve.js`) whose own exposed defs are `search_tools`/`describe_tool`
(`@jini-ai/mcp/server/tools/tool-catalog-tools.ts`, proxying `GET /api/tools/search` /
`GET /api/tools/:id`), `execute_delegated_tool`/`execute_readonly_delegated_tool`
(`tools/delegated-tool.ts`), `search_components`/`describe_component`, and a small fixed run-tools
set — again a HANDFUL of meta-tools (4 confirmed actually invoked, see below; up to ~9 declared), not
the registry. `tool-catalog-tools.ts`'s own doc states the same discovery contract explicitly: *"a
caller still runs a discovered id through `execute_delegated_tool`... Finding a tool id here grants
nothing."*

Both paths trace to the same design decision, dated before either implementation:
**ADR-049 Decision 2/4** and `PROP-tool-catalog-discovery-2026-07-26.md` §6. This was already built,
on 2026-07-26, to solve exactly the problem the owner is describing now.

**Empirical corroboration, not just static reading:** `sites/tovu-com/chat.db` (opened read-only,
`file:...?mode=ro`, per instructions) holds `ai_chat_messages.events_json` — a raw captured event
stream from real spawned-CLI admin-assistant sessions. Extracting every `tool_use` invocation across
the full stored history (`grep -oE '"id":"toolu_[a-zA-Z0-9]+","name":"[a-zA-Z0-9_.]+"'`) gives an
**exhaustive, exact count of every distinct tool name a real session actually called**:

| Tool name invoked | Count |
|---|---|
| `mcp__jini__search_tools` | 48 |
| `mcp__jini__execute_delegated_tool` | 31 |
| `mcp__jini__describe_tool` | 31 |
| `ToolSearch` (the CLI's own native deferred-tool loader, unrelated to Tovu's domain registry) | 22 |
| `Read` (native CLI tool) | 8 |
| `mcp__jini__execute_readonly_delegated_tool` | 6 |

**Zero** occurrences of any bare domain tool id (`content_post_create`, `custom_credential_list`, etc.)
as a top-level invoked tool name, across the entire captured history. Every domain operation that ran
did so as the `toolId` argument INSIDE an `execute_delegated_tool`/`execute_readonly_delegated_tool`
call — e.g. a `describe_tool` result for `custom_credential_list` appears only as JSON text inside a
tool RESULT, never as a name Claude called directly. This is real production evidence, not just source
reading, for the exact claim §3 makes: **the registry's ~182 tools never individually reach the
model's tool-definition list; only 4 jini meta-tool names ever do, in this entire capture.**

**Answer to the owner's actual question, stated plainly: no, the admin assistant is not served the
whole catalog, in either execution mode, confirmed both in source and in a real captured run. A
typical turn's tool-definition footprint is on the order of 3-4 meta-tool descriptors, under 1-2 KB,
regardless of whether the registry holds 20 tools or 2,000.** Tool count is not the binding constraint
on context size today, and consolidating the registry from ~182 tools to ~20 would not shrink what any
given turn sends to the model — it is already as small as it gets.

(Caveat: a long conversation's history retains every past `describe_tool` result and every past tool
call's arguments/output, so context DOES grow with turns — but that growth is driven by how many
DIFFERENT tools get invoked in one conversation, which consolidation does not reduce either: fewer,
bigger tools called the same number of times produce the same number of `describe_tool` + result
round-trips.)

## 4. The honest tradeoff, evidenced against this repo specifically

Consolidation's cost is real, and this repo has a live example of exactly the failure the owner should
weigh it against:

- **The `page.navigate` incident (prior section, Gap analysis) is itself an instance of the
  over-consolidation failure mode, not a tool-count failure.** `page.navigate` is one tool serving one
  overloaded concept ("page" = an admin SPA screen id) that collides in vocabulary with a completely
  different concept this codebase also calls "page" (a CMS content row). The resulting error
  ("`'Landing sample' is not a published page`") was misleading specifically *because* one name/tool
  was asked to mean two things. Consolidating further — folding more concepts under fewer, broader tool
  names — is directionally the SAME move that produced this bug, not its fix. Any consolidation this
  repo does must not merge distinct nouns under one name; it should only merge distinct VERBS over the
  same noun (the families in §2).
- **Permission gating is the sharpest concrete risk, and this repo already has a family where it bites:**
  `comments_*_comment` (§2 table) looks like a textbook consolidation candidate — four tools, one
  `commentId` argument, only the verb differs. But `comments_approve_comment`/`mark_comment_spam`/
  `restore_comment` are gated on `comments.moderate` while `comments_trash_comment` alone requires the
  stricter `comments.delete` (confirmed directly in `comments/agent-tools.ts`). A single
  `comments_moderate_comment(commentId, action)` tool would have to either (a) gate the WHOLE tool on
  the stricter permission — silently locking out a moderator role that should still be able to
  approve/spam/restore, a real regression — or (b) branch authorization inside the handler by `action`,
  which is exactly the visible-at-the-catalog-level safety property this repo's per-tool permission
  model currently gives a security reviewer for free, now hidden inside a switch statement. Either
  choice is worse than four small tools for a family this small.
- **The framework's own `ToolPolicy` interface makes the argument-inspection cost concrete, not
  hypothetical.** Read directly from `@jini-ai/core/src/tool-registry.ts`: `ToolRegistration` is
  `{descriptor, handler, policy}` — exactly ONE `ToolPolicy` per registered tool id — and
  `ToolPolicy.authorize(ctx)` receives `ctx.input` (the call's actual arguments) alongside
  `ctx.tool`/`ctx.principal`/`ctx.run`. The interface is technically expressive enough to gate
  differently per argument. But every one of this repo's own ~182 catalog entries (confirmed by
  reading every `agent-tools.ts` catalog in List A) uses the SAME shape instead: a single static
  `authorization: { permission: string }` per tool id, checked once, before the handler ever sees the
  input. **Zero existing tools in this codebase branch authorization on input.** Consolidating any
  family that spans permissions (`comments_*` above; also `content_post_*`'s read/write split, and
  `theme_*_file`'s read/write split) would introduce a genuinely new kind of `ToolPolicy` with no
  precedent to follow, reviewed by nobody who has done it before — a real cost, not a style
  preference, distinct from and additional to the over-grant risk above.
- **Schema vagueness compounds with `content_post_*`-style domains that already made a deliberate
  narrow-vs-broad call.** `theme/agent-tools.ts`'s own header (quoted in the gap section above) argues
  at length for why theme tools stay broad on WHICH FILE and narrow on WHAT EDIT — the opposite
  argument would apply to collapsing `content_post_create`/`update`/`delete` into one `operation` enum:
  `create` and `update` already have different required-field shapes (`update` needs a concurrency
  token per the prior report's `PostVersionConflictError` handling; `create` does not), so a union
  schema either loosens required-field validation for both branches (the model can omit the
  concurrency token it should have been forced to supply) or the schema itself becomes a conditional
  monster the model reads worse than two small schemas.

## 5. Recommendation

**Do not consolidate for the reason given.** The stated motivation — reducing what the model has to
hold in context — is already solved, and solved more cheaply than restructuring ~182 tools would be:
every admin-assistant turn already sees 3-4 tool definitions, not the registry, confirmed both from
source and from a real captured run (§3). Consolidating would cost real safety/clarity (§4) to fix a
problem (§3) that does not exist in this codebase today.

**What actually caused the failure that prompted this whole audit (the page-copy request) was NOT
catalog size.** It was (a) a genuinely missing tool — `content_post_duplicate` did not exist at the
time of the failure (it exists now, added directly, confirmed present in `features/post/agent-tools.ts`
as of this pass — F-PAGECOPY's fix). No amount of consolidating the OTHER 181 tools would have invented
that missing capability; the fix that actually worked was adding one narrow tool, the opposite
direction from consolidation. And (b) a retrieval/naming problem: `content_post_create`'s search
keywords never included "copy"/"duplicate" (prior section, and confirmed again in the full keyword
diff below — even now, freshly added, `content_post_duplicate` itself has no keyword entry yet either),
and `page.navigate`'s vocabulary collided with an unrelated CMS concept. Both are
**retrieval-quality and naming problems**, which is the layer Tovu already invested in
(`tool-search-keywords.ts`, `tool-search-doc2query.ts`, the BM25 `search_tools` index) — and
`ADS-memory/reports/2026-09-08-parent-tool-read-eval.md`'s retrieval eval, run against the real
shipped catalog rather than a synthetic stand-in, supports the same conclusion: that layer works
well when a tool's description/keywords are honestly populated.

> **Correction (2026-09-08):** this paragraph originally cited "the measured
> 98%-top-10/100%-top-20 accuracy on a 130-case blind set (`byok-tool-surface.ts`'s own comment)"
> as its evidence. That figure was fabricated — `tool-search-heldout-v2.eval.ts`, the eval that
> comment claimed as its source, declares `CUTOFFS = [1, 3, 5, 10] as const` and has never measured
> a top-20 cutoff at all, so it cannot have produced the "100% in the top 20" half of the claim.
> `git log -S` on the exact phrase traces its introduction to `d6ac6975` (2026-08-08), added as new
> text with no measurement behind it. See `ADS-memory/reports/2026-09-08-byok-fabricated-stat.md`
> for the fix to the shipped prompt text (`byok-tool-surface.ts`, `assistant-system-overlay.ts`) and
> the full trail. No replacement figure is substituted here, deliberately: a retrieval percentage is
> a property of the current catalog, the catalog changed again the same day this correction was
> written, and restating a fresher number in a document nothing re-measures would reproduce the same
> defect with better initial data. The conclusion above does not depend on any specific number and
> stands on the eval report's qualitative finding instead.

The cheaper, lower-risk fix for "the assistant fails to find the right tool" is the same fix already
underway for the page-copy gap: keep tools narrow and numerous (safe, clear, one permission each), and
invest in **keyword/description accuracy and disambiguating overloaded nouns** (rename or re-describe
`page.navigate` so "page" cannot be misread as a CMS page, per the earlier gap section) rather than
shrinking the registry.

**If some consolidation is still wanted** (e.g., for a human auditing the registry, or to reduce the
number of near-identical descriptions competing in the search index — a real, narrower argument
`search_tools`'s BM25 ranking could benefit from, distinct from the context-size argument that doesn't
hold), restrict it to families in §2 that pass two tests: (1) every verb in the family shares ONE
permission (`workspace_*` and `identity_role_*`/`identity_policy_*`/`identity_user_*` pass; `comments_*`
and `content_post_*` do not, per §4), and (2) every verb's required-field shape is a strict subset/
superset of the others', not a genuinely different contract (`content_post_create` vs `_update`'s
concurrency-token requirement fails this test). Concrete shape for a family that DOES pass, as an
example: `workspace_manage({ operation: "create"|"get"|"update"|"delete", workspaceId?, name?,
... })` — one permission tier already covers all four verbs, and the four arg shapes are a strict
superset relationship (create needs `name`, the others need `workspaceId`). Do not attempt this for
`content_post_*`, `comments_*`, or `theme_*_file` without first re-solving the permission/schema
problems named above — collapsing those specific families would trade an already-working safety
boundary for a "twenty tools" number that, per §3, does not even deliver the context-size benefit the
owner is trying to buy.
