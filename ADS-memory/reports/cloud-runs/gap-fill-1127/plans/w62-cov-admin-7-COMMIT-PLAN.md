# Admin coverage gap fill

Static author review only. Tests, builds, installs, typechecks, coverage and mutations were not run. Each entry names a proposed mutation to verify in the cloud.

## Routines

- Routines.test.tsx: formats calendar schedules with their local time and zone: $label → route the weekdays case to the daily label, or calculate the weekly weekday one day late.
- Routines.test.tsx: preserves unrecognized translation placeholders → replace the interpolation fallback with an empty string.
- Routines.test.tsx: sends encoded routine revisions through the selected admin base → omit expectedRevision, use the raw ID, or put the DELETE revision in its body.
- Routines.test.tsx: maps known service refusal %s to %s → map every HTTP 503 to desktop-only or remove an entry from REASON_TO_STATE.
- Routines.test.tsx: surfaces nested stale errors and malformed failures without mistaking them for refusals → read error details only at the top level or default a missing status to 503.
- Routines.test.tsx: does not mount the controller during a disabled rollout → remove the releaseEnabled guard or replace the host locale with English.
- Routines.test.tsx: shows loading, load failures, and refused service without enabling writes → render the ready actions for an unavailable view or suppress error IDs.
- Routines.test.tsx: changes only the routine selected in its row menu → use the first routine instead of the selected row, bypass confirmation, or treat delete as pause.
- Routines.test.tsx: keeps rejected edits open and closes the form after a successful retry → close the editor regardless of the save result.
- Routines.test.tsx: shows an empty ready list and sends a create draft without a source row → omit the ready empty state or send the draft as an update.
- Routines.test.tsx: does not treat an inherited JavaScript property name as a service refusal → regression already exposed by the current `in` check; an own-property check is required.

## Storage

- Storage.unit.test.tsx: uses the chosen base and sends preview and apply as distinct retention requests → put basePath outside options or always add the live grant fields.
- Storage.unit.test.tsx: localizes the bound screen and previews old screenshots before spending their grant → drop the locale during binding, bypass onPress, use days as milliseconds, or omit confirm: true on apply.
- Storage.unit.test.tsx: distinguishes a failed policy from an unmeasurable cleanup and labels a past preview → count unknown freed bytes as zero, drop failed policy messages, or render a past dry run as a live pass.
- use-screenshot-cleanup.unit.test.ts: reports a refused apply, discards its grant and resets to idle → leave the preview actionable after a rejected apply.

## Sites

- AllSitesTab.unit.test.tsx: reports an unsaved list preference without hiding the current cards → drop the saveError notice or substitute loadError.
- AllSitesTab.unit.test.tsx: uses a neutral tone for a host-specific status and toggles only the named pin → remove neutral fallback or bind every pin to atlas.
- SiteTrashTab.unit.test.tsx: treats a local snapshot from a host without a trash listing as empty → dereference snapshot.trash without the fallback.
- use-local-sites.unit.test.tsx: does not start restart polling when a warm switch returns a URL but the host has no opener → fall through to restart handling when a URL is returned without an opener.

## Skills

- skills-class-names.unit.test.tsx: selects the add panel from the empty state and delivers a GitHub proposal only on confirmation → wire the add link to the wrong tab or send Confirm to Cancel.
- skills-class-names.unit.test.tsx: lets the operator inspect, enable, and explicitly remove the installed skill → bypass remove confirmation, bind inspect to toggle, or drop the GitHub source.
- skills-class-names.unit.test.tsx: announces a loading list without showing the empty-state action → replace the loading predicate with the empty check.
- skills-class-names.unit.test.tsx: keeps translated text stable until the Skills locale changes → omit locale from the callback dependencies.
- skills-class-names.unit.test.tsx: loads skill tabs from the address and replaces history as navigation changes → push tab changes into history, or accept unknown tab IDs.
- skills-class-names.unit.test.tsx: shows an upload source and keeps a failed confirmation available without enabling busy buttons → print the wrong source or ignore install.busy.
- skill-drop.unit.test.tsx: leaves file-only ZIP drops for the normal attachment handler → capture ZIPs as skill folders.
- skill-drop.unit.test.tsx: walks nested and later directory batches and preserves each browser-relative path → stop after the first batch or drop path prefixes.
- skill-drop.unit.test.tsx: passes a captured ordinary folder to fallback with its snapshotted attachment metadata → lose the saved file entries or send every folder for installation.
- skill-drop.unit.test.tsx: keeps the host folder action when traversal exceeds the depth limit before identifying a skill → report a skill installation refusal instead of using the host fallback.
- skill-drop.unit.test.tsx: refuses to propose an identified skill when it contains a 257th file → move the count limit one file higher.
- skill-drop.unit.test.tsx: reports an unreadable entry: $message → silently skip an entry with a missing reader.
- skill-drop.unit.test.tsx: reports a failed installation proposal: $message → stop forwarding the proposal promise into the error handler, or show raw non-Error text.

## Settings

