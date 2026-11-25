REVISED r62t-rev-p1: 5 SOL sheets (3 Jini / 2 Tovu), 6 OPUS sheets

**Merge-21 pins:** Tovu `7c87b3c3f9` and Jini `010c8cd87`, at `origin/integ/merge-21-2026-11-24`. Changed anchors were checked against those refs. No files were changed and no tests, builds, installs, or type-checks were run. `A/` means Tovu `apps/admin/src/`, `W/` means Tovu `apps/website/src/`, and `J/` means Jini `packages/`.

These are behavior sheets. Keep the moved forms route and post notice in Jini. Do not start `A-K2-pages-3`, `RT-K1-adm-posts-2`, `K5-pages-1`, or `K5-post-3`. If an in-flight move lands first, re-pin the affected hunk and preserve the composition boundary. Keep optional argument pads and why-comments. New non-React functions take two argument objects. Inject custom hooks as required props. Keep functions at most 80 lines and complexity at most 10. No sheet needs a schema migration.

The five TODO steps are J1, J3, T1, T2, and T4. J2 is partly done because Jini `c9ede7ece` already sanitizes one refused-arguments dialect. T3 is partly done because PageEditor already links page-owned YouTube videos and the shared HTML renderer already exists. Neither partial fix substitutes for the remaining work below.

## Jini SOL

### P1-J3.J · Jini · BUILDER: SOL

**Files and implementation**

- In `J/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx:17–55`, add `useEffect` and `useRef` to the React imports. In `ResourceCardMenuItems` attach `const menuRef = useRef<HTMLDivElement>(null)` to the `role="menu"` div. Use this effect:

  ```tsx
  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, []);
  ```

  The component mounts only while the menu is open (`:101`), so empty dependencies mean once per open. Do not add `busy` to the dependencies. Use the same `'[role="menuitem"]:not(:disabled)'` selector in the existing arrow-key `querySelectorAll` at `:35`. If no item is enabled, leave focus on the trigger.

- In `J/ui/src/features/resource-dashboard/react/hooks/useResourceBoard.ts:175–199`, change the Escape branch at `:186` to run these statements in order:

  ```ts
  menuContainerRef.current?.querySelector<HTMLButtonElement>("button.jini-resource-board-card-more")?.focus();
  setOpenMenuId(null);
  ```

  The ref is on the current open card’s `.jini-resource-board-card-menu-anchor`. Its first child is the kebab trigger (`ResourceCardParts.tsx:79–85`). Outside `mousedown` stays close-only. Keep native Enter/Space activation and the existing bubbling guards. No prop or collaborator changes.

**Tests first.** Under `J/ui/src/features/resource-dashboard/__tests__/`:

- `ResourceCard.test.tsx` — `opening by click or keyboard focuses the first enabled item` → `skip-open-focus`. `opening with no enabled items leaves focus on the trigger` → `focus-disabled-menu-item`. Use `busy: true`, which disables every item, and assert `document.activeElement` is the `aria-haspopup="menu"` trigger.
- `ResourceBoard.test.tsx` — `Escape returns focus to the exact trigger after opening a second card's menu` → `skip-escape-focus-restore`. `outside click keeps focus on the clicked control` → `restore-focus-on-outside-click`. Use the actual board hook and two distinct triggers.

Preserve the why-comments for the inside `mousedown` guard and the trigger keydown guard. Explain why only Escape restores trigger focus.

**Package:** No export, API-baseline, or i18n delta. Add `.changeset/ui-resource-board-menu-focus.md` (`patch`).

### P1-T1.J · Jini · BUILDER: SOL

Patch the already-extracted ordinary form PUT spec. Do not convert or remount it.

**Files and contract.** In `J/cms/src/admin-http/routes/forms/update.ts:25–39,44–107`, widen the injected writer to:

```ts
type FormsUpdateDefinitionFn = (
  required: { input: FormsUpdateWriteTarget & { patch: FormsUpdatePatch } },
  optional?: { expectedVersion?: number },
) => Promise<{ definition: FormDefinitionRecord }>;
```

Add required `versionedUpdateMessages` to `FormsUpdateRouteDeps`, with `mixedStatus`, `missingDefinition`, and `stale` strings. P1-T1.T supplies them. Preserve `FormsUpdateInput`, `defineJsonRoute`, and the guarded `authorizeForms` at `:98`, ahead of validation and reads.

Inside the existing `try` in `handle`, call `parseExpectedVersion({ value: body.expectedVersion })` from `@jini-ai/core/optimistic-concurrency`, as in `authoring.ts:58`. Keep the parsed value in scope for the `catch`. Inside that same `try`, before any write or no-op lookup, reject a supplied version plus any own `status` key, and reject a supplied version plus zero recognized definition fields. Use `rejectRoute` from `@jini-ai/core/errors/route-refusal`:

```ts
rejectRoute({ status: 400, error: deps.versionedUpdateMessages.mixedStatus, code: "VALIDATION_ERROR" });
rejectRoute({ status: 400, error: deps.versionedUpdateMessages.missingDefinition, code: "VALIDATION_ERROR" });
```

These are flat bodies without details. A malformed version reaches `rejectFormsWriteError` through the existing catch and maps to 400 `VALIDATION_ERROR`. Give `resolveFormUpdateResult` a new `expectedVersion` key on its first argument object. Pass `{ expectedVersion }` as the second argument **only** to `deps.updateFormDefinition({ input: { ...target, patch } }, { expectedVersion })` when defined. Preserve the one-argument writer call when omitted. Never pass a basis to `setFormDefinitionStatus`, which is unreachable on the versioned path.

In the `catch`, before falling through to `rejectFormsWriteError`, test `err instanceof RecordVersionConflictError && expectedVersion !== undefined` and use:

```ts
throw new RouteRefusalError({
  status: 409,
  body: { ...versionConflictBody({ error: err }), error: deps.versionedUpdateMessages.stale },
});
```

Import `RouteRefusalError` from the same refusal subpath and the conflict helpers from `@jini-ai/core/optimistic-concurrency`. Leave `forms/write-error.ts:24–38` untouched. An unversioned empty or ignored request remains a read. Unversioned status-only and mixed requests retain their behavior. `buildFormPatch` still picks only `name`, `fields`, `notify`, and `provider`. It never picks `expectedVersion`, `slug`, `mode`, or `html`. CAS stays in the service/repo.

