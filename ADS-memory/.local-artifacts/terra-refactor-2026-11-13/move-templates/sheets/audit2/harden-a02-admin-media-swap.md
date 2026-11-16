# HD-A02: retire the legacy Media screen — land the parked Jini media page (template T-HARDEN, then T-DELETE)

Written 2026-11-16 against Tovu `integ/wave-b` 6db998b9-line tree (`../code`) and Jini `integ/wave-b` ab8711ed (`/home/user/Jini`). Row: `audit2:A02` (audit2 row said "dedupe `useMedia` onto `createLibraryController`"). **Re-scoped by this sheet:** reading the code shows the dedupe is already half-built. Tovu mounts the finished Jini module (`media()` from `@jini-ai/admin/media/react`, `apps/admin/src/integrations/jini-admin/modules.hooks.ts:32`) next to the legacy `Media` screen at `/media/new`. `media-panel.ts` is PARKED ("Jini media at parity; re-enable to switch over", 2026-10-03) waiting for "owner visual-parity sign-off". Everything legacy `Media` gained after 10-03 (or never had in Jini) is the parity list below. So A02 = close the parity gap in Jini, flip the route, delete the legacy feature. The old row's "Tovu keeps HTTP adapter, publish button, deep links, creator lookup, i18n" is kept in spirit: those are the Tovu port bindings of S3.

Tier: S1 Opus-reviewed Sonnet, S2 Sonnet + Opus review, S3 Sonnet, S4 script + Sonnet. est. executor tokens ≈ 150k (S1 35k, S2 55k, S3 35k, S4 25k). A Claude-in-Chrome look is owed after S3 (owner rule "UI fix = look at it") and is the sign-off the parked code waits for.

untangle_overlap (execute after wave B merge, strict):
- C9a (`admin/react/kit.tsx`, `kit-media-providers.ts`): S2 touches kit slots only through the existing `../../../react/kit.js` import; if C9a renames a slot, re-guard.
- C11 `R-media` / `R1` (admin lane) rewrites `packages/admin/src/media/**` imports and arg shapes; C2 repoints `agentHandle` imports in the Tovu feature (`RemoteImageImport.tsx:4`, `Media.tsx`). All S1/S2 Jini files are guarded by blob, so run S1/S2 after R1 lands, S3/S4 after the applier passes B0-B2.
- `A04` (WidgetConfigFields) and `A05` (menus) import legacy `features/media/rules.ts` helpers (`parseMediaHtmlAttributes`, `readFileAsBase64`); S3 repoints those importers in the same Tovu commit, so A04 must either run after A02 or use the Jini `parseMediaHtmlAttributes` first (A04 says so). Whoever runs second re-census.

