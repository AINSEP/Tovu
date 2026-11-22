UNTANGLE PLAN v2 COMPLETE

# P9U v2 — untangle the admin feature loops with dependency injection, then gate them

**Author:** Opus cloud planning run, 2026-11-22 (unattended). **Checker:** Codex (read-only). **Implementers:** Opus, one step each.
**Scope:** planning only. No code edits, tests, builds or installs ran.
**Supersedes:** `plans/P9U-untangle.md` (v1). Every correction in `plans/P9U-check.md` is applied; the mapping is in [Changes from v1](#changes-from-v1).

**Bases measured**
- Tovu `origin/integ/merge-12-2026-11-22` = **`41e948ee4`**, `apps/admin/src/**` non-test `.ts/.tsx`.
- Jini `origin/integ/merge-13-2026-11-22` = **`7c4ee788`**, plus four in-flight branches treated as landing first:
  - `codex/ex2-a-k2-0a-jini` (`fbaf6937`) — admin kit icon names, `useT` / `useAdminKitValues` take required/optional objects.
  - `codex/ex2-k4-seam-1-jini` (`4504b895`) — the precedent every core-contract step here copies: `packages/core/src/contracts/site/<name>.ts` (types only), its fixture in `packages/core/src/__tests__/<name>.unit.test.ts` (XP4: no fixture under `src/contracts`), a `jini.entries["./contracts/site/<name>"]: "universal"` row and the `types/import/default` export triple in `packages/core/package.json`, `pnpm api:update`, changeset.
  - `codex/ex2-rt-k1-0-jini` (`0c379210`) — `@jini-ai/core/errors/route-refusal`; no untangle step touches routes.
  - `codex/ex2-k4-i18n-common-jini` (`8d17019b`) — `@jini-ai/admin/core/i18n-common`. No untangle step moves a dictionary; lane moves that carry `lib/i18n-common` repoint to it.

**How the edges were verified.** `plans/P9U-data/tools/scan.mjs` reads every static import, re-export, literal `import("…")` and side-effect import in `apps/admin/src`, resolves relative and `@/*` specifiers, and records the line of the specifier and whether the import is type-only. Every `file:line` below comes from that output (`plans/P9U-data/admin-feature-edges-41e948ee4.txt`, 219 sites). It reproduces v1's count: **80 feature pairs, 77 with a value import, 3 type-only.** Strongly connected components:

| | with type-only imports | value imports only |
|---|---|---|
| Content | dashboard, media, pages, posts, publish-content, taxonomy, themes | same 7 |
| Operations | deployment, import-export, security, source-control | same 4 |
| Settings | ai-assistant, integrations, plugins, providers, settings | ai-assistant ↔ settings |

Paths are relative to `apps/admin/src/features/` unless they start with `src/` (= `apps/admin/src/`) or `packages/`. `T` after a line = type-only import.

---

## 0. The injection recipe (every T step uses it; steps only name files)

The admin already has the shape this needs. A feature hook is a pair: `useX(deps)` takes a port, and `useWiredX()` binds the live port from `hooks/x-dependencies.hooks.ts` (for example `pages/hooks/use-pages.hooks.ts:103` and `:286`, `defaultPagesPort` in `pages/hooks/pages-dependencies.hooks.ts`). Components take the hook as a prop with the wired hook as its default (`pages/Pages.tsx:57,67`, `taxonomy/TermPicker.tsx:27`, `publish-content/PublishSectionButton.tsx:24`).

Almost every cross-feature value import sits in one of three places: a `*-dependencies.hooks.ts` live default, a `useWired*` binding, or a component that renders another feature's component. The cut is the same each time.

1. **Host composition directory.** Add `src/composition/` (Tovu-only, never extracted). One file per feature, `src/composition/<feature>-bindings.hooks.ts` (or `.tsx` when it renders JSX). Only `src/panels.tsx`, `src/panel-pages.ts`, `src/App*.ts(x)`, `src/media-panel.ts` and `src/integrations/jini-admin/**` may import it. It may import any feature. It is what Tovu "fills".
2. **Live defaults move verbatim.** Move the `default<X>Port` object (with its doc comment and every why-comment) from the feature's `*-dependencies.hooks.ts` into the composition file. Fakes (`createFake<X>Port`, `fake*` builders) stay in the feature: tests use them. If a dependencies file holds only the live default, delete it.
3. **`useWired*` moves verbatim** next to its port in the composition file. The feature keeps `useX(deps)`.
4. **Hook props lose their live default.** `useXHook = useWiredX` becomes a required prop typed by an exported `UseXHook` alias in the feature's own `*-port.hooks.ts`. A prop default that still imports the old implementation keeps the edge (P9U-check §1.4), so no feature file may keep one. The production mount in `src/panels.tsx` passes the composition hook. Tests pass fakes, as they already do.
5. **Rendered sibling components become slots.** A `ReactNode` prop when the child needs nothing from the parent (`publishControl`), or a component prop typed in the consumer when it does (`TermPickerSlot`). The host fills them at the mount.
6. **Shared wire types go to core.** Pure types only, verbatim, in `@jini-ai/core/contracts/site/*` (XP4: no runtime statement under `src/contracts`). Comments that name `apps/…` paths or Tovu are rewritten to "the host" with the why kept (N2). Tovu importers repoint to the core subpath **in the same commit that deletes the Tovu declaration**: no re-export shells, no Tovu alias files.
7. **Genuinely shared generic UI or rules go to `@jini-ai/admin`.** Only when two or more features render or call the same code. Destinations follow the package layout: browser UI under `packages/admin/src/react/<area>/` exported as `./react/<area>` (`"browser"`), pure rules under `packages/admin/src/core/<area>/` exported as `./core/<area>` (`"universal"`). No `@jini-ai/<other>` import except `@jini-ai/core` (XP3). Class names that the component owns are `jini-*`; Tovu class names reach it through props, as `ThemePreviewReloadControl`'s `className` already does (`packages/admin/src/react/components/ThemePreviewReloadControl.tsx`).

**Rules carried by every step** (P9 §1): tests first wherever behaviour moves; one named mutation applied to the new seam, shown red, reverted; `_optional = {}` pads and the required/optional args rule kept exactly (new public functions use them too); functions ≤ 80 lines, complexity ≤ 10 (an extraction that would push `panels.tsx` render callbacks over the limit binds through the composition file instead); verbatim moves; why-comments travel; no re-export shells; Jini stays vendor- and server-framework-neutral; `jini-*` classes. STOP conditions 1–8 of P9 §1 apply unchanged.

**One file, one owner.** A step that edits a file cuts **every** cross-feature import in that file, not only the loop edge, so no file is touched twice. That rule is why some non-loop edges (for example `dashboard/hooks/dashboard-dependencies.hooks.ts:2,7,9` → sites, auth, comments) are cut inside the loop waves.

**Branches and gates.** `p9u/<step-id>` from the lane tip, Jini rows before the Tovu rows that consume them, setup/baseline/commit cadence per P9 §1. Every T step ends with a re-scan (`node -I plans/P9U-data/tools/scan.mjs …`) showing its listed sites gone and no new cross-feature site.

---

## 1. Content loop — dashboard, media, pages, posts, publish-content, taxonomy, themes

### 1.1 Verified edges (direct)

| Pair | Sites |
|---|---|
| pages → posts | `pages/Pages.tsx:8T`, `pages/api/pages-api.ts:3T`, `pages/hooks/page-editor-dependencies.hooks.ts:4T`, `:5` (`postsApi`), `pages/hooks/page-editor-port.hooks.ts:2T`, `pages/hooks/page-editor-save.ts:8T`, `pages/hooks/pages-dependencies.hooks.ts:1T`, `:2` (`postsApi`), `pages/hooks/pages-port.hooks.ts:1T`, `pages/hooks/use-page-editor.hooks.ts:7T`, `pages/hooks/use-pages.hooks.ts:4T`, `pages/page-editor-i18n.ts:13` (Posts translator), `pages/rules.ts:6T` |
| posts → pages | `posts/editor/notices/PostEditorNotices.tsx:2` (`PageExternalChangeBanner`), `posts/editor/preview/PostPreviewFrame.tsx:1` (`PAGE_PREVIEW_IFRAME_SANDBOX`), `posts/hooks/use-post-editor.hooks.ts:54` (Page editor translator, used as fallback at `:1255`) |
| pages → themes | `pages/PageEditor.tsx:2` (`useThemePreviewFrame`), `:3` (`WiredThemePreviewReloadButton`, rendered `:641`), `:34T`, `pages/hooks/page-editor-dependencies.hooks.ts:2T`, `:3` (`themesApi`), `pages/hooks/page-editor-port.hooks.ts:1T`, `pages/hooks/theme-pages-dependencies.hooks.ts:1` (`themesApi`), `pages/hooks/use-page-editor.hooks.ts:6T`, `pages/hooks/use-theme-pages.hooks.ts:4` (`NO_THEME_ID`, a value; used `:193`) |
| posts → themes | `posts/editor/header/PostEditorToolbarEnd.tsx:1` (rendered `:21`), `posts/editor/preview/PostPreviewFrame.tsx:2` (default of `useThemePreviewFrameHook`, `:27`), `posts/editor/template/PostEditorTemplateModalGate.tsx:2T`, `posts/hooks/post-editor-dependencies.hooks.ts:4T`, `:5` (`themesApi`), `posts/hooks/post-editor-port.hooks.ts:2T`, `posts/hooks/post-editor-state.rules.ts:1T`, `posts/hooks/use-post-editor.hooks.ts:21T` |
| posts → media | `posts/hooks/post-editor-dependencies.hooks.ts:2T`, `:3` (`mediaApi`), `posts/hooks/post-editor-port.hooks.ts:1T`, `posts/hooks/use-post-featured-image.hooks.ts:2T` |
| dashboard → posts | `dashboard/Dashboard.tsx:1T`, `dashboard/hooks/dashboard-dependencies.hooks.ts:5T`, `:6` (`postsApi`), `dashboard/hooks/dashboard-port.hooks.ts:2T`, `dashboard/hooks/use-dashboard.hooks.ts:6T`, `dashboard/rules.ts:2T` |
| dashboard → pages / media / themes | `dashboard/hooks/dashboard-dependencies.hooks.ts:8` / `:3` / `:4` |
| dashboard → publish-content | `dashboard/Dashboard.tsx:10` (`requestPublish`), `:11` (`usePublishToLiveAvailable`) |
| publish-content → dashboard | `publish-content/hooks/use-publish-section-button.hooks.ts:4` (Dashboard translator); the hook's section is positional at `:38` |
| pages / posts / media / taxonomy / themes → publish-content | `pages/Pages.tsx:15`, `posts/Posts.tsx:18`, `media/Media.tsx:45`, `taxonomy/Taxonomy.tsx:13`, `themes/Themes.tsx:12` (rendered `:551`) |
| pages / posts → taxonomy | `pages/PageEditor.tsx:37`, `posts/editor/PostSavedPanels.tsx:3` (`TermPicker`) |
| themes → pages | `themes/hooks/use-theme-explore.hooks.ts:10` (`homeFallbackPublishReason`, used `:400`, `:430`) |

Also cut in this wave because they sit in files the wave rewrites, or close the same loop through shared code:
- **Same files:** `dashboard/hooks/dashboard-dependencies.hooks.ts:1T`, `:2`, `:7`, `:9` (sites, auth, comments), `dashboard/hooks/dashboard-port.hooks.ts:1T`, `dashboard/rules.ts:1T` (`AdminSiteKeyState`); `posts/editor/PostSavedPanels.tsx:2` (`ContentAnalysisCard`).
- **Same mechanism, non-loop importers:** `collections/CollectionEntries.tsx:6`, `collections/Collections.tsx:11`, `menus/Menus.tsx:3` (publish control); `collections/CollectionEntryEditor.tsx:7` (`TermPicker`); `email/EmailTemplateEditor.hooks.ts:1`, `email/EmailTemplateEditor.tsx:14`, `:15` (Page editor translator and sandbox).
- **Shared-code detours that close a content cycle** (`plans/P9U-data/admin-shared-detours-41e948ee4.txt`):
  - `src/lib/admin-post-list-sort.ts:3T` (Pages → Posts through `pages/Pages.tsx:1`).
  - `src/components/TemplateSource/use-template-source.hooks.ts:6T` and `TemplateSourceModal.tsx:7T` (`ThemeTier`; Pages and Posts → Themes). Their layout import at `use-template-source.hooks.ts:4` is `@jini-ai/cms/themes/layout`, already Jini, not a Tovu edge.
  - `src/components/MediaPickerDialog/media-picker-dependencies.hooks.ts:1T`, `:2`, `media-picker-port.hooks.ts:1T`, `MediaPickerDialog.tsx:8T`, `MediaPickerDialog.hooks.tsx:4T`, `src/lib/media-image-extension.tsx:5`, `src/lib/media-embed-extension.hooks.ts:4`, `:5`, `src/components/MediaEditDialog/MediaEditDialog.hooks.tsx:3`, `:6` (Posts → Media through `posts/PostCoverImage.tsx:6`, `posts/hooks/use-post-editor.hooks.ts:25–26`, `posts/hooks/use-post-featured-image.hooks.ts:3`).
  - `src/lib/widget-embed-extension.tsx:4T`, `src/lib/widget-embed-extension.hooks.ts:5T`, `:6` (`widgetsApi`), `src/components/EmbedInsertControl/EmbedInsertControl.tsx:5T`. Posts (`posts/hooks/use-post-editor.hooks.ts:27`, `posts/editor/toolbar/insert-controls.tsx:5`) and Collections (`collections/CollectionEntryEditor.tsx:4`, `collections/hooks/use-collection-entry-editor.hooks.ts:9`) reach Widgets, and Widgets reaches Publish Content through the host module binders. That closes Posts → Widgets → Publish Content → Dashboard → Posts.

### 1.2 Design

**Core contracts (Jini).**
- `packages/core/src/contracts/site/content-entry.ts` ← `AdminPost` from `posts/api/posts-api.types.ts:6` (v1 said `:8`, which is `everPublished`), verbatim. Keep the name: 15+ importers, and a rename buys nothing. The `kind`, `version` and `bodyJson` fields stay required; `bodyFormat` and `bodyHtml` stay optional; the nullable override stays. The why-comment that cites `apps/website/src/server/inbound/public-http/http/shared/post.ts` becomes "the host's headless post serializer". `AdminPostCreateInput` (`:2`) and patch types stay with Posts.
- `packages/core/src/contracts/site/theme-presentation.ts` ← `PresentationSettings` (`themes/api/themes-api.types.ts:4`), `ThemeTier` (`:31`), `AdminThemeSummary` (`:34`), verbatim. These are structural wire shapes, so Themes itself stays in Tovu. `NO_THEME_ID` (`:24`) is a value and **stays in Tovu**: its interpretation moves into the host adapter (see Pages ports).
- `packages/core/src/contracts/site/site-key.ts` ← the site-key DTOs Dashboard and Security read from `sites/api/sites-api.types.ts`: `AdminSiteKeyState`, `AdminSiteKeyStatus`, `AdminGeneratedSiteKey`, `AdminImportedSiteKey`, `AdminRevealedSiteKey`, `AdminSiteKeyStartFreshPreview`, `AdminSiteKeyAffectedWebhook`, plus the types they reference. One owner for both consumers: P9U-check §1.1 and §2.3.

**Shared editor UI (Jini) — `@jini-ai/admin/react/editor`**, new entry `packages/admin/src/react/editor/index.ts`:
- `react/editor/ExternalChangeBanner.tsx` ← `PageExternalChangeBanner` (`pages/PageEditor.tsx:483–517`), body and comments verbatim. The Page-specific parts become props, as P9U-check §1.2 asks:
  - `copy: { message: string; region: { handle: string; label: string }; loadLatest: { handle: string; label: string }; keepEdits: { handle: string; label: string } }`
  - `classNames: { region: string; button: string }`
  - `onLoadLatest`, `onKeepEdits`, `t`, all unchanged.
  - The agent handles stay built by `agentHandle` from `@jini-ai/core/agent-handles`.
  - `PAGE_EXTERNAL_CHANGE_COPY` (`react/editor/external-change-copy.ts`) exports the exact strings in use today: `"page-external-change"`, `"page-external-change-load-latest"`, `"page-external-change-keep-edits"`, the three labels, and `PAGE_EXTERNAL_CHANGE_MESSAGE` from `pages/rules.ts:604`. Pages and Posts both pass that constant. A why-comment records that Posts deliberately reuses the Page handles, so the assistant sees one handle vocabulary. Tovu passes `{ region: "notice warning", button: "btn-secondary" }`.
- `react/editor/preview-sandbox.ts` ← `PAGE_PREVIEW_IFRAME_SANDBOX` (`pages/rules.ts:564`), with its value `"allow-scripts allow-forms allow-popups"` and why-comment verbatim.
- `react/editor/slots.ts` holds types only, so every editor declares the same seam once:
  - `TermPickerSlot = ComponentType<{ contentType: string; contentId: string }>`, matching `taxonomy/TermPicker.tsx:26–35` minus the hook prop.
  - `ContentAnalysisSlot = ComponentType<{ post: AdminPost; title: string; bodyJson: Record<string, unknown> }>`, the props `posts/editor/PostSavedPanels.tsx:13` passes today (`AdminPost` from core `content-entry`; that is a `react/editor` → `@jini-ai/core` type import, allowed).
  - `UseThemePreviewFrameHook`, the signature of `themes/hooks/use-theme-preview-refresh.hooks.ts`'s `useThemePreviewFrame`.
  - `PreviewReloadSlot = ReactNode`.
- Export: `"./react/editor": { "types": "./dist/react/editor/index.d.ts", "import": "./dist/react/editor/index.js", "default": "./dist/react/editor/index.js" }`, plus `jini.entries["./react/editor"]: "browser"`, plus api-baseline.

**No Jini publish module.** v1's `@jini-ai/admin/publish-content` is dropped. P9K marks `P-publish-content-ui-1` ALL-STAY: the section table imported at `use-publish-section-button.hooks.ts:1` from `@tovu/publish-content-ui` carries entity membership, copy and active-theme policy. Untangling only needs a slot. **Publish Content stays the single owner of publish state and policy.**
- Lists take `publishControl?: ReactNode`. The host renders `<PublishSectionButton section="…" usePublishSectionButtonHook={useWiredPublishSectionButton} />` into it.
- `usePublishSectionButton(section)` (`:38`) changes to `usePublishSectionButton({ section, translate, locale }, _optional = {})`, which applies the args rule (P9U-check §1.3). `useWiredPublishSectionButton` binds `useWiredAdminLocale` (`:3`) and the Dashboard translator (`:4`) in `src/composition/publish-content-bindings.hooks.ts`.
- Dashboard takes `requestPublish` (function) and `usePublishToLiveAvailableHook` (hook) props, bound to the **existing** `publish-request.store.ts` and `publish-availability.store.ts`.
- The shell callers keep using those same stores directly, because they are host code: `src/App.tsx:43–45`, `src/App.chrome.tsx:9–10`, `src/App.hooks.ts:33`, `:37`, `src/App.session.ts:12`, and the module contributions in `src/integrations/jini-admin/{forms,redirects,seo,widgets}-module.hooks.ts` and `modules.hooks.ts`.
- If a later lane sheet relocates the stores, it repoints all of those callers in its deletion commit.

**Pages ports (host fills).**
- `defaultPageEditorPort`, `defaultPagesPort` and `defaultThemePagesPort` move to `src/composition/pages-bindings.hooks.ts`.
  - `defaultPageEditorPort` holds `postsApi` (`:5`) and `themesApi` (`:3`).
  - `defaultPagesPort` holds `postsApi.updatePost(…, { entry: "page" })` (`pages-dependencies.hooks.ts:13–19`), so `entry: "page"` and `expectedVersion` stay in the moved object unchanged.
  - `defaultThemePagesPort` holds `themesApi`.
- `useWiredPages` (`use-pages.hooks.ts:286`), `useWiredPageEditor` (it binds `defaultT` at `use-page-editor.hooks.ts:28`, `:1231`) and `useWiredThemePages` move with them.
- `ThemePagesPort` gains `isNoTheme({ themeId }, _optional = {}): boolean`, which the host binds to `themeId === NO_THEME_ID`. `use-theme-pages.hooks.ts:193` calls the port instead of comparing to the sentinel, and its why-comments (`:192`, `:199–200`) move to the binding.
- `pages/page-editor-i18n.ts` stops importing Posts. Its `t` (`:422`) becomes `createPageEditorTranslator({ translatePostEditor }, _optional = {})`, which returns the same `t` with the same key routing:
  - the `postEditorKeys` set (`:49–59`, with its why-comment `:44–48`) is delegated to the injected translator;
  - script-block, control, markup and hook dictionaries resolve exactly as now.
- The composition binds `createPageEditorTranslator({ translatePostEditor: postsT })` once and hands it to Pages, Posts' fallback and Email.
- `PageEditor` takes `useThemePreviewFrameHook: UseThemePreviewFrameHook` (call at `:1400`) and `previewReload: PreviewReloadSlot` (`:641`). The host fills them from `themes/hooks/use-theme-preview-refresh.hooks.ts` and `<WiredThemePreviewReloadButton />`.

**Posts ports (host fills).**
- `defaultPostEditorPort` moves to `src/composition/posts-bindings.hooks.ts`. It holds `mediaApi` (`:3`) and `themesApi` (`:5`).
- `useWiredPostEditor` (`use-post-editor.hooks.ts:1239–1258`, doc comment included) moves with it. Its `t` keeps today's precedence: the Posts translator first, then the Page editor translator from the factory above when the key comes back unchanged. That fallback (`:1253–1256`) and its why-comment (`:1252`) move verbatim.
- `AdminMedia` in `post-editor-port.hooks.ts:1T` and `use-post-featured-image.hooks.ts:2T` becomes `PostFeaturedMedia`, a `Pick<…>` of exactly the fields those two files read, declared in `post-editor-port.hooks.ts`. That is a narrow structural result (v1 §1).
- `PostPreviewFrame` drops its live default `useThemePreviewFrameHook = useThemePreviewFrame` (`:27`). `PostEditorToolbarEnd` takes `previewReload` (`:21`). `PostEditorTemplateModalGate` reads `ThemeTier` from core.
- Pages and Posts are bound at **both** editor mounts, `src/panels.tsx:222` and `:241`, `:253`.

**Dashboard.**
- `defaultDashboardPort` moves to `src/composition/dashboard-bindings.hooks.ts`. That cuts sites `:2`, media `:3`, themes `:4`, posts `:6`, auth `:7`, pages `:8` and comments `:9`.
- `AdminSiteKeyState` (`:1T`, `dashboard-port.hooks.ts:1T`, `rules.ts:1T`) and `AdminPost` repoint to core.
- The mount is `src/panels.tsx:134` (`render: () => <Dashboard />`). It now passes `useDashboardHook`, `requestPublish` and `usePublishToLiveAvailableHook`.

**Themes stay in Tovu.**
- `ThemeExplore` (`src/panels.tsx:582`) takes `homeFallbackPublishReason` as a dependency of `use-theme-explore.hooks.ts`. The host binds `pages/lib/theme-page-publish-state.ts:101`. Both call sites (`:400`, `:430`) and their comments (`:391`, `:429`) stay; the comments now name the injected dependency.
- `Themes` takes `publishControl` at both mounts: `src/panels.tsx:592` (`/themes`) and `:1291` (`/appearance` alias).

**Taxonomy and analysis slots.**
- `PageEditor` (`:37`), `PostSavedPanels` (`:2`, `:3`) and `CollectionEntryEditor` (`:7`) take `TermPickerSlot`. Posts also takes `ContentAnalysisSlot`.
- `useWiredTermPicker`'s live port (`taxonomy/hooks/term-picker-dependencies.hooks.ts`, which imports `authApi` at `:3`) moves to `src/composition/taxonomy-bindings.hooks.ts`. That cuts taxonomy → auth too.
- `TermPicker`'s `useTermPickerHook = useWiredTermPicker` default (`:27`) becomes required.
- The host binds the taxonomy and permission operations once and gives the same component to all three editors.

**Media and widget editor extensions (shared code).**
- These three live defaults move to `src/composition/media-bindings.hooks.ts`:
  - `src/components/MediaPickerDialog/media-picker-dependencies.hooks.ts`
  - the `mediaApi` use in `src/lib/media-image-extension.tsx:5`
  - the `mediaApi` use in `src/lib/media-embed-extension.hooks.ts:4–5`
- The extension factories and `MediaPickerDialog` take the port as a required argument. Posts receives them as `editorExtensions` and `MediaPicker` props from the editor mounts (`src/panels.tsx:241`, `:253`).
- `MediaEditDialog.hooks.tsx:3`, `:6` follow the same recipe.
- `src/lib/widget-embed-extension.hooks.ts:6` (`widgetsApi`) moves to `src/composition/widgets-bindings.hooks.ts`. The Posts and Collections editors receive the bound extension at their mounts (`src/panels.tsx:241`, `:253`, `:312`).
- `EmbedInsertControl.tsx:5T` and `widget-embed-extension*.ts` `T` imports repoint to the Widgets DTO. That DTO's core home is the Widgets lane's existing contract row; if it is not landed yet, keep the type import and list it in the shared-code baseline (§5).

### 1.3 Steps

| Step / repo / est | Files and deliverable | Test first → named mutation | Depends on |
|---|---|---|---|
| **C0.J** / Jini / 75 | `packages/core/src/contracts/site/content-entry.ts`, `theme-presentation.ts`; `packages/core/src/__tests__/content-entry.unit.test.ts`, `theme-presentation.unit.test.ts` (compile fixtures: a page and a post object with and without `bodyFormat`/`bodyHtml`; every `ThemeTier` literal); `packages/core/package.json` two export triples + two `jini.entries` rows; api-baseline; `.changeset/p9u-c0.md` | Fixtures compile → make `bodyFormat` required: the page fixture without it goes red | K4-seam-1.J landed (fixture location) |
| **C0b.J** / Jini / 50 | `packages/core/src/contracts/site/site-key.ts` and fixture `site-key.unit.test.ts`; exports; baseline; changeset | Fixture of every status variant → drop one `AdminSiteKeyStatus` variant | — |
| **C1.J** / Jini / 100 | `packages/admin/src/react/editor/{index.ts,ExternalChangeBanner.tsx,external-change-copy.ts,preview-sandbox.ts,slots.ts}`; `packages/admin/src/react/editor/__tests__/ExternalChangeBanner.unit.test.tsx`; `packages/admin/package.json` export + entry; api-baseline; changeset | The banner renders the given message, the three handles and both class names, and calls `onLoadLatest`/`onKeepEdits`. The sandbox string is exact → swap the two callbacks | A-K2-0a.J (kit) landed |
| **C1.T** / Tovu / 100 | Delete `AdminPost` (`posts/api/posts-api.types.ts:6`) and `PresentationSettings`/`ThemeTier`/`AdminThemeSummary` (`themes/api/themes-api.types.ts:4,31,34`). Repoint every importer to core: the 12 Pages sites and 5 Dashboard sites above, the Posts and Themes internals, `src/lib/admin-post-list-sort.ts:3`, `src/components/TemplateSource/use-template-source.hooks.ts:6`, `TemplateSourceModal.tsx:7`, `posts/editor/template/PostEditorTemplateModalGate.tsx:2`, `posts/hooks/post-editor-state.rules.ts:1`, `posts/hooks/use-post-editor.hooks.ts:21`, `pages/PageEditor.tsx:34`, `pages/hooks/page-editor-port.hooks.ts:1`, `pages/hooks/use-page-editor.hooks.ts:6`. Find the rest with `rg -n 'AdminPost\b\|ThemeTier\|PresentationSettings\|AdminThemeSummary' apps/admin/src` | `npm run typecheck:tests` plus a type test `src/__tests__/contracts/content-entry.typetest.ts` that assigns a live `postsApi` result → in the linked Jini copy make `bodyFormat` required and see admin `tsc` red | C0.J |
| **C2.T** / Tovu / 80 | `posts/editor/notices/PostEditorNotices.tsx:2,80` and `pages/PageEditor.tsx:483–517,576` → `ExternalChangeBanner` + `PAGE_EXTERNAL_CHANGE_COPY`. `posts/editor/preview/PostPreviewFrame.tsx:1`, `pages/PageEditor.tsx:44`, `email/EmailTemplateEditor.tsx:15` → `PAGE_PREVIEW_IFRAME_SANDBOX` from `@jini-ai/admin/react/editor`. Delete `pages/rules.ts:564`, `:604` and the old component. The existing Page/Post notice tests keep their assertions | Post and Page notices render the same handles and copy, and Load latest calls the reload → swap `onLoadLatest`/`onKeepEdits` in the Posts caller | C1.J, C1.T |
| **C3.T** / Tovu / 110 | `src/composition/pages-bindings.hooks.ts` gets `defaultPageEditorPort`, `defaultPagesPort`, `defaultThemePagesPort`, `useWiredPages`, `useWiredPageEditor`, `useWiredThemePages` and the bound Page editor translator. `pages/page-editor-i18n.ts` → `createPageEditorTranslator`. `ThemePagesPort.isNoTheme`. `PageEditor` hook prop `useThemePreviewFrameHook` and `previewReload` slot. `pages/Pages.tsx:57,67` and the `PageEditor` hook props become required. Mounts `src/panels.tsx:222`, `:224` | (a) the disabled-theme fast path skips `getThemeDetail` when `isNoTheme` is true; (b) a Page editor key in `postEditorKeys` resolves through the injected Posts translator in `es`; (c) page autosave sends `entry: "page"` and `expectedVersion` → bind `isNoTheme` to `themeId === null` and see (a) red | C1.T, C2.T |
| **C4.T** / Tovu / 110 | `src/composition/posts-bindings.hooks.ts` gets `defaultPostEditorPort` and `useWiredPostEditor` with the Page-translator fallback. `PostFeaturedMedia` replaces the `AdminMedia` imports. `PostPreviewFrame` default removed. `PostEditorToolbarEnd` slot. Mounts `src/panels.tsx:241`, `:253`, `:255` | A missing Posts key falls back to the Page editor translator, and a manual reload and a revision refresh keep the frame state → reverse the fallback order (Page first) and see the `es` banner text change | C3.T |
| **C5.T** / Tovu / 90 | `src/composition/dashboard-bindings.hooks.ts` gets `defaultDashboardPort` and `useWiredDashboard`. `Dashboard` props `requestPublish`, `usePublishToLiveAvailableHook`, `useDashboardHook`. `AdminSiteKeyState` → core `site-key`. Mount `src/panels.tsx:134` | Dashboard's Publish button and a list's section button open **the same** shell dialog; with publish-to-live unavailable both are suppressed → bind Dashboard to a fresh request store and see the shared-dialog test red | C1.T, C0b.J |
| **C6.T** / Tovu / 110 | `usePublishSectionButton({ section, translate, locale }, _optional = {})`. `useWiredPublishSectionButton` in `src/composition/publish-content-bindings.hooks.ts`. `PublishSectionButton`'s hook prop becomes required. Each list gets a `publishControl` slot: `pages/Pages.tsx:15`, `posts/Posts.tsx:18`, `media/Media.tsx:45`, `taxonomy/Taxonomy.tsx:13`, `themes/Themes.tsx:12`, `collections/Collections.tsx:11`, `collections/CollectionEntries.tsx:6`, `menus/Menus.tsx:3`. Host mounts fill them: `src/panels.tsx:224`, `:255`, `:321`, `:319`, `:345`, `:404`, `:592`, `:1291`, `src/media-panel.ts`. The module binders `src/integrations/jini-admin/{forms,redirects,seo,widgets}-module.hooks.ts` and `modules.hooks.ts` pass the wired hook | A scoped Collections request carries both entity types; a live-site request through the shell suppresses the section control; cancellation clears the request → omit the collection schema entity and see red | C5.T |
| **C7.T** / Tovu / 50 | `themes/hooks/use-theme-explore.hooks.ts:10` → injected `homeFallbackPublishReason`, bound at `src/panels.tsx:582` through `src/composition/themes-bindings.hooks.ts` | The `index` page lock and the colliding-content reason both render → bind a resolver that ignores `homePage` and see red | C3.T |
| **C8.T** / Tovu / 100 | Media picker live default, `src/lib/media-image-extension.tsx`, `src/lib/media-embed-extension.hooks.ts` and `MediaEditDialog.hooks.tsx` ports → `src/composition/media-bindings.hooks.ts`. Posts `editorExtensions`/`MediaPicker` props. `src/media-panel.ts` binding | Upload, cover rendition and embed insert through an injected fake port → return the original URL instead of the bound rendition | C4.T |
| **C9.T** / Tovu / 80 | `src/lib/widget-embed-extension.hooks.ts:6` live default → `src/composition/widgets-bindings.hooks.ts`. Posts and Collections editor props (`posts/hooks/use-post-editor.hooks.ts:27`, `collections/CollectionEntryEditor.tsx:4`, `collections/hooks/use-collection-entry-editor.hooks.ts:9`). Mounts `src/panels.tsx:241`, `:253`, `:312` | Widget insertion through a fake → restore the live `widgetsApi` call inside the extension and see the fake-only test red | C8.T |
| **C10.T** / Tovu / 90 | `TermPickerSlot` at `pages/PageEditor.tsx:37`, `posts/editor/PostSavedPanels.tsx:3`, `collections/CollectionEntryEditor.tsx:7`. `ContentAnalysisSlot` at `PostSavedPanels.tsx:2`. Term picker live port → `src/composition/taxonomy-bindings.hooks.ts` | Selected terms save; an unauthorized principal sees the picker disabled → bind an always-authorized permission reader and see red | C3.T, C4.T |

---

## 2. Operations loop — deployment, import-export, security, source-control

### 2.1 Verified edges

| Pair | Sites |
|---|---|
| deployment → security | `deployment/StaticSiteTab.tsx:13T`, `deployment/api/deployment-api.types.ts:1T`, `deployment/hooks/publish-credentials-dependencies.hooks.ts:1T`, `:2` (`securityApi`), `deployment/hooks/publish-credentials-port.hooks.ts:1T`, `deployment/hooks/use-publish-credentials.hooks.ts:6T`, `deployment/rules.ts:2T` |
| deployment → import-export | `deployment/StaticSiteTab.tsx:15T`, `deployment/hooks/static-export-dependencies.hooks.ts:1T`, `:2` (`importExportApi`), `deployment/hooks/static-export-port.hooks.ts:1T`, `deployment/hooks/use-static-export.hooks.ts:3T`, `deployment/rules.ts:4T` |
| security → deployment | `security/AccessTokensTab.tsx:11T`, `:12` (`fieldHelpText`), `security/access-token-forms.ts:5` (`buildCredentialConnectionInput`, `fieldNameHandleSegment`, `requiredFieldsFilled`), `security/access-token-providers.ts:1T`, `security/access-token-rows.ts:2` (`PUBLISH_CREDENTIAL_ROW_LABEL`), `security/hooks/access-tokens-dependencies.hooks.ts:3` (`deploymentApi`), `security/hooks/access-tokens-port.hooks.ts:2T`, `security/hooks/use-access-tokens.hooks.ts:14` (`withPromotedDefault`) |
| security → source-control | `security/access-token-forms.ts:3T`, `:6` (`buildSourceControlConnectionInput`), `security/access-token-providers.ts:2T`, `:3` (`sourceControlProviderInfoFromDescriptor`), `security/access-token-rows.ts:3` (`SOURCE_CONTROL_CREDENTIAL_ROW_LABEL`), `security/hooks/access-tokens-dependencies.hooks.ts:4T`, `:5` (`sourceControlApi`), `security/hooks/access-tokens-port.hooks.ts:3T`, `security/hooks/use-access-tokens.hooks.ts:7T` |
| source-control → deployment | `source-control/ProvidersTab.tsx:9` (`fieldHelpText`, `fieldNameHandleSegment`), `source-control/api/source-control-api.types.ts:2T`, `source-control/rules.ts:2T` |
| import-export → source-control | `import-export/git-backup-rules.ts:2T`, `import-export/hooks/git-backup-port.hooks.ts:1T`, `:2` (`sourceControlApi`) |

Also cut in this wave:
- **Shared-code detours.** `src/lib/descriptor-i18n.ts:1T`, `:2T` (deployment and source-control descriptor types). Deployment reaches it at `deployment/hooks/use-static-publish.hooks.ts:7`; Security at `security/hooks/use-access-tokens.hooks.ts:9`.
- **Same file, so same step.** `security/hooks/access-tokens-dependencies.hooks.ts:6` (`providersApi`).
- **Import/Export's other edges, cut early because O5 rewrites those files.**
  - `import-export/hooks/use-import-export.hooks.ts:4` (`sitesApi`), `:5` (`isDesktopAdmin` from Settings), `:6` (`sitesTranslator`, `useSitesSnapshot`)
  - `import-export/ImportExport.tsx:5` (`SiteExportTab`, `SiteImportTab`)

### 2.2 Design

**Core contracts (Jini).**
- `packages/core/src/contracts/site/credential-token-hint.ts` declares `CredentialTokenHint { length: number; last4: string | null }`. It is structurally identical to `packages/platform/src/secrets/credential-token.ts:65`, but core cannot import platform, and an extracted admin screen cannot either (XP3). A Tovu type test checks that the two are mutually assignable, so they cannot drift (P9U-check §2.1).
- `publish-credentials.ts` ← from `security/api/security-api.types.ts`, verbatim, with any referenced types:
  - `AdminPublishCredentialProviderId`, `AdminPublishExecutionMode`, `AdminPublishCredentialSummary`, `AdminPublishCredentialVerification`, `AdminPublishConnectionInput`, `AdminPublishCredentialsSnapshot`.
  - Publish `executionMode` and verification are preserved, as are optionality and nullability.
- `publish-target-descriptor.ts` ← `AdminPublishTargetField`, `AdminPublishTargetCredentialSpec`, `AdminPublishTargetDescriptor`, `AdminDescriptorI18n` from `deployment/api/deployment-api.types.ts`.
- `source-control-credentials.ts` ← `AdminSourceControlProviderId`, `AdminSourceControlProviderDescriptor`, `AdminSourceControlConnectionInput`, `AdminSourceControlCredentialSummary`, `AdminSourceControlCredentialsSnapshot` from `source-control/api/source-control-api.types.ts`. Git keeps its distinct input and summary shapes.
- `export-run.ts` ← `AdminExportRunSnapshot` from `import-export/api/import-export-api.types.ts`, already structural.
- **Before adding each declaration,** the J step diffs it field by field against the models in `packages/admin/src/security/` and `packages/admin/src/source-control/`.
  - A field-identical model is recorded in the step report as a follow-up repoint for that module's own lane.
  - The untangle never edits those modules.

**Shared credential-form rules (Jini) — `@jini-ai/admin/core/credential-form`**, new entry `packages/admin/src/core/credential-form/index.ts`, `"universal"`:
- `rules.ts` ← verbatim from `deployment/rules.ts`, with each function's doc and why-comments:
  - `withPromotedDefault` (`:84`)
  - `requiredFieldsFilled` (`:115`)
  - `fieldNameHandleSegment` (`:216`)
  - `fieldHelpText` (`:264`)
- These are the neutral field-help, handle-segment, required-field and default-promotion rules.
- `fieldNameHandleSegment` uses `asciiSlug` (`src/lib/ascii-slug.ts`, which imports only `trimChars` from `@jini-ai/core/primitives`). `asciiSlug` moves verbatim into `@jini-ai/core/primitives` beside `trimChars`. That gives the slug formatting a neutral home (P9U-check §2.2). `src/lib/ascii-slug.ts` is deleted and its importers repoint (`rg -n "ascii-slug" apps/admin/src`).
- **These stay with their owners and reach Security as injected policy,** not shared code:
  - publish-only: `PUBLISH_CREDENTIAL_ROW_LABEL` (`deployment/rules.ts:38`), `buildCredentialConnectionInput` (`:186`)
  - Git-only: `SOURCE_CONTROL_CREDENTIAL_ROW_LABEL` (`source-control/rules.ts:109`), `buildSourceControlConnectionInput` (`:91`), `sourceControlProviderInfoFromDescriptor` (`:39`)
- The two builders keep their distinct token behaviour.

**Ports (host fills, Tovu composition).**
- **Deployment.**
  - `defaultPublishCredentialsPort` (`securityApi`) and `defaultStaticExportPort` (`importExportApi`) move to `src/composition/deployment-bindings.hooks.ts`, with their `useWired*`.
  - Mount: `src/panels.tsx:976`.
- **Source Control.**
  - `ProvidersTab` imports the credential-form rules from Jini.
  - Mount: `src/panels.tsx:1005`.
- **Import/Export.**
  - `git-backup-port.hooks.ts` keeps only the port type. Its live `sourceControlApi` binding moves to `src/composition/import-export-bindings.hooks.ts`.
  - `ImportExport` takes `siteTabs: { exportTab: ReactNode; importTab: ReactNode }`, `useSitesSnapshotHook`, a `sitesTranslate` function and `desktop: boolean`. Each is a separate prop (P9U-check §2.4).
  - The host binds `sitesApi` (`:4`), `useSitesSnapshot`/`sitesTranslator` (`:6`) and the desktop capability from O0.T.
  - Mount: `src/panels.tsx:178`.
- **Security access tokens.**
  - `defaultAccessTokensPort` (`deploymentApi`, `sourceControlApi`, `providersApi`) moves to `src/composition/security-bindings.hooks.ts`.
  - `Security` takes an `accessTokenPolicy` prop: `{ publishRowLabel, sourceControlRowLabel, buildPublishConnectionInput, buildSourceControlConnectionInput, sourceControlProviderInfoFromDescriptor }`, bound from the Deployment and Source Control owners at `src/panels.tsx:1041`.
  - Separate catalog failures and saved rows for disabled or missing providers are preserved.
- **Desktop capability (O0.T).**
  - `isDesktopAdmin` (`settings/ai-agent-presentation.ts:14–18`, with its why-comment `:6–7`) moves verbatim to `src/composition/desktop-capability.ts`. It imports `fs-files/folder-drop-port` and `voice-input/voice-input-port`, which composition may.
  - Features receive `desktop: boolean`: AI Assistant (`src/panels.tsx:191`), Import/Export (`:178`), Settings (`:1117`).
  - `localCliScopeCopy` stays in Settings until P5a.T.
  - This cuts `settings/ai-agent-presentation.ts:2`, `:3` (Settings → fs-files, voice-input) and `import-export/hooks/use-import-export.hooks.ts:5`.

**SEC alignment** (P9U-check §2.3).
- O1a.J, O1b.J and O2.J are **prerequisites of SEC-9–11**. Those sheets consume the core contracts and `@jini-ai/admin/core/credential-form` instead of declaring their own. The sheets' moved-file lists drop the declarations O1.T deletes.
- O4.T is the **single Tovu owner** of the Security access-token host bindings. R6.T owns the other-credentials, site-key and permissions bindings. SEC-14/15 consume those ports and add none.
- `SEC-T1` stays BLOCKED behind SEC-1–15, `A-adm-shell-lib-3`, owner-auth, vault, route and lazy-mount parity (`plans/P9-SEC-0-parity.md`), unchanged.
- **Order:** O1a.J → P1b.J → R6.T, because R6.T needs P1b.J's MCP and execution-credential shapes (`security/hooks/other-credentials-port.hooks.ts:1T`, `:2T`), the site-key contract from C0b.J (`security/hooks/site-key-port.hooks.ts:1T`) and R0.J's media provider map.

### 2.3 Steps

| Step / repo / est | Files and deliverable | Test first → named mutation | Depends on |
|---|---|---|---|
| **O0.T** / Tovu / 60 | `src/composition/desktop-capability.ts` (moved `isDesktopAdmin`); `desktop` prop on `AiAssistant`, `ImportExport`, `SettingsUi`; callers `ai-assistant/AiAssistant.tsx:7` (`:330`), `import-export/hooks/use-import-export.hooks.ts:5`, `settings/hooks/use-ai-agent-presentation.hooks.ts` (takes `desktop` through its deps from the `SettingsUi` prop), `src/components/AssistantDock/assistant-dock-props.tsx:7` (the shell mount passes `desktop`), and the host files `src/hooks/use-tovu-execution-policy.hooks.ts:6` and `src/site-section-availability.hooks.ts`, which may import composition directly. That is every non-test caller found with `rg -l isDesktopAdmin apps/admin/src`; mounts `src/panels.tsx:178`, `:191`, `:1117` | Desktop and browser mounts render different scope copy and tabs → pass the browser value on the desktop mount and see red | — |
| **O1a.J** / Jini / 80 | `packages/core/src/contracts/site/{credential-token-hint,publish-credentials,publish-target-descriptor}.ts`; fixtures `packages/core/src/__tests__/{credential-token-hint,publish-credentials,publish-target-descriptor}.unit.test.ts`; exports; baseline; changeset | Fixtures for each `executionMode` and verification state, and a descriptor with credential specs → drop `executionMode` from the summary and see red | K4-seam-1.J |
| **O1b.J** / Jini / 60 | `packages/core/src/contracts/site/{source-control-credentials,export-run}.ts`; fixtures; exports; baseline; changeset | Git input/summary fixtures that differ from the publish shapes, plus each export-run state → widen the Git input to the publish input and see the distinctness fixture red | O1a.J |
| **O2.J** / Jini / 100 | `packages/admin/src/core/credential-form/{index.ts,rules.ts}`; `asciiSlug` in core primitives; tests `packages/admin/src/core/credential-form/__tests__/rules.unit.test.ts` (moved verbatim from the Tovu `deployment` rules tests that cover these four functions, import line only) and `packages/core/src/primitives/__tests__/ascii-slug.unit.test.ts` (from Tovu's `ascii-slug` test); exports; baseline; changeset | A rename-only edit preserves the stored secret, descriptor help renders, a camelCase field slugs, and default promotion is stable → promote the first row instead of the saved default | O1a.J |
| **O1.T** / Tovu / 100 | Delete the moved declarations from `security/api/security-api.types.ts`, `deployment/api/deployment-api.types.ts`, `source-control/api/source-control-api.types.ts`, `import-export/api/import-export-api.types.ts`. Repoint every type site in §2.1 plus `src/lib/descriptor-i18n.ts:1`, `:2`. Add `src/__tests__/contracts/credential-token-hint.typetest.ts` (mutual assignability with `@jini-ai/platform/secrets/credential-token`) | `npm run typecheck:tests` → change `last4` to `string` in the linked core copy and see the type test red | O1a.J, O1b.J |
| **O2.T** / Tovu / 100 | `src/composition/deployment-bindings.hooks.ts` (two live ports + wired hooks); delete `withPromotedDefault`/`requiredFieldsFilled`/`fieldNameHandleSegment`/`fieldHelpText` from `deployment/rules.ts` and repoint Deployment's own callers; mount `src/panels.tsx:976` | Credential save and a terminal export failure settle through injected fakes → discard the terminal export failure in the fake binding path and see red | O1.T, O2.J |
| **O3.T** / Tovu / 80 | `source-control/ProvidersTab.tsx:9` → `@jini-ai/admin/core/credential-form`. `import-export/hooks/git-backup-port.hooks.ts:2` live binding → `src/composition/import-export-bindings.hooks.ts`. Mounts `src/panels.tsx:1005`, `:178` | Git backup keeps the provider and default selection → bind it to the publish credential list and see red | O2.T |
| **O4.T** / Tovu / 110 | `security/AccessTokensTab.tsx:11`, `:12`, `security/access-token-forms.ts:3`, `:5`, `:6`, `security/access-token-providers.ts:1–3`, `security/access-token-rows.ts:2`, `:3`, `security/hooks/access-tokens-dependencies.hooks.ts:3–6` (live port → `src/composition/security-bindings.hooks.ts`), `security/hooks/access-tokens-port.hooks.ts:2`, `:3`, `security/hooks/use-access-tokens.hooks.ts:7`, `:14`; `accessTokenPolicy` prop; mount `src/panels.tsx:1041` | (a) default promotion; (b) independent catalog failure; (c) a saved row for a missing descriptor stays visible → drop saved credentials whose descriptor is missing and see (c) red | O3.T |
| **O5.T** / Tovu / 90 | `import-export/ImportExport.tsx:5` → `siteTabs` slot; `import-export/hooks/use-import-export.hooks.ts:4`, `:6` → hook/translator props bound in `src/composition/import-export-bindings.hooks.ts`; `desktop` from O0.T; mount `src/panels.tsx:178` | Transfer tabs render, and the desktop snapshot appears only on desktop with the Sites translator in `es` → infer desktop from the URL and see red | O0.T, O3.T |

---

## 3. Settings loop — ai-assistant, integrations, plugins, providers, settings

### 3.1 Verified edges

| Pair | Sites |
|---|---|
| ai-assistant → settings | `ai-assistant/AiAssistant.tsx:7` (`isDesktopAdmin`, `localCliScopeCopy`), `:8` (Settings execution translator; both used `:330`) |
| settings → ai-assistant | `settings/hooks/use-external-mcp-admissions.hooks.ts:6` (`aiAssistantApi`, used `:78`) |
| settings → integrations | `settings/ExternalMcpSharedChoice.hooks.ts:2`, `settings/external-mcp-admissions-rules.ts:1T`, `settings/external-mcp-tool-picker-rules.ts:1T`, `settings/hooks/use-external-mcp-admissions.hooks.ts:4T`, `:5`, `settings/hooks/use-external-mcp-oauth-connect.hooks.ts:3`, `settings/hooks/use-external-mcp-tool-picker.hooks.ts:3T`, `:4`, `settings/hooks/use-external-mcp.hooks.ts:25T`, `:26` |
| integrations → plugins | `integrations/api/integrations-api.types.ts:2T` (`AdminPluginFiles`, derived at `:362`) |
| plugins → integrations | `plugins/AgentPluginLinkedLock.tsx:3T`, `plugins/AgentPluginMaturity.tsx:3T`, `plugins/AgentPluginRow.tsx:8T`, `plugins/AgentPlugins.hooks.ts:2T`, `plugins/AgentPlugins.tsx:13T`, `plugins/hooks/agent-plugin-install-dependencies.hooks.ts:1T`, `plugins/hooks/agent-plugin-install-port.hooks.ts:1T`, `plugins/hooks/agent-plugins-dependencies.hooks.ts:1T`, `:2` (`integrationsApi`), `plugins/hooks/agent-plugins-port.hooks.ts:1T`, `plugins/hooks/use-agent-plugin-install.hooks.ts:3T`, `plugins/hooks/use-agent-plugin-update.hooks.ts:3T`, `plugins/hooks/use-agent-plugins.hooks.ts:5T`, `plugins/rules.ts:1T` |
| plugins → providers | `plugins/hooks/plugins-dependencies.hooks.ts:3` (`providersApi`) |
| providers → integrations | `providers/Providers.tsx:13` (`Integrations`), `:14` (`useWiredIntegrations`), `:15` (Integrations translator), `providers/always-allow-rules.ts:1T`, `providers/hooks/always-allow-dependencies.hooks.ts:1T`, `:2` (`integrationsApi`), `providers/hooks/always-allow-port.hooks.ts:1T` |
| providers → settings | `providers/Providers.tsx:11` (`ExternalMcpSettingsPanel`), `providers/hooks/use-providers.hooks.ts:1` (`useExternalMcp`, `ExternalMcpController`) |

**Shared-code detours that close this loop, so they are cut in this wave:**
- **Ledger transport.** `src/lib/ledger-slice.ts:7` imports `features/settings/api/settings-api.ts`.
  - Callers reach it through `src/lib/settings-tabs.ts:33`, so every screen that calls `src/hooks/use-admin-locale.hooks.ts` (88 non-test feature files) and `src/hooks/use-admin-appearance-snapshot.hooks.ts` reaches Settings.
  - `sites/hooks/use-site-list-prefs.hooks.ts:12`, `:13` and `src/components/AssistantDock/chat-display-preferences.adapter.ts:2` also reach it.
  - `settings-api.ts` (28 lines) has exactly two importers, both shell code: `src/lib/ledger-slice.ts` and `src/lib/execution-settings.ts`. **It is shell transport living in a feature folder.**
- **Execution settings.** `src/lib/execution-settings.ts:69T`, `:70` (`aiAssistantApi`), `:71` (`settingsApi`).
  - Reached from `settings/hooks/use-settings-ui.hooks.ts:15`, `settings/rules.ts:5`, and `src/hooks/use-admin-execution-credential.hooks.ts:11`, which AI Assistant uses at `ai-assistant/AiAssistant.tsx:32`.
- **Execution policy hooks.**
  - `src/hooks/use-tovu-execution-policy.hooks.ts:3T`, `:4` (Deployment), `:6`, `:7` (Settings)
  - `src/lib/tovu-execution-policy.ts:2T` (Deployment)
  - `src/hooks/use-tovu-execution-adapters.hooks.ts`, which reaches AssistantDock execution config and the policy above
  - Imported by `ai-assistant/AiAssistant.tsx:5`, `:6` and `settings/SettingsUi.tsx:3`, `:4`.
- **Execution credential hooks.** `src/hooks/admin-execution-credential-dependencies.hooks.ts:1T`, `src/hooks/admin-execution-credential-port.hooks.ts:1T`, `src/hooks/use-admin-execution-credential.hooks.ts:4T` (AI Assistant types).

### 3.2 Design

**Core contracts (Jini).**
- `packages/core/src/contracts/site/package-files.ts` ← two declarations, verbatim:
  - `AdminPluginFiles` (`plugins/api/plugins-api.types.ts:87`).
  - `AdminAgentPluginFiles = Omit<AdminPluginFiles, "source">` with the doc comment above it (`integrations/api/integrations-api.types.ts:362`). The comment's ".tovu-plugin" becomes "the host's plugin manifest".
  - The `source` field stays on plugin files and stays absent on agent-plugin files (P9U-check §3.1).
- `agent-plugin.ts` ← `AdminAgentPlugin` (`integrations/api/integrations-api.types.ts:331`) and the types it references, verbatim.
  - Jini Admin's `AgentPluginSummary` (`packages/admin/src/agent-plugins/`) is a narrower projection. The Tovu fields its callers still read stay in this contract.
  - Maturity and admission **policy** stay in Tovu.
- `external-mcp-admin.ts` ← the Tovu wire DTOs `AdminExternalMcpServer` (`integrations-api.types.ts:54`), `AdminExternalMcpOAuthView`, `AdminExternalMcpServerInput`, `AdminExternalMcpOAuthInput`, `AdminExternalMcpToolApproval`, `AdminExternalMcpAdmissionsSnapshot`, `AdminExternalMcpConfigFailure`, `AdminFederatedAdmission*`, `AdminRemoteToolSurfaceEntry`. The token hint is the core `CredentialTokenHint` from O1a.J.
  - **Field-by-field result against `ExternalMcpServerView<TokenHint>` (`packages/core/src/contracts/hosted-mcp/config.ts:88`), so not a straight reuse:**
    - Tovu adds `builtIn?`.
    - Tovu makes `hasAccessToken` and `accessTokenEnvName` optional.
    - Tovu types `writeGrantsUpdatedAt` as `string`, where Jini uses `ISODateTime`.
  - The contract imports `ExternalMcpServerView` relatively and adds a compile fixture asserting `ExternalMcpServerView<CredentialTokenHint>` is assignable to `AdminExternalMcpServer`. The server view stays the source of the wire, and a drift turns the fixture red.
  - Endpoint errors, credential adapters and copy stay out of core.
- `execution-credential.ts` ← `AdminExecutionCredential`, `AdminExecutionCredentialPatch`, `SiteAssistantCredential` and the visitor-credential types that `security/hooks/other-credentials-port.hooks.ts:2T` and `src/lib/execution-settings.ts:69T` read from `ai-assistant/api/ai-assistant-api.types.ts`. Only the structural fields both Security and AI Assistant consume move.

**External MCP has one owner, Integrations** (P9U-check §3.2). The whole External MCP slice now under `settings/` is rendered only by Providers: `providers/Providers.tsx:11` is the only importer of `ExternalMcpSettingsPanel`, and `use-providers.hooks.ts:1` the only importer of `use-external-mcp.hooks.ts`. The hook's own comment says the panel no longer renders in Settings.
- **P2a.T moves it within Tovu, verbatim, from `settings/` to `integrations/external-mcp/`:**
  - `ExternalMcpAdmissionsBanner.tsx`, `ExternalMcpRemoveConfirmDialog.tsx`
  - `ExternalMcpSettingsPanel{,.hooks}.tsx`
  - `ExternalMcpSharedChoice{.tsx,.hooks.ts}`
  - `ExternalMcpToolPicker{,.hooks}.tsx`
  - `ExternalMcpToolsModal{.tsx,.hooks.ts}`
  - `external-mcp-admissions-rules.ts`, `external-mcp-i18n.ts`, `external-mcp-tool-picker-rules.ts`
  - `hooks/use-external-mcp*.hooks.ts`
  - their tests
- In the same commit, Providers' two imports repoint to the new paths. The build stays green, and the old paths are deleted in that commit. Settings → Integrations and Settings → AI Assistant then disappear.
- **P2b.T injects the live defaults.**
  - `integrationsApi` at `ExternalMcpSharedChoice.hooks.ts:2`, admissions `:5`, OAuth `:3`, tool picker `:4` and `use-external-mcp.hooks.ts:26` moves to `src/composition/integrations-bindings.hooks.ts`.
  - The admissions `me` and `restartAssistantDaemon` readers (`:77–78`, `authApi`/`aiAssistantApi`) move with it.
  - `Providers` takes `externalMcpPanel: ReactNode` and `useExternalMcpHook`, filled at `src/panels.tsx:771`.
  - The hooks stay independent of the Settings ledger.
- **The Jini move of this slice belongs to the Integrations lane (`A-K2-integrations-1`), not the untangle.** P9U records three facts for that lane sheet:
  - The External MCP rows of `A-K2-settings-1` (46 matching lines), `A-K2-settings-2` (11), `A-K2-settings-3` (43) and `A-K2-settings-4` (11) are superseded (counts are `grep -c 'external-mcp\|ExternalMcp'` per sheet). Their sources are now `integrations/external-mcp/…`, and their destination is the Integrations screen root, not `packages/admin/src/screens/settings/`.
  - Its Jini step must use kit inputs, close the `SourceConfigAddForm` gap in `k2-kit-gaps.md`, and take host copy. That includes the Tovu-specific sites/folder affordance at `ExternalMcpSettingsPanel.tsx:214` ("…list your other Tovu sites…"), which becomes a host-supplied built-in-server label.
  - Its server-side prerequisites are B3 `T26` (`mcp` confirmation and approval stores), `T27` (federation registrations and reload) and `T29` (`oauth` endpoint safety).
- The untangle files nothing of its own into `A-K2-providers-1`. That sheet follows P2b/P3.T's new props.

**Providers ↔ Integrations.**
- `Providers` takes `integrationsTab: ReactNode` and an `integrationsTranslate` function instead of importing `Integrations`, `useWiredIntegrations` and the translator (`Providers.tsx:13–15`). The host renders `<Integrations …>` with its wired hook.
- `always-allow-dependencies.hooks.ts:2`'s live port moves to `src/composition/providers-bindings.hooks.ts`. The types repoint to core.
- Deep links, tab locale and approval persistence are preserved.

**Plugins.** `agent-plugins-dependencies.hooks.ts:2` (`integrationsApi`) and `plugins-dependencies.hooks.ts:3` (`providersApi`) live ports move to `src/composition/plugins-bindings.hooks.ts`. Mounts: `src/panels.tsx:707`, `:728`. All 13 type sites repoint to core `agent-plugin`/`package-files`.

**AI Assistant ↔ Settings execution.**
- **P0.T** moves `features/settings/api/settings-api.ts` (and `settings-api.types.ts` if no feature file imports it; check with `rg`) verbatim to `src/lib/admin-http/settings-api.ts`. The ledger and execution-settings imports repoint. This single cut removes the locale and appearance detour into Settings for all 88 locale-hook importers.
- **P5a.T** moves three host files verbatim into `src/composition/`:
  - `src/hooks/use-tovu-execution-policy.hooks.ts`
  - `src/hooks/use-tovu-execution-adapters.hooks.ts`
  - `src/lib/tovu-execution-policy.ts`, which is Tovu product policy: deployed-site local-CLI rules and their copy.
  - AI Assistant (`AiAssistant.tsx:5`, `:6`) and Settings (`SettingsUi.tsx:3`, `:4`) take `useExecutionPolicyHook` and `useExecutionAdaptersHook` as required hook props.
  - `AiAssistant.tsx:7–8, :330` takes `useLocalCliScopeLabelHook`. The host builds the label from `localCliScopeCopy` and the Settings execution translator with the O0.T `desktop` value.
  - Product copy stays on host args.
- **P5b.T** splits `src/lib/execution-settings.ts`.
  - The namespace constants and the pure read/merge rules stay in `src/lib` with no feature import, so `settings/rules.ts:5` and `settings/hooks/use-settings-ui.hooks.ts:15` keep importing them.
  - The live `createExecutionPort` adapter, which uses `aiAssistantApi` and `settingsApi`, moves to `src/composition/execution-bindings.hooks.ts`.
  - `src/hooks/admin-execution-credential-*.ts` and `use-admin-execution-credential.hooks.ts` repoint their AI Assistant types to core `execution-credential`. Their live default moves to composition.
  - The Sites list-preferences caller (`sites/hooks/use-site-list-prefs.hooks.ts:12–13`) receives the bound ledger collaborator at its host mount.
  - The AssistantDock is a Tovu product screen. Its `selectedAgentWarning` import (`src/components/AssistantDock/hooks/use-selected-agent-auth-warning.hooks.ts:5`) stays a `sharedToFeature` baseline row (§5). Its `isDesktopAdmin` import (`assistant-dock-props.tsx:7`) is already replaced by O0.T.
  - **The production mount, not an optional prop with the same live fallback, supplies every collaborator** (P9U-check §3.3).

### 3.3 Steps

| Step / repo / est | Files and deliverable | Test first → named mutation | Depends on |
|---|---|---|---|
| **P0.T** / Tovu / 45 | Move `settings/api/settings-api.ts` (and its types file per `rg`) to `src/lib/admin-http/settings-api.ts`, then repoint `src/lib/ledger-slice.ts:7` and `src/lib/execution-settings.ts:71` | The ledger port keeps the 404-only empty-namespace rule (`ledger-slice.ts:15–17`), and transport failures still throw → treat every `ApiError` as an unregistered namespace and see red | — |
| **P1a.J** / Jini / 70 | `packages/core/src/contracts/site/{package-files,agent-plugin}.ts`; fixtures; exports; baseline; changeset | Plugin files carry `source` and agent-plugin files must not → make `source` required on `AdminAgentPluginFiles` and see red | K4-seam-1.J |
| **P1b.J** / Jini / 100 | `packages/core/src/contracts/site/{external-mcp-admin,execution-credential}.ts`; fixtures, including the `ExternalMcpServerView<CredentialTokenHint>` → `AdminExternalMcpServer` assignability fixture and refusal/pending-admission/approval shapes; exports; baseline; changeset | Fixtures compile → remove the refusal discriminant from `AdminExternalMcpConfigFailure` and see red | O1a.J, P1a.J |
| **P1.T** / Tovu / 100 | Delete the moved declarations from `plugins/api/plugins-api.types.ts:87`, `integrations/api/integrations-api.types.ts:54…`, `:331`, `:362` and the AI Assistant credential types. Repoint the 13 plugins type sites, `integrations-api.types.ts:2`, `providers/always-allow-rules.ts:1`, `providers/hooks/always-allow-*.hooks.ts:1`, `settings/external-mcp-*-rules.ts:1`, `settings/hooks/use-external-mcp*.hooks.ts` type lines, `security/hooks/other-credentials-port.hooks.ts:1`, `:2`, `src/lib/execution-settings.ts:69`, `src/hooks/admin-execution-credential-*.ts:1`, `src/hooks/use-admin-execution-credential.hooks.ts:4`, `email/hooks/use-email-provider.hooks.ts:3`, `skills/api.ts:3` | `npm run typecheck:tests` and the existing Agent Plugins file-modal test → make `source` required in the linked core copy and see the agent-plugin fixture call site red | P1a.J, P1b.J |
| **P2a.T** / Tovu / 90 | Verbatim move of the External MCP slice (list above) from `settings/` to `integrations/external-mcp/` with its tests. Repoint `providers/Providers.tsx:11` and `providers/hooks/use-providers.hooks.ts:1` in the same commit and delete the old files there. Record the A-K2-settings-1/2/3/4 supersession in each sheet header | Existing External MCP tests pass from the new paths. The Providers MCP tab mounts without loading the Settings ledger (spy on `loadNamespaceValues`) → import the ledger in the moved panel and see red | P1.T |
| **P2b.T** / Tovu / 100 | Live defaults → `src/composition/integrations-bindings.hooks.ts`; `Providers` props `externalMcpPanel` and `useExternalMcpHook`; mount `src/panels.tsx:771` | Connect failure maps the refusal, reload keeps parity, and admission refresh runs the Assistant readiness check → lose the connect refusal during mapping and see red | P2a.T |
| **P3.T** / Tovu / 90 | `providers/Providers.tsx:13–15` → `integrationsTab` slot and `integrationsTranslate`; `always-allow-dependencies.hooks.ts:2` live port → `src/composition/providers-bindings.hooks.ts`; mount `src/panels.tsx:771` | Deep links, tab locale and approval persistence → bind the Webhooks panel into the MCP tab slot and see the tab test red | P2b.T |
| **P4.T** / Tovu / 80 | `plugins/hooks/agent-plugins-dependencies.hooks.ts:2`, `plugins/hooks/plugins-dependencies.hooks.ts:3` live ports → `src/composition/plugins-bindings.hooks.ts`; mounts `src/panels.tsx:707`, `:728` | A toggle failure keeps the saved state and the file modal stays readable → commit the failed toggle and see red | P1.T |
| **P5a.T** / Tovu / 100 | Move `src/hooks/use-tovu-execution-policy.hooks.ts`, `src/hooks/use-tovu-execution-adapters.hooks.ts` and `src/lib/tovu-execution-policy.ts` to `src/composition/`. Add hook props to `AiAssistant` (`:5–8`, `:330`) and `SettingsUi` (`:3`, `:4`). Mounts `src/panels.tsx:191`, `:1117` | Desktop vs server scope copy, a slow initial agent scan that cannot overwrite a rescan, and the deployed-site local-CLI note → use server scope on desktop and see red | O0.T, P0.T |
| **P5b.T** / Tovu / 110 | Split `src/lib/execution-settings.ts` (live adapter → `src/composition/execution-bindings.hooks.ts`), move the live default out of `src/hooks/admin-execution-credential-dependencies.hooks.ts`, and bind the Sites list-preferences caller at its host mount | Credential save parity and Sites list preferences persist through the injected ledger → bypass the ledger fake in the Sites test and see red | P5a.T, P1.T |

---

## 4. Remaining value edges — kept or injected, each listed

**Ratchet start.** When C, O and P are done, these 32 pairs (65 sites) remain. That is `plans/P9U-data/ratchet-start-edges-and-ranks.txt`, computed by cutting every file the C/O/P steps rewrite. `taxonomy → auth` (`taxonomy/hooks/term-picker-dependencies.hooks.ts:3`) is not in it, because C10.T moves that live port; the data file's list is authoritative.
- No cycle remains.
- B.T lands on exactly this set.
- Each R step below then removes its pairs and lowers the affected ranks in the same commit.

**Decision for every row: inject** (owner rule). Type-only rows move to core contracts or narrow per-feature structural types; none stays as a sibling import. A lower-rank sibling import is never kept, because it would leave the screen unextractable on its own.

| Pair | Sites | Cut | Step |
|---|---|---|---|
| admin-ui → admin-themes | `admin-ui/AdminUi.tsx:5`, `:6` | `themesTab: ReactNode` + `themesTitle` prop; host renders `AdminThemes` (theme picker stays Tovu) | R3.T |
| admin-ui → integrations | `admin-ui/AdminUi.tsx:7` | Host passes the existing history-replacing redirect element; legacy Design System URL preserved | R3.T |
| admin-ui → settings | `admin-ui/AdminUi.tsx:8` | `appearanceTab` slot (host renders `AdminAppearance`) | R3.T |
| settings → admin-themes | `settings/AdminAppearance.tsx:12` | `schemeControl` slot (host renders `AdminThemeSchemeControl`) | R3.T |
| settings → workspace | `settings/SettingsUi.tsx:130`, `:131` | `workspaceTab` slot + `workspaceTitle` | R3.T |
| settings → webmcp | `settings/SettingsUi.tsx:146` | `browserAgentPanel` slot | R3.T |
| library → media | `library/Library.tsx:8T`, `library/hooks/library-dependencies.hooks.ts:1T`, `:2`, `library/hooks/library-port.hooks.ts:1T`, `library/hooks/use-library.hooks.ts:5T`, `:9` (`readFileAsBase64`), `library/rules.ts:2T` | Live port → `src/composition/library-bindings.hooks.ts`; `readFileAsBase64` injected through the Library port; `AdminMedia` → core `media-item` (R0.J) | R1.T |
| library → auth / users | `library/hooks/library-dependencies.hooks.ts:4` / `:3` | Same live port move | R1.T |
| menus → pages | `menus/hooks/menus-dependencies.hooks.ts:1` (`pagesApi`), `:6` (`pagePublicPath`) | Live port → `src/composition/menus-bindings.hooks.ts`; public-path resolver bound there | R1.T |
| menus → trash | `menus/hooks/menus-dependencies.hooks.ts:2` | Same | R1.T |
| sites → auth / users | `sites/hooks/site-transfer-dependencies.hooks.ts:3` / `:2` | Live port → `src/composition/sites-bindings.hooks.ts` | R2a.T |
| trash → users | `trash/hooks/trash-dependencies.hooks.ts:1T`, `:2`, `trash/hooks/trash-port.hooks.ts:1T` | Live port → composition; `AdminIdentityUser` → core `identity-user` (R0.J) | R2a.T |
| users → auth / roles | `users/hooks/users-dependencies.hooks.ts:4` / `:2` | Live port → composition | R2a.T |
| recovery → database | `recovery/api/recovery-api.types.ts:1T`, `recovery/hooks/recovery-dependencies.hooks.ts:3T`, `:4`, `recovery/hooks/recovery-port.hooks.ts:2T` | Live port → composition; `RestorePointCostClass`, `AdminRestorePointSummary` → core `restore-point` (R0.J) | R2b.T |
| recovery → taxonomy, database → taxonomy (type-only) | `recovery/api/recovery-api.ts:2T`, `recovery/hooks/restore-flow-dependencies.hooks.ts:1T`, `recovery/hooks/restore-flow-port.hooks.ts:1T`, `database/api/database-api.ts:3T`, `database/hooks/migrate-forward-section-dependencies.hooks.ts:1T`, `database/hooks/migrate-forward-section-port.hooks.ts:1T` | `GatedPlanResult`/`GatedConfirmResult` (`taxonomy/api/taxonomy-api.types.ts:35`, `:41`) → core `contracts/site/gated-mutations/plan.ts` (R0.J). **Not** `@jini-ai/admin/core`'s `GatedPlanResult` (`packages/admin/src/core/gated/types.ts:38`, `:52`): that is a different wire (`token`/`confirmToken` vs Tovu's `planId`/`planHash`/`confirmationToken`) | R2b.T |
| observability → auth | `observability/hooks/use-queries-tab.hooks.ts:3` | `authApi` reader → hook dependency bound in composition | R2b.T |
| email → integrations | `email/hooks/use-email-provider.hooks.ts:3T`, `:4` | Mail-provider operations port bound in composition; type → core `agent-plugin` (P1.T) | R5.T |
| email → plugins | `email/EmailProviderTab.tsx:8` (`agentPluginDisplayName`) | Display formatter injected as prop | R5.T |
| skills → plugins | `skills/SkillRow.tsx:5` (icons), `skills/Skills.tsx:11` (`PackageFilesModal`), `skills/api.ts:3T`, `skills/use-skill-files.hooks.ts:5T` (`PackageFilesModalProps`), `:6` (`packageFilesRead`, `packageFilesViewState`) | `PackageFilesViewer` component prop + `icons` slot + package-file read/projection functions injected; `AdminPluginFiles` → core (P1.T); `PackageFilesModalProps` replaced by the injected component's props type declared in `skills` | R5.T |
| security → ai-assistant / integrations / media | `security/hooks/other-credentials-dependencies.hooks.ts:1`, `:2`, `:3T`, `:4`, `security/hooks/other-credentials-port.hooks.ts:1T`, `:2T`, `:3T`, `security/hooks/use-other-credentials.hooks.ts:5T`, `security/other-credential-stores.ts:1` (`MEDIA_PROVIDER_CATALOG`) | Per-store live ports → `src/composition/security-bindings.hooks.ts`; media provider catalog injected; types → core `execution-credential`, `external-mcp-admin` (P1b.J), `media-item` (`AdminMediaProviderMap`, R0.J) | R6.T |
| security → sites | `security/hooks/site-key-dependencies.hooks.ts:1`, `site-key-port.hooks.ts:1T`, `site-key-status.rules.ts:1T`, `use-site-key-recovery.hooks.ts:3T`, `use-site-key.hooks.ts:4T` | Site-key live port → composition; DTOs → core `site-key` (C0b.J) | R6.T |
| security → auth | `security/hooks/security-permissions-dependencies.hooks.ts:1` | Grants reader → composition; the denied tab stays denied while grants load | R6.T |
| media → trash / users | `media/hooks/media-dependencies.hooks.ts:4` / `:3` | Live port → `src/composition/media-bindings.hooks.ts` | R7.T |
| taxonomy → trash | `taxonomy/hooks/taxonomy-dependencies.hooks.ts:3` | Live port → `src/composition/taxonomy-bindings.hooks.ts` | R7.T |
| themes → trash | `themes/hooks/themes-dependencies.hooks.ts:3` | Live port → `src/composition/themes-bindings.hooks.ts` (Themes stays Tovu, but its folder still obeys the rule) | R7.T |

**Theme runtime (`src/admin-themes/`, stays in Tovu).** These are not feature → feature edges. They are feature → host-runtime edges, and the §5 rule forbids them, starting from a baseline.

| Sites | Cut | Step |
|---|---|---|
| `useAdminThemeBoundary` imports at `ai-assistant/AiAssistant.tsx:2`, `authentication/Authentication.tsx:2`, `email/Email.tsx:8`, `media/Media.tsx:1`, `observability/Observability.tsx:1`, `plugins/AgentPlugins.tsx:2`, `providers/Providers.tsx:2`, `settings/SettingsUi.tsx:2`, `skills/Skills.tsx:2` | Required `useThemeBoundaryHook` prop on each screen, filled at the mounts. Authentication's lazy mount is included | R4.T |
| `settings/AdminAppearance.tsx:8T`, `:9`, `:10`, `settings/hooks/use-admin-appearance-settings.hooks.ts:3` | Theme state/registry operations port bound in `src/composition/settings-bindings.hooks.ts`; the Admin UI → Appearance path (`src/panels.tsx:605`) binds the same | R4.T |
| `admin-themes/AdminThemes.tsx:6–8` (feature folder → runtime) | Host composes the picker, registry and document environment and passes them | R4.T |
| `src/lib/settings-events.ts:25` (`publishThemePreviewRefresh` from `themes/theme-preview-refresh`) | The publisher is injected at the shell bind site; the shared subscription keeps an injected `publishPreview` | R4.T |

**Host-module reverse imports** (feature → host binder; first hop in `plans/P9U-data/admin-shared-detours-41e948ee4.txt`):
- **Wrapper entries.**
  - `comments/index.ts:10`, `:11`
  - `forms/index.ts:13`, `:14`
  - `redirects/index.ts:10`, `:11`
  - `seo/index.ts:10`, `:11`
  - `widgets/index.ts:10`, `:11`
  - **Fix:** these wrapper entries move to `src/composition/modules/<name>.tsx`. Their consumers repoint: `src/panel-pages.ts:27` (Comments), `:38` (Seo), `:39` (Redirects), `:42` (Forms), `:56` (Widgets).
- **Direct kit and binder imports.**
  - `consent/CookieConsent.tsx:7` (`adminKit` from `src/integrations/jini-kits`)
  - `media/hooks/use-edit-media-panel.hooks.ts:9` (`embedPolicy` from `src/integrations/jini-admin/embed-policy-ports`)
  - **Fix:** both become props bound at the host. **Step R8.T.**
- Render parity alone cannot detect a reverse import, so R8.T's test is the boundary fixture.

**Shared-code imports of features that remain after the waves** (`plans/P9U-data/admin-shared-to-feature-imports-41e948ee4.txt` minus the files C/O/P rewrite):
- **AssistantDock** (product screen, stays in Tovu): `src/components/AssistantDock/**` → ai-assistant, fs-files, plugins, settings, skills, taxonomy, voice-input, webmcp.
- **Widget config UI** (Widgets lane): `src/components/WidgetConfigFields/**` and `src/components/WidgetPickerDialog/**` → collections, forms, media, menus, widgets.
- **Mail status banner:** `src/components/MailStatusBanner/**` → email (types).
- **Shell nav and transport:** `src/hooks/use-sites-sidebar-nav.hooks.ts` → sites; `src/lib/agent-navigation-entities.ts:2–6` → integrations, posts, pages, menus, widgets; `src/lib/assistant-transport.ts:4` → plugins.

They are listed, with their allowed targets, as the starting baseline of rule `admin-shared-no-feature` (§5). Each later lane step that moves one of them deletes its baseline row; the baseline may only shrink.

### 4.1 Steps

| Step / repo / est | Files and deliverable | Test first → named mutation | Depends on |
|---|---|---|---|
| **R0.J** / Jini / 90 | `packages/core/src/contracts/site/{gated-mutations/plan,restore-point,identity-user,media-item}.ts` (Tovu shapes, verbatim: `taxonomy-api.types.ts:35`, `:41`, Database restore-point types, `users-api.types.ts` `AdminIdentityUser`, `media-api.types.ts` `AdminMedia`/`AdminMediaProviderMap`); fixtures; exports; baseline; changeset. Compare `AdminMedia` with `packages/admin/src/core/ports/media.ts:29` and record the diff; reuse only if field-identical | Gated plan/confirm fixture with `planId`/`planHash` → rename `confirmationToken` to `confirmToken` and see red | K4-seam-1.J |
| **R1.T** / Tovu / 100 | Library + Menus rows above; mounts `src/panels.tsx:292`, `:345`; lower `library`, `menus` ranks | Library upload through the injected byte reader, and menu items' public links → return the admin edit URL as the public URL and see red | R0.J, B.T |
| **R2a.T** / Tovu / 90 | Sites, Trash and Users rows; their mounts; lower `sites`, `trash`, `users` ranks | Injected session/role readers, and a stale session refetches under the new scope → reuse the previous-scope identity and see red | R0.J, B.T |
| **R2b.T** / Tovu / 90 | Recovery, Database and Observability rows; lower `database`, `recovery`, `observability` ranks | Restore settlement through the gated plan/confirm envelope → swallow a restore refusal and see red | R0.J, B.T |
| **R3.T** / Tovu / 100 | Admin UI and Settings slot rows; mounts `src/panels.tsx:605`, `:1117`; lower `admin-ui`, `settings` ranks | Legacy Design System redirect replaces history, tab deep links work, and the scheme slot renders → drop the history replacement and see red | P5a.T, B.T |
| **R4.T** / Tovu / 110 | Theme-runtime rows (9 boundary consumers incl. Authentication's lazy mount, Appearance, `AdminThemes`, `src/lib/settings-events.ts:25`); delete the matching `featureToHost` baseline rows | Theme scheme and revision events dispatch to the right listeners → route preview events to settings refresh and see red | R3.T |
| **R5.T** / Tovu / 90 | Email + Skills rows; mounts `src/panels.tsx:747`, `:1184–1185`; lower `email`, `skills` ranks | Email provider label fallback, and skill file read errors → reuse a previous successful file result and see red | P1.T, B.T |
| **R6.T** / Tovu / 110 | Security other-credentials, site-key and permissions rows; mount `src/panels.tsx:1041`; lower `security` rank. These are the host bindings SEC-14/15 consume | Independent store results, and the denied tab stays denied while grants load → pass the unresolved grant as allowed and see red | P1b.J, C0b.J, R0.J, O4.T, B.T |
| **R7.T** / Tovu / 60 | Media, Taxonomy and Themes → trash/users rows; lower `media`, `taxonomy`, `themes` ranks | Soft delete through each injected trash port → bind Media to the Taxonomy trash scope and see red | B.T |
| **R8.T** / Tovu / 90 | Wrapper entries → `src/composition/modules/*.tsx`; `src/panel-pages.ts:27`, `:38`, `:39`, `:42`, `:56` repointed; Consent kit and Media embed policy props; delete the `featureToHost` baseline rows | Existing lazy-route and module parity tests, plus the B.T fixture case "feature imports a host binder" → restore `comments/index.ts:10` and see `check:admin-boundaries` red | B.T |
| **RZ.T** / Tovu / 30 | After R1–R8: every rank is 0 and the pair allowlist is empty; switch the rank check to `--zero` | The rank-1 fixture fails under `--zero` → set one rank to 1 and see red | R1–R8 |

---

## 5. Admin boundary rule (Tovu B.T, Jini B0.J + B.J)

### 5.1 Tovu rule — mirrors `FEATURE_RANK` (`.dependency-cruiser.mjs:833–877`)

The server rule:
- reads `development/boundaries/feature-ranks.json` (`:861`);
- generates one rule per rank (`:865–876`) whose `from.path` captures the importing feature, so `$1` exempts same-feature imports;
- rejects same-or-higher-rank targets at `severity: "error"`;
- **filters out type imports** (`dependencyTypesNot: ["type-only", "type-import"]`, `:874`).

The admin mirror differs only where extraction demands it:

1. **New files.**
   - `development/boundaries/admin-feature-ranks.json`: one row per production folder under `apps/admin/src/features/` (46 today). Starting values are the ratchet-start ranks in `plans/P9U-data/ratchet-start-edges-and-ranks.txt`: `recovery` 5; `database`, `library`, `security` 4; `media`, `menus`, `taxonomy`, `themes` 3; `admin-ui`, `sites`, `trash` 2; `email`, `observability`, `settings`, `skills`, `users` 1; the other 30 are 0.
   - `development/boundaries/admin-feature-edges.baseline.json`: the 32 ratchet-start pairs as `{ "<importer>": ["<target>", …] }`.
   - `development/boundaries/admin-shared-baseline.json`, with two sections:
     - `sharedToFeature`: every remaining shared file → its allowed feature folders, as listed in §4.
     - `featureToHost`: the five wrapper entries plus `consent/CookieConsent.tsx` and `media/hooks/use-edit-media-panel.hooks.ts`, until R8.T; and the theme-runtime consumers, until R4.T.
2. **Generated rules, inserted after `FEATURE_RANK_RULES` and spread into `forbidden` at `:879`.**
   - **`admin-feature-rank:<n>`** is the same generator over the admin table, rooted at `^apps/admin/src/features/`, `severity: "error"`.
     - It has **no `dependencyTypesNot`**: type-only and `import("x").T` edges count, because a type import still blocks extracting the screen alone.
     - The comment says so and repeats the server's `verbatimModuleSyntax` caveat. Admin's tsconfig does not set it either, but the admin rule does not depend on that caveat, since it keeps type edges.
   - **`admin-feature-allowlist:<feature>`**, for each importer in the pair baseline: any feature target outside its list (other than itself) is an error. Features absent from the baseline may import no sibling. The rank rule proves acyclicity; this rule makes the ratchet strict, because a rank rule alone would still let a new lower-rank import in.
   - **`admin-shared-no-feature`** covers `^apps/admin/src/(lib|hooks|components)/` (and `src/admin-themes/`).
     - It errors on any import into `^apps/admin/src/features/`.
     - Each baselined file gets its own generated rule with `to.pathNot` limited to its allowed folders.
     - This closes the feature → shared → feature detour (P9U-check boundary §2).
   - **`admin-no-host-import`** applies from features and from shared code.
     - It errors on imports into `^apps/admin/src/(composition/|integrations/|admin-themes/|App[^/]*$|panels\.tsx$|panel-pages\.ts$|panel-contracts\.ts$|media-panel\.ts$|nav\.ts$|main\.tsx$)`.
     - `featureToHost` baseline rows are exempt, and `integrations/jini-admin/**` → its own files is allowed.
     - Host composition (`src/composition/**`, `src/App*`, `src/panels.tsx`, `src/panel-pages.ts`, `src/media-panel.ts`, `src/integrations/**`) may import any feature.
   - **Scope:** tests and fixtures are out (`(^|/)__tests__/|\.(test|spec)\.tsx?$|__measurements__/`). The same exclusion is used by the folder check.
3. **Admin preset and command.** Add `development/boundaries/admin.depcruise.mjs`. It imports the rule builders from `.dependency-cruiser.mjs` and sets `options.tsConfig.fileName: "apps/admin/tsconfig.json"`, `tsPreCompilationDeps: true`, and `doNotFollow: node_modules`. It runs from the repo root, so `@/*` resolves. The command goes in root `package.json`:
   - `"check:admin-boundaries": "node development/scripts/check-feature-ranks.mjs . development/boundaries/admin-feature-ranks.json --features apps/admin/src/features --edges development/boundaries/admin-feature-edges.baseline.json && depcruise --config development/boundaries/admin.depcruise.mjs apps/admin/src"`
   - Unresolved local or `@/` specifiers in production admin sources are reported by a `not-to-unresolvable` rule restricted to `^apps/admin/src/` at `error`.
4. **Folder and table check** (`development/scripts/check-feature-ranks.mjs`, extended; the server path keeps today's behaviour):
   - It still flags missing, stale and invalid rows and isolated folders.
   - **`--edges <baseline>`:**
     - Every baseline pair must still exist in the resolved graph. A stale pair is an error, so the list can only shrink.
     - Every rank must equal the longest chain over the baseline pairs. Slack is an error, so a rank cannot be raised in advance.
   - **`--zero`** (switched on by RZ.T): every rank must be 0 and the baseline empty (P9U-check boundary §1).
5. **CI — blocking.** In `.github/workflows/ci.yml`, add a step `id: gate-admin-boundaries` running `npm run check:admin-boundaries`. It gets **no** `continue-on-error`. Its line goes in the always-running summary beside `gate-boundaries` (`:309`): `check "${{ steps.gate-admin-boundaries.outcome }}" "check:admin-boundaries (dependency-cruiser)"`. The existing `gate-boundaries` step (`:112–118`, `continue-on-error: true` at `:117`) is unchanged; the summary already fails the job on its outcome.

### 5.2 Jini rule (B0.J, B.J)

- **B0.J** breaks the existing type cycle: `packages/admin/src/core/ports/embed-policy.ts:7` imports `ParsedMediaHtmlAttributes` from `../../media/html-attributes.js`, and `packages/admin/src/media/html-attributes.ts:8` imports `EmbedPolicyPort` back.
  - Move `ParsedMediaHtmlAttributes` and the structural types it references, verbatim, into `packages/admin/src/core/ports/embed-policy.ts`.
  - `media/html-attributes.ts` imports them from there.
  - Shared `core/` then no longer imports a feature root.
- **B.J** adds rule `admin-module-ownership` to Jini's `.dependency-cruiser.mjs`, `severity: "error"`.
  - **Feature roots:** `packages/admin/src/{agent-plugins,comments,forms,media,playground,redirects,security,seo,source-control,widgets}/` and every `packages/admin/src/screens/<name>/`.
  - **Shared:** `core/`, `react/` (including `react/editor/`), `contracts/`, `browser/`, `themes/`.
  - **Rules:**
    - A feature root may import itself and shared modules, never another feature root.
    - A shared module may never import a feature root.
    - Type imports count.
  - New screen roots are matched by the `screens/<name>` capture, so they need no table edit.
  - Add `pnpm check:admin-boundaries` and a **blocking** step in `.github/workflows/ci.yml`. The nightly `quality:depcruise` stays report-only.

### 5.3 Steps

| Step / repo / est | Files and deliverable | Test first → named mutation | Depends on |
|---|---|---|---|
| **B0.J** / Jini / 60 | `packages/admin/src/core/ports/embed-policy.ts`, `packages/admin/src/media/html-attributes.ts`; api-baseline delta if the type's export path changes | Port and media consumers compile, and a depcruise fixture finds no `core → media` edge → restore the back-import and see the B.J fixture red | — |
| **B.J** / Jini / 100 | `.dependency-cruiser.mjs` rule; `scripts/__tests__/check-admin-boundaries.test.ts` (real depcruise CLI on a temp fixture tree, like the Tovu `check-architecture.test.ts`); `package.json` script; `.github/workflows/ci.yml` blocking step | Accept feature → itself, feature → `core`/`react/editor`, and `screens/a` → `react`. Reject `screens/a` → `screens/b`, `media` → `security`, `core` → `media` (value and type) → exempt one sibling root and see the fixture red | B0.J, C1.J, O2.J |
| **B.T** / Tovu / 115 | `development/boundaries/{admin-feature-ranks.json,admin-feature-edges.baseline.json,admin-shared-baseline.json,admin.depcruise.mjs}`; `.dependency-cruiser.mjs` generators; `development/scripts/check-feature-ranks.mjs` `--edges`/`--zero`; `development/scripts/__tests__/check-admin-boundaries.test.ts`; `package.json`; `.github/workflows/ci.yml` step + summary line | Real CLI in a temp fixture, as in `development/scripts/__tests__/check-architecture.test.ts`. **Accept:** same-feature, composition → feature, baselined pair, baselined shared file. **Reject:** relative and `@/` sibling value imports; standalone `import type` and inline `{ type X }`; `typeof import("…")` type query; re-export; literal lazy `import()`; side-effect import; a feature → `src/composition/` import; a feature → `src/panels.tsx` import; a new shared `lib` file → feature (detour); an unbaselined pair at a lower rank; a rank with slack; a stale baseline pair; an unranked isolated folder; a rank of `1` under `--zero`; an unresolved `@/` specifier. **Mutation:** add `"type-only"` to `dependencyTypesNot` in the generator → the type-import fixtures pass and the test goes red | **C1.T–C10.T, O0.T–O5.T, P0.T–P5b.T** (all C/O/P Tovu cuts, which includes C7.T, O1.T, O3.T and O4.T from P9U-check), **B.J**, and a resolved cruise on the post-wave tree that reports exactly the 32 baseline pairs. If any Security import listed for O4.T survives, B.T waits for SEC-T1 |

---

## 6. Effort and order

| Wave | Jini steps | Jini | Tovu steps | Tovu | Total |
|---|---|---:|---|---:|---:|
| Content | C0, C0b, C1 | 3 h 45 m | C1–C10 | 15 h 20 m | 19 h 5 m |
| Operations | O1a, O1b, O2 | 4 h | O0–O5 | 9 h | 13 h |
| Settings | P1a, P1b | 2 h 50 m | P0, P1, P2a, P2b, P3, P4, P5a, P5b | 11 h 55 m | 14 h 45 m |
| Gate | B0, B | 2 h 40 m | B | 1 h 55 m | 4 h 35 m |
| Ratchet to zero | R0 | 1 h 30 m | R1–R8, RZ | 14 h 30 m | 16 h |
| **Total** | **11 steps** | **14 h 45 m** | **35 steps** | **52 h 40 m** | **67 h 25 m** |

Every row is ≤ 115 minutes for one implementer in one repository. The estimates cover seam work and cutovers only, not the later per-lane verbatim moves of each screen into `packages/admin/src/screens/<name>/`, which P9's lane sheets carry.

**Order and parallelism.**
1. **Jini contracts first, in parallel:**
   - C0, C0b, O1a then O1b, P1a, R0 — after K4-seam-1.J.
   - C1 after A-K2-0a.J.
   - O2 after O1a.
   - P1b after O1a and P1a.
   - B0 any time.
2. **Tovu waves:**
   - The three waves touch disjoint feature folders, so one implementer per wave can run in parallel.
   - Serialize every step that edits `src/panels.tsx` or the same `src/composition/*` file.
   - O0.T and P0.T are tiny prerequisites; land them first.
3. **The gate:** B.J after B0.J; B.T once all C/O/P Tovu steps are in.
4. **Ratchet to zero:** R1–R8 in any order that respects their `Depends on` and the `panels.tsx` serialization, then RZ.T.

**Lane effect (P9F).** After the C, O and P waves, a lane can extract a screen with no sibling-feature import left: Pages, Posts, Dashboard, Media, Collections/Taxonomy, Deployment, Source Control, Import/Export, Integrations/Providers, Add-ons and AI Assistant. Its host bindings stay in `src/composition/`, and its lane sheet repoints the mount to the Jini screen. Themes, Admin Themes, Dashboard copy and the AssistantDock stay in Tovu. P9's STOP conditions and existing holds stay in force: SH-3, the SEC parity gate, and the frozen RT retirements.

---

## Changes from v1

Each item of `plans/P9U-check.md` and where v2 fixes it.

| P9U-check item | Fixed in |
|---|---|
| §1.1 `AdminPost` is declared at `posts-api.types.ts:6`, not `:8` | §1.2 core contracts (C0.J), C1.T |
| §1.1 assign `src/lib/admin-post-list-sort.ts:3` to C1.T | §1.1 detours; C1.T file list |
| §1.1 Dashboard `AdminSiteKeyState` at `dashboard-dependencies.hooks.ts:1`, `dashboard-port.hooks.ts:1`, `rules.ts:1` → C5.T, same site-key contract as Security | C0b.J (`contracts/site/site-key.ts`), C5.T, R6.T |
| §1.2 banner message, a11y labels and handles on props | §1.2 `ExternalChangeBanner` `copy` + `classNames` props; C1.J test; C2.T |
| §1.2 move the exact sandbox constant | `react/editor/preview-sandbox.ts` (value verbatim); C2.T repoints the three callers |
| §1.2 preserve Page's key-specific dispatch to Posts and Posts' missing-key fallback; bind dictionaries without sibling imports | `createPageEditorTranslator({ translatePostEditor })` (C3.T); Posts fallback moves with `useWiredPostEditor` (C4.T); C3.T/C4.T tests |
| §1.2 cover `use-template-source.hooks.ts:6` and `TemplateSourceModal.tsx:7` | C1.T (they are `ThemeTier` type imports; v1's `:4,46` and `use-theme-canvas-styling.hooks.ts:5` are `@jini-ai/cms/themes/layout`, already Jini, so no binding is needed) |
| §1.2 bind layout, disabled-theme interpretation, preview hook and reload slot at both editor mounts | C3.T (`isNoTheme`, hook prop, slot; mounts `:222`, `:224`), C4.T (mounts `:241`, `:253`) |
| §1.2 keep theme policy in Tovu incl. Theme Explore home-fallback; bind both Themes mounts `/themes` and `/appearance` | C7.T (`:582`), C6.T (`:592`, `:1291`) |
| §1.3 one publish state and policy owner (P9K ALL-STAY) | §1.2 "No Jini publish module": slots + host-bound hook; v1 C3.J dropped |
| §1.3 public hook's positional `section` → required/optional objects | C6.T |
| §1.3 keep Dashboard, `App`/`App.chrome`, `App.hooks.ts` deep links and WebMCP, `App.session.ts` on the existing stores; all list and module contributions on the same stores; relocation repoints all callers | §1.2 Publish bullets; C5.T, C6.T; relocation rule stated |
| §1.3 test a scoped collection request with both entity types and a live-site request through the shell | C5.T and C6.T tests |
| §1.4 cut the live MediaPicker default and both media extension paths; move live defaults out of source hooks | C8.T; recipe rule §0.4 (no live prop defaults) |
| §1.4 separate Posts/Collections widget-embed binding (`use-post-editor.hooks.ts:27`, `CollectionEntryEditor.tsx:4`) | C9.T |
| §2.1 `CredentialTokenHint` from `@jini-ai/platform` → Core-owned structural hint or type parameter | `contracts/site/credential-token-hint.ts` (O1a.J) + mutual-assignability type test (O1.T) |
| §2.1 preserve optionality/nullability, publish execution mode and verification, separate Git input and snapshot; export-run DTO structural; builders' token behaviour distinct | O1a.J/O1b.J fixtures and mutations; builders stay with owners (§2.2) |
| §2.2 name the real Security → Deployment/Source Control value cuts (`access-token-rows.ts:2–3`, `access-token-providers.ts:3`, `use-access-tokens.hooks.ts:14`) | §2.1 table; O4.T file list |
| §2.2 O2.J owns neutral field help, handle formatting, validation, default promotion | O2.J `@jini-ai/admin/core/credential-form` (exact functions and lines) |
| §2.2 row labels and source-control descriptor policy through the host binding; preserve separate catalog failures and saved rows | `accessTokenPolicy` prop (§2.2); O4.T test (c) |
| §2.2 neutral implementation for the slug formatting of `fieldNameHandleSegment` | `asciiSlug` → `@jini-ai/core/primitives` (O2.J) |
| §2.3 O4.T needs P2.J's MCP and Assistant credential shapes plus Sites/Media/auth contracts; move P2.J ahead; explicit owner for site-key DTO repoints | The Security other-store cuts are now R6.T, which depends on P1b.J, C0b.J and R0.J; O4.T is access tokens only |
| §2.3 O1.J/O2.J as prerequisites of SEC-9–11; one Tovu owner for host bindings; SEC-14/15 consume; `SEC-T1` behind its gates | §2.2 SEC alignment |
| §2.4 earlier desktop input for O5.T and P5.T | O0.T |
| §2.4 O5.T binds Sites API, snapshot hook and translator as well as the transfer slots | O5.T |
| §3.1 reuse the existing Core MCP shape field by field | §3.2 `external-mcp-admin.ts` (comparison result and assignability fixture, P1b.J) |
| §3.1 bind the hint through the structural type from O1.J | `CredentialTokenHint` from O1a.J |
| §3.1 keep endpoint errors, credential adapters, Tovu maturity and admission policy outside Core | §3.2 contracts bullets |
| §3.1 package-file `source` on plugin files, absent on agent-plugin files | P1a.J fixture + mutation |
| §3.1 `AgentPluginSummary` is narrower; keep the Tovu fields callers read | §3.2 `agent-plugin.ts` |
| §3.1 assign Email and Skills importers to R5.T | §4 table and R5.T (type repoint in P1.T, value cuts in R5.T) |
| §3.2 External MCP move buildable at each step: prepare, then switch the Providers mount, repoint, delete together | P2a.T (verbatim re-home + Providers repoint + delete in one commit), P2b.T (inject), P3.T |
| §3.2 record which steps supersede `A-K2-settings-1–4` and `A-K2-providers-1` | §3.2 supersession record (External MCP rows of settings-1/2/3/4; providers-1 has no External MCP row and follows the new props) |
| §3.2 name adapter prerequisites from B3 `T26/27/29` and AdminKit slices | §3.2 (lane prerequisites for `A-K2-integrations-1`) |
| §3.2 `SourceConfigAddForm` gap; kit inputs; host copy incl. `ExternalMcpSettingsPanel.tsx:214`; hooks independent of the Settings ledger | §3.2 lane constraints; P2a.T ledger test |
| v1/§3.2 v1's P3a.J/P3b.J Jini panel work | Moved to the Integrations lane, since the slice has one consumer; the untangle needs no Jini copy |
| §3.3 `use-tovu-execution-policy.hooks.ts` imports Deployment and Settings | P5a.T moves it (and `lib/tovu-execution-policy.ts`) to composition |
| §3.3 `execution-settings.ts:69–71` reaches Assistant and Settings | P0.T (`:71`), P1.T (`:69`), P5b.T (`:70` live adapter) |
| §3.3 `ledger-slice.ts:7` reaches Settings via `settings-tabs.ts` and Sites preferences | P0.T (`settings-api.ts` is shell transport, re-homed under `src/lib/admin-http/`) |
| §3.3 production mount, not optional prop with live fallback, supplies the collaborator | §0.4 recipe rule; P5a.T/P5b.T |
| §4.1 `RestorePointCostClass`, `AdminRestorePointSummary`, gated plan/confirm envelopes → Core predecessor unless compatible | R0.J (the admin/core gated type is a different wire, so a new `gated-mutations/plan.ts`) |
| §4.1 Library's Media shapes, Trash's user identity, Skills' `PackageFilesModalProps` repointed with their value bindings | R0.J (`media-item`, `identity-user`), R1.T, R2a.T, R5.T |
| §4.2 R6 must repoint `panel-pages.ts:27,38–39,42,56` | R8.T |
| §4.2 bind Consent's kit and Media's embed policy (`use-edit-media-panel.hooks.ts:9`) | R8.T |
| §4.2 R4 covers Authentication's lazy mount and the Admin UI → Appearance path | R4.T |
| §4.2 keep both theme runtimes and CSS in Tovu; settings-events preview publisher injected at the shell | §4 theme-runtime table; R4.T |
| Boundary §1 explicit zero-only check for Admin; server keeps non-negative | `check-feature-ranks.mjs --zero` (RZ.T); server path unchanged |
| Boundary §1 run folder validation and cruise from root with `apps/admin/tsconfig.json`; align production exclusions | §5.1 items 2–4 (one exclusion pattern for both) |
| Boundary §1 fixtures: rank `1`, unranked isolated folder, relative/alias, inline and standalone type imports, type queries, re-exports, lazy and side-effect imports, unresolved specifiers | B.T test list |
| Boundary §2 shared-module detour: feature → `lib`/`hooks`/`components` → sibling or binder | `admin-shared-no-feature` + `admin-no-host-import` with baselines; B.T detour fixture |
| Boundary §2 classify binders as host composition; keep feature-facing shared leaves independent | `src/composition/` + host list in §5.1 |
| Boundary §2 Jini: register existing feature roots and `screens/*` | B.J |
| Boundary §2 Jini embed-policy ↔ html-attributes type cycle | B0.J |
| Boundary §3 add the admin gate to the always-running summary (`ci.yml:309`) | §5.1 item 5 |
| Boundary §3 Jini blocking CI alongside the report-only nightly | B.J |
| Boundary §3 B.T depends on C7.T, O1.T, O3.T, O4.T as well as R and B.J; waits for SEC-T1 if Security imports survive O4.T | B.T `Depends on`. R steps now follow B.T (ratchet start = post-loop edges, per owner brief), so B.T no longer waits for R1–R6 |
| Corrected-steps table: C8.T then C9.T | C8.T, C9.T |
| Corrected-steps table: O0.T | O0.T |
| Corrected-steps table: O1.J → P2.J → O4.T | O1a.J → P1b.J → R6.T (O4.T no longer needs MCP shapes) |
| Corrected-steps table: P3a.J/P3b.J | Superseded: Integrations lane (see §3.2) |
| Corrected-steps table: P5a/P5b | P5a.T, P5b.T |
| Corrected-steps table: R2a/R2b | R2a.T, R2b.T |
| Corrected-steps table: B.J prerequisite | B0.J |

**Other v1 changes not raised by the check.**
- **Ratchet start.** v1 started at an empty edge set, which required every R step before the gate. v2 starts at the measured post-loop set (32 pairs) with exact ranks and a strict pair allowlist, then ratchets down to zero with RZ.T. That follows the owner brief: "ratchet start = post-untangle edges".
- **Rank-rule line range.** v1 cited `.dependency-cruiser.mjs:833–875`; the generator runs `:861–877` and the comment block `:833–860`.
- **Composition home.** v1 split the host bindings between `src/integrations/jini-admin/` and `src/panels.tsx`. v2 adds `src/composition/` so that `panels.tsx` (1,314 lines) does not grow and the rule has one host folder to exempt.
- **Missed type sites now included.**
  - `email/hooks/use-email-provider.hooks.ts:3T`
  - `skills/api.ts:3T`
  - `skills/use-skill-files.hooks.ts:5T`
  - `security/hooks/site-key-status.rules.ts:1T`, `use-site-key-recovery.hooks.ts:3T`, `use-site-key.hooks.ts:4T`
  - `security/hooks/use-other-credentials.hooks.ts:5T`
  - `trash/hooks/trash-port.hooks.ts:1T`
  - `library/Library.tsx:8T` and the other Library type sites
  - `src/lib/settings-events.ts:25` (a value import of Themes)
- **New shared-detour inventory.** v1 marked transitive paths NOT-CHECKED. v2 measured them: 63 shared files and 108 sites. The loop-closing ones are assigned to steps (§1.1, §2.1, §3.1); the rest become the shrink-only baseline.

**NOT-CHECKED.**
- Computed specifiers. The scanner reads literals only; the depcruise gate is the authority.
- Exact current line spans of the `default*Port` objects. Each step moves the named object, found by name.
- The exact field list of the Tovu types each core contract absorbs. The J step diffs them while copying, and STOP 4 applies on a behavioural difference.
- Whether `settings-api.types.ts` has feature importers. P0.T checks this with `rg`.