- ExternalMcpSharedChoice.unit.test.tsx: keeps the grant on a failed stop, then shows the stopped state after retry → clear the current grant on rejection or skip the reload after success.
- SettingsUi.hooks.unit.test.ts: replaces rather than pushes history when Settings first becomes a tab deep link → push every tab to history or omit the query.
- rules.unit.test.ts: takes built-in ownership only from the exact host flag → coerce the flag with Boolean().
- rules.unit.test.ts: offers sign-in only for OAuth rows with an explicitly non-connected status → treat missing OAuth status as disconnected or ignore the auth mode.
- rules.unit.test.ts: normalizes swatch codes but uses a custom name and retains unknown hex labels → remove lowercasing, reverse overlay priority, or omit the hex fallback.
- use-settings-active-tab-scroll.hooks.unit.test.tsx: uses the browser's phone media query when no viewport override is supplied → use a different media query or always treat the viewport as desktop.
- ExternalMcpToolsModal.unit.test.tsx: keeps filtered selection local, refuses destructive tools, and saves both permission lists → bulk-toggle hidden rows, allow destructive selection, miswire write to enable, or save only the allowlist.
- ExternalMcpToolsModal.unit.test.tsx: distinguishes a pending probe, an unreachable server, and a successful empty refresh → show the empty-list message on failure or stop Refresh from probing.
- ExternalMcpToolsModal.unit.test.tsx: locks both footer actions while saving, without swallowing the explicitly labeled close → make footer Cancel available during save or omit the modal's Close handler.
- ExternalMcpToolsModal.unit.test.tsx: keeps a quoted wrapper that is part of a tool's actual description → remove the leading anchor from the wrapper regex.
- use-external-mcp-oauth-connect.unit.test.tsx: finishes once on browser focus or a same-origin refusal when the popup is blocked → omit fallback popup opening or keep the callback listener active after focus.
- use-external-mcp-oauth-connect.unit.test.tsx: uses the complete device URI and clears poll timers after a provider refusal → prefer the incomplete URL, skip popup cleanup, or skip the poll error transition.
- use-external-mcp-oauth-connect.unit.test.tsx: does not reopen a provider flow when the operator cancels before the request answers → regression already present; the start continuation fails to check that its attempt is still current.

## Taxonomy

- taxonomy-api-binding.unit.test.ts: threads rename, confirm and assign inputs through the host request without changing targets → use the wrong HTTP verb or encoded target, omit the plan hash, or send both Trash requests as term.
- taxonomy-api-binding.unit.test.ts: gives created taxonomies and nested terms distinct IDs and records only successful creates → reuse the first ID, drop parentId, or record before validation.
- taxonomy-api-binding.unit.test.ts: returns distinct plan receipts with overlap details and can fail each merge stage independently → reuse the first receipt or ignore the stage-specific refusal.
- taxonomy-api-binding.unit.test.ts: reads back only the requested taxonomy changes and preserves a term when Trash reports children → ignore a blocker, rename a sibling, or leave deleted items in read results.
- taxonomy-api-binding.unit.test.ts: reads additive picker writes back in sorted order and preserves assignments when saving fails → turn assign into replace, ignore removals, or mutate before rejecting.
- Taxonomy.unit.test.tsx: distinguishes a held first load, a load refusal and an empty ready list → treat unresolved/failed lists as empty.
- Taxonomy.unit.test.tsx: validates new taxonomies and associates a new term with the parent selected in its own group → omit the hierarchy input, trim incorrectly, or discard the selected parent.
- Taxonomy.unit.test.tsx: keeps row menus independent of selection and scopes a blocked Trash response to its term → allow the menu trigger to select the row, use the wrong term ID, or show blockers for unrelated groups.
- Taxonomy.unit.test.tsx: navigates the detail with keyboard and clears it only after the selected taxonomy is confirmed for Trash → remove Enter activation, miswire Cancel, or delete the wrong entity.
- Taxonomy.unit.test.tsx: renames the selected term and performs the three-step merge using the shown plan and token → omit the refresh, lose the plan hash or overwrite the execution token.
- SettingsUiTabs.injection.test.tsx: gates settings on all slices, then shows the load and save failures separately → show tabs before settlement, or omit the dedicated load-error alert.
- SettingsUiTabs.injection.test.tsx: redirects only legacy tabs and treats an unsupported tab as uncontrolled → use the wrong legacy path, push instead of replace, or forward an invalid active ID.
- SettingsUiTabs.injection.test.tsx: preserves typed instructions, resets blank instructions and applies a notification patch without losing other preferences → ignore the incoming value, forward undefined to the slice, or replace the entire preferences object with the patch.
- SettingsUiTabs.injection.test.tsx: updates the BYOK slice without resetting the current execution mode or CLI → drop the spread of the existing execution config.
- Taxonomy.unit.test.tsx: keeps assigned terms in a filtered picker and saves the exact selection through the entry port → ignore the search text, hide an assigned term when it does not match, or skip the unassign call.
- Taxonomy.unit.test.tsx: selects an existing suggestion without creating a duplicate and keeps Enter inside the picker → forward suggestions to the wrong taxonomy or let Enter submit the outer editor.

## Additional Skills rules

- skills-class-names.unit.test.tsx: provides every Skills page key and preserves interpolation tokens across all admin locales → drop a locale row, empty a value, or remove a placeholder.
- skills-class-names.unit.test.tsx: discloses a string incident ID from the host error but not a malformed or foreign body → omit the trusted ID or accept any error-shaped object.
- skills-class-names.unit.test.tsx: prefers the structured removal error to the plain fallback and leaves a busy dialog non-actionable → render the legacy error first or enable the busy confirm button.
- skill-upload.unit.test.ts: rejects a sparse selection before attempting to read a missing first file → remove the missing-first-file check and return the wrong refusal.
- ExternalMcpSharedChoice.unit.test.tsx: reports a failed saved selection without treating the placeholder or the failure as a grant → treat selecting a saved ID as success even if the port rejects it.
- Storage.unit.test.tsx: never offers live cleanup for a stopped or all-failed preview and can retry from stopped → make stopped previews non-retryable or permit the live action without a measured policy.
- skill-drop.unit.test.tsx: enforces the aggregate byte limit even for a skill folder with only a few files → validate only per-file size or ignore total bytes.
- skills-class-names.unit.test.tsx: shows the page failure while disabling both upload routes during an active install → drop the page overlay or remove either addBusy guard.
