# Admin coverage gap fill

Static mutation oracles for the cloud handoff. No mutations, tests, builds, type checks, or coverage runs were executed locally.

- `apps/admin/src/admin-themes/__tests__/admin-themes.unit.test.ts`: **rejects an empty admin theme registry with a configuration diagnostic** → remove the explicit empty-registry throw.
- `apps/admin/src/components/AssistantDock/__tests__/chat-cleanup.unit.test.tsx`: **translates the fallback for an unfamiliar cleanup retention reason** → replace `?? "Not checked"` with `?? reason`.
- `apps/admin/src/components/AssistantDock/__tests__/chat-cleanup.unit.test.tsx`: **keeps a non-actionable cleanup button accessible without an expanded state** → default missing `aria-expanded` to `false`, incorrectly turning a plain button into a disclosure control.
- `apps/admin/src/features/media/__tests__/upload-size-copy.unit.test.tsx`: **does not guess a size ceiling for a typed refusal with no response body** → use `error.body?.["limitBytes"] ?? MAX_UPLOAD_BYTES`.
- `apps/admin/src/features/storage/__tests__/storage-i18n.unit.test.ts`: **rejects a truncated translation row before it can ship missing labels** → delete the row-length guard.
- `apps/admin/src/features/storage/__tests__/storage-i18n.unit.test.ts`: **publishes nonempty Storage labels for every source key in each admin locale** → omit the last key from the zip or replace the French Storage label with an empty string.
- `apps/admin/src/features/ai-assistant/__tests__/VisitorAssistantTabs.unit.test.tsx`: **merges visitor-tool copy without losing a base-only locale or overriding shared copy** → build the locale set from `dictionary` alone or spread it after `base`.
- `apps/admin/src/features/fs-files/api/__tests__/folder-drop-deps.unit.test.tsx`: **keeps the server's custom-root failure code without treating non-text payloads as diagnostics** → coerce `body.error` to a string instead of checking its type.
- `apps/admin/src/features/workspace/__tests__/workspace-dependencies.hooks.unit.test.ts`: **merges a workspace patch into the saved fake workspace without dropping untouched fields** → swap the spread order or return the updated record without persisting it.
- `apps/admin/src/features/auth/__tests__/use-login.hooks.unit.test.ts`: **sends the MFA proof and code together to the sign-in completion endpoint** → replace the forwarded OTP with an empty string.
- `apps/admin/src/features/ai-assistant/__tests__/assistant-daemon-restart-dependencies.unit.test.ts`: **keeps the readiness failure's diagnostic and clears it after a successful manual check** → return the generic fallback from the wired describeError instead of preserving the diagnostic.
- `apps/admin/src/components/__tests__/EmbedInsertControl.hooks.unit.test.tsx`: **binds embed control copy to the caller's locale and keeps an unknown key readable** → replace the supplied locale with `"en"` in the bound translator.
- `apps/admin/src/features/sites/__tests__/use-desktop-import.hooks.unit.test.tsx`: **uses the real preload property when no import bridge is injected** → return null from the implicit window branch of getImportHandoffPort, or default useDesktopImport to no bridge.
- `apps/admin/src/features/routines/__tests__/use-conversation-deep-link.test.tsx`: **encodes a conversation id as a single query value in the assistant link** → interpolate the raw id instead of encoding it.
- `apps/admin/src/features/sites/__tests__/site-export-error.unit.test.ts`: **uses safe host copy for missing or malformed export diagnostics** → admit non-string failure fields instead of falling back to host copy.
- `apps/admin/src/features/sites/__tests__/use-site-list-prefs.hooks.unit.test.ts`: **reads the owner's saved list choices and writes only the changed personal row** → change `sitesList` to a different key or save with `scope: "site"`.
- `apps/admin/src/features/sites/__tests__/use-site-list-prefs.hooks.unit.test.ts`: **shows a denied read without overwriting the owner's unseen saved choices** → use `String(error)` as display copy instead of the host API error describer.
- `apps/admin/src/components/AssistantDock/__tests__/use-assistant-runtime-preferences.hooks.unit.test.ts`: **writes only changed runtime preferences at user scope and reads them back** → drop the ledger save or forward `scope: "site"`.
- `apps/admin/src/components/AssistantDock/__tests__/use-assistant-runtime-preferences.hooks.unit.test.ts`: **refreshes runtime preferences only for their namespace or an unscoped event** → notify for every scope, skip unscoped events, or fail to dispose the listener.
- `apps/admin/src/features/security/hooks/__tests__/use-copy-keys.unit.test.tsx`: **invalidates only access tokens after a shared key is granted** → publish an unscoped refresh instead of targeting access tokens.
- `apps/admin/src/features/routines/__tests__/use-conversation-deep-link.test.tsx`: **admits only ids present in the signed-in conversation list** → replace exact equality with prefix matching, or accept any id when the response is nonempty.
- `apps/admin/src/features/sites/__tests__/sites-config.unit.test.tsx`: **edits extra folders and database placement, then shows the saved settings** → pass a fixed index to removal or omit the database select change handler.
- `apps/admin/src/features/sites/__tests__/sites-config.unit.test.tsx`: **offers each sync remedy separately and explains the new-database safety change** → wire both buttons to useAppData, or always show the in-site safety warning.
- `apps/admin/src/features/sites/__tests__/sites-config.unit.test.tsx`: **shows why environment-pinned folders cannot be edited or moved** → remove the home override guard from the local-home remedy or the root override guard from the add button.
- `apps/admin/src/features/sites/__tests__/sites-config.unit.test.tsx`: **keeps configuration load errors visible inside and outside settings and disables Save** → display the closed alert inside the open dialog too, or enable Save before a config exists.
- `apps/admin/src/features/routines/__tests__/Routines.test.tsx`: **refreshes the production Routines screen on focus and at the poll interval only while mounted** → Replace the runtime request prefix, skip the window focus listener or 30-second poll, or fail to remove either on unmount.
- `apps/admin/src/features/security/__tests__/RecoveryCodesCard.unit.test.tsx`: **downloads the complete recovery kit under the host filename, then clears it from the page** → drop the anchor click, change the download filename, omit URL revocation, or clear before saving.
- `apps/admin/src/features/media/__tests__/media-dependencies.unit.test.ts`: **limits deep-linked results to the requested item without narrowing the tab counts** → return the whole tab when a specific itemId was requested, or compute counts from only the selected result.
- `apps/admin/src/features/plugins/__tests__/plugin-ports.unit.test.ts`: **preserves the request and result for $method $path** → redirect agent list to standard plugins, invert agent enablement, lose the files id, replace provider get/save with the other verb, or invert the project key use flag.
- `apps/admin/src/features/posts/__tests__/Posts.unit.test.tsx`: **links a post title to its editor and sends Edit to the same route through the admin router** → route the edit action to `/pages/` or the native link to `/posts/` without the admin prefix.
- `apps/admin/src/features/email/__tests__/EmailTemplateEditor.unit.test.tsx`: **loads the requested template through the production editor panel** → replace the route's id with a constant or an empty id.
- `apps/admin/src/features/library/__tests__/Library.unit.test.tsx`: **renames, previews and trashes the intended document through the live Library port** → forward the wrong document id in any of the three adapters.
- `apps/admin/src/features/sites/__tests__/site-transfer-tabs.unit.test.tsx`: **uses the edited desktop website address when handing it to Tovu** → drop its input onChange handler or save a fixed address.
- `apps/admin/src/features/sites/__tests__/use-site-transfer.hooks.unit.test.tsx`: **keeps the export id scoped to the password reveal POST** → fail to encode the share id or use the unrelated download endpoint.
- `apps/admin/src/features/sites/__tests__/use-site-transfer.hooks.unit.test.tsx`: **refuses an unexpected implicit download in the fake transfer port** → change the fake default into a silent no-op.
- `apps/admin/src/features/themes/__tests__/use-held-back-themes.hooks.unit.test.tsx`: **reads and retries the real held-back themes list through the wired hook** → bind the fake rather than live port or skip the retry read.
- `apps/admin/src/features/storage/__tests__/Storage.unit.test.tsx`: **reports a failed storage read with safe copy and diagnostic class rather than the raw message** → suppress logging or pass the raw error into console.error instead of its safe classification.
- `apps/admin/src/features/recovery/__tests__/use-recovery.unit.test.ts`: **reports a recovery failure using its class rather than the underlying storage message** → log the raw error object, exposing its private message.
- `apps/admin/src/__tests__/unit/app-shell-chrome.unit.test.tsx`: **announces a missing conversation from the assistant URL while preserving its other query parameters** → drop the dock's notify callback or substitute nonlocalized text.
- `apps/admin/src/__tests__/unit/app-shell-chrome.unit.test.tsx`: **does not apply the assistant conversation query on an unrelated panel** → pass the parsed conversation query to the dock for all panels.
- `apps/admin/src/__tests__/unit/app-hooks-admin-webmcp.unit.test.tsx`: **forwards a bridge event's application error to the frontend-session logger** → drop its onError handler or log at the wrong level.
- `apps/admin/src/__tests__/unit/app-hooks-admin-webmcp.unit.test.tsx`: **names the page capability whose browser registration failed** → drop the page registration error handler or omit the page capability name.
- `apps/admin/src/features/ai-assistant/__tests__/VisitorToolsPanel.unit.test.tsx`: **reads the live visitor policy, refetches an exact revision conflict, and explains an ordinary refusal** → treat all ApiErrors as conflicts, change the conflict code, or use generic error copy for the ordinary refusal.
- `apps/admin/src/features/security/hooks/__tests__/access-tokens-dependencies.unit.test.ts`: **stops using the chosen project key without changing the returned usage record** → forward `use: true` irrespective of the request.
- `apps/admin/src/features/security/hooks/__tests__/access-tokens-dependencies.unit.test.ts`: **fails loudly when a fake Access Tokens test did not provision project key use** → silently resolve the unstubbed operation.
- `apps/admin/src/features/settings/hooks/__tests__/use-settings-ui.ledger.unit.test.ts`: **%s refreshes the execution model without erasing a typed, unsaved key** → remove the bound reconcileRefresh function from either mount, dropping the draft key.
- `apps/admin/src/features/settings/hooks/__tests__/use-settings-ui.ledger.unit.test.ts`: **persists the new instructions at workspace scope and language at user scope** → swap `next`/`previous` in either save adapter, causing missing writes.
- `apps/admin/src/components/AssistantDock/__tests__/use-dock-renderer-registry.hooks.unit.test.tsx`: **routes a card's in-app link to an isolated tab and refuses non-HTTPS external links** → drop the card's onOpenLink prop, pass a foreign origin, or omit noopener/noreferrer from window.open.
- `apps/admin/src/features/sites/__tests__/SiteExportTab.static.unit.test.tsx`: **keeps the export toggle in sync when the browser dismisses the native picker** → omit onToggle or treat the closed notification as open.
- `apps/admin/src/features/sites/__tests__/use-desktop-import.hooks.unit.test.tsx`: **preserves a native bridge rejection when it is delivered as a string** → read `.message` unconditionally so the refusal disappears.
- `apps/admin/src/features/sites/__tests__/use-live-import-site.hooks.unit.test.tsx`: **does not open a running site until that exact site advertises its admin address** → accept any running record before it advertises its address, or take the first local site.
- `apps/admin/src/features/sites/__tests__/use-live-import-site.hooks.unit.test.tsx`: **uses plain make-site copy when the create rejection has no server diagnostic** → expose the arbitrary rejection string instead of safe product copy.
- `apps/admin/src/features/sites/__tests__/SiteExportTab.expiry.unit.test.tsx`: **does not dismiss the expiry notice for a different export after acknowledging one** → remove the isExpiredShare guard and overwrite the dismissed id with the active export.
- `apps/admin/src/features/plugins/__tests__/use-agent-plugin-details-modal.hooks.unit.test.ts`: **loads an installed agent package through the wired file viewer** → use the standard Plugins files port or forward the wrong plugin id.
- `apps/admin/src/features/plugins/__tests__/plugin-provider-settings.unit.test.tsx`: **loads and saves the chosen provider card through the wired settings hook** → substitute the wrong plugin identifier or ports, preventing the real settings card from loading and saving.
- `apps/admin/src/hooks/__tests__/assistant-chats-dependencies.unit.test.ts`: **binds the real chat request for $method $path $body** → lose the edited title/id, invert the requested pin, swap the preview cut-off, drop the preview token, or lose either selected id.
- `apps/admin/src/features/posts/__tests__/use-post-editor.hooks.unit.test.tsx`: **inserts a dropped link as an image at the resolved drop position (coordinates available: %s)** → always insert at the selection instead of the coordinates, or drop the selection fallback.
- `apps/admin/src/features/posts/__tests__/use-post-editor.hooks.unit.test.tsx`: **leaves the post unsavable and preserves the server refusal when applying the fetched body fails** → classify the host ApiError as untyped, replacing the useful refusal with the generic load message.
- `apps/admin/src/features/sites/__tests__/site-transfer-credential-warnings.unit.test.tsx`: **counts affected import files once and lists each credential kind once per file** → count warning records instead of paths, or append duplicate credential types.
- `apps/admin/src/features/sites/__tests__/sites-i18n.unit.test.ts`: **preserves the site-name placeholder in the import password prompt in every locale** → remove `{name}` from any localized import password prompt.
- `apps/admin/src/components/AssistantDock/__tests__/chat-cleanup.unit.test.tsx`: **uses the generic retention label even when an unfamiliar reason names an object property** → ordinary object lookup admits inherited names. Use Object.hasOwn or a Map to preserve the unknown-reason fallback.
- `apps/admin/src/features/sites/__tests__/use-site-transfer.hooks.unit.test.tsx`: **keeps only a usable 503 explanation for an unavailable import** → accept any API status or return an empty 503 message instead of null.
- `apps/admin/src/features/sites/__tests__/use-site-transfer.hooks.unit.test.tsx`: **does not prefill a non-website URL from the Import hand-off** → return the query value without the web-address check.
- `apps/admin/src/features/sites/__tests__/use-sites.hooks.unit.test.tsx`: **does not request the sidebar's site list until it is enabled** → remove the forwarded enabled option to useSitesSnapshot.
- `apps/admin/src/features/sites/__tests__/use-sites.hooks.unit.test.tsx`: **opens the selected site's own admin address through the browser** → pass the host's current URL to location.assign instead of the requested site.
- `apps/admin/src/features/sites/__tests__/use-sites.hooks.unit.test.tsx`: **the wired sites hook releases Create after a malformed success and accepts the next valid reply** → remove the post-processing diagnostic or leave the create lock held on its exception.
- `apps/admin/src/features/themes/__tests__/use-held-back-themes.hooks.unit.test.tsx`: **dismisses the restore confirmation without losing the refreshed list** → remove `setRestoredNotice(null)` from the dismissal action.
- `apps/admin/src/features/ai-assistant/__tests__/use-admin-subagents.hooks.unit.test.tsx`: **uses the runtime id for confirmation when an agent has no display record** → substitute another agent's name or skip the confirmation when t is omitted.
- `apps/admin/src/features/email/__tests__/email-hooks-host.unit.test.ts`: **keeps a provider refusal and a sender denial distinct in the production hooks** → swap the bound clients or stop supplying the host ApiError class to either hook.
- `apps/admin/src/features/plugins/__tests__/AgentPlugins.unit.test.tsx`: **opens the clicked plugin's files through the production Agent Plugins surface** → omit PackageFilesModal from the kit or fail to forward the inspected plugin props.
- `apps/admin/src/features/plugins/__tests__/Plugins.unit.test.tsx`: **replaces the current location when switching production Plugin tabs** → drop `{ replace: true }`, or navigate to the pre-migration `/plugins` URL.
- `apps/admin/src/features/publish-content/__tests__/publish-content-L057.characterization.unit.test.tsx`: **arms production publish confirmation only after the monotonic delay** → replace performance.now with a fixed number or drop the clock binding.
- `apps/admin/src/components/AssistantDock/__tests__/assistant-dock-bindings.unit.test.tsx`: **probes saved dock attachments through the current browser fetch and restores only live ones** → capture fetch at module initialization or use the download endpoint rather than the HEAD probe endpoint.
- `apps/admin/src/features/import-export/__tests__/ImportExport.unit.test.tsx`: **opens Export when the host is mounted without any tab prop** → insert `tabId: "import"` for the omitted-tab branch.
- `apps/admin/src/features/sites/__tests__/SiteExportTab.static.unit.test.tsx`: **keeps static export unavailable when the server's active theme is not in its export roster** → silently pick the first installed theme instead of requiring a choice.
- `apps/admin/src/features/sites/__tests__/site-transfer-credential-warnings.unit.test.tsx`: **explains a download refusal with no server message without attempting the download** → drop the translated Download failed fallback.
- `apps/admin/src/features/content-analysis/__tests__/content-analysis-port.unit.test.ts`: **preserves the browser's request cancellation instead of translating it into a plugin failure** → convert even non-ApiError rejections into AdminApiError, losing the original AbortError.
- `apps/admin/src/features/settings/hooks/__tests__/use-external-mcp-admissions.unit.test.tsx`: **reports a malformed restart success without claiming the assistant restarted** → remove the host reportRestartFailure separately from the ordinary request error handling.
- `apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts`: **replaces an id-based bookmark with the wired page slug, then sends Back to the pages list** → ignore replace for the slug redirect or fail to forward an ordinary Back navigation without options.
- `apps/admin/src/features/sites/__tests__/use-site-transfer.hooks.unit.test.tsx`: **stops polling an export job whose initial response arrives after the tab has closed** → remove the alive predicate from the poll loop, producing a second POST after unmount.
- `apps/admin/src/features/themes/__tests__/use-theme-explore-file-groups.hooks.unit.test.ts`: **rejects an invalid collapsed limit before adding a missing highlighted file** → remove the highlighted-index guard, appending undefined to the chips.
- `apps/admin/src/features/voice-input/hooks/__tests__/use-push-to-talk.hooks.unit.test.ts`: **keeps an unknown capture rejection out of the recording indicator's copy** → trust the `.message` on non-Error bridge payloads.
- `apps/admin/src/features/sites/__tests__/use-site-transfer.hooks.unit.test.tsx`: **withholds saved-key controls and skips its owner lookup until the authentication check settles** → remove the enabled guard and query the owner while the session is still checking.
- `apps/admin/src/features/storage/__tests__/Storage.unit.test.tsx`: **uses the browser clock for the 90-day screenshot preview cutoff without deleting** → replace Date.now with a constant, or turn preview into apply.
- `apps/admin/src/features/library/__tests__/library-size-copy.unit.test.tsx`: **preserves a non-size server refusal instead of telling the owner to shrink the file** → drop the `describeApiError` fallback or show upload ceiling copy for every API refusal.
- `apps/admin/src/features/sites/__tests__/Sites.unit.test.tsx`: **honors hidden sites from the signed-in owner's ledger when no list hook is injected** → mount a local-only preference hook instead of useWiredSiteListPrefs.
- `apps/admin/src/features/plugins/__tests__/use-agent-plugins.hooks.unit.test.ts`: **keeps a refused plugin disabled and translates the live binding's typed refusal** → make the host isApiError predicate always return false so the raw server message replaces Spanish copy.
- `apps/admin/src/features/sites/__tests__/SiteExportTab.secret.unit.test.tsx`: **keeps a revealed export password available when clipboard access fails and reports a successful retry** → Intentionally red on current Jini: copyPassword sets passwordError on failure but does not clear it on success. Preserve the expected cleared alert. A mutation dropping the error notice on failure also turns this test red.

