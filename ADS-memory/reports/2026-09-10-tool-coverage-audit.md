# Assistant tool coverage audit — real enumeration, coverage matrix, ranked gaps (2026-09-10)

Read-only audit. No source file was edited. Working tree shared with concurrent agents.

> **Landed mid-audit.** `fs_list_files` / `fs_read_file` (`features/fs-files`) went from untracked
> and unregistered to wired *during* this pass: the first measurement below (174 tools, 44 domains)
> was taken before `contributeFsFilesTools()` reached
> `server/runtime/composition/tool-catalog-manifest.ts`; a re-measurement immediately after gives
> **183 pre-collapse / 176 final / 45 domains**. Both numbers are reported so the delta is visible.
> Every "the in-flight file reader closes this" statement in §4 is therefore **now shipped, not
> pending** — treat those rows as done, not as work to schedule.

Supersedes the enumeration half of `ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md`
(which reconstructed counts from dated source comments and explicitly said "no live measurement was
taken"). Its gap analysis is still largely valid and is cited, not repeated, below.

---

## 0. Corrections to the dispatch's framing, up front

Four of the premises I was given are wrong. Stating them first because three of them change what
should be built.

**(a) "142-ish tools across 29 domains" — the real numbers are 174 / 44, and 176 / 45 by the end of
this pass.** Measured, not grepped: see §1.

**(b) "A tool with no `DERIVED_RISK_BY_TOOL_ID` entry is silently unregistered — no error."**
False. `assertToolIsWirable` (`/Users/la/Programming/Jini/packages/cms/src/core/tools/registration-kit.ts:366-388`)
**throws**:

```
tool-registrations: '<id>' has no entry in DERIVED_RISK_BY_TOOL_ID — classify what its handler
actually does before wiring it (unknown operations are refused, never assumed safe)
```

and `buildDomainRegistrations` additionally throws on any catalog entry that is neither wired nor
listed in that domain's `unwiredToolIds` set. The kit's own doc states the property directly:
"Silence is never the outcome." A missing risk entry fails the composition root at boot, loudly.
The gate does fail *closed* — it just does not fail *silently*. See §3 for the failure mode that
genuinely is silent, which is a different one.

**(c) "Media has generate/import/trash but no list or read."**
Media has had a list since before this pass: `media_list_assets`, which as of the 2026-09-08
`content_read` collapse is reachable as `content_read.media_asset`. What media genuinely lacks is a
*get-one-by-id* and any way to read an asset's **bytes** (the `media/original.ts` admin route has no
tool). Grepping for `media_get_*` finds nothing and reads as "no read at all"; the list tool is
really there.

**(d) "Read/write coverage was granted ad hoc per domain, so there is no consistent read
primitive."** This was true until 2026-09-08 and is now roughly half wrong. `content_read` is
exactly that consistent read primitive: 36 per-domain Tier-1 read tools were collapsed into 29
`content_read.<resource>` cards behind one shared handler factory
(`apps/website/src/assistant/content-read-tool.ts`, wired as a post-processing pass at
`apps/website/src/assistant/tool-registrations.ts:707`). The hypothesis survives in a **narrower and
more useful form**: the collapse standardised *row listing*, and standardised nothing else.
Get-one-by-id is present on only 9 of the 29 cards, and **file** reads were never in scope for it at
all — which is precisely where the motivating bug (a plugin's own `references/*.template.*` being
unreadable) lives. Full argument in §5.

---

## 1. The real enumeration

### Method, and why it is complete

I did not grep for quoted ids — the dispatch's two traps (ids split across string fragments,
capabilities named only in model-facing prose) make that unsound. Instead I **executed the real
composition path** and read the ids off the objects it produced:

```ts
installFirstPartyToolContributors();                       // server/runtime/composition/tool-catalog-manifest.ts
buildAssistantToolRegistrations(deps, surfaces);           // assistant/tool-registrations.ts  -> final catalog
buildAssistantToolRegistrations(deps, surfaces, { includeContentReadCollapse: false });  // pre-collapse
for (const c of listToolContributors()) c.build(deps, surfaces);  // per-domain attribution
```

