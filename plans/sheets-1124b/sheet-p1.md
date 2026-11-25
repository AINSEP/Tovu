SHEETS r62t-sheet-p1 COMPLETE: 7 todo / 0 done / 0 obsolete; 6 SOL sheets, 5 OPUS sheets

The 7 actionable steps are 5 TODO and 2 PARTLY-DONE. Pins are from Tovu `7c87b3c3f9` and Jini `010c8cd87`, both `HEAD` and `origin/integ/merge-21-2026-11-24` in the supplied clones. The planner snapshot predates some moves visible at those tips. Where the planner and current source disagree, use current source. No files were changed and no tests, builds, installs, or type-checks were run.

Path shorthand used below: `A/` is Tovu `apps/admin/src/`, `W/` is Tovu `apps/website/src/`, and `J/` is Jini `packages/`.

| Step | Status | Merge-21 proof and remainder |
|---|---|---|
| P1-J1 · Form editor refresh and version basis | TODO | `J/admin/src/core/ports/forms.ts:106,154` still lacks both version fields. `forms/react/hooks/use-form-editor-parts.hooks.ts:54–72` seeds once per form and `use-form-editor.hooks.ts:177–184` does not wire `formsEvents`. The host already supplies the scoped event port, and the server DTO already emits `version`. Reuse both. |
| P1-J2 · Plain failed choice row | PARTLY-DONE | Jini `c9ede7ece` replaces the `invalid arguments for …` result text in `J/chat/src/core/tool-call-detail.ts:48–69`. It does not classify failed `assistant_ask_choice` before custom renderers, protect the row from other error dialects, or offer redacted Copy details. `ToolCard.tsx:64–71,390–400,434–446` still routes it through the generic path. |
| P1-J3 · ResourceBoard focus | TODO | `J/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx:17–55,79–101` has arrow navigation but no focus on open. `react/hooks/useResourceBoard.ts:175–199` closes on Escape without restoring focus. This is live Jini UI work even though Tovu does not mount it. |
| P1-T1 · Version-checked ordinary form PUT | TODO | The ordinary PUT moved to `J/cms/src/admin-http/routes/forms/update.ts:17–18,59–73,89–107`. Its Tovu binding at `W/server/runtime/composition/modules/forms-admin.ts:82–89` still drops the options argument. Authoring PUT already parses and forwards the basis, but ordinary PUT does not. The witness at `W/features/forms/__tests__/lost-update-boundaries.test.ts:46–60` covers authoring only. |
| P1-T2 · Scoped Undo for assistant HTML writes | TODO | `W/features/pages/tool-registrations.ts:555–596,604–672,680–724` writes through the store without recording a change set. `html-document-store.ts:388–461,560–616` records revisions, which are not change sets. `W/features/post/reverters.ts:163–205,327–332` does not restore HTML. The narrower “matching recorded change” wording has already moved to `J/cms/src/change-sets/agent-tools.ts:90–103`. |
| P1-T3 · Preview links for template/widget-only video | PARTLY-DONE | The page-owned link is live at `A/features/pages/PageEditor.tsx:1268–1290`, now using the Jini helper. The real shared renderer is already extracted at `W/server/inbound/admin-http/routes/posts/template-preview-render.ts:134–212`. Neither the sibling JSON route nor the UI feed for rendered-only IDs exists. The HTML preview is still intentionally sandboxed at `template-preview.ts:175–179,222`. |
| P1-T4 · Load latest handles | TODO | Page conflict button is bare at `A/features/pages/PageEditor.tsx:412`. Post conflict button moved to `J/admin/src/posts/editor/notices/PostVersionConflictBanner.tsx:46` and is also bare. The page’s separate external-change button at `PageEditor.tsx:496–505` already has its own handle and is not part of the fix. |

These are behavior sheets, not extraction sheets. Do not move the forms route or post notice back to Tovu. Do not start the queued `A-K2-pages-3`, `RT-K1-adm-posts-2`, `K5-pages-1`, or `K5-post-3` work. If an in-flight move lands first, re-pin the affected hunk to its new owner and keep the host wiring at the same boundary. Keep existing optional pads and rationale comments. New non-React functions take two objects, with an `_optional = {}` pad when the second is unused. Custom hooks cross view boundaries as required props. Keep functions at most 80 lines and complexity at most 10. No sheet needs a schema migration.

## Jini SOL

### P1-J1.J · Jini · BUILDER: SOL

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

### P1-J3.J · Jini · BUILDER: SOL

