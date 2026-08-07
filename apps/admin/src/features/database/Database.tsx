import { type AdminLedgerRow } from "../../lib/api";
import { formatTimestamp } from "../../lib/format-timestamp";
import { DataTable } from "@jini-ai/admin/react";

import { navigateToRecoveryWithDeepLink, useTimelineSection } from "./hooks/use-timeline-section.hooks";
import { useRestorePointsSection } from "./hooks/use-restore-points-section.hooks";
import { useMigrateForwardSection, type MigrateForwardSectionController } from "./hooks/use-migrate-forward-section.hooks";

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

/** The Timeline's filter bar. Pure presentation, no branching of its own beyond the
 *  `KIND_OPTIONS` map (its own function scope). Top-level rather than inline in `TimelineSection`'s
 *  body, per the complexity-ceiling pass's extraction rule. */
function TimelineFilterForm(props: {
  onSubmit: (e: React.FormEvent) => void;
  kind: string;
  onKindChange: (kind: string) => void;
  outcome: string;
  onOutcomeChange: (outcome: string) => void;
  fromDate: string;
  onFromDateChange: (fromDate: string) => void;
  toDate: string;
  onToDateChange: (toDate: string) => void;
}) {
  return (
    <form className="notice database-filter-bar toolbar" onSubmit={props.onSubmit}>
      <div className="field">
        <label className="field-label" htmlFor="database-filter-kind">Kind</label>
        <select id="database-filter-kind" value={props.kind} onChange={(e) => props.onKindChange(e.target.value)}>
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
        <input
          id="database-filter-outcome"
          value={props.outcome}
          onChange={(e) => props.onOutcomeChange(e.target.value)}
          placeholder="e.g. success"
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="database-filter-from">From</label>
        <input
          id="database-filter-from"
          type="date"
          value={props.fromDate}
          onChange={(e) => props.onFromDateChange(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="database-filter-to">To</label>
        <input id="database-filter-to" type="date" value={props.toDate} onChange={(e) => props.onToDateChange(e.target.value)} />
      </div>
      <button type="submit" className="btn-secondary">Apply filters</button>
    </form>
  );
}

/** Builds the Timeline `DataTable`'s column descriptors. A plain function rather than a closure
 *  declared inside `TimelineBody`'s body — it closes over nothing but module-scope values, so it
 *  takes no parameters at all. */
function timelineColumns(): Array<{
  key: string;
  header: string;
  cell: (row: AdminLedgerRow) => React.ReactNode;
}> {
  return [
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
          <button type="button" className="database-restore-point-link" onClick={() => navigateToRecoveryWithDeepLink(row)}>
            View in Recovery →
          </button>
        ) : (
          "—"
        ),
    },
    { key: "time", header: "Time", cell: (row) => formatTimestamp(row.createdAt) },
  ];
}

/** The Timeline's own row-activity body — empty state or the table + pager. Split out from
 *  `TimelineSection` (which still owns the loading/error early returns) so each state is a flat
 *  if-return rather than a nested ternary. */
function TimelineBody(props: { rows: AdminLedgerRow[]; nextCursor: string | null; loadingMore: boolean; loadMore: () => void }) {
  if (props.rows.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>No database activity recorded yet.</p>
        </div>
      </div>
    );
  }
  return (
    <>
      <DataTable rows={props.rows} rowKey={(row) => row.id} columns={timelineColumns()} />
      {props.nextCursor ? (
        <button type="button" className="btn-secondary" onClick={props.loadMore} disabled={props.loadingMore}>
          {props.loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </>
  );
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
      <TimelineFilterForm
        onSubmit={applyFilters}
        kind={kind}
        onKindChange={setKind}
        outcome={outcome}
        onOutcomeChange={setOutcome}
        fromDate={fromDate}
        onFromDateChange={setFromDate}
        toDate={toDate}
        onToDateChange={setToDate}
      />

      {error ? <div className="notice error">{error}</div> : null}

      <TimelineBody rows={rows} nextCursor={nextCursor} loadingMore={loadingMore} loadMore={loadMore} />
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

/** step === "idle": the entry point into the ceremony. */
function PlanMigrationStep(props: { busy: boolean; onStartPlan: () => void }) {
  return (
    <button type="button" className="btn-ghost" onClick={props.onStartPlan} disabled={props.busy}>
      {props.busy ? "Planning…" : "Plan migration"}
    </button>
  );
}

/** step === "planned": nothing is migrated yet — confirming only issues a one-time execution
 *  token. `plan` is checked by the caller ({@link migrateForwardStep}), not here — the "defensive
 *  AND" (render nothing if the step/data pair is inconsistent) is the dispatch's job, not this
 *  component's. */
function PlannedStep(props: { plan: { planId: string }; busy: boolean; onConfirm: () => void }) {
  return (
    <div className="notice">
      <p>
        Plan ready (plan <code>{props.plan.planId}</code>). Confirming issues a one-time execution
        token — nothing is migrated yet.
      </p>
      <button type="button" className="btn-secondary" onClick={props.onConfirm} disabled={props.busy}>
        {props.busy ? "Confirming…" : "Confirm migration"}
      </button>
    </div>
  );
}

/** step === "confirmed": the token from `PlannedStep` is in hand; executing now actually runs the
 *  migration. */
function ConfirmedStep(props: { busy: boolean; onExecute: () => void }) {
  return (
    <div className="notice">
      <p>Confirmed. Executing runs the migration now.</p>
      <button type="button" className="btn-warning" onClick={props.onExecute} disabled={props.busy}>
        {props.busy ? "Migrating…" : "Execute migration"}
      </button>
    </div>
  );
}

/** step === "done": terminal state. */
function DoneStep() {
  return (
    <div className="notice">
      <p role="status">Migration executed successfully.</p>
    </div>
  );
}

/** Dispatches the ceremony's one active step as a flat if-chain — the four steps were previously
 *  four independent `step === X && data` JSX ternaries in `MigrateForwardSection`'s own body,
 *  which is what pushed its cognitive score past the ceiling (each guard reads as "is this the
 *  active step AND is its data actually present", four times over). Each `&& data` pairing is
 *  preserved exactly: a step whose expected payload is unexpectedly null renders nothing, same as
 *  before (see the "defensive AND" tests in `Database.unit.test.tsx`). */
function migrateForwardStep(props: {
  step: MigrateForwardSectionController["step"];
  plan: MigrateForwardSectionController["plan"];
  confirmationToken: MigrateForwardSectionController["confirmationToken"];
  done: boolean;
  busy: boolean;
  onStartPlan: () => void;
  onConfirm: () => void;
  onExecute: () => void;
}) {
  if (props.step === "idle") return <PlanMigrationStep busy={props.busy} onStartPlan={props.onStartPlan} />;
  if (props.step === "planned" && props.plan) {
    return <PlannedStep plan={props.plan} busy={props.busy} onConfirm={props.onConfirm} />;
  }
  if (props.step === "confirmed" && props.confirmationToken) {
    return <ConfirmedStep busy={props.busy} onExecute={props.onExecute} />;
  }
  if (props.step === "done" && props.done) return <DoneStep />;
  return null;
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

      {migrateForwardStep({
        step,
        plan,
        confirmationToken,
        done,
        busy,
        onStartPlan: startPlan,
        onConfirm: doConfirm,
        onExecute: doExecute,
      })}
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