`deps` was a permissive `Proxy` (every property resolves to a callable proxy), which is sufficient
because registration is a pure build step — no handler is invoked. This is the same two-call sequence
the two real composition roots use (`server/inbound/assistant/agent-daemon-server.ts:358-369`,
`server/modules/assistant-byok.ts`), so what it returns *is* what the daemon registers.

It is complete because it is the artifact itself, not a model of it: every id in the list came off a
`registration.descriptor.id` produced by the same function the daemon calls. The split-fragment trap
is not hypothetical here — `features/fs-files/agent-tools.ts:129,137` declare
`name: FS_LIST_FILES_TOOL_ID` / `name: FS_READ_FILE_TOOL_ID`, so a grep for the quoted literal
`"fs_list_files"` in that file returns nothing. Executing the builder is immune to that by
construction. Domain attribution comes
from re-running each `ToolContributor.build` individually and set-differencing against the whole; the
9 ids no contributor claims are exactly `tool-registrations.ts`'s private `DOMAIN_SLICES` residue,
which has no exported getter.

Independently, I imported all **43** catalog modules (`*AgentToolCatalog` / `get*AgentToolCatalog`
across `apps/website/src/**` and `/Users/la/Programming/Jini/packages/cms/src/**`) and diffed the
**194 distinct declared ids** against the wired set. Scripts and raw JSON:
`ADS-memory/.local-artifacts/tool-audit-2026-09-10/` (gitignored).

### Counts (measured 2026-09-10)

| | before `fs-files` | after `fs-files` |
|---|---|---|
| Distinct catalog-declared ids | **194** (43 catalogs) | **196** (44 catalogs) |
| Declared but deliberately unwired (each with a written reason) | **13** | **13** |
| Wired by `buildAssistantToolRegistrations`, pre-collapse | **181** | **183** |
| Wired, **final** (after the `content_read` collapse: −36 +29) | **174** | **176** |
| Registry-based domains (`listToolContributors()`) | **35** | **36** |
| `DOMAIN_SLICES` residue domains | **9** | **9** |
| Wired but declared in no catalog | **0** | **0** |
| Total distinct domains | **44** | **45** |

Everything below the "before" column is the state the per-domain table and the coverage matrix were
computed against; `fs-files` adds exactly `fs_list_files` and `fs_read_file`, both `sideEffects:
"none"`, and is called out separately wherever it changes a conclusion.

Not part of the 174 but registered onto the same `ToolRegistry` at daemon boot
(`agent-daemon-server.ts`), so present in a live admin chat:

- `media_promote_chat_attachment`, `chat_list_pending_attachments` — direct `registry.register()`.
- 14 frontend-control tools: `page.find_elements`, `page.highlight`, `page.scroll_to`, `page.click`,
  `page.fill`, `page.select_option`, `page.navigate`, `chat.send_message`, `chat.set_draft`,
  `chat.select_agent`, `chat.cancel_run`, `chat.set_working_directory`, `chat.get_state`,
  `admin.capture_screenshot`.
- Dynamic, per-install: `agent_plugin_<pluginId>`, `skill_<name>`
  (`features/skills/tool-registrations.ts`), plugin capability tools
  (`features/plugin-runtime/capability-tool-registrations.ts`).

**Live static total: 174 + 2 + 14 = 190** (**192** with `fs-files`), plus per-install dynamics, plus `search_tools` /
`describe_tool` (meta, never routed through `ToolExecutor`), plus any federated external-MCP tools
reachable via `execute_delegated_tool` (0 by default).

A separate surface, not counted: the anonymous visitor chat (`assistant/site/tools.ts`) — 3 read
tools + 3 navigation directives, deliberately read-only. Nothing in this report applies to it.

### Registered ids by domain (final, post-collapse)

`content_read.<resource>` cards are listed once at the end; the "collapsed" column names the
per-domain tool each card replaced.

