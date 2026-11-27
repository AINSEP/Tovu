# Ordered commit plan — r62t-rev-arch Tovu

Base: `codex/tv-b-arch` at `7c87b3c3f95301d59f55041bf163b723bbab5d79` (confirmed before editing); initial working tree clean.

All seven Tovu SOL sheets are implemented in the working tree, in the dispatch order below. The coordinator commits these slices; `.git` is unchanged. The manifest has A07 and A09 hunks, so split those hunks when committing. Include this plan with the coordinated handoff.

No tests, temporary mutations, builds, installs, type-checks, linters, or architecture/error gates were run. Pins were written before each sheet's production changes. All executable evidence and mutation-red confirmation remain pending for Opus/cloud. Static source/diff/caller reads are the only review evidence here.

Bootstrap: read the dispatched programmer profile and governing instructions from `/Users/la/Programming/Tovu/AI-Dev-Shop/`; architecture sections 13/14 were read at the main checkout because the required architecture section files and AI-Dev-Shop folder are absent in this clone. The supplied design is the approved boundary and pattern contract; explicit dispatch restrictions supersede default test/commit/delegation workflows.

## 1. A07 — Shared duplicate-name policy

Status: implemented; verification pending.

Pins first: four cases in `content-duplicate.form.test.ts` and `content-duplicate.post-page.test.ts`. Both mounts copy `Landing 2` with `Landing` and `Landing 3` occupied to `Landing 4`; both preserve the exact 1000-attempt exhaustion message. Existing fixture/repository helpers are reused.
Mutation: `M-copy-of-fallback` substitutes a `Copy of …` naming collaborator in one duplicate-handler test mount; its numeric-suffix assertion must fail.
Change: the existing `DeriveDuplicateName` type is already exported from Jini forms. Forms and post receive the same required host policy; existing live repo queries, search bounds, suffix and wording stay in their owners. No new Jini prerequisite is needed.

Files:

- `apps/website/src/assistant/__tests__/content-read-get-by-id.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.forms.test.ts`
- `apps/website/src/features/forms/__tests__/agent-tools.unit.test.ts`
- `apps/website/src/features/forms/__tests__/common-field-tools.test.ts`
- `apps/website/src/features/forms/__tests__/content-duplicate.form.test.ts`
- `apps/website/src/features/forms/__tests__/lost-update-boundaries.test.ts`
- `apps/website/src/features/forms/__tests__/tool-contract.characterization.test.ts`
- `apps/website/src/features/forms/__tests__/tool-definition-view.unit.test.ts`
- `apps/website/src/features/forms/__tests__/tool-registrations.model-facing-errors.test.ts`
- `apps/website/src/features/forms/tool-registrations.ts`
- `apps/website/src/features/post/__tests__/content-duplicate.plugin-hook-failed.test.ts`
- `apps/website/src/features/post/__tests__/content-duplicate.post-page.test.ts`
- `apps/website/src/features/post/__tests__/post.creator-kind.test.ts`
- `apps/website/src/features/post/__tests__/tool-registrations.admin-url.test.ts`
- `apps/website/src/features/post/post-tool-duplicate.ts`
- `apps/website/src/server/runtime/composition/__tests__/form-delivery.security.test.ts`
- `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`

## 2. A09 — Media public URL binding

Status: implemented; verification pending.

Pins first: three URL parity cases (rendition, SVG original, no public transform) and one lookup-failure case added to `media-generation/__tests__/tool-registrations.test.ts`. Two deterministic existing fixtures persist identical bytes/names; the results pin matching slug/hash/URL, and failures preserve the thrown error after saving.
Mutation: `M-return-original-for-rendition` bypasses the rendition branch in the resolver used by the bindings; the explicit `/public.v1/image.webp` assertions must fail.
Change: local `ResolvePublicUrls` contracts in import and generation; required resolver threaded through persistence/replacement and asset deps, bound at the manifest. A03 must retain this resolver binding when changing the asset seam.
Exact-symbol caller search repeated in the named feature/composition/assistant areas. `media-replace-cache.integration.test.ts` was opened: it uses the resolver and replacement service directly, so no contributor/persistence call needs repointing. `content-target-inputs.ts` is not changed. No unrelated resolver consumers changed.

Files:

- `apps/website/src/assistant/__tests__/tool-registrations.media-import-egress-refusal.integration.test.ts`
- `apps/website/src/features/asset-transfer/asset-destinations.ts`
- `apps/website/src/features/asset-transfer/copy-tool.ts`
- `apps/website/src/features/fs-files/__tests__/asset-tool-fixture.ts`
- `apps/website/src/features/fs-files/__tests__/copy-tool.test.ts`
- `apps/website/src/features/image-transform/__tests__/tool.test.ts`
- `apps/website/src/features/image-transform/tool.ts`
- `apps/website/src/features/media-generation/__tests__/providers-tools.test.ts`
- `apps/website/src/features/media-generation/__tests__/tool-registrations.test.ts`
- `apps/website/src/features/media-generation/tool-registrations.ts`
- `apps/website/src/features/media-import/__tests__/import-local-file.test.ts`
- `apps/website/src/features/media-import/__tests__/import-video-conversion-wiring.test.ts`
- `apps/website/src/features/media-import/__tests__/replace-file.test.ts`
- `apps/website/src/features/media-import/__tests__/tool-registrations.test.ts`
- `apps/website/src/features/media-import/tool-registrations.ts`
- `apps/website/src/features/media/__tests__/media-producing-previews.test.ts`
- `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`

