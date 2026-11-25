PLAN r62t-plan-posts PARTIAL: 6 MOVE / 61 STAYS-HOST / 12 sheets

The 12 sheets below are six Jini/Tovu pairs. They cover six whole-source moves, one type-only seam, and one component split whose parent screen stays in Tovu. The other 62 files are **NOT-PLANNED** for Sol. Where marked **OPUS-CLOUD**, leave the production source untouched pending the cloud security pass. In particular, do not execute the planner’s original `X-trash-1` or move its deletion registry verbatim.

Pinned trees are Tovu `caa3ac7811f3ca15afb782ef0c4823f2d2cd5f8f` and Jini `dc2349f5194b8fcc2994e5c50936946f8229fab3`, both at `origin/integ/merge-21-2026-11-24`. I reconciled the 6:20 PM planner with those trees and stopped lookups within budget. No files were changed and no checks were run.

### Execution key

- `W` means `apps/website/src`, `A` means `apps/admin/src`, and `C` means `packages/cms/src` in Jini. Source filenames in each table are relative to its stated root. `—` means the source stays at its current path. A destination on a NOT-PLANNED row is a routing decision, not permission to create the file.
- Do **all `.J` halves first**, in the order below, then the `.T` halves in the same order. Write the characterization tests before the corresponding production edits. Named mutations are temporary cloud verification probes, never committed. Sol does not run tests, builds, installs, type checks, or baseline generators.
- For each new public subpath below, add an explicit `packages/{cms,core}/package.json` `exports` entry with `types: ./dist/<stem>.d.ts` and `import`/`default: ./dist/<stem>.js`. Match the existing `jini.entries` convention and the runtime specified in the sheet. No wildcard, package-root export, new package dependency, or compatibility re-export. Cloud regenerates and reviews `api-baseline/jini-ai__cms.json` and `api-baseline/jini-ai__core.json` with `pnpm api:update`. No `@jini-ai/admin` surface change is required.
- The K1 route work is separate. No Sol sheet changes an Express mount, wire envelope, authorization port, or `RouteDeps` runtime wiring. Keep the existing mounts over the Jini specs where those are already in place. The Page-store sheet changes only a type import in `server/routes/types.ts`. Residual media routes were not assessed for conversion in this feature-side job.

## Post — `W/features/post`

| File | Disposition | Jini destination | Blocking dependency or rationale |
|---|---|---|---|
| `agent-hold.ts` | MOVE P01 | `C/posts/agent-hold.ts` | Existing injected `heldSince` reader |
| `agent-tools.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/agent-tools.ts` | Host guidance and tool names, catalog includes deletion |
| `content-stats-tool.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/content-stats-tool.ts` | Per-entity authorization and refusal mapping |
| `contracts.ts` | NOT-PLANNED · OPUS-CLOUD | Core `contracts/site/soft-delete.ts` if the existing contract fits | Re-export only. Drain `RemovePostFn` and `ForgetRemovedPostFn` to the actual contract owner, not another shell |
| `index.ts` | STAYS-HOST | — | Mixed host barrel over SQLite, tools and search. Remove moved-symbol exports individually |
| `post-create.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/post-create.ts` | Reserved admin/API slugs and transactional release of a trashed row’s slug |
| `post-retire.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/post-retire.ts` | Replacement retires existing content through the removal port |
| `post-schema-binding.ts` | STAYS-HOST | — | Binds the product’s seven tool names to Jini schema factories. A verbatim destination would move host copy |
| `post-tool-delete.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/post-tool-delete.ts` | Delete guard and version check |
| `post-tool-deps.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/post-tool-deps.ts` | Removal/forget ports, template port, HTML-store seam |
| `post-tool-duplicate.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/post-tool-duplicate.ts` | Copy-naming policy and rollback/removal wiring |
| `post-tool-input.ts` | NOT-PLANNED | `C/posts/post-tool-input.ts` | Separate featured-image input ports from the full tool deps bag |
| `post-tool-list.ts` | NOT-PLANNED | `C/posts/post-tool-list.ts` | View policy and tool deps |
| `post-tool-policy.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/post-tool-policy.ts` | Permission and derived-risk catalog |
| `post-tool-update.ts` | NOT-PLANNED | `C/posts/post-tool-update.ts` | Template options, update validation and inverse-write deps |
| `post-tool-view-deps.ts` | STAYS-HOST | — | Binds the host router, runtime mode and live/local/menu copy into `PostToolViewDeps` |
| `post-trash.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/post-trash.ts` | Trash, undo and ledger writes |
| `post-update.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/post-update.ts` | Reserved-path checks and trash guard, plus host `postPublicPath` |
| `preview-tool.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/preview-tool.ts` | Authorization, template choices and diagnostics implementation injection |
| `publish-content.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/publish-content.ts` | Replacement and retirement, plus host publish registry and port extensions |
| `read-model.ts` | NOT-PLANNED | No standalone export | Re-export only. Drain to the owner of `toRecord` after `repo.rows.ts` is split |
| `repo.memory.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/repo.memory.ts` | Contains soft-delete and forget methods. Only its hold-helper import changes in P01 |
| `repo.rows.ts` | NOT-PLANNED | `C/posts/repo.rows.ts` | Replace generated Tovu table types with the exact SQL slice alongside the mapper, not in core |
| `repo.sqlite.ts` | STAYS-HOST | — | Agreed host adapter over its DB and `POST_SEARCH_HOST` |
| `repo.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/repo.ts` | Scoped SQL and removal semantics, host kernel and row schema |
| `reverters.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/reverters.ts` | Undo/restore and transactional effects |
| `search-host-config.ts` | STAYS-HOST | — | `tovu_search` and projection-setting key are persisted host identifiers |
| `search-index.memory.ts` | STAYS-HOST | — | Despite its name, opens and migrates a real Tovu SQLite scratch DB and mirrors rows into it |
| `template-options.ts` | STAYS-HOST | — | Host theme roster, no-theme sentinel and presentation selection |
| `tiptap-doc-schema.ts` | STAYS-HOST | — | Backend JSON schema, not a TipTap runtime import. Its top-level catalog has no existing args seam for the bound tool names |
| `tool-registrations.ts` | NOT-PLANNED · OPUS-CLOUD | `C/posts/tool-registrations.ts` | Authorization, delete/undo, plugin refusal mapping |

