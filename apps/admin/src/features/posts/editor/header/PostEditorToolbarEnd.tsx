import { WiredThemePreviewReloadButton } from "../../../themes/ThemePreviewReloadControl";
import { PostEditorTemplatePicker } from "../template/PostEditorTemplatePicker";
import { type PostEditorView } from "../../hooks/use-post-editor.hooks";

/**
 * The toolbar's right-hand group: the preview reload (Preview tab only) followed by the
 * post-template picker (`PostEditorTemplatePicker` below). The Desktop/Tablet/Mobile width toggle
 * (shared `DevicePreviewToggle`, 2026-09-22 owner ask) moved to the LEFT group beside the
 * Editor/Preview tabs (owner, 2026-10-10: "right next to" them), so it is rendered by `PostEditor`.
 *
 * @complexity O(1).
 */
export function PostEditorToolbarEnd({
  view,
  ...pickerProps
}: {
  view: PostEditorView;
} & Parameters<typeof PostEditorTemplatePicker>[0]) {
  return (
    <div className="page-editor-toolbar-end">
      {view === "preview" ? <WiredThemePreviewReloadButton /> : null}
      <PostEditorTemplatePicker {...pickerProps} />
    </div>
  );
}