| Domain | n | Tool ids | Collapsed into `content_read` |
|---|---|---|---|
| agent-plugin-search | 1 | `search_agent_plugin_local` | — |
| agent-plugin-uninstall | 1 | `agent_plugins_uninstall` | — |
| comments | 6 | `comments_get_settings`, `comments_update_settings`, `comments_approve_comment`, `comments_mark_comment_spam`, `comments_trash_comment`, `comments_restore_comment` | `comments_list_moderation_queue` |
| content-duplication | 1 | `content_duplicate` | — |
| content-types | 5 | `collections_content_type_{define,update_fields,deprecate,reactivate,tombstone}` | `collections_content_type_list` |
| custom-credentials | 6 | `custom_credential_{verify,set_username,set_token,create,make_request,write_files}` | `custom_credential_list` |
| database | 5 | `database_query_timeline`, `database_get_health`, `database_get_schema_state`, `database_plan_migrate_forward`, `backup_create_restore_point` | `database_list_restore_points`, `database_list_pending_migrations` |
| deployments | 4 | `deployment_trigger_export`, `deployment_get_export_status`, `deployment_get_dockerfile`, `deployment_set_dockerfile` | `deployment_list` |
| entries | 4 | `collections_entry_{create,update,publish,unpublish}` | `collections_entry_list` |
| external-mcp | 4 | `external_mcp_save`, `external_mcp_test_connection`, `external_mcp_oauth_connect`, `external_mcp_oauth_poll_device` | `external_mcp_list` |
| forms | 5 | `forms_create_definition`, `forms_update_definition`, `forms_set_definition_status`, `forms_list_submissions`, `forms_get_submission` | `forms_list_definitions` |
| **fs-files** *(landed mid-audit)* | 2 | `fs_list_files`, `fs_read_file` | — |
| identity | 12 | `identity_user_{create,update_email,disable,enable}`, `identity_role_{create,assign,rename,delete}`, `identity_policy_{create,update,delete,attach}` | `identity_{user,role,policy}_list` |
| integrations (webhooks) | 4 | `webhooks_get_deliveries`, `webhooks_create_subscription`, `webhooks_pause_subscription`, `webhooks_delete_subscription` | `webhooks_list_subscriptions` |
| media | 3 | `media_upload_asset`, `media_update_metadata`, `media_trash_asset` | `media_list_assets` |
| media-generation | 1 | `media_generate_asset` | — |
| media-import | 1 | `media_import_from_url` | — |
| members | 2 | `members_disable`, `members_request_magic_link` | `members_list`, `members_get_by_id` |
| menus | 3 | `menus_create_menu`, `menus_update_menu_tree`, `menus_assign_location` | `menus_list_menus`, `menus_get_menu` |
| newsletter | 11 | `newsletter_list_subscriptions`, `newsletter_list_send_log`, `newsletter_{create,update,cancel,pause}_campaign`, `newsletter_create_list`, `newsletter_archive_list`, `newsletter_create_subscription`, `newsletter_remove_subscription`, `newsletter_resend_confirmation` | `newsletter_list_campaigns`, `newsletter_get_campaign`, `newsletter_list_lists` |
| pages | 3 | `pages_read_html`, `pages_write_html`, `pages_write_region` | — |
| plugins | 2 | `plugins_set_enabled`, `plugins_uninstall` | `plugins_list` |
| post (posts **and** pages rows) | 4 | `content_post_search`, `content_post_create`, `content_post_update`, `content_post_delete` | `content_post_list`, `content_post_get` |
| recovery | 4 | `backup_get_capabilities`, `backup_plan_restore`, `recovery_get_status`, `recovery_resolve_deep_link` | `backup_list_restore_points` |
| redirects | 4 | `redirects_get_hits`, `redirects_create`, `redirects_update`, `redirects_tombstone` | `redirects_list`, `redirects_get` |
| seo | 5 | `seo_analyze_entry`, `seo_set_entry_overrides`, `seo_get_settings`, `seo_set_settings`, `seo_regenerate_sitemap` | `seo_get_entry_meta` |
| settings | 3 | `settings_get_effective`, `settings_get_raw`, `settings_set_ui_preference` | `settings_list_definitions` |
| site-evidence | 1 | `site_collect_page_evidence` | — |
| site-inspection | 2 | `site_get_profile`, `fetch_published_page` | — |
| sites | 1 | `sites_duplicate_site` | — |
| source-control | 2 | `source_control_get_capabilities`, `source_control_execute_commit` | — |
| static-publish | 5 | `deployment_preview_static_publish`, `deployment_get_static_publish_capabilities`, `deployment_execute_static_publish`, `deployment_propose_custom_provider_credential`, `deployment_generate_bucket_hosting_setup` | — |
| taxonomy | 5 | `taxonomy_create_taxonomy`, `taxonomy_create_term`, `taxonomy_rename_term`, `taxonomy_assign_terms`, `taxonomy_plan_merge_term` | `taxonomy_list` |
| themes | 7 | `theme_list_files`, `theme_read_file`, `theme_write_file`, `theme_edit_file`, `theme_rename_file`, `theme_trash_file`, `theme_restore_trashed_file` | `theme_list` |
| widgets | 8 | `widgets_create_instance`, `widgets_update_instance`, `widgets_trash_instance`, `widgets_bind_region`, `widgets_set_region_placements`, `widgets_insert_embed`, `widgets_remove_embed`, `widgets_reorder_embeds` | `widgets_list_instances`, `widgets_get_instance`, `widgets_list_regions`, `widgets_get_region` |
| workspace | 1 | `workspace_update` | `workspace_get` |
| **`DOMAIN_SLICES` residue (9 domains, 9 tools)** | 9 | `assistant_demo_choices`, `assistant_demo_a2ui`, `assistant_demo_image`, `assistant_render_ui`, `search_components`, `describe_component`, `assistant_ask_choice`, `external_mcp_reauth_prompt`, `assistant_admin_screen_link` | — |
| **`content_read` cards** | 29 | `content_read.{backup_restore_point, collection_content_type, collection_entry, comment_moderation_queue, content_post, custom_credential, database_pending_migration, database_restore_point, deployment, external_mcp, form_definition, identity_policy, identity_role, identity_user, media_asset, member, menu, newsletter_campaign, newsletter_list, plugin, redirect, seo_entry_meta, setting_definition, taxonomy, theme, webhook_subscription, widget_instance, widget_region, workspace}` | — |