**Prerequisite seam.** P01 needs no new core type. Keep `AgentHoldReader.heldSince(required: { workspaceId: string }): Promise<string | null>` and the existing `{ workspaceId, rows, agentHold }` and `_optional = {}` arguments verbatim. The host continues to supply the reader through `InMemoryPostRepo` options and `createSeoPostPort` options. For a later post-tool split, leave `template-options.ts` and `post-tool-view-deps.ts` as host adapters. Do not import either into Jini or consolidate the local/live messages into library defaults.

### P01.J — Jini

- **Characterize first.** Create `C/posts/__tests__/agent-hold.test.ts` using Vitest and `../agent-hold.js`. With a fixed hold timestamp, assert that person-scheduled, unscheduled agent, and agent-at-the-hold rows survive, while an agent strictly after the hold does not. Assert one lookup with the given workspace and original array identity when the reader is absent or returns `null`. **Mutation `HOLD-AT-BOUNDARY`** changes `>` to `>=` and must fail the equality case.
- Create `C/posts/agent-hold.ts` from `W/features/post/agent-hold.ts`. The only import change is `@jini-ai/cms/posts/post` → `./post.js`. No helper or predicate changes. Carry the reason the in-memory predicate mirrors SQL and the distinction between person, earlier agent, and unscheduled rows.
- Export `@jini-ai/cms/posts/agent-hold` as `universal`. No other Jini importer changes.

### P01.T — Tovu

- In `W/features/post/repo.memory.ts`, change `./agent-hold.js` → `@jini-ai/cms/posts/agent-hold`.
- In `W/features/seo/index.ts`, split the `../post/index.js` import. Repoint `withoutHeldAgentSchedule` and `type AgentHoldReader` to `@jini-ai/cms/posts/agent-hold`. Leave `createPublicPostReader` on its existing import.
- In `W/features/post/index.ts`, remove the `./agent-hold.js` export line. Delete `W/features/post/agent-hold.ts`. These are the three code references found by the exact import/symbol search. Keep `go-live.agent-hold.memory.test.ts` and the sitemap coverage in Tovu. No manifest change.

**STOP.** P01 is not a change to the pause gate, hold record, SQL predicate, by-slug route or search behavior. Leave those surfaces unchanged. Do not resume `T-post-1` or `T-post-2` as a batch.

## Admin posts — `A/features/posts`

For this table, `R` means `C/react/posts`. Domain React code goes there, not to the planner’s `packages/admin/src/posts`. Existing Jini admin primitives and the Tovu kit stay where they are.

| File | Disposition | Jini destination | Blocking dependency or rationale |
|---|---|---|---|
| `PostCoverImage.tsx` | MOVE AP01 | `R/PostCoverImage.tsx` | Required picker hook, host dialog, two kit slots and host rules |
| `PostEditor.hooks.ts` | STAYS-HOST | — | TipTap editor chain |
| `PostEditor.tsx` | STAYS-HOST | — | TipTap screen composition, dialog CSS and host bindings |
| `Posts.tsx` | NOT-PLANNED | `R/Posts.tsx` | Host list hook, publish action, site URL, labels and router |
| `index.ts` | STAYS-HOST | — | Existing lazy route entry to host mounts |
| `posts-host-ports.ts` | STAYS-HOST | — | Binds host HTTP and workspace/site config to existing `createPostsApi` |
| `posts-i18n.ts` | STAYS-HOST | — | Binds the existing Jini factory to host dictionary data |
| `rules.ts` | STAYS-HOST | — | Mixed TipTap, host copy and theme rules. AP01 consumes four existing pure functions as ports |
| `editor/PostEditorBody.tsx` | STAYS-HOST | — | Rich-text editor and dialog CSS |
| `editor/PostSavedPanels.tsx` | NOT-PLANNED | `R/editor/PostSavedPanels.tsx` | Kit and host panel collaborators |
| `editor/bubble-menu/BubbleFormattingMenu.tsx` | STAYS-HOST | — | TipTap |
| `editor/bubble-menu/bubble-menu-state.ts` | STAYS-HOST | — | TipTap `Editor` type and live probes, despite planner batch |
| `editor/header/PostEditorActions.tsx` | NOT-PLANNED · OPUS-CLOUD | `R/editor/header/PostEditorActions.tsx` | Publish/save/delete action composition |
| `editor/header/PostEditorHeader.tsx` | NOT-PLANNED | `R/editor/header/PostEditorHeader.tsx` | Host URLs, structural post identity type and kit `Icon` |
| `editor/header/PostEditorToolbarEnd.tsx` | NOT-PLANNED | `R/editor/header/PostEditorToolbarEnd.tsx` | Host theme reload component |
| `editor/notices/PostEditorNotices.tsx` | NOT-PLANNED | `R/editor/notices/PostEditorNotices.tsx` | Autosave and error seams. Only banner import/mount changes in AG01 |
| `editor/notices/PostEditorSlugCollisionWarning.tsx` | MOVE AP01 | `R/editor/notices/PostEditorSlugCollisionWarning.tsx` | Host tri-state mappers, theme-policy copy and agent markup |
| `editor/preview/PostPreview.tsx` | NOT-PLANNED | `R/editor/preview/PostPreview.tsx` | Host frame and device-preview collaborators |
| `editor/preview/PostPreviewFrame.tsx` | STAYS-HOST | — | Host theme-refresh and preview frame |
| `editor/toolbar/Toolbar.tsx` | STAYS-HOST | — | TipTap |
| `editor/toolbar/ToolbarColorGroup.tsx` | STAYS-HOST | — | TipTap chain |
| `editor/toolbar/ToolbarFormattingGroup.tsx` | STAYS-HOST | — | TipTap chain and URL hook |
| `editor/toolbar/ToolbarTypographyGroup.tsx` | STAYS-HOST | — | TipTap chain |
| `editor/toolbar/insert-controls.tsx` | STAYS-HOST | — | TipTap and host embed insertion |
| `editor/toolbar/toolbar-group-props.ts` | STAYS-HOST | — | TipTap `Editor` contract |
| `editor/toolbar/toolbar-state.ts` | STAYS-HOST | — | TipTap probes |
| `editor/view-bar/PostEditorViewBar.tsx` | NOT-PLANNED | `R/editor/view-bar/PostEditorViewBar.tsx` | `TabBar`, toolbar and preview-device injection |
| `hooks/post-editor-dependencies.hooks.ts` | STAYS-HOST | — | Host media, themes, HTTP and autosave bindings |
| `hooks/post-editor-file-upload.ts` | STAYS-HOST | — | TipTap drop and paste |
| `hooks/post-editor-messages.ts` | STAYS-HOST | — | Host `ApiError` and failure-channel binding |
| `hooks/post-editor-port.hooks.ts` | NOT-PLANNED | Core contract for wire-only slice, `R/hooks/` for remaining React port | Host `ThemeTier` and standing draft port need separate ownership |
| `hooks/post-editor-save.rules.ts` | NOT-PLANNED | `R/hooks/post-editor-save.rules.ts` | Shared editor-state and port types |
| `hooks/post-editor-state.rules.ts` | NOT-PLANNED | `R/hooks/post-editor-state.rules.ts` | Host theme types and mixed rich-text rules |
| `hooks/posts-list-dependencies.hooks.ts` | STAYS-HOST | — | Host API and error adapter |
| `hooks/use-loaded-post-apply.hooks.ts` | STAYS-HOST | — | TipTap apply |
| `hooks/use-post-editor-screen.hooks.ts` | STAYS-HOST | — | Host prop composition. AP01 changes two type imports only |
| `hooks/use-post-editor.hooks.ts` | STAYS-HOST | — | TipTap runtime, title extension, host save and theme wiring |
| `hooks/use-post-featured-image.hooks.ts` | MOVE AP01 | `R/hooks/use-post-featured-image.hooks.ts` | Split portable hook from `useWiredPostFeaturedImage` |
| `hooks/use-post-url-dialog.hooks.ts` | STAYS-HOST | — | TipTap YouTube extension, despite planner batch |
| `hooks/use-posts.hooks.ts` | NOT-PLANNED | `R/hooks/use-posts.hooks.ts` | Kit query hooks, host locale/router/refresh and list port |

