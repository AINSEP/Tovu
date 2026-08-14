# Class D port coverage — `useWiredX()` hooks under `apps/admin/src`

**Date:** 2026-08-14
**Assessed at:** commit `e58e140` (scan start) through `b431808` (final re-verification) — the tree
was being committed to concurrently by other agents throughout; every check in this report was
re-run fresh against the live working tree at the end and produced identical results to the start,
so nothing here went stale mid-analysis. Not frozen, per the dispatch instruction — if this catalog
is consulted later, treat filenames as reliable and treat "which agent's commit this landed in" as
unverified.
**Method:** read-only. Scripted resolution of each hook's *actual imports* (not filename guessing),
followed by manual `Read` verification of every ambiguous or flagged hit — see "False positives
ruled out" below. Scripts are throwaway, left in scratchpad, not committed.
**Scope:** every file under `apps/admin/src` exporting `useWiredX` (`export function useWired…` /
`export const useWired…`) — 60 files, listed exhaustively below. This supersedes the file-guessing
pass in `2026-08-14-usewired-migration-catalog.md`'s Class D section; that document's own Class B/Class
D scope is otherwise unaffected by this file.

---

## Why the original list was unreliable (confirmed, both root causes)

The original catalog derived each hook's expected port filename from the hook's own filename
(`use-posts.hooks.ts` → look for `posts-port.hooks.ts`) and reported "no port" on any mismatch. Two
confirmed misses from that method:

- `use-posts.hooks.ts`'s port is `posts-list-port.hooks.ts` (stem `posts-list`, not `posts`) — port,
  dependencies, and fake all present and correctly named for the `PostsListPort` interface.
- `use-post-editor.hooks.ts` has a full `PostEditorPort` + `post-editor-dependencies.hooks.ts` +
  `createFakePostEditorPort` — not missing.

This pass resolves every port/dependency file by reading each hook's own `import` statements (type
imports for the port, value imports for the dependencies module) and following them to whatever file
they actually name, so a naming-convention mismatch cannot produce a false "no port" the way
filename-guessing did.

---

## Result: has port + fake (57 of 60)