Sum: 145 domain-owned + 29 cards = **174**; with `fs-files`, 147 + 29 = **176**.

### Declared but deliberately unwired (13 — every one has a written reason)

| id | Declared in | Reason (as written in source) |
|---|---|---|
| `database_execute_migrate_forward` | `features/database/tool-registrations.ts:129` | Token-gated; `actorClassRule: confirmer-must-equal-own-delegatedBy` with no confirmation transport. |
| `database_get_restore_guidance` | same, `:123` | No envelope-minting function exists — only the receiving side does. |
| `backup_execute_restore` | `features/recovery/tool-registrations.ts` | Same actor-class rule; no confirmation transport. |
| `redirects_import` | `features/redirects/tool-registrations.ts` | Bulk write, excluded by design. |
| `settings_set`, `settings_clear` | cms `settings/tool-registrations.ts:183` | Generic "set any key"; the human UI is itself an uncurated raw-JSON editor. |
| `settings_reset` | same | Bulk namespace clear, irreversible. |
| `settings_register_definitions` | same | Schema-level; reinterprets every stored value platform-wide. |
| `workspace_create` | cms `workspace/tool-registrations.ts:68` | Inserts a row no route can address. |
| `workspace_delete` | same | Removes the only addressable workspace scope. |
| `taxonomy_execute_merge_term` | `features/taxonomy/tool-registrations.ts` | Destructive; fails the actor-class rule. |
| `collections_plan_cleanup`, `collections_execute_cleanup` | cms `content-types/tool-registrations.ts` | Execute half fails the actor-class rule; plan half withheld with it. |

---

## 2. Coverage matrix

`L` list · `R` read one by id · `C` create · `U` update · `D` delete · `X` execute/act.
`—` absent. `(f)` file-level rather than row-level. `†` a delete that is a reversible soft-trash.

