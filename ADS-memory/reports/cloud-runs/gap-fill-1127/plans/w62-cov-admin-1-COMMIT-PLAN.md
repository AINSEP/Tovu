# Admin coverage gap-fill and mutation handoff

Static Author Checklist applied to the tests below. Each entry names a source change the test is designed to reject. No tests, builds, coverage or mutants were run locally.

- `pages/api/__tests__/pages-api.test.ts`: keeps reads and writes on kind-guarded pages endpoints → replace `/pages` with `/posts` on get, or drop the HTML write's expectedVersion.
- `recovery/api/__tests__/recovery-api.test.ts`: reads status and points and forwards deep link → omit the envelope wrapper; sends plan hash, acknowledgement and token to respective steps → replace acknowledgement with true or omit the supplied plan hash.
- `screens/analytics/api/__tests__/analytics-api.test.ts`: uses the workspace endpoint with a limit only when requested → always append the query or omit a supplied positive limit.
- `screens/auth/api/__tests__/auth-api.test.ts`: opts password login into retry but sends MFA once → drop retryWrites or switch MFA to request; keeps boot, sign-in, logout and session reads separate → swap boot endpoint paths or point password-status at /auth/me.
- `posts/__tests__/posts-api.test.ts`: creates a post with title and explicit publishing date → serialize only title.
- `browser/__tests__/browser-adapter-parity.unit.test.ts`: times out at deadline, then clears outage → change >= to > or remove markReachable's transition; retry policy table → ignore code check, default to POST, skip method normalization or drop either write exception; readiness answer table → require HTTP 200, coerce readiness with truthiness, or omit signal; rejected readiness request → let fetch rejection escape instead of returning false.
- `browser/__tests__/settings-events.unit.test.ts`: refreshes scoped settings and catches up on re-open → discard namespace list, remove JSON-error fallback, or publish on first open; resumes from last id across pagehide → overwrite cursor with empty id or remove cursor-only refresh; reports construction failure and attaches on return → remove warning or warn on transient error.
- `deployment/__tests__/deployment-i18n.unit.test.ts`: substitutes line count after translation → skip translate or omit interpolation.
- `recovery/__tests__/rules.unit.test.ts`: localizes known and preserves unknown labels → return raw category or raw known cost class; banner severity/urgency table → make operation-in-flight an error, baseline failure a warning, or drop pending-migration from the urgent kinds; rejects malformed but forwards falsy JSON → add a truthiness guard after parse; distinguishes restore buttons by viewer time → omit the viewer's timezone.
- `pages/__tests__/page-preview-youtube.unit.test.ts`: extracts nested nodes and iframe embeds → stop descending into node content or allow short links in iframes; independent source table → accept suffix lookalikes, remove credentials guard, or loosen allowed ID characters and length.
- `media/adapters/__tests__/http-providers.test.ts`: preserves other providers and saved fields → replace the whole map or replace only alpha with its key; clears blank settings and drops empty entries → keep whitespace or erase alpha's configured marker; normalizes settings without sending key tail → stop trimming or treat the tail as API key material; propagates an aborted read → swallow its error and return null.
- `screens/auth/__tests__/OwnerRecoverySignIn.unit.test.tsx`: passes translated copy and sensitive input to the failure describer → omit the password or trim removal from the secret list; binds and hides all recovery inputs → miswire the confirmation setter, expose an input to agent reads, or omit the notice; prevents busy submission → drop busy from the disabled predicate.
- `posts/__tests__/post-delete-dialogs.unit.test.tsx`: consequence table → swap page and post wording or show a server trash action for unsaved posts; identifies selected post and disables only that row → remove title or block on every rowSavingId.
- `posts/__tests__/post-settings-dialog.test.tsx`: forwards the keyboard-selected tab and renders publishing controls → ignore the keyboard callback's selected id, or omit the publishing panel.
- `react/entities/__tests__/FailureNotice.unit.test.tsx`: keeps serialization details separate → stringify every input indiscriminately or remove fallback; copies exact clipboard text → omit writeText or write the wrong value; shows failure until copy succeeds and offers right action → treat clipboard rejection as success or swap reload/retry.
- `react/settings/__tests__/SettingsPageLayout.loading-locale-and-tab.unit.test.tsx`: shows version and host hint with no updater → omit the host hint or stop translating Version.
- `react/shell/__tests__/Placeholder.two-hosts.unit.test.tsx`: looks past unrelated groups and labels an ungrouped section → stop lookup after the first group, suppress the note, or use fallback locale for the unknown-prefix port.
- `pages/__tests__/ThemePageDetailsModal.hooks.unit.test.tsx`: controls native dialog and distinguishes dismissal paths → remove preventDefault, close on inner clicks, or omit the close effect.
- `recovery/hooks/__tests__/use-restore-flow.hooks.unit.test.ts`: uses server-issued plan/confirmation and resets → substitute the point ID for the plan ID, omit restartRequired, or retain confirmation token across point changes; reports each failed step and permits retry → remove the corresponding catch/finally or advance on rejection; reports disclosure load failure → convert rejected read to an empty disclosure or suppress error; newer point owns disclosure → omit a point-generation guard (existing code already lacks this guard, so intentionally expected red).
- `recovery/hooks/__tests__/use-recovery.hooks.unit.test.ts`: selects the server-resolved point without reusing the link → use stashed ID, push rather than replace history, or fail to consume envelope; stays in list for malformed/pruned/unlisted/refused link → send malformed JSON, select an absent point, or surface failed re-verification as an error; surfaces router failure → swallow router rejection or omit diagnostics; distinguishes load/capture failure and refreshes on retry → stop clearing action error, stop waiting for refreshed point list, or omit cost acknowledgement.
- `pages/__tests__/use-pages.hooks.unit.test.tsx`: flips publication against row basis and trashes only selected row → omit expectedVersion or filter the wrong row; preserves rows/clears busy after failures → leave locks set or use one fallback for publish and unpublish.
- `posts/__tests__/y5-post-list.test.tsx`: bound controller localizes failures and drops only confirmed row on retry → hardcode English locale, remove from list on rejection, or filter an unrelated row.
- `pages/__tests__/Pages.unit.test.tsx`: names the exact page and clears selection on cancel → omit the selected title or wire cancel to removePage.
- `forms/react/__tests__/FormEditorFieldsBody.unit.test.tsx`: prefers discovered refusal reason → ignore selected.message or expose fields as if selectable when unavailable.
- `pages/__tests__/y5-page-editor.test.tsx` (extended HTML pane scenario): switch to preview and back → drop preview-only device control, remember no scroll, or omit expanded-state label/Escape handling; open chosen template → mount with wrong theme/template; wait for canvas theme styles → mount Interactive before styles are ready.
- `pages/__tests__/y5-page-editor.test.tsx`: recovery and conflict controls → auto-apply recovered draft, cross-wire a button, or show secondary outside-change controls during a conflict; explicit conflict overwrite → retry against stale version or discard working copy by applying the reread; override-bound load failure → use the default locale/port or lose home alias mapping; failed trash and retry → retain an unusable modal lock or navigate after rejection; debounced preview → submit immediately or keep timer after leaving; remembers preview scroll → remove scroll listener or stop restoring saved position; dirty back navigation → bypass confirmation or forget to flush; unsafe canvas transitions → apply pending template/view despite serialization failure or prevent HTML fallback; discard failure → clear the recovery banner or suppress the refusal.
- `forms/react/__tests__/use-form-editor.branches.unit.test.tsx`: create refusal leaves draft → navigate despite rejection or hide the mutation error.
- `forms/react/__tests__/use-form-editor.refresh.unit.test.tsx`: reloads immediately from reverted clean draft → require confirmation even though no edits would be lost, or drop immediate reload.
- `roles/__tests__/Roles.screen.unit.test.tsx`: creates policy and protects built-in/frozen rows → drop description from port write or show row actions on locked policies; renames and separately confirms policy delete → omit expectedVersion or delete on menu selection; saves scoped permission then confirms removal → drop resource type, skip post-write refresh or bypass confirmation; renames custom role and deletes only after confirmation → omit version, expose built-in actions, or delete immediately on menu selection.
- `roles/__tests__/Roles.hooks.tabs.unit.test.tsx`: keeps tab glyphs decorative and paired with the right label → swap the person and shield icons or expose SVG to assistive tech.
- `screens/assistant-settings/__tests__/use-visitor-credential-discovery.hooks.unit.test.tsx`: debounces and ignores old results → remove timer cancellation or cancelled guard, or ignore preset state; typed refusal table → leave state permanently loading or expose opaque failure objects; stored-key cancellation → report the older error after the new request settles or ignore endpoint mismatch.
- `screens/assistant-settings/__tests__/use-visitor-credential-form.hooks.unit.test.tsx`: independent failed saves → treat rejection as success, send whitespace, or include credential in settings; successful connection with failed discovery → rewrite the connection result on refresh failure or rerun discovery after failed connection.
- `screens/assistant-settings/__tests__/VisitorAssistantPanel.unit.test.tsx`: forwards separate switch/widget changes → disallow turning off without a key, use the wrong writer, or omit saving gates; interpolates literal more-info labels and resolves unknown widget → use replacement-string interpolation or choose vanilla on unknown input.
- `screens/assistant-settings/__tests__/VisitorAssistantTabs.unit.test.tsx`: unknown selection falls back without affecting another panel → accept arbitrary id or hoist tab state globally.
- `screens/auth/__tests__/Login.screen.unit.test.tsx`: routes credentials and submit → swap field handlers or drop onSubmit; routes private MFA input and cancel with busy locks → omit setCode, private marker, cancel handler, or busy gate.
- `core/__tests__/y5-settings-tabs.test.ts`: clearing instructions → skip undefined writes or persist undefined; rejects invalid/empty per-theme overrides → return rejected entries as overrides or compare the Classic default case-sensitively; omitted telemetry defaults off → preserve opt-in on omitted fields or dispatch withdrawal after persistence; no-browser/marker-clear path → access an absent browser or suppress the live notification when storage throws.
- `core/__tests__/manifest.test.ts`: uses host mount for route templates and separates parent entities → use the original panel path, leave the query in route templates, or expose parent entity targets on the secondary destination.
- `deployment/api/__tests__/deployment-api.test.ts`: handles omitted revision → return null or use the sent match token as the returned ETag.
- `core/__tests__/i18n-common.test.ts`: nonempty translated strings and placeholder parity → remove a required placeholder or blank a translated value.
- `forms/__tests__/forms-api.conformance.test.ts`: body-only authoring and independent query fields → require mode for authoring or omit URL encoding on the cursor.
- `forms/__tests__/memory-adapter.unit.test.ts`: empty patch keeps the numbered basis → bump the version unconditionally.
- `forms/__tests__/answer-format.unit.test.ts`: bare datetime separator stays raw → let a separator-only match format as the date defaults.
- `comments/__tests__/comments-api.conformance.test.ts`: rejects a non-conflict refusal with the right currentVersion → treat every refusal with that version as a conflict.
- `media/react/__tests__/providers-tab-hooks.test.tsx`: reveals a selected credential independently → treat visible state as one shared boolean per editor or save on reveal.
- `react/shell/__tests__/appearance-arbitration.unit.test.tsx`: switches to pending theme draft and retires it at same-version acceptance → paint a stale theme's accent or retire drafts only when strictly older.
- `react/__tests__/testing-kit.unit.test.tsx`: fixture controls preserve input contract → swap value shape, allow disabled menu action or swallow ref; shell selection → ignore initial or controlled id; select filtering → ignore disabled state/filter or leave dropdown open after selection; clipboard fixture → cache success through later failure; failure channel → accept stale generation or notify unsubscribed listener; chat selection → retain unavailable requested agent or model when no agent is available.
- `posts/__tests__/y5-post-list.test.tsx`: localized loading/list states and selected editor route → ignore locale override, hide loaded table on inline error, or wire the menu to the wrong route builder.
- `posts/__tests__/post-editor-template-picker.test.tsx`: unset template remains untouched until explicit opt-out → coerce the blank choice to null or preselect a template.
- `forms/react/__tests__/submissions-states.unit.test.tsx`: disables destructive UI during deletion → ignore deleting or wire the back action to delete.
- `pages/__tests__/use-interactive-flush.unit.test.ts`: mounted clean editor is a no-op → replace the current working copy with empty HTML when flush returns undefined.
- `screens/assistant-settings/__tests__/AdminSubagents.unit.test.tsx`: absent grant defaults off → make the fallback true.
- `screens/assistant-settings/__tests__/VisitorToolsPanel.unit.test.tsx`: quota draft reset restores server value without write → drop draft reset or publish a write on reset.
- `roles/__tests__/Roles.screen.unit.test.tsx`: old permission save leaves new draft intact → clear fields or reload the old policy after switching; load order and relevant failure → omit generation check and replace the current policy's failed read with old rows.
- `roles/__tests__/rules.unit.test.ts`: delegates uncoded/unknown errors → drop the host fallback or assign an unrelated canned error.
- `forms/react/__tests__/use-form-editor.branches.unit.test.tsx`: provider discovery unavailable is distinct from editor load → treat missing discovery as a fatal editor load failure or hide the provider error.
- `forms/react/__tests__/use-form-editor.refresh.unit.test.tsx`: follows status-only legacy edits → compare unversioned content but omit status.
- `pages/__tests__/editor-html-jump.unit.test.ts`: opaque flush rejection does not masquerade as an Error → forward the thrown string or change the draft despite rejection.
- `pages/__tests__/prettify-html.unit.test.ts`: literal comparisons preserved alongside reformatted real blocks → consume stray '<' as a tag or fail to process the following block.
- `pages/__tests__/page-editor-i18n.unit.test.ts`: untranslated locale keeps message and placeholder → remove English fallback or drop the version token.
- `pages/__tests__/page-editor-rules.unit.test.ts`: partly populated conflict keeps the known side → treat either missing side as grounds to erase both versions.
- `react/components/RowMenu/__tests__/RowMenu.test.tsx`: prior Escape consumption leaves menu open → ignore defaultPrevented in document key handler.
- `react/entities/__tests__/entity-field.test.tsx`: missing relation target list still shows the stored ID → default to empty ID if target options are absent.
- `react/entities/__tests__/use-entity-edit.test.tsx`: late rejection belongs to the previous row → stamp a stale rejection with the current row scope.
- `pages/__tests__/embed-placeholder.unit.test.ts`: another component's readiness cannot label this marker → match on plugin id alone rather than plugin and component.
- `react/__tests__/testing-kit-media-rules.unit.test.ts`: masks only the last four and needs a real key marker → return entire key/tail or give settings-only entries a mask; invalid endpoints → accept a URL parse error or an unsupported scheme.
- `media/adapters/__tests__/http-providers.test.ts`: failed write does not poison queued saves → store the unrecovered rejection as the queue tail or drop the second write's signal.
- `pages/__tests__/y5-page-editor.test.tsx`: first Save after an unreported canvas edit persists it after an empty second flush → discard the preflight flush's HTML and save through the old closure (expected red against current source; see bug notes).

