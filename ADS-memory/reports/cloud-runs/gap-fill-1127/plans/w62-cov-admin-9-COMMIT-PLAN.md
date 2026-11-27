# Admin coverage gap fill — mutation handoff

No tests, builds, installs, typechecks, coverage, or mutations were run. Each entry names a source mutation the corresponding test should reject on the cloud run.

- `packages/admin/src/shell/lib/admin-http/__tests__/urls.unit.test.ts:preserves the path and query` → omit BASE
- `packages/admin/src/shell/lib/admin-http/__tests__/urls.unit.test.ts:escapes the whole site name` → interpolate name without encodeURIComponent or omit the version
- `packages/admin/src/shell/lib/admin-http/__tests__/settings-api.unit.test.ts:writes the scoped value and principal` → drop options from the body or change PUT to POST
- `packages/admin/src/shell/lib/__tests__/agent-screen-context.unit.test.ts:does not send an entry without a route` → use canvas even when no render target exists
- `packages/admin/src/shell/lib/__tests__/agent-screen-context.unit.test.ts:keeps the newer route and entry` → clear currentEntry or currentRoute unconditionally in the release
- `packages/admin/src/shell/lib/__tests__/agent-screen-context.unit.test.ts:resets both halves` → omit either assignment in resetAgentScreenContext
- `packages/admin/src/shell/lib/__tests__/admin-post-list-sort.unit.test.ts:announces an inactive column` → replace via a replacement string rather than a callback, expanding $&
- `packages/admin/src/shell/lib/__tests__/admin-post-list-sort.unit.test.ts:announces that the next click` → remove the null branch or change newest to oldest
- `packages/admin/src/shell/lib/__tests__/editor-template-options.rules.unit.test.ts:keeps the first theme default` → prepend the retired template
- `packages/admin/src/shell/lib/__tests__/editor-template-options.rules.unit.test.ts:does not append an extra choice` → remove the membership check for existing, or remove the truthiness guard for unset/omitted/blank
- `packages/admin/src/shell/lib/__tests__/live-tiptap-editor.unit.test.ts:accepts a schema-bearing editor` → use isDestroyed instead of the public schema, or only check editor presence
- `packages/admin/src/shell/lib/__tests__/server-failure.unit.test.ts:classifies %s for the shared failure notice` → drop status 0, shift the 500 boundary, coerce string statuses, or dereference null in the corresponding row
- `packages/admin/src/shell/lib/__tests__/unique-id.unit.test.ts:uses the platform UUID` → skip randomUUID
- `packages/admin/src/shell/lib/__tests__/unique-id.unit.test.ts:uses both 32-bit words` → discard second word
- `packages/admin/src/shell/lib/__tests__/unique-id.unit.test.ts:keeps two IDs unique` → stop incrementing fallbackSequence
- `packages/admin/src/shell/lib/__tests__/unique-id.unit.test.ts:refuses a host random source` → silently substitute a default for the missing second word
- `packages/admin/src/shell/lib/__tests__/widget-embed-placement-content.unit.test.ts:allows per-placement content only for media-backed widget types` → drop media/gallery from the allowlist or make other or absent types eligible