## Parity list (legacy Tovu Media vs Jini media page) — every row checked with `rg` on 2026-11-16
| # | Behaviour | Tovu (file:line) | Jini today | generic? |
|---|---|---|---|---|
| P1 | Localized chrome (20 locales, 1,888-line dictionary; keys are the English phrases) | `features/media/media-i18n.ts:21`, bound in `use-media.hooks.ts:136` | **absent**: Jini components hard-code English (`MediaCard.tsx` "Preview not available", `EditMediaPanel.hooks.ts` field labels); only `messages.en.ts` (21 ids) exists and `LibraryTab.hooks.ts:10` reads it | yes: a `translate` port (core `Translate = (key) => string`, `core/src/text/dictionary-translator.ts:5`) on `MediaPorts` |
| P2 | Card size/duration badges + long-image fit ("Long image") from the loaded bytes | `rules.ts:592-665` (`MediaShape`, `mediaShapeBadges`, `mediaFillsPreview`, `LONG_MEDIA_HEIGHT_RATIO`), `use-media-preview.hooks.ts` `handleImageLoad/handleVideoMetadata` | absent (`rg -i "duration|aspect|naturalWidth"` in `packages/admin/src/media` prints nothing) | yes (pure rules + hook) |
| P3 | Card-size control (small/medium/large), remembered per browser, storage may be blocked | `rules.ts:637-657`, `hooks/use-media-grid-size.hooks.ts:1`, key `tovu.admin.media.cardSize` | absent (`rg -i gridSize` prints nothing) | yes via a `preferences` port; the key is Tovu-owned |
| P4 | "Import from URL" dialog (double-submit guard, retains failed draft, closes only on success, `parseImportUrl` pre-check) | `RemoteImageImport.tsx`, `hooks/use-remote-image-import.hooks.ts`, `media-import-dependencies.hooks.ts` | absent (`rg importFromUrl` prints nothing) | yes: optional `MediaApiPort.importFromUrl` + injected `validateImportUrl` (Jini admin must not import `@jini-ai/cms`, COMMON rule 5) |
| P5 | "Created by" row in the edit dialog (principal id -> username lookup, raw id fallback) | `rules.ts:40` `mediaCreatedByLabel`, `MediaPort.listUsers?` (`media-port.hooks.ts`) | absent (`rg -i createdBy` prints nothing; `MediaAsset` has no `createdBy`) | yes: optional `MediaAsset.createdBy` + optional `MediaApiPort.listPrincipals` |
| P6 | `?id=<mediaId>` deep link opens that item's edit dialog, writes the id back with `replace`, shows a not-found notice and keeps the grid | `hooks/use-media-item-link.hooks.ts:1-59` | absent (`rg itemId` prints nothing) | yes: `MediaPage` takes `params.itemId` + `onItemChange` callback; the host owns the URL |
| P7 | Upload label/accept follow the active tab ("Upload image" on Images, video accept list on Videos) | `rules.ts:621-635` | check in S1 step 0 (Jini `UploadButton` takes `label`; does `LibraryTab` pass a per-tab accept?) | yes |
| P8 | Untyped-media note per tab, type empty states, Trash empty state | `rules.ts:574-585`, `Media.tsx:1323-1352` | Jini has `hasUntyped` + `messages.en.ts` `untyped`/`empty`; no per-type empty copy | partial: add the 3 empty states as message ids |
| P9 | Copy-to-clipboard rows (embed snippet, URL) in the edit dialog | `Media.tsx:652` `MediaEditCopyRow` | present (`EditMediaPanel.hooks.ts` `copied` state, `mediaEmbedSnippet`) | none: verify only |
| P10 | HTML attributes / CSS class / width+height editing, live hint that never blocks save | `Media.tsx:561` `MediaEditRenderOverrideFields`, `rules.ts:149-398` | present (`EditMediaPanel.hooks.ts` `parseMediaHtmlAttributes` hint) | none: verify the allow-list equals (S1 step 0 diff of `MEDIA_HTML_ATTRIBUTE_ALLOWED_NAMES`) |
| P11 | Order-by control, tab counts, lightbox with index nav, restore, purge confirm, upload dialog that stays open on failure | `use-media.hooks.ts`, `Media.tsx:727-980` | present (`LibraryTab.hooks.ts`, `MediaLightbox`, `MediaPurgeDialog`, `UploadButton`) | none: verify in the Chrome look |
| P12 | Publish button in the page header | `features/publish-content` section "media" | present as `headerActions` host contribution (`modules.hooks.ts:80`) | none |
| P13 | Provider tab ("External Providers") | `Media.tsx:1381`, `media-providers-port.ts` | present (`ProvidersTab`, `createMediaProvidersPort`) | none |
| P14 | Agent handles (`media-import-open`, `media-import-url`, `media-import-alt`, `media-import-submit`, plus the card/row handles) | `RemoteImageImport.tsx`, `Media.tsx` | the handles are a wire contract for the assistant: Jini ones are `media-choose-*` etc. | S3 step 6: diff the handle id set before/after; ids the legacy screen publishes must still exist |

Rows P9-P13 need no Jini edit; they are listed so the Chrome look has a checklist. Rows P7, P9, P10 get a verifying read in S1 step 0 and become extra parity rows if the read disagrees (STOP and report: do not guess).