**Tests first.** In `J/cms/src/admin-http/routes/forms/__tests__/update.test.ts`, update the shared `deps()` fixture at `:12–21` to supply `versionedUpdateMessages` and let the writer fake record its second argument. Add:

- `a versioned definition PUT forwards the basis separately from the patch` → `drop-writer-options`.
- `a versioned PUT with any status key refuses before either write` → `allow-mixed-versioned-status`.
- `a versioned PUT with no definition fields refuses before lookup or write` → `versioned-empty-is-legacy-read`.
- `malformed expectedVersion is a 400 without a write` → `coerce-version-string`.
- `a stale ordinary PUT uses the injected copy and keeps VERSION_CONFLICT details` → `use-unclassified-conflict-copy`.
- `unversioned empty, status-only and mixed requests keep their current behavior` → `require-version-for-all-puts`.

Preserve why authorization precedes the no-op read and why a conditional definition write cannot be paired with a separately committed status update.

**Package:** Keep `./admin-http/routes/forms/update` and its boundary classification at `J/cms/package.json:612,902,3941`. Add `.changeset/cms-versioned-form-put.md` (`minor`). Opus combine owns `pnpm api:update` for the writer options and injected copy. Integrate with P1-T1.T in the same combine because the mount supplies the new required fields.

### P1-T4.J · Jini · BUILDER: SOL

**Files and implementation.** On the existing `onLoadLatest` button in `J/admin/src/posts/editor/notices/PostVersionConflictBanner.tsx:46`, add:

```tsx
{...agentHandle(
  { handle: "post-version-conflict-load-latest" },
  { role: "button", label: "Load latest version, discarding my unsaved edits" },
)}
```

Keep the clicked action, visible label, injected `versionConflictMessage`, and sibling handles unchanged. No signature change or new host injection.

**Test first.** `J/admin/src/posts/__tests__/post-editor-notices.test.tsx:53` — `Load latest carries the post conflict agent element, role and label`. Assert all three attributes on the button by its visible name. `drop-post-load-latest-handle` must turn it red. Do not change the accessible name to the agent text.

**Package:** Existing `./posts/editor/notices/PostVersionConflictBanner` export at `J/admin/package.json:645,4121`. No API-baseline delta. Add `.changeset/admin-post-conflict-load-latest-handle.md` (`patch`). The host DOM snapshot updates in P1-T4.T after consuming the fixed package.

## Tovu SOL

### P1-T1.T · Tovu · BUILDER: SOL

**Files and implementation.** At `W/server/runtime/composition/modules/forms-admin.ts:50–65,82–99`, leave the mount, authorization, repo, executor, clock, ID generator, change sets, and outbox wiring intact. Bind the ordinary writer at `:88` as `updateFormDefinition: ({ input }, optional = {}) => updateFormDefinition({ deps: formWriteDeps({ deps }), input }, optional)`. `W/features/forms/index.ts:119–124` already passes the options into the package write service. Inject `versionedUpdateMessages`:

- `mixedStatus` — “Save the form and change its status as two separate actions.”
- `missingDefinition` — “Send at least one form field you want to change.”
- `stale` — “This form changed since you opened it. Reload it before saving.”

In `openapi/010-forms.yaml:58–74,179–200`, document optional non-negative safe-integer `expectedVersion`, the 400 combinations and malformed values, the flat 409 with version details, and the definition DTO’s already-emitted `version`. Qualify the ignored-key and no-op comments so they apply to legacy unversioned requests.

At `A/features/forms/forms-i18n.ts:9–16` and `A/integrations/jini-admin/forms-ports.ts:20–31`, keep the current dictionary and scoped subscription bindings. P1-J1.J supplies the new keys. In `A/features/forms/__tests__/forms-i18n.unit.test.ts:35–71`, add `all admin locales include the form reload notice and confirmation` → `drop-one-locale-reload-key`. Assert all three keys are present and non-empty in every supported locale.

**Tests first.** In `W/features/forms/__tests__/lost-update-boundaries.test.ts:17–29,45–59`, mount the real `registerAdminFormsUpdateRoute` from `forms-admin.ts:83` with the in-memory Forms repo and recording outbox/change-set ports. Do not stub `repo.update` to throw for the new stale witness. Advance the actual row, then send the old basis through HTTP.

- `ordinary PUT with a stale expectedVersion is refused with 409 and changes no row and no outbox` → `drop-expected-version-at-host-binding`. Assert the whole row, outbox, and change-set counts are unchanged.
- `fresh expectedVersion saves` → `compare-against-wrong-version`. Assert the returned and stored versions agree and advance once.
- `versioned PUT with status is refused before either write` → `allow-versioned-mixed-put`.
- `malformed version is a 400` → `treat-malformed-version-as-omitted`.
- `legacy unversioned field patch, status-only and mixed requests behave as before` → `require-a-basis-on-legacy-put`.

Only `drop-expected-version-at-host-binding` edits Tovu production source (`forms-admin.ts:88`). `allow-versioned-mixed-put`, `treat-malformed-version-as-omitted`, and `require-a-basis-on-legacy-put` edit the P1-T1.J route. `drop-one-locale-reload-key` edits the P1-J1.J locale slice. The fresh-basis witness exercises the Jini service/repo comparison. Sol records reasoned mutation proofs because these Tovu tests drive built `@jini-ai/cms` and `@jini-ai/admin` dist. Opus re-runs against rebuilt Jini.

Preserve why the service/repository CAS is authoritative. A route pre-read can still race and cannot substitute for it. Needs P1-T1.J and P1-J1.J in the same combine for the required `versionedUpdateMessages` and locale keys. The server can ship before the editor because unversioned PUT stays legal.

### P1-T4.T · Tovu · BUILDER: SOL

Replace the existing button at `A/features/pages/PageEditor.tsx:412` with this single line:

```tsx
<button type="button" className="btn-secondary" onClick={onLoadLatest} {...agentHandle({ handle: "page-version-conflict-load-latest" }, { role: "button", label: "Load latest version, discarding my unsaved edits" })}>{t("Load latest")}</button>
```

