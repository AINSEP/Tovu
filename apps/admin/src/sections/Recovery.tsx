import { useEffect, useState } from "react";
import {
  ApiError,
  api,
  type AdminDisclosureResult,
  type AdminRecoveryStatus,
  type AdminRestorePoint,
  type DatabaseContextEnvelope,
} from "../lib/api";

/**
 * @file Recovery screen (design-spec.md §4, ADR-045) — the `#/section/recovery` route.
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

  // AC-27/EC-06/INV-07: `pending-migration`'s action always deep-links to Database's own
  // migration ceremony, never a Recovery restore action — restoring to an older snapshot does not
  // resolve schema drift against the current runtime.
  const assertive = banner.kind === "migration-interrupted" || banner.kind === "pending-migration";

  return (
    <div className={`notice error recovery-degraded-banner`} role={assertive ? "alert" : undefined} aria-live={assertive ? "assertive" : "polite"}>
      <span>{banner.accessibleText}</span>
      {banner.actionKind === "deep-link-to-database-migration" ? (
        <a href="#/section/database">
          <button type="button">Go to Database</button>
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

type CeremonyStep = "idle" | "planned" | "confirmed" | "done";

function RestoreFlow(props: { point: AdminRestorePoint; onBack: () => void }) {
  const [disclosure, setDisclosure] = useState<AdminDisclosureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const [step, setStep] = useState<CeremonyStep>("idle");
  const [busy, setBusy] = useState(false);
  const [ceremonyError, setCeremonyError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ planId: string; planHash: string } | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);
  const [result, setResult] = useState<{ restoreRunId: string; state: string; restartRequired?: boolean } | null>(null);

  useEffect(() => {
    setDisclosure(null);
    setAcknowledged(false);
    setError(null);
    setStep("idle");
    setBusy(false);
    setCeremonyError(null);
    setPlan(null);
    setConfirmationToken(null);
    setResult(null);
    api
      .computeRecoveryDisclosure(props.point.id)
      .then(setDisclosure)
      .catch((e) => setError(describeApiError(e, "Failed to compute the discarded-write-window disclosure")));
  }, [props.point.id]);

  async function startPlan() {
    setBusy(true);
    setCeremonyError(null);
    try {
      const r = await api.planRestore(props.point.id);
      setPlan({ planId: r.planId, planHash: r.planHash });
      setStep("planned");
    } catch (e) {
      setCeremonyError(describeApiError(e, "Failed to plan the restore"));
    } finally {
      setBusy(false);
    }
  }

  async function doConfirm() {
    if (!plan) return;
    setBusy(true);
    setCeremonyError(null);
    try {
      const r = await api.confirmRestore({
        planId: plan.planId,
        planHash: plan.planHash,
        disclosureAcknowledged: acknowledged,
      });
      setConfirmationToken(r.confirmationToken);
      setStep("confirmed");
    } catch (e) {
      setCeremonyError(describeApiError(e, "Failed to confirm the restore"));
    } finally {
      setBusy(false);
    }
  }

  async function doExecute() {
    if (!confirmationToken) return;
    setBusy(true);
    setCeremonyError(null);
    try {
      const r = await api.executeRestore({ confirmationToken, restorePointId: props.point.id });
      setResult({ restoreRunId: r.restoreRunId, state: r.state, restartRequired: r.restartRequired });
      setStep("done");
    } catch (e) {
      setCeremonyError(describeApiError(e, "Failed to execute the restore"));
    } finally {
      setBusy(false);
    }
  }

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

      {ceremonyError ? <div className="notice error">{ceremonyError}</div> : null}

      {step === "idle" ? (
        <div className="notice">
          <button
            type="button"
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
          <button type="button" onClick={doConfirm} disabled={busy}>
            {busy ? "Confirming…" : "Confirm restore"}
          </button>
        </div>
      ) : null}

      {step === "confirmed" && confirmationToken ? (
        <div className="notice">
          <p>Confirmed. Executing performs the restore — this cannot be undone.</p>
          <button type="button" onClick={doExecute} disabled={busy}>
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
  // envelope `Database.tsx` stashed before navigating here. A stale/forged/pruned envelope
  // resolves to `found: false` — an expected, non-exceptional case, not an error toast.
  useEffect(() => {
    if (!points) return;
    const raw = sessionStorage.getItem("recovery-deep-link-envelope");
    if (!raw) return;
    sessionStorage.removeItem("recovery-deep-link-envelope");
    let envelope: DatabaseContextEnvelope;
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
