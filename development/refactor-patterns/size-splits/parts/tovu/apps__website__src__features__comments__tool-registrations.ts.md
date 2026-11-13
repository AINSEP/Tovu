### tovu:apps/website/src/features/comments/tool-registrations.ts
- **Over:** `buildCommentsRegistrations` 127 (file 265)
- **Phase:** after-move (MOVE-AFTER settings feature, c…) · **Batch:** size-56
- **Tests:** `apps/website/src/features/comments/__tests__/tool-registrations.get-comment.test.ts`, `…/tool-registrations.list-validation.test.ts`, `…/tool-registrations.model-facing-errors.test.ts`, `…/tool-registrations.update-settings-validation-status.test.ts`, `…/provider-tools.test.ts`, `…/agent-tools.trash-confirmation.test.ts` (all under `apps/website/src/features/comments/__tests__/`)
- **Responsibility map:** handlers object = provider (`comments_get_provider`, `comments_set_provider`) · reads (`comments_get_comment`, `comments_list_moderation_queue`) · settings (`comments_get_settings`, `comments_update_settings`) · moderation (`comments_approve_comment`, `comments_mark_comment_spam`, `comments_trash_comment`, `comments_restore_comment`).
- **Splits** (HELPERS, same file, above `buildCommentsRegistrations`):
  1. `buildCommentsProviderHandlers({ routeDeps, surfaces, providerRegistry, providerPermission }): Record<string, ToolHandler>` ← the two provider entries; move `providerRegistry`/`providerPermission` arrows into it if nothing else reads them (outline: only `handlers` does) — then input is `{ routeDeps, surfaces }`.
  2. `buildCommentsReadAndSettingsHandlers({ routeDeps }): Record<string, ToolHandler>` ← `comments_get_comment` through `comments_update_settings` (four entries, contiguous).
  3. `buildCommentsModerationHandlers({ routeDeps, surfaces }): Record<string, ToolHandler>` ← the four moderation entries (incl. the trash handler and its confirmation comments).
  `handlers = { ...1, ...2, ...3 }` (original key order kept).
- **Importers to update:** none.
- **After:** `buildCommentsRegistrations` ~20; helpers ~40 / ~45 / ~45; file ~275.
- **Risks / notes:** keep `surfaces` default parameter on `buildCommentsRegistrations` unchanged.
