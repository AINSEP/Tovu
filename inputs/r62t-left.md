# Combine-12 executor sheets

Jini pins are from `origin/integ/merge-12-2026-11-22`, whose report identifies `44f705c80` as the last content commit. Every Tovu sheet starts **after combine-12 Tovu**. Tovu line pins use merge-11 `311d26dfa6`, `tv-seed-upgrade` `2ddce9e825`, `tv-err1` `6da5c1455e`, or `tv-howto2` `c0f70b84c2` as marked. I checked the relevant paths against all five input branches. The combined Tovu tree was unavailable for a final line check.

Write the specified regression tests first. The mutations below are for a later verification pass. This dispatch changed no files and ran no tests, builds, installs, or type checks. Keep the two-object argument convention and existing pads, preserve rationale comments, inject component hooks through props, and keep functions within the 50/80-line and complexity-10 limits.

## 1. Disposition

| Item | Status | Executor scope |
|---|---|---|
| L1 Forms | READY | Jini editor refresh and version propagation, then Tovu conditional definition PUT |
| L2 Publish and import recipes | READY | Tovu W5 guidance at the actual publish entry points, plus W6 versioned import instructions |
| L3 T391 | READY | Tovu daemon shutdown idiom and extracted-function fixture |
| L4 Routing T1/T2 | READY | Tovu resolver wiring and remaining import overlay corrections |
| L5 Routing T3 | PARTIAL | Final launch fit check and guidance delivery accounting need a shared contract |
| L6 Core changeset | READY | Jini release metadata only |
| L7 Seed failure language | READY | Jini safe descriptions for typed install errors |
| L8 Refusal complexity | READY | Jini fold using the catalog’s own-message invariant |
| L9 Resource menu focus | READY | Jini card opening focus and board Escape behavior |
| L10 Failed choice row | READY | Jini plain failure text with redacted details available through Copy |
| L11 Seed upgrade follow-ups | PARTIAL | Durable recovery, historical provenance, and persistent publisher-update view |

## 2. READY sheets

### L1-J · Jini · Form editor refresh and definition versions · 6.5k tokens

**Base** Jini combine-12.

**Pins and edits**

- `packages/admin/src/core/ports/forms.ts:106` `AdminFormDefinition` and `:154` `AdminFormUpdatePatch`. Add optional `version` on reads and optional `expectedVersion` on updates. Older hosts can omit the read version. `forms/models.ts:10` `formView` already spreads it. `forms/adapters/http.ts:35` already sends the patch unchanged and chooses `/authoring` for mode or HTML. Keep that routing. In `forms/adapters/memory.ts:21–41`, implement versioned writes, including a plain typed `VERSION_CONFLICT`, and keep the precondition out of the stored record.
- Under `packages/admin/src/forms/react/`, `hooks/use-form-editor.hooks.ts:128–150,177–181` wires the editor. Pass optional `formsEvents` from the existing `FormsPorts` context. At `hooks/use-form-editor-parts.hooks.ts:44–72`, invalidate the current form read on the event. Follow the stable callback and unsubscribe pattern in `hooks/use-forms-list.hooks.ts:78–88`. The event carries no record ID, so read the open form through its existing key, with the existing workspace scope and new-form guard.
- Replace the once-per-route seed with apply-or-prompt behavior. Compare the response with the currently applied snapshot, using the existing dirty comparison at `form-editor-dirty.ts:31–48`. A clean editor applies a newer definition. A dirty editor retains its draft and the version it was based on, and offers **Reload form** with an explicit discard confirmation. Keep the newest pending snapshot. Guard against older responses, late responses for another form, and responses that arrive during a save or toggle. Use `react/pages/FormEditor.tsx:23–61` and its existing dialog pattern. Keep the existing hook prop.
- At `use-form-editor-parts.hooks.ts:83–105,125–166`, send the **applied** version on existing-form definition Save, including Builder and HTML. Use the loaded record ID when the route is a slug. Omit `expectedVersion` for a legacy read that has no version. On `VERSION_CONFLICT`, show plain reload copy, retain the draft, and request a fresh read through the same apply-or-prompt path. The status action still sends `{ status }`. A status response may contain a definition edited elsewhere. Update visible status, and reconcile the returned definition through the same comparison. Only advance the draft’s version when the returned definition is applied or its saved payload matches the applied baseline, including carried `notify` and provider settings.