| Domain | L | R | C | U | D | X | Holes that matter |
|---|---|---|---|---|---|---|---|
| post / pages (rows) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ search | full |
| pages (HTML body) | — | ✓(f) | — | ✓(f) | — | — | no list of page files |
| entries | ✓ | — | ✓ | ✓ | — | ✓ publish | **no R, no D** |
| content-types | ✓ | — | ✓ | ✓ | ✓ tombstone | — | no R |
| taxonomy | ✓ | — | ✓ | ✓ | — | ✓ plan-merge | **no R, no D** |
| media | ✓ | — | ✓ upload | ✓ metadata | ✓† | ✓ generate/import | **no R, no byte read** |
| widgets | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ bind/embed | full |
| menus | ✓ | ✓ | ✓ | ✓ | — | ✓ assign | no D |
| forms | ✓ | ✓ submission | ✓ | ✓ | — | ✓ status | no D |
| comments | ✓ | — | — | ✓ settings | ✓† | ✓ moderate | no R |
| newsletter | ✓ | ✓ campaign | ✓ | ✓ | ✓ archive | ✓ resend | full |
| members | ✓ | ✓ | — | — | ✓ disable | ✓ magic-link | no C/U |
| identity | ✓ | — | ✓ | ✓ | ✓ | ✓ assign/attach | no R |
| redirects | ✓ | ✓ | ✓ | ✓ | ✓† | ✓ hits | full |
| seo | — | ✓ | — | ✓ | ✓ settings | ✓ sitemap | no L |
| **settings** | ✓ defs | ✓ | — | **—** | — | — | **write is unwired by design** |
| workspace | — | ✓ | — | ✓ | — | — | no L (single-workspace) |
| database | ✓ | — | ✓ restore-pt | — | — | ✓ plan-only | execute half unwired |
| recovery | ✓ | — | — | — | — | ✓ plan-only | execute half unwired |
| deployments | ✓ | ✓ dockerfile | — | ✓ dockerfile | — | ✓ export | — |
| static-publish | — | ✓ caps | — | — | — | ✓ publish | — |
| source-control | — | ✓ caps | — | — | — | ✓ commit | — |
| external-mcp | ✓ | — | ✓ save | ✓ save | **—** | ✓ oauth/test | **no delete** |
| custom-credentials | ✓ | — | ✓ | ✓ token | — | ✓ request/write-files | no R, no D |
| integrations (webhooks) | ✓ | ✓ deliveries | ✓ | ✓ pause | ✓ | — | — |
| **themes** | ✓ +✓(f) | ✓(f) | — | ✓(f) | ✓†(f) | — | **no theme C/D, no copy(f), no active-theme R/U** |
| **plugins (.tovu-plugin)** | ✓ | — | — | ✓ enable | ✓ uninstall | — | no R, no install |
| **agent-plugins** | ✓ search | **—** | **—** | **—** | ✓ uninstall | — | **no file read, no enable/disable** |
| **skills** | **—** | **—** | — | — | — | ✓ `skill_<n>` | **no list, no read** |
| fs-files *(landed mid-audit)* | ✓(f) | ✓(f) | — | — | — | — | read-only by design; 5 fixed roots |
| site-inspection / evidence | — | ✓ | — | — | — | ✓ fetch | — |
| sites | — | — | ✓ duplicate | — | — | — | no L/R/U/D |
| content-duplication | — | — | ✓ | — | — | — | 4 resources only |
| **presentation** | **—** | **—** | — | **—** | — | **—** | **entire domain absent** |
| **change-sets** | — | — | — | — | — | **—** | **entire domain absent** |
| **connectors (Composio)** | — | — | — | — | — | — | **entire domain absent** |
| **analytics** | — | — | — | — | — | — | entire domain absent |
| **api-keys** | — | — | — | — | — | — | entire domain absent (likely deliberate) |
| **marketplace** | — | — | — | — | — | — | entire domain absent |
| **vendor-credentials (built-in)** | — | — | — | — | — | — | entire domain absent |
| **commerce** | — | — | — | — | — | — | entire domain absent |

Read it as two clusters, not 40 rows:

- **Row-listing is now uniform** (29 `content_read` cards) and **get-one-by-id is not**: only 9 of
  29 cards carry a `get` — `content_post`, `member`, `menu`, `redirect`, `seo_entry_meta`,
  `newsletter_campaign`, `widget_instance`, `widget_region`, `workspace`
  (`assistant/content-read-tool.ts:137-181`). The other 20 resources can only be listed, so reading
  one row means listing everything and filtering client-side.
- **File-level read existed in exactly one domain — until this pass.** `theme_read_file` /
  `theme_list_files` were the only file tools in the entire 174: nothing read `<site>/agent-plugins/`,
  `<site>/skills/`, `<site>/uploads/`, or `content/agent-plugins/`. That single fact explains the
  motivating bug. `fs_list_files` / `fs_read_file` closed it mid-audit; the matrix row above is the
  pre-landing state, kept because it is what the gap ranking in §4 was derived from.

