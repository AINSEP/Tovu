## 1. Disposition

| Item | Status | Executor scope |
|---|---|---|
| B1 | **READY-FOR-CODEX** for Page content | Add a Watch on YouTube link to the Preview pane for saved and pending Page content. See §4 for embeds supplied only by a template or widget. |
| B2 | **READY-FOR-CODEX** for Pages and Posts. **NEEDS-DECISION** for Forms. | Recheck on focus and after Save settles. Keep version-checked writes and give the conflict banner both recovery actions. |
| B3 | **READY-FOR-CODEX** | Use the existing translated Page-load copy for every initial-load failure. |
| B4 | **PARTIAL** | The race and regression test are pinned on merge-11. The required post-null branch is absent from both local Tovu checkouts. |
| B5 | **READY-FOR-CODEX** | Jini supplies safe interruption copy. Tovu supplies its approved sentence. |
| B6 | **READY-FOR-CODEX** | Repoint the approval wire golden to `RUN_FINISHED` and retain the ordinary max-turns control. Test-only. |
| B7 | **READY-FOR-CODEX** | Keep the plan warning assertion and pin the push refusal. Test-only. |
| B8 | **READY-FOR-CODEX** | Three helper splits. Both original why-comments are quoted for the backlog. |

Tovu merge-11 is `311d26dfa6`. Jini merge-11 is `1ac1cbbd1`, published as `0.7.3-next.2`. Line numbers below refer to those bases. The executor order is test-source edits first, then production-source edits where applicable. The named mutations describe what verification should catch. This dispatch changed no files and ran no tests, builds, installs, or type-checks.

For admin copy below, **all locales** means English source keys plus `es`, `id`, `de`, `zh-CN`, `zh-TW`, `pt-BR`, `ru`, `fa`, `ar`, `ja`, `ko`, `pl`, `hu`, `fr`, `uk`, `tr`, `th`, `it`, `hi`, `ur`, and `bn`.

## 2. READY sheets

### B1 · Tovu · merge-11 · 2,000 executor tokens

**Tests first.** In `apps/admin/src/features/pages/__tests__/PageEditor.unit.test.tsx:702–875`, use the existing injected controller fixtures. Add:

- `clean published Preview links to the saved YouTube video` — a `youtube-nocookie.com/embed/<id>` iframe yields a named link with canonical `href`, `_blank`, and `noopener noreferrer`.
- `pending Preview links to the working copy's videos` — use different saved and pending IDs. Only the pending IDs appear, in document order with one link per ID. Cover the hidden POST branch and its unchanged sandbox and referrer policy.
- `a document-format Page links to its YouTube node in Preview` and `fake YouTube hosts and other editor tabs have no watch link`. Use a deceptive hostname and a non-YouTube iframe. These are scope controls.

The three positive cases lack a link on the base. Mutations `drop-preview-links`, `use-saved-html-for-pending-preview`, and `skip-doc-youtube-nodes` kill their respective cases. `accept-host-substrings` kills the deceptive-host control.

**Edit.** Both branches in `apps/admin/src/features/pages/PageEditor.tsx:1361–1426` use `template-preview.ts:213–221`. Its renderer, `template-preview-render.ts:132–210`, serves the saved or pending body through the theme, with a bare-page branch. Rich text produces a `youtube-nocookie.com` iframe in `render/doc/nodes-media.ts:165–181`.

Add a pure `pagePreviewYoutubeIds({ html, bodyJson }, _optional = {})` in `apps/admin/src/features/pages/lib/page-preview-youtube.ts`. Parse Page HTML in a detached `<template>`, read actual iframe `src` attributes, and accept only HTTPS YouTube and YouTube No Cookie origins with an exact `/embed/<id>` path. For legacy doc Pages, walk `content` nodes and read `attrs.src` from `type: "youtube"` nodes. Recognize `watch?v=`, `/embed/`, `/shorts/`, and `youtu.be/<id>` on the corresponding exact origins. Reject user info and validate the complete ID with `^[\w-]{1,32}$`. Construct `https://www.youtube.com/watch?v=<id>` from the ID and deduplicate.

