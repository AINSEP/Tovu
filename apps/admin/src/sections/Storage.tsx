import { useEffect, useState } from "react";
import { ApiError, api, type AdminLedgerRow, type AdminRestorePoint } from "../lib/api";

/**
 * @file Storage screen (design-spec.md §3, ADR-041) — the `#/section/storage` route: the
 * read-first Timeline plus the restore-points list. Structural reference: `Analytics.tsx`'s
 * "raw ingest, said so explicitly" pattern (design-spec.md §0.3).
 *
 * Scope note (disclosed, per design-spec.md §3.8/§5 and progress-ledger.md "Session 5"): only
 * `GET /storage/timeline` and `GET`/`POST /storage/restore-points` are real routes. The
 * migrate-forward plan/confirm/execute ceremony, the drift banner, the `PENDING_MIGRATION` boot
 * banner, and the Tier-3 browser all need routes that do not exist yet (they need
 * `core/gated-mutations`'s gateway, composed into zero composition roots today) — this screen
 * omits them entirely rather than rendering dead affordances, matching this file's own build-order
 * recommendation ("ship the read-only Timeline now, layer in the write flow once routed").
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

function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
}

/** Stashes a client-constructed `StorageContextEnvelope` for `Recovery.tsx` to re-resolve
 * server-side on arrival (ADR-041 §7/ADR-045 §5, INV-04) — this admin app's hash router has no
 * query-string/state-passing mechanism, so `sessionStorage` carries the envelope across the
 * navigation the same way route state would in a router that supported it. The envelope itself
 * carries display continuity only; `resolveDeepLinkContext` never trusts it as authoritative. */
function navigateToRecoveryWithDeepLink(row: AdminLedgerRow) {
  if (!row.restorePointId) return;
  const envelope = {
    v: 1,
    correlationId: `storage-timeline-${row.id}`,
    siteId: "workspace-local",
    ledgerEventId: row.id,
    restorePointId: row.restorePointId,
    drift: row.kind,
    intent: "view",
    issuedAt: new Date().toISOString(),
  };
  sessionStorage.setItem("recovery-deep-link-envelope", JSON.stringify(envelope));
  window.location.hash = "#/section/recovery";
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
      .getStorageTimeline({
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
      .catch((e) => setError(describeApiError(e, "failed to load the Storage Timeline")))
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
      <form className="notice storage-filter-bar" onSubmit={applyFilters}>
        <label htmlFor="storage-filter-kind">Kind</label>
        <select id="storage-filter-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">(any)</option>
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <label htmlFor="storage-filter-outcome">Outcome</label>
        <input id="storage-filter-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. success" />
        <label htmlFor="storage-filter-from">From</label>
        <input id="storage-filter-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <label htmlFor="storage-filter-to">To</label>
        <input id="storage-filter-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <button type="submit">Apply filters</button>
      </form>

      {error ? <div className="notice error">{error}</div> : null}

      {rows.length === 0 ? (
        <div className="notice">No storage activity recorded yet.</div>
      ) : (
        <>
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
                      <button type="button" className="storage-restore-point-link" onClick={() => navigateToRecoveryWithDeepLink(row)}>
                        View in Recovery →
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{row.createdAt.slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {nextCursor ? (
            <button type="button" onClick={loadMore} disabled={loadingMore}>
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
      .listStorageRestorePoints()
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
      await api.createStorageRestorePoint({ trigger: "manual", costAck: true });
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
        <div className="notice">No restore points yet.</div>
      ) : (
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
                <td>{p.createdAt.slice(0, 16).replace("T", " ")}</td>
                <td>{p.trigger}</td>
                <td>
                  <span className={`status status-${p.costClass}`}>{p.costClass}</span>
                </td>
                <td>{p.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function Storage() {
  return (
    <div>
      <h1>Storage</h1>
      <p>A read-first record of every migration, snapshot, index change, and template upgrade on this site.</p>
      <TimelineSection />
      <RestorePointsSection />
    </div>
  );
}