---

## 3. Silently-unregistered tools

**None.** Both mechanisms that could produce one fail loudly today:

1. **Missing risk classification** → `assertToolIsWirable` throws at composition-root boot
   (`registration-kit.ts:373-377`). See §0(b).
2. **Catalog entry never wired** → `buildDomainRegistrations` throws unless the id is in that
   domain's `unwiredToolIds` with a comment. All 13 unwired ids are accounted for (§1).

Verified empirically as well: the 194 declared ids minus the 13 unwired equals exactly the 181 wired
pre-collapse ids, with **zero** wired ids belonging to no catalog and zero catalog ids unaccounted
for.

### But three real holes in the gate exist, and they are the inverse of what was expected

**(a) A whole domain can still be orphaned silently, and this has happened before.** The gate is
per-*tool-within-a-registered-domain*. If a feature ships a complete `agent-tools.ts` and no
`contribute<Domain>Tools()` / manifest call, nothing checks anything — that is exactly how
`features/external-mcp`'s fully-designed 5-tool catalog sat unregistered until 2026-09-07. **Checked
this pass: 39 exported `contribute*Tools` functions, 39 called in
`server/runtime/composition/tool-catalog-manifest.ts`, zero orphans** (38/38 before `fs-files`
landed). Every `features/*` directory containing an `agent-tools.ts` also has a
`tool-registrations.ts` that reaches the manifest. Clean today, structurally still possible tomorrow
— there is no test asserting the two lists are equal.

`features/fs-files` spent this audit in exactly that window: catalog written, contributor exported,
manifest entry absent. It closed on its own within the hour; nothing in the codebase would have
noticed if it had not.

**(b) Two production tools bypass the risk gate entirely.**
`features/media/promote-chat-attachment.ts:193` and
`features/media/list-pending-chat-attachments.ts:96` construct `descriptor` objects by hand and are
handed straight to `registry.register()` in `agent-daemon-server.ts:386,407`. They never pass through
`buildDomainRegistrations`, declare no `sideEffects`, and have no `DERIVED_RISK_BY_TOOL_ID` entry.
`media_promote_chat_attachment` **writes durable state** (it delegates to `media_upload_asset`'s
handler). The 14 frontend-control registrations are in the same position. Not a security finding as
such — each is individually reviewed — but the guarantee "no wired tool is unclassified" is not
actually true of the live registry, and any doc that says so is overclaiming.

**(c) One genuinely silent skip, by design.** `agent-daemon-server.ts:394-398`: if
`media_upload_asset` is ever unwired, `media_promote_chat_attachment` is dropped and the only signal
is a `console.error` to the daemon log — which, per this repo's own history with MCP refusals, is a
place nobody looks. Deliberate ("must never be the reason the whole daemon fails to boot") and I am
not arguing with the trade, only recording that it is the one silent-drop path that exists.

---

## 4. Ranked gap worklist

Ranked by real user impact. **Shape** is one of *file* (closed or closable by `fs_read_file` /
`fs_list_files`), *DB* (needs a tool reading through a repo), *network* (a credential-allowlist
change, not a tool), or *config*.

### Closed by `fs_read_file` / `fs_list_files` — do not build these twice

`apps/website/src/features/fs-files/` exposes two read-only tools over a fixed five-member root
enum: `site-agent-plugins`, `site-themes`, `site-skills`, `site-uploads`, `bundled-agent-plugins`.
Its `layout.ts` header names the motivating bug verbatim. It was untracked when this audit started
and **registered before it finished** (`contributeFsFilesTools()` in the manifest, verified by
re-measurement). These gaps are **closed, shipped**:

