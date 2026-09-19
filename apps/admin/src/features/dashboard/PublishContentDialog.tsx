import { agentHandle } from "@jini-ai/agentic";

import type { Translate } from "../../lib/dictionary-translator";
import { usePublishContentConfirm } from "./hooks/use-publish-content-confirm.hooks";
import type { PublishContentPort } from "./hooks/publish-content-port.hooks";

/**
 * @file The "Publish Content" dialog opened from the Dashboard's header button, and the whole
 * plan -> report -> confirm -> execute ceremony behind it
 * (`ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 11).
 *
 * Its job is educational, not just a yes/no gate: the owner's stated worry is operators deploying
 * the site, seeing no change, and not understanding that a deploy ships CODE while this dialog's
 * action ships CONTENT — two different things this app has never distinguished for anyone before.
 * The body copy says that explicitly rather than assuming it's obvious.
 *
 * ## The report table is the safety feature, not a progress indicator
 *
 * A publish never overwrites something edited on the far side; it reports it and moves on
 * (`features/publish-content/planner.ts`'s seven outcomes). That promise is only worth anything if
 * the operator can SEE which entities were skipped and why before committing — so the plan step runs
 * first, renders one row per entity with its reason, and only then offers a button that writes. A
 * skipped row carries no control that could publish it: exclusion is by construction, not by an
 * unchecked box (see `@tovu/publish-content-ui`'s `report-rows.ts` for why there is no per-row
 * opt-in in v1).
 *
 * Every decision this file renders comes from `hooks/use-publish-content-confirm.hooks.ts`, and
 * every rule the hook applies comes from `@tovu/publish-content-ui` — the same module the server's
 * own planner semantics are pinned against. This component contains no publish logic at all.
 *
 * Markup, classes (`settings-dialog`/`settings-dialog-backdrop`, `btn-secondary`/`btn-primary`),
 * and behaviour (Escape-to-cancel via the paired hook, Cancel default-focused) mirror
 * `features/plugins/AgentPluginDisableConfirmDialog.tsx` — the most recent precedent for this shape
 * of dialog in this app. Confirm is `.btn-primary` here, not `.btn-danger`: publishing isn't
 * destructive the way removing a plugin or an OAuth connection is, it's the app's one deliberate
 * primary action, so it gets the same burnt-orange fill `.btn-primary` already renders everywhere
 * else. Cancel stays the default-focused control anyway: publishing touches the live site and can
 * skip content without the operator noticing, so the interrupting action is still never the one
 * Enter fires by accident, matching every other confirm dialog's own reasoning even though this one
 * isn't destructive.
 */

/** Maps a row's disposition to the `.status-*` pill `styles.css` already defines, so the table
 *  reads the same as every other status column in the app in both themes. */
const DISPOSITION_PILL_CLASS = {
  publish: "status status-active",
  unchanged: "status status-draft",
  skipped: "status status-warning",
} as const;

export interface PublishContentDialogProps {
  onCancel: () => void;
  /** The screen's own bound translator, threaded down rather than resolved again here — same
   *  convention `AgentPluginDisableConfirmDialog` uses for its own `t`. */
  t: Translate;
  /** Dependency injection seam for tests — see `hooks/publish-content-port.hooks.ts`. */
  port?: PublishContentPort;
}

export function PublishContentDialog({ onCancel, t, port }: PublishContentDialogProps) {
  const view = usePublishContentConfirm({ onCancel, t, port });
  const titleId = "dashboard-publish-content-confirm-title";

  return (
    <div className="settings-dialog-backdrop" onClick={onCancel}>
      <div
        className={`settings-dialog${view.rows.length > 0 ? " publish-content-dialog" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{t("Publish Content")}</h2>
        <p>{t("This sends your posts, pages, and media to the live site.")}</p>
        <p>
          {t(
            "Deploying and publishing are different things. Deploy ships code. Publish ships content. Deploying doesn't update your content — that's why the site looked unchanged.",
          )}
        </p>
        <p>
          {t(
            "Anything edited directly on the live site is skipped, not overwritten. You'll see what got skipped afterward.",
          )}
        </p>

        {view.peers.length > 1 && (
          <label className="field">
            <span>{t("Publish to")}</span>
            <select
              value={view.selectedPeerId ?? ""}
              onChange={(e) => view.onSelectPeer(e.target.value)}
              {...agentHandle("dashboard-publish-content-peer", {
                // `AgentElementRole` has no `select` member — a `<select>` is a `field` in that
                // vocabulary, same as every other value-carrying control.
                role: "field",
                label: "Which site to publish this content to",
              })}
            >
              <option value="">{t("Choose a site…")}</option>
              {view.peers.map((peer) => (
                <option key={peer.id} value={peer.id}>
                  {peer.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {view.peers.length === 1 && (
          <p className="muted publish-content-target">
            {t("Publishing to")} <strong>{view.peers[0].label}</strong>
          </p>
        )}

        {view.noPeersMessage && <p className="notice">{view.noPeersMessage}</p>}
        {view.refusalReason && (
          <p className="notice error" role="alert">
            {view.refusalReason}
          </p>
        )}
        {view.errorMessage && (
          <p className="notice error" role="alert">
            {view.errorMessage}
          </p>
        )}
        {view.doneMessage && (
          <p className="notice" role="status">
            {view.doneMessage}
          </p>
        )}

        {view.rows.length > 0 && (
          <>
            <div className="table-scroll publish-content-report">
              <table className="list-table">
                <thead>
                  <tr>
                    <th>{t("Type")}</th>
                    <th>{t("Entity")}</th>
                    <th>{t("What happens")}</th>
                    <th>{t("Why")}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => (
                    <tr key={row.key} data-entity-id={row.entityId} data-publish-disposition={row.disposition}>
                      <td>{row.entityType}</td>
                      <td>{row.entityId}</td>
                      <td>
                        <span className={DISPOSITION_PILL_CLASS[row.disposition]}>{row.dispositionLabel}</span>
                      </td>
                      <td className="publish-content-reason">{row.reason ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {view.summary && (
              <p className="muted publish-content-summary">
                {view.summary.publishing} {t("to publish")} · {view.summary.unchanged} {t("unchanged")} ·{" "}
                {view.summary.skipped} {t("skipped")}
              </p>
            )}
          </>
        )}

        <span className="editor-actions">
          {/* Cancel is the default-focused control — see this file's header for why, even though
              this dialog isn't destructive. */}
          <button
            type="button"
            className="btn-secondary"
            autoFocus
            onClick={onCancel}
            {...agentHandle("dashboard-publish-content-cancel", {
              role: "button",
              label: "Close this dialog without publishing",
            })}
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={view.primaryDisabled}
            onClick={view.onPrimary}
            {...agentHandle("dashboard-publish-content-confirm", {
              role: "button",
              label: "Review what would be published, then publish it to the live site",
            })}
          >
            {view.primaryLabel}
          </button>
        </span>
      </div>
    </div>
  );
}