`agentHandle` is already imported at `:7`. This adds zero lines to the 1,445-line file. Leave `page-external-change-load-latest` at `:496–505` unchanged. No new host injection or signature change.

**Tests first.**

- `A/features/pages/__tests__/PageEditor.unit.test.tsx:432–439` — `Load latest carries the page conflict agent element, role and label` → `drop-page-load-latest-handle`. Assert all three attributes on the single conflict button and confirm its existing click behavior.
- `A/features/posts/__tests__/PostEditor.dom.characterization.unit.test.tsx:223` — pin that post conflict Load latest keeps its visible name and exposes the agent handle → `drop-post-handle-in-package`. Keep the existing meaningful snapshot assertions. Sol must not hand-edit `__snapshots__/PostEditor.dom.characterization.unit.test.tsx.snap:47`. After consuming P1-T4.J, Opus combine re-records only the `version conflict banner` snapshot with `vitest -u -t 'version conflict banner'`, scoped to this test file. Check that the only markup delta is `data-agent-element="post-version-conflict-load-latest"`, `data-agent-role="button"`, and `data-agent-label="Load latest version, discarding my unsaved edits"` on the Load latest button.

This hunk is independent of the preview hunk. Serialize edits to `PageEditor.tsx` and re-pin if P1-T3 or the Pages extraction moves it first.

## OPUS

### P1-J1.J · Jini · BUILDER: OPUS

Add version-aware refresh to the existing Forms module. No new admin dependency or editor module.

**Files and contracts**

- `J/admin/src/core/ports/forms.ts:106,154,166` — add `readonly version?: number` to `AdminFormDefinition` and `readonly expectedVersion?: number` to `AdminFormUpdatePatch`. Keep `updateFormDefinition({ id }, patch = {})`. `forms/models.ts:6–11` already preserves the read version. `forms/adapters/http.ts:29–37` already forwards the patch and reads the DTO. Keep the ordinary PUT vs `/authoring` choice based on `mode` or `html`, not `expectedVersion`.
- `J/admin/src/forms/adapters/memory.ts:7–11,26–40` — use the existing patch whitelist. New rows start at version 1. An existing seed without a version stays unversioned on read and gains version 1 on its first actual write. A recognized write on a numbered row increments the version. An empty unversioned patch remains a no-op. Reject a mismatched supplied basis with `AdminApiError({ status: 409, message: "This form changed since you opened it. Reload it before saving." }, { code: "VERSION_CONFLICT" })`. Never persist the basis. Match P1-T1 for a versioned status or empty patch, using 400 `VALIDATION_ERROR`.
- `J/admin/src/forms/react/hooks/use-form-editor.hooks.ts:72,128–165,177–184` — add `events?: FormsEventsPort` to the existing first object of `useFormEditor({ formId, tab, port, catalog, navigate, t, events }, { clipboard } = {})`. The wired hook forwards the already-injected `formsEvents` like the list does. Add a `reload` controller slice with `available`, `confirmOpen`, `pending`, `request`, `confirm`, and `cancel`. `request`, `confirm`, and `cancel` take no DOM event or data.
- `J/admin/src/forms/react/hooks/use-form-editor-parts.hooks.ts:44–108,125–166,180–217` and `forms/controllers/form-editor.controller.ts:7–38` — replace the once-per-form seed with `useFormEditorRefresh({ stateController, formId, isNew, list, events, t }, _optional = {})`. Use the existing `KEYS.form(formId)` observer and its `refetch`, with a stable scoped subscription and cleanup. Tag reads with the requested route identity and track a per-route read/write generation. Split the pure comparison and write-input assembly out of the hook. `useFormEditorMutations({ port, formId }, _optional = {})` should take the loaded real `id` and the basis in the **mutation input**, both captured from the same applied snapshot as the draft. Keep the existing before-load fallback in the hook-level test and the view’s existing no-Save-before-load guard.
- `J/admin/src/forms/react/pages/FormEditor.tsx:7–25,43–62` — make `useFormEditorHook` required on the internal view. Bind `useWiredFormEditor` in the actual module mount in `forms/react/index.ts:26–32`, and pass it in the direct-view fixtures. Add the reload notice and reuse the existing `ConfirmDialog` pattern. `forms/messages.en.ts` and `screens/forms/forms-editor-i18n.ts:6` own the three new keys below. The host’s existing `createFormsDictionary` binding already consumes the locale slice. Add all supported locale entries there rather than cloning a dictionary into Tovu.

**Behavior**

1. The applied form, draft baseline, and applied version change together. An initial read seeds them. A newer same-form read seeds a clean editor. A newer same-form read on a dirty editor offers reload without touching the draft or applied version. Use the same normalized comparison as the leave guard. Never replace a numbered basis with an unversioned result or accept an older numbered response.
2. Do not apply reads during Save or status toggle. Invalidate their generation when a write begins. If a refresh was requested or a read was dropped while busy, re-read after settlement rather than replaying that result. A route change invalidates both reads and write completions from the previous form, including a switch away and back to the same route key. Fields/Submissions changes for the same form do not reset the draft.
3. Save conditionally includes `expectedVersion` from the applied form. Omit the key entirely for a legacy read. A successful Save seeds from its own response. A typed 409 `VERSION_CONFLICT` preserves the draft, shows the reload notice, and requests a fresh read. Do not detect conflict by matching text. A status action still sends exactly `{ status }`. If the status response contains the same definition, including `notify`, it can advance the status and basis without reseeding dirty fields. If an independent definition edit is present, run the same apply-or-prompt rule and do not advance a dirty draft’s basis.
4. Dirty reload requires confirmation. On confirm, apply a fresh eligible read for this route, not a result from before the conflict. Keep the draft and notice if that read fails. Cancel changes neither state nor basis. Use “This form changed since you opened it. Reload it to see the latest version.”, “Reload form”, and “Reloading discards your unsaved changes.”

**Tests first**

