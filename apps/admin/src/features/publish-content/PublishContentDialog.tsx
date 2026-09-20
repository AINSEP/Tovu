import { agentHandle } from "@jini-ai/agentic";

import type { Translate } from "../../lib/dictionary-translator";
import { usePublishContentConfirm } from "./hooks/use-publish-content-confirm.hooks";
import type { PublishContentPort } from "./hooks/publish-content-port.hooks";

/**
 * @file The publish-content slice's dialog, opened from the Dashboard's header button, and the whole
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
 * skipped row carries no control that could publish it — not even a disabled checkbox: exclusion is
 * by construction, not by an unchecked box.
 *
 * Rows the run WOULD write are checked by default and can be unchecked (owner-directed, 2026-09-19).
 * That stays consistent with the paragraph above rather than contradicting it: unchecking is how an
 * operator publishes LESS, never more, and it is honoured by re-planning against a bundle narrowed to
 * the checked rows (see `hooks/use-publish-content-confirm.hooks.ts`'s `confirmPlan`), so a
 * deselected entity never reaches the live site at all. `@tovu/publish-content-ui`'s `report-rows.ts`
 * owns which rows may carry a checkbox; this file only renders the answer.
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
 *
 * ## The empty state is the connect action, not a dead end
 *
 * When `view.connectOffer` is set (no peer configured yet), the SAME primary button below becomes
 * the connect action rather than a second button appearing next to a disabled "Publish" — one
 * visible control, whatever the dialog's current job is. `view.connectOffer.message` is the
 * server's own sentence (`routes/publish-content/destination.ts`), rendered verbatim: it already
 * names the pre-filled candidate site, so this file adds no copy of its own about what connecting
 * means. See that route's header for why this dialog is where the action lives at all.
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
        <p>{t("Sends your posts, pages and media to the live site. Deploy ships code; publish ships content.")}</p>
        <p>{t("Anything edited on the live site is skipped, never overwritten.")}</p>

        {view.peers.length > 1 && (
          <label className="field">
            <span>{t("Publish to")}</span>
            <select
              value={view.selectedPeerId ?? ""}
              disabled={!view.peerSelectionEnabled}
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

        {view.connectOffer && <p className="notice">{view.connectOffer.message}</p>}
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
                    <th className="publish-content-select">
                      <input
                        type="checkbox"
                        checked={view.allSelected}
                        // React has no `indeterminate` prop — the partial state is a DOM property
                        // only, so it is set on the node itself every render.
                        ref={(node) => {
                          if (node) node.indeterminate = view.someSelected;
                        }}
                        disabled={!view.selectionEnabled || view.rows.every((row) => !row.selectable)}
                        onChange={view.onToggleAll}
                        aria-label={t("Publish every item that can be published")}
                        {...agentHandle("dashboard-publish-content-select-all", {
                          role: "field",
                          label: "Check or uncheck every publishable row at once",
                        })}
                      />
                    </th>
                    <th>{t("Type")}</th>
                    <th>{t("Entity")}</th>
                    <th>{t("What happens")}</th>
                    <th>{t("Why")}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => (
                    <tr key={row.key} data-entity-id={row.entityId} data-publish-disposition={row.disposition}>
                      <td className="publish-content-select">
                        {/* A row the run would not write carries NO control at all, not a disabled
                            one: plan §4 task 11's property is that nothing in this dialog can move a
                            skipped row into the set that gets published. */}
                        {row.selectable && (
                          <input
                            type="checkbox"
                            checked={view.selectedKeys.has(row.key)}
                            disabled={!view.selectionEnabled}
                            onChange={() => view.onToggleRow(row.key)}
                            // No `agentHandle` here: a handle must be lowercase words joined by
                            // hyphens, and a row key is an entity id. The row's own
                            // `data-entity-id` is the stable address instead — an agent (or a test)
                            // finds the row, then the one checkbox inside it.
                            data-publish-row-select=""
                            aria-label={`${t("Publish")} ${row.entityType} ${row.entityLabel}`}
                          />
                        )}
                      </td>
                      <td>{row.entityType}</td>
                      {/* The id stays reachable as a tooltip — it is what a support conversation
                          needs — but it is never what the column reads as. */}
                      <td title={row.entityId}>{row.entityLabel}</td>
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
              // Same control, different job: while `connectOffer` is set this button connects the
              // pre-filled site instead of reviewing a plan — see this file's header.
              label: view.connectOffer
                ? "Connect this site so it can publish, using the pre-filled site address"
                : "Review what would be published, then publish it to the live site",
            })}
          >
            {view.primaryLabel}
          </button>
        </span>
      </div>
    </div>
  );
}