## Test-file inventory

100 cases across 61 test files, counting parameterized rows separately.

| Test file under `apps/admin/src` | Added cases |
| --- | ---: |
| `__tests__/unit/app-hooks-admin-webmcp.unit.test.tsx` | 2 |
| `__tests__/unit/app-shell-chrome.unit.test.tsx` | 2 |
| `admin-themes/__tests__/admin-themes.unit.test.ts` | 1 |
| `components/AssistantDock/__tests__/assistant-dock-bindings.unit.test.tsx` | 1 |
| `components/AssistantDock/__tests__/chat-cleanup.unit.test.tsx` | 3 |
| `components/AssistantDock/__tests__/use-assistant-runtime-preferences.hooks.unit.test.ts` | 2 |
| `components/AssistantDock/__tests__/use-dock-renderer-registry.hooks.unit.test.tsx` | 1 |
| `components/__tests__/EmbedInsertControl.hooks.unit.test.tsx` | 1 |
| `features/ai-assistant/__tests__/VisitorAssistantTabs.unit.test.tsx` | 1 |
| `features/ai-assistant/__tests__/VisitorToolsPanel.unit.test.tsx` | 1 |
| `features/ai-assistant/__tests__/assistant-daemon-restart-dependencies.unit.test.ts` | 1 |
| `features/ai-assistant/__tests__/use-admin-subagents.hooks.unit.test.tsx` | 1 |
| `features/auth/__tests__/use-login.hooks.unit.test.ts` | 1 |
| `features/content-analysis/__tests__/content-analysis-port.unit.test.ts` | 1 |
| `features/email/__tests__/EmailTemplateEditor.unit.test.tsx` | 1 |
| `features/email/__tests__/email-hooks-host.unit.test.ts` | 1 |
| `features/fs-files/api/__tests__/folder-drop-deps.unit.test.tsx` | 1 |
| `features/import-export/__tests__/ImportExport.unit.test.tsx` | 1 |
| `features/library/__tests__/Library.unit.test.tsx` | 1 |
| `features/library/__tests__/library-size-copy.unit.test.tsx` | 1 |
| `features/media/__tests__/media-dependencies.unit.test.ts` | 1 |
| `features/media/__tests__/upload-size-copy.unit.test.tsx` | 1 |
| `features/pages/__tests__/use-page-editor.unit.test.ts` | 1 |
| `features/plugins/__tests__/AgentPlugins.unit.test.tsx` | 1 |
| `features/plugins/__tests__/Plugins.unit.test.tsx` | 1 |
| `features/plugins/__tests__/plugin-ports.unit.test.ts` | 6 |
| `features/plugins/__tests__/plugin-provider-settings.unit.test.tsx` | 1 |
| `features/plugins/__tests__/use-agent-plugin-details-modal.hooks.unit.test.ts` | 1 |
| `features/plugins/__tests__/use-agent-plugins.hooks.unit.test.ts` | 1 |
| `features/posts/__tests__/Posts.unit.test.tsx` | 1 |
| `features/posts/__tests__/use-post-editor.hooks.unit.test.tsx` | 3 |
| `features/publish-content/__tests__/publish-content-L057.characterization.unit.test.tsx` | 1 |
| `features/recovery/__tests__/use-recovery.unit.test.ts` | 1 |
| `features/routines/__tests__/Routines.test.tsx` | 1 |
| `features/routines/__tests__/use-conversation-deep-link.test.tsx` | 2 |
| `features/security/__tests__/RecoveryCodesCard.unit.test.tsx` | 1 |
| `features/security/hooks/__tests__/access-tokens-dependencies.unit.test.ts` | 2 |
| `features/security/hooks/__tests__/use-copy-keys.unit.test.tsx` | 1 |
| `features/settings/hooks/__tests__/use-external-mcp-admissions.unit.test.tsx` | 1 |
| `features/settings/hooks/__tests__/use-settings-ui.ledger.unit.test.ts` | 3 |
| `features/sites/__tests__/SiteExportTab.expiry.unit.test.tsx` | 1 |
| `features/sites/__tests__/SiteExportTab.secret.unit.test.tsx` | 1 |
| `features/sites/__tests__/SiteExportTab.static.unit.test.tsx` | 2 |
| `features/sites/__tests__/Sites.unit.test.tsx` | 1 |
| `features/sites/__tests__/site-export-error.unit.test.ts` | 1 |
| `features/sites/__tests__/site-transfer-credential-warnings.unit.test.tsx` | 2 |
| `features/sites/__tests__/site-transfer-tabs.unit.test.tsx` | 1 |
| `features/sites/__tests__/sites-config.unit.test.tsx` | 4 |
| `features/sites/__tests__/sites-i18n.unit.test.ts` | 1 |
| `features/sites/__tests__/use-desktop-import.hooks.unit.test.tsx` | 2 |
| `features/sites/__tests__/use-live-import-site.hooks.unit.test.tsx` | 2 |
| `features/sites/__tests__/use-site-list-prefs.hooks.unit.test.ts` | 2 |
| `features/sites/__tests__/use-site-transfer.hooks.unit.test.tsx` | 6 |
| `features/sites/__tests__/use-sites.hooks.unit.test.tsx` | 3 |
| `features/storage/__tests__/Storage.unit.test.tsx` | 2 |
| `features/storage/__tests__/storage-i18n.unit.test.ts` | 2 |
| `features/themes/__tests__/use-held-back-themes.hooks.unit.test.tsx` | 2 |
| `features/themes/__tests__/use-theme-explore-file-groups.hooks.unit.test.ts` | 1 |
| `features/voice-input/hooks/__tests__/use-push-to-talk.hooks.unit.test.ts` | 1 |
| `features/workspace/__tests__/workspace-dependencies.hooks.unit.test.ts` | 1 |
| `hooks/__tests__/assistant-chats-dependencies.unit.test.ts` | 6 |