**Prerequisite seams.** `AdminMedia` is already in `@jini-ai/core/contracts/site/cms-admin-media`. Use it unchanged. For the agent markup function, use this structural type in both moved UI modules and AG01, with type-only imports from `@jini-ai/core/agent-handles`:

```ts
type AgentAttrs = (
  required: { handle: string },
  optional?: AgentHandleOptions,
) => AgentHandleProps;
```

K2 uses precisely `adminKit.components.Icon` and `.InfoTip` from `A/integrations/jini-kits.ts`. The host supplies the slot implementations as props. The CMS component does not import `@jini-ai/admin`, `@jini-ai/ui`, their contexts, or a host stylesheet.

### AP01.J — Jini

- **Characterize first.** Create `R/__tests__/PostCoverImage.test.tsx`, `R/__tests__/use-post-featured-image.test.tsx` and `R/__tests__/PostEditorSlugCollisionWarning.test.tsx`. Supply fake slots, fake URL functions and fake markup attrs. Assert HTML format suppresses the cover, tooltip is outside the checkbox label, choose/clear affect only the selected id, and thumbnail errors fall from rendition → original → unavailable, resetting on a new id. For the collision control assert no warning without a collision, and `"default"`, `"post"`, `"theme"` round-trip to `null`, `true`, `false`. **Mutations `COVER-NO-ORIGINAL-FALLBACK`** keeps using the failed rendition and **`COLLISION-DEFAULT-FALSE`** substitutes `false` for the mapper’s result on `"default"`.
- Create `R/hooks/use-post-featured-image.hooks.ts`. Copy the controller, helpers, and `usePostFeaturedImage`; do not copy `useWiredPostFeaturedImage` or its host imports. Replace both `Pick<MediaPickerPort, "mediaOriginalUrl">` uses with a local structural `{ mediaOriginalUrl: (required: { id: string }, optional?: Record<string, never>) => string }`. Keep `deps.renditionUrl?` with that same callback signature, all state transitions, and the `_options` pad.
- Create `R/PostCoverImage.tsx` from the Tovu component. Remove the host picker/rules/hook imports and direct UI/markup implementations. Add required `bindings: PostCoverImageBindings` and make the existing `useFeaturedImage` prop required, without a default. The hook type is `(required: { value: string | null; onChange: (id: string | null) => void }, optional?: Record<string, never>) => PostFeaturedImageController` from the local hook module. Export the bindings type:

```ts
interface PostCoverImageBindings {
  Icon: ComponentType<{ name: "image"; size: 16; "aria-hidden": "true" }>;
  InfoTip: ComponentType<{ label: string; descriptionId: string; agentHandle: string }>;
  MediaPickerDialog: ComponentType<{
    onSelect: (item: AdminMedia) => void;
    onCancel: () => void;
    accept: readonly string[];
    agentHandle: string;
  }>;
  agentHandle: AgentAttrs;
  showsCoverImageSlot: (
    required: { bodyFormat: "doc" | "html" | undefined },
    optional?: Record<string, never>,
  ) => boolean;
  showsHideCoverInBodyToggle: (
    required: { kind: "post" | "page" },
    optional?: Record<string, never>,
  ) => boolean;
}
```