- `react/__tests__/testing-kit.unit.test.tsx`: selected files and preview behavior → drop the file list, preview view, or dismissal callback; wrap and tip state → ignore toggles or share state; prefer supplied loader and prioritize failures → substitute canned data or let a saving/saved slice hide an error.

## Expected-red bug regressions

- BUG `packages/admin/src/recovery/hooks/use-restore-flow.hooks.ts:207-211` — promises from a previous point can overwrite the current disclosure or its error. Gate both settlements on the effect lifetime (or a point generation) and invalidate it during cleanup.
- BUG `packages/admin/src/pages/hooks/page-editor-recovery.hooks.ts:117` and `packages/admin/src/pages/hooks/page-editor-actions.hooks.ts:121-123` — the unchanged-Save preflight can discover and flush an edit, then invoke the save callback from the same render. A second flush that returns no new HTML falls back to that closure's old working copy. Pass through the preflight's HTML on the save path, or make the combined one-flush/save action own that value.

## Scope and verification handoff

Source-to-test map (paths relative to `packages/admin/src`). Counts are test definitions in the diff; parameter tables expand to several cases. Some definitions exercise multiple source files, so per-source counts overlap.

| Source file(s) | Test location and added cases |
| --- | --- |
| `browser/server-reconnect.ts` | `browser-adapter-parity.unit.test.ts`: deadline/transition, six retry-policy cases, five response-shape cases, rejected probe |
| `browser/settings-events.ts` | `settings-events.unit.test.ts`: 3 |
| `comments/conformance/comments-api.conformance.ts` | `comments-api.conformance.test.ts`: 1 |
| `core/i18n-common.ts` | `i18n-common.test.ts`: 1 |
| `core/manifest/rules.ts` | `manifest.test.ts`: 1 |
| `core/settings-tab-appearance.ts` | `y5-settings-tabs.test.ts`: 3 cases |
| `core/settings-tab-preferences.ts`, `core/settings-tab-privacy.ts`, `core/settings-tabs.ts` | `y5-settings-tabs.test.ts`: 1 each, plus each adapter run through settings composition |
| `deployment/api/deployment-api.ts`, `deployment/deployment-i18n.tsx` | `deployment-api.test.ts`, `deployment-i18n.unit.test.ts`: 1 each |
| `forms/adapters/http.ts`, `forms/adapters/memory.ts`, `forms/html-rules.ts` | `forms-api.conformance.test.ts`, `memory-adapter.unit.test.ts`, `answer-format.unit.test.ts`: 1 each |
| `forms/form-editor-refresh.ts`, `forms/react/hooks/use-form-editor-refresh.hooks.ts` | `use-form-editor.refresh.unit.test.tsx`: 2 |
| `forms/react/components/FormProviderSettings.tsx`, `forms/react/components/FormSubmissionDetail.tsx` | `FormEditorFieldsBody.unit.test.tsx`, `submissions-states.unit.test.tsx`: 1 each |
| `forms/react/hooks/use-form-editor-parts.hooks.ts`, `forms/react/hooks/use-form-editor.hooks.ts` | `use-form-editor.branches.unit.test.tsx`: 2 |
| `media/adapters/http.ts`, `media/react/hooks/ProvidersTab.hooks.ts` | `http-providers.test.ts`: 5. `providers-tab-hooks.test.tsx`: 1 |
| `pages/PageEditor.tsx`, `pages/PageEditorPane.tsx`, `pages/PageEditorPreview.tsx` | `y5-page-editor.test.tsx`: 1 existing end-to-end scenario extended across the 3 files |
| `pages/PageEditorNotices.tsx`, `pages/Pages.tsx` | `y5-page-editor.test.tsx`, `Pages.unit.test.tsx`: 1 each |
| `pages/ThemePageDetailsModal.hooks.tsx`, `pages/api/pages-api.ts` | `ThemePageDetailsModal.hooks.unit.test.tsx`, `pages-api.test.ts`: 1 each |
| `pages/hooks/page-editor-actions.hooks.ts` | `y5-page-editor.test.tsx`: conflict, trash, unsafe flush and empty second flush scenarios |
| `pages/hooks/page-editor-load.hooks.ts`, `pages/hooks/use-page-editor.hooks.ts` | `y5-page-editor.test.tsx`: 1 shared override binding/load test |
| `pages/hooks/page-editor-preview.hooks.ts` | `y5-page-editor.test.tsx`: expanded preview/Escape in extended scenario, plus debounce and frame scroll tests |
| `pages/hooks/page-editor-recovery.hooks.ts`, `pages/hooks/page-editor-workspace.hooks.ts` | `y5-page-editor.test.tsx`: back navigation, unsafe canvas transitions, discard failure and unreported edit, plus scroll test in extended scenario |
| `pages/hooks/use-editor-html-jump.hooks.ts`, `pages/hooks/use-interactive-flush.hooks.ts`, `pages/hooks/use-pages.hooks.ts` | `editor-html-jump.unit.test.ts`: 1. `use-interactive-flush.unit.test.ts`: 1. `use-pages.hooks.unit.test.tsx`: 2 |
| `pages/lib/embed-placeholder.ts`, `pages/lib/page-preview-youtube.ts`, `pages/lib/prettify-html.ts` | `embed-placeholder.unit.test.ts`: 1. `page-preview-youtube.unit.test.ts`: 1 + 10 table cases. `prettify-html.unit.test.ts`: 1 |
| `pages/page-editor-i18n.ts`, `pages/page-editor-rules.ts` | `page-editor-i18n.unit.test.ts`, `page-editor-rules.unit.test.ts`: 1 each |
| `posts/PostPublishingFields.tsx`, `posts/PostSettingsDialog.tsx` | `post-settings-dialog.test.tsx`: 1 shared keyboard/publishing test |
| `posts/Posts.tsx`, `posts/PostsColumns.tsx`, `posts/hooks/use-posts.hooks.ts` | `y5-post-list.test.tsx`: 2, shared list and trash workflows |
| `posts/PostsTrashConfirm.tsx`, `posts/editor/PostDeleteConfirmDialog.tsx` | `post-delete-dialogs.unit.test.tsx`: 1 and 3 table cases respectively |
| `posts/api/posts-api.ts`, `posts/editor/template/PostEditorTemplatePicker.tsx` | `posts-api.test.ts`, `post-editor-template-picker.test.tsx`: 1 each |
| `react/components/RowMenu/RowMenu.hooks.tsx` | `RowMenu.test.tsx`: 1 |
| `react/entities/EntityField.tsx`, `react/entities/FailureNotice.tsx`, `react/entities/use-entity-edit.ts` | `entity-field.test.tsx`: 1. `FailureNotice.unit.test.tsx`: 3. `use-entity-edit.test.tsx`: 1 |
| `react/settings/SettingsPageLayout.tsx`, `react/shell/Placeholder.tsx`, `react/shell/appearance.ts` | neighbors `SettingsPageLayout.loading-locale-and-tab.unit.test.tsx`, `Placeholder.two-hosts.unit.test.tsx`, `appearance-arbitration.unit.test.tsx`: 1 each |
| `react/testing-kit-media-providers.ts`, `react/testing-kit.tsx` | `testing-kit-media-rules.unit.test.ts`: 2. `testing-kit.unit.test.tsx`: 9 |
| `recovery/api/recovery-api.ts`, `recovery/hooks/use-recovery.hooks.ts`, `recovery/hooks/use-restore-flow.hooks.ts`, `recovery/rules.ts` | `recovery-api.test.ts`: 2. `use-recovery.hooks.unit.test.ts`: 3 + 4 table cases. `use-restore-flow.hooks.unit.test.ts`: 4. `rules.unit.test.ts`: 3 + 5 table cases |
| `roles/PoliciesSection.tsx`, `roles/PolicyPermissionForm.tsx`, `roles/PolicyRow.tsx`, `roles/RoleConfirmDialogs.tsx`, `roles/Roles.tsx`, `roles/RolesSection.tsx` | `Roles.screen.unit.test.tsx`: 4 shared workflows across the six components |
| `roles/hooks/roles-permission-actions.ts`, `roles/hooks/roles-row-actions.ts`, `roles/hooks/use-roles-mutations.hooks.ts`, `roles/hooks/use-roles.hooks.ts` | `Roles.screen.unit.test.tsx`: 6 shared workflows and overlapping read/save cases |
| `roles/Roles.hooks.tsx`, `roles/rules.ts` | `Roles.hooks.tabs.unit.test.tsx`, `rules.unit.test.ts`: 1 each |
| `screens/analytics/api/analytics-api.ts` | `analytics-api.test.ts`: 1 |
| `screens/assistant-settings/AdminSubagents.tsx`, `VisitorAssistantPanel.tsx`, `use-visitor-assistant-panel.hooks.ts`, `use-visitor-assistant-tabs.hooks.ts` | `AdminSubagents.unit.test.tsx`: 1. `VisitorAssistantPanel.unit.test.tsx`: 2 shared panel/controller. `VisitorAssistantTabs.unit.test.tsx`: 1 |
| `screens/assistant-settings/use-visitor-credential-discovery.hooks.ts`, `use-visitor-credential-form.hooks.ts`, `use-visitor-tools.hooks.ts`, `visitor-credential-form-actions.ts` | `use-visitor-credential-discovery.hooks.unit.test.tsx`: 2 + 2 table cases. `use-visitor-credential-form.hooks.unit.test.tsx`: 2 shared form/actions. `VisitorToolsPanel.unit.test.tsx`: 1 |
| `screens/auth/Login.tsx`, `OwnerRecoverySignIn.hooks.ts`, `OwnerRecoverySignIn.tsx`, `api/auth-api.ts` | `Login.screen.unit.test.tsx`: 2. `OwnerRecoverySignIn.unit.test.tsx`: 1 controller + 2 UI. `auth-api.test.ts`: 2 |

### Exceptions proposed, not applied to coverage

- EXCEPTION `browser/server-reconnect.ts:61` — the duplicate-status guard cannot be reached through legitimate public transitions because polls share a promise and markReachable only makes unreachable → online.
- EXCEPTION `core/i18n-common.ts:91,278` — throws guard private, static tables without a public malformed-input seam. Existing key parity and new invariant tests validate the real data.
- EXCEPTION `core/manifest/rules.ts:186` — the owner is derived from the same stable panel declarations that supplied the page id. Faking a self-mutating manifest would not exercise a supported contract.
- EXCEPTION `pages/lib/prettify-html.ts:159` — the nonoptional name capture is populated on every regex match.
- EXCEPTION `pages/PageEditorPane.tsx:104-105`, `pages/hooks/page-editor-workspace.hooks.ts:247-248` — temporary dev timing instrumentation only, not an editor behavior.

No whole file marked SKIPPED-ALREADY-COVERED because every listed file reported a gap; covered subpaths were not duplicated. No local branch map was furnished for blank-line entries, so these are targeted branch-gap candidates, not measured closure. Any surviving reachable branch should be triaged using the cloud report. No coverage tooling or tests executed here.