## Intentionally red by static inspection

- `components/AssistantDock/chat-cleanup-copy.ts:51` — unknown reasons that match Object.prototype names do not use the generic fallback. Check ownership before indexing, or use a Map.
- Jini `packages/admin/src/sites/transfer/use-export-password.hooks.ts:68` — a successful clipboard retry leaves the earlier failure visible in Tovu. Set the error from the current result, including clearing it on success.

## Production targets exercised by new cases

74 target files. Cases that exercise more than one binding appear under each relevant source. Branch completion is not verified.

| Source under `apps/admin/src` | Added cases |
| --- | ---: |
| `App.chrome.tsx` | 1 |
| `App.hooks.ts` | 2 |
| `App.tsx` | 1 |
| `admin-themes/registry.ts` | 1 |
| `components/AssistantDock/assistant-runtime-preferences.adapter.ts` | 2 |
| `components/AssistantDock/chat-cleanup-copy.ts` | 2 |
| `components/AssistantDock/chat-cleanup-kit.tsx` | 1 |
| `components/AssistantDock/hooks/composer-files.hooks.ts` | 1 |
| `components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts` | 1 |
| `components/EmbedInsertControl/EmbedInsertControl.hooks.tsx` | 1 |
| `features/ai-assistant/hooks/assistant-daemon-restart-dependencies.hooks.ts` | 1 |
| `features/ai-assistant/hooks/use-admin-execution-mode.hooks.ts` | 1 |
| `features/ai-assistant/hooks/use-admin-subagents.hooks.ts` | 1 |
| `features/ai-assistant/hooks/visitor-tools-dependencies.hooks.ts` | 1 |
| `features/ai-assistant/visitor-tools-i18n.ts` | 1 |
| `features/auth/hooks/login-dependencies.hooks.ts` | 1 |
| `features/content-analysis/hooks/content-analysis-dependencies.hooks.ts` | 1 |
| `features/email/email-hooks-host.ts` | 1 |
| `features/email/email-panel.tsx` | 1 |
| `features/fs-files/api/fs-files-api.ts` | 1 |
| `features/import-export/ImportExport.tsx` | 1 |
| `features/library/hooks/library-dependencies.hooks.ts` | 1 |
| `features/library/hooks/use-wired-library.hooks.ts` | 1 |
| `features/media/hooks/media-dependencies.hooks.ts` | 1 |
| `features/media/upload-size-copy.ts` | 1 |
| `features/pages/hooks/use-page-editor.hooks.ts` | 1 |
| `features/plugins/AgentPlugins.tsx` | 1 |
| `features/plugins/Plugins.tsx` | 1 |
| `features/plugins/hooks/agent-plugins-dependencies.hooks.ts` | 3 |
| `features/plugins/hooks/plugins-dependencies.hooks.ts` | 3 |
| `features/plugins/hooks/use-agent-plugin-details-modal.hooks.ts` | 1 |
| `features/plugins/hooks/use-agent-plugins.hooks.ts` | 1 |
| `features/plugins/hooks/use-plugin-provider-settings.hooks.ts` | 1 |
| `features/posts/Posts.tsx` | 1 |
| `features/posts/hooks/use-loaded-post-apply.hooks.ts` | 1 |
| `features/posts/hooks/use-post-editor.hooks.ts` | 2 |
| `features/publish-content/hooks/use-publish-content-confirm.hooks.ts` | 1 |
| `features/recovery/hooks/recovery-dependencies.hooks.ts` | 1 |
| `features/routines/index.ts` | 1 |
| `features/routines/use-conversation-deep-link.ts` | 2 |
| `features/security/RecoveryCodesCard.hooks.ts` | 1 |
| `features/security/hooks/access-tokens-dependencies.hooks.ts` | 2 |
| `features/security/hooks/copy-keys-dependencies.hooks.ts` | 1 |
| `features/settings/hooks/use-external-mcp-admissions.hooks.ts` | 1 |
| `features/settings/hooks/use-settings-ui.hooks.ts` | 2 |
| `features/sites/CredentialWarnings.tsx` | 1 |
| `features/sites/SiteExportTab.tsx` | 1 |
| `features/sites/SiteImportTab.tsx` | 1 |
| `features/sites/Sites.tsx` | 1 |
| `features/sites/SitesHomeSetting.tsx` | 4 |
| `features/sites/StaticExportPicker.tsx` | 1 |
| `features/sites/hooks/site-export-actions.ts` | 1 |
| `features/sites/hooks/site-transfer-dependencies.hooks.ts` | 2 |
| `features/sites/hooks/site-transfer-rules.ts` | 2 |
| `features/sites/hooks/sites-dependencies.hooks.ts` | 2 |
| `features/sites/hooks/use-desktop-import.hooks.ts` | 2 |
| `features/sites/hooks/use-live-import-site.hooks.ts` | 2 |
| `features/sites/hooks/use-share-credential-gate.hooks.ts` | 1 |
| `features/sites/hooks/use-share-expiry.hooks.ts` | 1 |
| `features/sites/hooks/use-site-export-state.hooks.ts` | 2 |
| `features/sites/hooks/use-site-list-prefs.hooks.ts` | 2 |
| `features/sites/hooks/use-sites.hooks.ts` | 1 |
| `features/sites/hooks/use-static-export-selection.hooks.ts` | 1 |
| `features/sites/import-handoff-port.ts` | 1 |
| `features/sites/site-export-error.ts` | 1 |
| `features/sites/site-transfer-i18n.ts` | 1 |
| `features/storage/Storage.tsx` | 2 |
| `features/storage/storage-i18n.ts` | 2 |
| `features/themes/hooks/held-back-themes-dependencies.hooks.ts` | 1 |
| `features/themes/hooks/use-held-back-themes.hooks.ts` | 2 |
| `features/themes/hooks/use-theme-explore-file-groups.hooks.ts` | 1 |
| `features/voice-input/hooks/use-push-to-talk.hooks.ts` | 1 |
| `features/workspace/hooks/workspace-dependencies.hooks.ts` | 1 |
| `hooks/assistant-chats-dependencies.hooks.ts` | 6 |