- In that component, call `useFeaturedImage` before the existing format guard. Use the injected bindings where their old names were used. Pass `agentHandle` into `PostCoverPreview` and both `agentHandle` and `InfoTip` into `PostCoverBodyToggle`. Replace `ReturnType<typeof useWiredPostFeaturedImage>` with `PostFeaturedImageController`. Keep the JSX, attribute names and CSS classes. Carry the placement rationale, the body-toggle origin, the rendition size/fallback rationale and the tooltip sibling rationale.
- Create `R/editor/notices/PostEditorSlugCollisionWarning.tsx` from the host source. Keep the existing props and add required `agentHandle: AgentAttrs`, `overridesThemePageSelectValue: (required: { overridesThemePage: boolean | null }, optional?: Record<string, never>) => "default" | "post" | "theme"`, `overridesThemePageFromSelectValue: (required: { value: string }, optional?: Record<string, never>) => boolean | null`, and `copy`. Use `copy: { warning: string; field: string; defaultOption: string; postOption: string; themeOption: string; regionAgentLabel: string; fieldAgentLabel: string }`. These replace the body paragraph, select label, three option labels, region agent label, and field agent label respectively. Keep `t` at the same five visible text uses. Keep native `<select>`, sentinel values, handles, and the reason `null` differs from explicit `true`.
- Add the three direct `@jini-ai/cms/react/posts/...` subpaths, each `browser`. For these entries use the same `jini.isolation.forbidden` list as `./react/media`, which permits React but excludes Node, Express, Kysely and parse5. Add `src/react/posts` as the `posts` isolation domain if not already mapped, or extend that domain with this path if it exists. Do not loosen the shared browser policy.

### AP01.T — Tovu

- Create `A/features/posts/hooks/post-cover-host.hooks.ts`. Move the existing `useWiredPostFeaturedImage` here, preserving its body and `_options` pad. Import the underlying hook and controller from `@jini-ai/cms/react/posts/hooks/use-post-featured-image.hooks`. Use the same `defaultMediaPickerPort` and `defaultFeaturedImageRenditionUrl` imports as before. Export `postCoverBindings` with the two slots from `adminKit.components`, host `MediaPickerDialog`, core `agentHandle`, and the two functions from `../rules`, checked with `satisfies PostCoverImageBindings`.
- In `A/features/posts/PostEditor.tsx`, repoint `./PostCoverImage` to `@jini-ai/cms/react/posts/PostCoverImage` and `./editor/notices/PostEditorSlugCollisionWarning` to `@jini-ai/cms/react/posts/editor/notices/PostEditorSlugCollisionWarning`. At the cover mount add `bindings={postCoverBindings}` and `useFeaturedImage={useWiredPostFeaturedImage}` after the spread. For the collision mount, bind the two mapper functions from `./rules`, core `agentHandle`, and the seven original strings copied verbatim from the old collision component into a module-local `slugCollisionBindings` object. Spread it after `screen.slugCollision`. Keep host CSS imports.
- In `A/features/posts/hooks/use-post-editor-screen.hooks.ts`, repoint the two corresponding type imports to those same subpaths. Change the `cover` type to `Omit<ComponentProps<typeof PostCoverImage>, "bindings" | "useFeaturedImage">` and `slugCollision` to `Omit<ComponentProps<typeof PostEditorSlugCollisionWarning>, "agentHandle" | "overridesThemePageSelectValue" | "overridesThemePageFromSelectValue" | "copy">`. Keep both prop bundles unchanged.
- In `A/features/posts/__tests__/post-cover-image.unit.test.tsx`, repoint `../hooks/use-post-featured-image.hooks` and `../PostCoverImage` to the Jini hook and component respectively. Add `bindings={postCoverBindings}` to every cover render and rerender via the host binding module. Retain the existing fake hook overrides and keep the test in Tovu, since it also drives the real editor. In `post-schedule-featured.unit.test.tsx`, repoint only the hook import. Keep `PostEditor.dom.characterization.unit.test.tsx` and its snapshot unchanged.
- Delete the old `PostCoverImage.tsx`, `hooks/use-post-featured-image.hooks.ts` and `editor/notices/PostEditorSlugCollisionWarning.tsx`. The importer list above covers direct value and type imports. No Tovu manifest change.

**STOP.** If the physical CMS browser subpaths would require a manifest dependency on admin or UI, a TipTap import, a class rename, or a snapshot update, stop AP01. A binding type or package-resolution failure is not permission to add a cast, a fallback hook, or a compatibility export.

## Pages server — `W/features/pages`

| File | Disposition | Jini destination | Blocking dependency or rationale |
|---|---|---|---|
| `agent-tools.ts` | NOT-PLANNED · OPUS-CLOUD | `C/pages/agent-tools.ts` | Raw-HTML capability catalog, host guidance and seed contract |
| `html-document-store.memory.ts` | NOT-PLANNED · OPUS-CLOUD | `C/pages/html-document-store.memory.ts` | Version/live guards, one-way conversion parity, shared error identity and host warning sink |
| `html-document-store.sqlite.ts` | STAYS-HOST | — | Thin binding of Tovu `ContentDb`/`ContentKernel`; not a portable SQL implementation |
| `html-document-store.ts` | NOT-PLANNED · OPUS-CLOUD | `C/pages/html-document-store.ts` | Generated schema, SQL CAS, one-way conversion and revision transaction. PG01 takes only the driver-free contracts |
| `index.ts` | STAYS-HOST | — | Host store, skeleton and permission surface. Remove only the moved type re-exports |
| `permissions.ts` | STAYS-HOST · OPUS-CLOUD | — | Host boot-time grants for `pages.edit_html`, not a type-only identity dependency |
| `skeleton.ts` | STAYS-HOST | — | Starter content, contact URL and shipped theme tokens. Already passed as `defaultPageSkeleton` in runtime module `pages.ts` |
| `tool-registrations.ts` | NOT-PLANNED · OPUS-CLOUD | `C/pages/tool-registrations.ts` | Raw HTML authorization, active theme, validation and Vibecoding implementation |

