# UI-A04: widget config editors -> `@jini-ai/admin/widgets` (templates T-UI + T-SPLIT)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A04` (8 files, 1.8k lines claimed; the directory is 2.2k with the preview hook and the dependency/port files).

Tier: S1 Sonnet, S2 Sonnet + Opus review (kit gaps, effects), S3 Sonnet. est. executor tokens ≈ 125k (S1 30k, S2 60k, S3 35k). Chrome look owed after S3.

## What exists, what is missing (read before slicing)
- Jini `admin/widgets` already has the module, controllers, pages and **a host slot** `WidgetsSlots.ConfigFields` (`widgets/react/hooks/WidgetsPorts.hooks.ts:7`) with the contract `{ widgetType, config, onChange, agentHandle?, t? }`. The slot is filled by Tovu today (`apps/admin/src/integrations/jini-admin/widgets-module.hooks.ts:9-15`, `WidgetsConfigFieldsSlot` -> `WidgetConfigFields`). The package comment says "Shared config UI/catalog/defaults and slug policy stay host-owned"; A04 changes only the UI half: Jini ships a default implementation of the slot, the catalog and the defaults STAY host-owned (`WIDGET_TYPE_OPTIONS`, `defaultWidgetConfig`, `WidgetConfigFields.tsx:568-598`).
- Config key names (`menuRef`, `formDefinitionId`, `maxItems`, `links`, `items`, `layout`, `columns`, `body`) are the shapes of `cms/src/widgets/types.ts`/`registry.ts`. `admin` may not import `cms` (COMMON rule 5), so S1's tests pin the keys with literal fixtures, never an import.
- Jini `admin/react/kit.tsx` (landed C9a) has `Dialog, IconButton, Button, TextField, Select, Switch, TabBar, InfoTip, WidgetSelect, Notice` and hooks `useNativeDialog, useFocusTrap, useAgentHandle`. It has **no** `Icon`, no tooltip wrapper (Tovu's `DockHeaderTip`), no device-preview frame, no tab-keyboard hook. Decisions (all within the package, no kit change):
  - `Icon` (9 names: `close plus alert-triangle arrow-up image play volume`): 7 inline-SVG icons in `widgets/react/config-fields/ConfigIcons.tsx`, copied from the Tovu `Icon` registry entries (`rg -n "\"alert-triangle\"|\"arrow-up\"" packages/ui/src/react/components/Icon*.ts*` in Jini for the path data).
  - `DockHeaderTip` (3 uses): replaced by `IconButton label=` (accessible name + native `title`), which is what the kit's IconButton gives every host. Behaviour change: the custom hover tooltip becomes the native one. Listed in the Chrome look; owner may veto -> then add a `Tip` slot to the kit in C9a's addendum (not here).
  - `useTabBarKeyboard` / `resolveTabBarTabIndex` (`@jini-ai/ui/tab-strip`): the two-tab mode switch (Media | Raw HTML) uses the kit `TabBar` (arrow-key behaviour is the kit's). Parity test: ArrowRight/Left/Home/End move selection (red first).
  - `DevicePreviewFrame` + `useWidgetPreview` (+ `renderWidgetPreviewDocument` in `widget-config-fields-dependencies.hooks.ts:21`): preview is a **host port** `WidgetPreviewPort { render(required: { source: string }, optional?: { signal?: AbortSignal }): Promise<string> }` plus an OPTIONAL render-prop `renderPreviewFrame?: (props: { html: string; title: string; children?: never }) => ReactNode` in `WidgetConfigHost`. Absent -> the editor shows no preview section (Tovu passes both). `DevicePreview*` is its own row (CLASSIFY `admin/components/DevicePreview` MOVE to ui); A04 does not move it.
  - Media library (`MediaPickerPort` of `components/MediaPickerDialog/media-picker-port.hooks.ts`: `listMedia` + `mediaOriginalUrl`, plus `acceptedMediaItems`/`useMediaPickerItems` from `MediaPickerDialog.hooks.tsx`, CLASSIFY MIXED): the new port is `WidgetConfigMediaPort { list(required: Record<string, never>, optional?: { signal?: AbortSignal }): Promise<readonly ConfigMediaAsset[]>; originalUrl(required: { id: string }, optional?: Record<string, never>): string }`. `ConfigMediaAsset` is a structural subset of `media/models.ts` `MediaAsset` (`id, slug, title, alt, contentType`); the editor files import it from `../../media/models.js` (own package, leaf). `acceptedMediaItems` (a 6-line filter by `mediaKindOf`) is re-written inside `config-fields/rules.ts`, not imported from Tovu.

## Guards (blobs at integ/wave-b)
```
tovu_files (move or split, then delete/reduce):
  - apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx | blob 3e1764f618509b4217491ed0a8bb2475f9fa3162
  - apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.hooks.tsx | blob e1557fe6317891fd3cb98c7794d55b9739c29582
  - apps/admin/src/components/WidgetConfigFields/HtmlAttributeRows.tsx | blob 596af34bedc381c2695e08dd81d8e3b90286bb07
  - apps/admin/src/components/WidgetConfigFields/HtmlAttributeRows.hooks.ts | blob aeb4fc5196537e863c33c65729ae281ababce581
  - apps/admin/src/components/WidgetConfigFields/MediaContentEditor.tsx | blob 16a9e81b2b0863e15170348afbc1b9d9b435a42f
  - apps/admin/src/components/WidgetConfigFields/MediaContentEditor.hooks.ts | blob abeca446d555ff749f692a40a1029d5ff8dd6c85
  - apps/admin/src/components/WidgetConfigFields/PlacementContentFields.tsx | blob a690a788e632c4414e839e15766a41d25ddca29c
  - apps/admin/src/components/WidgetConfigFields/media-content-rules.ts | blob 9155b7140c1c2dc2863f942b6a8df5994ae3ccf8
  - apps/admin/src/components/WidgetConfigFields/widget-config-fields-port.hooks.ts | blob e54687fef0218dedbb3b58533b27ffac0ca050bb
  - apps/admin/src/components/WidgetConfigFields/widget-config-fields-dependencies.hooks.ts | blob 5e37af8741bede2204a1f341871c154c5271514b
  - apps/admin/src/components/WidgetConfigFields/WidgetPreview.hooks.ts | blob f469e13b3c0787766fe529ac2330e7f20f16adb8
tovu_tests (move, adapt, delete):
  - apps/admin/src/components/__tests__/WidgetConfigFields.unit.test.tsx | blob 2cbd0a19640fcd98c1969dcc49bc342d8b8cbc9c
  - apps/admin/src/components/__tests__/WidgetConfigFields.hooks.unit.test.tsx | blob cae3362cad0057fb4fe2185a530bac8c05059548
  - apps/admin/src/components/__tests__/widget-config-fields-dependencies.unit.test.ts | blob 91b83e73e3332e50c3ec78b8f77c7cda262cd3fd
  - apps/admin/src/components/__tests__/WidgetPreview.unit.test.tsx | blob 824bb17c4821634939da0eef904f9c6c935eb5cd
  - apps/admin/src/components/__tests__/agent-handle-batch2.unit.test.tsx | blob 0f35947b3deec0633aa2c454803692c0b4efe71d
  - apps/admin/src/components/WidgetConfigFields/__tests__/HtmlAttributeRows.unit.test.tsx | blob 7d3a9fc2221e327dcf12cd3e027c24c651fbfa78
  - apps/admin/src/components/WidgetConfigFields/__tests__/MediaContentEditor.markup.unit.test.tsx | blob df1991b7634e6749c75f7be7012d65d0e0cba8a6
  - apps/admin/src/components/WidgetConfigFields/__tests__/MediaContentEditor.unit.test.tsx | blob a61151d3daea788d715b850620ed9c2e3ee75880
  - apps/admin/src/components/WidgetConfigFields/__tests__/PlacementContentFields.unit.test.tsx | blob 42f5505860d417a82431110bd5303005d804ac0b
tovu_edited (stay):
  - apps/admin/src/integrations/jini-admin/widgets-module.hooks.ts | blob 47b997797835ebc2339ba61dc534f52cf16b9b10
  - apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.tsx | blob 4902d38579b4347f4d13eb0d67f491d7b12bbc2c
  - apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.hooks.tsx | blob fd1691843b7963bb20b1c635ed42f77c4ee8caf5
  - apps/admin/src/components/__tests__/WidgetPickerDialog.unit.test.tsx | blob aa225a66ddf94daa11a374f0643771192eca65c9
  - apps/admin/src/components/shared-components-i18n.ts | blob 36711fbd48d26cf2ce021e1ebea3467c9b5c80d1
jini_guards:
  - packages/admin/src/widgets/index.ts | blob 613c88fe792e37b5d08765b263a3d27010c943d1
  - packages/admin/src/widgets/react/index.ts | blob bf622fb90cb87eb425661add9a5f9fc27da1b807
  - packages/admin/src/widgets/react/hooks/WidgetsPorts.hooks.ts | blob 571b3869ca0a34272959d91e98998b08d5d03b3f
  - packages/admin/src/widgets/models.ts | blob 82b3d374976b1b03bfaef42e785a4f6acd7b998f
  - packages/admin/src/media/html-attributes.ts | blob c25595dd035ee2ba472565e216bec971c5323ba3
  - packages/admin/package.json | blob f2b5d622f77a970deb49575370f56f321698ce7b
  - packages/admin/src/widgets/config-fields/** and packages/admin/src/widgets/react/config-fields/** must not exist
```

## Contracts (new, `packages/admin/src/widgets/config-fields/ports.ts`)
```ts
export interface WidgetConfigOptionsPort {              // = Tovu WidgetConfigFieldsPort (widget-config-fields-port.hooks.ts:14), re-shaped
  listMenus(required: Record<string, never>, optional?: { signal?: AbortSignal }): Promise<readonly ConfigMenuOption[]>;          // { id, title, status }
  listForms(required: Record<string, never>, optional?: { signal?: AbortSignal }): Promise<readonly ConfigFormOption[]>;          // { id, name, status }
  listCollections(required: Record<string, never>, optional?: { signal?: AbortSignal }): Promise<readonly ConfigCollection[]>;    // { key, label, fields: { name, label?, kind }[] }
}
export interface WidgetConfigHost {
  readonly options: WidgetConfigOptionsPort;
  readonly media: WidgetConfigMediaPort;
  readonly preview?: WidgetPreviewPort;                 // absent -> no preview section
  readonly renderPreviewFrame?: (props: { html: string; title: string }) => ReactNode;
  /** Slug policy stays host-owned (Tovu: asciiSlug). Used by the social-links and filter rows to derive handle segments. */
  readonly slugify: (required: { text: string }, optional?: Record<string, never>) => string;
  /** Which content types appear in the Collection list picker (Tovu: isUserCollection({ key })). */
  readonly isSelectableCollection: (required: { key: string }, optional?: Record<string, never>) => boolean;
  /** Fields the collection widget may display/filter (Tovu: ContentTypeFieldKind set, WidgetConfigFields.hooks.tsx:89). Default: the same 9 kinds. */
  readonly displayableFieldKinds?: ReadonlySet<string>;
}
```
`ConfigCollection.fields[].kind` is `string` (open vocabulary): Tovu's `ContentTypeFieldKind` union is assignable. The conversion `AdminContentType -> ConfigCollection` is the Tovu adapter's `.map`, not a Jini concern; `AdminMenu/AdminFormDefinition` are structurally assignable (extra fields ignored): S3 adds the same type-level assertion as A03.
Stays Tovu: `WIDGET_TYPE_OPTIONS`, `defaultWidgetConfig`, the closed `AdminWidgetType` union, legacy `images`/`mediaId` -> `items` conversion (`legacyImagesToItems`, media-content-rules.ts:90, reads the legacy gallery shape: **stays**, passed as `host.legacyImages?: (required: { images: unknown[]; library: readonly ConfigMediaAsset[] | null }) => ConfigMediaItem[]`, default `() => []`), the `{{media:slug}}` token snippet (`mediaSnippetFor`, media-content-rules.ts:373: token syntax is Tovu's embed marker: **stays**, passed as `host.mediaSnippet?: (required: { slug; alt?; contentType? }) => string`; default `({ slug }) => slug`), HTTP DTOs, `shared-components-i18n.ts` dictionary (keys are the English phrases), CSS.

```
id: UI-A04-1 .. UI-A04-3
feature: admin/components/WidgetConfigFields -> @jini-ai/admin/widgets (config-fields + react/config-fields)
jini_target: admin src/widgets/config-fields/{ports.ts,rules.ts,social-links.ts,collection-config.ts,index.ts} and src/widgets/react/config-fields/{WidgetConfigFields.tsx,MediaContentEditor.tsx,HtmlAttributeRows.tsx,PlacementContentFields.tsx,ConfigIcons.tsx,*.hooks.ts*} ; package.json: no new subpath (exported from "./widgets" and "./widgets/react")
kit_injection: admin kit slots listed under "What exists" (Dialog, IconButton, TextField, Select, Switch, TabBar, InfoTip, Notice) via ../../../react/kit.js; hooks useNativeDialog/useAgentHandle via the same file
agent_handles: UNCHANGED. Every `agentHandle({ handle: ... })` literal/template keeps its text. The moved code gets `base` as the existing `agentHandle` prop (slot contract) and appends the same suffixes (`-search`... as today). Diff the handle id set before/after (rg) in S3.
changeset: @jini-ai/admin: minor | "widgets: default config-field editors (text, social links, collection list, menu, contact form, media/gallery, placement content) behind WidgetConfigHost"
```

## UI-A04-1 — Jini headless (commit 1)
0. Branch rule; blobs; `rg -n "config-fields|WidgetConfigHost" packages/admin/src` prints nothing. Precondition: A02 not required (S1 imports Jini `parseMediaHtmlAttributes`, already exported at `media/index.ts:41`).
1. Failing tests first (RED on the Jini parent = module missing; the pure cases are copied green from Tovu, so RED/GREEN is moves, plus these NEW behaviour cases): in `widgets/config-fields/__tests__/rules.test.ts`
   - from `components/__tests__/WidgetConfigFields.hooks.unit.test.tsx` (the pure half: `humanizeFieldName`, social-link row ops, recent-entries config transitions) and the rule cases of `MediaContentEditor.unit.test.tsx` (mode stash/restore `switchMediaContentMode/viewedMediaContent/inactiveTabWillBeDropped`, `moveMediaItem`, `mediaSlugProblem` empty/invalid/duplicate/unknown/full, `appendMediaSlugs`, `htmlAttributesToRows/rowsToHtmlAttributes/isDroppedAttributeRow`, `insertAtSelection`, `lineCount`);
   - NEW: `readMediaContent` with `host.legacyImages` absent returns `items: []` for a legacy `{ images: [...] }` config (today it converts; the conversion is injected now) and with the Tovu function injected returns the converted rows (this is the only behaviour delta of the split);
   - NEW: `mediaSnippetFor` default (`slug`) vs injected token function;
   - NEW: `isSelectableCollection` filters the collection list; `displayableFieldKinds` default equals the legacy 9-kind set (list them by copying `COLLECTION_DISPLAYABLE_FIELD_KINDS`, WidgetConfigFields.hooks.tsx:89).
2. Code (plain TS, `(required, optional = {})`, ≤ 50 lines, complexity ≤ 10): `rules.ts` = Tovu `media-content-rules.ts` with `AdminMedia` -> `ConfigMediaAsset`, `parseMediaHtmlAttributes` from `../../media/html-attributes.js` (note the Tovu call `parseMediaHtmlAttributes(text)` becomes `({ text })`: the Jini signature), `legacyImagesToItems` and `mediaSnippetFor` removed (injected, above); `social-links.ts` = the pure part of `useSocialLinksConfig` (`SocialLink`, add/update/remove as pure functions); `collection-config.ts` = `COLLECTION_DISPLAYABLE_FIELD_KINDS`, `humanizeFieldName`, the pure transitions of `useRecentEntriesConfig` (toggle field, set sort, add/remove filter row: functions returning the next `config`); `ports.ts` per Contracts; `index.ts` exports; `widgets/index.ts` adds one `export * from './config-fields/index.js';`.
3. Checks: COMMON 2-9; `rg -n -i "tovu|site-chat|apps/|@/lib|asciiSlug" <new files>` prints nothing; no `console.*`; eslint; changeset; commit `feat(admin/widgets): headless config-field rules and ports`.

## UI-A04-2 — Jini React (commit 2, Opus review)
New files under `widgets/react/config-fields/` (Tovu source in brackets): `WidgetConfigFields.tsx` [WidgetConfigFields.tsx:75-566 minus catalog] split into one file per sub-editor (the Tovu file is 598 lines: `TextConfigFields`, `SocialLinksConfigFields`, `RecentEntriesConfigFields` (+`CollectionSelect`, `SortSelect`, `FieldsCheckboxes`, `FilterRow`), `MenuConfigFields`, `ContactFormConfigFields`) so each is ≤ 200 lines; `MediaContentEditor.tsx` [377] -> `MediaContentEditor.tsx` + `MediaItemList.tsx` + `HtmlSourceTab.tsx` + `LibraryPicker.tsx`; `HtmlAttributeRows.tsx`; `PlacementContentFields.tsx`; hooks: `useMediaContentEditor.ts` [MediaContentEditor.hooks.ts], `useHtmlAttributeRows.ts`, `useFetchedOptions.ts` [WidgetConfigFields.hooks.tsx:314: uses `useFetchQuery`: import the admin kit's `query` (`AdminKit.query`) via `../../../react/kit.js`, NOT `@jini-ai/ui/fetch-query`]. The slot factory `createWidgetConfigFieldsSlot({ host }, optional = {}): WidgetsSlots['ConfigFields']` in `slot.tsx`; `widgets/react/index.ts` exports it.
Class renames (each ONCE; new text contains old; counts via `rg -c` before editing, listed in the report; S3 repeats them over CSS/tests/e2e): `media-content-editor` (+ `__x` elements) -> `jini-media-content-editor`; `html-attribute-rows` -> `jini-html-attribute-rows`; `widget-config-*` -> `jini-widget-config-*`; `widget-embed-content-choice` -> `jini-widget-embed-content-choice`. Classes shared with the rest of Tovu (`notice`, `btn-ghost`, `btn-secondary`, `btn-primary`, `field-label`, `field-hint`, `field-error`, `field-mono`, `segmented`, `settings-dialog`, `media-picker-*`, `page-preview-iframe`, `editor-actions`, `widget-picker-footer`) are host presentation classes: replaced by kit components where a kit slot exists (`Button`, `Notice`) or by `jini-` classes whose CSS Tovu defines (`jini-field-label` etc. already exist: `rg -n "jini-field-label|jini-field-error" apps/admin/src/integrations`; if absent, S3 adds them).
i18n: every visible string through the `t` prop (slot contract `t?: WidgetsTranslate`), default identity; strings are English phrase keys exactly as in `shared-components-i18n.ts`.
Tests (red first): the component tests of `WidgetConfigFields.unit.test.tsx`, `MediaContentEditor.markup/unit`, `HtmlAttributeRows`, `PlacementContentFields`, `agent-handle-batch2` adapted to a fake `WidgetConfigHost` (`createFakeWidgetConfigHost` in `widgets/react/config-fields/__tests__/fake-host.ts`, built from Tovu's `createFakeWidgetConfigFieldsPort`), rendered inside the admin `fake-admin-kit` (`react/__tests__/fake-admin-kit.tsx`). NEW cases: tab keyboard parity (Home/End/Arrow); IconButton labels replace the tooltip (assert `aria-label` and `title`); no preview section without `host.preview`; the slot renders the right editor for each of the 7 type keys and returns null for an unknown key.
Complexity: the Tovu `MediaContentEditor.hooks.ts` hook is 120 lines: split into `useMediaItems`, `useSlugDraft`, `useLibraryPicker`, `useHtmlCaret` (≤ 50 each) in the move.
Commit `feat(admin/widgets/react): default config-field editors behind WidgetConfigHost`.

## UI-A04-3 — Tovu binding + reduce + delete (commit 3, Sonnet; after wave B, S1, S2)
1. New `apps/admin/src/integrations/jini-admin/widget-config-host.ts`: builds `WidgetConfigHost` from `api` (`options.listMenus = () => api.listMenus().then(r => r.menus)`, `listForms = () => api.listForms().then(r => r.data)`, `listCollections = () => api.listContentTypes().then(r => r.items.map(toConfigCollection))`, `media = { list: () => api.listMedia().then(r => r.media), originalUrl: ({ id }) => api.mediaOriginalUrl({ id }) }`, `preview = { render: ({ source }, { signal }) => renderWidgetPreviewDocument({ source }, { signal }) }`, `renderPreviewFrame = ({ html, title }) => <DevicePreviewFrame … />`, `slugify = ({ text }) => asciiSlug({ text })`, `isSelectableCollection = ({ key }) => isUserCollection({ key })`, `legacyImages`, `mediaSnippet`). `renderWidgetPreviewDocument` moves here from `widget-config-fields-dependencies.hooks.ts:21` (it reads `WORKSPACE_ID`/`authenticatedAdminRequest`: host-only). Type assertions for the DTOs as in A03.
2. New `apps/admin/src/components/WidgetPickerDialog/widget-catalog.ts` holding `WIDGET_TYPE_OPTIONS` and `defaultWidgetConfig` (cut from `WidgetConfigFields.tsx:568-598`, verbatim incl. the REQ-09 comment). Repoint (exact): `WidgetPickerDialog.tsx:9` and `WidgetPickerDialog.hooks.tsx:11` imports -> `./widget-catalog`; `widgets-module.hooks.ts:5` same; `components/__tests__/WidgetConfigFields.unit.test.tsx` is deleted (its catalog cases move to a new `__tests__/widget-catalog.unit.test.ts`, 2 cases: `WIDGET_TYPE_OPTIONS` keys; `defaultWidgetConfig` per key).
3. `widgets-module.hooks.ts` (edit): delete `WidgetsConfigFieldsSlot` (lines 9-15) and its import of `WidgetConfigFields` (:5) and `sharedComponentsT` use for the slot; the options object (`widgetsHostDefaults`, :18-24) gets `slots: { ConfigFields: createWidgetConfigFieldsSlot({ host: widgetConfigHost }), AddControl: WidgetAddControl }`. The locale-bound `t` stays: today the slot swaps `t` for `sharedComponentsT({ locale })` because ConfigFields has a different dictionary; keep that by wrapping at the slot boundary in the same file (a 4-line component that reads `useWidgetsOptions().locale`, as now), NOT by a forwarder.
4. `WidgetPickerDialog.tsx` renders `WidgetConfigFields` directly (line 9): import `WidgetConfigFields` from `@jini-ai/admin/widgets/react` and pass `host` through a `WidgetConfigHostProvider` that Tovu mounts once in `AdminModulesProvider` (STOP if the dialog can open outside that provider: `rg -n "WidgetPickerDialog" apps/admin/src --glob '!__tests__'` shows it is mounted from `EmbedInsertControl` (editor toolbar) and `WidgetAddControl`; verify both are under `AdminModulesProvider`, else give the dialog an explicit `host` prop instead).
5. Delete the 11 `tovu_files` except `widget-config-fields-dependencies.hooks.ts`, which is reduced to the `renderWidgetPreviewDocument` + fake-port parts that moved (delete the file after step 1 moves them; `components/__tests__/widget-config-fields-dependencies.unit.test.ts` is repointed to the new binding file, not deleted: it tests the preview adapter). Delete the 9 tests listed except those repointed.
6. `parseMediaHtmlAttributes` census: `rg -n "features/media/rules" apps/admin/src` must show no hit from `WidgetConfigFields/*` (A02 may have repointed the rest).
7. CSS/e2e: rename per the S2 count table in `styles/media-content-editor.css`, `styles/forms.css`, `styles.css`, `styles/select.css`, `integrations/jini-admin/jini-media.css`; `rg -n "media-content-editor|html-attribute-rows|widget-config-|widget-embed-content-choice" apps tests --glob '!**/node_modules/**'` before/after with the same counts.
8. Census gates: `rg -n "components/WidgetConfigFields/" apps` prints only what S3 kept; eslint on touched files; commit `refactor(admin/widgets): serve config editors from @jini-ai/admin/widgets`.
Look (owed, Chrome, Widgets editor + the embed picker in a post): all 7 types, text, social links add/remove, collection list (collection, sort, fields, filter rows), menu and contact-form selects (loading + error), media items add/reorder/remove by slug and from the library, Raw HTML tab with attribute rows, preview frame, a placement override, locale es.

## untangle overlap (execute after wave B merge)
- C2 repoint (`agentHandle` -> `@jini-ai/core/agent-handles`) already applied to `HtmlAttributeRows.tsx`, `MediaContentEditor.tsx`, `WidgetConfigFields.tsx` at integ/wave-b: blobs above already include it.
- C9a landed the admin kit; A04 does not edit `react/kit.tsx`. If the owner vetoes the native-title tooltip, a kit slot (C9a addendum) becomes a precondition of S2.
- `A02` repoints `components/WidgetConfigFields/media-content-rules.ts:2` if it runs first; S1/S3 here then see a different blob: re-take, then S3 step 6 is a no-op.
- `A05` (menus) and `A28`/`A31` touch other `components/` and `features/settings` files: disjoint. `CLASSIFY admin/components/MediaPickerDialog` (MIXED, DELETE-AFTER-PARITY) and `DevicePreview` (MOVE to ui) are separate rows: S3 keeps importing them until they move.
- C11 (`R-widgets`/admin lane) may touch `widgets/react/**` Jini files: S2 files are all new, but `widgets/react/index.ts` is edited (one export): guard by text.

## STOP specific to this sheet
- Any `handle:` text changes.
- A moved file still imports `@/lib`, `@jini-ai/ui`, `@jini-ai/ui-kit/react` or `@jini-ai/cms`.
- The slot is rendered somewhere with no `WidgetConfigHost` in scope and the sheet's step 4 has not been applied.
- A legacy test has no Jini twin after the move (parity row).
