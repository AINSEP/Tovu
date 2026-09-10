import { agentHandle } from "@jini-ai/agentic";

import { useAgentPluginDisableConfirm } from "./hooks/use-agent-plugin-disable-confirm.hooks";
import type { Translate } from "@/lib/dictionary-translator";

/**
 * @file Confirmation gate in front of `AgentPluginRow`'s enable/disable switch, but ONLY on the
 * enabled->disabled direction. There is no admin uninstall route — the only two agent-plugins
 * routes are `GET .../agent-plugins` (list) and `PATCH .../agent-plugins/:pluginId` (set-enabled);
 * `uninstallAgentPlugin()` (`features/agent-plugins/uninstall.ts`) is reachable only from an
 * assistant tool and refuses every bundled package outright — see `AgentPluginRow`'s own header for
 * why its trash icon is honestly disabled for that reason. So "remove this plugin from the site",
 * mechanically, is what turning the switch off already does: `resolveAgentPluginRefs()` refuses to
 * pin a disabled plugin into a run, which is the only lever an operator actually has over a bundled
 * package. This dialog exists because that lever has a real cost (the assistant loses those skills
 * on its very next run) and, before it landed, the switch fired that cost with a single click and no
 * way to reconsider.
 *
 * Enabling stays a plain one-click toggle — see `AgentPlugins.tsx`'s own `onRequestToggleEnabled`
 * for the branch — because turning a plugin ON has no comparable cost to interrupt: nothing an
 * operator already depends on stops working, and the switch itself already announces the resulting
 * state (`aria-checked` plus the row's own "Enabled"/"Disabled" word).
 *
 * Markup, classes (`settings-dialog`/`settings-dialog-backdrop`, `btn-secondary`/`btn-danger`), and
 * behaviour (Escape-to-cancel via the paired hook, Cancel default-focused so the destructive-leaning
 * action is never the default) mirror `features/settings/ExternalMcpRemoveConfirmDialog.tsx` — the
 * most recent precedent for exactly this shape of dialog in this app, reused rather than
 * re-invented. Confirm reads "Disable", not "Remove": this is a reversible state flip (the package
 * stays on disk and can be re-enabled), not a destructive delete, and naming it "Disable" keeps the
 * dialog's own verb identical to the switch it guards — the owner's explicit call against renaming
 * that control to "Add to site / Remove from site".
 */

export interface AgentPluginDisableConfirmDialogProps {
  /** The plugin's own human-readable display name (`humanizeAgentPluginId(plugin.pluginId)`) —
   *  must name the exact plugin being disabled, not a generic "this plugin". */
  name: string;
  /** This plugin row's own agent-handle base (e.g. `agent-plugin-row-site-compliance`) — Confirm/
   *  Cancel publish as `<rowHandle>-disable-confirm` / `<rowHandle>-disable-cancel`, nesting under
   *  the row's already-published `<rowHandle>-enabled` switch the same way
   *  `ExternalMcpRemoveConfirmDialog` nests its own controls under its card's handle. */
  agentHandleBase: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** The screen's own bound translator, threaded down rather than called again here — same
   *  convention `ExternalMcpRemoveConfirmDialog` uses for its own `t`. */
  t: Translate;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useAgentPluginDisableConfirmHook?: typeof useAgentPluginDisableConfirm;
}

export function AgentPluginDisableConfirmDialog({
  name,
  agentHandleBase,
  onConfirm,
  onCancel,
  t,
  useAgentPluginDisableConfirmHook = useAgentPluginDisableConfirm,
}: AgentPluginDisableConfirmDialogProps) {
  const { copy } = useAgentPluginDisableConfirmHook({ name, onCancel });
  const titleId = `${agentHandleBase}-disable-confirm-title`;

  return (
    <div className="settings-dialog-backdrop" onClick={onCancel}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{copy.title}</h2>
        <p>{copy.body}</p>
        <span className="editor-actions">
          {/* Cancel is the default-focused control, matching `ExternalMcpRemoveConfirmDialog`'s own
              "the interrupting action is never the default" precedent. */}
          <button
            type="button"
            className="btn-secondary"
            autoFocus
            onClick={onCancel}
            {...agentHandle(`${agentHandleBase}-disable-cancel`, {
              role: "button",
              label: `Close this dialog without disabling ${name}`,
            })}
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
            {...agentHandle(`${agentHandleBase}-disable-confirm`, {
              role: "button",
              label: `Disable ${name} for this site`,
            })}
          >
            {t("Disable")}
          </button>
        </span>
      </div>
    </div>
  );
}