`PageEditor:729` passes `page.bodyJson` for document-format Pages through `PageEditorPane:987` to `PagePreview:1202`. The existing `html` prop supplies the working HTML. `PagePreview` calls the helper and renders the links beside the existing preview hint at `:1273`, in the admin pane outside the opaque iframe. Both Preview branches and fullscreen use this one link row. The admin-owned anchor can open YouTube without inheriting the frame sandbox. These are the only callers.

**Copy and STOP.** Add `Watch on YouTube` to `pageEditorMarkupTranslations` in `page-editor-i18n.ts:21`, all locales. Keep the public renderer, iframe attributes, route CSP, and storage untouched. Stop if the reproducing video comes solely from a template or widget. That needs the rendered-preview follow-up in §4.

### B2 · Tovu · after `codex/tv-post-editor-null` · 4,500 executor tokens

**Tests first.** Extend `apps/admin/src/features/posts/__tests__/post-editor-external-refresh.unit.test.tsx` and `apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts:2173–2460`.

- `focus checks the version without an assistant bus event` — for each editor, a clean copy adopts the newer title and body. A dirty copy keeps typed text and the old basis and shows a choice. In Pages, also use a clean-looking Interactive tab with buffered canvas text. The focus cases are red on base. Mutation `remove-focus-recheck`.
- `a refresh ignored during Save is checked once after settlement` — defer Save and the refresh read separately. Make the first read settle while saving. After Save settles, assert one new read by saved ID. Cover success with a newer write and a clean buffer, and `VERSION_CONFLICT` with a dirty buffer. In the conflict case assert repeated normal Save sends the original basis and the assistant’s version remains stored. The missing second read makes both variants red. Mutation `remove-save-settlement-recheck`.
- `stale Save offers Load latest and Replace their version` — mount the real notice through `PageEditor.unit.test.tsx` and the Post view through `post-editor-agent-drive.unit.test.tsx`. Assert discard copy and a single conflict choice. Reload failure keeps text and any standing draft. Reload success clears the conflict, discards the old draft, and keeps an old autosave refusal from pausing autosave again. Deliberate replacement re-reads the basis and retains the original Save or Publish intent. Mutations `remove-stale-load-latest`, `restore-save-anyway-label`, and `advance-post-basis-before-overwrite-succeeds`. The direct action and label are red on base. For the last mutation, have the deliberate overwrite fail ordinarily after re-reading and verify the next normal Save still uses the old basis.
- Keep the existing clean same-tab refresh, no-op refresh, slug-uniqueness 409, and autosave cases as controls.

**Edit.**

1. In `apps/admin/src/hooks/use-external-entry-refresh.hooks.ts`, extend `ExternalEntryRefreshInput:21` with editor route identity and a save-settlement counter. Near `useExternalEntryRefresh:59`, add a window-focus effect with listener cleanup and a separate effect that calls the existing `checkForExternalChange` once when the current route’s counter advances. Skip initial mount and route changes. The existing bus remains wired through the two editors. Keep the save and refresh generations separate. Associate a pending notice with its row ID. Guard both refresh settlements against a different route or row and guard the explicit Load latest apply against a Save that began during its read. Preserve failed-read behavior and the existing order of draft discard, basis supersede, and apply.
2. Pass the new inputs at Pages `hooks/use-page-editor.hooks.ts:961` and Posts `hooks/use-post-editor.hooks.ts:840`. Advance the counter in each current-generation `runSave` `finally`, at base `:843–847` and `:948–953`, alongside clearing `saving`. The effect runs after the accepted basis or conflict commits. Keep `pageRefreshMayHaveUnsavedEdits` and the existing refresh/apply callbacks. Keep normal Save based on the loaded version. In Post `saveOverwritingConflict:1051`, remove the premature `setPost(fresh)` and pass `fresh.version` solely as the deliberate retry’s expected version. Pages already passes the fresh basis to its explicit retry.
3. In `PageEditor.tsx`, wire `PageEditorNotices` at `:567` and `:819` to pass its existing `onLoadExternalChange` to `PageVersionConflictBanner:384`. In Posts, wire the existing `loadExternalChange` through `editor/notices/PostEditorNotices.tsx:31,70–79` to `PostVersionConflictBanner.tsx:19–59`. `hooks/use-post-editor-screen.hooks.ts:86` and `PostEditor.tsx:63` already forward the handler. Show the stale-save choice ahead of duplicate background-version or paused-autosave banners. The conflict’s Keep editing dismisses that conflict and the parallel external-change prompt for the same basis. Keep the existing automation overwrite handles. Add the direct Load latest button and change only the conflict overwrite button’s label.
4. In `pages/rules.ts:444` and `posts/rules.ts:139`, remove the sentence that says another ordinary Save will replace their version. The existing basis and unsaved-work copy still applies. Update the Post rule assertions in `posts/__tests__/rules.unit.test.ts:741,748` and the existing Page dictionary entries and notice assertions that pin the old sentence.