**Prerequisite seam.** PG01 owns the exact scoped store types. Tovu continues to construct SQL in `server/runtime/composition/site-deps/route-deps-content-chat.ts` and `peer-site-reads.ts`, and memory in `server/runtime/composition/memory-deps/route-deps/trash-and-content.ts`. Both still pass their existing factories. Later K5 work must supply the host warning reporter through the store’s existing deps object as the `EntryRefsReport` callback, and preserve the separate existing optional `validatePluginEmbeds` port. That runtime work is not part of PG01.

### PG01.J — Jini

- **Characterize first.** Add `packages/core/src/contracts/site/__tests__/page-html-store.typecheck.ts` with a conforming fake factory, a consumer that expects `capturedVersion(): number | null`, and negative `@ts-expect-error` probes for a missing `workspaceId` and a factory result without `capturedVersion`. **Mutation `PAGE-SCOPE-WORKSPACE-OPTIONAL`** makes the missing-workspace negative probe cease to fail at its call site. Cloud must see the resulting unused directive.
- Create `packages/core/src/contracts/site/page-html-store.ts`. Move the four declarations below, including their why-comments, from the Tovu declarations identified in PG01.T. Import only `PostKind` from `./post-kind.js`. In particular, carry the reason the latest read version and the CAS basis must be the same, why the store instance is scoped, and why actor id remains optional.

```ts
export interface PluginEmbedDiagnostic {
  readonly code: string;
  readonly message: string;
}
export interface PagesHtmlDocumentStoreScope {
  workspaceId: string;
  postId: string;
  actorId?: string;
}
export interface PagesHtmlDocumentStorePort {
  embedWarnings?(): readonly PluginEmbedDiagnostic[];
  ensureHtmlFormat(
    required: { seedHtml: string; expectedVersion?: number },
    optional?: Record<string, never>,
  ): Promise<void>;
  read(): Promise<string>;
  write(required: { html: string }, optional?: Record<string, never>): Promise<void>;
  capturedVersion(): number | null;
}
export type PagesHtmlDocumentStoreFactory = (
  scope: PagesHtmlDocumentStoreScope,
  options?: { allowedKinds?: ReadonlySet<PostKind> },
) => PagesHtmlDocumentStorePort;
```

- Export `@jini-ai/core/contracts/site/page-html-store` as `universal`. Do not move errors, `PagesHtmlDocumentStoreDeps`, Kysely types, widget reporters, or the SQL class. No production Jini importer changes.

### PG01.T — Tovu

For each moved type use `import type` from `@jini-ai/core/contracts/site/page-html-store`. Leave neighboring value imports at their original paths.

| File | Exact change |
|---|---|
| `W/features/agent-plugins/exports/diagnostics.ts` | Remove original `PluginEmbedDiagnostic` declaration, import the core type for local use |
| `W/features/agent-plugins/exports/runtime.ts` | Split `PluginEmbedDiagnostic` out of `./diagnostics.js` |
| `W/features/pages/html-document-store.ts` | Remove the three moved store declarations. Replace diagnostics import and import scope/port from core. Keep `PagesHtmlDocumentStoreDeps` and error classes here |
| `W/features/pages/html-document-store.memory.ts` | Move `PluginEmbedDiagnostic` off `../agent-plugins/exports/diagnostics.js` and `PagesHtmlDocumentStoreScope` off `./html-document-store.js`. Keep local deps and error imports |
| `W/features/pages/html-document-store.sqlite.ts` | Move local `PagesHtmlDocumentStoreScope` import to core. Remove scope/port/factory re-exports. Keep local deps and class/error exports |
| `W/features/pages/index.ts` | Delete the three moved type re-exports, leaving existing values and host deps |
| `W/features/pages/tool-registrations.ts` | Split factory/port types from the local import. Replace inline `import("./html-document-store.js").PagesHtmlDocumentStorePort` in `embedWarningMessages` with the imported type |
| `W/features/pages/__tests__/html-document-store.noop-save.test.ts` | Split port type from `../html-document-store.js` |
| `W/features/pages/__tests__/tool-registrations.test.ts` | Split port type from `../html-document-store.sqlite.js` |
| `W/features/email-templates/operations.ts` and `__tests__/operations.test.ts` beside it | Split factory type from their respective Pages barrel imports |
| `W/server/routes/types.ts` | Repoint factory type from `../../features/pages/index.js` |
| `W/server/__tests__/routes/pages-update-html-auth.test.ts` | Split port type from `#src/features/pages/index`. No assertion or authorization change |

No whole source deletion and no Tovu manifest change. Use the existing no-op, lost-update, go-live, and HTML-auth suites for runtime characterization. In the cloud, **`PAGE-STALE-NOOP-ACCEPTED`** should fail the existing stale-identical-save characterization. Do not commit that runtime mutation.

**STOP.** Stop if the split requires moving or duplicating an error class, changes constructor/factory arguments, or lets a route see a DB handle. Cloud must settle how the SQL slice and shared errors move before either store implementation can go. Keep transactional revision/outbox ordering and the characterizations for pre-conversion snapshots, concurrent writes, and kind/workspace isolation.

## Admin pages — `A/features/pages`

`Q` means `C/react/pages`. The existing `@jini-ai/admin/pages/Pages` primitive is already Jini-owned. The Tovu `Pages.tsx` binds it to local URLs, labels, actions, and the theme tab.

