import { DataTable } from "@jini-ai/admin/react";

import { formatTimestamp } from "../../lib/format-timestamp";
import type { AdminDisclosureResult, AdminRecoveryStatus, AdminRestorePoint } from "../../lib/api";
import { categoryLabel, isAssertiveRecoveryBanner } from "./rules";
import { useRecovery } from "./hooks/use-recovery.hooks";
import { useRestoreFlow } from "./hooks/use-restore-flow.hooks";

/**
 * @file Recovery screen (design-spec.md §4, ADR-045) — the `/admin/recovery` route.
 *
 * Per design-spec.md §0.1: one screen, two views — a restore-points list and a restore-flow for a
 * selected point — never a separate "Backups" route (ADR-045 explicitly rejects that shape).
 * Applies §6's own recommendation: a full inline swap (list ⇄ restore-flow), not a modal-over-list.
 *
 * The restore ceremony (`plan`/`confirm`/`execute`, SPEC-019 C-301/C-302/C-303) is wired to the
 * real `core/gated-mutations`-backed routes (Session 5-6 backend gap closure). `executeRestore`
 * now physically swaps `content.db` (2026-07-16, `DbOpsPort.restoreFromArtifact` — an atomic
 * same-filesystem rename, closing the previously-disclosed "ledger-only" gap). Restart-based, by
 * design, not a live hot-swap: the already-running process keeps its own open file handle to the
 * pre-restore data until an operator restarts it — `restartRequired: true` on the response is
 * that signal, surfaced below rather than silently implied.
 *
 * ## Markup only
 *
 * `Recovery`'s own list/status state lives in `hooks/use-recovery.hooks.ts`; `RestoreFlow`'s
 * ceremony state lives in `hooks/use-restore-flow.hooks.ts` — independent state with its own
 * lifecycle, keyed to whichever restore point is selected. `DegradedBannerView`,
 * `RestorePointsList`, and `DisclosurePanel` hold no state of their own and stay as plain,
 * props-driven presentation with no hook. Pure logic (category labels, the banner urgency check,
 * the deep-link envelope parse) lives in `rules.ts`.
 *
 * `src/__tests__/unit/admin-nav-recovery-acs.unit.test.ts` reads this file's source directly
 * (`readFileSync`) to assert AC-32 against the `page-description` copy below — keep that
 * `className="page-description">...</p>` line intact if editing the header copy.
 */

function DegradedBannerView(props: { status: AdminRecoveryStatus }) {
  const banner = props.status.banner;
  if (!banner) return null;

  // AC-27/EC-06/INV-07: `pending-migration`'s action always deep-links to Database's own
  // migration ceremony, never a Recovery restore action — restoring to an older snapshot does not
  // resolve schema drift against the current runtime.
  const assertive = isAssertiveRecoveryBanner(banner);

  return (
    <div className={`notice error recovery-degraded-banner`} role={assertive ? "alert" : undefined} aria-live={assertive ? "assertive" : "polite"}>
      <span>{banner.accessibleText}</span>
      {banner.actionKind === "deep-link-to-database-migration" ? (
        <a href="/admin/database">
          <button type="button" className="btn-secondary">Go to Database</button>
        </a>
      ) : null}
      {banner.actionKind === "unblock-interrupted-migration" ? (
        <button type="button" disabled title="No unblock route exists yet — see this screen's file header.">
          Unblock (not yet available)
        </button>
      ) : null}
    </div>
  );
}

function RestorePointsList(props: {
  points: AdminRestorePoint[];
  onSelect: (point: AdminRestorePoint) => void;
}) {
  return (
    <DataTable
      rows={props.points}
      rowKey={(p) => p.id}
      empty={
        <div className="card">
          <div className="empty-state">
            <p>No restore points yet.</p>
          </div>
        </div>
      }
      columns={[
        { key: "timestamp", header: "Timestamp", cell: (p) => formatTimestamp(p.createdAt) },
        { key: "trigger", header: "Trigger", cell: (p) => p.trigger },
        {
          key: "cost-class",
          header: "Cost class",
          cell: (p) => <span className={`status status-${p.costClass}`}>{p.costClass}</span>,
        },
        {
          key: "restore",
          cell: (p) =>
            p.costClass === "unavailable" ? (
              <span className="muted-cell">No restore-point mechanism available — see the runbook.</span>
            ) : (
              <button type="button" onClick={() => props.onSelect(p)}>
                Restore…
              </button>
            ),
        },
      ]}
    />
  );
}

/** Step 2 — the discarded-write-window disclosure (design-spec.md §4.3): the load-bearing,
 * blocking centerpiece of this screen. Renders only categories the server response actually
 * contains (never a placeholder row for an uncovered category), and renders `"unknown"` distinctly
 * from `0` (INV-05 — a `0` implies verified-zero-loss, `"unknown"` means the baseline could not be
 * computed at all; these must never be conflated). */