**Files and implementation.** In `J/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx:17–55,59–101`, use local React refs for the open menu and its trigger. On open, focus the first enabled `button[role="menuitem"]` after mount. If none is enabled, keep focus on the trigger. Use the same enabled-item filter for arrow navigation. Do not refocus on unrelated renders or busy-state changes while already open. In `react/hooks/useResourceBoard.ts:175–204`, handle Escape by focusing the trigger inside the **current** `menuContainerRef` before setting `openMenuId` to `null`. Keep `mousedown` outside dismissal as close-only. Keep native Enter/Space activation and the existing bubbling guards.

Keep the current component and hook props. If factored, `focusFirstEnabledMenuItem({ menu, trigger }: { menu: HTMLElement | null; trigger: HTMLButtonElement | null }, _optional = {}): void` is private. No new host collaborator is needed.

**Tests first.** Paths are under `J/ui/src/features/resource-dashboard/__tests__/`.

- `ResourceCard.test.tsx` — `opening by click or keyboard focuses the first enabled item` → `skip-open-focus`. `opening with no enabled items leaves focus on the trigger` → `focus-disabled-menu-item`. Cover the actual `busy` case, not a new per-action disabled API.
- `ResourceBoard.test.tsx` — `Escape returns focus to the exact trigger after opening a second card's menu` → `skip-escape-focus-restore`. `outside click keeps focus on the clicked control` → `restore-focus-on-outside-click`. Use the actual board hook and two distinct triggers.

Why-comments: keep the reason the inside `mousedown` guard must run before the item click and why trigger keydown cannot bubble to the card. Document why only Escape restores trigger focus.

**Package:** No `packages/ui/package.json` export or API-baseline delta. Add `.changeset/ui-resource-board-menu-focus.md` (`patch`). No i18n delta.

### P1-T1.J · Jini · BUILDER: SOL

Patch the already-extracted ordinary form PUT spec. Do not convert or remount the route in this sheet.

**Files and contract.** In `J/cms/src/admin-http/routes/forms/update.ts:15–30,36–75,89–107`, widen the existing injected writer to:

```ts
type FormsUpdateDefinitionFn = (
  required: { input: FormsUpdateWriteTarget & { patch: FormsUpdatePatch } },
  optional?: { expectedVersion?: number },
) => Promise<{ definition: FormDefinitionRecord }>;
```

Add a required `versionedUpdateMessages` field to `FormsUpdateRouteDeps`, with `mixedStatus`, `missingDefinition`, and `stale` strings. Tovu supplies them in P1-T1.T. Preserve `FormsUpdateInput`, `defineJsonRoute`, the current guarded authorization call, and its ordering ahead of validation and reads. Use core `parseExpectedVersion({ value: body.expectedVersion })`, as in `authoring.ts:58`. After parsing, a supplied version plus any own `status` key is a 400. A supplied version plus zero recognized ordinary definition fields is also a 400. Make both refusals before any write or no-op lookup. Use flat `VALIDATION_ERROR` responses. Call `deps.updateFormDefinition({ input: { ...target, patch } }, { expectedVersion })` for a versioned request. Preserve the legacy one-argument call when omitted.

For `RecordVersionConflictError` on this versioned path, return 409 `VERSION_CONFLICT` with the existing safe structured version details and the injected `stale` message. Do not change the shared authoring-route error text at `forms/write-error.ts:24–38`. An unversioned empty or ignored request remains a read. Unversioned status-only and mixed requests keep their existing behavior. `slug`, `mode`, and `html` are not newly recognized by ordinary PUT. `expectedVersion` is never a patch key.

**Tests first.** Extend `J/cms/src/admin-http/routes/forms/__tests__/update.test.ts`:

- `a versioned definition PUT forwards the basis separately from the patch` → `drop-writer-options`.
- `a versioned PUT with any status key refuses before either write` → `allow-mixed-versioned-status`.
- `a versioned PUT with no definition fields refuses before lookup or write` → `versioned-empty-is-legacy-read`.
- `malformed expectedVersion is a 400 without a write` → `coerce-version-string`.
- `a stale ordinary PUT uses the injected copy and keeps VERSION_CONFLICT details` → `use-unclassified-conflict-copy`.
- `unversioned empty, status-only and mixed requests keep their current behavior` → `require-version-for-all-puts`.

Why-comment: authorization still precedes the no-op read, and a conditional definition write must not be paired with a separately committed status update.