## Guards (blobs at integ/wave-b)
```
tovu_files (legacy feature, deleted in S4 unless noted):
  - apps/admin/src/features/media/Media.hooks.tsx | blob 2fede27673214ab6c6409e15e450228707ee55b4
  - apps/admin/src/features/media/Media.tsx | blob 54bf61661a56c898fe0fb28887b1f42c6f01aa00
  - apps/admin/src/features/media/RemoteImageImport.tsx | blob 159bc8b92e7ca8418fc979a806db96a5397b817d
  - apps/admin/src/features/media/__tests__/Media.unit.test.tsx | blob 38200f7679936aa405d826eca0346261ac945cc0
  - apps/admin/src/features/media/__tests__/import-alt-placeholder.unit.test.tsx | blob 951818be95270df46b23dce31a1c7bfa8f4f6187
  - apps/admin/src/features/media/__tests__/media-agent-drive.unit.test.tsx | blob 7e47187b13785a230ff12229cc195dabdf0beff6
  - apps/admin/src/features/media/__tests__/media-card-metadata.unit.test.tsx | blob 850f9945281a775c6cf00d24a9e35719b9f02df3
  - apps/admin/src/features/media/__tests__/media-dependencies.unit.test.ts | blob 26d9d3a94cb4a37b7c27b871aff3b2f9543e78e6
  - apps/admin/src/features/media/__tests__/media-grid-fit.unit.test.tsx | blob fbd620c469beaac0911d3a0b110ff6672d43e015
  - apps/admin/src/features/media/__tests__/media-html-attributes.unit.test.tsx | blob 4f52b6c1577724e1bb7efd0a644874aa08ecb216
  - apps/admin/src/features/media/__tests__/media-import-dependencies.unit.test.ts | blob 3b9d846ed74d25b9e34309846f2d4bad3fd8d996
  - apps/admin/src/features/media/__tests__/media-item-deep-link.unit.test.tsx | blob 02b753bf3df549935d369e4085ba33f62fdf3c7d
  - apps/admin/src/features/media/__tests__/media-order-by.unit.test.tsx | blob 6d59a44b620d12937de8ad61d4a748410b62bed2
  - apps/admin/src/features/media/__tests__/media-preview-click-lightbox.unit.test.tsx | blob 0a147e37934507beb0bb0a637961aec8438bf59c
  - apps/admin/src/features/media/__tests__/media-screen-states.unit.test.tsx | blob 2410613b205107c5337518894e92520e6776b71a
  - apps/admin/src/features/media/__tests__/media-tab-counts.unit.test.tsx | blob 64a47a3c7fce10fe489d6ffe820c54cae6472c34
  - apps/admin/src/features/media/__tests__/media-type-filter.unit.test.tsx | blob bad7f47c38ba319c8f3744cf6decf5c847cf7de2
  - apps/admin/src/features/media/__tests__/remote-image-import.unit.test.tsx | blob 327b7bfd8e1cde6e9e7981a7a651e89e07ccc9a7
  - apps/admin/src/features/media/__tests__/use-edit-media-modal.hooks.unit.test.tsx | blob ac9c1f043b910245aa312575fb8af964f9b8de17
  - apps/admin/src/features/media/__tests__/use-edit-media-panel.hooks.unit.test.tsx | blob 28cb5c958f4436a6185d8729c3b305e1f40b44d4
  - apps/admin/src/features/media/__tests__/use-media-card-details.hooks.unit.test.tsx | blob 2c7df712035dfc2ad2d27a45f27fe0b038bc1a41
  - apps/admin/src/features/media/__tests__/use-media-preview.hooks.unit.test.tsx | blob 889f825e1b2607e23f5cd298656de945a1c53bc4
  - apps/admin/src/features/media/__tests__/use-media-tabs.hooks.unit.test.tsx | blob 517bb0e3b3c1ddf0117a086b52ca70c9d64c351b
  - apps/admin/src/features/media/__tests__/use-media.hooks.unit.test.tsx | blob 1765a17df75096fd460bfa9a5761f0bd5ed068f4
  - apps/admin/src/features/media/hooks/media-dependencies.hooks.ts | blob a170280200ad1184eea6cd6006b88b74ed85fbd6
  - apps/admin/src/features/media/hooks/media-import-dependencies.hooks.ts | blob 6e0f33caec61fddbdf63d5be5233f11093dfc3a9
  - apps/admin/src/features/media/hooks/media-port.hooks.ts | blob 589c967f23f1834b85339c45a35944b3b9f4958a
  - apps/admin/src/features/media/hooks/use-edit-media-modal.hooks.ts | blob 51bdcb5762b763fd0bd91421d469b9a514376906
  - apps/admin/src/features/media/hooks/use-edit-media-panel.hooks.ts | blob 161b8fc655fa0e700987cf7c62e95a8367f3d363
  - apps/admin/src/features/media/hooks/use-media-card-details.hooks.ts | blob dd01c470f4469abf32a585a93a0fd59dc39e5f3c
  - apps/admin/src/features/media/hooks/use-media-grid-size.hooks.ts | blob 2b312e3b729bb9216cc8da67a98e3c2ad1f191e0
  - apps/admin/src/features/media/hooks/use-media-item-link.hooks.ts | blob 8d4a02e065b99ed8403fbd8533891a3254a76701
  - apps/admin/src/features/media/hooks/use-media-preview.hooks.ts | blob df79efe6b10130ba194f641d5cd5f05658e0860e
  - apps/admin/src/features/media/hooks/use-media-tabs.hooks.ts | blob 5b3ce68b5fcf0f3227a2ffa6bc6dbb3122c7ecc5
  - apps/admin/src/features/media/hooks/use-media.hooks.ts | blob 1601d5895a8e156bfa0da9fe3939499512688ce0
  - apps/admin/src/features/media/hooks/use-remote-image-import.hooks.ts | blob e39f4bfd6a2bb51755aef4e483a2723d86925d1f
  - apps/admin/src/features/media/index.ts | blob dc97c8e81485d02e4de96e8816e0f0440bc24637
tovu_files_kept (stay, edited in S3):
  - apps/admin/src/features/media/rules.ts | blob d18490a1ab23b817b6efe340e6986cee66ff3957
  - apps/admin/src/features/media/media-i18n.ts | blob 0fa96ecd57b25d397164b2a34d162bce4a95a47f
  - apps/admin/src/features/media/media-provider-catalog.ts | blob 363795cfcb0ef2d9d82a25c6a69df4c6582b48df
  - apps/admin/src/features/media/media-providers-port.ts | blob cec562672f1b6c183334969335a4fac6be719eac
  - apps/admin/src/media-panel.ts | blob d2a714160d9ec5478d54ee9529ffbfcac1ad596c
  - apps/admin/src/panels.tsx | blob 2f93e392805fafcdac85bb54a81f593d724738a9
  - apps/admin/src/panel-pages.ts | blob 8205ba79d4ed4363fee4c79966df57536111283a
  - apps/admin/src/App.tsx | blob 93c51d8db7cd8da56a3bdbfdc121a5e12865749e
  - apps/admin/src/integrations/jini-admin/modules.hooks.ts | blob 9452885532070b214106c9608e96081a7dce914f
  - apps/admin/src/integrations/jini-admin/media-ports.ts | blob b6824c193c40767339371bd47778fdfd5eee76d1
  - apps/admin/src/integrations/jini-admin/__tests__/media-swap.unit.test.tsx | blob 3d268edd61ecb7f5dd388e4dd459dc1df13c6b0e
  - apps/admin/src/__tests__/unit/panels-render.unit.test.tsx | blob f48bb13994dcbe4aae5f210f6a9e8de0c0b1286e
  - apps/admin/src/__measurements__/request-volume.measurement.test.tsx | blob dfd6cabc6547a9b90240385a286f2058ddd2e52d
  - apps/admin/src/features/library/hooks/use-library.hooks.ts | blob 5d9782307751e827b21070a8e99732a58bf1ac47
  - apps/admin/src/components/MediaEditDialog/MediaEditDialog.hooks.tsx | blob 7f5244272ff2563b92b391777429a715032213bd
jini_files:
  - packages/admin/src/media/index.ts | blob f0c2ecad781e4f004a97c0f62cb5234c631a1be5
  - packages/admin/src/media/ports.ts | blob 2184138081b3a5b276237ab9724126bc48850ec4
  - packages/admin/src/media/models.ts | blob adbac67e90ad20c5ae4df84ef6b3bd73eed3de82
  - packages/admin/src/media/rules.ts | blob 947678bdf93893f536fa574a95edf1059156847d
  - packages/admin/src/media/messages.en.ts | blob 2269aa230539a1d4c1163a2d67ecc36101cbd70d
  - packages/admin/src/media/react/index.ts | blob 3d602b01fe7e7568d3d5ddb86cd60647223b5e66
  - packages/admin/src/media/react/hooks/MediaPorts.hooks.ts | blob 23f0a51facdd882517cd4797740f2b0abf5a7063
  - packages/admin/src/media/react/hooks/MediaCard.hooks.ts | blob c751d7ef7e6dec361e423353065afd146dba6448
  - packages/admin/src/media/react/hooks/LibraryTab.hooks.ts | blob 5b714cd4107baa87960ec462552ef58171ec81a1
  - packages/admin/src/media/react/components/MediaCard.tsx | blob 99b58f5390d2766efc9478954e037457620b33ef
  - packages/admin/src/media/react/tabs/LibraryTab.tsx | blob 3331b7548a92019ca039225e36345e47d564f9f6
  - packages/admin/src/media/react/pages/MediaPage.tsx | blob dd9bb231051c370ddcc711d345537f9fd0c64b21
  - packages/admin/src/media/react/hooks/MediaPage.hooks.ts | blob 2ef82237bf999ea8625141de95a08cfcc06b9038
  - packages/admin/src/media/adapters/http.ts | blob 291d8cfe8ef3884a8a2858fe142ddf8c9750162f
```