**Callers and deltas.** `FormEditor` → `useWiredFormEditor` → `useFormEditor` → the existing `AdminFormsPort`. `useFormsList` remains a status-only caller. `FormsPorts.hooks.ts:8–13` already carries the subscription, and the HTTP adapter carries both fields without another transport. Update the additive admin API baseline entries for the two types and any exported controller/view shape that changes. Route notice and action text through bound `t`, with English keys in `forms/messages.en.ts`. No plugin catalog delta.

**Tests first.** Extend `react/__tests__/use-form-editor.unit.test.tsx` and the wired `FormEditor.unit.test.tsx` using `legacy-ports.ts:61`’s event seam. A clean editor reads again and shows the assistant’s change. A dirty editor preserves the draft, sends its original version, handles a stale save, and only replaces the draft after reload confirmation. Include a late result after changing form, a status response containing an independently changed definition, and a legacy unversioned read. In `forms/__tests__/forms-api.conformance.test.ts`, pin both PUT paths and the status-only payload. **Mutations** Remove the event invalidation, seed every same-form result, or adopt the status response’s version while retaining the old definition baseline. Each must break a witness.

**STOP** if the draft and the version supplied to Save can come from different stored definitions, or if route switching can apply the previous form’s result.

### L6 · Jini · Core release changeset · 0.8k tokens

**Base** Jini combine-12. See `cloud-results/combine-12-jini.md`, decision 1, and `.changeset/config.json:5` for the fixed package group. Add `.changeset/core-error-reporter-contract.md` with this exact text:

```md
---
"@jini-ai/core": major
---

Update the error reporter to use the observability port and report incidents with their error ID, label, operation, and tracker trace IDs. Read `OperationTracker.traceIds()` when the tracker provides it. Incident replies include the recovery action, and caller-facing refusals use the supplied fallback for `own-message` bindings.

Replace `ErrorReporterPorts.tracker` with `observability: Pick<ObservabilityPort, 'reportError'>`. Pass `operation` and `tracker` to `describe`, and pass `operation` to `record`. To bracket a unit of work with one operation tracker and one failure report, use `runOperation`.

`IncidentTrackerReport` and `createRecordingTracker` have been removed. Use `ErrorReport` from `@jini-ai/core/contracts/observability` and `createRecordingObservability` from `@jini-ai/core/errors/testing`. `createRecordingReporter().reports` now contains `ErrorReport` entries.
```

**Callers and deltas.** Release metadata for the existing changes in `packages/core/src/errors/reporter.ts`, `errors/testing.ts`, and `contracts/observability.ts`. The combine report found no production consumer of the removed exports in Jini or Tovu. Core’s API baseline already records the changes in `0e66320a`. The removals and required arguments warrant `major` under the repo’s changeset convention, with fixed-group implications at release time.

**Acceptance first.** Check the one-file artifact against the report’s exported-signature list. **Mutation** Delete the changeset or either removed export from its prose. The artifact check must fail. This metadata-only sheet needs no runtime test edit. **STOP** if the exact path already exists with conflicting release content. Versioning, publishing, and baseline regeneration are outside this edit.

### L7 · Jini · Bundled install refusal descriptions · 2k tokens

**Base** Jini combine-12.

**Pins and edit.** `packages/agent-plugins/src/lifecycle/install-errors.ts:4–27` owns `AgentPluginInstallErrorCode` and its class. Add an exhaustive, fixed sentence table keyed by that type and an internal describer. Call it in `seed-bundled.ts:259–301` `seedOne`’s catch. Use typed class recognition, with `createErrorDescriber` at `packages/core/src/model-facing-tool-errors.ts:431` available if using the shared safe class/code extraction. An arbitrary thrown object with a `code` field must receive the existing diagnostic path. Use the existing `describeErrorForLog` fallback for unrelated exceptions.

For `PLUGIN_ID_CONFLICT`, use **“A plugin with this name is already installed from a different publisher. Check the installed copy before trying again.”** Give the other codes fixed reasons for the applicable size or file-count limit, failed integrity check, invalid or unsupported archive entry, missing or invalid `plugin.json`, or inability to save the verified package. Keep paths, hashes, thrown messages and causes out of the reason.

**Callers and deltas.** The bundled lifecycle factory calls `seedOne`. The host consumes `outcomes[].reason` in the existing seed report. Keep the helper out of `lifecycle/index.ts`. No i18n, catalog, or API baseline delta.