**Package:** Keep the existing `./admin-http/routes/forms/update` export and its boundary classification at `J/cms/package.json:612,902,3941`. Add `.changeset/cms-versioned-form-put.md` (`minor`). Combine refreshes the baseline for the writer options and injected copy fields. Integrate with P1-T1.T in the same combine because the mount supplies the new required fields.

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

**Files and implementation.** At `W/server/runtime/composition/modules/forms-admin.ts:50–65,82–99`, leave the mount, authorization, repo, executor, clock, ID generator, change sets, and outbox wiring intact. Bind `updateFormDefinition: ({ input }, optional = {}) => updateFormDefinition({ deps: formWriteDeps({ deps }), input }, optional)`. `W/features/forms/index.ts:119–124` already passes the options into the package write service. Inject:

- `mixedStatus` — “Save the form and change its status as two separate actions.”
- `missingDefinition` — “Send at least one form field you want to change.”
- `stale` — “This form changed since you opened it. Reload it before saving.”

In `openapi/010-forms.yaml:58–74,179–200`, document optional non-negative safe-integer `expectedVersion`, the 400 combinations and malformed values, the flat 409 with version details, and the definition DTO’s already-emitted `version`. Qualify the ignored-key/no-op comments to apply to legacy unversioned requests. At `A/features/forms/forms-i18n.ts:9–16` and `A/integrations/jini-admin/forms-ports.ts:20–31`, keep the current dictionary and scoped subscription bindings. The new keys arrive from P1-J1.J. Extend `A/features/forms/__tests__/forms-i18n.unit.test.ts:35–67` to pin their coverage.

**Tests first.** In `W/features/forms/__tests__/lost-update-boundaries.test.ts:17–29,46–60`, mount the real ordinary registrar with the in-memory Forms repo and recording outbox/change-set ports. Do not stub `repo.update` to throw for the new stale witness. Advance the actual row, then send the old basis through HTTP.

- `ordinary PUT with a stale expectedVersion is refused with 409 and changes no row and no outbox` → `drop-expected-version-at-host-binding`. Assert the whole row, outbox, and change-set counts are unchanged.
- `fresh expectedVersion saves` → `compare-against-wrong-version`. Assert the returned and stored versions agree and advance once.
- `versioned PUT with status is refused before either write` → `allow-versioned-mixed-put`.
- `malformed version is a 400` → `treat-malformed-version-as-omitted`.
- `legacy unversioned field patch, status-only and mixed requests behave as before` → `require-a-basis-on-legacy-put`.
- `all admin locales include the form reload notice and confirmation` → `drop-one-locale-reload-key`.

Why-comment: the service/repository CAS is authoritative. A route pre-read can still race and cannot substitute for it. Server can ship before the editor because old requests remain legal.

### P1-T4.T · Tovu · BUILDER: SOL

At `A/features/pages/PageEditor.tsx:392–415`, add the same `agentHandle` spread as P1-T4.J with handle `page-version-conflict-load-latest`. Put it on the existing button line so the change adds no lines to the size-ratcheted file. Leave `page-external-change-load-latest` at `:496–505` alone. No new host injection or signature change.

**Tests first.**

- `A/features/pages/__tests__/PageEditor.unit.test.tsx:432–439` — `Load latest carries the page conflict agent element, role and label` → `drop-page-load-latest-handle`. Assert the three attributes on the single conflict button, then confirm its existing click behavior.
- `A/features/posts/__tests__/PostEditor.dom.characterization.unit.test.tsx:223` — pin `post conflict Load latest keeps its visible name and exposes the agent handle` → `drop-post-handle-in-package`. After consuming P1-T4.J, re-record only the three-attribute delta in `__snapshots__/PostEditor.dom.characterization.unit.test.tsx.snap:47`. Keep the existing meaningful snapshot assertions.

This hunk is independent of the preview hunk. Serialize edits to `PageEditor.tsx` and re-pin if P1-T3 or the Pages extraction changes its location first.

## OPUS

### P1-J2.J · Jini · BUILDER: OPUS

The risk is redaction, not the card markup. The existing bt2 fix must stay in place for other tools.

**Files and implementation.**

