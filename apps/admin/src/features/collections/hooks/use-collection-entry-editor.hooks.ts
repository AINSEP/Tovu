import { useCallback } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  useCollectionEntryEditor,
  type CollectionEntryEditorController as JiniCollectionEntryEditorController,
  type CollectionEntryEditorDependencies,
} from "@jini-ai/admin/screens/collections/hooks/use-collection-entry-editor.hooks";
import { VERSION_CONFLICT_MESSAGE } from "@jini-ai/admin/shell/lib/version-conflict";
import { WidgetEmbed } from "@/lib/widget-embed-extension";
import { navigate as defaultNavigate } from "@jini-ai/admin/shell/lib/router";
import { slugRedirectPath } from "@jini-ai/admin/shell/lib/slug-redirect-path";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { entryLifecycleFailureMessage, t as translate } from "../collections-i18n";
import { collectionsHostKit, defaultCollectionEntryEditorPort } from "../collections-host-ports";

/**
 * @file This host's binding of `@jini-ai/admin`'s `useCollectionEntryEditor`: the real entry-editor
 * port, `lib/router`'s `navigate`, a `COLLECTIONS_DICT`-bound translator, the collections host kit,
 * the entry lifecycle-failure and version-conflict copy, the shell's slug-redirect rule, and this
 * host's Tiptap body editor.
 */

/** The entry editor's controller with this host's Tiptap `Editor` as its body editor. */
export type CollectionEntryEditorController = JiniCollectionEntryEditorController<Editor>;

/**
 * This host's body editor for a collection entry: StarterKit plus the widget-embed node. `role` is
 * restated for the reason `use-post-editor.hooks.ts`'s own `editorProps.attributes` gives.
 */
export function useCollectionEntryBodyEditor({ ariaLabel }: { ariaLabel: string }, _optional = {}): Editor | null {
  return useEditor({
    extensions: [StarterKit, WidgetEmbed],
    content: "",
    editorProps: { attributes: { role: "textbox", "aria-label": ariaLabel } },
  });
}

/** The host-owned collaborators every `useCollectionEntryEditor` mount here receives. */
export const collectionEntryEditorHostDeps: Pick<
  CollectionEntryEditorDependencies<Editor>,
  "kit" | "entryLifecycleFailureMessage" | "versionConflictMessage" | "slugRedirectPath" | "useBodyEditor"
> = {
  kit: collectionsHostKit,
  entryLifecycleFailureMessage,
  versionConflictMessage: VERSION_CONFLICT_MESSAGE,
  slugRedirectPath,
  useBodyEditor: useCollectionEntryBodyEditor,
};

/**
 * Binds the real `/api/.../content-types`+`/entries` client, `lib/router`'s `navigate`, the
 * resolved `useAdminLocale()` value, and a `COLLECTIONS_DICT`-bound translator — see
 * `collection-entry-editor-dependencies.hooks.ts`. The zero-argument-deps half of the
 * `useX(dependencies)` / `useWiredX()` pair, so `CollectionEntryEditor.tsx` composes this and a
 * test composes {@link useCollectionEntryEditor} with `createFakeCollectionEntryEditorPort`.
 */
export function useWiredCollectionEntryEditor(props: {
  contentTypeKey: string;
  entryId: string | null;
}): CollectionEntryEditorController {
  const locale = useAdminLocale();
  const t = ({ key }: { key: string }, _optional = {}): string => translate({ locale: locale, key: key });
  const navigate = useCallback((routePath: string, options?: { replace?: boolean }) => options === undefined ? defaultNavigate({ routePath }) : defaultNavigate({ routePath }, options), []);
  return useCollectionEntryEditor({ props, port: defaultCollectionEntryEditorPort, navigate, locale, t, ...collectionEntryEditorHostDeps });
}