**Tests first.** In `packages/agent-plugins/src/lifecycle/__tests__/unit/seed-bundled-edges.unit.test.ts:75–109,147–154`, throw a real `AgentPluginInstallError` from the injected packing path with a canary in its message and cause. Assert the fixed conflict sentence and that a second plugin still seeds. Cover at least one integrity or manifest refusal and a code impostor. **Mutation** Route the typed error back through the stock `describeErrorForLog`. **STOP** if the sentence depends on arbitrary error text or the failure escapes the per-plugin report.

### L8 · Jini · Fold `refusalError` · 1.2k tokens

**Base** Jini combine-12, decision 2.

**Pins and edit.** `packages/core/src/errors/reporter.ts:158–168` `refusalError`, called only by `refusal` at `:181`. Drop the redundant `own-message` branch at `:163` and retain the existing non-sentence fallback at `:164`. `catalog.ts:114` produces `{ mode: 'own-message' }` without a `message`. Keep the audience restriction, fixed copy, sentence interpolation, parameter redaction, and status/retryability handling. Preserve the rationale at `reporter.ts:157`. If clarifying the catalog comments at `catalog.ts:17,164–167`, distinguish model rules from caller-facing matches.

**Tests and mutation.** The failing acceptance witness is the reported complexity-11 row. The real-catalog behavior tests in `errors/__tests__/reporter.test.ts:243–283` and `errors/__tests__/catalog.test.ts:130–132,191–196` already pin the behavior of the fold. Preserve them. **Mutations** Reinsert the redundant branch and require the later complexity inspection to catch 11 even if the ratchet recognizes it as inherited debt. Make the catalog return the raw own-message text and require the reporter tests to catch disclosure. The original branch removal alone is behavior-equivalent for the real catalog.

**Deltas and STOP.** No i18n, catalog data, public signatures, or baseline changes. Stop if the actual reporter receives a catalog implementation that can supply `message` for an own-message match. In that case preserve the defensive check in a small helper and keep the guard witness.

### L9 · Jini · Resource card menu focus · 2k tokens

**Base** Jini combine-12. Paths below are under `packages/ui/src/features/resource-dashboard/`.

**Pins and edit.** `react/components/ResourceCardParts.tsx:17–55` `ResourceCardMenuItems` owns the menu DOM and existing arrow navigation. Focus the first enabled menu item on mount using its local DOM ref. If none is enabled, leave focus on the trigger. At `:59–103` `ResourceCardMenu`, let Escape reach the board listener from an open menu’s trigger, including the all-disabled case. Keep the Enter/Space click and keydown propagation guard. In `react/hooks/useResourceBoard.ts:175–204` `useBoardMenu`, focus the connected trigger inside the current `menuContainerRef` on Escape before clearing the open ID. Keep the outside-click path from pulling focus away from the clicked control.

**Callers and deltas.** `ResourceBoard.tsx:118` → `ResourceBoardView` → `ResourceBoardViewParts.tsx:40–61` → `ResourceCard.tsx:76–82` → `ResourceCardMenu`. Use the existing anchor ref and trigger marker. No required props, i18n, catalog, or API baseline changes.

**Tests first.** Extend `__tests__/ResourceCard.test.tsx:140–155,213–219` for focus after click and keyboard open. Add a real-hook board case in `__tests__/ResourceBoard.test.tsx` for Escape restoring the exact trigger after opening a second card’s menu. Cover busy items and outside click. **Mutations** Remove the mount focus or the Escape restoration. **STOP** if closing one card focuses another card’s trigger, an outside click steals focus, or opening the menu activates/selects its card.

### L10 · Jini · Failed `assistant_ask_choice` tool row · 3k tokens

**Base** Jini combine-12. Paths below are under `packages/chat/src/`.

**Pins and edit.** `react/components/ToolCard.tsx:64–80,128–161` normalizes display names and dispatches the card. Reuse the existing tool normalization at `core/tool-presentation.ts:11`, and recognize the exact choice tool, including its MCP-qualified representation and normalized inner call. Route its failed result to a small choice-failure row using the existing `ExpandableCard` at `:413`. Keep the same tool row handle and Retried state. Render **“The assistant couldn’t open the choice form. Ask it to try again.”** and **Copy details** via the injected translator. Give the header, collapsed reader at `:434`, and error badge at `:466–476` only the safe display result. The public DOM, accessible description, and tooltip must all use plain words.

