import { type AdminLedgerRow } from "../../lib/api";
import { formatTimestamp } from "../../lib/format-timestamp";
import { DataTable } from "@jini-ai/admin/react";

import { navigateToRecoveryWithDeepLink, useTimelineSection } from "./hooks/use-timeline-section.hooks";
import { useRestorePointsSection } from "./hooks/use-restore-points-section.hooks";
import { useMigrateForwardSection, type MigrateForwardSectionController } from "./hooks/use-migrate-forward-section.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t, planReadyMessage } from "./database-i18n";

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
 *
 * `Database` itself has no hook of its own (no single fetch/state this top-level shell owns), so it
 * keeps calling `useAdminLocale()`/`database-i18n`'s `t` directly for its own header text — per the
 * standing i18n rule's carve-out for components with no hook file. Each SECTION below (`useTimeline
 * Section`, `useRestorePointsSection`, `useMigrateForwardSection`) already independently resolves
 * `useAdminLocale()` for its own internal error-string translations (unrelated to this file), so
 * `t`/`locale` are now sourced from each section's own hook rather than threaded down from
 * `Database` as a prop — that prop was redundant with a resolution each hook was already doing.
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
  locale: string;
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
  const { locale } = props;
  return (
    <form className="notice database-filter-bar toolbar" onSubmit={props.onSubmit}>
      <div className="field">
        <label className="field-label" htmlFor="database-filter-kind">{t(locale, "Kind")}</label>
        <select id="database-filter-kind" value={props.kind} onChange={(e) => props.onKindChange(e.target.value)}>
          <option value="">{t(locale, "(any)")}</option>
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="database-filter-outcome">{t(locale, "Outcome")}</label>
        <input
          id="database-filter-outcome"
          value={props.outcome}
          onChange={(e) => props.onOutcomeChange(e.target.value)}
          placeholder={t(locale, "e.g. success")}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="database-filter-from">{t(locale, "From")}</label>
        <input
          id="database-filter-from"
          type="date"
          value={props.fromDate}
          onChange={(e) => props.onFromDateChange(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="database-filter-to">{t(locale, "To")}</label>
        <input id="database-filter-to" type="date" value={props.toDate} onChange={(e) => props.onToDateChange(e.target.value)} />
      </div>
      <button type="submit" className="btn-secondary">{t(locale, "Apply filters")}</button>
    </form>
  );
}

/** Builds the Timeline `DataTable`'s column descriptors. A plain function rather than a closure
 *  declared inside `TimelineBody`'s body — it closes over nothing but module-scope values, so it
 *  takes no parameters at all beyond `locale`. */
function timelineColumns(locale: string): Array<{
  key: string;
  header: string;
  cell: (row: AdminLedgerRow) => React.ReactNode;
}> {
  return [
    { key: "kind", header: t(locale, "Kind"), cell: (row) => row.kind },
    {
      key: "outcome",
      header: t(locale, "Outcome"),
      cell: (row) => <span className={`status status-${row.outcome}`}>{row.outcome}</span>,
    },
    {
      key: "restore-point",
      header: t(locale, "Restore point"),
      cell: (row: AdminLedgerRow) =>
        row.restorePointId ? (
          <button type="button" className="database-restore-point-link" onClick={() => navigateToRecoveryWithDeepLink(row)}>
            {t(locale, "View in Recovery →")}
          </button>
        ) : (
          "—"
        ),
    },
    { key: "time", header: t(locale, "Time"), cell: (row) => formatTimestamp(row.createdAt) },
  ];
}

/** The Timeline's own row-activity body — empty state or the table + pager. Split out from
 *  `TimelineSection` (which still owns the loading/error early returns) so each state is a flat
 *  if-return rather than a nested ternary. */
function TimelineBody(props: { locale: string; rows: AdminLedgerRow[]; nextCursor: string | null; loadingMore: boolean; loadMore: () => void }) {
  const { locale } = props;
  if (props.rows.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>{t(locale, "No database activity recorded yet.")}</p>
        </div>
      </div>
    );
  }
  return (
    <>
      <DataTable rows={props.rows} rowKey={(row) => row.id} columns={timelineColumns(locale)} />
      {props.nextCursor ? (
        <button type="button" className="btn-secondary" onClick={props.loadMore} disabled={props.loadingMore}>
          {props.loadingMore ? t(locale, "Loading…") : t(locale, "Load more")}
        </button>
      ) : null}
    </>
  );
}

function TimelineSection({ useTimelineSectionHook = useTimelineSection }: TimelineSectionProps) {
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
    loadMore,
    t,
    locale,
  } = useTimelineSectionHook();

  if (error && !rows) return <div className="notice error">{error}</div>;
  if (!rows) return <div className="notice">{t("Loading timeline…")}</div>;

  return (
    <div>
      <TimelineFilterForm
        locale={locale}
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

      <TimelineBody locale={locale} rows={rows} nextCursor={nextCursor} loadingMore={loadingMore} loadMore={loadMore} />
    </div>
  );
}

export interface RestorePointsSectionProps {
  useRestorePointsSectionHook?: typeof useRestorePointsSection;
}

function RestorePointsSection({ useRestorePointsSectionHook = useRestorePointsSection }: RestorePointsSectionProps) {
  const { points, error, creating, createRestorePoint, t } = useRestorePointsSectionHook();

  if (error && !points) return <div className="notice error">{error}</div>;
  if (!points) return <div className="notice">{t("Loading restore points…")}</div>;

  return (
    <div>
      <div className="editor-header">
        <h2>{t("Restore points")}</h2>
        <button type="button" onClick={createRestorePoint} disabled={creating}>
          {creating ? t("Creating…") : t("Create restore point")}
        </button>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <DataTable
        rows={points}
        rowKey={(p) => p.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t("No restore points yet.")}</p>
            </div>
          </div>
        }
        columns={[
          { key: "timestamp", header: t("Timestamp"), cell: (p) => formatTimestamp(p.createdAt) },
          { key: "trigger", header: t("Trigger"), cell: (p) => p.trigger },
          {
            key: "cost-class",
            header: t("Cost class"),
            cell: (p) => <span className={`status status-${p.costClass}`}>{p.costClass}</span>,
          },
          { key: "kind", header: t("Kind"), cell: (p) => p.kind },
        ]}
      />
    </div>
  );
}

export interface MigrateForwardSectionProps {
  useMigrateForwardSectionHook?: typeof useMigrateForwardSection;
}

/** step === "idle": the entry point into the ceremony. */
function PlanMigrationStep(props: { locale: string; busy: boolean; onStartPlan: () => void }) {
  return (
    <button type="button" className="btn-ghost" onClick={props.onStartPlan} disabled={props.busy}>
      {props.busy ? t(props.locale, "Planning…") : t(props.locale, "Plan migration")}
    </button>
  );
}

/** step === "planned": nothing is migrated yet — confirming only issues a one-time execution
 *  token. `plan` is checked by the caller ({@link migrateForwardStep}), not here — the "defensive
 *  AND" (render nothing if the step/data pair is inconsistent) is the dispatch's job, not this
 *  component's. */
function PlannedStep(props: { locale: string; plan: { planId: string }; busy: boolean; onConfirm: () => void }) {
  return (
    <div className="notice">
      <p>{planReadyMessage(props.locale, props.plan.planId)}</p>
      <button type="button" className="btn-secondary" onClick={props.onConfirm} disabled={props.busy}>
        {props.busy ? t(props.locale, "Confirming…") : t(props.locale, "Confirm migration")}
      </button>
    </div>
  );
}

/** step === "confirmed": the token from `PlannedStep` is in hand; executing now actually runs the
 *  migration. */
function ConfirmedStep(props: { locale: string; busy: boolean; onExecute: () => void }) {
  return (
    <div className="notice">
      <p>{t(props.locale, "Confirmed. Executing runs the migration now.")}</p>
      <button type="button" className="btn-warning" onClick={props.onExecute} disabled={props.busy}>
        {props.busy ? t(props.locale, "Migrating…") : t(props.locale, "Execute migration")}
      </button>
    </div>
  );
}

/** step === "done": terminal state. */
function DoneStep(props: { locale: string }) {
  return (
    <div className="notice">
      <p role="status">{t(props.locale, "Migration executed successfully.")}</p>
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
  locale: string;
  step: MigrateForwardSectionController["step"];
  plan: MigrateForwardSectionController["plan"];
  confirmationToken: MigrateForwardSectionController["confirmationToken"];
  done: boolean;
  busy: boolean;
  onStartPlan: () => void;
  onConfirm: () => void;
  onExecute: () => void;
}) {
  if (props.step === "idle") return <PlanMigrationStep locale={props.locale} busy={props.busy} onStartPlan={props.onStartPlan} />;
  if (props.step === "planned" && props.plan) {
    return <PlannedStep locale={props.locale} plan={props.plan} busy={props.busy} onConfirm={props.onConfirm} />;
  }
  if (props.step === "confirmed" && props.confirmationToken) {
    return <ConfirmedStep locale={props.locale} busy={props.busy} onExecute={props.onExecute} />;
  }
  if (props.step === "done" && props.done) return <DoneStep locale={props.locale} />;
  return null;
}

function MigrateForwardSection({ useMigrateForwardSectionHook = useMigrateForwardSection }: MigrateForwardSectionProps) {
  const { step, busy, error, plan, confirmationToken, done, reset, startPlan, doConfirm, doExecute, t, locale } = useMigrateForwardSectionHook();

  return (
    <div>
      <div className="editor-header">
        <h2>{t("Migrate forward")}</h2>
        {step !== "idle" ? (
          <button type="button" className="btn-ghost" onClick={reset} disabled={busy}>
            {t("Reset")}
          </button>
        ) : null}
      </div>
      <p className="muted-cell">
        {t("Brings this site's schema up to the latest migration, capturing a restore point first when the site's restore-point mechanism allows it.")}
      </p>
      {error ? <div className="notice error">{error}</div> : null}

      {migrateForwardStep({
        locale,
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
  const locale = useAdminLocale();
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t(locale, "Operations")}</p>
          <h1 className="page-title">{t(locale, "Database")}</h1>
          <p className="page-description">
            {t(locale, "A read-first record of every migration, snapshot, index change, and template upgrade on this site.")}
          </p>
        </div>
      </div>
      <TimelineSection />
      <RestorePointsSection />
      <MigrateForwardSection />
    </div>
  );
}
