# Admin coverage gap fill

Mutation oracles below were reviewed by inspection only. No tests, builds, installs, typechecks, coverage, or mutations were run.

## Observability

- observability-ports.unit.test.ts: reads the current status client → capture the GET method at construction, or stop calling sendObservabilityTestError.
- observability-ports.unit.test.ts: provides disabled-by-default fake status → ignore failWith or always return the default payload.
- observability-ports.unit.test.ts: forwards log filters → omit the limit when calling getServerLogs or return true despite clipboard refusal.
- observability-ports.unit.test.ts: keeps separate fake histories → record queries after the throw or share the copy array between ports.
- observability-visuals.unit.test.tsx: alert emits decorative SVG → hardcode the alert width instead of honoring size.
- recent-errors-rules.unit.test.ts: continues past a colon → return null for all whitespace-only tails or accept a cause containing an internal line terminator.
- observability-query.hooks.unit.test.tsx: loads status once → omit query.refetch after successful diagnostics or remove the sending guard.
- observability-query.hooks.unit.test.tsx: describes failed status and diagnostic calls → pass English instead of the localized load fallback or stop clearing testError on retry.
- observability-query.hooks.unit.test.tsx: does not refresh when there is no diagnostic action → remove the optional-port guard and attempt the send.
- observability-query.hooks.unit.test.tsx: never reads identity [builtin] → enable the query for the built-in adapter.
- observability-query.hooks.unit.test.tsx: never reads identity [null] → enable the query before an adapter is known.
- observability-query.hooks.unit.test.tsx: shows owner tab only after identity resolves [development=false] → make production tools interactive.
- observability-query.hooks.unit.test.tsx: shows owner tab only after identity resolves [development=true] → ignore development and always return readOnly.
- observability-query.hooks.unit.test.tsx: keeps TanStack tools hidden [scoped] → make any nonempty permissions list sufficient.
- observability-query.hooks.unit.test.tsx: keeps TanStack tools hidden [missing] → treat omitted effectivePermissions as a wildcard.
- observability-query.hooks.unit.test.tsx: keeps TanStack tools hidden [refused] → grant tooling despite a rejected identity read.
- observability-query.hooks.unit.test.tsx: requests only recent errors → change the window size, use earliest message in clipboard, or omit the timestamp fallback.
- observability-query.hooks.unit.test.tsx: reports log failure and refreshes → bypass the describer, hide fetching state, or fail to refetch.
- observability-panels.unit.test.tsx: shows a lazy cache loading state → drop the Suspense fallback or leave the interactive panel inert.
- observability-panels.unit.test.tsx: distinguishes loading/failure/capture off/empty → remove the capturing guard on the empty hint or ignore loading on Refresh.
- observability-panels.unit.test.tsx: keeps cached rows during refresh → replace cached rows with a spinner, bind Copy to the summary, or attach the toggle to the wrong detail.
- observability-panels.unit.test.tsx: loads tool gap metadata → show a native record's gap explanation, swallow the refresh failure, or fail to replace rows on successful refresh.

## Plugins