| File | Disposition | Jini destination | Blocking dependency or rationale |
|---|---|---|---|
| `PageEditor.tsx` | STAYS-HOST · split AG01 | `Q/PageExternalChangeBanner.tsx` only | Theme refresh, editor surface and host taxonomy/template bindings |
| `Pages.tsx` | STAYS-HOST | — | Existing host composition around Jini `Pages` |
| `ThemePageDetailsModal.tsx` | STAYS-HOST | — | Theme details and host publish policy |
| `ThemePagesTab.tsx` | STAYS-HOST | — | Theme screen and Tovu CSS |
| `api/pages-api.ts` | STAYS-HOST | — | Binds Jini API factory to host request and workspace |
| `hooks/page-editor-dependencies.hooks.ts` | STAYS-HOST | — | Host ways to fetch, publish and autosave |
| `hooks/page-editor-port.hooks.ts` | NOT-PLANNED | Core wire slice, remaining port in `Q/hooks/` | `ThemeTier`, autosave and current host port types |
| `hooks/page-editor-save.ts` | NOT-PLANNED | `Q/hooks/page-editor-save.ts` | Host 409 classifier, editor port and partial-save behavior |
| `hooks/page-editor-wiring.hooks.ts` | STAYS-HOST | — | Binds HTML editor/marker collaborators and logger to existing Jini hooks |
| `hooks/pages-dependencies.hooks.ts` | STAYS-HOST | — | Host post/pages clients and request classification |
| `hooks/theme-canvas-dependencies.hooks.ts` | STAYS-HOST | — | Agreed host adapter |
| `hooks/theme-pages-dependencies.hooks.ts` | STAYS-HOST | — | Host Themes API adapter |
| `hooks/use-page-editor.hooks.ts` | NOT-PLANNED | `Q/hooks/use-page-editor.hooks.ts` | Query/HTML-editor/autosave collaborators and explicit required hook props |
| `hooks/use-pages.hooks.ts` | STAYS-HOST | — | Binding of locale, host refresh events and list ports |
| `hooks/use-theme-canvas-styling.hooks.ts` | STAYS-HOST | — | Host Theme Studio URLs, token CSS and shell templates |
| `hooks/use-theme-pages.hooks.ts` | STAYS-HOST | — | Host wrapper over existing Jini hook |
| `index.ts` | STAYS-HOST | — | Existing host lazy route entry |
| `lib/theme-page-publish-state.ts` | STAYS-HOST | — | Theme Studio paths and product collision/home fallback policy, despite planner batch |
| `page-editor-i18n.ts` | STAYS-HOST | — | Host common and posts dictionary bindings |
| `rules.ts` | STAYS-HOST | — | Host routing, theme canvas policy and wired list labels |

**Prerequisite seam.** AG01 is a native notice and two native buttons, so no kit slot is needed. Inject `AgentAttrs` as above. Keep the existing translator prop and inject `copy: { messageKey: string; regionAgentLabel: string; loadLatestAgentLabel: string; keepEditsAgentLabel: string }`. No new hook.

### AG01.J — Jini

- **Characterize first.** Add `Q/__tests__/PageExternalChangeBanner.test.tsx` with a fake translator and markup function. Assert the supplied message key reaches the translator, both callbacks are independent, and all three existing handles appear. **Mutation `EXTERNAL-CHANGE-SWAPPED-ACTIONS`** connects “Keep my edits” to `onLoadLatest` and must fail the callback assertions.
- Create `Q/PageExternalChangeBanner.tsx` from the `PageExternalChangeBanner` declaration and its leading why-comment in `A/features/pages/PageEditor.tsx`. Keep JSX and attributes. Replace the direct markup implementation with the required `agentHandle` prop, the constant used in `t(...)` with `copy.messageKey`, and the three agent labels with their copy fields. Keep `"Load latest"` and `"Keep my edits"` as the original translation keys. Carry the difference between a background change and a failed manual Save, including why dirty Interactive edits cannot be silently replaced.
- Export `@jini-ai/cms/react/pages/PageExternalChangeBanner` as `browser`. Use the same per-entry React isolation list as AP01 and map `src/react/pages` to `pages` without relaxing global rules. There is no other Jini importer.

### AG01.T — Tovu

- Create `A/features/pages/page-external-change-bindings.ts`. Bind `agentHandle` from `@jini-ai/core/agent-handles` and export `pageExternalChangeBindings` containing that function and `copy`. Use the existing `PAGE_EXTERNAL_CHANGE_MESSAGE` from `@jini-ai/admin/pages/page-editor-rules` and copy the three current agent labels verbatim from the extracted declaration. This module supplies props, not a component or re-export.
- In `A/features/pages/PageEditor.tsx`, remove the extracted declaration/comment and remove only `PAGE_EXTERNAL_CHANGE_MESSAGE` from its existing rule import. Import the Jini banner and the host bindings. At its existing mount, spread the bindings without changing either callback or render condition.
- In `A/features/posts/editor/notices/PostEditorNotices.tsx`, change the `PageExternalChangeBanner` import from `../../../pages/PageEditor` to `@jini-ai/cms/react/pages/PageExternalChangeBanner`. Import bindings from `../../../pages/page-external-change-bindings` and spread them at the existing mount. Preserve the `void loadExternalChange()` wrapper. These are the two observed mounts. No other `PageEditor` importer changes, no file deletion, and no manifest change.

**STOP.** If extracting the banner changes draft reload/dismiss behavior, tap targets, handles, or the Interactive refresh condition, leave the component in the host. Do not move the sibling theme publish helper as part of AG01.

## Trash — `W/features/trash`