| File | Test and named mutation |
|---|---|
| New `J/admin/src/forms/react/__tests__/use-form-editor.refresh.unit.test.tsx` | `clean editor re-reads on the forms refresh event and shows the assistant's change` → `drop-editor-refresh-subscription`. `dirty editor keeps the draft and sends the applied version on Save` → `seed-dirty-refresh` and `send-pending-version`. |
| Same | `late result for the previous form is ignored after switching forms` → `ignore-form-generation`. `a read started during Save is not replayed after Save settles` → `replay-busy-read`. `status response with an independently changed definition does not advance the draft version` → `adopt-status-version-unconditionally`. `legacy read without version saves without expectedVersion` → `invent-legacy-basis`. |
| `J/admin/src/forms/react/__tests__/FormEditor.unit.test.tsx` | `a stale save offers Reload form and cancelling keeps the draft` → `ignore-version-conflict`. `confirmed Reload form applies the fresh definition but a failed reload keeps the draft` → `discard-before-read`. |
| `J/admin/src/forms/__tests__/memory-adapter.unit.test.ts` and `forms-api.conformance.test.ts` | `memory adapter refuses a stale expectedVersion with VERSION_CONFLICT and stores no precondition` → `drop-memory-cas`. `a fresh basis increments once and is never stored as a form field` → `persist-precondition`. Exercise HTTP passthrough in the existing conformance harness or its request fake. |

Why-comments to preserve: once-per-form seeding protected drafts, the detail and list keys must stay siblings, slug routes still write by real ID, and an uneditable `notify` field must not be dropped. Explain why a status response must not relabel a stale draft as current.

**Package:** Existing `@jini-ai/admin` `./forms`, `./forms/react`, and adapter exports only. Add `.changeset/admin-form-editor-version-refresh.md` (`minor`). Combine owns `pnpm api:update` for the two optional fields and the changed exported hook/controller types. No catalog delta. Land the wire protection in P1-T1 before shipping the editor.

### P1-J2.J · Jini · BUILDER: OPUS

The risk is redaction, not the card markup. The existing bt2 fix must stay in place for other tools.

**Files and implementation.**

- `J/chat/src/core/tool-presentation.ts:11` and `core/antigravity/tool-presentation.ts:12–21` are the normalization seam. In `react/components/ToolCard.tsx:64–71,115–161`, check `result?.isError === true` and the **exact** normalized tool ID before invoking any registered or family renderer. Match bare `assistant_ask_choice`, an MCP-qualified name whose exact tool segment is `assistant_ask_choice`, and a `call_mcp_tool` receipt normalized to either. Do not match by suffix alone or inspect error wording. Do not rewrite persisted events or affect the pending, successful, or retried grouping paths.
- Add a private `FailedChoiceCard({ result, useTHook, useCopyToClipboardHook }, _optional = {})` view with both custom hooks required. Bind the existing hooks at the chat composition point in `ToolCard.tsx`, or pass them down from its existing caller in `MessageRow.hooks.tsx:41–52`. Keep the public `ToolCard` call compatible. The failed branch hands `ExpandableCard` at `:413–446` a safe projection with no input or raw result. The row shows “The assistant couldn't open the choice form. Ask it to try again.” Render the same safe text for collapsed readers and on expansion. Header, badge, title, media rendering, and accessible text must never receive raw choice inputs or output. Copy details is a real button inside the expansion, not a nested button in the card head.
- At `J/chat/src/core/tool-call-detail.ts:28–56`, add `resultPresentation?: "display" | "copy-diagnostic"` to the existing options. Preserve the formatter’s C130 substitution by default. The diagnostic option bypasses only that substitution and still uses the same formatter, redactor, and cap. On click, call `describeToolCallDetail({ input: undefined, result }, { resultPresentation: "copy-diagnostic" })` and send only its redacted `outputText` to the injected hook. If there is no diagnostic, copy the safe sentence. Do not render, log, or put the clipboard payload in an attribute. Keep existing clipboard success behavior.
- Resolve `chat.toolCard.choiceFailed` and `chat.toolCard.copyDetails` through the `I18nAdapter` at `J/chat/src/react/slots.ts:231`, with the prescribed English defaults when the adapter returns the key or an empty string.

**Existing hook anchor.** Import `useCopyToClipboard` from `../hooks/useCopyToClipboard.js` at the chat component composition point, as `J/chat/src/react/components/CopyMessageButton.tsx:3` already does.

**Tests first.** In `J/chat/src/react/components/__tests__/ToolCard.test.tsx:997`:

- `a failed bare and MCP-qualified assistant_ask_choice shows the plain sentence collapsed and expanded` → `dispatch-before-choice-check`.
- `a failed normalized MCP wrapper shows the same plain sentence without matching error wording` → `classify-before-normalizing`.
- `failed choice leaves no schema text in the title, accessible description or collapsed reader` → `pass-raw-call-to-collapsed-reader`. Use a custom renderer spy that would echo its arguments if called.
- `Copy details copies the redacted diagnostic without the secret canary` → `copy-unredacted-result`. Include a recognizable synthetic secret and non-secret diagnostic text. Assert the latter survives, the former does not, and neither was mounted in the row.
- `a lookalike tool and successful and pending choices keep their existing rows` → `match-choice-suffix-or-ignore-isError`. Keep the existing WebFetch error case. In `core/__tests__/tool-call-detail.test.ts`, add `copy diagnostic redacts without changing the C130 display wording` → `bypass-redactor-in-copy-mode`.

Why-comment: failed tool protocol text is for the assistant to repair its call, not a user-facing explanation. The two representations stay separate so a new renderer cannot accidentally publish the diagnostic.

**Package:** No new exports. `./core` exposes `ToolCallDetailOptions` through `core/index.ts:14`, so combine updates that additive baseline. No public React export delta. Add `.changeset/chat-failed-choice-details.md` (`minor` for the added formatter option).

### P1-T2.J · Jini · BUILDER: OPUS

OWNER-DEFAULT: 9

Add the per-item authorization seam needed for the HTML inverse. Today both public revert entries check only `changeset.revert`. Raw HTML writers require `pages.edit_html` (`W/features/pages/permissions.ts:101–108`). Custom grants make those permissions independent. Under the owner default, the host’s `page-html` reverter is non-forceable. Jini implements that policy generically, without naming the Pages domain.

**Files and contract**