- `J/chat/src/core/tool-presentation.ts:11` and `core/antigravity/tool-presentation.ts:12–21` are the normalization seam. In `react/components/ToolCard.tsx:64–71,115–161`, check `result?.isError === true` and the **exact** normalized tool ID before invoking any registered or family renderer. Match bare `assistant_ask_choice`, an MCP-qualified name whose exact tool segment is `assistant_ask_choice`, and a `call_mcp_tool` receipt normalized to either. Do not match by suffix alone or inspect error wording. Do not rewrite persisted events or affect the pending, successful, or retried grouping paths.
- Add a private `FailedChoiceCard({ result, useTHook, useCopyToClipboardHook }, _optional = {})` view with both custom hooks required. Bind the existing hooks at the chat composition point in `ToolCard.tsx`, or pass them down from its existing caller in `MessageRow.hooks.tsx:41–52`. Keep the public `ToolCard` call compatible. The failed branch hands `ExpandableCard` at `:413–446` a safe projection with no input or raw result. The row shows “The assistant couldn't open the choice form. Ask it to try again.” Render the same safe text for collapsed readers and on expansion. Header, badge, title, media rendering, and accessible text must never receive raw choice inputs or output. Copy details is a real button inside the expansion, not a nested button in the card head.
- At `J/chat/src/core/tool-call-detail.ts:28–56`, add `resultPresentation?: "display" | "copy-diagnostic"` to the existing options. Preserve the formatter’s C130 substitution by default. The diagnostic option bypasses only that substitution and still uses the same formatter, redactor, and cap. On click, call `describeToolCallDetail({ input: undefined, result }, { resultPresentation: "copy-diagnostic" })` and send only its redacted `outputText` to the injected hook. If there is no diagnostic, copy the safe sentence. Do not render, log, or put the clipboard payload in an attribute. Keep existing clipboard success behavior.
- Resolve `chat.toolCard.choiceFailed` and `chat.toolCard.copyDetails` through the `I18nAdapter` at `J/chat/src/react/slots.ts:231`, with the prescribed English defaults when the adapter returns the key or an empty string.

**Tests first.** In `J/chat/src/react/components/__tests__/ToolCard.test.tsx:997`:

- `a failed bare and MCP-qualified assistant_ask_choice shows the plain sentence collapsed and expanded` → `dispatch-before-choice-check`.
- `a failed normalized MCP wrapper shows the same plain sentence without matching error wording` → `classify-before-normalizing`.
- `failed choice leaves no schema text in the title, accessible description or collapsed reader` → `pass-raw-call-to-collapsed-reader`. Use a custom renderer spy that would echo its arguments if called.
- `Copy details copies the redacted diagnostic without the secret canary` → `copy-unredacted-result`. Include a recognizable synthetic secret and non-secret diagnostic text. Assert the latter survives, the former does not, and neither was mounted in the row.
- `a lookalike tool and successful and pending choices keep their existing rows` → `match-choice-suffix-or-ignore-isError`. Keep the existing WebFetch error case. In `core/__tests__/tool-call-detail.test.ts`, add `copy diagnostic redacts without changing the C130 display wording` → `bypass-redactor-in-copy-mode`.

Why-comment: failed tool protocol text is for the assistant to repair its call, not a user-facing explanation. The two representations stay separate so a new renderer cannot accidentally publish the diagnostic.

**Package:** No new exports. `./core` exposes `ToolCallDetailOptions` through `core/index.ts:14`, so combine updates that additive baseline. No public React export delta. Add `.changeset/chat-failed-choice-details.md` (`minor` for the added formatter option).

### P1-T2.J · Jini · BUILDER: OPUS

Add the narrow per-item authorization seam needed for the new HTML inverse. Today the two public revert entries check only `changeset.revert`, while `W/features/pages/permissions.ts:101–108` requires `pages.edit_html` at every raw HTML writer. Custom grants make those permissions independent.

**Files and contract.**

- `J/core/src/contracts/site/core-commands.ts:19–39` — add optional `EntityReverter.policy?: { permission: string; authorizationEntityType?: string; allowForce?: boolean }`. Add an optional second object `{ actorId?: UUID }` to `applyInverse`. Existing implementations and unmarked kinds are unchanged.
- `J/cms/src/core/commands/revert.ts:82–109,124–186,217–260` — extend the existing second object of `revertChangeSet(required, _optional = {})` with optional `actorId` and `authorizeItem`. The callback shape is `(required: { permission: string; entityType: string; entityId: UUID }, _optional?: Record<string, never>) => Promise<void>`. For a registered item with policy, require the callback and await it **before reading any current versions or applying any inverse**. Pass only scoped IDs and permission, never the inverse payload. Use `policy.authorizationEntityType ?? item.entityType`. If force was requested and `allowForce` is false, refuse with typed `RevertForbiddenError`. Missing authorization wiring fails closed. Keep the existing workspace, status, and agent-cannot-force rules. Forward only the current reverter’s actor ID to `applyInverse`, not the original writer’s identity.
- `J/cms/src/change-sets/tool-registrations.ts:130–171` and `admin-http/routes/change-sets/revert.ts:89–99` — supply the current caller and a closure over the current request’s existing authorizer to that second object. Keep the outer `changeset.revert` guard and tool confirmation. The tool maps a policy denial to a plain refusal. A stale non-forceable inverse tells the assistant to keep the newer version, not to suggest a forced undo. Do not add a tool input or a new grant.