| File | Disposition | Jini destination | Blocking dependency or rationale |
|---|---|---|---|
| `adapters/comment.ts` | STAYS-HOST · OPUS-CLOUD | — | Agreed host adapter and delete policy |
| `adapters/media.ts` | NOT-PLANNED · OPUS-CLOUD | `C/trash/site/adapters/media.ts` | Marker store and media reference blocker |
| `adapters/member.ts` | NOT-PLANNED · OPUS-CLOUD | `C/trash/site/adapters/member.ts` | Member deletion using `TrashDb` |
| `adapters/post.ts` | NOT-PLANNED · OPUS-CLOUD | `C/trash/site/adapters/post.ts` | SQL marker removal and `@jini-ai/db/kernel` dependency |
| `adapters/redirect.ts` | NOT-PLANNED · OPUS-CLOUD | `C/trash/site/adapters/redirect.ts` | Host redirect table vocabulary and purge |
| `adapters/user.ts` | NOT-PLANNED · OPUS-CLOUD | `C/trash/site/adapters/user.ts` | User purge, event cleanup and kernel |
| `agent-delete-policy.ts` | STAYS-HOST · OPUS-CLOUD | — | Host tool-id exception policy |
| `db-port.ts` | NOT-PLANNED · OPUS-CLOUD | `C/trash/site/db-port.ts` only if a local structural type is necessary | `TrashDb` is currently just a host `ContentKernel` alias, not a reusable core contract |
| `index.ts` | STAYS-HOST · OPUS-CLOUD | — | Agreed host composition and redacted rollback reporting |
| `move-to-trash.ts` | NOT-PLANNED · OPUS-CLOUD | `C/trash/site/move-to-trash.ts` | Per-kind authorization and write composition |
| `permissions.ts` | STAYS-HOST · OPUS-CLOUD | — | Host per-entity permission map |
| `registry.ts` | NOT-PLANNED · OPUS-CLOUD | No verbatim destination | Planner’s `C/trash/site/registry.ts` would move Tovu’s concrete cascade/retention policy. Jini already owns the registry vocabulary |
| `repo.sqlite.ts` | STAYS-HOST · OPUS-CLOUD | — | Concrete DB and transaction binding over existing Jini Trash SQL |
| `tool-kinds.ts` | NOT-PLANNED · OPUS-CLOUD | `C/trash/site/tool-kinds.ts` | Derivation from host permissions and entity vocabulary |
| `tool-registrations.ts` | NOT-PLANNED · OPUS-CLOUD | `C/trash/site/tool-registrations.ts` | Authorization, mutation dispatch and metadata |
| `trash-item-tool.ts` | NOT-PLANNED · OPUS-CLOUD | `C/trash/site/trash-item-tool.ts`, only after comparing with existing `C/trash/trash-item-tool.ts` | Host delegates, policy and removal ports. Do not overwrite the existing module |

**Prerequisite seam and STOP.** No Sol sheet. Preserve the existing core `cms-trash` wire types and Jini `trash/site/ports` removal contract. The cloud should separate host policy from generic transaction/marker operations before deciding whether any additional port is needed. Keep Tovu’s `not-trashed.test.ts` and the existing per-kind, restore and purge tests. Characterize missing-marker refusal, blocked purge, and transaction rollback before moving anything. A cloud mutation that reports success for an unmarked item must fail the missing-marker case. Carry the financial-record retention and rollback-reporting reasons. No registry export, adapter copy, test deletion, or auth/marker change is authorized by this plan.

## Media server — `W/features/media`

| File | Disposition | Jini destination | Blocking dependency or rationale |
|---|---|---|---|
| `index.ts` | STAYS-HOST | — | Mixed host barrel with credential and attachment bindings. No new exports through it |
| `large-upload-routing.ts` | MOVE M01 | `C/media/site/large-upload-routing.ts` | Product tool-routing sentence stays in Tovu |
| `library-save-attachment.ts` | NOT-PLANNED · OPUS-CLOUD | `C/media/site/library-save-attachment.ts` | Human confirmation and attachment access |
| `media-provider-credential-repo.ts` | NOT-PLANNED · OPUS-CLOUD | `C/media/site/media-provider-credential-repo.ts` only for a portable repository residual | Host kernel/schema, credential store operations |
| `promote-chat-attachment.ts` | NOT-PLANNED · OPUS-CLOUD | `C/media/site/promote-chat-attachment.ts` | Daemon ownership/claim failure classification and delegated upload gate |
| `provider-credential-store.memory.ts` | NOT-PLANNED · OPUS-CLOUD | `C/media/site/provider-credential-store.memory.ts` | Credential-store behavior and platform/DB implementation edges |
| `provider-credential-store.ts` | NOT-PLANNED · OPUS-CLOUD | CMS consumer at `C/media/site/`, sealer/keyring owned by Jini integrations `secrets/` | Planner’s CMS-only placement is not ownership of the secret implementation |
| `provider-credential-vault.ts` | NOT-PLANNED · OPUS-CLOUD | Jini integrations `secrets/` only for neutral machinery | Host vault kinds, injected keyring and existing credential wire formats |
| `public-urls.ts` | STAYS-HOST | — | Agreed host URL binding. Jini already has `C/media/site/public-urls.ts` |
| `publish-content.ts` | NOT-PLANNED · OPUS-CLOUD | `C/media/site/publish-content.ts` | Host registry and overwrite/rollback. M02 edits only the verification call |
| `read-chat-attachment.ts` | NOT-PLANNED · OPUS-CLOUD | `C/media/site/read-chat-attachment.ts` if the cloud retains the CMS owner | Owner/containment/integrity checks and daemon implementation edge |
| `tool-registrations.ts` | NOT-PLANNED · OPUS-CLOUD | `C/media/site/tool-registrations.ts` | Host URL policy, upload and deletion registration. M01 edits only the annotation call |
| `verify-published-media.ts` | MOVE M02 | `C/media/site/verify-published-media.ts` | Existing `MediaPublishPorts`, injected fallback policy and relative CMS imports |
| `view-video-tool.ts` | NOT-PLANNED · OPUS-CLOUD | `C/media/site/view-video-tool.ts` | Owner-only attachment read, authorization and daemon message preparation |

**Prerequisite seams.** M01 takes `{ registration: ToolRegistration; routingText: string }` and the existing `_optional = {}` pad. The Tovu registration mapper supplies the unchanged text. M02 takes existing CMS `MediaPublishPorts` rather than `TovuPublishPorts["media"]`. The receiving publish host already supplies that media slice. Add this required collaborator to M02’s first args object:

```ts
type VerifyFallback = <T>(
  required: { work: () => T | PromiseLike<T>; fallback: T; step: string },
  optional?: Record<string, never>,
) => Promise<T>;
```

Tovu passes its existing core `orFallback` implementation without an observer. Jini CMS imports no cross-package implementation for this seam. The batched type lookup stays outside the fallback boundary, as in the source.

### M01.J — Jini