- `J/core/src/contracts/site/core-commands.ts:19–39` — add optional `EntityReverter.policy?: { permission: string; authorizationEntityType?: string; allowForce?: boolean }`. Add an optional second object `{ actorId?: UUID }` to `applyInverse`. Existing implementations and unmarked kinds retain their behavior.
- `J/cms/src/core/commands/revert.ts:49–54,82–109,124–186,215–265` — extend the existing second object of `revertChangeSet(required, _optional = {})` with optional `actorId` and `authorizeItem`. The callback is `(required: { permission: string; entityType: string; entityId: UUID }, _optional?: Record<string, never>) => Promise<void>`. Leave `requireForceAllowed({ input })` first at `:131`. After the scoped change-set and status checks, resolve all items and enforce their policies **before the first** `currentVersion` read (`:234–250`) or inverse write. If policy exists, require and await the callback. Pass only the scoped IDs and permission, with `policy.authorizationEntityType ?? item.entityType`. Fail closed on missing item authorization. If force is requested for `allowForce: false`, reuse `RevertForbiddenError`, with reason `ITEM_CANNOT_FORCE` and plain copy telling the operator to keep the newer version and edit it again. No new error class. Keep existing workspace, status, and agent-cannot-force rules. Supply the current reverter’s actor ID to `applyInverse`, never the original writer’s identity.
- `J/cms/src/admin-http/routes/change-sets/revert.ts:36–58,89–99` — keep outer `authorizeChangeSet` where it is. Its refusal must propagate unchanged. Inject `actorId: principal.id` and `authorizeItem` closing over the same request authorizer. Call `authorize({ permission, entityType }, { entityId })`. Translate only a classified 403 from that item check into `RevertForbiddenError` with reason `ITEM_PERMISSION_DENIED` and safe words. Propagate unexpected failures. `REVERT_ERRORS` already maps `RevertForbiddenError` to 403 `REVERT_FORBIDDEN`, with its reason. Use that mapping for both denied items and non-forceable force.
- `J/cms/src/change-sets/tool-registrations.ts:130–171` — keep the outer `changeset.revert` permission check ahead of lookup and preserve tool confirmation. Pass `actorId: ctx.principal.id` and bind `authorizeItem` with the existing `requireToolPermission`/`adaptLegacyAuthorize` path, using the current workspace, principal, and mapped item scope. Catch `RevertForbiddenError` and the typed authorization refusal `ForbiddenError` from `requireToolPermission` (`J/core/src/tool-permissions.ts:75–83`). Return a plain `{ reverted: false, code: "REVERT_NOT_ALLOWED", note }`. Do not echo the internal denial or rethrow those typed refusals. Leave unexpected failures on the existing error path.
- Reword the tool’s `REVERT_CONFLICT` note for non-forceable change sets. Use the registered policy for the authorized set’s items, not a hard-coded entity kind or a message match. If needed, re-read the scoped set in the conflict branch and resolve its item policies. If any item forbids force, tell the assistant to keep the newer version and re-edit it. Keep the existing “ask the human to revert from the Recovery page” note for forceable kinds. On the human side use the mapped 403 with the plain non-forceable message. The merge-21 `A/features/recovery/Recovery.tsx` has restore-point controls but no per-item change-set force button. Do not add one or change restore-point behavior. Verify the mounted admin revert endpoint returns the plain 403 if a force request for `page-html` is made.

**Tests first.** Use `J/cms/src/core/commands/__tests__/public-entry.test.ts` for the service seam and `J/cms/src/admin-http/routes/change-sets/__tests__/revert.test.ts` plus `J/cms/src/change-sets/__tests__/tool-registrations.test.ts` for the entrypoints.

- `a reverter with a policy fails closed without an item authorizer` → `skip-missing-item-authorizer`.
- `the existing force guard runs first and a denied item prevents all current-version reads and inverse writes` → `authorize-after-first-inverse`. Prove the agent force guard wins before the repo or item authorizer runs. In the item test, deny the second item and assert no version read even for the first item.
- `the item authorizer receives the mapped entity kind and no inverse payload` → `pass-full-inverse-item`.
- `force remains available for existing kinds and is refused for a non-forceable inverse` → `ignore-item-force-policy`.
- `tool and admin revert forward the current principal and authorize the scoped item` → `use-original-writer-as-revert-actor`.
- `admin revert answers 403, not 500, for a denied item and for force on a non-forceable item` → `unmapped-item-denial`. Preserve the separate outer `authorizeChangeSet` refusal test.
- `the tool returns REVERT_NOT_ALLOWED for a policy denial and does not suggest Recovery for a non-forceable conflict` → `rethrow-tool-authorization-refusal` and `suggest-force-for-non-forceable-conflict`.

Preserve why a grant to revert an ordinary audited change must not confer raw HTML write authority. The policy comes from the registered reverter, never client input or the stored inverse.

**Package:** Existing `@jini-ai/core/contracts/site/core-commands`, `@jini-ai/cms/core/commands`, `./change-sets/tool-registrations`, and `./admin-http/routes/change-sets/revert` exports only. Add `.changeset/scoped-change-set-revert-policy.md` (`minor` for core and cms). Opus combine refreshes the affected baselines. No tool catalog or schema delta. Same combine as P1-T2.T, with P1-T2.J first.

### P1-T2.T · Tovu · BUILDER: OPUS

OWNER-DEFAULT: 9

Record exactly one scoped change set for each actual assistant HTML change. Undo of the first full HTML write restores the exact prior doc body and format if the recorded version is still current. Normal conversion remains one-way. There is no forced revert for `page-html`.

**Dependency and transaction proof.** Same combine, P1-T2.J first. It supplies `EntityReverter.policy`, the `actorId` option, and the permission and force handling. Verify the outer durable transaction with a forced insert failure. `W/features/pages/html-document-store.ts:282–291` joins the revisions repo transaction. `W/features/post/repo.ts:362–366` delegates to the kernel, and `W/platform/db/sqlite/change-set-repo.sqlite.ts:43–46` uses the same schema-erased kernel. Jini’s kernel joins nested transactions. `executeCommand` itself does **not** open the outer transaction (`J/cms/src/core/commands/command.ts:76–96,101–135`).

**Files and implementation**

