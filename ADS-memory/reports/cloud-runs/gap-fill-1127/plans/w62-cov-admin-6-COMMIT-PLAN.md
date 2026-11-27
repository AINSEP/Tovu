# Admin coverage gap-fill mutation plan

Expected red checks by source inspection only. No execution was authorized.

## packages/admin/src/screens/plugins/__tests__/plugins-rules.unit.test.ts

- explains exact and wildcard reservations and deduplicates peer conflicts → Remove Set deduplication or replace conflict.heldKey with conflict.key.
- keeps healthy details empty and distinguishes boot quarantine from repeated failures → Always render the consecutive-failures headline.
- shows the upgrade and full-access warning only for the reviewed coded package → Return preview.version for upgrades or always use the no-code warning.
- retains an omitted row with the reason instead of showing its bytes → Drop the file.omitted check or hardcode the unreadable notice.
- distinguishes loading, refusal, and a successfully read empty package → Prioritize the query error over retained data, or give a read failure role=status.
- selects the first displayed file rather than the first server entry → Use files[0] as the primary fallback in selectPackageFile.

## packages/admin/src/screens/plugins/__tests__/agent-plugin-rules.unit.test.ts

- translates each known lifecycle warning without changing its identifiers → Return the raw warning instead of the matching render result.
- identifies affected dependents and does not call an uploaded package bundled → Return copy before computing dependents or treat operator-installed as bundled.
- names the exact row and action in both states of its Downloaded control → Return the Enable verb regardless of plugin.enabled.
- offers update only for an operator-installed row with an installed digest → Remove the origin or nonempty digest requirement.

## packages/admin/src/screens/plugins/__tests__/plugins-visuals.unit.test.tsx

- the Downloaded and Marketplace tabs have distinct decorative glyphs at default and custom sizes → Replace storefront with package-check or drop the downloaded tray path.
- the package row glyph is a decorative package with the default row size → Change the package glyph to the check-mark tab icon or change its default size.

## packages/admin/src/screens/plugins/__tests__/rules-context.unit.test.tsx

- rejects a missing host rules provider with setup guidance → Return the null context rather than throwing the setup error.

## packages/admin/src/screens/plugins/__tests__/use-plugin-provider-settings.hooks.test.tsx

- saves the entered values and reads back the card (all three rows) → Remove value refresh/secret reset on save, or ignore failed appliesAt or the supplied message.
- cannot attach a key without both a saved key id and a host attachment port → Remove either attachment guard.
- merges the key attachment result over the reread (all three rows) → Spread fetched next last over usage, or ignore failed appliesAt or its supplied message.
- describes an attachment refusal without rereading or altering the saved card → Swallow the rejection without setting error, or reread settings before attaching the key.
- ignores a superseded settings read after switching plugin ids → Remove the live guard in the load success handler.

## packages/admin/src/screens/plugins/__tests__/use-plugin-package-files.hooks.unit.test.tsx

- never exposes a previous plugin's late listing under the current viewer → Drop pluginId from the cache key or omit selectFile from the returned controller.
- separates site and agent packages with the same id and displays a described read refusal → Use a fixed queryRoot or throw the raw failure instead of the localized rules message.

## packages/admin/src/screens/plugins/__tests__/use-agent-plugin-memory.hooks.unit.test.tsx

- loads the project note, protects unsaved edits, and saves a renamed note literally → Hydrate notes[0] instead of project.md, discard the dirty guard, or save the old entryPath.
- distinguishes a failed read from empty memory and blocks saves until hydrated → Show loading on read errors or display empty-state messages for a null listing.
- ignores a stale save after changing plugin (success and failure) → Delete the generation guard for the respective settlement branch or ignore the saving lock.
- retains the draft on a save refusal and can retry it → Clear text on error, lose the injected error description, or never release the save lock.

## packages/admin/src/screens/plugins/__tests__/use-agent-plugin-install.hooks.unit.test.tsx

