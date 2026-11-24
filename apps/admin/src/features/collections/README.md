# features/collections

Custom content types — the three screens behind the sidebar's **Content → Collections** entry.

| file | what it is |
|---|---|
| `CollectionsScreen.tsx` | Host composition of `@jini-ai/admin`'s `Collections` screen (the content-type registry list plus the "New content type" modal, design-spec.md §1, ADR-022/ADR-043): binds the `useWired*` hooks, `ServerLabel`, `PublishSectionButton` and `contentTypeMenuItems`, and imports the native-dialog stylesheet. |
| `CollectionEntriesScreen.tsx` | Host composition of `@jini-ai/admin`'s `CollectionEntries` screen (per-content-type entry list, `/admin/collections/{typeKey}`). |
| `CollectionEntryEditor.tsx` | Per-entry editor, `/admin/collections/{typeKey}/{entryId|new}`. Its own Tiptap wiring, separate from `features/posts`'s (see the file's own header for the disclosed deviation from design-spec.md §1.5). |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Taxonomy** (categories and tags) — a collection entry can reference terms but does not manage
  them.
- **The widget embed extension itself** — `lib/widget-embed-extension`, shared with `features/posts`.

## Notes for anyone editing here

The two list screens' markup lives in `@jini-ai/admin/screens/collections/{Collections,CollectionEntries}`
and is tested there with a fake kit; `__tests__/` here keeps the host-kit dialog behaviour and the
real-hook wiring. `CollectionEntryEditor.tsx` has its own test.

## Wiring

- `collections-host-ports.ts` binds `@jini-ai/admin/screens/collections/api/collections-api`'s
  `createCollectionsApi({ request })` once to `lib/admin-http/request`; every collections caller
  (the `*-dependencies.hooks.ts` live ports, widget config fields, request-shape tests) imports that
  `collectionsApi` singleton.
- `collections-host-ports.ts` also binds the five collections ports (`defaultCollectionsPort`, `defaultCollectionEntriesPort`, `defaultCollectionEntryEditorPort`, `defaultEditFieldsDialogPort`, `defaultNewContentTypeDialogPort`) from `@jini-ai/admin/screens/collections/hooks/*-dependencies.hooks`'s `create*Port({ api: collectionsApi })`; tests use that module's `createFake*Port`s.
- `collections-host-ports.ts` binds `collectionsHostKit` (`collections-i18n`'s `t`, `ApiError`, `describeApiError`, `isVersionConflict`, `@jini-ai/cms/widgets/markers`' `embedMarkerSnippet`, and the one `createDraftRowIdCounter()` both field-list dialogs share as `nextDraftRowId`) and exports the kit-reading rules (`collectionEmbedSnippet`, `emptyField`, `draftFieldsFromContentType`, `addDraftField`, `validateKey`, `validateNewContentTypeDraft`, `describeEditFieldsError`, `lifecycleCopy`, `contentTypeMenuItems`, `visibleEntryEditorError`, …) from `bindCollectionsRules({ kit })`; the pure rules (`KEYS`, draft-field helpers, `isUserCollection`, …) are imported straight from `@jini-ai/admin/screens/collections/rules`.
- `hooks/use-*.hooks.ts` hold only this host's `useWired*` bindings of `@jini-ai/admin/screens/collections/hooks/use-*.hooks` (port, locale, `COLLECTIONS_DICT` translator, `collectionsHostKit`, host copy). `use-collection-entry-editor.hooks.ts` also binds the Tiptap body editor (`useCollectionEntryBodyEditor`: StarterKit + `WidgetEmbed`), `VERSION_CONFLICT_MESSAGE`, `entryLifecycleFailureMessage` and `slugRedirectPath` as `collectionEntryEditorHostDeps`, and narrows the controller to Tiptap's `Editor`.
- `Collections.tsx` mounts `@jini-ai/admin/screens/collections/LifecycleConfirmDialog`, passing `useWiredLifecycleConfirmDialog` (or a test override) as its required `useLifecycleConfirmDialogHook`; `styles.css` / `styles/native-domain-dialogs.css` style its `jini-collections-dialog` shell as twins of the `jini-post-dialog` rules.
- `Collections.tsx` also mounts `@jini-ai/admin/screens/collections/NewContentTypeDialog` and `EditFieldsDialog`, passing `useWiredNewContentTypeDialog` / `useWiredEditFieldsDialog` (or a `dialogHooks` test override) as their required `useNewContentTypeDialogHook` / `useEditFieldsDialogHook`, plus the `collections-i18n` `t`. `styles.css` / `styles/forms.css` carry the twins for every class they emit: `jini-collections-type-dialog` and `jini-collections-field-row` next to `collections-type-dialog` / `collections-field-row`, and `.jini-collections-dialog`-scoped `jini-field`, `jini-field-label`, `jini-form-checkbox-field`, `jini-editor-actions`, `jini-save-error` and `jini-btn-secondary|danger|warning` next to the shared originals.