- `W/features/pages/tool-registrations.ts:388–421,555–596,604–724,731–737` — route real mutations through `recordAssistantPageHtmlWrite({ deps, target, expectedVersion, operation, write, signal }, _optional = {}): Promise<{ version: number; changeSetId?: string }>`. `operation` is one of `pages_write_html`, `pages_write_region`, and `pages_move_region`. `target` carries workspace, resolved page ID, actor ID, and `executionId: ctx.executionId`. The handlers use `Parameters<ToolHandler>[0]`, and `ToolExecutionContext.executionId` is declared at `J/core/src/tool-registry.ts:172–179`, with `ToolHandler` at `:203`. The existing wiring fixture also supplies it at `pages-html-revisions-wiring.integration.test.ts:51–59`. Use a deterministic command idempotency key such as `` `page-html:${operation}:${target.pageId}:${target.executionId}` `` within the repository’s workspace scope. The execution ID is correlation, not authority. Add only the missing `PagesToolDeps` collaborators `executeCommand`, `clock`, `idGen`, `changeSets`, and `outbox`. Reuse `authorize`, `postRepo`, and `pagesHtmlStore`. `W/assistant/tool-registrations.ts:126,155–169` already intersects the page and change-set deps. Adapt narrow test fakes without weakening production wiring.
- Keep the existing permission check, target resolution, authoring checks, region guards, and model-facing refusals. Abort before the first durable operation, including conversion. Inside the same outer transaction, capture the scoped live row at the exact `expectedVersion` and run the store operation on that basis. Set command `entityType: "page-html"` and `operation: "update"`, attribute it to the current principal as an agent, and use a short summary without HTML. Command authorization still checks `pages.edit_html` on the same post target as the writer. `captureEntityVersion({ result })` uses the store’s actual post-write version. Do not record a refusal or an unchanged normalized write. Keep the result shape on a no-op and add `changeSetId` only after a real command commits.
- Store the exact pre-write HTML as `{ format: "html", html: string }`. On the first full write from a doc row, store `{ format: "doc", bodyJson: JsonObject }` captured before `ensureHtmlFormat` nulls `body_json`. Preserve the pre-conversion revision at `html-document-store.ts:415`. Do not derive the inverse from the rendered doc fallback in `pages_read_html`. The inverse goes into workspace-scoped `inverse_payload_json` (`W/platform/db/schema.sqlite.ts:1428–1440`, `schema.postgres.ts:118`). Raw HTML must not be returned by `change_sets_list`. Keep `J/cms/src/change-sets/tool-registrations.ts:90–107` `toChangeSetView` free of `inversePayload`. The HTTP change-set projection also continues to omit it.
- New `W/features/pages/html-reverter.ts` — `createPageHtmlReverter({ store, postRepo }, _optional = {}): EntityReverter`. Set `policy: { permission: PAGES_EDIT_HTML_PERMISSION, authorizationEntityType: "post", allowForce: false }`. `currentVersion({ workspaceId, entityId }, _optional = {})` reads only the live scoped page. `applyInverse({ workspaceId, item }, { actorId } = {})` validates the discriminated inverse and calls scoped store `restore({ inverse, expectedVersion: item.entityVersionAtApply }, _optional = {})`. Keep the CAS even after gateway preflight. Translate a lost restore CAS into typed `RevertConflictError` with plain recovery words. Never use unversioned `save`, convert a missing page, or resurrect a trashed row.
- Extend both store implementations at `W/features/pages/html-document-store.ts:183–207,388–461,502–539,560–616` and `html-document-store.memory.ts:125–165,169–239`. If the current scoped, live row passes the version check and its HTML already equals the inverse byte for byte, return a successful no-op. Bump neither the page version nor its revision, references, or page-update events. The gateway still marks the change set reverted and records the revert normally. Otherwise restore historical HTML verbatim, without normalization or authoring hooks. For doc restore, update both body columns and format in one CAS, preserving the exclusive-column invariant (`W/features/post/repo.rows.ts:146–166`). Increment version, append a revision attributed to the reverter, and preserve update events and the resulting format’s reference-index behavior. Do not roll back unrelated metadata or `autosave_json`.
- Register `page-html/update` in real and memory composition beside the post/menu registrations at `W/server/runtime/composition/site-deps/route-deps-site-providers.ts:107–127` and `memory-deps/route-deps/assistant-and-site.ts:151–171`. Bind the same scoped page-store factories used by the write path at `site-deps/route-deps-content-chat.ts:133–141` and `memory-deps/route-deps/trash-and-content.ts:152–161`. Register at assembly once the factories are in hand. Do not create a second repo, kernel, or registry.
- `W/features/pages/agent-tools.ts` — document that an applied result with `changeSetId` can be undone through `change_sets_revert` and that no ID means no recorded Undo. Jini’s catalog already limits its promise to matching recorded changes. The moved-tools golden pins aggregate catalog bytes, not handler results. Add direct result assertions. If descriptions change the catalog bytes, re-record only that delta with the existing opt-in at `W/assistant/__tests__/moved-tools.golden.test.ts:158–165`, as in `c4b928926b`.

**Tests first.** Add `W/features/pages/__tests__/html-undo.integration.test.ts` using the real registrations and composed stores. Use the actual dialect harness patterned at `html-document-store.sqlite.test.ts:10–22,77` for the durable failure witness.

- `an assistant full write records one change set and change_sets_revert restores the earlier HTML byte for byte` → `skip-full-write-recording` and `normalize-the-inverse`. Include markup current normalization would change.
- `a section write and a section move each revert to the exact prior HTML` → `skip-move-recording`.
- `a first full HTML write preserves the prior doc for scoped undo` → `capture-inverse-after-conversion`. Assert exact doc body and format, not rendered HTML.
- `revert after a human save is refused and keeps the newer HTML` → `drop-revert-version-check`. `a human save between revert preflight and the restore CAS also wins` → `restore-without-cas`.
- `matching live HTML at the recorded version reverts the change set without bumping the page` → `write-identical-html-on-revert`.
- `a refused or unchanged write records no change set` → `record-no-op`. `change-set insert failure leaves the row, version, revisions, references and outbox unchanged` → `commit-page-before-audit`.
- `a caller with changeset.revert but without pages.edit_html cannot restore raw HTML` → `skip-html-item-permission`. Check both the tool and the mounted admin revert endpoint without weakening confirmation. At the same endpoint, assert force on a stale `page-html` change gets 403 with plain recovery words and leaves the newer HTML untouched.
- `change_sets_list omits the stored page HTML inverse` → `expose-inverse-payload-in-list`. Use distinctive HTML in the stored inverse. Assert neither `inversePayload` nor the HTML appears in the model-facing list output. Keep the direct `toChangeSetView` omission test.
- Extend `W/server/runtime/composition/__tests__/pages-html-revisions-wiring.integration.test.ts:51–59,72–90` with `both composition roots record and can resolve a page-html change set`. The existing positive fixture omits `expectedVersion`. Read the basis into that fixture rather than relaxing the tool guard.

