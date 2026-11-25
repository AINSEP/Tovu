BUGS admin UI: 9 sheets, 11 bugs covered, 1 skipped (retroactive Trash deadline change conflicts with the recorded retention decision)

Programmer(Direct). Read-only plan against Tovu `6ace8e8fb2` and Jini `50f8dfcd9`. `UI-1` through `UI-5` refer to the 12:58 PM re-check. No files changed, no tests run.

For each sheet, write the named witnesses first and record the mutations in the builder’s `COMMIT-PLAN.md`. Stop that sheet if its post-extraction anchor no longer matches. New functions take `(required, _optional = {})`, changed view seams take required hook props, and effects stay injected. Keep functions at or below 80 lines and complexity 10, preserve stricter local limits, keep Jini vendor- and server-neutral, and leave themes untouched. None of these sheets needs a migration.

## 1. Site Trash — paging and retention wording

**Bugs:** `H1052`. `UI-1` gets a wording correction only. **BUILDER: SOL.**

The CMS route deliberately filters the fetched page by permission, so it can legitimately return no visible rows with a continuation cursor. `TrashItemsView` calls that state empty and hides the only control that reaches the next page. The header also describes the current window as if it applied to every stored deadline.

**Tests first.** In Tovu `apps/admin/src/features/trash/__tests__/Trash.unit.test.tsx`, add “a page with no visible rows still lets the operator reach the next page.” Inject a port returning `[]` with a cursor, then one visible row with no cursor. Assert no terminal empty message on page one, one cursor request on click, and the visible row on page two. Mutation `empty-page-hides-next-cursor` restores the unconditional empty return. In Jini `packages/admin/src/screens/trash/__tests__/header-copy.unit.test.tsx`, add “the current window does not replace previously assigned deadlines.” Assert current-window copy qualifies older rows and a fixture with 44 days left still renders 44. Mutation `retention-copy-promises-retroactive-window` removes that qualification.

**Fix and order.** The view moved from Tovu `apps/admin/src/features/trash/Trash.tsx` to Jini `packages/admin/src/screens/trash/Trash.tsx` in the `294813058c` extraction. The Tovu file is now a mount, and the Jini sparse-page branch is still present in `origin/codex/w3-r2allj`. In Jini `TrashItemsView`, show the terminal empty state only when there are no rows **and** no cursor. Render the table only when there are rows, and make the existing Load more button independent of the table. Keep the controller, authorization filter, cursor, and per-request scan bound unchanged. In Jini `packages/admin/src/screens/trash/rules.ts` and its `trash-i18n/trash-i18n-{a,b,c}.ts` dictionaries, qualify the injected window as the rule for newly trashed items and say older items keep their assigned deadlines. Land the Jini change before the Tovu consumer pin.

**Real browser check.** Open Trash as a role that can see a row beyond the first page. Check that Load more reaches it. Compare a newly trashed row with a pre-change row. The bug ledger explicitly says old 60-day stamps stay in force. Do not turn 44 into approximately 13 in the UI or alter `purgeAfter` or the sweeper.

## 2. Media → Trash — retention and per-item countdown

**Bug:** `UI-2`. **BUILDER: SOL.**

The media grid is a separate read path from site Trash. Its response carries neither the current policy nor the stored purge deadline for each returned asset, so the Media view cannot state either accurately.

**Tests first.** In Jini `packages/cms/src/admin-http/routes/media/__tests__/grid.test.ts`, add “Trash grid returns the current policy and only the returned rows’ stamped countdowns.” Inject a fixed clock, 30-day policy, a legacy deadline and a new deadline. Assert the page and exact-item lookup carry the right countdown, the lookahead row is not read for enrichment, and an active tab has neither Trash metadata nor a deadline lookup. Mutation `media-countdown-recomputed-from-policy` makes the legacy assertion fail. In Tovu `apps/admin/src/features/media/__tests__/media-screen-states.unit.test.tsx`, add “Media Trash explains retention and displays each supplied countdown.” Check the policy on the empty tab, the supplied countdown on a populated tab, and neither on an active tab. Mutation `media-trash-copy-dropped` suppresses the two render sites.

