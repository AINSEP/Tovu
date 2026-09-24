import { agentHandle } from "@jini-ai/agentic";

import { usePluginRemoveConfirm } from "./hooks/use-plugin-remove-confirm.hooks";
import type { Translate } from "@/lib/dictionary-translator";

/** @file Confirmation gate before a site plugin moves to the 60-day Trash. */

export interface PluginRemoveConfirmDialogProps {
  /** The plugin's own display name (`plugin.name`) — must name the exact plugin being removed, not
   *  a generic "this plugin". */
  name: string;
  /** This plugin row's own agent-handle base — Cancel publishes as `<rowHandle>-remove-cancel`,
   *  nesting under the row's own handle the same way `AgentPluginDisableConfirmDialog` nests under
   *  its row's `-enabled` switch. Confirm has no handle: uninstalling is a human-only step. */
  agentHandleBase: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** The screen's own bound translator, threaded down rather than called again here — same
   *  convention `AgentPluginDisableConfirmDialog` uses for its own `t`. */
  t: Translate;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  usePluginRemoveConfirmHook?: typeof usePluginRemoveConfirm;
}

export function PluginRemoveConfirmDialog({
  name,
  agentHandleBase,
  onConfirm,
  onCancel,
  t,
  usePluginRemoveConfirmHook = usePluginRemoveConfirm,
}: PluginRemoveConfirmDialogProps) {
  const { copy, dialogRef } = usePluginRemoveConfirmHook({ name, onCancel, t });
  const titleId = `${agentHandleBase}-remove-confirm-title`;

  return (
    <div className="settings-dialog-backdrop" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{copy.title}</h2>
        <p>{copy.body}</p>
        <span className="editor-actions">
          {/* Cancel stays default-focused because moving a shared package affects every workspace. */}
          <button
            type="button"
            className="btn-secondary"
            autoFocus
            onClick={onCancel}
            {...agentHandle(`${agentHandleBase}-remove-cancel`, {
              role: "button",
              label: `Close this dialog without moving ${name} to the Trash`,
            })}
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
          >
            {t("Move to trash")}
          </button>
        </span>
      </div>
    </div>
  );
}