- `packages/admin/src/shell/components/AssistantDock/__tests__/agent-failure-scanners.unit.test.ts:removes terminal OSC through its first terminator: %s` → for the respective fixtures: prefer ST over nearer BEL, prefer BEL over nearer ST, drop ST-only support, discard an unterminated suffix, or accept ESC [ as OSC
- `packages/admin/src/shell/components/AssistantDock/__tests__/agent-failure-scanners.unit.test.ts:distinguishes CSI controls from printable text: %s` → for each row remove the corresponding final-byte range, 8-bit/prefix support, group scan, empty-group support, four-digit cap, last filled group or leading digit fallback, or accept a missing/invalid final
- `packages/admin/src/shell/components/AssistantDock/__tests__/agent-failure-scanners.unit.test.ts:removes C0 and C1 controls` → drop the C1 filtering or remove CR from the preserved controls
- `packages/admin/src/shell/components/AssistantDock/__tests__/agent-failure-scanners.unit.test.ts:redacts provider-shaped words` → remove left word-boundary check or stop after the first credential
- `packages/admin/src/shell/components/AssistantDock/__tests__/agent-failure-scanners.unit.test.ts:redacts named values through their delimiters` → remove the bare token fallback, the space in the name pattern, or allow ampersands in values
- `packages/admin/src/shell/components/AssistantDock/__tests__/agent-failure-transport.unit.test.ts:uses structured error text` → drop the ext-name gate or ignore the ext error's string message
- `packages/admin/src/shell/components/AssistantDock/__tests__/agent-failure-transport.unit.test.ts:uses literal case-insensitive hint alternatives` → allow empty patterns, require all alternatives, remove case folding, or drop the capability check when suggesting an alternate agent
- `packages/admin/src/shell/components/AssistantDock/__tests__/dock-header-rules.unit.test.ts:toggles transcript and runtime switches` → stop inverting a check, bind a switch to another key, or ignore the selected plugin mode
- `packages/admin/src/shell/components/AssistantDock/__tests__/dock-header-rules.unit.test.ts:omits optional settings` → remove the absent-action guard or emit the runtime section without runtime wiring
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/assistant-mcp-ui.unit.test.ts:forwards the parent origin` → return a same-origin proxy URL rather than the builder's result, or pass a default origin instead of the host

- `packages/admin/src/shell/components/__tests__/ConfirmActionDialog.unit.test.tsx:names the modal and keeps body clicks inside` → remove stopPropagation or attach the confirm action to onCancel
- `packages/admin/src/shell/components/CodeView/__tests__/preview-modal-icons.unit.test.tsx:overrides only the exit-fullscreen icon` → route the override to expand-diagonal-line or change its size
- `packages/admin/src/shell/components/SecretInput/__tests__/SecretInput.unit.test.tsx:keeps a declared public field visible` → drop the public-field branch or keep the password autocomplete setting
- `packages/admin/src/shell/components/SecretInput/__tests__/SecretInput.unit.test.tsx:uses English when the document language is empty` → return the unexpanded Show/Hide templates
- `packages/admin/src/shell/components/MediaEditDialog/__tests__/MediaEditDialog.hooks.unit.test.tsx:starts unset fields empty` → gate saving on htmlAttributesError or omit locale from the description call
- `packages/admin/src/shell/components/MediaEditDialog/__tests__/MediaEditDialog.hooks.unit.test.tsx:clears three previously saved fields` → write whitespace through instead of null for any one field
- `packages/admin/src/shell/components/WidgetConfigFields/__tests__/HtmlAttributeRows.hooks.unit.test.tsx:keeps a half-typed row` → always parse the controlled string during render or filter the wrong index on remove
- `packages/admin/src/shell/components/ChatFab/__tests__/ChatFab.unit.test.tsx:publishes the optional assistant element handle` → omit the handle spread or add it even when no handle was supplied

- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/use-preference-controllers.hooks.unit.test.tsx:chains runtime edits` → diff against captured preferences for every write or never clear the optimistic copy
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/use-preference-controllers.hooks.unit.test.tsx:keeps an unsaved runtime choice` → drop the failed flag, revert the local choice, or fail to reset the flag on success
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/use-preference-controllers.hooks.unit.test.tsx:reflects a failed plugin choice locally` → send previous query data instead of previous requested value, or leave the completed optimistic value masking external writes
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/use-preference-controllers.hooks.unit.test.tsx:uses the prior optimistic display state` → drop the rejection handler, omit the optimistic echo cleanup, or subscribe to the wrong refresh key
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/selected-agent-plugins.hooks.unit.test.tsx:pins each ref once` → drop the deduplication check, omit fallback label, ignore the changed catalog or remove the wrong pin
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/use-selected-agent-auth-warning.hooks.unit.test.tsx:returns picker rescan results immediately` → let an old detection overwrite authentication status after a new rescan
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/use-selected-agent-auth-warning.hooks.unit.test.tsx:uses default Claude for a missing selection` → remove the mode gate, omit the missing-agent fallback or retain agents on a detection error

- `packages/admin/src/shell/lib/__tests__/admin-frontend-session.unit.test.ts:requests the dock before delivering the exact page surface` → dispatch before requesting the dock, or leave the disposed listener registered
- `packages/admin/src/shell/lib/__tests__/assistant-prompt-bus.unit.test.tsx:opens the dock for each request` → keep the original pending text instead of replacing it, or stop notifying the mounted composer
- `packages/admin/src/shell/lib/__tests__/assistant-prompt-bus.unit.test.tsx:stops retrying after five seconds` → retry indefinitely or clear pending when the budget expires
- `packages/admin/src/shell/lib/__tests__/assistant-prompt-bus.unit.test.tsx:cancels retries and removes the old composer` → omit clearTimeout, listener deletion, or pending reset
- `packages/admin/src/shell/lib/__tests__/credential-card-guidance.unit.test.ts:scrolls the unique pending credential card's wrapper` → scroll the pending span instead of its wrapper or omit iframe focus
- `packages/admin/src/shell/lib/__tests__/credential-card-guidance.unit.test.ts:uses the card itself without a wrapper` → return early without a wrapper, or guide to the first of multiple matches
- `packages/admin/src/shell/lib/__tests__/credential-card-guidance.unit.test.ts:does not use the ambient page` → fall back to globalThis.document for an explicitly null document
- `packages/admin/src/shell/lib/__tests__/assistant-daemon-activation.unit.test.ts:distinguishes an unreadable refusal body` → treat a body-read TypeError as ordinary non-JSON
- `packages/admin/src/shell/lib/__tests__/assistant-daemon-activation.unit.test.ts:keeps the attachment error` → ignore a rebind rejection and return the stale token
- `packages/admin/src/shell/lib/__tests__/paint-admin-accent.unit.test.ts:keeps a dark custom accent active` → always mark custom accent tokens as light
- `packages/admin/src/shell/lib/__tests__/viewer-time-zone.unit.test.ts:reads the viewer time zone once` → hardcode UTC for the non-empty case or drop the fallback for the empty case
- `packages/admin/src/shell/lib/__tests__/fetch-query-adapter-context.unit.test.tsx:reports the host's query adapter only inside that host's provider` → default an unconfigured host to builtin or tanstack

- `packages/admin/src/shell/hooks/__tests__/use-admin-document-locale.hooks.unit.test.tsx:sets the full language tag` → check the full tag without lowercasing or splitting, or fail to restore LTR
- `packages/admin/src/shell/hooks/__tests__/use-admin-document-locale.hooks.unit.test.tsx:updates the document root` → default to another DOM element
- `packages/admin/src/shell/hooks/__tests__/use-agent-screen-context.hooks.unit.test.tsx:publishes the route and the resolved entry` → omit entry metadata, keep stale entry when it becomes null, or omit route cleanup
- `packages/admin/src/shell/hooks/__tests__/use-admin-appearance-snapshot.hooks.unit.test.tsx:scopes reads to the signed-in operator` → read the preview version after awaiting I/O, omit the boot key, or share versions across roots
- `packages/admin/src/shell/hooks/__tests__/use-admin-appearance-snapshot.hooks.unit.test.tsx:asks the query observer not to read private appearance settings` → ignore the checking flag
- `packages/admin/src/shell/hooks/__tests__/use-assistant-chats.hooks.unit.test.ts:keeps the pane state and action identities` → drop persistUserTurn forwarding, substitute activeId for paneKey, or recreate the action wrappers each render
- `packages/admin/src/shell/hooks/__tests__/use-sidebar-empty-click-toggle.hooks.test.tsx:uses the live default desktop media query` → use the wrong breakpoint, read it only at mount, or not remove the native listener

- `packages/admin/src/shell/components/__tests__/SitesSidebarNav.unit.test.tsx:adds a hidden split label only to the Sites row` → omit the portal or its aria-hidden, attach to the wrong row, ignore replacement, or always show the title
- `packages/admin/src/shell/components/__tests__/SitesSidebarNav.unit.test.tsx:leaves the plain nav label without a snapshot` → enable reads with no Sites row or omit the untranslated fallback label
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/runtime-access.hooks.unit.test.tsx:records a loaded inventory` → return loader results without recording them or hand rescan a separate loader
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/runtime-access.hooks.unit.test.tsx:shares only the in-flight health probe` → drop probe sharing or fail to clear a rejected probe
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/runtime-access.hooks.unit.test.tsx:uses the saved placeholder` → keep returning the original snapshot despite an available live cache
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/runtime-access.hooks.unit.test.tsx:selects a single runtime seam` → always call the real runtime or seed a real cache placeholder for an injected runtime
- `packages/admin/src/shell/lib/__tests__/durable-run-subscription.unit.test.ts:keeps page activity through transient errors` → release on onError, omit abort cleanup, or double-release a run
- `packages/admin/src/shell/lib/__tests__/durable-run-subscription.unit.test.ts:releases rejected dispatches` → omit catch cleanup or ignore a pre-aborted signal

- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/assistant-transport.hooks.unit.test.tsx:keeps the transport stable` → capture the original picker or config, omit first-turn persistence, or use the token returned by preparation instead of the current bridge token
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/assistant-transport.hooks.unit.test.tsx:falls back to ledger CLI reasoning` → keep the stale model, omit fallback reasoning, or reject an unbound surface's failed activation
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/assistant-transport.hooks.unit.test.tsx:sends BYOK as frozen by the pane` → use the CLI picker or daemon preparation for BYOK
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/assistant-transport.hooks.unit.test.tsx:reports slow activation after 500 ms` → change the wake threshold or clear the indicator only when page attachment finishes
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/assistant-transport.hooks.unit.test.tsx:does not dispatch when Stop arrives` → omit cancelSignal from the combined signal, clear feedback twice, or dispatch with a missing required token
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/assistant-transport.hooks.unit.test.tsx:prewarms only after the open dock loads local config` → drop any eligibility guard, omit abort on close, or retain the previous failure on retry

- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/agents-inventory.hooks.unit.test.tsx:records the new snapshot` → retain the prior resume set or accept a missing capability flag
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/agents-inventory.hooks.unit.test.tsx:replaces the cached and persisted inventory` → skip the cache-bypassing GET for the respective empty, HTTP-error, or malformed reply
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/agents-inventory.hooks.unit.test.tsx:accepts a usable rescan` → call GET unnecessarily or ignore the fresh catalog's expiresAt
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/agents-inventory.hooks.unit.test.tsx:preserves the last good cache` → retry a status=0 rejection or cache an invalid fallback
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/agents-inventory.hooks.unit.test.tsx:keeps a pending snapshot until its deadline` → expire at 999 ms, fail to progress through the discovery backoff, or leave failure due immediately
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/agents-inventory.hooks.unit.test.tsx:does not replace or extend a new rescan` → recompute an accepted rescan's deadline when an older GET settles
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/agents-inventory.hooks.unit.test.tsx:supplies the boot-scoped loader key` → omit scope from the query key or treat failed health HTTP responses as online

- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/local-cli-selection.normalization.unit.test.tsx:keeps a new picker choice` → let an older save unlock hydration or stop persisting operator changes
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/byok-runtime.discovery-generation.unit.test.tsx:clears discovered models` → retain BYOK models when switching execution modes or call listModels for blank credentials
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/byok-runtime.discovery-generation.unit.test.tsx:labels the exact provider preset` → drop the provider identity, include a stale preset for a custom endpoint, or persist unchanged models
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/execution-config.presence-scope.unit.test.tsx:refreshes credential presence` → invalidate the wrong key, fail to re-read, or omit abort/unsubscribe on disposal
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/execution-config.presence-scope.unit.test.tsx:does not report credential cancellation` → report AbortError as a credential failure
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/execution-ledger.refresh-fences.unit.test.tsx:reports a failed background read` → swallow the read failure, or apply each functional updater to the original state rather than the synchronous mirror

- `packages/admin/src/shell/components/AssistantDock/__tests__/use-messages-change-handler.unit.test.tsx:does not refresh hydrated history` → ignore the restored history when initializing publication marks or publish content twice on a terminal tool delta
- `packages/admin/src/shell/components/AssistantDock/__tests__/use-messages-change-handler.unit.test.tsx:publishes the first tool result of a retry` → known-red with the current code: retain the old mark when the same message drops to zero events; fixed code must clear the old mark before the first result
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx:recognizes the %s surface id` → remove the row's operation from the accepted keys or accept malformed IDs
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx:tracks the live canvas` → capture initial canvas once, make dismissal/refusal sticky across different ids, or relay the same refusal twice
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx:relays diagnostics without a surface id` → drop id-less diagnostics or treat them as refusal of the active surface
- `packages/admin/src/shell/components/AssistantDock/__tests__/use-composer-send-stop-guard.hooks.unit.test.tsx:uses the monotonic browser clock` → use Date.now instead of performance.now or use a constant timestamp
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/use-assistant-empty-state.hooks.unit.test.ts:forwards equal-count transcript edits` → capture the original callback or suppress transcript edits with unchanged message count

- `packages/admin/src/shell/lib/__tests__/media-embed-extension.hooks.unit.test.tsx:normalizes non-string node attributes` → Coerce invalid attrs to literal strings or classify mixed-case video as image.
- `packages/admin/src/shell/lib/__tests__/media-embed-extension.hooks.unit.test.tsx:ignores a stale video answer` → Let an obsolete reply overwrite the current preview or skip the image error fallback.
- `packages/admin/src/shell/lib/__tests__/media-embed-extension.hooks.unit.test.tsx:writes replacement and edit fields separately` → Write title over supplied alt, keep the prior transform, drop edit fields or leave a dialog open.

- `packages/admin/src/shell/lib/__tests__/media-image-extension.hooks.unit.test.ts:binds each requested image label` → pass the default locale to translate or ignore key
- `packages/admin/src/shell/lib/__tests__/media-image-extension.hooks.unit.test.ts:clears legacy image fields after picking alt` → retain old src/title, ignore nonempty picked alt or skip the title fallback
- `packages/admin/src/shell/components/WidgetConfigFields/__tests__/WidgetConfigFields.hooks.unit.test.tsx:updates and removes the selected social link` → update nonmatching indices, remove the wrong index, or mutate existing link config
- `packages/admin/src/shell/components/WidgetConfigFields/__tests__/WidgetConfigFields.hooks.unit.test.tsx:drops the collection, fields and filter` → retain the old collection or where clause on clear
- `packages/admin/src/shell/components/WidgetConfigFields/__tests__/WidgetConfigFields.hooks.unit.test.tsx:omits filter clauses` → persist a blank condition or a condition with an empty field name
- `packages/admin/src/shell/components/WidgetConfigFields/__tests__/WidgetConfigFields.hooks.unit.test.tsx:updates sort, column count and field toggles` → keep blank options or empty fields in storage, save column count as a string, or remove the wrong field
- `packages/admin/src/shell/components/InstallTabCard/__tests__/InstallTabCard.unit.test.tsx:opens the advanced disclosure` → remove details/summary behavior, omit the injected handle, or discard the nested control
- `packages/admin/src/shell/components/InstallTabCard/__tests__/InstallTabCard.unit.test.tsx:offers a distinct multi-file folder picker` → remove webkitdirectory or multiple, swap choose callbacks, or let operators choose while busy

- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/composer-catalog.scope-and-force.unit.test.tsx:refreshes on open, focus, visibility and visible polling` → poll while hidden, drop the focus/visibility registrations, or leave listeners or timers registered after cleanup
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/composer-catalog.scope-and-force.unit.test.tsx:reports a failed catalog reload` → silence projectComposerCapabilities rejection or replace the previous catalog with an empty one
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/composer-files.hooks.unit.test.tsx:proposes skill files without uploading them` → send skills to the attachment uploader or drop batchId/signal on ordinary files
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/composer-files.hooks.unit.test.tsx:passes the draft reference validation contract` → rebuild the validator on each render or construct it without the host validation inputs
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/composer-files.hooks.unit.test.tsx:omits working directory access` → construct a picker on an unsupported browser or use a fixed storage key
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/composer-files.hooks.unit.test.tsx:publishes the live folder capture handler` → omit onReady or swallow ordinary drops instead of calling the host fallback

- `packages/admin/src/shell/lib/__tests__/settings-effective-reads.unit.test.ts:deduplicates refresh invalidation in one turn` → do not clear the namespace guard on the microtask or let an older promise evict a newer read
- `packages/admin/src/shell/lib/__tests__/settings-effective-reads.unit.test.ts:drops all scopes only once per dispatch turn` → remove the global dispatch guard or leave it set after the microtask
- `packages/admin/src/shell/lib/__tests__/execution-settings-ledger.no-secrets.unit.test.ts:distinguishes a typed key from a stored key` → treat whitespace as a typed key or require raw key bytes when presence is confirmed
- `packages/admin/src/shell/lib/__tests__/execution-settings-ledger.no-secrets.unit.test.ts:hydrates a concrete token cap` → omit the nonzero cap, or persist zero or a string as a cap
- `packages/admin/src/shell/lib/__tests__/execution-settings-ledger.no-secrets.unit.test.ts:returns defaults only for an unregistered namespace` → fall back for every failure or rethrow an unregistered namespace
- `packages/admin/src/shell/lib/__tests__/unique-id.unit.test.ts:keeps different random word pairs distinct` → known-red with current code: concatenate variable-width base36 components without a delimiter so [1,36] and [37,0] alias
- `packages/admin/src/shell/hooks/__tests__/dock-conversation-deep-link.integration.test.tsx:removes only the missing conversation param` → clear all query params or select a missing conversation
- `packages/admin/src/shell/hooks/__tests__/dock-conversation-deep-link.integration.test.tsx:ignores empty links and a signed-out principal` → drop an admission guard or let an earlier lookup select a conversation
- `packages/admin/src/widgets/__tests__/widgets-surface.unit.test.ts:keeps the latest regions after an old lookup fails` → let obsolete failures populate the error or do not abort disposed lookups
- `packages/admin/src/widgets/__tests__/widgets-surface.unit.test.ts:writes a trimmed region key` → send whitespace through, retain the draft after binding, or omit navigation

- `packages/admin/src/shell/components/AssistantDock/__tests__/y5-dock.test.tsx:only passes known optional pane state` → include explicit undefined fields, render a disabled mic or show the remote folder warning on desktop
- `packages/admin/src/shell/components/AssistantDock/__tests__/y5-dock.test.tsx:shows translated startup feedback only while starting` → render the starting label when idle or ignore stored key presence when setting the pane's BYOK availability
- `packages/admin/src/shell/components/MediaPickerDialog/__tests__/JiniMediaPicker.hooks.unit.test.tsx:cancels a dismissed picker` → remove picker abort on unmount or perform a media read when no asset was selected
- `packages/admin/src/shell/components/MediaPickerDialog/__tests__/JiniMediaPicker.hooks.unit.test.tsx:reports a no-longer-active asset` → accept a trashed asset, or lose the unavailable-asset diagnostic
- `packages/admin/src/shell/lib/__tests__/addons-routes.unit.test.ts:preserves a legacy detail path` → build a redirect from an undefined panel destination instead of leaving the legacy path alone
- `packages/admin/src/shell/lib/__tests__/admin-failure-reporter.unit.test.ts:uses the default host clock and UUID` → replace either default generator with a constant or ignore a supplied generation
- `packages/admin/src/shell/lib/admin-http/__tests__/request.unit.test.ts:sends a raw untyped Blob` → JSON-encode blobs, omit the octet-stream fallback, or drop explicitly false keepalive
- `packages/admin/src/shell/lib/__tests__/browser-working-directory-access.unit.test.ts:reports no filesystem picker without a browser global` → read window.showDirectoryPicker before checking that the global exists
- `packages/admin/src/shell/lib/__tests__/stored-credential-endpoint.unit.test.ts:ignores endpoint metadata when presence is false` → treat endpoint metadata as proof that a credential is stored
- `packages/admin/src/shell/lib/__tests__/status-labels.unit.test.ts:gives known English statuses human-readable fallback copy` → return raw wire values instead of the approved English fallback
- `packages/admin/src/sites/transfer/__tests__/use-export-password.hooks.test.tsx:does not show a copy error for an old share` → remove the copy-generation guard

- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/chat-package-kind.unit.test.ts:does not treat an absolute legacy marker path as a package declaration` → accept absolute-path manifest aliases as if they were valid root package markers
- `packages/admin/src/shell/components/WidgetConfigFields/__tests__/media-content-rules.unit.test.ts:keeps an explicit HTML mode editable` → leak a non-string html field into the draft or save inactive media on the HTML tab
- `packages/admin/src/shell/hooks/__tests__/use-dock-auto-rail.hooks.test.tsx:uses the native media query result` → treat the native matchMedia path as unsupported or fail to remove its listener
- `packages/admin/src/shell/hooks/__tests__/use-external-entry-refresh.unit.test.ts:does not fetch or discard a local draft for Load latest` → remove either the saving guard or the absent-row guard
- `packages/admin/src/widgets/react/__tests__/use-wired-widget-instance-editor.hooks.unit.test.tsx:creates through the host widget port` → ignore the provided defaults/locale or route the new widget through /admin instead of the host's navigation base

- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/composer-files.hooks.unit.test.tsx:captures a skill folder before ordinary drop handling` → invoke the ordinary fallback for a handled skill directory or drop the injected error observer
- `packages/admin/src/shell/lib/admin-http/__tests__/settings-api.unit.test.ts:does not share effective settings reads across principals` → omit principalId from the URL or coalesce in-flight reads by namespace alone
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/agents-inventory.hooks.unit.test.tsx:labels a failed inventory response` → drop the route-specific error factory or strip the host's error code/body
- `packages/admin/src/shell/lib/__tests__/browser-stream.unit.test.ts:delivers a tab-local stream before hiding` → keep a dead connection on pagehide or fail to make a replacement on pageshow

- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/agents-inventory.hooks.unit.test.tsx:uses the correct retry/freshness deadline` → let an expired catalog spin immediately, keep stale inventory past its cooldown, propagate NaN, or ignore the normal maximum lifetime
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/use-selected-agent-auth-warning.hooks.unit.test.tsx:uses an explicitly injected detector` → ignore the injected port or omit the selected agent from the re-detection dependencies

- `packages/admin/src/shell/lib/__tests__/queued-daemon-start.unit.test.ts:the default browser request decodes a busy refusal` → consume the original refusal body instead of cloning, or drop the busy retry from the default browser adapter
- `packages/admin/src/shell/components/AssistantDock/__tests__/dock-header-rules.unit.test.ts:moves option help into one tooltip` → use some instead of every, or leave duplicate help on each choice

## File inventory

146 new test declarations across 73 test files (35 new and 38 extended), targeting 78 source files. A parameterized table counts as one declaration; shared tests are counted once in totals.

### AssistantDock

| Source file | Test file | Added declarations |
| --- | --- | ---: |
| `agent-failure-scanners.ts` | `agent-failure-scanners.unit.test.ts` (new) | 5 |
| `agent-failure.ts` | `agent-failure-transport.unit.test.ts` (extended) | 2 |
| `assistant-dock-props.tsx` | `y5-dock.test.tsx` (extended) | 1 |
| `dock-header-rules.ts` | `dock-header-rules.unit.test.ts` (extended) | 3 |
| `dock-pane-props.tsx` | `y5-dock.test.tsx` (extended) | 1 |
| `hooks/agents-inventory.hooks.ts` | `agents-inventory.hooks.unit.test.tsx` (new) | 9 |
| `hooks/assistant-mcp-ui.ts` | `assistant-mcp-ui.unit.test.ts` (new) | 1 |
| `hooks/assistant-transport.hooks.ts` | `assistant-transport.hooks.unit.test.tsx` (new) | 6 |
| `hooks/byok-runtime.hooks.ts` | `byok-runtime.discovery-generation.unit.test.tsx` (extended) | 2 |
| `hooks/chat-package-kind.ts` | `chat-package-kind.unit.test.ts` (extended) | 1 |
| `hooks/composer-discovery.hooks.ts` | `composer-catalog.scope-and-force.unit.test.tsx` (extended) | 2 |
| `hooks/composer-files.hooks.ts` | `composer-files.hooks.unit.test.tsx` (new) | 5 |
| `hooks/execution-config-ledger.hooks.ts` | `execution-ledger.refresh-fences.unit.test.tsx` (extended) | 1 |
| `hooks/execution-config.hooks.ts` | `execution-config.presence-scope.unit.test.tsx` (extended) | 2 |
| `hooks/local-cli-selection.hooks.ts` | `local-cli-selection.normalization.unit.test.tsx` (extended) | 1 |
| `hooks/messages-change.hooks.ts` | `use-messages-change-handler.unit.test.tsx` (extended) | 2 |
| `hooks/runtime-access.hooks.ts` | `runtime-access.hooks.unit.test.tsx` (new) | 4 |
| `hooks/selected-agent-plugins.hooks.ts` | `selected-agent-plugins.hooks.unit.test.tsx` (new) | 1 |
| `hooks/use-assistant-empty-state.hooks.ts` | `use-assistant-empty-state.hooks.unit.test.ts` (extended) | 1 |
| `hooks/use-assistant-runtime-preferences.hooks.ts` | `use-preference-controllers.hooks.unit.test.tsx` (new) | 2 |
| `hooks/use-chat-agent-plugins.hooks.ts` | `use-preference-controllers.hooks.unit.test.tsx` (new) | 1 |
| `hooks/use-chat-display-preferences.hooks.ts` | `use-preference-controllers.hooks.unit.test.tsx` (new) | 1 |
| `hooks/use-composer-send-stop-guard.hooks.ts` | `use-composer-send-stop-guard.hooks.unit.test.tsx` (extended) | 1 |
| `hooks/use-routed-a2ui-surface-card.hooks.ts` | `use-routed-a2ui-surface-card.hooks.unit.test.tsx` (new) | 3 |
| `hooks/use-selected-agent-auth-warning.hooks.ts` | `use-selected-agent-auth-warning.hooks.unit.test.tsx` (new) | 3 |

### Other shell components

| Source file | Test file | Added declarations |
| --- | --- | ---: |
| `ChatFab/ChatFab.tsx` | `ChatFab.unit.test.tsx` (extended) | 1 |
| `CodeView/preview-modal-icons.tsx` | `preview-modal-icons.unit.test.tsx` (new) | 1 |
| `ConfirmActionDialog.tsx` | `ConfirmActionDialog.unit.test.tsx` (new) | 1 |
| `InstallTabCard/InstallTabCard.tsx` | `InstallTabCard.unit.test.tsx` (extended) | 2 |
| `MediaEditDialog/MediaEditDialog.hooks.tsx` | `MediaEditDialog.hooks.unit.test.tsx` (new) | 2 |
| `MediaPickerDialog/JiniMediaPicker.hooks.ts` | `JiniMediaPicker.hooks.unit.test.tsx` (extended) | 2 |
| `SecretInput/SecretInput.tsx` | `SecretInput.unit.test.tsx` (new) | 2 |
| `SitesSidebarNav.tsx` | `SitesSidebarNav.unit.test.tsx` (new) | 2 |
| `WidgetConfigFields/HtmlAttributeRows.hooks.ts` | `HtmlAttributeRows.hooks.unit.test.tsx` (new) | 1 |
| `WidgetConfigFields/WidgetConfigFields.hooks.tsx` | `WidgetConfigFields.hooks.unit.test.tsx` (extended) | 4 |
| `WidgetConfigFields/media-content-rules.ts` | `media-content-rules.unit.test.ts` (extended) | 1 |

### Shell hooks

| Source file | Test file | Added declarations |
| --- | --- | ---: |
| `use-admin-appearance-snapshot.hooks.ts` | `use-admin-appearance-snapshot.hooks.unit.test.tsx` (new) | 2 |
| `use-admin-document-locale.hooks.ts` | `use-admin-document-locale.hooks.unit.test.tsx` (new) | 2 |
| `use-agent-screen-context.hooks.ts` | `use-agent-screen-context.hooks.unit.test.tsx` (new) | 1 |
| `use-assistant-chats.hooks.ts` | `use-assistant-chats.hooks.unit.test.ts` (extended) | 1 |
| `use-conversation-deep-link.ts` | `dock-conversation-deep-link.integration.test.tsx` (extended) | 2 |
| `use-dock-auto-rail.hooks.ts` | `use-dock-auto-rail.hooks.test.tsx` (extended) | 1 |
| `use-external-entry-refresh.hooks.ts` | `use-external-entry-refresh.unit.test.ts` (extended) | 1 |
| `use-sidebar-empty-click-toggle.hooks.ts` | `use-sidebar-empty-click-toggle.hooks.test.tsx` (extended) | 1 |
| `use-sites-sidebar-nav.hooks.ts` | `SitesSidebarNav.unit.test.tsx` (new) | 2 shared |

### Shell libraries

| Source file | Test file | Added declarations |
| --- | --- | ---: |
| `addons-routes.ts` | `addons-routes.unit.test.ts` (extended) | 1 |
| `admin-failure-reporter.ts` | `admin-failure-reporter.unit.test.ts` (extended) | 1 |
| `admin-frontend-session.ts` | `admin-frontend-session.unit.test.ts` (new) | 1 |
| `admin-http/config.ts` | `urls.unit.test.ts` (new) | 2 shared |
| `admin-http/request.ts` | `request.unit.test.ts` (extended) | 1 |
| `admin-http/settings-api.ts` | `settings-api.unit.test.ts` (extended) | 2 |
| `admin-http/urls.ts` | `urls.unit.test.ts` (new) | 2 |
| `admin-post-list-sort.ts` | `admin-post-list-sort.unit.test.ts` (new) | 2 |
| `agent-screen-context.ts` | `agent-screen-context.unit.test.ts` (new) | 3 |
| `assistant-daemon-activation.ts` | `assistant-daemon-activation.unit.test.ts` (extended) | 2 |
| `assistant-prompt-bus.ts` | `assistant-prompt-bus.unit.test.tsx` (new) | 3 |
| `browser-stream.ts` | `browser-stream.unit.test.ts` (extended) | 1 |
| `browser-working-directory-access.ts` | `browser-working-directory-access.unit.test.ts` (extended) | 1 |
| `credential-card-guidance.ts` | `credential-card-guidance.unit.test.ts` (new) | 3 |
| `editor-template-options.rules.ts` | `editor-template-options.rules.unit.test.ts` (new) | 2 |
| `execution-settings-ledger.ts` | `execution-settings-ledger.no-secrets.unit.test.ts` (extended) | 3 |
| `fetch-query/adapter-context.ts` | `fetch-query-adapter-context.unit.test.tsx` (new) | 1 |
| `live-tiptap-editor.ts` | `live-tiptap-editor.unit.test.ts` (new) | 1 |
| `media-embed-extension.hooks.ts` | `media-embed-extension.hooks.unit.test.tsx` (new) | 3 |
| `media-image-extension.hooks.ts` | `media-image-extension.hooks.unit.test.ts` (new) | 2 |
| `paint-admin-accent.ts` | `paint-admin-accent.unit.test.ts` (extended) | 1 |
| `queued-daemon-start.ts` | `queued-daemon-start.unit.test.ts` (extended) | 1 |
| `server-failure.ts` | `server-failure.unit.test.ts` (new) | 1 |
| `settings-effective-reads.ts` | `settings-effective-reads.unit.test.ts` (new) | 2 |
| `status-labels.ts` | `status-labels.unit.test.ts` (extended) | 1 |
| `stored-credential-endpoint.ts` | `stored-credential-endpoint.unit.test.ts` (extended) | 1 |
| `stream-activity.ts` | `durable-run-subscription.unit.test.ts` (extended) | 2 |
| `unique-id.ts` | `unique-id.unit.test.ts` (new) | 5 |
| `viewer-time-zone.ts` | `viewer-time-zone.unit.test.ts` (new) | 1 |
| `widget-embed-placement-content.ts` | `widget-embed-placement-content.unit.test.ts` (extended) | 1 |

### Sites and widgets

| Source file | Test file | Added declarations |
| --- | --- | ---: |
| `sites/transfer/use-export-password.hooks.ts` | `use-export-password.hooks.test.tsx` (extended) | 1 |
| `widgets/controllers/regions.controller.ts` | `widgets-surface.unit.test.ts` (extended) | 2 |
| `widgets/react/hooks/use-widget-instance-editor.hooks.ts` | `use-wired-widget-instance-editor.hooks.unit.test.tsx` (new) | 1 |

### New test files

- `packages/admin/src/shell/components/AssistantDock/__tests__/agent-failure-scanners.unit.test.ts`
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/agents-inventory.hooks.unit.test.tsx`
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/assistant-mcp-ui.unit.test.ts`
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/assistant-transport.hooks.unit.test.tsx`
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/composer-files.hooks.unit.test.tsx`
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/runtime-access.hooks.unit.test.tsx`
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/selected-agent-plugins.hooks.unit.test.tsx`
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/use-preference-controllers.hooks.unit.test.tsx`
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx`
- `packages/admin/src/shell/components/AssistantDock/hooks/__tests__/use-selected-agent-auth-warning.hooks.unit.test.tsx`
- `packages/admin/src/shell/components/CodeView/__tests__/preview-modal-icons.unit.test.tsx`
- `packages/admin/src/shell/components/MediaEditDialog/__tests__/MediaEditDialog.hooks.unit.test.tsx`
- `packages/admin/src/shell/components/SecretInput/__tests__/SecretInput.unit.test.tsx`
- `packages/admin/src/shell/components/WidgetConfigFields/__tests__/HtmlAttributeRows.hooks.unit.test.tsx`
- `packages/admin/src/shell/components/__tests__/ConfirmActionDialog.unit.test.tsx`
- `packages/admin/src/shell/components/__tests__/SitesSidebarNav.unit.test.tsx`
- `packages/admin/src/shell/hooks/__tests__/use-admin-appearance-snapshot.hooks.unit.test.tsx`
- `packages/admin/src/shell/hooks/__tests__/use-admin-document-locale.hooks.unit.test.tsx`
- `packages/admin/src/shell/hooks/__tests__/use-agent-screen-context.hooks.unit.test.tsx`
- `packages/admin/src/shell/lib/__tests__/admin-frontend-session.unit.test.ts`
- `packages/admin/src/shell/lib/__tests__/admin-post-list-sort.unit.test.ts`
- `packages/admin/src/shell/lib/__tests__/agent-screen-context.unit.test.ts`
- `packages/admin/src/shell/lib/__tests__/assistant-prompt-bus.unit.test.tsx`
- `packages/admin/src/shell/lib/__tests__/credential-card-guidance.unit.test.ts`
- `packages/admin/src/shell/lib/__tests__/editor-template-options.rules.unit.test.ts`
- `packages/admin/src/shell/lib/__tests__/fetch-query-adapter-context.unit.test.tsx`
- `packages/admin/src/shell/lib/__tests__/live-tiptap-editor.unit.test.ts`
- `packages/admin/src/shell/lib/__tests__/media-embed-extension.hooks.unit.test.tsx`
- `packages/admin/src/shell/lib/__tests__/media-image-extension.hooks.unit.test.ts`
- `packages/admin/src/shell/lib/__tests__/server-failure.unit.test.ts`
- `packages/admin/src/shell/lib/__tests__/settings-effective-reads.unit.test.ts`
- `packages/admin/src/shell/lib/__tests__/unique-id.unit.test.ts`
- `packages/admin/src/shell/lib/__tests__/viewer-time-zone.unit.test.ts`
- `packages/admin/src/shell/lib/admin-http/__tests__/urls.unit.test.ts`
- `packages/admin/src/widgets/react/__tests__/use-wired-widget-instance-editor.hooks.unit.test.tsx`

## Source review outcomes

- SKIPPED-ALREADY-COVERED `shell/hooks/use-desktop-view-release.hooks.ts` — existing tests ‘the verified dashboard can release while independent state guards retain their veto’ and ‘the login form at the dashboard URL remains pinned’ cover both release outcomes and the sign-in gate. The nullish path fallback has no valid string input (see exception).
- SKIPPED-ALREADY-COVERED `shell/lib/descriptor-i18n.ts` — existing ‘uses the exact locale’s translation’ and ‘falls back to the base language, then to the English’ cover the locale ladder. The remaining string-index fallback has no valid input (see exception).
- EXCEPTION `packages/admin/src/shell/hooks/use-desktop-view-release.hooks.ts:11–12` — `split(/[?#]/, 1)` of a string always has a first element, even for an empty path.
- EXCEPTION `packages/admin/src/shell/lib/descriptor-i18n.ts:25–26` — splitting a valid locale string on a hyphen always returns a first element.
- EXCEPTION `packages/admin/src/widgets/react/components/WidgetInstanceNotices.tsx:37–38` — the switch exhausts `WidgetInstanceGuard`; only a fabricated invalid type reaches default.
- EXCEPTION `packages/admin/src/shell/components/AssistantDock/hooks/chat-package-kind.ts:112–113` — for an ordinary File array, mapping and iteration visit the same present indices. A File-list hole cannot make the aligned root absent.
- EXCEPTION `packages/admin/src/shell/components/WidgetConfigFields/media-content-rules.ts:131–132,342–343` — both layout lists are nonempty and a successful attribute match always has its mandatory first capture.
- BUG `packages/admin/src/shell/components/AssistantDock/hooks/messages-change.hooks.ts:84–87` — the zero-result retry leaves a count-of-one mark in place, suppressing the retry’s first result. Clear the mark when the count decreases to zero. Regression retained.
- BUG `packages/admin/src/shell/lib/unique-id.ts:23` — base36 concatenation aliases random pairs `[1, 36]` and `[37, 0]` in the same millisecond. Delimit or fixed-width encode the words. Regression retained.

All dispatched files were reviewed. Proposed exceptions are limited to the cited branches and do not change coverage collection. Coverage and execution remain unverified.