- plugins-api.unit.test.ts: reads provider settings → omit id encoding or remove the provider-settings path segment.
- plugins-api.unit.test.ts: PUTs settings exactly → drop the empty token or send a different HTTP verb.
- plugins-api.unit.test.ts: PATCHes activation [enabled=false] → hardcode enabled to true.
- plugins-api.unit.test.ts: PATCHes activation [enabled=true] → hardcode enabled to false.
- plugins-api.unit.test.ts: DELETEs only the requested plugin → use PATCH or use the workspace collection path.
- plugins-api.unit.test.ts: reads the files subresource → remove the /files suffix or change it to a write.
- composer-capabilities.unit.test.ts: distinguishes same-named skill and agent plugin → leave the colliding plugin unlabeled or collapse its entry onto the skill.
- agent-plugins-visuals.unit.test.tsx: delegates the right host glyph and size [installed] → alias the installed adapter to a different host glyph or hardcode size.
- agent-plugins-visuals.unit.test.tsx: delegates the right host glyph and size [marketplace] → alias the marketplace adapter to a different host glyph or hardcode size.
- agent-plugins-visuals.unit.test.tsx: delegates the right host glyph and size [package] → alias the package adapter to a different host glyph or hardcode size.
- agent-plugins-visuals.unit.test.tsx: delegates the right host glyph and size [trash] → alias the trash adapter to a different host glyph or hardcode size.
- agent-plugins-visuals.unit.test.tsx: honors decorative artwork sizes [upload] → hardcode the upload SVG size or drop aria-hidden.
- agent-plugins-visuals.unit.test.tsx: honors decorative artwork sizes [shield] → hardcode the shield SVG size or drop aria-hidden.
- agent-plugins-visuals.unit.test.tsx: honors decorative artwork sizes [rocket] → hardcode the rocket SVG size or drop aria-hidden.
- agent-plugins-visuals.unit.test.tsx: honors decorative artwork sizes [palette] → hardcode the palette SVG size or drop aria-hidden.
- agent-plugins-visuals.unit.test.tsx: honors decorative artwork sizes [plug] → hardcode the plug SVG size or drop aria-hidden.
- agent-plugins-visuals.unit.test.tsx: honors decorative artwork sizes [eye] → hardcode the eye SVG size or drop aria-hidden.
- agent-plugins-visuals.unit.test.tsx: honors decorative artwork sizes [lock] → hardcode the lock SVG size or drop aria-hidden.
- plugin-confirmation-and-fields.unit.test.tsx: enables directly but waits on disable → immediately toggle an enabled plugin, or keep a stale object instead of looking up the selected id.
- plugin-confirmation-and-fields.unit.test.tsx: names the disable target and dependencies → drop dependent warnings, default focus to Disable, or do not bind the focus trap.
- plugin-confirmation-and-fields.unit.test.tsx: turns off from Downloaded and detaches Escape → use Disable wording, cancel on any key, or omit listener cleanup.
- plugin-confirmation-and-fields.unit.test.tsx: discloses site-wide trash impact → discard the rule body or bind the destructive control to cancel.
- plugin-confirmation-and-fields.unit.test.tsx: offers custom editing when declared → forward the custom sentinel as a saved URL or keep custom input mounted after a listed option is picked.
- plugin-confirmation-and-fields.unit.test.tsx: opens a persisted custom choice → initialize custom state to false regardless of the stored value or always offer Custom.
- plugin-confirmation-and-fields.unit.test.tsx: displays plain versus masked input with saved exemption → render a secret as text or require replacing a saved secret.
- plugin-confirmation-and-fields.unit.test.tsx: provides empty choice model → remove the options default or suppress the selected value callback.
- plugin-install-panels.unit.test.tsx: installs a chosen Agent Plugin zip → disconnect replace/file handler, omit warnings, or label the successful plugin enabled.
- plugin-install-panels.unit.test.tsx: opens named update and renders refusal → mount the install-only controls in update mode, omit the old digest, or lose the error/retry wiring.
- plugin-install-panels.unit.test.tsx: reviews site ZIP and cancels consent → install without re-review, omit the conflict, or send a digest other than the reviewed one.
- plugin-install-panels.unit.test.tsx: submits the advanced server folder → remove Enter submission wiring or expose Install before preview succeeds.
- plugin-package-files.unit.test.tsx: selects nested files → pass only basename to selection, remove content key (retains wrap), or show Wrap for omitted content.
- plugin-package-files.unit.test.tsx: shows load failure and extra content → drop the supplied status role, header, or additional view.
- plugin-package-files.unit.test.tsx: rejects a selected file outside listing → delete the missing-handle diagnostic.
- plugin-package-files.unit.test.tsx: keeps same-id agent/site reads separate → use the default CMS cache root or send {id} to the agent endpoint.
- plugin-package-files.unit.test.tsx: updates popup title only on memory → ignore view changes, use the wrong translator, or keep memory copy after leaving.
- composer-skills.hooks.unit.test.tsx: replaces same skill id → append duplicate ids or clear all chips when one is removed.
- composer-skills.hooks.unit.test.tsx: ranks the leading query and ignores other editors → use a draft-wide slash match or consume sibling textarea edits.
- composer-skills.hooks.unit.test.tsx: commits text before composer Send → omit flushSync so the disabled Send button rejects the click.
- composer-skills.hooks.unit.test.tsx: respects programmatic restores → read only the stale captured shape in sendSkills or omit the refresh on selection changes.
- composer-skills.hooks.unit.test.tsx: does not seed or submit [disabled] → ignore that the textarea is disabled.
- composer-skills.hooks.unit.test.tsx: does not seed or submit [stopping] → include Stop in the idle Send selector.
- composer-skills.hooks.unit.test.tsx: does not seed or submit [no-handle] → invoke insertText on the missing handle.
- composer-skills.hooks.unit.test.tsx: does not seed or submit [no-frame] → seed even when the composer root is missing.
- composer-skills.hooks.unit.test.tsx: unavailable for empty skill selection → allow the empty selection in canSendSkills.
- agent-plugin-surface-frame.unit.test.tsx: initializes once and updates theme → post a late bootstrap to a new document, rebootstrap on second load, or never forward a changed scheme.
- agent-plugin-surface-frame.unit.test.tsx: reports bootstrap failure without posting → leave the frame open after rejection or process messages without a live frame.
- agent-plugin-surface-frame.unit.test.tsx: routes resize, links and action outcomes → forward hostSignIns into the frame, omit resize, accept HTTP/expired handoffs, or leak the server exception.
- agent-plugin-surface-frame.unit.test.tsx: never posts a late action result → use contentWindow directly after await instead of rechecking the current document.
- agent-plugin-surface-frame.unit.test.tsx: displays sandboxed frame and sign-in handoff → remove the sandbox/referrer attributes, ignore reported height, or leave the iframe up after failure.
- plugin-rows.unit.test.tsx: expands owner details → prefer description to summary, lose the detail disclosure connection, or wire Inspect to the enabled switch.
- plugin-rows.unit.test.tsx: keeps Soon locked before linked provider → prefer linked behavior, let a Soon row enable, or leak duplicate self-named skill chips.
- plugin-rows.unit.test.tsx: routes Downloaded action [enabled=false] → route Enable to onRemove or let the busy button run.
- plugin-rows.unit.test.tsx: routes Downloaded action [enabled=true] → route Turn off to onEnable or let the busy button run.
- plugin-rows.unit.test.tsx: opens the linked provider [enabled=false] → show Enabled even when the provider is off.
- plugin-rows.unit.test.tsx: opens the linked provider [enabled=true] → route to the agent plugin id instead of the encoded provider id.
- plugin-rows.unit.test.tsx: announces Untested → use the Soon warning or render a maturity control when there is no maturity tag.
- plugin-rows.unit.test.tsx: focuses deep-linked site plugin → attach focus to the wrong button, omit errors from the detail panel, or route Settings to Inspect.
- plugin-rows.unit.test.tsx: keeps healthy plugin facts readable → hide the facts for clean plugins or render Settings for rows without settings.
- agent-plugin-memory-panel.unit.test.tsx: disables editor until known listing → allow Save during loading or conflate an unknown list with an empty list.
- agent-plugin-memory-panel.unit.test.tsx: opens and saves a renamed note → bind the path to the text setter, route clicks to the wrong note, or keep notes selectable while saving.
- agent-plugins-kit.unit.test.tsx: distinguishes loading/list/toggle/empty → show the empty hint before loading finishes or treat a toggle refusal as a load failure.
- agent-plugins-kit.unit.test.tsx: switches tabs and confirms actions separately → filter disabled rows, drop the provided update port, bypass confirmation, or bind Downloaded Enable to remove.
- agent-plugins-kit.unit.test.tsx: opens eye and Manage with distinct views → omit loaded surfaces from onManage or show another row’s inspector.
- agent-plugins-kit.unit.test.tsx: hides Manage with an empty surface listing → remove the empty guard and display a nonfunctional action.
- plugins-kit.unit.test.tsx: explains Downloaded removal blockers → remove the busy/enabled/built-in guard, point at a different note, or present another row to removal/settings.
- plugins-kit.unit.test.tsx: shows tab-specific empty guidance → mount a list for an empty controller or show the directory fallback even where the install UI is available.
- plugins-kit.unit.test.tsx: reports missing row identity [Installed] → remove the invariant error in Installed and pass the missing row identity to a control.
- plugins-kit.unit.test.tsx: reports missing row identity [Downloaded] → remove the invariant error in Downloaded and pass the missing row identity to a control.
- plugins-kit.unit.test.tsx: retains loaded rows with errors and controls → swallow either error, drop the settings handle, or disconnect toast dismissal.
- plugins-kit.unit.test.tsx: no overlay without matching handles → mount Settings or Remove before it has an addressable row.
- plugins-kit.unit.test.tsx: invalid disabled package remains visible but not activatable → ignore control.visible (currently expected red).
- plugin-confirmation-and-fields.unit.test.tsx: no promise of vanishing from Installed → claim the disabled row is hidden from Installed (currently expected red).
- plugin-rows.unit.test.tsx: allows still-enabled Soon plugin to be switched off → lock every Soon row or ignore the switch's busy state.
- plugin-rows.unit.test.tsx: keeps problem details separate [quarantine] → remove the quarantine details or gate them on a second unrelated problem.
- plugin-rows.unit.test.tsx: keeps problem details separate [conflict] → remove the conflict details or gate them on a second unrelated problem.
- plugin-rows.unit.test.tsx: keeps problem details separate [validation] → remove the validation details or gate them on a second unrelated problem.
- plugins-kit.unit.test.tsx: focuses and routes the inspected Installed provider → omit the focus id or route Settings, Inspect or disclosure to a different row.
- plugins-kit.unit.test.tsx: falls back to Installed when local installation refused → leave Add enabled or resolve the unsupported deep link to Add.
- plugin-confirmation-and-fields.unit.test.tsx: omits unbound inputs → assume a particular provenance or inject a translator where none was bound.

- agent-plugins-kit.unit.test.tsx: skips confirmation for a vanished row → remove the fresh-row check and build a dialog from a missing target.
- plugins-kit.unit.test.tsx: fails with missing overlay identity [settings] → remove the missing settings identity error.
- plugins-kit.unit.test.tsx: fails with missing overlay identity [remove] → remove the missing remove identity error.

## Static review

The new cases were checked for real behavior, distinguishing inputs, independent assertions, strict collaborator arguments and isolated asynchronous settlement. They were not executed.

- EXCEPTION `AddPluginPanel.tsx:85–88`, missing-preview defensive throw. The private child is only mounted after the same controller's preview display is present. A time-varying getter to force the invariant to fail would test an unsupported input.
- EXCEPTION `PackageFilesModal.tsx:248`, false `selectedHandle !== undefined` with a non-null selection. The public component rejects that condition before the private browser receives props. The public rejection itself has a test.
- BUG `PluginLists.tsx:265–274`, the button ignores `control.visible`; an invalid, disabled package shows an active Enable button. Gate the action slot on visibility.
- BUG `rules.ts:595`, turning off an Agent Plugin still promises it will vanish from Installed. Remove that clause because Installed intentionally includes disabled packages.