| # | Gap | Why it is covered |
|---|---|---|
| — | Agent Plugin bundled `references/*.template.*` unreadable (the motivating bug) | root `site-agent-plugins` + `bundled-agent-plugins` |
| — | No way to list what an installed Agent Plugin actually ships | `fs_list_files` on the same roots |
| — | Skills: no list, no read of a skill's own `SKILL.md` / assets | root `site-skills`; closes the `skills/list.ts` route gap the 09-07 audit raised |
| — | Uploaded media **bytes** unreadable | root `site-uploads` (read of the stored file; the DB row's get-by-id is separate, see #4) |
| — | Theme files outside the theme tools' own view | root `site-themes` (largely redundant with `theme_read_file`) |

Note what it does **not** close: nothing under `fs-files` writes, so every write-shaped gap below
stands; and `<site>/` itself is deliberately off the root list (`chat.db` lives there).

### Open gaps, ranked

**1. Agent Plugins have no enable/disable and no list — but the human route does. — DB-shaped.**
`server/inbound/admin-http/routes/agent-plugins/` ships `list.ts` **and `set-enabled.ts`**, and the
site tree carries a live `activations.json`. The assistant has `search_agent_plugin_local` (search
only) and `agent_plugins_uninstall` (permanent, irreversible) — and nothing in between. The one
reversible operation is missing while the irreversible one is wired, which is backwards. Small
effort: the `plugins_set_enabled` pattern one directory over is the template. `fs_list_files` does
**not** close this — reading `activations.json` is not the same as toggling it, and a raw-file toggle
would bypass the route's own gate.

**2. `presentation` — no tool reads or sets the active theme, or triggers a rescan. — config-shaped.**
Routes `presentation/{get,patch-active-theme,rescan-themes}.ts` exist; no tool anywhere.
`content_read.theme` lists discovered themes but never says which is active. So the assistant can
edit a theme's files all day and cannot answer "is this the theme my visitors see?", nor act on
"switch to the one you just built". This is the highest-value *unbuilt* domain: it is one small
contributor (2-3 tools) following the `site-inspection` pattern, and it completes a workflow the
assistant otherwise gets 90% of the way through. Unchanged from the 09-07 audit's Gap #5, and still
open.

**3. `change-sets` revert — no undo anywhere. — DB-shaped.**
`change-sets/{get,list,revert}.ts` exist as routes; zero tools. "Undo that" is among the most natural
things to say to an assistant that just wrote something, and today the model's only option is to
reconstruct prior state by hand through `content_post_update`, losing the field-level history
`revertChangeSet` guarantees. Medium effort — needs the same actor-class/confirmation design thinking
`backup_execute_restore` got, not a bare wire-through. Unchanged from 09-07 Gap #2.

**4. Get-one-by-id missing on 20 of 29 `content_read` cards. — DB-shaped, cheap.**
`content_read.media_asset`, `.identity_user`, `.form_definition`, `.external_mcp`, `.plugin`,
`.taxonomy`, `.collection_entry`, `.collection_content_type`, `.custom_credential`, `.deployment`,
`.newsletter_list`, `.setting_definition`, `.theme`, `.webhook_subscription`, `.identity_role`,
`.identity_policy`, `.comment_moderation_queue`, `.backup_restore_point`,
`.database_{pending_migration,restore_point}` are list-only. Consequence at runtime: to inspect one
media asset the model lists **every asset in the workspace** and filters in-context. That is a token
cost on every read and a correctness risk once a library is large enough to hit a page limit.
The card structure already supports `get` (`content-read-tool.ts:141` shows the shape) — this is
filling in a table, per resource, wherever the underlying repo has a `findById`. Highest
effort-to-value ratio on this list.

**5. `external_mcp` has no delete — and deleting one in-app is already unrecoverable. — DB-shaped.**
The domain wires list/save/test/oauth-connect/oauth-poll but no removal, while
`admin-http/routes/external-mcp/delete.ts` exists. Given that an in-app external-MCP delete is
already known to be unrecoverable, I would **not** wire this as a bare delete; the honest fix is
either a soft-disable tool or nothing. Recording it as an asymmetry rather than recommending the
tool.

**6. Composio `connectors` — an entire integration surface unreachable. — network-shaped, mostly.**
Ten route files (`connect`, `disconnect`, `list`, `get-config`, `put-config`, `statuses`,
`callback-url`, `get-by-id`, …), zero tools, and zero references to Composio anywhere in the tool
catalog. The read half (list/statuses) is genuinely cheap and is a tool. The connect half is the
link-handoff + poll pattern `external_mcp_oauth_connect` already solved, so there is a template. But
whether any of it *works* is gated on credential allowlisting, not on tool count.

**7. Built-in vendor credentials — no read tool. — DB-shaped, small, read-only.**
`system/vendor-credentials.ts` is human-only; `custom_credential_list` (now
`content_read.custom_credential`) covers only Access-Tokens-page custom providers. The assistant
cannot tell a user what is already connected. Write path should stay human-typed — that doctrine is
consistent across this codebase and I am not proposing to break it.

**8. `theme_copy_file` — the primitive exists, unwired. — file-shaped, but NOT closed by the fs reader.**
`themes/explore.ts` imports and wires `copyThemeFile`; no tool. `fs_read_file` does not close this,
because the fs domain is read-only — the model would still need `theme_read_file` +
`theme_write_file` to compose a copy, which works but nothing tells it to. Cheapest real fix remains
the 09-07 recommendation: add copy/duplicate keywords to `theme_write_file`'s
`tool-search-keywords.ts` entry.

**9. `marketplace/{list,download}` — browse/install a theme. — DB/file-shaped.** No tool. Directly
adjacent to #2: "find me a theme, install it, switch to it" is one sentence and zero of its three
steps has a tool.

**10. `media/original.ts` (asset bytes) — file-shaped, closed by `fs_read_file`'s `site-uploads` root
for reading the stored file**, but there is still no tool that maps a media **row id** to its
on-disk path. Worth checking that the fs reader's result is actually joinable to
`content_read.media_asset` output (both expose a sha256/path?) — if not, the reader closes this only
in principle.

**11. `analytics/recent-hits.ts`, `commerce/status.ts` — DB-shaped, read-only, trivially cheap, low
demand.** Listed for completeness.

**Confirmed deliberate, not gaps** (re-verified against source this pass, each with a written
reason): the 13 unwired ids in §1; `users/reset-password`; identity's `writePolicyPermission`;
theme-level create/delete/rename-folder and file hard-delete; plugin install/upload (no route exists
at any layer); `api-keys` issue/revoke (still *likely* rather than *confirmed* — no file actually
says "and therefore no tool").

---

## 5. What contradicts the framing

**The ad-hoc hypothesis is now half wrong, and the half that survives is the actionable half.**
`content_read` (2026-09-08) is a genuine, uniform read primitive across 29 DB-backed resources —
"read/write coverage was granted ad hoc per domain" describes the state before that landed. What was
*not* unified: get-one-by-id (9 of 29) and anything file-shaped. So the right statement of the
problem is narrower and better-targeted than "no consistent read primitive across 142 tools": **the
row-read primitive got consolidated and the file-read primitive never existed at all.**
`fs_read_file`/`fs_list_files`, which shipped during this pass, is the second half of the same
consolidation, not an ad-hoc patch — and the coverage matrix independently supports the scope it
shipped with (its five roots are exactly the five directories the matrix showed nothing could read).

**The registration gate is not the risk it was framed as.** It fails closed *and* loud. The
plausible failure it does not catch is a whole domain never being installed (§3a) — which is a
manifest-completeness problem, not a risk-classification one, and would be closed by a single test
asserting `{exported contribute*Tools} == {called in tool-catalog-manifest.ts}`. That test does not
exist. Given this repo's documented history of built-but-unwired features, and that the last
occurrence cost a fully-designed 5-tool catalog months of invisibility, it is the cheapest durable
win on this page.

**The inverse of the framed problem is real:** two live tools (§3b) are registered with no risk
classification at all, one of which mutates durable state. The gate's guarantee is narrower than the
codebase's own comments assert.

**The counts were low by ~25%.** 176 wired (192 live static), not ~142; 45 domains, not 29. Every
per-domain comment block in `assistant/tool-registrations.ts` is stale — its own header already says
"Trust the measurement, not the table", and the table is now four weeks and ~20 tools out of date.

---

## Artifacts

- Enumeration scripts + raw JSON (gitignored): `ADS-memory/.local-artifacts/tool-audit-2026-09-10/`
  — `catalogs.mts` (43 catalogs → 194 declared ids), `wired.json` (181 pre-collapse / 174 final,
  per-domain), `frontend.mts` (14 frontend-control ids).
- Prior audit, still the reference for admin-route parity:
  `ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md`.