**Copy and STOP.** Use `Load latest`, `Loading the latest version discards your unsaved edits.`, and `Replace their version`. Add the new translations to `page-editor-i18n.ts` and use its existing fallback from `useWiredPostEditor:1230` for shared keys. Update the translated Page conflict sentence in all locales. Leave the unchanged-save confirmation’s `Save anyway` alone. Use the existing injected editor hooks and ports. Stop if the post-null merge changed the loaded-version contract or a test requires advancing the saved basis while retaining dirty text.

### B3 · Tovu · merge-11 · 650 executor tokens

**Tests first.** In `apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts:2480`, repoint `reports an initial load failure without hydrating a page` to expect `en:failed to load page` for both an `Error("private transport canary")` and a thrown non-Error. Add the same expectation for a rejected presentation read and assert the canary is absent. Keep the superseded-route and canonical redirect cases. The `Error` paths are red on base. Mutation `restore-page-load-error-message` restores the error-message selection.

**Edit.** In `apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:546–549`, let `fetchInitial` return the existing `Promise.all` directly and remove dependencies used only for the catch. At `:650–652`, keep the cancellation guard and use `setError(t({ locale, key: "failed to load page" }))`. The `initial` loader and `PageEditor.tsx:804` remain the callers. This mirrors the post fix’s described behavior through the Page editor’s existing translator.

**Copy and STOP.** `PAGE_EDITOR_HOOK_DICT` at `page-editor-i18n.ts:65–380` already has `failed to load page` in all locales. Stop if the initial load acquires a separately designed typed recovery action. Preserve that action and apply the plain message only to the remaining load failure path.

### B5-J1 · Jini · merge-11 · 650 executor tokens

**Tests first.** In `packages/chat/src/core/ag-ui/__tests__/run-frames.test.ts:69`, repoint `a reader rejection writes RUN_ERROR and returns the same error`. Use a private canary in the thrown `Error`. Assert the wire message equals `The response was interrupted. Try again.` and the returned failure carries the original error by identity. Add the non-`Error` rejection variant using the same fixture. Both are red with the raw catch. Mutation `restore-raw-transport-copy`.

**Edit.** In `packages/chat/src/core/ag-ui/event-projection.ts:256–282`, use the fixed sentence at `:280`. Keep segment closure before the one terminal error and keep the returned failure. The explicit daemon error frame still goes through `writeFrameOutcome:231` and its existing `run-frames.test.ts:41` control. The only Jini callers of the drain are in `run-frames.test.ts`. Tovu’s caller follows in B5-T.

**Copy and STOP.** Library default sentence, no locale additions. Stop if the base has moved transport exceptions and explicit daemon error frames into a shared catch. Keep those cases distinct.

### B5-J2 · Jini · after B5-J1 · 550 executor tokens

**Tests first.** In the same Jini test file add `a host can supply the interruption message without exposing the rejection`. Pass a distinct host sentence, collect a partial-text frame followed by a controlled reader rejection, and assert `TEXT_MESSAGE_END` precedes the one `RUN_ERROR` with that sentence. Check the original error still reaches the returned outcome. Red against B5-J1 because the host sentence is unused. Mutation `ignore-host-interruption-message`.