**Tests first.** Add to the existing core revert suite and both entrypoint suites:

- `a reverter with a policy fails closed without an item authorizer` → `skip-missing-item-authorizer`.
- `a denied item prevents all current-version reads and all inverse writes` → `authorize-after-first-inverse`.
- `the item authorizer receives the mapped entity kind and no inverse payload` → `pass-full-inverse-item`.
- `force remains available for existing kinds and is refused for a non-forceable inverse` → `ignore-item-force-policy`.
- `tool and admin revert forward the current principal and authorize the scoped item` → `use-original-writer-as-revert-actor`.

Why-comment: a grant to revert an ordinary audited change must not confer the authority to publish raw HTML. The policy comes from the registered reverter, not from client input or a stored payload.

**Package:** Existing `@jini-ai/core/contracts/site/core-commands`, `@jini-ai/cms/core/commands`, `./change-sets/tool-registrations`, and `./admin-http/routes/change-sets/revert` exports only. Add `.changeset/scoped-change-set-revert-policy.md` (`minor` for core and cms). Combine refreshes the affected type baselines. No tool catalog/schema delta.

### P1-T2.T · Tovu · BUILDER: OPUS

Record exactly one scoped change set for each actual assistant HTML change. At merge-21, the durable transaction seam is plausible but must be proved with a forced insert failure. `W/features/pages/html-document-store.ts:282–291` joins the revisions repo transaction. `W/features/post/repo.ts:362–366` delegates to the kernel, and `W/platform/db/sqlite/change-set-repo.sqlite.ts:43–46` uses the same schema-erased kernel object. Jini’s kernel joins nested transactions. `executeCommand` itself does **not** open the outer transaction (`J/cms/src/core/commands/command.ts:76–96,115–135`).

**Files and proposed implementation.**

- `W/features/pages/tool-registrations.ts:388–421,555–596,604–724,731–737` — route real mutations through a small helper, `recordAssistantPageHtmlWrite({ deps, target, expectedVersion, operation, write, signal }, _optional = {}): Promise<{ version: number; changeSetId?: string }>`. `operation` is the exact three writer tool IDs. `target` carries workspace, resolved page ID, actor ID, and execution ID. Add only missing collaborators to `PagesToolDeps`: the bound `executeCommand`, `clock`, `idGen`, `changeSets`, and `outbox`. Use existing `authorize`, `postRepo`, and `pagesHtmlStore`. `W/assistant/tool-registrations.ts:126,155–169` already intersects the page and change-set deps. Adapt narrow page-store test fakes without weakening production wiring.
- Keep the existing permission check, target resolution, authoring checks, region guards, and model-facing refusal mapping. Abort before the first durable operation, including HTML conversion. Inside the same transaction, capture the scoped live row at the exact `expectedVersion`, then run the store operation on that basis. In the command use `entityType: "page-html"`, `operation: "update"`, the principal as an agent actor, a short summary without HTML, and a deterministic key scoped to the tool execution. The command authorization must still check `pages.edit_html` on the same post target as the existing writer. `captureEntityVersion({ result })` uses the store’s actual post-write version, not an assumed increment. Do not record a refusal or an unchanged normalized write. Preserve the current result shape on a no-op and include `changeSetId` only after a real command commits.
- Store an inverse `{ format: "html", html: string }` with the exact pre-write bytes. Under the recommended answer to the owner question below, a first full write from a doc row stores `{ format: "doc", bodyJson: JsonObject }` instead. Capture it before `ensureHtmlFormat` nulls `body_json`. Never derive it from `pages_read_html`’s rendered doc fallback. This is a payload shape, not a database migration.
- New `W/features/pages/html-reverter.ts` — `createPageHtmlReverter({ store, postRepo }, _optional = {}): EntityReverter`. Set `policy: { permission: PAGES_EDIT_HTML_PERMISSION, authorizationEntityType: "post", allowForce: false }`. `currentVersion({ workspaceId, entityId }, _optional = {})` reads only the live scoped page. `applyInverse({ workspaceId, item }, { actorId } = {})` validates the discriminated inverse and calls the scoped store’s `restore({ inverse, expectedVersion: item.entityVersionAtApply }, _optional = {})`. Restore must CAS on that exact version even after the gateway’s version check. Translate a lost CAS into typed `RevertConflictError` with plain recovery words. Never use unversioned `save`, convert a missing page, or resurrect a trashed row.
- Extend both implementations in `W/features/pages/html-document-store.ts:183–207,388–461,502–516,528–539,560–616` and `html-document-store.memory.ts:125–165,169–239`. The restore branch writes the historical HTML verbatim, not through current normalization or plugin authoring hooks. If restoring doc, update both body columns and format in one CAS using the existing exclusive-column invariant (`W/features/post/repo.rows.ts:146–166`). Increment version, append a revision attributed to the reverter, and preserve existing update event and reference-index behavior for the resulting format. Do not roll back unrelated metadata or `autosave_json`.
- Register `page-html/update` in real and memory composition beside the post/menu registrations at `W/server/runtime/composition/site-deps/route-deps-site-providers.ts:107–127` and `memory-deps/route-deps/assistant-and-site.ts:151–171`. Bind the same scoped page-store factories used by the write path at `site-deps/route-deps-content-chat.ts:133–141` and `memory-deps/route-deps/trash-and-content.ts:152–161`. Register at assembly once those factories are in hand. Do not create a second repo, kernel, or registry.
- `W/features/pages/agent-tools.ts` — document that an applied result with `changeSetId` can be undone through `change_sets_revert`, and that no ID means no recorded Undo. The existing Jini revert catalog already limits its promise to matching recorded changes. The moved-tools golden currently pins aggregate catalog bytes, not these handler results. Add direct result assertions. Re-record only the expected catalog-byte delta with the existing opt-in at `W/assistant/__tests__/moved-tools.golden.test.ts:158–165`, as in `c4b928926b`, if the new descriptions change it.