**Fix and order.** Extend Jini `packages/core/src/contracts/site/cms-admin-media.ts` with additive grid-only fields, `retentionDays` on `MediaGridPage` and `trashDaysRemaining` on its media rows. In Jini `packages/cms/src/admin-http/routes/media/grid.ts`, add required `clock`, `retentionDays`, and `readTrashDeadlines({ workspaceId, ids }, _optional = {})` dependencies. Apply them only to the Trash page and exact lookup, after authorization and trimming. Use the existing `daysRemaining` calculation from `packages/cms/src/admin-http/http/trash.ts`, exported for use within CMS. Omit a row’s countdown if it has no stamp. Do not infer it from `createdAt` or add a browser timer.

Bind `TRASH_RETENTION_DAYS` and the existing clock in Tovu `apps/website/src/server/runtime/composition/modules/media.ts` at `registerAdminMediaGridRoute`. Add `listGridTrashDeadlines({ workspaceId, ids }, _optional = {})` to `SqlMediaRepo` in `apps/website/src/platform/db/repos/media-repo.ts`, backed by one query in its existing `media-grid-query.ts` sibling for `workspace_id`, `entity_type = media`, and the returned IDs. Read only ID and `purge_after`. The route is already in Jini. The host mount and SQL files remain in Tovu on `tv-r3-w1b`, whose mount adds `errors` independently. Keep that signature.

In Tovu `apps/admin/src/features/media/hooks/use-grid-pages.hooks.ts` and `use-media.hooks.ts`, pass the page policy to `MediaLibraryPanel`. Render the translated policy before `MediaGridOrEmpty`, and the translated row countdown in `MediaCard`. Add the two strings to the existing Media dictionaries. Pass retention through the existing fake grid port for the view witness. Jini contract and route first, then Tovu host and view in one consumer change.

**Real browser check.** Compare the same new and legacy media rows on Media → Trash and site Trash. Check the empty Media Trash tab and switch back to Images.

## 3. Secrets — partial store failures and access to saved key 51+

**Bugs:** `H1122`, `H1440`. **BUILDER: SOL.** Two independent commits in this area.

One failed store turns the Tovu tab into an error-only view. Tier 1 also waits for successful arrays from all three stores before it can produce groups. Separately, the saved-key picker already reports the omitted count, but has no way to request the omitted keys.

**Tests first.**

- In Tovu `apps/admin/src/features/security/__tests__/AccessTokensTab.unit.test.tsx`, add “a forbidden store leaves healthy credentials and the failure notice visible.” Exercise one rejected Tier 1 read with healthy rows in both tiers, then a Tier 2 failure with healthy Tier 1 rows. Assert a settled view, usable healthy rows and no false “Not connected” state. Mutations `secrets-error-replaces-list` and `secrets-rows-require-every-success` restore the two gates.
- In Tovu `apps/website/src/server/runtime/composition/__tests__/other-site-keys.integration.test.ts`, add “continuing one source reaches saved key 51 without opening other sources.” Use the existing two-site fixture. Assert the page boundary has no overlap, key 51 is returned as metadata only, and existing exact-ID approval lookup still works. Mutation `saved-keys-always-first-50` ignores the continuation. In Jini `packages/admin/src/security/host/__tests__/copy-keys-picker.test.tsx`, add “Load more retains existing choices and offers the next saved key.” Assert one continuation GET, old rows retained, next key selectable, and no grant POST until confirmation. Mutation `saved-key-continuation-discarded` drops the returned page.

**Fix and order.**