```
id: HD-A02-1 .. HD-A02-4                   # four slices, in order; each its own Jini+Tovu commit pair where both sides change
feature: admin/features/media -> @jini-ai/admin/media (+/react)
paths: TOVU_CLONE=<Tovu clone on integ/wave-b after wave B merge>  JINI_CLONE=<Jini clone, same branch>
ports (new, all optional so every other Jini caller is unchanged — COMMON rule 14):
  - MediaApiPort.importFromUrl?(required: { url: string }, optional?: MediaRequestOptions & { alt?: string }): Promise<MediaAsset>
  - MediaApiPort.listPrincipals?(required: Record<string, never>, optional?: MediaRequestOptions): Promise<readonly { principalId: string; username: string }[]>
  - MediaAsset.createdBy?: string                       # principal id; undefined when the host omits it
  - MediaPorts.translate?: Translate                    # @jini-ai/core/text Translate; default = identity (English id/phrase)
  - MediaPorts.preferences?: MediaPreferencesPort       # { read(required: { key: 'gridSize' }, optional?): string | null; write(required: { key: 'gridSize'; value: string }, optional?): void }
  - MediaPorts.validateImportUrl?: (required: { raw: string }, optional?: Record<string, never>) => boolean
  - MediaPageProps.params.itemId? + MediaPageProps.onItemChange?(required: { id: string | null }): void
wire_drift (kept exactly): localStorage key "tovu.admin.media.cardSize" (Tovu passes it inside its `preferences` binding; Jini never names it), route `/media?tab=<tab>[&id=<id>]` (Tovu `onItemChange` writes it), agent handles (P14).
changeset: @jini-ai/admin: minor | "media page: shape badges, card-size preference, import from URL, created-by, item deep link, translate seam"
```

