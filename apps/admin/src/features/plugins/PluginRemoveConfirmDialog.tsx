import { agentHandle } from "@jini-ai/agentic";

import { usePluginRemoveConfirm } from "./hooks/use-plugin-remove-confirm.hooks";
import type { Translate } from "@/lib/dictionary-translator";

/**
 * @file Confirmation gate in front of the Downloaded tab's Remove control. Genuinely destructive,
 * unlike `AgentPluginDisableConfirmDialog`'s "Disable" (a reversible flag flip — that sibling
 * screen has no real uninstall route at all): this dialog's Confirm drives the real
 * `DELETE /workspaces/:id/plugins/:pluginId` route (`uninstallPlugin()`,
 * `features/plugin-runtime/uninstall.ts`), which deletes the plugin's on-disk artifact. There is no
 * "restore the prior state" for deleted bytes.
 *
 * Markup, classes (`settings-dialog`/`settings-dialog-backdrop`, `btn-secondary`/`btn-danger`), and
 * behaviour (Escape-to-cancel via the paired hook, Cancel default-focused so the destructive action
 * is never the default) mirror `features/settings/ExternalMcpRemoveConfirmDialog.tsx` — the
 * precedent for exactly this shape of dialog guarding a real, unrecoverable delete — reused rather
 * than re-invented, the same way `AgentPluginDisableConfirmDialog` already followed it for its own
 * (reversible) case.
 */

export interface PluginRemoveConfirmDialogProps {
  /** The plugin's own display name (`plugin.name`) — must name the exact plugin being removed, not
   *  a generic "this plugin". */
  name: string;
  /** This plugin row's own agent-handle base — Confirm/Cancel publish as
   *  `<rowHandle>-remove-confirm` / `<rowHandle>-remove-cancel`, nesting under the row's own handle
   *  the same way `AgentPluginDisableConfirmDialog` nests under its row's `-enabled` switch. */
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
          {/* Cancel is the default-focused control — this action is not reversible, matching
              `ExternalMcpRemoveConfirmDialog`'s own precedent for the identical reason. */}
          <button
            type="button"
            className="btn-secondary"
            autoFocus
            onClick={onCancel}
            {...agentHandle(`${agentHandleBase}-remove-cancel`, {
              role: "button",
              label: `Close this dialog without removing ${name}`,
            })}
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
            {...agentHandle(`${agentHandleBase}-remove-confirm`, {
              role: "button",
              label: `Permanently remove ${name} — this cannot be undone`,
            })}
          >
            {t("Remove")}
          </button>
        </span>
      </div>
    </div>
  );
}