## 3. A13 — Search projection input

Status: implemented; verification pending.

Pins first: body and empty-body cases in the existing dialect-matrix suite assert complete projected documents, including title, URL/key, revision and visibility metadata.
Mutation: `M-search-use-raw-row` changes the test factory binding to `toPostRecord: (row) => row as never`; the nonempty-body pin must fail because persisted snake_case body columns are not post records.
Change: `createCmsSearchRules({ toPostRecord }, _optional = {})`, one host/test binding to existing `toRecord`, and the named INFO.md factory reference. Other rules unchanged.

Files:

- `apps/website/src/features/site-search/INFO.md`
- `apps/website/src/features/site-search/__tests__/cms-search.test.ts`
- `apps/website/src/features/site-search/cms-search-rules.ts`
- `apps/website/src/server/runtime/composition/modules/site-search.ts`

## 4. R04 — Tovu hook injection

Status: implemented; verification pending.

Pins first: the new media mount case in `media-screen-states.unit.test.tsx` clones the actual lazy admin mount with a distinct fake hook and asserts its unique error state reaches the screen. It supplies the remaining real mount hooks and a Suspense boundary. `media-required-hooks.typecheck.tsx` uses the actual mount props for a fully supplied JSX expression and an omitted-useMediaHook expression with the required `// @ts-expect-error`.
Mutation: `M-media-hook-local-fallback` restores the old optional `useMediaHook` declaration and local fallback; the omitted-hook directive becomes unused and the type-check must fail.
Change: required hook collaborators replace the reviewed calls and adjacent defaults in all eight files. The existing parent chains and host mounts pass the same implementations. `BoundVisitorCredentialForm` is the stable Tovu component binding used by the Jini panel and its existing direct test mounts; Jini contracts are untouched. `useSavedKey` is aliased to `selectSavedKey` at its existing destructuring/event boundary.
Additional direct mounts found and repointed: request-volume measurement, theme-preview test, execution-entry integration test, and credential form component props. Hook-only measurements are unchanged. Existing narrow modal controller return contract is retained; hook args derive from the existing implementation.

Files:

- `apps/admin/src/__measurements__/request-volume.measurement.test.tsx`
- `apps/admin/src/features/ai-assistant/AiAssistant.tsx`
- `apps/admin/src/features/ai-assistant/__tests__/AdminExecutionMode.unit.test.tsx`
- `apps/admin/src/features/ai-assistant/__tests__/AiAssistant.unit.test.tsx`
- `apps/admin/src/features/ai-assistant/__tests__/VisitorCredentialForm.unit.test.tsx`
- `apps/admin/src/features/ai-assistant/__tests__/byok-no-key-message-i18n.unit.test.tsx`
- `apps/admin/src/features/collections/CollectionEntryEditor.tsx`
- `apps/admin/src/features/collections/__tests__/CollectionEntryEditor.dynamic-field.unit.test.tsx`
- `apps/admin/src/features/collections/__tests__/CollectionEntryEditor.unit.test.tsx`
- `apps/admin/src/features/collections/__tests__/collections-agent-drive.unit.test.tsx`
- `apps/admin/src/features/database/Database.tsx`
- `apps/admin/src/features/database/__tests__/Database.unit.test.tsx`
- `apps/admin/src/features/media/Media.tsx`
- `apps/admin/src/features/media/__tests__/Media.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/media-agent-drive.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/media-card-metadata.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/media-grid-fit.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/media-i18n.unit.test.ts`
- `apps/admin/src/features/media/__tests__/media-item-deep-link.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/media-order-by.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/media-preview-click-lightbox.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/media-required-hooks.typecheck.tsx` (created)
- `apps/admin/src/features/media/__tests__/media-screen-states.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/media-tab-counts.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/media-type-filter.unit.test.tsx`
- `apps/admin/src/features/pages/PageEditor.tsx`
- `apps/admin/src/features/pages/__tests__/PageEditor.interactive-flush.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/PageEditor.preview-remount.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/PageEditor.unit.test.tsx`
- `apps/admin/src/features/plugins/AgentPluginDetailsModal.tsx`
- `apps/admin/src/features/plugins/AgentPlugins.tsx`
- `apps/admin/src/features/plugins/PluginProviderSettingsDialog.tsx`
- `apps/admin/src/features/plugins/Plugins.tsx`
- `apps/admin/src/features/plugins/__tests__/AgentPluginDetailsModal.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/AgentPlugins.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/AgentPluginsAddTab.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/agent-plugin-manage-surfaces.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/agent-plugin-memory-panel.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/agent-plugin-surface-frame.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/agent-plugin-update.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/plugin-provider-settings.unit.test.tsx`
- `apps/admin/src/features/themes/__tests__/theme-preview-dirty.unit.test.tsx`
- `apps/admin/src/hooks/__tests__/tovu-execution-entry-points.integration.test.tsx`
- `apps/admin/src/media-panel.ts`
- `apps/admin/src/panels.tsx`