- **Characterize first.** Add `C/media/site/__tests__/large-upload-routing.test.ts`. Verify that only `media_upload_asset` appends the injected text, that original descriptor fields and handler identity survive, and that another registration is returned by identity. Cover empty original description without a leading space. **Mutation `UPLOAD-ANNOTATE-EVERY-TOOL`** removes the tool-id predicate.
- Create `C/media/site/large-upload-routing.ts` from the current `withLargeUploadRouting` and its upload tool id. Change the function to `withLargeUploadRouting({ registration, routingText }: { registration: ToolRegistration; routingText: string }, _optional: Record<string, never> = {}): ToolRegistration`. Substitute `routingText` for `LARGE_UPLOAD_ROUTING` in the join. Keep `ToolRegistration` type-only and the `filter(Boolean).join(" ")` logic. No product copy, local tool name, upload limit or byte-routing logic in Jini. Carry the general reason inline uploads need an alternate-path annotation.
- Export `@jini-ai/cms/media/site/large-upload-routing` as `universal`. No other Jini importer changes.

### M01.T — Tovu

- Create `W/features/media/large-upload-routing-copy.ts` with `LARGE_UPLOAD_ROUTING`, `LOCAL_IMPORT_TOOL_ID`, and the existing `MAX_DOCUMENT_BYTES as TOVU_MAX_UPLOAD_BYTES` import. Copy the sentence without edits, including the exact tool names and cap derivation. Keep the A212 why-comment here, including why the browser/agent transfer cap is different from the server cap.
- In `W/features/media/tool-registrations.ts`, repoint the helper from `./large-upload-routing.js` to `@jini-ai/cms/media/site/large-upload-routing`, import `LARGE_UPLOAD_ROUTING` from `./large-upload-routing-copy.js`, and change the existing mapper call to `withLargeUploadRouting({ registration, routingText: LARGE_UPLOAD_ROUTING })`. Do not touch any registration, permission or handler.
- In `W/features/media/__tests__/large-upload-routing.test.ts`, split the old import the same way and convert both calls to object args. Keep the real host-copy/cap assertions. Delete `W/features/media/large-upload-routing.ts`. These are the two observed importers. No Tovu manifest change.

### M02.J — Jini

- **Characterize first.** Add `C/media/site/__tests__/verify-published-media.test.ts` with scoped in-memory stores and an injected fallback fake. Cover missing type → sniff and persist, failed repair → statement plus next-item check, inactive row → no blob access, and referenced poster absent → warning. Pin that a failure of the batched `getMany` still rejects. **Mutation `VERIFY-SKIP-POSTER-REFS`** bypasses `collectMediaUrlKeys` and must miss the missing-poster warning.
- Create `C/media/site/verify-published-media.ts`. Replace the host ports import with `import type { MediaPublishPorts } from "../publish-ports.js"` and alias `MediaPorts = MediaPublishPorts`. Repoint `collectMediaUrlKeys` to `../../publish/content/media-references.js`, `PackedEntity` to `../../publish/transfer/index.js`, `computeBlobStorageKey` to `../blob-key.js`, `findMediaByIdOrSlug` to `../media-service.js`, and `sniffContentType` to `../content-type-sniffer.js`. Do not use the broad media barrel in this file.
- Add `orFallback: VerifyFallback` to the existing first args objects of `verifyPublishedMedia`, `verifyOne`, and `repairContentType`. In `repairContentType`, wrap the existing read/sniff/set and `return true` as `work` with `fallback: false` and `step: "verify-published-media.repair-content-type"`. In the existing entity loop, push the result of `await orFallback({ work: () => verifyOne({ ports, workspaceId, entity, recordedTypes, orFallback }), fallback: [<the exact existing per-item catch message>], step: "verify-published-media.verify-item" }, {})`. Do not wrap the loop or `getMany` as a whole. Pass the same port onward in `verifyOne`. Preserve copy, ordering and `_optional` pads. This replaces two existing catch sites without transferring `catch-reads-error` debt.
- Carry the missing-type/rendering failure and poster-reference rationale, the receiving-site timing, and why verification avoids decoding renditions. Export `@jini-ai/cms/media/site/verify-published-media` as `node`, because `media-service.ts` already uses Node crypto. The reused media-reference helper is already a shared file in the CMS isolation manifest.

### M02.T — Tovu

- In `W/features/media/publish-content.ts`, replace `./verify-published-media.js` with `@jini-ai/cms/media/site/verify-published-media`. Import `orFallback` from `@jini-ai/core/errors/idioms`, and pass it in the existing `verifyApplied` call as `{ ports: p, workspaceId: deps.workspaceId, entities, orFallback }`. Keep the absent-slice `[]` behavior and all apply/overwrite logic.
- In `W/features/media/__tests__/verify-published-media.test.ts`, change `../verify-published-media.js` to the same Jini subpath. Replace the type-only `TovuPublishPorts` import and `NonNullable<TovuPublishPorts["media"]>` fixture annotation with `MediaPublishPorts` from `@jini-ai/cms/media/publish-ports`. Import `orFallback` from the core idioms subpath and add it to each existing invocation. Do not rewrite the simulated I/O faults.
- Delete `W/features/media/verify-published-media.ts`. Remove only its `catch-reads-error` row in `development/scripts/error-gate-debt.json` and only its stale `→ apps/website/src/features/publish-content/type-registry.ts` edge in `development/scripts/check-architecture.baseline.json`. No Tovu manifest change.

**STOP.** If M01 needs an upload-policy change, or M02 needs a change to what is repaired, surfaced, or propagated, do not merge that change into these moves. Leave attachment ownership, confirmation, credentials, vault, redaction, purge and overwrite to OPUS-CLOUD.

### Final handoff gates

Stop an individual pair on an unexpected importer, conflicting Jini destination, changed wire or DOM contract, a new cross-package implementation edge, an unresolved manifest/isolation check, or a function exceeding 80 lines or complexity 10. Do not proceed by adding a shell, exemption, or guessed adapter. Report the file, symbol, and unresolved edge. Unrelated pairs can proceed.

Cloud runs the characterization suites and named mutations, then runs the repository checks and refreshes the two API baselines before the Tovu cutover is accepted. A successful linked check must resolve the new subpaths from the **new Jini artifact**, not from an older registry install. No NOT-PLANNED row is mechanically implied by a passing Sol pair.