function DisclosurePanel(props: {
  point: AdminRestorePoint;
  disclosure: AdminDisclosureResult;
  acknowledged: boolean;
  onAcknowledgeChange: (checked: boolean) => void;
}) {
  const categories = Object.entries(props.disclosure.counts);

  return (
    <div className="notice recovery-disclosure-panel">
      <p>
        Since <strong>{props.point.createdAt}</strong>, restoring here would discard at least:
      </p>
      <ul>
        {categories.map(([category, count]) => (
          <li key={category}>
            {count === "unknown" ? (
              <span>at least an unknown number of {categoryLabel(category)}</span>
            ) : (
              <span>
                {count} {categoryLabel(category)}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p>
        This covers watermark-stamped write paths only (posts/pages and plugin-table writes today)
        and is NOT a complete count of everything written since this restore point — change-sets,
        taxonomy writes, Collections entries, and sessions are not yet counted here.
      </p>
      {!props.disclosure.watermarkBaselineAvailable ? (
        <p className="save-error" role="alert">
          The discarded-write-window baseline could not be computed for this site right now — every
          count above is shown as "unknown", not a verified zero.
        </p>
      ) : null}
      <label id="recovery-ack-label">
        <input
          type="checkbox"
          checked={props.acknowledged}
          onChange={(e) => props.onAcknowledgeChange(e.target.checked)}
        />
        I understand this count is partial, not exhaustive, and accept the loss window described
        above.
      </label>
    </div>
  );
}

export interface RestoreFlowProps {
  point: AdminRestorePoint;
  onBack: () => void;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useRestoreFlowHook?: typeof useRestoreFlow;
}

function RestoreFlow({ 
  point, 
  onBack, 
  useRestoreFlowHook = useRestoreFlow 
}: RestoreFlowProps) {
  const {
    disclosure,
    error,
    acknowledged,
    setAcknowledged,
    step,
    busy,
    ceremonyError,
    plan,
    confirmationToken,
    result,
    startPlan,
    doConfirm,
    doExecute,
  } = useRestoreFlowHook({ point });

  return (
    <div>
      <button type="button" className="btn-ghost" onClick={onBack}>
        ← Restore points
      </button>
      <h2>Restore to {formatTimestamp(point.createdAt)}</h2>

      <div className="settings-layer-grid">
        <div className="settings-layer-cell">
          <span className="settings-layer-label">Trigger</span>
          <span>{point.trigger}</span>
        </div>
        <div className="settings-layer-cell">
          <span className="settings-layer-label">Cost class</span>
          <span className={`status status-${point.costClass}`}>{point.costClass}</span>
        </div>
        <div className="settings-layer-cell">
          <span className="settings-layer-label">Kind</span>
          <span>{point.kind}</span>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {!disclosure && !error ? <div className="notice">Computing the discarded-write-window disclosure…</div> : null}
      {disclosure ? (
        <DisclosurePanel point={point} disclosure={disclosure} acknowledged={acknowledged} onAcknowledgeChange={setAcknowledged} />
      ) : null}

      {ceremonyError ? <div className="notice error">{ceremonyError}</div> : null}

      {step === "idle" ? (
        <div className="notice">
          <button
            type="button"
            className="btn-ghost"
            disabled={!acknowledged || busy}
            aria-describedby="recovery-ack-label"
            title={!acknowledged ? "Acknowledge the disclosure above to continue." : undefined}
            onClick={startPlan}
          >
            {busy ? "Planning…" : "Continue to confirm"}
          </button>
        </div>
      ) : null}

      {step === "planned" && plan ? (
        <div className="notice">
          <p>
            Restore plan ready (plan <code>{plan.planId}</code>). Confirming issues a one-time
            execution token — nothing is restored yet.
          </p>
          <button type="button" className="btn-secondary" onClick={doConfirm} disabled={busy}>
            {busy ? "Confirming…" : "Confirm restore"}
          </button>
        </div>
      ) : null}

      {step === "confirmed" && confirmationToken ? (
        <div className="notice">
          <p>Confirmed. Executing performs the restore — this cannot be undone.</p>
          <button type="button" className="btn-danger" onClick={doExecute} disabled={busy}>
            {busy ? "Restoring…" : "Execute restore"}
          </button>
        </div>
      ) : null}

      {step === "done" && result ? (
        <div className="notice">
          <p role="status">
            Restore run <code>{result.restoreRunId}</code> finished in state{" "}
            <span className={`status status-${result.state}`}>{result.state}</span>.
          </p>
          {result.restartRequired ? (
            <p className="save-error" role="alert">
              The database file was replaced — this server process is still serving the
              pre-restore data from its open connection. Restart the server now to pick up the
              restored data.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export interface RecoveryProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before. See `PostsProps.usePostsHook` for the full rationale.
   */
  useRecoveryHook?: typeof useRecovery;
}

export function Recovery({ useRecoveryHook = useRecovery }: RecoveryProps = {}) {
  const { status, points, error, selected, setSelected } = useRecoveryHook();

  if (error && !points) return <div className="notice error">{error}</div>;
  if (!points || !status) return <div className="notice">Loading restore points…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Operations</p>
          <h1 className="page-title">Recovery</h1>
          <p className="page-description">Restore this site to a previous point in time using a captured restore point.</p>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <div className="notice">
        Restore capability: <span className={`status status-${status.costClass}`}>{status.costClass}</span>
      </div>
      <DegradedBannerView status={status} />

      {selected ? (
        <RestoreFlow point={selected} onBack={() => setSelected(null)} />
      ) : (
        <RestorePointsList points={points} onSelect={setSelected} />
      )}
    </div>
  );
}