Every one of these resolves, via the hook's own imports, to a port interface (`import type { XPort }
from "./<stem>-port.hooks"`) **and** a dependencies module providing both `default<X>Port` and
`createFake<X>Port` (naming is consistently `createFake<X>Port` across all 57 — the alternative
`create<X>FakePort` spelling the dispatch flagged as possible does not actually occur anywhere in
this codebase today).

| Hook file | Port interface | Dependencies file | Fake factory |
|---|---|---|---|
| `components/MediaPickerDialog/MediaPickerDialog.hooks.tsx` | `MediaPickerPort` | `media-picker-dependencies.hooks.ts` | `createFakeMediaPickerPort` |
| `features/ai-assistant/hooks/use-ai-assistant.hooks.ts` | `AiAssistantPort` | `ai-assistant-dependencies.hooks.ts` | `createFakeAiAssistantPort` |
| `features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts` | `VisitorCredentialFormPort` | `visitor-credential-form-dependencies.hooks.ts` | `createFakeVisitorCredentialFormPort` |
| `features/analytics/hooks/use-analytics.hooks.ts` | `AnalyticsPort` | `analytics-dependencies.hooks.ts` | `createFakeAnalyticsPort` |
| `features/auth/hooks/use-login.hooks.ts` | `LoginPort` | `login-dependencies.hooks.ts` | `createFakeLoginPort` |
| `features/collections/hooks/use-collection-entries.hooks.ts` | `CollectionEntriesPort` | `collection-entries-dependencies.hooks.ts` | `createFakeCollectionEntriesPort` |
| `features/collections/hooks/use-collection-entry-editor.hooks.ts` | `CollectionEntryEditorPort` | `collection-entry-editor-dependencies.hooks.ts` | `createFakeCollectionEntryEditorPort` |
| `features/collections/hooks/use-collections.hooks.ts` | `CollectionsPort` | `collections-dependencies.hooks.ts` | `createFakeCollectionsPort` |
| `features/collections/hooks/use-edit-fields-dialog.hooks.ts` | `EditFieldsDialogPort` | `edit-fields-dialog-dependencies.hooks.ts` | `createFakeEditFieldsDialogPort` |
| `features/collections/hooks/use-new-content-type-dialog.hooks.ts` | `NewContentTypeDialogPort` | `new-content-type-dialog-dependencies.hooks.ts` | `createFakeNewContentTypeDialogPort` |
| `features/collections/hooks/use-term-picker.hooks.ts` | `TermPickerPort` | `term-picker-dependencies.hooks.ts` | `createFakeTermPickerPort` |
| `features/comments/hooks/use-comment-queue.hooks.ts` | `CommentQueuePort` | `comment-queue-dependencies.hooks.ts` | `createFakeCommentQueuePort` |
| `features/comments/hooks/use-comment-settings.hooks.ts` | `CommentSettingsPort` | `comment-settings-dependencies.hooks.ts` | `createFakeCommentSettingsPort` |
| `features/comments/hooks/use-comments.hooks.ts` | `CommentsPort` | `comments-dependencies.hooks.ts` | `createFakeCommentsPort` |
| `features/dashboard/hooks/use-dashboard.hooks.ts` | `DashboardPort` | `dashboard-dependencies.hooks.ts` | `createFakeDashboardPort` |
| `features/database/hooks/use-migrate-forward-section.hooks.ts` | `MigrateForwardSectionPort` | `migrate-forward-section-dependencies.hooks.ts` | `createFakeMigrateForwardSectionPort` |
| `features/database/hooks/use-restore-points-section.hooks.ts` | `RestorePointsSectionPort` | `restore-points-section-dependencies.hooks.ts` | `createFakeRestorePointsSectionPort` |
| `features/database/hooks/use-timeline-section.hooks.ts` | `TimelineSectionPort` | `timeline-section-dependencies.hooks.ts` | `createFakeTimelineSectionPort` |
| `features/forms/hooks/use-form-editor.hooks.ts` | `FormsPort` | `forms-dependencies.hooks.ts` | `createFakeFormsPort` |
| `features/forms/hooks/use-form-submission-detail.hooks.ts` | `FormSubmissionsPort` | `form-submissions-dependencies.hooks.ts` | `createFakeFormSubmissionsPort` |
| `features/forms/hooks/use-form-submissions.hooks.ts` | `FormSubmissionsPort` | `form-submissions-dependencies.hooks.ts` | `createFakeFormSubmissionsPort` |
| `features/forms/hooks/use-forms-list.hooks.ts` | `FormsPort` | `forms-dependencies.hooks.ts` | `createFakeFormsPort` |
| `features/integrations/hooks/use-integration-deliveries.hooks.ts` | `IntegrationDeliveriesPort` | `integration-deliveries-dependencies.hooks.ts` | `createFakeIntegrationDeliveriesPort` |
| `features/integrations/hooks/use-integrations.hooks.ts` | `IntegrationsPort` | `integrations-dependencies.hooks.ts` | `createFakeIntegrationsPort` |
| `features/media/hooks/use-edit-media-panel.hooks.ts` | `MediaPort` | `media-dependencies.hooks.ts` | `createFakeMediaPort` |
| `features/media/hooks/use-media.hooks.ts` | `MediaPort` | `media-dependencies.hooks.ts` | `createFakeMediaPort` |
| `features/members/hooks/use-members.hooks.ts` | `MembersPort` | `members-dependencies.hooks.ts` | `createFakeMembersPort` |
| `features/menus/hooks/use-menu-editor.hooks.ts` | `MenusPort` | `menus-dependencies.hooks.ts` | `createFakeMenusPort` |
| `features/menus/hooks/use-menus.hooks.ts` | `MenusPort` | `menus-dependencies.hooks.ts` | `createFakeMenusPort` |
| `features/pages/hooks/use-page-editor.hooks.ts` | `PageEditorPort` | `page-editor-dependencies.hooks.ts` | `createFakePageEditorPort` |
| `features/pages/hooks/use-pages.hooks.ts` | `PagesPort` | `pages-dependencies.hooks.ts` | `createFakePagesPort` |
| `features/pages/hooks/use-theme-pages.hooks.ts` | `ThemePagesPort` | `theme-pages-dependencies.hooks.ts` | `createFakeThemePagesPort` |
| `features/plugins/hooks/use-plugins.hooks.ts` | `PluginsPort` | `plugins-dependencies.hooks.ts` | `createFakePluginsPort` |
| `features/posts/hooks/use-post-editor.hooks.ts` | `PostEditorPort` | `post-editor-dependencies.hooks.ts` | `createFakePostEditorPort` |
| `features/posts/hooks/use-posts.hooks.ts` | `PostsListPort` | `posts-list-dependencies.hooks.ts` | `createFakePostsListPort` |
| `features/recovery/hooks/use-recovery.hooks.ts` | `RecoveryPort` | `recovery-dependencies.hooks.ts` | `createFakeRecoveryPort` |
| `features/recovery/hooks/use-restore-flow.hooks.ts` | `RestoreFlowPort` | `restore-flow-dependencies.hooks.ts` | `createFakeRestoreFlowPort` |
| `features/redirects/hooks/use-hit-count-cell.hooks.ts` | `RedirectsPort` | `redirects-dependencies.hooks.ts` | `createFakeRedirectsPort` |
| `features/redirects/hooks/use-import-redirects-form.hooks.ts` | `RedirectsPort` | `redirects-dependencies.hooks.ts` | `createFakeRedirectsPort` |
| `features/redirects/hooks/use-redirects.hooks.ts` | `RedirectsPort` | `redirects-dependencies.hooks.ts` | `createFakeRedirectsPort` |
| `features/roles/hooks/use-roles.hooks.ts` | `RolesPort` | `roles-dependencies.hooks.ts` | `createFakeRolesPort` |
| `features/seo/hooks/use-entry-picker.hooks.ts` | `SeoPort` | `seo-dependencies.hooks.ts` | `createFakeSeoPort` |
| `features/seo/hooks/use-seo-entry-panel.hooks.ts` | `SeoPort` | `seo-dependencies.hooks.ts` | `createFakeSeoPort` |
| `features/seo/hooks/use-seo.hooks.ts` | `SeoPort` | `seo-dependencies.hooks.ts` | `createFakeSeoPort` |
| `features/settings/hooks/use-composio-config.hooks.ts` | `ComposioConfigPort` | `composio-config-dependencies.hooks.ts` | `createFakeComposioConfigPort` |
| `features/taxonomy/hooks/use-merge-term-section.hooks.ts` | `MergeTermSectionPort` | `merge-term-section-dependencies.hooks.ts` | `createFakeMergeTermSectionPort` |
| `features/taxonomy/hooks/use-new-taxonomy-form.hooks.ts` | `NewTaxonomyFormPort` | `new-taxonomy-form-dependencies.hooks.ts` | `createFakeNewTaxonomyFormPort` |
| `features/taxonomy/hooks/use-new-term-form.hooks.ts` | `NewTermFormPort` | `new-term-form-dependencies.hooks.ts` | `createFakeNewTermFormPort` |
| `features/taxonomy/hooks/use-taxonomy.hooks.ts` | `TaxonomyPort` | `taxonomy-dependencies.hooks.ts` | `createFakeTaxonomyPort` |
| `features/taxonomy/hooks/use-term-detail-panel.hooks.ts` | `TaxonomyPort` | `taxonomy-dependencies.hooks.ts` | `createFakeTaxonomyPort` |
| `features/themes/hooks/use-theme-explore.hooks.ts` | `ThemeExplorePort` | `theme-explore-dependencies.hooks.ts` | `createFakeThemeExplorePort` |
| `features/themes/hooks/use-themes.hooks.ts` | `ThemesPort` | `themes-dependencies.hooks.ts` | `createFakeThemesPort` |
| `features/users/hooks/use-users.hooks.ts` | `UsersPort` | `users-dependencies.hooks.ts` | `createFakeUsersPort` |
| `features/widgets/hooks/use-widget-instance-editor.hooks.ts` | `WidgetsPort` | `widgets-dependencies.hooks.ts` | `createFakeWidgetsPort` |
| `features/widgets/hooks/use-widget-region-editor.hooks.ts` | `WidgetRegionsPort` | `widget-regions-dependencies.hooks.ts` | `createFakeWidgetRegionsPort` |
| `features/widgets/hooks/use-widget-regions.hooks.ts` | `WidgetRegionsPort` | `widget-regions-dependencies.hooks.ts` | `createFakeWidgetRegionsPort` |
| `features/widgets/hooks/use-widgets-library.hooks.ts` | `WidgetsPort` | `widgets-dependencies.hooks.ts` | `createFakeWidgetsPort` |
| `features/workspace/hooks/use-workspace.hooks.ts` | `WorkspacePort` | `workspace-dependencies.hooks.ts` | `createFakeWorkspacePort` |
| `hooks/use-admin-execution-credential.hooks.ts` | `AdminExecutionCredentialPort` | `admin-execution-credential-dependencies.hooks.ts` | `createFakeAdminExecutionCredentialPort` |
| `hooks/use-assistant-chats.hooks.ts` | `AssistantChatsPort` | `assistant-chats-dependencies.hooks.ts` | `createFakeAssistantChatsPort` |

No naming pattern was assumed going in — the table above is the *observed* stem for each pair, and
they genuinely vary: `<thing>-port.hooks.ts` (most), `<thing>-list-port.hooks.ts` (`use-posts`), and
one hook (`use-term-detail-panel`) sharing its sibling's port stem (`taxonomy-port.hooks.ts`, not its
own name) rather than owning a private one — correct per `redirects-port.hooks.ts`'s "genuinely
shares the resource" precedent, not a miss.

## Result: has port, no fake factory (0 of 60)

None. Every one of the 57 dependency files above declares exactly one `default<X>Port` **and** one
`createFake<X>Port`. Checked explicitly, not inferred from the port's existence — this was worth
verifying separately since a port with no fake is a real, distinct gap per the dispatch (the fake is
what makes the seam usable, not the interface).

## Result: no port at all (3 of 60) — all verified genuinely I/O-free, not gaps

| Hook file | Verified reason no port applies |
|---|---|
| `features/ai-assistant/hooks/use-ai-assistant-locale-sync.hooks.ts` | Bridges `useI18n()`'s `{ locale, setLocale }` into an effect — zero `api`/`fetch` anywhere. Takes its two dependencies (`activeLocale`, `setLocale`) as a plain injected object; `useWiredAiAssistantLocaleSync` binds the real `useI18n()`. No host boundary to abstract behind a port. |
| `features/settings/hooks/use-settings-locale-sync.hooks.ts` | Identical shape/reasoning to the above, for `SettingsUi.tsx`'s own `I18nProvider` bridge — deliberately not shared code (each feature owns its own copy, per this app's per-feature `hooks/` convention), but the same "no I/O" verdict applies independently. |
| `features/plugins/hooks/use-agent-plugins.hooks.ts` | Its own file header states the reasoning explicitly: the only data source is `TOVU_BUNDLED_AGENT_PLUGINS`, a static checked-in constant (`agent-plugin-catalog.ts`), not a fetched resource. `useWiredAgentPlugins` is a one-line alias with no dependency to bind, kept only so the prop-injection naming stays grep-consistent with every other screen. |

None of the three declares an inline port interface either (the historical `use-visitor-credential-
form` shape, before its split) — there was nothing to extract, because there is nothing to inject.

## Result: port exists but hook still imports `api` directly (1 of 60)

| Hook file | Port | Direct `api` call | Status |
|---|---|---|---|
| `features/media/hooks/use-edit-media-panel.hooks.ts` | `MediaPort` (full quartet, shared with `use-media.hooks.ts`) | `api.mediaOriginalUrl(item.id)` | **Documented, deliberate exception — not a silent gap** |

`media-port.hooks.ts`'s own file header explains the exclusion: `mediaOriginalUrl` is a pure,
synchronous URL template (`${BASE}/workspaces/${WORKSPACE_ID}/media/${id}/original` — no `fetch`, no
`await`, no network round trip), the same "no host boundary, no side effect" category the convention
names for `describeApiError`. Injecting it would let a fake quietly change a deterministic
string-building rule every test needs to hold still, for zero testability gain. This is a reviewed,
intentional narrowing of the port's surface, not an overlooked direct-import — flagged here only
because the dispatch asked for the fact ("does the hook still import `api` directly"), and the fact
is yes, with this specific justification attached.

No other hook in the 60 has a real value import of `api` from `lib/api` combined with a real
`api.<method>(` call site outside a comment. This was checked with a comment-stripped, multi-line-
aware scan specifically because the naive version produces false positives (next section).

---

## False positives ruled out (why the count above isn't higher)

Three near-misses that a cruder text search would have wrongly flagged as partial seams or missing
ports — each verified by reading the actual file, not by trusting the regex:

1. **`features/roles/hooks/use-roles.hooks.ts` and `features/users/hooks/use-users.hooks.ts`** — a
   naive `api\.\w+\(` search matches `api.xxx()` in both files, but it's inside prose: *"every
   `api.xxx()` call below is now [injected]"* — a doc comment describing the conversion, not a call
   site. Neither file imports the real `api` as a value.
2. **`features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts`** — matches
   `api.setAssistantSiteCredential(`, but the `api` there is `deps.api`, a locally-scoped parameter
   name (`deps: { api: VisitorCredentialFormPort; ... }`) inside the extracted `saveVisitorCredential`
   helper — not the `lib/api` singleton. This hook's only import from `lib/api` is `import type {
   SiteAssistantCredential, SiteAssistantCredentialPatch }` — type-only, which is the correct,
   allowed pattern (per the dispatch's own rule that a type-only import in a component/hook is not a
   defect). Every real I/O call in this hook goes through the injected `VisitorCredentialFormPort`
   (`apiRef.current.getAssistantSiteCredential()`, `deps.api.setAssistantSiteCredential()`). This is
   the exact hook the dispatch brief cited as "just fixed" by another agent — confirmed clean at this
   commit, not still broken.
3. **`features/themes/hooks/use-theme-explore.hooks.ts`** — its port type import is a multi-name
   clause (`ThemeExploreFileEntry, ThemeExplorePort, ThemeFileGroup`); a naive single-name port regex
   would miss it. Resolved correctly once the import parser handled multi-name `import type { A, B, C
   }` clauses instead of assuming one name per import.

---

## Bottom line

- 57 of 60 `useWiredX` hooks have a complete port + dependencies + fake triple.
- 0 have a port with no fake.
- 3 have no port, and all 3 are verified to perform no I/O — a port would be ceremony, matching this
  migration's own stated rule.
- 1 (`use-edit-media-panel.hooks.ts`) has a port but still touches `api` directly for one pure,
  non-I/O method — a reviewed, documented, narrow exception, not an unnoticed gap.

**No fixes were made.** This is a worklist for a later pass, per the dispatch instruction — the owner
deferred Class D and this file only replaces the earlier, filename-guessed list with one resolved
from actual imports.
