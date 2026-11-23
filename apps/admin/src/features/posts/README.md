# features/posts

The Posts list and the Post editor — the two screens behind the sidebar's **Content → Posts** entry.

| file | what it is |
|---|---|
| `Posts.tsx` | List view. `DataTable` + `RowMenu` from `@jini-ai/admin/react`, row actions, delete confirmation. |
| `PostEditor.tsx` | The Tiptap editor. Owns the `WidgetEmbed` node and the unsaved-changes guard (`useDirtyGuard`). |
| `index.ts` | The only surface `panels.tsx` may import. |

## Wiring

- `PostSettingsDialog` comes from `@jini-ai/admin/posts/PostSettingsDialog` (it binds Core's
  `agentHandle` into `PostAuthorFields`/`PostPublishAtField` itself). `hooks/use-post-editor-screen.hooks.ts`
  passes `hooks: { useTabBarKeyboard }` from `@jini-ai/ui/tab-strip`; `PostEditor.tsx` loads
  `styles/native-domain-dialogs.css`; `styles/editor.css` styles `.jini-post-settings-*`.
- `PostUrlDialog` comes from `@jini-ai/admin/posts/PostUrlDialog`; `editor/PostEditorBody.tsx` passes the
  `usePostUrlDialog` controller (structurally a `PostUrlDialogView`) and loads the domain-dialog
  stylesheet plus `@jini-ai/admin/posts/post-url-dialog.css`.
- `editor/header/PostEditorToolbarEnd.tsx` renders `@jini-ai/admin`'s `PostEditorTemplatePicker` and
  binds `components/TemplateSource/ViewTemplateButton` into its required `ViewTemplateButton` prop;
  the shared template-picker CSS selectors list `.jini-editor-template-picker` beside the page
  editor's `.editor-template-picker`.
- `editor/toolbar/Toolbar.tsx` renders `@jini-ai/admin`'s `ToolbarCharacterCount` with its toolbar
  state; `styles.css` styles it by `.jini-post-toolbar__count`.
- `hooks/use-post-editor.hooks.ts` hands `@jini-ai/ui/panel-kit`'s `useSettlementGeneration` to
  `@jini-ai/admin`'s `useExternalEntryRefresh` as a required input (its own counter instance,
  separate from the editor's save settlement).
- `hooks/use-post-editor.hooks.ts` and `hooks/use-post-editor-screen.hooks.ts` bind `@jini-ai/admin/posts/hooks/use-post-editor-ui.hooks`
  (`usePostEditorUi`, `useToolbarOverflow`, `usePostSettingsDialog`) and passes the controllers down
  as props. The overflow hook finds Jini's `ToolbarOverflowMenu` by `[data-toolbar-more]`;
  `styles.css` styles it by `.jini-post-toolbar__more` (phone-width visibility and order).
- `AdminPost`, `PostsListPort` and `PostDeleteConfirmDialog` come from `@jini-ai/admin/posts`;
  `hooks/posts-list-dependencies.hooks.ts` binds this app's request client into `PostsListPort`.

## What this feature does not own

- **Pages.** A separate feature, despite the near-identical list shape. They diverge by design —
  see [ADR-056](../../../../../ADS-memory/reports/architecture/ADR-056-pages-vibecoding.md): posts
  stay Tiptap, pages become AI-generated HTML. Merging the two now would have to be undone.
- **The widget embed extension itself** — `lib/widget-embed-extension`, shared with other editors.
- **Taxonomy** (categories and tags), which a post references but does not manage.

## Notes for anyone editing here

`Posts.tsx` has **no unit test**. `PostEditor.unit.test.tsx` covers the editor only. Treat a change
to the list as unverified until you have driven it in a browser.
