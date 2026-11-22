# Terra job: check the Stop signal before each tool's first write

READY (2026-11-13). This prompt is self-contained; `development/refactor-patterns/abort-before-write.md` in the Tovu repo is background only.

Repos: the Tovu clone (rows marked tovu) and the Jini clone on branch `w3-da-main` = Jini main 0.7.1 (rows marked jini). Both are given to you.

## Why
A tool handler gets `ctx.signal` (an `AbortSignal`) but most never read it. The executor checks the signal right before calling the handler, so the only gap is an `await` INSIDE the handler that comes before its first write (permission check, a read). If Stop lands during that await, the write still happens while the executor reports the call as `cancelled`: the person is told nothing changed, but it did. Fix: one `ctx.signal.throwIfAborted();` directly above the first write. When it throws, the executor already reports `cancelled` (no new error type or message needed).

## What to do, per row in the first table
Open the file, find the handler named in "tool" (at or near the given line; line numbers are from 2026-11-13), find the statement that STARTS with the quoted text inside that handler, and insert `ctx.signal.throwIfAborted();` as its own line directly above it, same indentation.
- `INSERT inside callback`: the write is inside `withSchemaOnRejection({ ..., fn: async () => { ... } })`; the check goes inside `fn`, directly above the quoted statement (these wrappers call `fn` right away).
- `INSERT-KEEP-EXISTING`: the handler already has an `if (ctx.signal.aborted) return ...` earlier; keep it untouched and still add the check above the quoted write.
- `INSERT-TWO-PATHS`: insert above BOTH quoted statements (two branches, each with its own first write).
- The quoted statement may be a `return writeX(...)`, an `if (...) return writeX(...)`, or a `const r = await wrapper(() => writeX(...))`: the check goes directly above that whole statement.
Exactly one check per code path. Change nothing else.

Already-done examples to copy: Tovu `apps/website/src/features/members/tool-registrations.ts` (`members_update_profile`) and `apps/website/src/features/webhooks/tool-registrations.ts` (`webhooks_delete_subscription`).

## Do NOT
- Do not pass `ctx.signal` into any call; do not add checks between writes, after a write has started, or inside loops (a half-done multi-step write is worse than a finished one).
- Do not return a custom "cancelled" object; the throw is the mechanism.
- No `eslint-disable`, `as any`, non-null `!`; never delete or move a comment.
- Do not touch rows in the "No change" table.
- Run NO test suites and change no tests. Leave nothing running.

## Done check
`node development/scripts/bug-class-audit.mjs --repo tovu=<tovu clone> --repo jini=<jini clone> --out /tmp/terra-abort` (script is in the Tovu clone). No row of the first table may still be in `/tmp/terra-abort/abort-not-reaching-writes.tsv`; the "No change" rows stay listed (expected). Report any first-table row still present, with the reason. Run `npx eslint <changed files>` in Tovu (no new errors); in Jini run `npx tsc -p packages/<pkg>/tsconfig.json --noEmit` for each touched package.

Commit once in each repo: `git add -- <paths> && git commit -F msg -- <paths>`, message "fix(tools): check the Stop signal before each tool's first write". Never push.