Keep the recorded event intact. Format copied diagnostics using `core/tool-call-detail.ts:48–69`’s existing redaction path and copy only after a click. Reuse `react/hooks/useCopyToClipboard.ts` through an injectable hook prop and the established copy feedback pattern. Pending and successful choice rows keep their existing path. Other tool failures retain their existing behavior.

**Callers and deltas.** `MessageRow`/tool timeline and direct `ToolCard` consumers share the dispatch boundary. Handle the failed choice before passing raw output to a registered renderer. No event or core API changes. Add translator keys using the chat adapter, with no vendor-specific copy or catalog entries.

**Tests first.** Extend `react/components/__tests__/ToolCard.test.tsx:997–1115`. Feed the actual-shaped schema failure through a bare and MCP-qualified call, plus an existing normalized wrapper fixture. Assert absent raw details when collapsed, expanded, and read through title/accessible text. Click Copy and assert the redacted schema detail was copied, with the secret canary removed. Keep the pending/success cases and the generic `WebFetch` error witness. **Mutations** Pass the original result to the collapsed reader or badge, or copy unredacted `result.content`. **STOP** if a failed choice can reach a second raw-output renderer after classification or if the fix depends on a particular CLI’s schema-error wording.

### L1-T · Tovu · Version-checked ordinary form PUT · 3k tokens

**Base** after combine-12 Tovu. Pins from merge-11. Coordinate rollout with L1-J.

**Pins and edit.** Under `apps/website/src/`, `server/inbound/admin-http/routes/forms/update.ts:25–66` builds and applies the legacy partial patch, then performs the independent status action. After authorization at `:81–104`, parse `expectedVersion` with the same helper as `routes/forms/authoring.ts:43–53`. Pass it to `features/forms/index.ts:122` `updateFormDefinition` so the existing conditional write makes the decision. Keep `http/forms.ts:117–125`’s 400 and 409 mapping and the version already returned by the DTO at `:61–80`. The stale response should say the form changed and to reload before saving.

Use `expectedVersion` only on a recognized definition patch. Refuse a versioned request that also includes `status`, or that has no definition fields, with a plain 400 before either write. This gives the approved separate actions a precise wire contract. Preserve legacy unversioned definition, status, mixed, and ignored-body requests. Keep field filtering, permissions, and the authoring endpoint.

**Callers and deltas.** `registerAdminFormsUpdateRoute`, the Jini HTTP adapter used by `apps/admin/src/integrations/jini-admin/forms-ports.ts:20–35`, and older HTTP clients. The assistant authoring path already supplies a precondition. Update `openapi/010-forms.yaml:45`’s ordinary PUT with the optional definition version and 400/409 behavior. No tool catalog delta. Add Tovu translations through its existing forms dictionary if the host translator needs them for L1-J.

**Tests first.** Extend `features/forms/__tests__/lost-update-boundaries.test.ts:14–27,45–59` with the ordinary route. Use the actual memory repo, change the definition after taking the editor snapshot, and assert stale 409, fresh success, and zero state or outbox changes on refusal. Cover malformed version, versioned mixed refusal before writes, and legacy unversioned mixed and status-only requests. **Mutation** Drop `expectedVersion` from the write-service call. **STOP** if the check happens only in a route pre-read, or if a refused definition save can still flip status.

### L3 · Tovu · T391 daemon shutdown fixture · 1.4k tokens

**Base** after combine-12 Tovu. Pins from `tv-err1`.

**Pins and edit.** `apps/website/src/server/inbound/assistant/agent-daemon-server.ts:39–59` `exitDaemon`. At `:48`, replace the swallowed publication rejection with `await afterSettled({ promise: registryPublication })` from `@jini-ai/core/errors/idioms`. Keep startup’s separate observation of the original rejection, the scope-disposal ordering, PID ownership check, and signal handlers. This entry point is spawned. The extracted execution in `server/runtime/composition/__tests__/process-root-parity.test.ts:412–445` is its affected fixture.