## 5. R06.T — Private args conversion, held-back theme ordering

Status: implemented; verification pending.

Pin first: `held-back-themes.unit.test.ts` adds distinct `Z.css`/`a.css` paths, asserts code-unit order at the public check boundary and independently computes the sorted byte digest. The public path is invoked without a new optional argument.
Mutation: `M-swap-required-fields` swaps the `a`/`b` relative-path values at the sole compareText caller; order and digest assertions must fail.
Change: only the private comparator signature and its sole in-module caller. Array.sort callback and hashed bytes unchanged. Jini R06.J is reported completed, although this Tovu comparator is independent.

Files:

- `apps/website/src/features/theme/__tests__/held-back-themes.unit.test.ts`
- `apps/website/src/features/theme/held-back-themes.ts`

## 6. R08 — Tovu OAuth shell

Status: implemented; verification pending.

Pin first: `no-ports-shell.test.ts` asserts `fs.existsSync` for the former `ports.ts` path is false.
Mutation: `M-restore-tovu-oauth-shell` restores the old file and must fail that pin.
Change: four named type-only consumers use canonical package contracts, `ports.ts` is deleted, and its grant/PKCE/expiry and safety rationale moves verbatim to the named `index.ts` destination (comment only; no exports/forwarder). The destination did not exist at HEAD and is created as explicitly named by the sheet.
Scoped OAuth-qualified specifier searches in apps and packages, relative specifiers within OAuth, and root/admin TypeScript/Vite/Vitest configuration reads found no additional consumer or alias to repoint.

Files:

- `apps/website/src/platform/oauth/__tests__/authorization-code.test.ts`
- `apps/website/src/platform/oauth/__tests__/helpers.ts`
- `apps/website/src/platform/oauth/__tests__/no-ports-shell.test.ts` (created)
- `apps/website/src/platform/oauth/__tests__/providers.test.ts`
- `apps/website/src/platform/oauth/__tests__/token-refresh.test.ts`
- `apps/website/src/platform/oauth/index.ts` (created)
- `apps/website/src/platform/oauth/ports.ts` (deleted)

## 7. A15 — Delete stale debt rows only

Status: implemented; verification pending.

No new fixture or mutation, as specified. The isolated diff deletes exactly 12 named crossFeatureEdges strings and the one named catch-reads-error debt object. No additions, threshold/meta changes, or --update invocation.
Handoff: after the OPUS source fixes, Opus runs architecture and error gates and confirms their outcomes.

Files:

- `development/scripts/check-architecture.baseline.json`
- `development/scripts/error-gate-debt.json`

## Stops, prerequisites and sheets left

No Tovu SOL sheet stopped; no Tovu sheet skipped for an incomplete Jini prerequisite. No Jini files edited. Read-only Jini report: R06.J, G12 and G20 completed; G13 stopped for absent replace/import/upload-cap anchors; K03a stopped because K01 strategy slots have not landed. None of these two stopped sheets blocks these seven Tovu changes. The pre-existing DeriveDuplicateName and media URL contracts were read from `codex/b-archj`.

All 43 OPUS sheets left untouched: A01–A06, A08, A10–A12, A14; R01–R03, R05, R07, R09; K01–K06; G01–G11, G14–G19, G21–G23. Cross-repo OPUS sheets remain entirely with the coordinator/Opus lane.

## Final diff pruning and removals

- Removed redundant real-hook properties/imports from test binding objects where every existing mount already supplies a fake or explicit implementation; retained only required missing collaborators.
- Reverted incidental edits to historical comments in the manifest and forms characterization header. Preserved existing why-comments, including the collection resolver's rationale at its consumer and OAuth's rationale at its named destination.
- Removed the three explicitly named hook fallback resolvers (execution mode, execution credential, collection editor), adjacent hook defaults/optional declarations, and obsolete runtime hook imports; type imports retain signature ownership. Non-hook defaults remain.
- Removed only the OAuth ports forwarding file and A15's exact 13 entries. No extra helper, configuration, error handling, baseline refresh, or production behavior change was added beyond the sheet seams.

## Verification handoff

Run the named pins and each temporary mutation above, reverting every mutation afterward. Type-check website tests and admin (including the required-hooks witness). Review R04's direct mounts/measurements and unchanged hook call order. At combine, after OPUS A01–A14 source work, verify actual cross-feature pair sets, architecture/error gates, and the owner-rule census; this lane claims no green gate or runtime result. Existing large UI functions/files are not split because those splits are outside these sheets. A09's generation file remains at the 500-line ceiling.