## Reviewed without new cases

- `features/auth/auth-host-binding.tsx`: “keeps saved login passwords out of the recovery code, hidden and revealed” uses the real default host translator; “recovers using the code and new password without keeping either after success” uses the host recovery controller.
- `features/security/hooks/site-key-dependencies.hooks.ts`: “the wired controller loads the real API port and binds its translator to the saved locale” and “loads the preview first, confirms only on the exact phrase, then names the affected webhooks” exercise binding behavior. The remaining function counter was not located without detailed coverage.

## Proposed exceptions

- `features/ai-assistant/visitor-tools-i18n.ts:438`, `features/routines/routines-i18n.ts:305`, and `features/sites/site-transfer-i18n.ts:213,248,293,354,388,422`: initialization guards for malformed private locale rows. The public translations are tested for supported locales, key parity, and applicable placeholders; there is no runtime input or seam for a malformed row.
- `features/media/media-i18n.ts:76,83`: fallbacks for missing rows in closed, shipped locale tables. Existing tests cover all current media locale blocks, including product copy.
- `features/themes/theme-preview-refresh.ts:20`: the oldest entry cannot be absent after the Set's size exceeded 256. The actual eviction is tested in “evicts only the oldest revision after retaining 256 distinct refreshes.”

## Outstanding

No new case was added for branch or function counters in the following targets. They need the cloud coverage report with precise branch/function locations before additional scenarios can be distinguished from the existing suites.

- `admin-themes/use-admin-theme.hooks.ts`
- `features/collections/hooks/use-collection-entry-editor.hooks.ts`
- `features/menus/hooks/use-menu-editor.hooks.ts`
- `features/security/hooks/use-access-tokens.hooks.ts`
- `features/settings/AdminAppearance.tsx`
- `features/sites/hooks/use-site-import-state.hooks.ts`
- `features/themes/HeldBackThemes.tsx`
- `features/themes/ThemeExplore.tsx`
- `features/themes/Themes.tsx`
- `features/themes/hooks/use-theme-explore.hooks.ts`
- `features/users/hooks/use-wired-users.hooks.ts`

The two intentional red cases are retained. Test execution and coverage recalculation are deferred to the cloud run.
