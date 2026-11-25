import { WiredThemePreviewReloadButton } from "../../../themes/ThemePreviewReloadButton";
import { PostEditorTemplatePicker } from "@jini-ai/admin/posts/editor/template/PostEditorTemplatePicker";
import { ViewTemplateButton } from "@jini-ai/admin/shell/components/TemplateSource/ViewTemplateButton";
import type { PostEditorView } from "@jini-ai/admin/posts/view-tabs";

/**
 * The toolbar's right-hand group: the preview reload (Preview tab only) followed by the
 * post-template picker (`PostEditorTemplatePicker` below). The Desktop/Tablet/Mobile width toggle
 * (shared `DevicePreviewToggle`, 2026-09-22 owner ask) moved to the LEFT group beside the
 * Editor/Preview tabs (owner, 2026-10-10: "right next to" them), so it is rendered by `PostEditor`.
 *
 * The picker lives in `@jini-ai/admin`; this call site binds the host's shared `ViewTemplateButton`
 * (also used by the page editor's picker) into its required `ViewTemplateButton` prop.
 *
 * @complexity O(1).
 */
export function PostEditorToolbarEnd({
  view,
  ...pickerProps
}: {
  view: PostEditorView;
} & Omit<Parameters<typeof PostEditorTemplatePicker>[0], "ViewTemplateButton">) {
  return (
    <div className="page-editor-toolbar-end">
      {view === "preview" ? <WiredThemePreviewReloadButton /> : null}
      <PostEditorTemplatePicker {...pickerProps} ViewTemplateButton={ViewTemplateButton} />
    </div>
  );
}