**Tests first.** Import the real helper in that test, add `afterSettled` to the `new Function` parameter list at `:426`, and pass a forwarding spy through the matching argument slot. Assert it receives the original publication promise once, after the store closes. Retain the pending-pointer assertion, rejected-after-rename scenario, and duplicate-signal check. Before the source edit the spy assertion fails. **Mutation** Remove the await on `afterSettled` or move pointer removal before it. **Deltas and STOP.** No i18n, catalog, or API delta. Stop if the fixture needs an invented global, or if a second signal can bypass the in-progress cleanup.

### L4-T1 · Tovu · Consume Jini’s companion and inactive-read contract · 4.5k tokens

**Base** after combine-12 Tovu, with the actual Jini combine-12 `@jini-ai/agent-plugins` artifact available to the executor. Merge-11 pins unless marked.

**Pins and edit.** `apps/website/src/features/agent-plugins/automatic-agent-plugins.ts:111–132` `createEntry`. Change the resolver to `resolve: ({ pluginId, ...request }, { allowInactiveGuidance = false } = {}) => …`. Forward it with `deliveryMode: 'inject'` and the existing request. Jini’s `packages/agent-plugins/src/lifecycle/automatic-use.ts:50,152–156,315–325` passes the opt-in for explicit off-plugin guidance and leaves automatic reads active-only. Preserve overlay assembly in Tovu `lifecycle.ts:145–162,190` on **`tv-seed-upgrade`**. `tool-registrations.ts:104–110` already preserves `companions` from Jini candidate metadata.

**Callers and deltas.** `assistant-byok.ts:547–552,583–591,611–627,686–720` composes the controller. `assistant-tool-exec.ts:123–177` serves daemon preflight, consumed by `agent-daemon-run-start.ts:312–390`. `automatic-agent-plugins.ts:141–169,208–216` owns explicit loading and capability guidance. No Tovu API, i18n, or catalog schema delta. The existing `0.7.3-next.2` pin predates these exports. Release integration must use the actual successor artifact and corresponding range/lock update.

**Tests first.** Extend `assistant/__tests__/automatic-agent-plugins.integration.test.ts:31–80,320–360,697–753` with real installed kUInetic and UI/UX Design metadata. Assert full accepted companion and host-overlay text, an undelivered catalog entry, and exact delivered IDs through CLI RPC and the BYOK owner. Disable a candidate between listing and resolution. Automatic delivery then omits it, and a separate explicit read while off returns read-only guidance without granting its tools or claiming delivery. In `features/agent-plugins/__tests__/unit/bundled-automatic-relevance.unit.test.ts:17–58`, project `companions` and `requires` and assert delivered versus catalog IDs. Keep the Vercel inspiration case. Pin kUInetic `0.1.1`, its `ui-ux-design` companion, and the packaged fallback in `bundled-kuinetic-package.unit.test.ts:34–61`. **Mutation** Restore unconditional `allowInactiveGuidance: true`. **STOP** if only the stock `next.2` artifact is available, or if the change affects principal binding, retry caching, or argv protection.

### L4-T2 · Tovu · Finish the overriding import guidance · 3k tokens

**Base** after combine-12 Tovu, with Jini combine-12 site-import `1.0.3`. Content pins from **`tv-howto2`**.

**Pins and edit.** `content/agent-plugin-overlays/site-import/GUIDANCE.md:12–25,41–43` and `host/content-mapping.md:24–53` already contain named-reference routing, staging, and provenance rules. Complete the draft-preview instruction by naming `content_post_preview` by entry ID, followed by the public `/` check after the approved switch. In `content/agent-plugins/tovu-theme/skills/tovu-theme/SKILL.md:492–514,563–609,671–690`, move the read-only survey ahead of the sole Part B choice. The card must be able to list exact live moves/replacements, activation, activation-dependent template assignments, and local publication. Keep the unchecked static opt-out. Both branches stage work beyond the card’s approved scope. Preserve the active-theme template rationale, draft priority, Part C’s named-page/shared-chrome rule, supplied assets, and the Luvira rationale.

**Callers and deltas.** Tovu `lifecycle.ts:145–162` on `tv-seed-upgrade` and `tool-registrations.ts:68–82` deliver the overriding text. The portable import package enters Part C. Part B loads the host mapping. `features/post/preview-tool.ts:17–29` serves the draft reader. Bump Tovu’s `content/agent-plugins/tovu-theme/plugin.json:4` from `1.1.3` to `1.1.4` once for T2 and W6 together. No Jini catalog or API delta.