**Tests first.** Add `W/features/pages/__tests__/html-undo.integration.test.ts` using the real registrations and composed stores. The real-database fault witness should use the dialect harness patterned at `html-document-store.sqlite.test.ts:10–22`.

- `an assistant full write records one change set and change_sets_revert restores the earlier HTML byte for byte` → `skip-full-write-recording` and `normalize-the-inverse`. Include stored markup that current normalization would change.
- `a section write and a section move each revert to the exact prior HTML` → `skip-move-recording`.
- `a first full HTML write preserves the prior doc for scoped undo` → `capture-inverse-after-conversion`. Make this the positive test if the recommended owner default is chosen.
- `revert after a human save is refused and keeps the newer HTML` → `drop-revert-version-check`. `a human save between revert preflight and the restore CAS also wins` → `restore-without-cas`.
- `a refused or unchanged write records no change set` → `record-no-op`. `change-set insert failure leaves the row, version, revisions, references and outbox unchanged` → `commit-page-before-audit`.
- `a caller with changeset.revert but without pages.edit_html cannot restore raw HTML` → `skip-html-item-permission`. Check both the tool and Recovery entry, without weakening confirmation.
- Extend `W/server/runtime/composition/__tests__/pages-html-revisions-wiring.integration.test.ts:51–59,72–90` with `both composition roots record and can resolve a page-html change set`. Its existing positive fixture omits the now-required `expectedVersion`. Read the basis into that fixture rather than relaxing the real tool guard.

**Stop condition.** The memory post transaction at `repo.memory.ts:247–260` only snapshots posts, revisions, and autosaves. It does not cover an independent outbox or entry-reference store. Also, Jini’s memory change-set adapter pushes its rows before awaiting the outbox at `J/cms/src/core/commands/repo.memory.ts:25–32`. Prove the memory fault boundary with the real bound adapters, or report the precise missing rollback seam. Do not claim that wrapping `postRepo.transaction` rolls back those other objects. For durable storage, stop if any participating adapter does not join the same transaction. Do not add a second commit or compensating unversioned HTML write to get a green test.

Why-comments: preserve the pre-conversion revision rationale, why the inverse and CAS share one basis, why restore skips authoring transformations, and why only a committed record earns an Undo claim.

### P1-T3.J · Jini · BUILDER: OPUS

Add a neutral, authenticated route spec. Keep the existing HTML route and renderer where they are. Jini owns parsing an inert HTML document for iframe source attributes. Tovu supplies the policy for which sources merit a fallback link.