**Edit.** Add the optional second argument to `drainRunFramesToAgUi` in `event-projection.ts:256`:

```ts
{ interruptionMessage = "The response was interrupted. Try again." }:
  { interruptionMessage?: string } = {}
```

Use `interruptionMessage` at `:280`. Keep the existing first argument, export, default-path callers, and terminal mappings. Only the new Jini test and B5-T pass the new option.

**Copy and STOP.** No additional locale keys. Stop if the existing package entry point would need a separate export or if `jx-err1` or `jx-err2` has changed this declaration. In the latter case, apply after the overlapping job and repin the anchors.

### B5-T · Tovu · after B5-J2 is consumable · 450 executor tokens

**Test first.** Keep the existing red witness `a dropped daemon stream closes partial text and reports a private interruption message` in `apps/website/src/server/__tests__/assistant-ag-ui-wire.golden.test.ts:209–218`. At next.2 it sees `aborted`. With Jini’s new default alone it still fails the exact Tovu message assertion. Mutation `omit-tovu-interruption-message`.

**Edit.** In `apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts:285–289`, pass the drain’s second object as:

```ts
{ interruptionMessage: "The assistant’s response was interrupted. Send your request again." }
```

The existing `@jini-ai/chat/core/ag-ui` import, response end, and run-tracker outcome stay in place. This is the sole Tovu call. `tv-err1` reported its old local-drain edit stopped at this delegation seam.

**Copy and STOP.** Exact approved wire copy, no admin dictionary change. Stop until the executor’s base resolves a Jini package with the new signature. Package publication and dependency pickup are prerequisites outside this source-and-test-only job.

### B6 · Tovu · merge-11 · 900 executor tokens · test-only

**Test first and edit.** In `apps/website/src/server/__tests__/assistant-ag-ui-wire.golden.test.ts:50–87,268–285` rename the first script to `mixed payloads stop at pending approval` and retain its original input frames, including the tail after approval. Rename and repoint the matching first entry in `__tests__/goldens/assistant-ag-ui-wire.golden.json:2`. In its `body`, keep the existing bytes through the `RAW` event for `raw line`, then append just:

```text
data: {"type":"RUN_FINISHED","threadId":"thread-golden","runId":"run-golden","outcome":{"type":"interrupt","interrupts":[{"id":"approval-1","reason":"confirmation","message":"Allow action?","toolCallId":"call-1"}]}}
```

End the frame with `\n\n`. Preserve the exact headers, status, and EOF assertions. The old expectation is already red on merge-11. Mutation `treat-marked-approval-as-a-card` produces the old CUSTOM event and tail and fails the new bytes.

Keep the original max-turns body as a separate `unmarked payloads, then end with max_tool_turns` entry. For its script, keep the same stream and omit `pendingApproval` from the MCP-UI payload. This retains the unmarked card and the tail’s existing wire coverage. Match key order in `SCRIPTS` and the fixture. Keep the single-approval golden as a control. The fixture reader and exact-key check are the only consumers touched.

**Copy and STOP.** No locale changes. Hand-edit only the two test files. Stop if the known interrupt field order differs on the integration base. Confirm precedence against the existing single-approval fixture before changing expected bytes.

### B7 · Tovu · merge-11 · 550 executor tokens · test-only

**Test first and edit.** In `apps/website/src/features/site-backup/__tests__/tool-registrations.unit.test.ts:1430–1439`, rename the case to `the plan reports credential warnings and push refuses before writing`. Keep the seeded sanitizer and exact `planned.credentialWarnings` assertion. Assert that the plan ID is present, record `h.github.writes().length`, call the real push tool, and assert:

```ts
{
  pushed: false,
  cancelled: false,
  code: "UNSAFE_FILE",
  message: "The export contains files with possible credentials. Remove the credentials and export again.",
}
```

Assert the write count is unchanged. The obsolete success assertion is already red on base. Mutation `bypass-Q3-warning-refusal` at `backup-service.ts:696` allows the fixture to write and fails both new assertions. The existing planner and push tool harness are the only callers touched.

