import { useEffect, useState } from "react";
import { ApiError, api, describeApiError, type AdminLedgerRow, type AdminRestorePoint } from "../lib/api";
import { navigate } from "../lib/router";
import { formatTimestamp } from "../lib/format-timestamp";

/**
 * @file Database screen (design-spec.md §3, ADR-041) — the `/admin/database` route: the
 * read-first Timeline, the restore-points list, and the migrate-forward ceremony. Structural
 * reference: `Analytics.tsx`'s "raw ingest, said so explicitly" pattern (design-spec.md §0.3).
 *
 * The migrate-forward plan/confirm/execute ceremony (ADR-041 §3, SPEC-017 C-103/C-105) is now
 * wired to the real `core/gated-mutations`-backed routes (Session 5-6 backend gap closure).
 *
 * Still disclosed, still omitted (per design-spec.md §3.8/§5 and progress-ledger.md "Session 5"):
 * the drift banner, the `PENDING_MIGRATION` boot banner, and the Tier-3 browser have no route yet
 * — this screen omits them rather than rendering dead affordances.
 */

const KIND_OPTIONS = [
  "core.migration",
  "plugin.ddl",
  "index.provision",
  "index.drop",
  "template.upgrade",
  "restore_point.created",
  "restore.executed",
  "migration.interrupted",
] as const;

/** Stashes a client-constructed `DatabaseContextEnvelope` for `Recovery.tsx` to re-resolve
 * server-side on arrival (ADR-041 §7/ADR-045 §5, INV-04) — this admin app's router has no
 * per-navigation state mechanism, so `sessionStorage` carries the envelope across the navigation the
 * same way route state would in a router that supported it. A query string would technically work
 * now that routing is path-based, but this is transient handoff state: putting it in the URL would
 * make it bookmarkable and shareable, which is exactly what it must not be. The envelope itself
 * carries display continuity only; `resolveDeepLinkContext` never trusts it as authoritative. */
function navigateToRecoveryWithDeepLink(row: AdminLedgerRow) {
  if (!row.restorePointId) return;
  const envelope = {
    v: 1,
    correlationId: `database-timeline-${row.id}`,
    siteId: "workspace-local",
    ledgerEventId: row.id,
    restorePointId: row.restorePointId,
    drift: row.kind,
    intent: "view",
    issuedAt: new Date().toISOString(),
  };
  sessionStorage.setItem("recovery-deep-link-envelope", JSON.stringify(envelope));
  navigate("/recovery");
}

