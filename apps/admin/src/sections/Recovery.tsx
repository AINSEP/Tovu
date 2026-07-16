import { useEffect, useState } from "react";
import {
  ApiError,
  api,
  type AdminDisclosureResult,
  type AdminRecoveryStatus,
  type AdminRestorePoint,
  type StorageContextEnvelope,
} from "../lib/api";

/**
 * @file Recovery screen (design-spec.md §4, ADR-045) — the `#/section/recovery` route.
 *
 * Per design-spec.md §0.1: one screen, two views — a restore-points list and a restore-flow for a
 * selected point — never a separate "Backups" route (ADR-045 explicitly rejects that shape).
 * Applies §6's own recommendation: a full inline swap (list ⇄ restore-flow), not a modal-over-list.
 *
 * **Disclosed, load-bearing limitation** (progress-ledger.md "Session 5" + this dispatch's brief):
 * list/disclosure/deep-link/status are real, tested routes. The restore ceremony itself
 * (`planRestore`/`confirmRestore`/`executeRestore`, `recovery-orchestrator.ts`) has **no route** —
 * it needs `core/gated-mutations`'s token-store-backed gateway, composed into zero composition
 * roots in this codebase today. Step 2's disclosure panel is fully real and live; the "Confirm
 * restore" action past it is rendered per the spec's IA (it is not hidden — an operator should be
 * able to see the full ceremony shape) but surfaces an honest "not yet available" state rather
 * than silently 404ing or calling a route that does not exist.
 */

function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
}

const CATEGORY_LABELS: Record<string, string> = {
  posts_pages: "posts/pages writes",
  plugin_table: "plugin-table rows",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? `${category} writes`;
}

function DegradedBannerView(props: { status: AdminRecoveryStatus }) {
  const banner = props.status.banner;
  if (!banner) return null;

  // AC-27/EC-06/INV-07: `pending-migration`'s action always deep-links to Storage's own
  // migration ceremony, never a Recovery restore action — restoring to an older snapshot does not
  // resolve schema drift against the current runtime.
  const assertive = banner.kind === "migration-interrupted" || banner.kind === "pending-migration";

  return (
    <div className={`notice error recovery-degraded-banner`} role={assertive ? "alert" : undefined} aria-live={assertive ? "assertive" : "polite"}>
      <span>{banner.accessibleText}</span>
      {banner.actionKind === "deep-link-to-storage-migration" ? (
        <a href="#/section/storage">
          <button type="button">Go to Storage</button>
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
  if (props.points.length === 0) {
    return <div className="notice">No restore points yet.</div>;
  }
  return (
    <table className="list-table">
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Trigger</th>
          <th>Cost class</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {props.points.map((p) => (
          <tr key={p.id}>
            <td>{p.createdAt.slice(0, 16).replace("T", " ")}</td>
            <td>{p.trigger}</td>
            <td>
              <span className={`status status-${p.costClass}`}>{p.costClass}</span>
            </td>
            <td>
              {p.costClass === "unavailable" ? (
                <span className="muted-cell">No restore-point mechanism available — see the runbook.</span>
              ) : (
                <button type="button" onClick={() => props.onSelect(p)}>
                  Restore…
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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

function RestoreFlow(props: { point: AdminRestorePoint; onBack: () => void }) {
  const [disclosure, setDisclosure] = useState<AdminDisclosureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    setDisclosure(null);
    setAcknowledged(false);
    setError(null);
    api
      .computeRecoveryDisclosure(props.point.id)
      .then(setDisclosure)
      .catch((e) => setError(describeApiError(e, "Failed to compute the discarded-write-window disclosure")));
  }, [props.point.id]);

  return (
    <div>
      <button type="button" onClick={props.onBack}>
        ← Restore points
      </button>
      <h2>Restore to {props.point.createdAt.slice(0, 16).replace("T", " ")}</h2>

      <div className="settings-layer-grid">
        <div className="settings-layer-cell">
          <span className="settings-layer-label">Trigger</span>
          <span>{props.point.trigger}</span>
        </div>
        <div className="settings-layer-cell">
          <span className="settings-layer-label">Cost class</span>
          <span className={`status status-${props.point.costClass}`}>{props.point.costClass}</span>
        </div>
        <div className="settings-layer-cell">
          <span className="settings-layer-label">Kind</span>
          <span>{props.point.kind}</span>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {!disclosure && !error ? <div className="notice">Computing the discarded-write-window disclosure…</div> : null}
      {disclosure ? (
        <DisclosurePanel point={props.point} disclosure={disclosure} acknowledged={acknowledged} onAcknowledgeChange={setAcknowledged} />
      ) : null}

      <div className="notice">
        <button
          type="button"
          disabled={!acknowledged}
          aria-describedby="recovery-ack-label"
          title={!acknowledged ? "Acknowledge the disclosure above to continue." : undefined}
          onClick={() => {
            /* Disclosed limitation (see this file's header comment): confirmRestore/executeRestore
             * have no route yet. This button is present per design-spec.md's IA rather than
             * hidden, but does not perform a network call — see the message below it. */
          }}
        >
          Continue to confirm
        </button>
        {acknowledged ? (
          <p className="save-error" role="status">
            Restore confirm/execute is not yet available — the plan/confirm/execute routes for this
            ceremony have not been wired yet (see this screen's file header). Nothing has been
            restored.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function Recovery() {
  const [status, setStatus] = useState<AdminRecoveryStatus | null>(null);
  const [points, setPoints] = useState<AdminRestorePoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminRestorePoint | null>(null);

  function load() {
    setError(null);
    Promise.all([api.getRecoveryStatus(), api.listRecoveryRestorePoints()])
      .then(([statusResult, pointsResult]) => {
        setStatus(statusResult);
        setPoints(pointsResult.items);
      })
      .catch((e) => setError(describeApiError(e, "failed to load Recovery")));
  }

  useEffect(load, []);

  // Deep-link arrival (design-spec.md §4.5, ADR-041 §7/ADR-045 §5, INV-04): re-resolve any
  // envelope `Storage.tsx` stashed before navigating here. A stale/forged/pruned envelope
  // resolves to `found: false` — an expected, non-exceptional case, not an error toast.
  useEffect(() => {
    if (!points) return;
    const raw = sessionStorage.getItem("recovery-deep-link-envelope");
    if (!raw) return;
    sessionStorage.removeItem("recovery-deep-link-envelope");
    let envelope: StorageContextEnvelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return;
    }
    api
      .resolveRecoveryDeepLink(envelope)
      .then((result) => {
        if (result.found && result.restorePoint) {
          const match = points.find((p) => p.id === result.restorePoint!.restorePointId);
          if (match) setSelected(match);
        }
      })
      .catch(() => undefined); // a failed re-verification falls back to the plain list, no alarm
  }, [points]);

  if (error && !points) return <div className="notice error">{error}</div>;
  if (!points || !status) return <div className="notice">Loading restore points…</div>;

  return (
    <div>
      <h1>Recovery</h1>
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