**Stop condition.** The memory post transaction at `repo.memory.ts:247–260` snapshots only posts, revisions, and autosaves. It does not cover an independent outbox or entry-reference store. Jini’s memory change-set adapter pushes rows before awaiting the outbox (`J/cms/src/core/commands/repo.memory.ts:25–32`). Prove the memory fault boundary with the real bound adapters or report the precise missing rollback seam. For durable storage, stop if any participating adapter fails to join the same transaction. Do not add a second commit or a compensating unversioned HTML write.

Preserve the why-comments for the pre-conversion revision, the inverse and CAS sharing one basis, restore skipping authoring transformations, and only a committed record earning an Undo claim.

### P1-T3.J · Jini · BUILDER: OPUS

Add a neutral authenticated JSON route spec. Keep the existing HTML route and renderer where they are. Jini parses inert HTML for iframe source attributes. Tovu supplies policy for which sources earn a link.

**Files and contract.** New `J/cms/src/admin-http/routes/posts/template-preview-embeds.ts`:

```ts
type PreviewEmbedsInput = {
  postId: string;
  rawTemplateChoice: unknown;
  body: unknown;
};

interface PreviewEmbedsPrincipal {
  id: string;
}

interface PreviewEmbedsRouteDeps<TOutput> {
  renderPreview(
    required: PreviewEmbedsInput,
    optional?: { signal?: AbortSignal | undefined },
  ): Promise<{ html: string }>;
  projectEmbeds(
    required: { iframeSources: readonly string[] },
    optional?: Record<string, never>,
  ): TOutput;
}

type PreviewEmbedsRouteSpec<TOutput> = JsonRouteSpec<
  PreviewEmbedsInput,
  TOutput,
  PreviewEmbedsRouteDeps<TOutput>,
  PreviewEmbedsPrincipal
> & { responseHeaders: Readonly<Record<string, string>> };

function createTemplatePreviewEmbedsRoute<TOutput>(
  _required: Record<string, never>,
  _optional: Record<string, never> = {},
): PreviewEmbedsRouteSpec<TOutput>;
```

Export the factory. Its first object is explicitly `{}` because the host injects all runtime collaborators at mount, not at factory creation. Keep `_optional = {}` for the two-object convention. `PreviewEmbedsRouteSpec` mirrors `J/cms/src/admin-http/routes/widgets/preview.ts:39–45,91–102`.

Return a `defineJsonRoute` POST spec at `/api/admin/v1/workspaces/:workspaceId/posts/:postId/template-preview/embeds`. `parse` forwards the path ID, raw `templateChoice` query value, and untyped body. `handle` requires authenticated context and `authorize({ permission: "content.read" })` with no entity type or ID. Missing auth or authorizer fails closed. Only then call the injected renderer and projector. Set `responseHeaders: { "Cache-Control": "no-store" }` on the spec.

Use existing `parse5` and call `parse(html)`. Walk `childNodes` recursively in document order. Do **not** descend into `template.content`. Match actual HTML-namespace nodes with `nodeName === "iframe"` and take only `attrs.find(a => a.name === "src")?.value` when the attribute exists. Do not scan comments, script text, or `srcdoc`. Do not navigate, execute scripts, or fetch any source. Pass only the ordered source strings to the injected projector and return its JSON only. No YouTube-specific types, rules, or copy in the neutral route.

**Tests first.** New `J/cms/src/admin-http/routes/posts/__tests__/template-preview-embeds.test.ts`:

- `template preview embed inspection checks content.read before rendering` → `render-before-authorization`. Assert exact authorization args and zero renderer/projector calls on refusal. Cover missing principal and missing authorizer.
- `the projector gets iframe sources only, in document order` → `scan-all-src-attributes`.
- `script text, comments, srcdoc and inert template markup are not iframe sources` → `scan-serialized-source`.
- `the route forwards template choice and pending body and returns only the projection` → `drop-pending-body` and `return-rendered-html`.

Preserve why inspection uses already-authorized rendered HTML. The preview document is intentionally unreadable to the admin frame. Do not trade the sandbox for easier inspection.

**Package:** Add the real `./admin-http/routes/posts/template-preview-embeds` export in `J/cms/package.json` alongside the post routes (`:3876` anchor), with `types`, `import`, and `default` pointing to matching `dist/admin-http/routes/posts/template-preview-embeds` files. Classify it as `node`. The universal package boundary disallows `parse5` (`:727–733`). This is a server-side entry, not a server-framework dependency. No new dependency. Add `.changeset/cms-template-preview-embed-inspection.md` (`minor`). Opus combine adds the subpath and types to the baseline. Land before mounting P1-T3.T.

### P1-T3.T · Tovu · BUILDER: OPUS

Mount the Jini spec with the same render inputs and permission as the HTML preview. Add projected video IDs to the existing Page Preview links.

**Server files**