function TimelineSection() {
  const [rows, setRows] = useState<AdminLedgerRow[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const [outcome, setOutcome] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  function load(reset: boolean) {
    setError(null);
    api
      .getDatabaseTimeline({
        kind: kind || undefined,
        outcome: outcome || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        cursor: reset ? undefined : nextCursor ?? undefined,
      })
      .then((r) => {
        setRows((current) => (reset || !current ? r.items : [...current, ...r.items]));
        setNextCursor(r.nextCursor);
      })
      .catch((e) => setError(describeApiError(e, "failed to load the Database Timeline")))
      .finally(() => setLoadingMore(false));
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    load(true);
  }

  function loadMore() {
    setLoadingMore(true);
    load(false);
  }

  if (error && !rows) return <div className="notice error">{error}</div>;
  if (!rows) return <div className="notice">Loading timeline…</div>;

  return (
    <div>
      <form className="notice database-filter-bar toolbar" onSubmit={applyFilters}>
        <div className="field">
          <label className="field-label" htmlFor="database-filter-kind">Kind</label>
          <select id="database-filter-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">(any)</option>
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="database-filter-outcome">Outcome</label>
          <input id="database-filter-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. success" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="database-filter-from">From</label>
          <input id="database-filter-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="database-filter-to">To</label>
          <input id="database-filter-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <button type="submit" className="btn-secondary">Apply filters</button>
      </form>

      {error ? <div className="notice error">{error}</div> : null}

      {rows.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No database activity recorded yet.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-scroll">
          <table className="list-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Outcome</th>
                <th>Restore point</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.kind}</td>
                  <td>
                    <span className={`status status-${row.outcome}`}>{row.outcome}</span>
                  </td>
                  <td>
                    {row.restorePointId ? (
                      <button type="button" className="database-restore-point-link" onClick={() => navigateToRecoveryWithDeepLink(row)}>
                        View in Recovery →
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{formatTimestamp(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {nextCursor ? (
            <button type="button" className="btn-secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function RestorePointsSection() {
  const [points, setPoints] = useState<AdminRestorePoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    api
      .listDatabaseRestorePoints()
      .then((r) => setPoints(r.items))
      .catch((e) => setError(describeApiError(e, "failed to load restore points")));
  }

  useEffect(load, []);

  async function createRestorePoint() {
    setCreating(true);
    setError(null);
    try {
      // No capabilities-read route exists yet to learn `costClass` ahead of time (design-spec.md
      // §3.3 wants a cost/disk estimate the confirmer explicitly acknowledges first); `costAck:
      // true` is sent unconditionally so a `cheap`/`expensive` site can still mint one, and an
      // `unavailable` site gets the server's honest `RESTORE_POINT_UNAVAILABLE` rejection below
      // rather than a client-side guess.
      await api.createDatabaseRestorePoint({ trigger: "manual", costAck: true });
      load();
    } catch (e) {
      setError(describeApiError(e, "Failed to create restore point"));
    } finally {
      setCreating(false);
    }
  }

  if (error && !points) return <div className="notice error">{error}</div>;
  if (!points) return <div className="notice">Loading restore points…</div>;

  return (
    <div>
      <div className="editor-header">
        <h2>Restore points</h2>
        <button type="button" onClick={createRestorePoint} disabled={creating}>
          {creating ? "Creating…" : "Create restore point"}
        </button>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      {points.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No restore points yet.</p>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
        <table className="list-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Trigger</th>
              <th>Cost class</th>
              <th>Kind</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id}>
                <td>{formatTimestamp(p.createdAt)}</td>
                <td>{p.trigger}</td>
                <td>
                  <span className={`status status-${p.costClass}`}>{p.costClass}</span>
                </td>
                <td>{p.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

type CeremonyStep = "idle" | "planned" | "confirmed" | "done";

function MigrateForwardSection() {
  const [step, setStep] = useState<CeremonyStep>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ planId: string; planHash: string } | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setStep("idle");
    setError(null);
    setPlan(null);
    setConfirmationToken(null);
    setDone(false);
  }

  async function startPlan() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.planMigrateForward();
      setPlan({ planId: r.planId, planHash: r.planHash });
      setStep("planned");
    } catch (e) {
      setError(describeApiError(e, "Failed to plan the forward migration"));
    } finally {
      setBusy(false);
    }
  }

  async function doConfirm() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.confirmMigrateForward({ planId: plan.planId, planHash: plan.planHash });
      setConfirmationToken(r.confirmationToken);
      setStep("confirmed");
    } catch (e) {
      setError(describeApiError(e, "Failed to confirm the forward migration"));
    } finally {
      setBusy(false);
    }
  }

  async function doExecute() {
    if (!confirmationToken) return;
    setBusy(true);
    setError(null);
    try {
      await api.executeMigrateForward(confirmationToken);
      setDone(true);
      setStep("done");
    } catch (e) {
      setError(describeApiError(e, "Failed to execute the forward migration"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="editor-header">
        <h2>Migrate forward</h2>
        {step !== "idle" ? (
          <button type="button" className="btn-ghost" onClick={reset} disabled={busy}>
            Reset
          </button>
        ) : null}
      </div>
      <p className="muted-cell">
        Brings this site's schema up to the latest migration, capturing a restore point first when the
        site's restore-point mechanism allows it.
      </p>
      {error ? <div className="notice error">{error}</div> : null}

      {step === "idle" ? (
        <button type="button" className="btn-ghost" onClick={startPlan} disabled={busy}>
          {busy ? "Planning…" : "Plan migration"}
        </button>
      ) : null}

      {step === "planned" && plan ? (
        <div className="notice">
          <p>
            Plan ready (plan <code>{plan.planId}</code>). Confirming issues a one-time execution
            token — nothing is migrated yet.
          </p>
          <button type="button" className="btn-secondary" onClick={doConfirm} disabled={busy}>
            {busy ? "Confirming…" : "Confirm migration"}
          </button>
        </div>
      ) : null}

      {step === "confirmed" && confirmationToken ? (
        <div className="notice">
          <p>Confirmed. Executing runs the migration now.</p>
          <button type="button" className="btn-warning" onClick={doExecute} disabled={busy}>
            {busy ? "Migrating…" : "Execute migration"}
          </button>
        </div>
      ) : null}

      {step === "done" && done ? (
        <div className="notice">
          <p role="status">Migration executed successfully.</p>
        </div>
      ) : null}
    </div>
  );
}

export function Database() {
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Design & System</p>
          <h1 className="page-title">Database</h1>
          <p className="page-description">
            A read-first record of every migration, snapshot, index change, and template upgrade on this site.
          </p>
        </div>
      </div>
      <TimelineSection />
      <RestorePointsSection />
      <MigrateForwardSection />
    </div>
  );
}