**Files and contract.** New `J/cms/src/admin-http/routes/posts/template-preview-embeds.ts`, alongside the post specs, with:

```ts
type PreviewEmbedsInput = {
  postId: string;
  rawTemplateChoice: unknown;
  body: unknown;
};

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

function createTemplatePreviewEmbedsRoute<TOutput>(
  _required: Record<string, never> = {},
  _optional = {},
): PreviewEmbedsRouteSpec<TOutput>;
```

Return a `defineJsonRoute` POST spec at `/api/admin/v1/workspaces/:workspaceId/posts/:postId/template-preview/embeds`. `parse` forwards the path ID, raw `templateChoice` query value, and untyped body. `handle` requires authenticated context and `authorize({ permission: "content.read" })`, with no entity type or ID, as in the current HTML preview. Missing auth fails closed. Only then call the injected renderer and projector. Use `responseHeaders: { "Cache-Control": "no-store" }` in the spec shape, following `J/cms/src/admin-http/routes/widgets/preview.ts:39–45,87–102`.

Parse the assembled HTML inertly with existing `parse5`. Walk only actual HTML iframe elements, require a `src` attribute, and do not scan comments, script text, `srcdoc`, or inert template content. No navigation, script execution, or URL fetch. Pass sources in document order to the injected projector. Return its JSON only. Do not add YouTube-specific type names, URL rules, content ports, or strings to the neutral route.

**Tests first.** New `J/cms/src/admin-http/routes/posts/__tests__/template-preview-embeds.test.ts`:

- `template preview embed inspection checks content.read before rendering` → `render-before-authorization`. Assert the exact authorization args and zero renderer/projector calls on refusal.
- `the projector gets iframe sources only, in document order` → `scan-all-src-attributes`.
- `script text, comments, srcdoc and inert template markup are not iframe sources` → `scan-serialized-source`.
- `the route forwards template choice and pending body and returns only the projection` → `drop-pending-body` and `return-rendered-html`.

Why-comment: inspection uses already-authorized rendered HTML because the preview document is intentionally unreadable to the admin frame. Do not trade the sandbox for easier inspection.

**Package:** Add real `./admin-http/routes/posts/template-preview-embeds` export in `J/cms/package.json` beside its post routes, with `types`, `import`, and `default` pointing to the matching `dist/admin-http/routes/posts/template-preview-embeds` files. Classify it as `node`, like the existing parser-bearing Pages entry at `:463`, because `:727–733` disallows `parse5` in universal entries. This is a server-side entry, not a server-framework dependency. No new dependency. Add `.changeset/cms-template-preview-embed-inspection.md` (`minor`) and let combine add the new subpath/types to the baseline.

### P1-T3.T · Tovu · BUILDER: OPUS

Mount the spec with the same render inputs and permission as the HTML preview, then use the projected IDs in the existing Page Preview list.

**Server files.**

- `W/server/inbound/admin-http/routes/posts/template-preview.ts:130–173,181–245` — extract `renderAuthorizedTemplatePreview({ deps, postId, rawTemplateChoice, body }, _optional = {}): Promise<{ html: string }>`. Keep the existing post ID-or-slug lookup, `resolveOverrideTemplateChoice`, `extractPendingBodyJson`, `extractPendingBodyHtml`, and call to the actual `renderPostPreview` at `template-preview-render.ts:134`. The helper is called only after authorization. The HTML GET/POST retain their present status/body mapping, URL-encoded handling, no-store, and exact CSP. The JSON mount uses this helper too, rather than fetching the HTML route or building an approximation of its template/widget renderer.
- `W/server/runtime/composition/modules/content.ts:8,240–248` — mount `createTemplatePreviewEmbedsRoute<{ youtubeIds: string[] }>({})` adjacent to the HTML preview using `mountAdminJsonRoute` with `authorization: "direct"`. Inject the workspace guard, current direct authorizer, the shared renderer closure, and the projector below. Preserve the permission argument shape of `template-preview.ts:188–198`, not the guarded publishing-grant semantics of the neighboring post CRUD routes. Map known not-found/no-theme outcomes to plain JSON refusals. The failure reporter keeps unexpected causes private. Add only the new route to the route-table characterization fixture.
- New `W/server/inbound/admin-http/routes/posts/template-preview-youtube.ts` — `projectPreviewYoutubeIds({ iframeSources }: { iframeSources: readonly string[] }, _optional = {}): { youtubeIds: string[] }`. Parse each value as an absolute HTTPS URL. Allow only exact origins for `youtube.com`, `www.youtube.com`, `youtube-nocookie.com`, `www.youtube-nocookie.com`, and `youtu.be`, with no user info or nonstandard port. On the long hosts accept only `/embed/<id>`, and on `youtu.be` only `/<id>`. The ID must match `^[A-Za-z0-9_-]{11}$`. Deduplicate in first-seen order. Discard every other part of the URL. No redirects, script execution, network calls, or general HTML exposure.