- `W/server/inbound/admin-http/routes/posts/template-preview.ts:130–173,181–245` — extract `renderAuthorizedTemplatePreview({ deps, postId, rawTemplateChoice, body }, _optional = {}): Promise<{ html: string }>`. Move the existing post ID-or-slug lookup, `resolveOverrideTemplateChoice`, `extractPendingBodyJson`, `extractPendingBodyHtml`, and call to `renderPostPreview` (`template-preview-render.ts:134`) into that helper. The HTML handlers call it **after** their existing `content.read` check at `template-preview.ts:188–198`. The JSON route’s Jini spec authorizes before calling it. The helper itself must not authorize. The HTML GET/POST stays at `/api/admin/v1/workspaces/:workspaceId/posts/:postId/template-preview` (`:237`), with exactly its current status and body mapping, URL-encoded handler, no-store, and CSP. The JSON mount uses the same helper. Do not fetch the HTML route or approximate its renderer.
- `W/server/runtime/composition/modules/content.ts:8,240–248` — mount `createTemplatePreviewEmbedsRoute<{ youtubeIds: string[] }>({})` at the sibling `/template-preview/embeds` path beside the HTML preview. Use `mountAdminJsonRoute` with `authorization: "direct"` and the existing workspace and session guards. Inject the current direct authorizer, the shared renderer closure, and the projector below. Preserve the type-free, ID-free `content.read` check from the HTML handler. Do not use the guarded publishing-grant semantics of neighboring post CRUD routes. Map known not-found and no-theme outcomes to plain JSON refusals. Keep unexpected causes private with the failure reporter. Update only the new route and consequent indices in `W/server/runtime/composition/__tests__/fixtures/create-app-route-table.snapshot.json`, anchored by the existing HTML registrations at `:61–62` and their counterparts in each fixture table.
- New `W/server/inbound/admin-http/routes/posts/template-preview-youtube.ts` — `projectPreviewYoutubeIds({ iframeSources }: { iframeSources: readonly string[] }, _optional = {}): { youtubeIds: string[] }`. Parse each value as an absolute HTTPS URL. Allow only exact origins for `youtube.com`, `www.youtube.com`, `youtube-nocookie.com`, `www.youtube-nocookie.com`, and `youtu.be`, with no user info or nonstandard port. On the long hosts accept only `/embed/<id>`, and on `youtu.be` only `/<id>`. The ID must match `^[A-Za-z0-9_-]{11}$`. Deduplicate in first-seen order and discard every other part of the URL. No redirects, network calls, script execution, or general HTML exposure.

**Admin files**

- Extraction is required. Move the preview-only subtree (`PagePreview`, `PagePreviewFab`, `PagePreviewFrame`, and their preview-only helpers and why-comments at `A/features/pages/PageEditor.tsx:1169–1445`) to local `A/features/pages/PageEditorPreview.tsx`. Keep component identities stable across fullscreen changes. The existing file is 1,445 lines and already above its old `max-lines` debt entry at `development/scripts/size-debt.json:117–121`. Check the resulting split in combine and account explicitly for any remaining old debt. Do not increase the baseline or start the package move.
- At the existing editor prop and pane seams (`PageEditor.tsx:80–85,738,894–920,997–1107`), thread `usePreviewEmbedIds` as a **required** hook prop to `PagePreview`. Bind the live hook in `A/panels.tsx:228`. Pass fakes through `PageEditor.unit.test.tsx`, `PageEditor.interactive-flush.unit.test.tsx`, `PageEditor.preview-remount.unit.test.tsx`, and `features/themes/__tests__/theme-preview-dirty.unit.test.tsx`. Lift the one `useThemePreviewFrame` call from `PageEditor.tsx:1403–1408` to the common preview parent so the frame and lookup share the same result and `revision` (`A/features/themes/hooks/use-theme-preview-refresh.hooks.ts:62–76`). Preserve the existing preview subtree, hidden-form identity, and sandbox across fullscreen changes.
- New `A/features/pages/hooks/use-preview-embed-ids.hooks.ts` — `usePreviewEmbedIds({ id, templateChoice, version, previewRevision, pendingHtml, load }, _optional = {}): readonly string[]`, with `load({ id, templateChoice, pendingHtml }, { signal } = {}): Promise<{ youtubeIds: string[] }>`. Bind the existing authenticated request adapter (`A/lib/admin-http/request.ts:198–201`) in the host. Use a workspace-relative URL, the encoded real post ID, and the current preview URL’s null/empty/named `templateChoice` semantics (`J/admin/src/posts/api/posts-api.ts:83–116`). A preview using HTML GET sends no pending body to the inspection POST. A preview using the hidden-form POST sends the same `bodyHtml` as the form, not a separate document draft. Use the existing preview debounce cadence. Abort superseded requests and guard by request identity. Refresh on theme preview revision, saved page version, template choice, or submitted body change. Never show the previous template’s IDs while the next request is pending. On failure keep the page-owned fallback. Union successful IDs with the existing page-owned list (`PageEditor.tsx:1268–1290` before extraction). Reuse its link text, fixed YouTube destination, and `rel`. No new i18n.

**Tests first**

- New `W/server/inbound/admin-http/routes/posts/__tests__/template-preview-embeds.test.ts` — `a template-rendered youtube-nocookie iframe yields its id` → `inspect-page-body-instead-of-assembled-html`. Use the actual renderer and the fixture style at `template-preview-render.test.ts:33,121`. `a deceptive host and a non-YouTube iframe yield nothing` → `accept-host-substring`. Include credentials, bad ID length, duplicate IDs, and an actual widget-produced iframe.
- Same file — `same auth as the preview route` → `mount-with-publishing-grant-or-skip-content-read`. Cover missing session, foreign workspace, denied principal, and allowed operator, with zero renderer calls after refusal. `pending body and explicit empty template choice match the HTML preview without persisting either` → `lose-template-tristate`. Assert the HTML route retains its exact sandbox CSP and both surfaces are no-store.
- New `A/features/pages/__tests__/PageEditor.preview-youtube.unit.test.tsx` — `a template-only video shows Watch on YouTube` → `ignore-rendered-ids`. `a late embed response for the previous template cannot replace the active links` → `accept-superseded-ids`. `embed inspection failure leaves the page-owned link available` → `replace-local-ids-on-error`. `a theme refresh rechecks links without changing the iframe sandbox` → `omit-preview-revision`. Exercise the authenticated port with clean and pending HTML requests. Keep the existing preview-remount witness passing through the extraction.

Preserve why the JSON endpoint sees the same authorized draft render but returns only validated IDs. Keep the sandbox, no-same-origin rule, anonymous visitor view of rendered content, and no-store behavior unchanged. **Stop** if the real reproducer creates the iframe only at script runtime. Report that boundary and do not execute the script server-side.