**Tests first.** Extend `content/agent-plugin-overlays/site-import/__tests__/site-import-overlay.test.mjs:44–62,86–91` and `apps/website/src/features/agent-plugins/__tests__/unit/bundled-tovu-theme-package.unit.test.ts:269–333`. Pin read-only inventory before one card, exact cutover items, staging for occupied home/menu in both paths, and draft entry-ID preview before checking `/`. **Mutations** Put the card before the survey, restore a pre-approval `previous-home` move, or treat branch choice as approval for an unlisted live change. **STOP** if staging needs an unapproved live write or the package test still blesses previewing the wrong entry.

### L2 · Tovu · W5 scoped publish and W6 versioned import recipe · 3k tokens

**Base** after combine-12 Tovu. Apply after L4-T2 when batched. Pins below are before these follow-up edits.

**W5 pins and edit.** The publish guidance is `apps/website/src/server/inbound/assistant/assistant-system-overlay.ts:183–198` `overlayCatalogProtocol` and `features/publish-content/agent-tools.ts:45–61,94–105` `publishContentAgentToolCatalog`, both pinned to **merge-11**. `tovu-site-guide.json:254–294` on `tv-howto2` is the deployment card and static-host recipe.

In the overlay and catalog, direct the assistant to call `publish_content_status`, resolve “this page” from current page context or resolve the named items through content reads, and show the destination and exact item titles before calling Publish. Use a nonempty `items` array of exact keys for a named request, plus `peerId` when needed to bind the destination. Ask on ambiguity. Omit item filters only for an explicit request to publish everything pending. Retain explicit overwrite consent, verified live URLs from results, and names for skipped or unverified items. The tool at `tool-registrations.ts:353–360` calls `publishContentFromTool` directly. Its peer confirm/execute exchange is machine-to-machine, and `__tests__/publish-tool.test.ts:158` explicitly pins execution without a UI card. Correct the tool description’s promise of a human card. W5’s guidance requires the assistant to show scope and destination.

**W6 pins and edit.** On **`tv-howto2`**, `content/agent-plugin-overlays/site-import/host/content-mapping.md:83–88` and `content/agent-plugins/tovu-theme/skills/tovu-theme/SKILL.md:595–601` contain the two incomplete recipes. In both paths, read each created or verified prior draft with `pages_read_html { id }`; send `pages_write_html { id, html, expectedVersion }` with its returned version and stable top-level region handles. In batches send the version per item. Count a layout body only after `written: true`. Report `written: false` and tool refusals as incomplete, re-read and reconcile conflicts before retry, and inspect/report warnings on successful writes.

**Callers and deltas.** The overlay prompt and tool catalog serve CLI and BYOK. `publish-tool.ts:57–88,168–195` already applies item selection and reports actual outcomes. The host overlay and bundled theme skill reach public-URL and local-folder imports. `features/pages/tool-registrations.ts:522,543–578` on `tv-howto2` already reads and enforces the version. No wire, i18n, or API baseline delta. Share L4-T2’s single theme version increment.

**Tests first.** Extend `assistant-system-overlay.unit.test.ts:314` on `tv-howto2` and the publish catalog test. Pin named/current-page guidance, showing the destination and titles, exact nonempty `items`, and the explicit-all rule. Extend `publish-tool.test.ts:175–182` with one named item among unrelated pending work. Assert only the named key reaches the final confirmed plan and the returned title and URL identify it. In the mapping and packaged-skill tests pin ordering, per-item version, and the mixed outcome rule with one refusal and one successful warning. **Mutations** Restore the unfiltered instruction for “this page,” drop the named filter at final planning, or count a refused body as saved. **STOP** if the destination or item is ambiguous, or if a requested hard approval gate is being implemented as part of this wording sheet.

## 3. Batched Codex jobs

| Order | Repo and job | Dependencies | Est. tokens |
|---|---|---|---:|
| 1 | Jini L6 → L8 → L7 | Jini combine-12 | 4k |
| 2 | Jini L9 → L10 | Jini combine-12 | 5k |
| 3 | Jini L1-J | Jini combine-12 | 6.5k |
| 4 | Tovu L3 → L1-T | Tovu combine-12. Use the L1-J payload contract and land server support before rolling out the editor. | 4.4k |
| 5 | Tovu L4-T1 → L4-T2 → L2 | Tovu combine-12 and Jini combine-12 plugin artifact. Share the theme bump and keep the two skill edits in this order. | 10.5k |

