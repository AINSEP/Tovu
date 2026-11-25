import { EditorContent, type Editor } from "@tiptap/react";
import { agentHandle } from "@jini-ai/core/agent-handles";
import { CollectionEntryEditor as CmsCollectionEntryEditor } from "@jini-ai/cms/react/collections/CollectionEntryEditor";
import { WidgetEmbedInsertControl } from "../../lib/widget-embed-extension";
import { useWiredCollectionEntryEditor } from "./hooks/use-collection-entry-editor.hooks";
import { ServerLabel } from "@/components/status-labels";
import { TermPicker } from "@jini-ai/admin/screens/taxonomy/TermPicker";
import { useTermListReveal } from "@jini-ai/admin/screens/taxonomy/hooks/use-term-list-reveal.hooks";
import { SuggestInput } from "@jini-ai/ui/admin-widgets";
import { useWiredTermPicker } from "../taxonomy/taxonomy-wired.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translate } from "./collections-i18n";
import { useJsonFieldControl } from "@jini-ai/admin/screens/collections/hooks/use-json-field-control.hooks";

const EXT_SITE_PATH = ["ext", "site"] as const;

/** Reads `fieldsJson.ext.site.{name}` defensively — the JSON shape is server-validated, not
 * client-typed, so this never assumes a key is present. */
function readExtSiteField({ fieldsJson, name }: { fieldsJson: unknown; name: string }, _optional = {}): unknown {
  if (typeof fieldsJson !== "object" || fieldsJson === null) return undefined;
  const ext = (fieldsJson as Record<string, unknown>)[EXT_SITE_PATH[0]];
  if (typeof ext !== "object" || ext === null) return undefined;
  const site = (ext as Record<string, unknown>)[EXT_SITE_PATH[1]];
  if (typeof site !== "object" || site === null) return undefined;
  return (site as Record<string, unknown>)[name];
}

function BodyEditor({ editor }: { editor: Editor | null }) {
  const locale = useAdminLocale();
  const t = ({ key }: { key: string }) => translate({ locale, key });
  return <>
        <div className="editor-toolbar" role="toolbar" aria-label={t({ key: "Formatting" })}>
          <div className="grp">
            <WidgetEmbedInsertControl editor={editor} agentHandle="entry-insert-widget" />
          </div>
        </div>
        {/* `role: "field"`, not `region`: this is a TipTap `contenteditable`, which the page driver
            treats as a fillable rich-text surface (see its `isEditableRegion`) — same convention
            `PostEditor.tsx`'s own `post-body` handle documents. */}
        <div
          className="editor-body"
          {...agentHandle({ handle: "entry-body" }, { role: "field", label: "This entry's rich-text body content" })}
        >
          <EditorContent editor={editor as Editor} />
        </div>
  </>;
}

function EntryTerms({ contentType, contentId }: { contentType: string; contentId: string }) {
  return <TermPicker contentType={contentType} contentId={contentId} useTermPickerHook={useWiredTermPicker} useTermListRevealHook={useTermListReveal} SuggestInput={SuggestInput} />;
}

export function CollectionEntryEditor({
  useCollectionEntryEditorHook = useWiredCollectionEntryEditor,
  useJsonFieldControlHook = useJsonFieldControl,
  ...props
}: {
  contentTypeKey: string;
  entryId: string | null;
  useCollectionEntryEditorHook?: typeof useWiredCollectionEntryEditor;
  useJsonFieldControlHook?: typeof useJsonFieldControl;
}) {
  return <CmsCollectionEntryEditor {...props}
    useCollectionEntryEditorHook={useCollectionEntryEditorHook} useJsonFieldControlHook={useJsonFieldControlHook}
    BodyEditor={BodyEditor} EntryTerms={EntryTerms} ServerLabel={ServerLabel}
    entryListHref={({ contentTypeKey }) => `/admin/collections/${contentTypeKey}`} readStoredField={readExtSiteField} />;
}
