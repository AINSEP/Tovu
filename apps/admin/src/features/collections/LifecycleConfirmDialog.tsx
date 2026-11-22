import { type AdminContentType } from "./api/collections-api.types";
import { Dialog } from "@jini-ai/ui-kit/react";
import "../../styles/native-domain-dialogs.css";
import { agentHandle } from "@jini-ai/core/agent-handles";
import { useLifecycleConfirmDialog } from "./hooks/use-lifecycle-confirm-dialog.hooks";


// ---------------------------------------------------------------------------
// Lifecycle confirm dialog (Deprecate / Reactivate / Tombstone — design-spec.md §1.3/§1.8)
// ---------------------------------------------------------------------------

export interface LifecycleConfirmDialogProps {
  op: "deprecate" | "tombstone";
  contentType: AdminContentType;
  onConfirm: () => void;
  onCancel: () => void;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useLifecycleConfirmDialogHook?: typeof useLifecycleConfirmDialog;
  /** Translator closure — see `Collections()`'s own `t`. */
  t: (required: { key: string }, optional?: Record<string, never>) => string;
}

export function LifecycleConfirmDialog({
  op,
  contentType,
  onConfirm,
  onCancel,
  useLifecycleConfirmDialogHook = useLifecycleConfirmDialog,
  t,
}: LifecycleConfirmDialogProps) {
  const { copy, autoFocusCancel } = useLifecycleConfirmDialogHook({ op, onCancel });

  return (
    <Dialog open title={copy.title} onClose={() => onCancel()} className="settings-dialog jini-domain-dialog">
        <p>
          {copy.body} (<strong>{contentType.label}</strong>)
        </p>
        <span className="editor-actions">
          {/* Deprecate is reversible (Reactivate exists) but access-affecting — `.btn-warning`,
              same distinction as Users.tsx's Disable. Tombstone is not, per its own copy above
              ("not reversible from this screen") — `.btn-danger`, matching Roles.tsx/Jini redirects/react/pages/RedirectsPage.tsx's
              existing destructive-delete convention. */}
          <button
            type="button"
            className={op === "deprecate" ? "btn-warning" : "btn-danger"}
            data-jini-autofocus={autoFocusCancel ? undefined : ""}
            onClick={onConfirm}
            {...agentHandle({ handle: "lifecycle-confirm" }, {
              role: "button",
              label:
                "Confirm this content type's lifecycle change — Deprecate is reversible, Tombstone is not from this screen",
            })}
          >
            {op === "deprecate" ? t({ key: "Deprecate" }) : t({ key: "Delete" })}
          </button>
          <button
            type="button"
            className="btn-secondary"
            data-jini-autofocus={autoFocusCancel ? "" : undefined}
            onClick={onCancel}
            {...agentHandle({ handle: "lifecycle-cancel" }, { role: "button", label: "Close this dialog without changing the lifecycle" })}
          >
            {t({ key: "Cancel" })}
          </button>
        </span>
    </Dialog>
  );
}