1. **Store isolation.** `AccessTokensTab.tsx`, `Security.tsx`, and `hooks/use-access-tokens.hooks.ts` remain Tovu-owned on `tv-adm-dom2`. Jini’s separate `packages/admin/src/security/react/tabs/AccessTokensTab.tsx` already renders errors alongside results. Do not switch to that rewrite or change routes. In Tovu `useAccessTokens`, distinguish settled error from pending for the three existing reads and build groups from the successful arrays. Leave the existing reload settlement ordering intact. In `AccessTokensBody`, keep the error notices inline, then render healthy rows and existing search/category controls. Do not show the global empty state while any store failed. The other-credentials hook already settles failed stores independently. Require the existing `AccessTokensTab` hook props and bind them in `Security.tsx`, keeping the test fakes.
2. **Continue one site.** Keep the 50-row initial bound. In Tovu `other-site-keys.ts`, extend `createKeyList` and `createSourceReader` with an opaque continuation scoped to a registered site and the existing `(kind, id)` order. Read only that site, strictly after the last returned position, with the same filters and limit. Put the next cursor on the existing omission marker. Thread it through `SiteKeySource.list` and `ProjectKeysPort.listChoices` in `apps/website/src/features/project-keys/service.ts`. Calls without a cursor retain their exact behavior. The Tovu readers stay on `tv-w2all`, while the GET is now Jini `packages/cms/src/admin-http/routes/system/credential-copy.ts`, mounted by Tovu `apps/website/src/server/runtime/composition/modules/system-credential-copy.ts`. Add `{ cursor?: string }` to the GET input and choice-listing port only. Keep admission, `no-store`, refusal redaction and POST unchanged.
3. **Picker wiring for commit 2.** The Tovu `features/security/api/security-api.ts`, `hooks/use-copy-keys.hooks.ts`, and `CopyKeysDialog.tsx` implementations moved to Jini `packages/admin/src/security/api/security-api.ts` and `packages/admin/src/security/host/{hooks/use-copy-keys.hooks.ts,CopyKeysDialog.tsx}`. They are still there on `adm-dom2-j`. Add the optional cursor to the choice type in `packages/core/src/contracts/site/api-security-api-types.ts`. Use the existing client request port and render Load more beside the omission marker. Append only that page, replace its omission marker, preserve selection, and ignore a result after close as the existing open fetch does. Keep the Tovu live binding in `apps/admin/src/features/security/hooks/copy-keys-dependencies.hooks.ts`. Land Jini contracts and Tovu binding together.

## 4. Newsletter authoring — explicit null clears the preheader

**Bug:** `H1115`. **BUILDER: SOL.**

The tool schema accepts `null` and the update tool promises that omitted fields keep their value. `createNewsletterUpdateCampaignHandler` treats all non-strings as omission, so explicit `null` cannot reach the writer.

**Test first.** In Tovu `apps/website/src/features/newsletter/__tests__/tool-registrations.model-facing-errors.test.ts`, add “newsletter_update_campaign preserves an omitted preheader and clears explicit null.” Start with a non-null stored value. Change the subject without a preheader, then send `preheader: null`. Assert both the returned and stored values after each call. Mutation `preheader-null-is-omitted` restores the string-only expression.

**Fix and order.** Change only the `preheader` expression inside `createNewsletterUpdateCampaignHandler` in Tovu `apps/website/src/features/newsletter/tool-registrations.ts` to accept an explicit null or string and otherwise use `existing.preheader`. `tv-w2all` and `tv-r3-w1b` retain this handler. Its old Tovu `features/newsletter/agent-tools.ts` catalog is now Jini `packages/user-management/src/newsletter/agent-tools.ts`. The schema already permits null. No Jini edit or dependency. Preserve authorization, abort check and write order.

## 5. Desktop locale — Portuguese regional fallback

**Bug:** `H1057`. **BUILDER: SOL.**

`desktopLocaleKey` reduces `pt-PT` to `pt`, but the tables have `pt-BR`, not `pt`. Jini’s `resolveSystemLocale` searches supported locale bases and finds the available Portuguese dictionary.

**Test first.** In Tovu `apps/desktop/src/desktop-i18n.boundaries.test.ts`, add “pt-PT uses the available Portuguese dictionary, not English.” Assert the whole `desktopCopy` result equals `pt-BR` and differs from English. Mutation `desktop-base-must-be-a-dictionary-key` restores the bare `pt` lookup.

**Fix and order.** `desktopLocaleKey` stays in `apps/desktop/src/desktop-i18n.ts`. Keep its underscore normalization, case-insensitive exact-match precedence, existing Chinese mapping and English fallback. Use Jini `resolveSystemLocale({ languages: [normalized], supportedLocales: Object.keys(COPY) }, {})` for the remaining fallback. The matcher is still in Jini `packages/ui/src/features/i18n/locale.ts` on `w3-r2allj`. Expose that existing function explicitly from `packages/ui/src/core.ts` so desktop can import via its declared `@jini-ai/ui/core` dependency without the React barrel. Jini export first, Tovu consumer second.