**Admin files.**

- At `A/features/pages/PageEditor.tsx:894–920,1088–1107,1215–1290,1378–1432`, pass `usePreviewEmbedIds` as a required prop to `PagePreview`. Bind the live hook at the Tovu mount, `A/panels.tsx:228`, and pass fakes through the direct PageEditor test fixtures. Share one `useThemePreviewFrame` result with the embed lookup and frame. Keep the existing preview subtree and hidden-form identities intact across fullscreen changes. If needed to stay under the size ratchet, put the preview-only subtree and its why-comments into a local `PageEditorPreview.tsx`. Do not do the package move in this sheet.
- New `A/features/pages/hooks/use-preview-embed-ids.hooks.ts` — `usePreviewEmbedIds({ id, templateChoice, version, previewRevision, pendingHtml, load }, _optional = {}): readonly string[]`, with `load({ id, templateChoice, pendingHtml }, { signal } = {}): Promise<{ youtubeIds: string[] }>`. The concrete host binding uses the existing authenticated request adapter (`A/lib/admin-http/request.ts:198–201`) with a workspace-relative URL, encoded real post ID, and the preview URL’s null/empty/named `templateChoice` semantics (`J/admin/src/posts/api/posts-api.ts:83–116`). A preview using the HTML GET sends no pending body. A preview using the hidden-form POST sends the same `bodyHtml` as that form, not a separate document draft. Use the existing preview debounce cadence for pending content. Abort superseded requests, also guard by request identity, and refresh on theme preview revision, saved page version, template, or submitted body changes. Never show the previous template’s IDs while a new request is pending. On failure keep the page-owned fallback. Union successful IDs with the existing page-owned list at `PageEditor.tsx:1268–1290`. Reuse its link text, fixed YouTube destination, and `rel`. No new i18n.

**Tests first.**

- New `W/server/inbound/admin-http/routes/posts/__tests__/template-preview-embeds.test.ts` — `a template-rendered youtube-nocookie iframe yields its id` → `inspect-page-body-instead-of-assembled-html`. Use the real preview renderer fixture style in `template-preview-render.test.ts:33,121`. `a deceptive host and a non-YouTube iframe yield nothing` → `accept-host-substring`. Include credentials, bad ID length, duplicate IDs, and an actual widget-produced iframe.
- Same file — `same auth as the preview route` → `mount-with-publishing-grant-or-skip-content-read`. Cover missing session, foreign workspace, denied principal, and allowed operator, with zero renderer calls after refusal. `pending body and explicit empty template choice match the HTML preview without persisting either` → `lose-template-tristate`. Assert the HTML preview still has its exact sandbox CSP and both surfaces remain no-store.
- New `A/features/pages/__tests__/PageEditor.preview-youtube.unit.test.tsx` — `a template-only video shows Watch on YouTube` → `ignore-rendered-ids`. `a late embed response for the previous template cannot replace the active links` → `accept-superseded-ids`. `embed inspection failure leaves the page-owned link available` → `replace-local-ids-on-error`. `a theme refresh rechecks links without changing the iframe sandbox` → `omit-preview-revision`. Exercise the authenticated port with clean and pending HTML requests.

Why-comments: the JSON endpoint sees the same authorized draft render as the iframe but returns only validated IDs. The sandbox, no-same-origin rule, anonymous visitor view of the rendered content, and no-store behavior remain intact. If the real reproducer only creates the iframe by executing script, stop and report that boundary. Do not execute the script server-side.

## Owner question

**Should Undo on the first full HTML write restore the previous rich-text body?** The plan promises Undo for a full write, but its `{ html, format }` inverse cannot reconstruct the doc body that conversion removes. The current store also describes that conversion as one-way. **Recommended default:** let this single recorded Undo restore the exact captured doc and format at the recorded version. Keep normal format conversion one-way and refuse Undo after a later save. If one-way is absolute even for Undo, the first conversion must return no undoable ID and must not promise Undo.
