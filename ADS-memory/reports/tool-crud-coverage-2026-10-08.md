# Agent tool CRUD coverage — 2026-10-08

Question (owner): "don't we have an abstract tooling system where CRUD works on all these tools? Is that a gap?"

## Answer

**Partly.** No generic CRUD generator exists. `buildDomainRegistrations` (`@jini-ai/core` registration kit) only wires a domain's hand-written catalog and handlers; it creates nothing per resource. Three cross-resource facades do exist, and each one sits on top of per-resource handlers:

| Facade | Verb | Covers | Source |
|---|---|---|---|
| `content_read.<resource>` | read one / list | 28 resources (cards over each domain's own get/list tool) | `apps/website/src/assistant/content-read-tool.ts` |
| `content_duplicate` | create-by-copy | post, page, form, media | `apps/website/src/assistant/duplicate-resource-registry.ts` |
| `trash_item` / `trash_restore_item` / `trash_list_items` / `trash_purge_item` / `trash_empty` | soft delete / restore / purge | every kind with a Trash adapter: post, page, comment, media, redirect, widget, form, form_submission, menu, term, taxonomy, user, plugin (restore only through plugins_uninstall), and now **theme** | `apps/website/src/features/trash/trash-item-tool.ts`, `tool-registrations.ts`, `registry.ts` |

There is **no generic create or update layer**. Every create/update tool is hand-written per resource.

**So where do the gaps come from?** Two places:
1. **Create, update and get-one gaps** are per-resource tools that were never written. No generic layer exists that would have produced them.
2. **Delete gaps come from missing Trash adapters, not from a missing tool.** `trash_item` is already the generic delete. A kind is deletable only after someone registers a Trash adapter for it. Themes had none: `agent-tools.ts` deliberately left `theme_delete` out (2026-08-30), so the agent could only trash single files. Fixed today (see "Theme" row).

## Coverage table

Key: tool id = covered; **GAP** = no agent tool; n/a = the operation does not apply. "Delete" is the reversible Trash move unless marked *(hard)*. Newsletter is left out under the owner's no-newsletter rule.

| Resource | Create | Read one | List | Update / edit | Delete | Restore |
|---|---|---|---|---|---|---|
| Post | `content_post_create`, `content_duplicate` | `content_read.content_post` | `content_read.content_post`, `content_post_search` | `content_post_update` | `content_post_delete`, `trash_item` | `trash_restore_item` |
| Page | `content_post_create` (kind=page), `content_duplicate` | `content_read.content_post`, `pages_read_html` | `content_read.content_post` | `content_post_update`, `pages_write_html`, `pages_write_region`, `pages_move_region` | `content_post_delete`, `trash_item` | `trash_restore_item` |
| Media asset | `media_upload_asset`, `media_import_from_url`, `media_import_local_file`, `media_generate_asset`, `media_promote_chat_attachment`, `content_duplicate` | `media_view_image`, `media_view_video` | `content_read.media_asset` | `media_update_metadata` | `media_trash_asset`, `trash_item`; `media_purge_asset` *(hard)* | `trash_restore_item` |
| Comment | n/a (visitor-authored) | **GAP** | `content_read.comment_moderation_queue` | `comments_approve_comment`, `comments_mark_comment_spam` | `comments_trash_comment`, `trash_item`; `comments_purge_comment` *(hard)* | `comments_restore_comment`, `trash_restore_item` |
| Menu | `menus_create_menu` | `content_read.menu` | `content_read.menu` | `menus_update_menu_tree`, `menus_assign_location` | `trash_item` (menu) | `trash_restore_item` |
| Taxonomy | `taxonomy_create_taxonomy` | `content_read.taxonomy` (taxonomyId) | `content_read.taxonomy` | **GAP** (no rename/settings tool) | `trash_item` (taxonomy) | `trash_restore_item` |
| Term | `taxonomy_create_term` | **GAP** | `content_read.taxonomy` (terms inside), `taxonomy_get_assigned_terms` | `taxonomy_rename_term`, `taxonomy_plan_merge_term`/`taxonomy_execute_merge_term`, `taxonomy_assign_terms`/`taxonomy_unassign_terms` | `trash_item` (term) | `trash_restore_item` |
| Theme | `theme_duplicate` (uncommitted, other session) | `content_read.theme` (themeId) | `content_read.theme`, `theme_rescan` | `theme_set_active` (selection); content through theme-file tools | **`theme_trash` + `trash_item` (theme) — added today** (was GAP) | `trash_restore_item` (theme) — added today |
| Theme file | `theme_write_file` (new path), `theme_copy_file` | `theme_read_file` | `theme_list_files` | `theme_write_file`, `theme_edit_file`, `theme_rename_file`, `theme_reset_file` | `theme_trash_file` | `theme_restore_trashed_file` |
| Theme page publication | n/a | **GAP** | **GAP** (only through `theme_read_file theme.json`) | `theme_set_page_published` | n/a | n/a |
| User (staff) | `identity_user_create` | `content_read.identity_user` (principalId; list caps at 200, a miss past the cap says so) | `content_read.identity_user` | `identity_user_update_email`, `identity_user_enable`/`identity_user_disable`, `identity_role_assign` | `trash_item` (user); `identity_user_delete` *(hard)* | `trash_restore_item` |
| Role | `identity_role_create` | `content_read.identity_role` (roleId) | `content_read.identity_role` | `identity_role_rename` | `identity_role_delete` *(hard)* | **GAP** |
| Policy | `identity_policy_create` | `content_read.identity_policy` (policyId) | `content_read.identity_policy`, `identity_policy_list_permissions` | `identity_policy_update`, `identity_policy_attach` | `identity_policy_delete` *(hard)* | **GAP** |
| Member (site visitor account) | **GAP** (only `members_request_magic_link`) | `content_read.member` | `content_read.member` | **GAP** (only `members_disable`) | **GAP** | **GAP** |
| Site (local multi-site) | `sites_create_site`, `sites_duplicate_site` | **GAP** (`site_get_profile` is current site only) | `sites_list` | **GAP** | **GAP** | **GAP** |
| Workspace | `workspace_create` | `content_read.workspace` | **GAP** (single workspace in v1) | `workspace_update` | `workspace_delete` *(hard)* | **GAP** |
| Redirect | `redirects_create`, `redirects_import` | `content_read.redirect` | `content_read.redirect` | `redirects_update` | `redirects_tombstone`, `trash_item` | `trash_restore_item` |
| Setting | `settings_register_definitions` (definitions) | `settings_get_effective`, `settings_get_raw` | `content_read.setting_definition` | `settings_set_value`, `settings_set_ui_preference` | `settings_clear_value`, `settings_reset` | n/a |
| Site plugin | `plugins_install` | `content_read.plugin` (pluginId) | `content_read.plugin` | `plugins_set_enabled` | `plugins_uninstall` (confirm card, then Trash) | `trash_restore_item` (plugin) |
| Agent plugin / skill | `agent_plugins_install`, `skills_install` | `content_read.plugin` (pluginId, agent plugins) | `search_agent_plugin_local`, `content_read.plugin` | `plugins_set_enabled` | `plugins_uninstall` | `trash_restore_item` |
| Form definition | `forms_create_definition`, `content_duplicate` | `content_read.form_definition` (formId) | `content_read.form_definition` | `forms_update_definition`, `forms_set_definition_status` | `trash_item` (form) | `trash_restore_item` |
| Form submission | n/a (visitor-authored) | `forms_get_submission` | `forms_list_submissions` | n/a | `trash_item` (form_submission) | `trash_restore_item` |
| Widget instance | `widgets_create_instance` | `content_read.widget_instance` | `content_read.widget_instance` | `widgets_update_instance`, `widgets_insert_embed`/`widgets_remove_embed`/`widgets_reorder_embeds` | `widgets_trash_instance`, `trash_item` | `trash_restore_item` |
| Widget region | n/a (theme-declared) | `content_read.widget_region` | `content_read.widget_region` | `widgets_bind_region`, `widgets_set_region_placements` | n/a | n/a |
| Collection content type | `collections_content_type_define` | `content_read.collection_content_type` (key) | `content_read.collection_content_type` | `collections_content_type_update_fields` | `collections_content_type_deprecate`, `collections_content_type_tombstone` | `collections_content_type_reactivate` |
| Collection entry | `collections_entry_create` | `content_read.collection_entry` (id) | `content_read.collection_entry` | `collections_entry_update`, `collections_entry_publish`/`_unpublish` | **GAP** (only bulk `collections_plan_cleanup`/`collections_execute_cleanup`) | **GAP** |
| Webhook subscription | `webhooks_create_subscription` | `content_read.webhook_subscription` (subscriptionId) | `content_read.webhook_subscription`, `webhooks_get_deliveries` | **GAP** (only `webhooks_pause_subscription`) | `webhooks_delete_subscription` *(hard)* | **GAP** |
| External MCP server | `external_mcp_save` | `content_read.external_mcp` (id) | `content_read.external_mcp`, `external_mcp_get_admissions` | `external_mcp_save` | `external_mcp_delete` *(hard)* | **GAP** |
| Custom credential | `credential_save` | `content_read.custom_credential` (label) | `content_read.custom_credential` | `credential_save`, `custom_credential_set_username`, `custom_credential_write_files` | `custom_credential_delete` *(hard)* | **GAP** |
| SEO entry meta | n/a | `content_read.seo_entry_meta` | n/a | `seo_set_entry_overrides` | n/a | n/a |
| Backup restore point | `backup_create_restore_point` | `content_read.backup_restore_point` (restorePointId) | `content_read.backup_restore_point` | n/a | **GAP** | n/a |
| Deploy secret | `deployment_ops_set_secret` | n/a (secret) | `deployment_ops_list_secrets` | `deployment_ops_set_secret` | `deployment_ops_unset_secret` *(hard)* | n/a |

**Gap count: 24 GAP cells** (38 earlier today; 40 before `theme_trash`). By verb: Create 1, Read-one 4, List 2, Update 4, Delete 4, Restore 9. Read-one dropped from 18 to 4 once `content_read` cards gained read-one-by-id (see below). Most Restore gaps belong to hard-delete-only resources (roles, policies, webhooks, credentials, MCP servers) that have no Trash adapter.

## Read-one-by-id on `content_read` cards (added 2026-10-08)

Each `content_read.<resource>` card now reads one item when the caller passes the resource's id, and lists when the id is left out. There is one generic path in `apps/website/src/assistant/content-read-tool.ts`:
- **A card whose domain has a get tool** (post, member, menu, redirect, widget instance/region, SEO entry meta, workspace) keeps dispatching to that tool. No second path was added.
- **A card whose domain has only a list reader that returns the whole set** declares `listLookup`. Given an id, the card runs the list handler without the id and filters the result to the matching item. The answer comes back in the list's own shape. The list handler's own permission check and view therefore apply unchanged. A miss returns `<resource> '<id>' was not found — call content_read.<resource> without <idProperty> to list valid ids`. If the list reports `truncated` (only `identity_user_list` does, capped at 200), the miss is reported as inconclusive. The id parameter uses the name the resource's own write tools take: `themeId`, `formId`, `roleId`, `label`, and so on.
- Tests: `apps/website/src/assistant/__tests__/content-read-get-by-id.test.ts`.

**Read-one gaps still open (4):**
- **Comment.** `comments_list_moderation_queue` is paginated and filtered by status (pending by default), so one page cannot show whether an id exists. This needs a real single-item reader (`commentRepo` by id).
- **Term.** Terms live inside `content_read.taxonomy` rows. No card owns them, and that list is already the taxonomy card's member.
- **Theme page publication.** It has no list or get reader. The data lives only in `theme.json`.
- **Site.** `sites_list` is not a `content_read` card. Adding a `site` card would retire the `sites_list` id, which needs the eval ground-truth remap.

Media (paginated), comment moderation, settings, database and newsletter cards have no lookup. They were not read-one gaps, or they are out of scope.

## What a generic create/update layer would look like (proposal, not built)

- **Shape:** a `ResourceWriteContributor` registry modelled on `duplicate-resource-registry.ts` (same register/list/reset trio, same composition-root registration in `tool-catalog-manifest.ts`). Each resource contributes `{ resource, permission, create?: toolId, update?: toolId, get?: toolId }` that point at its **existing** handlers. Two facade tools, `content_create.<resource>` and `content_update.<resource>`, are derived in a post-pass the way `content_read` cards are, so each domain keeps its own permission, version and validation gates. Delete stays on `trash_item`: a resource joins Delete by registering a Trash adapter, which is the pattern used for themes today.
- **Cost:** about 1–1.5 days for the registry, the two facade passes, contract tests and the tool-search eval ground-truth remap (the `content_read` collapse needed the same remap). That cost does not include the 18 get-one handlers, each roughly 0.5–1 h. The facade alone closes no gap. It only stops new resources shipping without C/U entries. **Cheaper first step:** add `get` members to the existing `content_read` cards (about 0.5 day), which closes most of the 18 read-one gaps.