**Packaged check.** Launch with the system locale set to Portuguese (Portugal). Open the desktop Settings and a desktop confirmation dialog. Check Portuguese copy, not browser-admin copy.

## 6. Collections — Draft pill treatment

**Bug:** `O1751`. **BUILDER: SOL.**

The extracted Collections view emits `jini-status jini-status-draft`. The host CSS has base pill geometry but no Draft tone selector.

**Test first.** Extend Tovu `apps/admin/src/features/collections/__tests__/CollectionEntries.unit.test.tsx` with “the emitted draft badge has the host’s neutral pill colors.” Use the existing Draft fixture and assert the emitted class has the scoped background and foreground declarations in the actual host stylesheet. Mutation `draft-pill-selector-missing` removes the selector from the group.

**Fix and order.** In Tovu `apps/admin/src/integrations/jini-admin/jini-media.css`, add `.jini-status-draft` under the same `:is(.jini-page, .jini-dialog)` scope as `.jini-status-neutral`, sharing its `--surface-3` and `--muted` declarations. Tovu `features/collections/CollectionEntriesScreen.tsx` mounts the extracted view in Jini `packages/admin/src/screens/collections/CollectionEntries.tsx`. The class is present on `adm-dom2-j` and the stylesheet remains Tovu-owned on `tv-adm-dom2`. No Jini change. Check a Draft entry in light and dark mode.

## 7. Assistant dock — refused resume card and cleanup layout

**Bugs:** `H1995` card behavior, `UI-5`. **BUILDER: SOL.** Independent commits. Shared AG-UI transport and usage accounting are outside this sheet.

The relay answers an already-claimed exchange with success even after its resume was refused. The cleanup panel also opens inside the same constrained header flex item as its trigger, taking space from the title.

**Tests first.** In Tovu `apps/admin/src/lib/__tests__/assistant-transport.ag-ui.approvals.unit.test.ts`, extend “an expired resume shows the plain refusal once.” Assert both **sequential** calls return `isError: true` and `Answer not sent.`, with one resume POST, one dock error, and no fallback call while the durable exchange remains registered. Mutation `claimed-refusal-reports-sent` restores unconditional success. For layout, add “the cleanup panel is anchored to the dock header and its controls can wrap” in `apps/admin/src/__tests__/unit/chat-pane-overflow-css.unit.test.ts` using the existing CSS declaration reader. Mutation `cleanup-panel-participates-in-header-flex` drops the panel positioning.

**Fix and order.** In Tovu `apps/admin/src/lib/ag-ui-approval-relay.ts`, make `resumeParked`’s already-claimed branch return failure for the existing refused state. Keep the one-use claim, duplicate-success behavior for successful resumes, error delivery, turn cleanup and routing for unrelated cards unchanged. This file remains Tovu-owned on `tv-adm-dom2`. For layout, use Tovu `apps/admin/src/styles/assistant.css` and the existing `ChatCleanupPanel.tsx` classes. Anchor the open panel to the dock’s positioned `.jini-chat-pane__header`, with the same horizontal inset pattern as `.jini-conv-menu`. Let its controls wrap and bound its width to the dock. Only the trigger occupies the header flex row. The shared markup is in Jini `packages/admin/src/shell/components/AssistantDock/DockHeader.tsx`, with the Tovu accessory bound by `DockCleanupHeader.tsx`. Neither needs a markup change.

**Real app check.** Let a real parked approval expire, answer twice, and verify neither click claims success and the dock reports expiration once. At 846 px, open Clean up chats with a multi-word title. Check the title is no longer squeezed to one character when the panel opens and all controls are visible and keyboard reachable.

## 8. Storage — unambiguous labels and browser title

**Bug:** `UI-4`. **BUILDER: SOL.**

Tovu’s `toClasses` appends link labels even when they repeat the category, and maps WAL and SHM to the same words. The shell’s static `Tovu Admin` title is never overridden on Storage.