## HD-A02-1 — Jini headless (commit 1, Opus reviews the RED/GREEN pairs)
0. Branch rule; blobs above (Jini side). Verify rows the sheet marks "verify":
   - P7: `rg -n "accept|label" packages/admin/src/media/react/tabs/LibraryTab.tsx packages/admin/src/media/react/hooks/UploadButton.hooks.ts` — if the tab does not pass a per-tab `accept` ("image/*" on Images, video list on Videos, both on All), add P7 as a new row here with the Tovu source `rules.ts:621-635` and implement it as pure `mediaUploadLabel/Accept({ tab })` in `rules.ts`.
   - P10: `diff <(rg -o '"[a-z-]+"' apps/admin/src/features/media/rules.ts` over lines 149-196`) <(… packages/admin/src/media/html-attributes.ts)`: any attribute name only in Tovu = new parity row P10b (generic -> Jini; the server allow-list is Tovu's `rules.ts` mirror of the cms parser, they must agree or the live hint lies).
   - `rg -n "importFromUrl|listPrincipals|createdBy|translate|preferences" packages/admin/src/media` prints nothing (names free).
1. Failing tests first (not run; RED-expected on the parent), in `packages/admin/src/media/__tests__/`:
   - `shape-rules.test.ts`: `mediaShapeBadges({ shape: { width: 1920, height: 1080 } })` -> `{ size: "16:9 · 1920×1080", duration: null, isLong: false }`; `{ width: 683, height: 384 }` -> `size: "683×384"` (unnamed ratio, tolerance 2%); `{ width: 100, height: 400 }` -> `isLong: true`; video `{ width: 640, height: 360, duration: 125 }` -> `duration: "2:05"`, `isLong: false` even when tall; `mediaFillsPreview` cases copied from legacy `__tests__/media-grid-fit.unit.test.tsx`.
   - `library-controller.test.ts` additions: none (headless library unchanged).
   - `import-controller.test.ts`: new `createImportController({ api, validateUrl })`: invalid url -> `canSubmit false`, `urlInvalid true`; `submit` twice synchronously -> `api.importFromUrl` called once; failure keeps `url`/`alt` and sets `error`; success clears the draft and returns `true`; absent `api.importFromUrl` -> `available false`.
   - `created-by.test.ts`: `mediaCreatedByLabel({ createdBy, users })` -> username, else raw id, else null (cases from legacy `__tests__/media-created-by.unit.test.ts`).
   - `preferences.test.ts`: `parseGridSize({ value })` -> "small"|"medium"|"large", anything else "medium" (legacy `parseMediaGridSize`); `readGridSize`/`writeGridSize` swallow a throwing port (blocked storage).
   - `item-link.test.ts`: `resolveItemLink({ itemId, items })` -> `{ editing: item | null, notFound }`; `notFound` false while `items === null` (no verdict before load).
2. Apply (all new code is plain TS in `packages/admin/src/media/`; function bodies come from the Tovu sources named, re-shaped to `(required, optional = {})`, ≤ 50 lines, complexity ≤ 10):
   - `rules.ts` (edit): append `MediaShape`, `NAMED_RATIOS`, `LONG_MEDIA_HEIGHT_RATIO`, `mediaShapeBadges`, `mediaFillsPreview`, `mediaCreatedByLabel`, `parseGridSize`, `MEDIA_GRID_SIZES` — verbatim from Tovu `rules.ts:40`, `592-665`, `637-657` with the why-comments moved neutral (strip "owner design, 2026-10-29" -> "Taller than about 1:3, show the top fitted to the width"). Signature change: `mediaShapeBadges(required: { shape }, optional = {})`.
   - `controllers/import.controller.ts` (new, ≈60 lines): `createImportController({ api, validateUrl }, optional = {})` over `createControllerStore` (same file shape as `edit-media.controller.ts`): state `{ url, alt, pending, error }`; methods `setUrl/setAlt/submit/reset`; in-flight guard is a closure boolean taken synchronously (Tovu `use-remote-image-import.hooks.ts:36`). After success the library controller reloads (React layer invalidates `MEDIA_QUERY_KEYS.root`, S2).
   - `models.ts`: `MediaAsset.createdBy?: string`. `ports.ts`: the two optional `MediaApiPort` members + `MediaPreferencesPort` interface + `mediaPreferencesToken`.
   - `index.ts`: export the new names (`mediaShapeBadges`, `mediaFillsPreview`, `mediaCreatedByLabel`, `parseGridSize`, `MEDIA_GRID_SIZES`, `createImportController`, `MediaPreferencesPort`).
   - `adapters/http.ts` (edit): when `importPath` is passed in the optional bag, `importFromUrl` posts `{ url, alt }` and returns the asset; `listPrincipals` is NOT added (Tovu's user list is not a media route; Tovu binds it).
   - `adapters/memory.ts` (edit): `importFromUrl` appends a fake asset (default off unless `importFromUrl: true` option), so conformance has a fake.
3. Checks: COMMON 2-9; `rg -n -i "tovu|site-chat|apps/(admin|website|desktop)|localStorage" <every new/edited Jini file>` prints nothing (no storage in the headless layer: the port carries it); eslint; changeset; commit `feat(admin/media): shape badges, import controller, created-by and grid-size rules`.

## HD-A02-2 — Jini React (commit 2, Opus reviews; Chrome look owed)
Files (edit unless new): `react/hooks/MediaPorts.hooks.ts` (add `translate`, `preferences`, `validateImportUrl` to `MediaPorts`; `useMediaTranslate()` returns `ports.translate ?? ((key) => key)`), `react/hooks/MediaCard.hooks.ts` (+ `shape` state from `onLoad` / `onLoadedMetadata`, returns `badges` from `mediaShapeBadges`, `fills` from `mediaFillsPreview`), `react/components/MediaCard.tsx` (render badges "Long image" / size / duration, `jini-media-card-badge` classes), `react/hooks/LibraryTab.hooks.ts` + `react/tabs/LibraryTab.tsx` (grid-size control `jini-media-size-control` + `data-jini-size` on the grid; "Import from URL" button beside Upload when `api.importFromUrl` exists; every literal in `EMPTY_LABELS`, menu labels, dialog titles goes through `useMediaTranslate()` with the English phrase as the key — the phrase is the dictionary key so Tovu's existing dictionary works unchanged), `react/hooks/EditMediaPanel.hooks.ts` (+ "Created by" row from `listPrincipals`, field labels through translate), `react/hooks/MediaPage.hooks.ts` + `react/pages/MediaPage.tsx` (itemId: opens the edit dialog for `params.itemId`, calls `onItemChange({ id })` on open/close, not-found notice, keeps the grid), new `react/components/ImportFromUrlDialog.tsx` + `react/hooks/ImportFromUrlDialog.hooks.ts` (markup via the `../../../react/kit.js` `Dialog`/`TextField`/`Button`; agent handles `media-import-open|url|alt|submit` unchanged — they are the legacy ids).
New CSS: `jini-media-size-control`, `jini-media-card-badge`, `jini-media-card-badge-long`, `jini-media-import-*`: Tovu's `integrations/jini-admin/media.css` already holds the `jini-media-*` presentation (host supplies CSS; see `react/index.ts` header), so S3 adds the rules there.
Tests (red first, `react/__tests__/`): `media-card-shape.test.tsx` (fire `load` on the `<img>` with `naturalWidth/Height` -> badge text; long image -> "Long image"; video `loadedmetadata` -> duration), `library-grid-size.test.tsx` (default medium, choose small, `preferences.write` called, a throwing `preferences` port does not break), `import-dialog.test.tsx` (the five cases of `import-controller.test.ts` through the DOM, `Escape` blocked while pending), `translate-seam.test.tsx` (a `translate` that upper-cases proves EVERY visible chrome string passes through it: render page + edit panel + purge dialog, assert no `[A-Z][a-z]` English literal remains in the text of the chrome nodes), `item-link.test.tsx` (itemId opens, unknown id shows the notice and the grid, closing calls `onItemChange({ id: null })`).
Complexity: `LibraryTab.hooks.ts` already holds ≥ 10 helper functions; add the grid-size/import state as a new hook file (`LibraryChrome.hooks.ts`) instead of growing it. Commit `feat(admin/media/react): shape badges, card size, import dialog, created-by, item link and translate seam`.

## HD-A02-3 — Tovu wiring + route flip (commit 3, Sonnet; after the Chrome look passes on a branch build, owner signs off)
1. `apps/admin/src/integrations/jini-admin/media-ports.ts` (edit): add to `mediaApi` — `importFromUrl: ({ url }, { alt, signal } = {}) => api.importMediaFromUrl({ url }, { alt })` mapped to the `MediaAsset` shape (`createdBy` copied through); `listPrincipals: () => api.listUsers().then(({ users }) => users)`. Export `mediaTranslate = ({ locale }) => (key) => mediaT({ locale, key })` using `features/media/media-i18n.ts` (stays; it is Tovu's dictionary) and `mediaPreferences` = the `localStorage` binding with key `tovu.admin.media.cardSize`, both reads/writes in `try/catch`. `mediaValidateImportUrl = ({ raw }) => { try { parseImportUrl({ raw }); return true; } catch { return false; } }` (the cms import of `@jini-ai/cms/media/import` is Tovu-side).
2. `modules.hooks.ts` (edit): pass `translate`, `preferences`, `validateImportUrl` in `ports: { mediaApi, … }` (the object literal on line 39); delete the `MODULE_PAGE_PATHS` entry and its 3-line comment (lines 54-56) — the page now owns `/media`, so `description.path` is correct; `useModulePanel` passes `params: { itemId }` and `onItemChange` (navigates `/media?tab=…&id=…` with `{ replace: true }`, same `navigate` the legacy hook used).
3. `media-panel.ts` (edit): replace the body with `return createElement(ModulePanel, { moduleId: "media", pageId: "library", route: ctx })` (the text now sitting in the PARKED comment) and drop the `Media` and the two PARKED comments; `panel-pages.ts:61` delete the lazy `Media` export; `panels.tsx` lines 272-274: delete the TEMPORARY comment and the commented `/new` route; `App.tsx` doc comment (lines 173-175 area) drop the `jini-media` sentence.
4. Delete the compare route's tests: in `integrations/jini-admin/__tests__/media-swap.unit.test.tsx` rewrite the first test's URL from `/admin/media/new?tab=images&compare=legacy` to `/admin/media?tab=images`, pathname expectation `/admin/media`; `__tests__/unit/panels-render.unit.test.tsx:460-480` the `it.skip.each` block for `/media/new` is deleted (it is skipped, names the `jini-media` view).
5. `__measurements__/request-volume.measurement.test.tsx:6` imports the legacy `Media`: re-point the measurement at `ModulePanel` (STOP if it needs a fixture the sheet does not name; this measurement is not part of the unit gate, report only).
6. Agent handles: before deleting S4, `rg -n "agentHandle\\(\\{ handle: \"media-" apps/admin/src/features/media > before.txt` and the same over `packages/admin/src/media` after S2; every `media-*` handle in `before.txt` must appear in the Jini set (P14). A missing id = STOP, add it in Jini (new parity row).
7. Repoint legacy importers that survive the deletion (census `rg -n "features/media/(rules|media-i18n)" apps/admin/src`): `components/MediaEditDialog/MediaEditDialog.hooks.tsx:3-4` (`parseMediaHtmlAttributes`, `describeMediaHtmlAttributeError` -> `@jini-ai/admin/media`, args `{ text }`/`{ error }`; the dialog is a separate Tovu component, not part of this slice), `components/WidgetConfigFields/media-content-rules.ts:2` (same; A04 owns it, apply here only if A04 has not run), `features/library/hooks/use-library.hooks.ts:8` (`readFileAsBase64` -> keep a 12-line local helper in `features/library/rules.ts`; do NOT export it from Jini: the Jini upload path reads files inside `UploadButton.hooks.ts`), `lib/media-embed-extension.hooks.ts:5` and `features/security/__tests__/security-i18n.unit.test.ts:2` keep `media-i18n` (file stays).
8. CSS: add the `jini-media-size-control`, `jini-media-card-badge*`, `jini-media-import-*` rules to `integrations/jini-admin/media.css`, porting the declarations from the legacy selectors (`rg -n "media-size|media-card-badge|media-import|media-grid" apps/admin/src/styles.css apps/admin/src/styles` — each legacy selector is renamed ONCE; the count per file is recorded by the census before the edit). e2e pins: `rg -n "media-card|media-import|media-size" apps/admin/e2e* tests` — rename in the same commit, counts listed before/after.
9. Census gates: `rg -n "features/media/(Media|hooks|RemoteImageImport|Media\\.hooks)" apps` prints only S4's deletions; eslint on touched files; commit `refactor(admin): serve /media from the Jini media module`.
Look (owed, Chrome, `/admin/media`): grid in all three card sizes, Long image + 16:9 badges, tab counts, order-by, Import from URL (valid, invalid, server error), upload dialog failure, edit dialog (Created by, HTML attributes hint, copy rows), `?id=<real>` and `?id=<gone>`, trash/restore/purge, External Providers tab, one non-English locale (es), phone width.

## HD-A02-4 — delete the legacy feature (commit 4, script; STOP unless S3 landed and the look passed)
`git rm -q` every `tovu_files` entry listed under "legacy feature" above (37 files: `Media.tsx`, `Media.hooks.tsx`, `RemoteImageImport.tsx`, `hooks/*` except none kept, all `__tests__/*` except `media-i18n`, `media-provider*` and `media-rules.unit.test.ts`). `rules.ts` is cut to what survives (`KEYS`, `MEDIA_RESOURCE` go; `MEDIA_HTML_ATTRIBUTE_ALLOWED_NAMES` + `parseMediaHtmlAttributes` + `describeMediaHtmlAttributeError` go once S3 step 7 has repointed every importer; verify `rg -n "from \".*features/media/rules\"" apps/admin/src` prints nothing, then delete the file and `__tests__/media-rules.unit.test.ts`, whose cases moved to Jini `legacy-rules.test.ts`; spot-check that the Jini file has the same cases, STOP if a Tovu test has no twin). Delete `index.ts` and `README.md`, then recreate a 6-line `README.md` that names what stays (`media-i18n.ts`, `media-provider-catalog.ts`, `media-providers-port.ts`). The feature `__tests__` that exercised legacy-only code are replaced by the Jini tests of S1/S2; list in the commit body the legacy test names and the Jini test that now covers each (a legacy test with no Jini twin = STOP: it is a parity row).
Test count rule (honest-testing): record `rg -c "^\\s*(it|test)\\(" <deleted tests>` before and the Jini additions; the net may fall only by tests of deleted routing (`jini-media` view, `MediaPicker` compare), never by behaviour tests.

## STOP specific to this sheet
- Any parity row P7/P10 verification disagrees and the sheet has no row: report, do not improvise.
- The Jini `translate` test finds an English literal that bypasses the port.
- `agent handles` set shrinks (P14).
- `modules.hooks.ts:39` or `media-ports.ts` blobs differ (C9a/R1 landed first): re-take blobs, do not patch by memory.
- Owner sign-off on the Chrome look absent: S3 may be prepared and committed on a branch, but the route flip merges only after sign-off (the parked code says so).