## Sites (63: 12 jini, 51 tovu)
| # | repo | file:line (handler) | tool | variant | insert `ctx.signal.throwIfAborted();` on its own line directly ABOVE the statement starting with |
|---|---|---|---|---|---|
| 1 | jini | `packages/cms/src/media/tool-registrations.ts:319` | media_update_metadata | INSERT inside callback | `const { media } = await updateMediaMetadata({` |
| 2 | jini | `packages/cms/src/media/tool-registrations.ts:342` | media_trash_asset | INSERT | `const { media } = await trashMedia({` |
| 3 | jini | `packages/cms/src/navigation/tool-registrations.ts:175` | menus_create_menu | INSERT inside callback | `const { menu } = await createMenu({` |
| 4 | jini | `packages/cms/src/navigation/tool-registrations.ts:198` | menus_update_menu_tree | INSERT inside callback | `const { menu } = await updateMenuTree({` |
| 5 | jini | `packages/cms/src/workspace/tool-registrations.ts:80` | workspace_update | INSERT | `const { workspace } = await updateWorkspace({` |
| 6 | jini | `packages/commerce/src/catalog-tools.ts:66` | commerce_create_product | INSERT | `await deps.products.save(product);` |
| 7 | jini | `packages/commerce/src/catalog-tools.ts:77` | commerce_create_price | INSERT | `await deps.prices.save(price);` |
| 8 | jini | `packages/core/src/settings/tool-registrations.ts:298` | settings_set_ui_preference | INSERT | `const { value: stored, revisionSeq } = await withSchemaOnRejection({` |
| 9 | jini | `packages/db/src/tools/read-tools.ts:75` | backup_create_restore_point | INSERT | `const summary = await createDatabaseRestorePoint({` |
| 10 | jini | `packages/db/src/tools/transfer-tools.ts:185` | PLAN_TOOL_ID (function `handlePlan`) | INSERT | `const plan = deps.ports.plans.save({` |
| 11 | jini | `packages/integrations/src/credentialed-http/tools/tool-registrations.ts:766` | operations.ids.setUsername | INSERT | `return operations.sets.setUsername({ id: existing.id, username });` |
| 12 | jini | `packages/plugins/src/host/tools/install.ts:50` | deps.toolId (plugin install) | INSERT above the `try {` | try {  (the `try` whose first line is `const plugin = await installer.install(`; the check goes outside it so Stop is not logged as a failed install) |
| 13 | tovu | `apps/website/src/features/comments/tool-registrations.ts:300` | comments_update_settings | INSERT | `const settings = await setCommentsSettings(` |
| 14 | tovu | `apps/website/src/features/database/tool-registrations.ts:183` | MIGRATE_TOOL_ID | INSERT | `return executeMigrateForward({` |
| 15 | tovu | `apps/website/src/features/deployments/tool-registrations.ts:145` | deployment_set_dockerfile | INSERT | `const result = writeDockerfileSourceWithIfMatch(contents, ifMatch);` |
| 16 | tovu | `apps/website/src/features/email-templates/tool-registrations.ts:61` | email_template_create | INSERT | `return createEmailTemplate({ deps, input, actorId: ctx.principal.id });` |
| 17 | tovu | `apps/website/src/features/media-generation/tool-registrations.ts:340` | media_generate_asset | INSERT | `const { media } = await uploadMedia({` |
| 18 | tovu | `apps/website/src/features/media-import/tool-registrations.ts:280` | media_replace_file | INSERT | `const saved = await replaceMediaFile({ deps: routeDeps, media, ...source, principalId: ctx` |
| 19 | tovu | `apps/website/src/features/media-import/tool-registrations.ts:313` | media_import_local_file | INSERT | `const result = await persistImportedMedia({` |
| 20 | tovu | `apps/website/src/features/media-import/tool-registrations.ts:351` | media_import_from_url | INSERT | `const result = await persistImportedMedia({` |
| 21 | tovu | `apps/website/src/features/media/library-save-attachment.ts:67` | library_save_attachment | INSERT-TWO-PATHS | `if (input.attachmentRef === undefined) return saveLibraryDocument(  AND  return saveLibraryDocument({ deps, bytes, name` |
| 22 | tovu | `apps/website/src/features/members/tool-registrations.ts:198` | members_create | INSERT | `const { member } = await createMember({ deps: { ...toMembersWriteServiceDeps(deps), onMemb` |
| 23 | tovu | `apps/website/src/features/members/tool-registrations.ts:243` | members_delete | INSERT | `return trashMember({ workspaceId: deps.workspaceId, memberId, actor: { principalId: ctx.pr` |
| 24 | tovu | `apps/website/src/features/members/tool-registrations.ts:250` | members_disable | INSERT | `const { member } = await disableMember({ deps: toMembersWriteServiceDeps(deps), input: { w` |
| 25 | tovu | `apps/website/src/features/newsletter/delivery/tool-registrations.ts:108` | newsletter_send_test | INSERT | `const { results } = await sendTestCampaign({ deps: toNewsletterSendPipelineDeps(deps), inp` |
| 26 | tovu | `apps/website/src/features/newsletter/tool-registrations.ts:389` | newsletter_create_campaign | INSERT | `const { campaign } = await saveCampaign({` |
| 27 | tovu | `apps/website/src/features/newsletter/tool-registrations.ts:412` | newsletter_update_campaign | INSERT | `const { campaign } = await saveCampaign({` |
| 28 | tovu | `apps/website/src/features/newsletter/tool-registrations.ts:440` | newsletter_cancel_campaign | INSERT | `const { campaign } = await cancelCampaign({` |
| 29 | tovu | `apps/website/src/features/newsletter/tool-registrations.ts:461` | newsletter_create_list | INSERT | `const { list } = await saveList({` |
| 30 | tovu | `apps/website/src/features/newsletter/tool-registrations.ts:473` | newsletter_archive_list | INSERT | `const { list } = await archiveList({ deps: toListsDeps(deps), input: { workspaceId: deps.w` |
| 31 | tovu | `apps/website/src/features/newsletter/tool-registrations.ts:482` | newsletter_create_subscription | INSERT | `const { subscription } = await saveSubscription({` |
| 32 | tovu | `apps/website/src/features/observability/tool-registrations.ts:30` | observability_send_test_error | INSERT | `return deps.sendTelemetryTest({});` |
| 33 | tovu | `apps/website/src/features/pages/tool-registrations.ts:553` | pages_write_html | INSERT | `await store.write(html);` |
| 34 | tovu | `apps/website/src/features/pages/tool-registrations.ts:601` | pages_write_region | INSERT | `await store.write(next);` |
| 35 | tovu | `apps/website/src/features/pages/tool-registrations.ts:675` | pages_move_region | INSERT | `await store.write(moved.html);` |
| 36 | tovu | `apps/website/src/features/post/tool-registrations.ts:1001` | content_post_create | INSERT | `const { result } = await executeCommand<{ post: PostRecord }>({` |
| 37 | tovu | `apps/website/src/features/post/tool-registrations.ts:1080` | content_post_update | INSERT | `const { result } = await executeCommand<{ post: PostRecord }>({` |
| 38 | tovu | `apps/website/src/features/post/tool-registrations.ts:1227` | content_post_delete | INSERT | `const { result } = await executeCommand<{ post: PostRecord }>({` |
| 39 | tovu | `apps/website/src/features/publish-content/tool-registrations.ts:189` | PUBLISH_CONTENT_PUBLISH_TOOL_ID | INSERT | `return publishContentFromTool({ deps: routeDeps, principalId: ctx.principal.id }, input);` |
| 40 | tovu | `apps/website/src/features/publish-content/tool-registrations.ts:203` | PUBLISH_CONTENT_PLAN_PULL_TOOL_ID | INSERT | `await routeDeps.publishContentRunRepo.save({` |
| 41 | tovu | `apps/website/src/features/publish-content/tool-registrations.ts:224` | PUBLISH_CONTENT_EXECUTE_PULL_TOOL_ID | INSERT | `const applied = await executePublishContentImport({ workspaceId: routeDeps.workspaceId, co` |
| 42 | tovu | `apps/website/src/features/recovery/tool-registrations.ts:320` | RESTORE_TOOL_ID | INSERT | `const executed = await executeRestore({` |
| 43 | tovu | `apps/website/src/features/redirects/tool-registrations.ts:169` | redirects_create | INSERT | `const { record } = await createRedirect({` |
| 44 | tovu | `apps/website/src/features/redirects/tool-registrations.ts:189` | redirects_update | INSERT | `const { record } = await updateRedirect({` |
| 45 | tovu | `apps/website/src/features/redirects/tool-registrations.ts:231` | redirects_import | INSERT | `const { created, failed } = await importRedirects({` |
| 46 | tovu | `apps/website/src/features/seo/tool-registrations.ts:162` | seo_set_entry_overrides | INSERT | `const { overrides } = await withSchemaOnRejection({` |
| 47 | tovu | `apps/website/src/features/seo/tool-registrations.ts:194` | seo_set_settings | INSERT | `const settings = await withSchemaOnRejection({ toolId: "seo_set_settings", catalog: CATALO` |
| 48 | tovu | `apps/website/src/features/sites/tool-registrations.ts:174` | sites_duplicate_site | INSERT | `const result = await resolved.duplicateSite({` |
| 49 | tovu | `apps/website/src/features/sites/tool-registrations.ts:212` | sites_create_site | INSERT | `const created = orThrowRefusal(await createSiteForOwner({ workspaceId: routeDeps.workspace` |
| 50 | tovu | `apps/website/src/features/skills/install-tool.ts:87` | SKILLS_INSTALL_TOOL_ID | INSERT | `const skill = await asToolInput(() => commitSkillInstall({ ...deps, workspaceId: deps.work` |
| 51 | tovu | `apps/website/src/features/taxonomy/tool-registrations.ts:363` | MERGE_TOOL_ID | INSERT | `const result = await executeMergeTerm({` |
| 52 | tovu | `apps/website/src/features/theme/import-theme-file-tool.ts:160` | theme_import_file_from_url | INSERT | `const imported = toolId === "theme_import_local_file"` |
| 53 | tovu | `apps/website/src/features/theme/page-publish-tool.ts:36` | theme_set_page_published | INSERT | `return setThemePagePublished(deps, { themeId: input.themeId, page: input.page, published: ` |
| 54 | tovu | `apps/website/src/features/theme/tool-registrations.ts:666` | theme_write_file | INSERT | `writeThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath, conte` |
| 55 | tovu | `apps/website/src/features/theme/tool-registrations.ts:712` | theme_edit_file | INSERT | `writeThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath, conte` |
| 56 | tovu | `apps/website/src/features/theme/tool-registrations.ts:804` | theme_rename_file | INSERT | `const finalPath = performThemeFileRename(routeDeps, theme, { sourcePath: relativePath, des` |
| 57 | tovu | `apps/website/src/features/theme/tool-registrations.ts:863` | theme_copy_file | INSERT | `copyThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, sourcePath, destPath` |
| 58 | tovu | `apps/website/src/features/theme/tool-registrations.ts:900` | theme_trash_file | INSERT | `const { trashedPath, reloaded } = trashThemeFile({ deps: routeDeps, theme, relativePath })` |
| 59 | tovu | `apps/website/src/features/theme/tool-registrations.ts:926` | theme_restore_trashed_file | INSERT | `renameThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, sourcePath: trashe` |
| 60 | tovu | `apps/website/src/features/trash/tool-registrations.ts:183` | trash_restore_item | INSERT | `const outcome = await routeDeps.trash.restore({` |
| 61 | tovu | `apps/website/src/features/webhooks/tool-registrations.ts:233` | webhooks_create_subscription | INSERT | `const { subscription } = await createSubscription({` |
| 62 | tovu | `apps/website/src/features/webhooks/tool-registrations.ts:256` | webhooks_update_subscription | INSERT | `const { subscription } = await updateSubscription({` |
| 63 | tovu | `apps/website/src/features/widgets/tool-registrations.ts:336` | widgets_trash_instance | INSERT | `const { version } = await trashWidgetInstance({` |

## No change (35: 16 jini, 19 tovu) — listed so nobody re-flags them

| repo | file:line | tool | why |
|---|---|---|---|
| jini | `packages/cms/src/content-types/tool-registrations.ts:198` | collections_content_type_update_fields | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/cms/src/entries/tool-registrations.ts:140` | collections_entry_create | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/cms/src/entries/tool-registrations.ts:160` | collections_entry_update | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/cms/src/entries/tool-registrations.ts:179` | collections_entry_publish | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/cms/src/entries/tool-registrations.ts:195` | collections_entry_unpublish | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/devops/src/deploy/tool.ts:139` | handler (deploy publish) | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/user-management/src/server/agent-tool-registrations.ts:383` | identity_user_create | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/user-management/src/server/agent-tool-registrations.ts:398` | identity_user_update_email | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/user-management/src/server/agent-tool-registrations.ts:415` | identity_user_change_username | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/user-management/src/server/agent-tool-registrations.ts:428` | identity_user_disable | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/user-management/src/server/agent-tool-registrations.ts:445` | identity_user_enable | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/user-management/src/server/agent-tool-registrations.ts:455` | identity_role_create | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/user-management/src/server/agent-tool-registrations.ts:480` | identity_role_rename | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/user-management/src/server/agent-tool-registrations.ts:489` | identity_role_delete | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/user-management/src/server/agent-tool-registrations.ts:516` | identity_policy_update | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| jini | `packages/user-management/src/server/agent-tool-registrations.ts:531` | identity_policy_delete | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| tovu | `apps/website/src/assistant/render-ui-tool.ts:113` | RENDER_UI_TOOL_ID | the flagged call is not a write (factory, formatter, permission lookup or setup card) |
| tovu | `apps/website/src/features/consent/tool-registrations.ts:47` | consent_update_settings | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| tovu | `apps/website/src/features/consent/tool-registrations.ts:56` | consent_publish_settings | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| tovu | `apps/website/src/features/deployments/publish-agent-tools.ts:1043` | deployment_get_static_publish_status | the flagged call is not a write (factory, formatter, permission lookup or setup card) |
| tovu | `apps/website/src/features/external-mcp/tool-registrations.ts:687` | external_mcp_test_connection | the flagged call is not a write (factory, formatter, permission lookup or setup card) |
| tovu | `apps/website/src/features/forms/tool-registrations.ts:345` | forms_create_definition | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| tovu | `apps/website/src/features/forms/tool-registrations.ts:368` | forms_update_definition | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| tovu | `apps/website/src/features/fs-files/tool-registrations.ts:189` | FS_WRITE_FILES_TOOL_ID | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| tovu | `apps/website/src/features/mail-status/provider-tool-registrations.ts:113` | mail_configure_provider | the flagged call is not a write (factory, formatter, permission lookup or setup card) |
| tovu | `apps/website/src/features/taxonomy/tool-registrations.ts:242` | taxonomy_create_taxonomy | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| tovu | `apps/website/src/features/taxonomy/tool-registrations.ts:253` | taxonomy_create_term | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| tovu | `apps/website/src/features/taxonomy/tool-registrations.ts:264` | taxonomy_rename_term | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| tovu | `apps/website/src/features/theme/tool-registrations.ts:644` | theme_read_file | the flagged call is not a write (factory, formatter, permission lookup or setup card) |
| tovu | `apps/website/src/features/trash/tool-registrations.ts:150` | trash_list_items | the flagged call is not a write (factory, formatter, permission lookup or setup card) |
| tovu | `apps/website/src/features/widgets/tool-registrations.ts:284` | widgets_create_instance | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| tovu | `apps/website/src/features/widgets/tool-registrations.ts:302` | widgets_update_instance | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| tovu | `apps/website/src/features/widgets/tool-registrations.ts:406` | widgets_insert_embed | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| tovu | `apps/website/src/features/widgets/tool-registrations.ts:423` | widgets_remove_embed | no `await` before the first write: the executor (or approval wrapper) already checked the signal synchronously right before this code runs |
| tovu | `apps/website/src/server/runtime/composition/site-guide-tools.ts:110` | site_guide | the flagged call is not a write (factory, formatter, permission lookup or setup card) |
