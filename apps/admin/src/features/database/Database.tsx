import { type AdminLedgerRow } from "../../lib/api";
import { formatTimestamp } from "../../lib/format-timestamp";
import { DataTable } from "@jini-ai/admin/react";

import { navigateToRecoveryWithDeepLink, useTimelineSection } from "./hooks/use-timeline-section.hooks";
import { useRestorePointsSection } from "./hooks/use-restore-points-section.hooks";
import { useMigrateForwardSection } from "./hooks/use-migrate-forward-section.hooks";

/**
 * @file Database screen (design-spec.md §3, ADR-041) — the `/admin/database` route: the
 * read-first Timeline, the restore-points list, and the migrate-forward ceremony. Markup only.
 *
 * State and API calls live in `hooks/use-timeline-section.hooks.ts`,
 * `hooks/use-restore-points-section.hooks.ts`, and `hooks/use-migrate-forward-section.hooks.ts` —
 * one per section, matching the three independent pieces of screen state. Structural reference:
 * `Analytics.tsx`'s "raw ingest, said so explicitly" pattern (design-spec.md §0.3).
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

export interface TimelineSectionProps {
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. Mirrored per-section below (`RestorePointsSectionProps`,
   *  `MigrateForwardSectionProps`) since each section owns independent state. */
  useTimelineSectionHook?: typeof useTimelineSection;
}

function TimelineSection({ useTimelineSectionHook = useTimelineSection }: TimelineSectionProps = {}) {
  const { 
    rows, 
    nextCursor, 
    error, 
    kind, 
    setKind, 
    outcome, 
    setOutcome, 
    fromDate, 
    setFromDate, 
    toDate, 
    setToDate, 
    loadingMore, 
    applyFilters, 
    loadMore 
  } =
    useTimelineSectionHook();

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
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { key: "kind", header: "Kind", cell: (row) => row.kind },
              {
                key: "outcome",
                header: "Outcome",
                cell: (row) => <span className={`status status-${row.outcome}`}>{row.outcome}</span>,
              },
              {
                key: "restore-point",
                header: "Restore point",
                cell: (row: AdminLedgerRow) =>
                  row.restorePointId ? (
                    <button
                      type="button"
                      className="database-restore-point-link"
                      onClick={() => navigateToRecoveryWithDeepLink(row)}
                    >
                      View in Recovery →
                    </button>
                  ) : (
                    "—"
                  ),
              },
              { key: "time", header: "Time", cell: (row) => formatTimestamp(row.createdAt) },
            ]}
          />
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

export interface RestorePointsSectionProps {
  useRestorePointsSectionHook?: typeof useRestorePointsSection;
}

function RestorePointsSection({ useRestorePointsSectionHook = useRestorePointsSection }: RestorePointsSectionProps = {}) {
  const { points, error, creating, createRestorePoint } = useRestorePointsSectionHook();

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
      <DataTable
        rows={points}
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
          { key: "kind", header: "Kind", cell: (p) => p.kind },
        ]}
      />
    </div>
  );
}

export interface MigrateForwardSectionProps {
  useMigrateForwardSectionHook?: typeof useMigrateForwardSection;
}

function MigrateForwardSection({ useMigrateForwardSectionHook = useMigrateForwardSection }: MigrateForwardSectionProps = {}) {
  const { step, busy, error, plan, confirmationToken, done, reset, startPlan, doConfirm, doExecute } = useMigrateForwardSectionHook();

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
          <p className="page-kicker">Operations</p>
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
