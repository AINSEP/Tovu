import { Dialog } from "@jini-ai/ui-kit/react";
import "../../styles/native-domain-dialogs.css";
import { agentHandle, buildAgentListHandles } from "@jini-ai/core/agent-handles";
import { useWiredNewContentTypeDialog } from "./hooks/use-new-content-type-dialog.hooks";
import { ContentTypeFieldsSection } from "./ContentTypeFieldsSection";


// ---------------------------------------------------------------------------
// New content type modal (design-spec.md §1.3 — recommended modal, applied here per §6)
// ---------------------------------------------------------------------------

export interface NewContentTypeDialogProps {
  onCreated: () => void;
  onCancel: () => void;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useNewContentTypeDialogHook?: typeof useWiredNewContentTypeDialog;
  /** Translator closure — see `Collections()`'s own `t`. */
  t: (required: { key: string }, optional?: Record<string, never>) => string;
}

export function NewContentTypeDialog({
  onCreated,
  onCancel,
  useNewContentTypeDialogHook = useWiredNewContentTypeDialog,
  t,
}: NewContentTypeDialogProps, _optional: Record<string, never> = {}) {
  const { label, setLabel, key, setKey, fields, updateField, removeField, addField, error, saving, submit, cancel } =
    useNewContentTypeDialogHook({ onCreated, onCancel });
  const fieldHandles = buildAgentListHandles({ prefix: "new-content-type-field", ids: fields.map((f) => String(f._rowId)) }
  );

  return (
    <Dialog open title={t({ key: "New content type" })} onClose={() => cancel()} pending={saving}
      className="settings-dialog jini-domain-dialog collections-type-dialog">
      <form
        onSubmit={submit}
        {...agentHandle({ handle: "new-content-type-dialog" }, {
          role: "region",
          label: "New content type dialog — its label, key, and field schema",
        })}
      >
        {renderNewContentTypeFields({ label, t, setLabel, key, setKey, fields, fieldHandles, updateField, removeField, addField, error })}
        <div className="jini-dialog-footer editor-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={cancel}
            disabled={saving}
            {...agentHandle({ handle: "new-content-type-cancel" }, { role: "button", label: "Close this dialog without creating a content type" })}
          >
            {t({ key: "Cancel" })}
          </button>
          <button
            type="submit"
            disabled={saving}
            {...agentHandle({ handle: "new-content-type-submit" }, { role: "button", label: "Create this content type" })}
          >
            {saving ? t({ key: "Saving…" }) : t({ key: "Create content type" })}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
