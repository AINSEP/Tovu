import { type AdminContentType } from "./api/collections-api.types";
import { Dialog } from "@jini-ai/ui-kit/react";
import "../../styles/native-domain-dialogs.css";
import { agentHandle, buildAgentListHandles } from "@jini-ai/core/agent-handles";
import { useWiredEditFieldsDialog } from "./hooks/use-edit-fields-dialog.hooks";
import { ContentTypeFieldsSection } from "./ContentTypeFieldsSection";


// ---------------------------------------------------------------------------
// Edit fields dialog (REQ-05 — post-creation field-schema editing)
// ---------------------------------------------------------------------------

export interface EditFieldsDialogProps {
  contentType: AdminContentType;
  onSaved: () => void;
  onCancel: () => void;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useEditFieldsDialogHook?: typeof useWiredEditFieldsDialog;
  /** Translator closure — see `Collections()`'s own `t`. */
  t: (required: { key: string }, optional?: Record<string, never>) => string;
}

export function EditFieldsDialog({
  contentType,
  onSaved,
  onCancel,
  useEditFieldsDialogHook = useWiredEditFieldsDialog,
  t,
}: EditFieldsDialogProps, _optional: Record<string, never> = {}) {
  const { fields, updateField, removeField, addField, error, saving, submit, cancel } = useEditFieldsDialogHook({
    contentType,
    onSaved,
    onCancel,
  });
  const fieldHandles = buildAgentListHandles({ prefix: "edit-fields-field", ids: fields.map((f) => String(f._rowId)) }
  );

  return (
    <Dialog open title={`${t({ key: "Edit fields —" })} ${contentType.label}`} onClose={() => cancel()} pending={saving}
      className="settings-dialog jini-domain-dialog collections-type-dialog">
      <form
        onSubmit={submit}
        {...agentHandle({ handle: "edit-fields-dialog" }, {
          role: "region",
          label: "Edit fields dialog — this content type's full field schema",
        })}
      >
        <div className="jini-dialog-body">
        <ContentTypeFieldsSection
          fields={fields}
          fieldHandles={fieldHandles}
          idPrefix="ct-edit-field"
          handlePrefix="edit-fields"
          showRemoveButton={true}
          removeButtonLabel={t({ key: "Remove this field from this content type" })}
          updateField={updateField}
          removeField={removeField}
          addField={addField}
          error={error}
          t={t}
        />

        </div>
        <div className="jini-dialog-footer editor-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={cancel}
            disabled={saving}
            data-jini-autofocus=""
            {...agentHandle({ handle: "edit-fields-cancel" }, { role: "button", label: "Close this dialog without saving field changes" })}
          >
            {t({ key: "Cancel" })}
          </button>
          <button
            type="submit"
            disabled={saving}
            {...agentHandle({ handle: "edit-fields-submit" }, { role: "button", label: "Save this content type's field schema" })}
          >
            {saving ? t({ key: "Saving…" }) : t({ key: "Save fields" })}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