**Tests first.** In Tovu `apps/admin/src/features/storage/__tests__/Storage.unit.test.tsx`, add “Storage names its tab and distinguishes categories without repeating destinations.” Use a report containing content DB, screenshots, WAL and SHM. Assert four distinct category labels, the separate navigation links still present, and `Storage — Tovu Admin` while mounted with the previous title restored on unmount. Mutations `storage-parentheticals-restored`, `storage-sidecars-same-label`, and `storage-title-never-set` each break the corresponding assertion.

**Fix and order.** In Tovu `apps/admin/src/features/storage/Storage.tsx`, remove the redundant category association for the Database and Screenshots links, keeping the links. In `hooks/use-storage.hooks.ts` and `storage-i18n.ts`, use distinct localized labels for the write-ahead log and shared-memory files, keeping IDs, bytes and classes intact. Add a required `setDocumentTitle({ title }, _optional = {})` dependency to `StorageScreen` that returns cleanup. Use React’s effect lifecycle there and bind the browser read/write and restoration at the Tovu `Storage` wrapper. Keep `apps/admin/index.html` as the default. The measured list already renders through Jini `packages/admin/src/screens/storage/StoragePanel.tsx`, so no shared change. `tv-w3-p11restx` adds a separate desktop Storage sheet, not a replacement for this route.

**Real browser check.** Open Storage, follow Database, then go Back. Check browser title, category labels and both destination links. The already-fixed Storage report 404 is not part of this sheet.

## 9. Source Control — held GitHub publisher rename

**Bug:** `H2179` / `UI-3`. **BUILDER: SOL for verified copy and packaged check.** If the installed copy fails a provenance check, recovery is owner-assisted, not an automatic overwrite.

GitHub is already in `RENAMED_TO_JINI`. `C12-seed-upgrade-missing-ids` added Calendly and Shopify and is not this failure. The known held cases preserve a pre-rename package whose contributions the current build refuses, but the boot line incorrectly promises it still works. The owner site’s exact hold reason has not been established.

**Test first.** In Tovu `apps/website/src/server/runtime/boot/__tests__/bootstrap-reporting.unit.test.ts`, revise the existing publisher-ID outcome test to require one held line naming the reason, the possibility of unavailable contributions, and the Agent Plugins remedy. It must not promise the old copy works. Mutation `held-plugin-keeps-working` restores the old sentence. Keep both existing ledger/edited refusal witnesses in `apps/website/src/features/source-control/__tests__/bundled-github-providers-boot.integration.test.ts`.

**Fix and order.** In `logBundledIdUpgrade` in Tovu `apps/website/src/server/runtime/boot/bootstrap.ts`, replace only “It keeps working” with “Some features from this copy may be unavailable.” Keep the reason and reinstall guidance. `tv-r2-arch` retains this log and its test. The Tovu `features/agent-plugins/bundled-id-upgrade.ts` adapter already delegates verification and rollback to Jini `packages/agent-plugins/src/site/bundled-id-upgrade.ts`. `tv-r3-w1b` moves generic provider collection from Tovu `features/source-control/provider-registry.ts` to Jini `packages/devops/src/source-control/site/bundled-provider-registry.ts` on `r3-w1bj`, but keeps the pre-rename descriptor refusal in Tovu. No verifier, registry, loader, rename-map or seed changes in this sheet.

**Required packaged check.** On a disposable copy of the affected site, inspect the installed GitHub manifest ID and digest, the bundled-digest ledger entry, and the held boot line. Check that the packaged replacement identifies as `jini/github` and has `jini-source-control.json`. If the old copy is held, preserve it before following the Agent Plugins reinstall remedy. Restart, verify that Source Control lists GitHub and opens its provider flow, and confirm the owner’s existing credentials and settings are still available. If an unchanged copy with matching ledger and a valid canonical bundle still holds, stop and hand off the exact failed check. Do not weaken provenance checks to make this site pass.

The count excludes adjacent work from other lanes, including the External MCP allowlist and error disclosure, credential deletion, shared AG-UI transport and hook-only cleanup. The Roles conflict Reload control is outside the named fix set.