- hashes the selected bytes once, forwards replacement and reports an off-by-default install → Remove locked.current from install guard, omit replace from the port payload, or omit translating warnings.
- validates selected and dropped archives before any hashing and resets file-scoped replacement → Remove archive extension/size/empty validation, change the maximum condition to >=, accept multi-file drops, omit the picker click, or remove setReplace(false) in choose.
- hands the selected folder to the bounded zipper and clears a previously selected archive when zipping fails → Stop forwarding the cap, ignore the zipper busy flag, or omit setFile(null) from the folder failure.
- opens and closes update, sends the installed digest, and distinguishes unchanged bytes from an update → Drop useAgentPluginUpdate.onToggle, use the candidate SHA as expectedOldDigest, or collapse installedMessageKey to the fresh-install message.
- describes an Agent Plugin refusal (%#) (all rows) → Replace code lookup with HTTP status only, remove a corresponding status/operation fallback, or return server error text. The toString case catches inherited error-map lookup and is expected red until own-key lookup is used.

## packages/admin/src/screens/plugins/__tests__/use-plugin-install.hooks.unit.test.tsx

- requires a current review, then installs only the digest and inputs the operator reviewed → Do not invalidate review on replace/cancel, send a digest other than reviewed.digest, or show completion before onInstalled resolves.
- discards a superseded review (resolve and reject) and keeps installation locked until it settles → Remove reviewSource's generation check, perform's rejection generation check, or canRun's lock check.
- does not publish stale success when the source changes during install or its reload → Remove either of installReviewed's checks after an await.
- rejects oversized input but routes dropped and folder-zipped archives through preview → Omit the upload size guard, picker click or zipper busy guard, or stop propagating the zipped file/folder failure.
- localizes a failed preview (%#) and leaves no reviewed install (all rows) → Replace mapped code/status reporting with the generic error or allow install without review. The toString case is expected red until own-key lookup is used.
- clears consent on an install failure and requires a new review before retrying → Keep the old preview after the upload fails, or reuse the first digest after retry review.

## packages/admin/src/screens/plugins/__tests__/use-plugins.hooks.unit.test.tsx

- keeps expansion, inspection and settings scoped to the chosen ids through a bus refresh → Capture the row object rather than its id, omit resource-specific reload, or clear the full expansion set when collapsing one id.
- keeps the other row busy when toggle/remove settles first (both rows) → Unconditionally clear rowSavingId in the corresponding finally block or delete the pending row guard.
- requires explicit confirmation and refreshes the list after removing the selected row → Call uninstall from request/cancel, retain pendingRemoveId after confirm, or skip refresh.
- distinguishes failed writes from failed refresh and recovers after a matching content event → Attribute a refetch rejection to rowError or use the same fallback copy for remove and list.
- reloads authoritative rows after accepting a newly installed package → Replace the onInstalled reload callback with a no-op.

## packages/admin/src/screens/plugins/__tests__/plugin-interactions.hooks.unit.test.tsx

- follows URL tab changes and replaces history with only supported agent-plugin tabs → Delete the resolved-tab synchronization, navigate with raw next, or switch to push navigation.
- explains the lock on hover, dismisses it with Escape and follows only on activation → Swallow Escape rather than delegating or forward Enter/Space to the ordinary pin handler.
- uses the tip state at pointer-down so the first touch explains and the second follows → Delete the pointerdown registration or always route the first touch to onFollow.
- traps Tab in the named removal dialog and removes its Escape listener when closed → Remove useFocusTrap, drop the injected translator, or omit the key guard/listener cleanup.
- builds unlocalized removal copy when the host omits a translator → Pass an empty name to the copy builder when t is absent.
- scrolls and focuses only the deep-linked row's current summary → Ignore focused, omit the local summary focus, or change the scroll alignment.

## packages/admin/src/screens/plugins/__tests__/plugins-i18n.unit.test.ts

- has a complete nonblank memory dictionary in each supported admin locale → Remove a locale or memory entry, blank a translation, or introduce an unmatched interpolation slot.
- uses the locale's save outcome and falls back to shared or English copy → Bind createDictionaryTranslator with an empty feature or common dictionary.

## packages/admin/src/screens/providers/__tests__/providers-i18n.unit.test.ts

- keeps a complete nonblank Integrations dictionary and binds restart copy for every locale → Delete a locale, remove an entry, or pass raw PROVIDERS_DICT without binding the product name.
- prefers provider copy over common copy and falls back to the host and source text on misses → Drop commonDictionary from createDictionaryTranslator.

## packages/admin/src/screens/providers/__tests__/always-allow-rules.unit.test.ts

- sorts by roster label, groups by server and gives colliding tool slugs distinct handles → Sort by serverId, remove either label fallback, or omit deduplication of revoke handles.
- formats granted dates for the viewer and preserves an unparseable timestamp → Ignore locale or call toLocaleDateString even on an invalid date.

## packages/admin/src/screens/providers/__tests__/AlwaysAllowPanel.unit.test.tsx

- hides just the accepted revoke (removed and already absent) while waiting for the refreshed approvals → Remove the optimistic revoked filter, ignore the 404 recovery, swap port ids, or never clear the filter after a fresh read.
- keeps the permission visible on a real revoke failure (%#) and clears the error on retry (all rows) → Treat non-404 as removed or fail to release pendingKey or clear revokeError on retry.
- recovers its first read on window focus and leaves visible approvals alone on a later refresh failure → Disable refetchOnWindowFocus or show loadError when cached approvals exist.
- uses unambiguous revoke row keys even for names containing a separator → Use a simple slash-joined key.

## packages/admin/src/screens/providers/__tests__/Providers.unit.test.tsx

- switches from a clean External MCP tab to the Always allow deep link without adding a history entry → Always compute the restart label, omit the AlwaysAllow body, or push instead of replacing in navigateProvidersTab.

## packages/admin/src/screens/routines/__tests__/Routines.test.tsx

- creates a routine from labelled fields, keeping the prompt and normalizing default agent/model values → Stop trimming name/agent, persist a blank model string, or ignore the schedule picker's change.
- edits the row with a nondefault model and does not submit again on Cancel → Drop the edited model value or wire Cancel to submit rather than onCancel.
- reports availability separately from failures and keeps loaded rows through a transient read error → Flatten unavailable to ready or erase prior ready rows in the failure handler.
- stops polling while hidden and drops a stale read (success and failure) → Omit visibility cleanup/interval guard or accept stale results, which would replace the unavailable state with a different refusal or failure.
- sends the displayed delete revision, then lets the operator dismiss a stale deletion notice → Use the wrong revision or stale notice key, or make dismissNotice a no-op.
- uses create for a new draft and update with the displayed revision for an edit → Use create for edit too, or drop expectedRevision from the update.

## packages/admin/src/screens/plugins/__tests__/plugins-rules.unit.test.ts

- keeps a saved secret write-only while honoring the host validation when an alternative is edited → Treat the kept saved secret as missing or skip host validation after the user entered a replacement.
- retains the first readable row when a malformed path cannot appear in the tree → Drop the explicit files[0] fallback after the tree cannot place a path.

## packages/admin/src/screens/plugins/__tests__/use-agent-plugin-memory.hooks.unit.test.tsx

- keeps the editor disabled and exposes a status if a successful read has malformed notes → Swallow the draft hydration error without setting the operator-visible load status.