## 4. PARTIAL items

### L5 · Tovu routing T3, with a Jini prerequisite

**Verified pins.** Tovu merge-11 `assistant-tool-exec.ts:106–177` accepts a run ID and returns one merged `prefix` plus IDs. `automatic-agent-plugins.ts:53–55,188–206` caches preparation by logical turn. `agent-daemon-run-start.ts:312–390` gathers guidance before the selected agent, session history, attachment notice, page context, and final prompt exist. Jini combine-12 `automatic-use.ts:164–195,268–288` records delivery during preparation and uses the presence of `maxPromptArgBytes` to skip automatic full guidance. Jini `agent-runtime/src/prompt-budget.ts:44–55,147–167,216–241` has distinct platform, `.cmd` shim, and direct executable checks. The Tovu fixture at `automatic-agent-plugins.integration.test.ts:697–753` proves the existing bounded and pinned paths.

**Missing for READY.** Pin a shared probe at the launch boundary that checks the selected definition and actual composed invocation, including platform quoting and launch decoration. Pin a two-phase Jini interface that returns complete candidate sections and catalog text without recording delivery, then commits only the chosen sections for the live principal and attempt. The Tovu RPC needs that commit/retry contract before it can replace the flattened prefix. Define how final assembly asks for catalog-only or the paged discovery pointer if full sections or the full catalog exceed the verified budget. Preserve pinned behavior and on-demand loads. The first witnesses should cover an exact fit, one-byte overflow, Unicode and Windows quoting, selected-agent changes, cached retry, and a deferred ID remaining absent until actual full delivery. **Mutations** Size the early user text or commit the offered IDs before fit selection. The owner’s full-guidance policy is settled.

### L11 · Tovu bundled publisher-ID upgrade

**Base and pins.** After combine-12 Tovu, `tv-seed-upgrade` `2ddce9e825`. `apps/website/src/features/agent-plugins/bundled-id-upgrade.ts:76–91` discovers blockers, `:101–117` moves each checked revision, `:129–135` trusts one recorded digest per short ID, and `:142–169` restores in-memory outcomes. `lifecycle.ts:198–215` sequences move → seed → restore. `server/runtime/boot/bootstrap.ts:386–387` consumes the current boot’s `idUpgrades`. Extend `__tests__/unit/bundled-id-upgrade.unit.test.ts` and `installed-plugin-id-upgrade.unit.test.ts` once these contracts are pinned.

| Follow-up | Missing for READY |
|---|---|
| Journal and interruption recovery | Pin a workspace-scoped atomic journal storage and lock spanning move, seed, and recovery, including overlap with Jini’s layout migration. Specify the durable phase transitions and reconciliation when the old root, saved root, or canonical root exists. Write intent before the first rename. Verify canonical publication before committing, and keep failed restores pending. The current catch can lose a partially moved batch, and `restoreUnseededUpgrades` reports `restored` even if a rename fails. Witnesses need restart after each move boundary, failed install, interrupted restore, and concurrent boot. |
| Multiple revisions and legacy layout | Identify trustworthy historical shipped digests and obtain representative legacy-layout fixtures. The one-entry ledger at `:133` cannot vouch for multiple revisions. Pin how Jini’s legacy migration and Tovu’s verification share ordering and package identity. Keep publisher ID, ledger provenance, and repacked bytes as independent checks. Test two proven old revisions, an adjacent operator upload, and a held migration. |
| Persistent publisher-update list | Pin the admin read owner and the retention/acknowledgment rule. The boot report is transient. The persistent record needs a stable workspace and transition key so retries update a single entry, plus a plain reason for held and restore-pending cases. Prove the list survives restart and repeated boot without duplicates. |

## 5. Owner questions

1. **Should native `publish_content_publish` require a human approval card before it applies the named selection?** The tool description currently promises one, while the registered handler and its test explicitly execute without it. I recommend shipping W5’s scoped guidance and accurate description first. If approval is required, scope a separate gateway change that binds the approved destination and item keys to execution.
2. **Should the publisher-update list retain resolved entries after acknowledgment?** I recommend one entry per workspace and publisher-ID transition, with unresolved entries visible until resolved and resolved entries retained as history. Keep the recovery journal until recovery or upgrade is confirmed independently of any acknowledgment.