**Copy and STOP.** No locale changes. Stop if the fixture fails before the Q3 guard. Repair its setup within the test so repository reinspection succeeds and the warning refusal is the outcome under test.

### B8a · Tovu · merge-11 · 1,150 executor tokens

**Witness first.** The recorded `check:complexity` red is `pushPlannedBackup` 11. The recorded `check:size` red is `backup-service.ts` 547 against 535. For behavior use the existing successful push test at `features/site-backup/__tests__/tool-registrations.unit.test.ts:664` and the stopped-push cases in `push-cancellation.unit.test.ts`. Mutations `forward-current-parent-instead-of-planned-parent` and `commit-after-abort` must fail the existing planned-parent and cancellation assertions. These behavior tests characterize the split. The static gates are the base-red witnesses.

**Edit.** In `apps/website/src/features/site-backup/backup-service.ts:681–729`, extract the commit and success projection at `:707–728` into `commitBackupPlan({ provider, target, plan, entries }, _optional = {})` in sibling `push-content.ts`, after `uploadBackupPlan:29`. Use existing `SourceControlProvider`, `CredentialedRepositoryTarget`, and `CommitBackupTreeInput["entries"]` types from `source-control/provider-module.ts:117,164`. Move the commit input and success fields verbatim, substituting `entries` for `uploaded.entries`. Return the false provider result unchanged and wrap the success projection in `{ ok: true, result }` with literal discriminants. `pushPlannedBackup` calls the helper after its abort check, preserves the existing `providerRefusal`/`pushRefusal` line for failure, and returns `committed.result` on success.

Move no checks across the upload or commit. `runObservedBackupPush:731` and `pushSiteBackup:779` retain their calls, as do the tool registry and system route. The caller loses the success-path `??` branch and enough source lines to come in below 535.

**Copy and STOP.** No locale changes. Stop if the moved code requires a circular runtime import, a change to the provider call, or a change to the abort boundary. Keep all pads and comments.

### B8b · Tovu · merge-11 · 550 executor tokens

**Witness first.** The recorded `check:complexity` red is `useCopyKeys` 11. Use `shows omitted saved keys for each source` in `apps/admin/src/features/security/__tests__/CopyKeysDialog.unit.test.tsx:25` and the forged-selection and pending-approval controls in `hooks/__tests__/use-copy-keys.unit.test.tsx:24,31`. Mutation `drop-second-source-omission` fails the dialog test.

**Edit.** In `apps/admin/src/features/security/hooks/use-copy-keys.hooks.ts`, move the exact `source?.keys.flatMap(…) ?? []` expression from `useCopyKeys:69` into a local pure `copyKeyOmissions({ source }, _optional = {})` beside `copyKeyRows:15`. Replace `:69` with `omissions: copyKeyOmissions({ source })`. This moves the optional-chain/default branches out of the hook. Keep the predicate, including its `undefined` comparison and treatment of zero. `useWiredCopyKeys:77`, `AccessTokensTab.tsx:104,114`, and the consumers of the returned controller need no edits.

**Copy and STOP.** No locale changes. Stop if the active gate attributes fewer than two branches to that expression. In that case also extract the existing `error ? t(error) : ''` and results projection together, verbatim, into a local pure helper.

### B8c · Tovu · merge-11 · 650 executor tokens

**Witness first.** The recorded `check:complexity` red is `reconcilePluginActivationsOnce` 13. Use `a plugin that keeps failing the same way is logged once, and retried with backoff, not every pass` and the detach test in `apps/website/src/server/runtime/composition/__tests__/agent-daemon-deps.plugin-activation-poll.test.ts:120,58`. Mutations `skip-backoff-decrement` and `skip-detaching-disabled-plugin` fail those respective tests.

**Edit.** In `apps/website/src/server/runtime/composition/plugin-activation-polling.ts:46–66`, move `:60–65` verbatim to a local `removeDisabledActivations({ deps, enabledVersions, attachedIds, failures }, _optional = {})`. Call it after the existing sequential attach loop. Type the collections with the existing `Set<string>` and map value types. This moves both cleanup loops and both conditions, taking four branches out of the reconciler. Preserve the public `_optional = {}` at `:48`, the per-call default failure map, failure-map deletion before detachment, and all attach/backoff logic. `startPluginActivationPolling:134` and the existing tests keep their calls.

**Copy and STOP.** No locale changes. Stop if a split would reorder attach, failure cleanup, or detach.

**B8 why-comments inventory.** These are the two reported rows and the original blocks from `origin/refactor/terra`. Leave them as inventory for this dispatch.

`apps/website/src/features/site-backup/share-service.ts:126–131` · `b3ec582b7325`

```ts
/** Acknowledge this immutable archive, then reuse its original delivery lifecycle. Public uploads
 * are deferred until this explicit action; replays return the acknowledged row without reuploading.
 * Revocation tombstones remain authoritative across racing updates.
 * @throws SiteShareRefusal for a missing/revoked export or unavailable original storage.
 * @complexity O(archive bytes) for a pending remote delivery, O(1) for ZIP-only exports/retries.
 */
```

`apps/website/src/server/runtime/composition/modules/site-search.ts:64–67` · `096121b6167d`

```ts
/**
 * The custom-credential label for a provider, e.g. `Tovu Search — Meilisearch`.
 * @complexity O(label length).
 */
```

## 3. Batched Codex jobs

| Order | Repo | Sheets in execution order | Dependency | Est. executor tokens |
|---|---|---|---|---:|
| 1 | Jini | B5-J1 → B5-J2 | Merge-11; after an error job only if it touches the drain | 1,200 |
| 2 | Tovu | B6 → B7 → B5-T | B6/B7 can start on merge-11. B5-T follows the Jini package pickup. | 1,900 |
| 3 | Tovu | B1 → B3 → B2 | B2 follows `codex/tv-post-editor-null`. Apply B4 before B2 if the branch becomes available in time. | 7,150 |
| 4 | Tovu | B8a → B8b → B8c | Merge-11. Apply after B7 if the handoff combines backup changes. | 2,350 |

## 4. Partial items and decision

- **B1 rendered-only embeds.** The READY sheet reads Page-owned HTML or rich text. A player emitted solely by a template, resolved widget, or runtime script is outside that input. The supplied evidence established the sandbox and render paths but did not identify the reproducing Page’s player source. If its player is rendered-only, the missing pin is an existing safe way to pass validated video IDs from the rendered preview to the admin-owned pane.
- **B2 Forms — NEEDS-DECISION.** Should Form-editor **definition Save** gain the version check while the enable/disable action retains its current status-only behavior? **Recommend yes.** `forms-ports.ts:20–23` already publishes the scoped event through a port. Jini’s wired editor at `packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts:177` does not consume it, and `use-form-editor-parts.hooks.ts:54–72` seeds a form only once per route. The ordinary Tovu PUT at `routes/forms/update.ts:42–55` does not accept an editor version, while `authoring.ts:43–53` already does. Jini’s status write intentionally compares against the row it reads. The follow-up should pin a Jini editor read/apply-or-prompt test and a Tovu stale definition PUT refusal before enabling it. The missing contract is how a versioned ordinary PUT containing both a definition patch and status should behave. Recommend preserving legacy unversioned calls and keeping the editor’s two actions separate.
- **B4 — PARTIAL, after `codex/tv-post-editor-null`.** Both local `git show` attempts failed to resolve the requested branch. On merge-11 the race is at `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:722–763`. The failing test belongs in `posts/__tests__/use-post-editor.hooks.unit.test.tsx`: hold A’s load, rerender the same hook on B, let B hydrate in a live TipTap editor, then resolve or reject A. Assert B’s text, title, basis, templates, and navigation stay current and A’s rejection produces no banner. Mirror the cleanup flag from Pages `use-page-editor.hooks.ts:626–656`, guarding the entire success and failure paths. Mutation `remove-post-load-cleanup-guard` makes the late A settlement visible. The missing branch diff is needed to pin the exact insertion around its deferred live-editor apply and `reportPostLoadFailure` without re-sheeting that fix.
