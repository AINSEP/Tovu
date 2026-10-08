import { DataTable } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import { I18nProvider, SETTINGS_DIALOG_DICTIONARIES, SettingsDialogShell, type SettingsDialogTab } from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";

import { buildAgentListHandles } from "@jini-ai/agentic";
import { formatTimestamp } from "@jini-ai/ui/panel-kit";
import type { AdminDisclosureResult, AdminRecoveryStatus, AdminRestorePoint } from "../../lib/api";
import {
  categoryLabel,
  costClassLabel,
  isAssertiveRecoveryBanner,
  recoveryBannerTone,
  restoreButtonAccessibleName,
} from "./rules";
import { useWiredRecovery } from "./hooks/use-recovery.hooks";
import { useRecoveryNavigation } from "./hooks/use-recovery-navigation.hooks";
import { ServerLabel } from "@/components/status-labels";
import { useWiredRestoreFlow, type CeremonyStep } from "./hooks/use-restore-flow.hooks";
import {
  t,
  sinceDiscardMessage,
  discardCountLine,
  baselineUnavailableMessage,
  restorePlanReadyMessage,
  restoreDoneMessage,
} from "./recovery-i18n";

/**
 * @file Recovery screen (design-spec.md §4, ADR-045) — the `/admin/recovery` route.
 *
 * Per design-spec.md §0.1: one screen, holding every restore-point capability — never a separate
 * "Backups" route (ADR-045 explicitly rejects that shape). `development/todos.md`'s "Recovery vs
 * Database's Restore Points tab" entry (owner, 2026-09-10, superseded same morning) is the reason
 * this now has two tabs rather than Database's old three: Database's `RestorePointsSection`
 * (list + create, no restore action) moved here in full, and Database's own `restore-points` tab
 * was removed — restore points were never a "database" concern per the owner's own call. This
 * still applies §6's own recommendation (a full swap, not a modal-over-list) — the swap is now
 * between the two tabs below instead of an untabbed inline ternary.
 *
 * ## Tabs (2026-09-10)
 *
 * The initial implementation chose `TabBar` because this is a list-plus-ceremony operational
 * surface, the same shape as Database, rather than a settings form. The owner's explicit
 * `SettingsDialogShell` requirement takes precedence (2026-10-04 cleanup): the inline shell now
 * matches Agent Plugins, while retaining `?tab=` deep-linking and replace-history navigation.
 * Two tabs: **Restore points** (`RestorePointsPanel` — the list, the create action, and
 * the entry point into a restore) and **Restore** (`RestoreTabPanel` — `RestoreFlow` for whichever
 * point is selected, or a prompt back to the list when nothing is selected yet). Selecting a row
 * and confirming/cancelling the ceremony both navigate between the two tabs explicitly (see
 * `use-recovery-navigation.hooks.ts`) rather than deriving the active tab from `selected` — both
 * sections stay independently reachable either way, same as Database's URL-owned tabs.
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
 * `Recovery`'s own list/status/create state lives in `hooks/use-recovery.hooks.ts`; `RestoreFlow`'s
 * ceremony state lives in `hooks/use-restore-flow.hooks.ts` — independent state with its own
 * lifecycle, keyed to whichever restore point is selected. `DegradedBannerView`,
 * `RestorePointsList`, `RestorePointsPanel`, and `DisclosurePanel` hold no state of their own and
 * stay as plain, props-driven presentation with no hook. Pure logic (category labels, cost-class
 * badge text/tone, the banner urgency check and severity, the deep-link envelope parse) lives in
 * `rules.ts`.
 *
 * `src/__tests__/unit/admin-nav-recovery-acs.unit.test.ts` reads this file's source directly
 * (`readFileSync`) to assert AC-32 against the `page-description` copy below — keep that
 * `className="page-description">...</p>` line intact if editing the header copy.
 *
 * `locale`/`t`: `Recovery` and `RestoreFlow` each have their own hook (`useRecovery`,
 * `useRestoreFlow`), and each hook already independently calls `useAdminLocale()` for its own
 * error-string translations — so each component now gets `t`/`locale` from its OWN hook rather than
 * `Recovery` threading a single resolved `locale` down as a prop, per the standing i18n rule. This
 * adds no new fetch (see each hook's own file header). `DegradedBannerView`/`RestorePointsList`/
 * `RestorePointsPanel` have no hook of their own, so they keep receiving `locale` as a prop from
 * `Recovery` and import `t` directly — same carve-out `Database.tsx`'s local subcomponents use.
 */

function DegradedBannerView(props: { locale: string; status: AdminRecoveryStatus }) {
  const { locale, status } = props;
  const banner = status.banner;
  if (!banner) return null;

  // AC-27/EC-06/INV-07: `pending-migration`'s action always deep-links to Database's own
  // migration ceremony, never a Recovery restore action — restoring to an older snapshot does not
  // resolve schema drift against the current runtime.
  const assertive = isAssertiveRecoveryBanner(banner);
  // Not every degraded state is equally bad — see `recoveryBannerTone`'s own doc comment.
  const tone = recoveryBannerTone(banner);

  return (
    <div
      className={`notice ${tone} recovery-degraded-banner recovery-plain-notice`}
      role={assertive ? "alert" : undefined}
      aria-live={assertive ? "assertive" : "polite"}
    >
      <span>{banner.accessibleText}</span>
      {banner.actionKind === "deep-link-to-database-migration" ? (
        <a
          className="btn-secondary"
          href="/admin/database"
          {...agentHandle({ handle: "recovery-banner-go-to-database" }, { role: "link", label: "Go to Database to resolve the pending migration" })}
        >
          {t({ locale: locale, key: "Go to Database" })}
        </a>
      ) : null}
      {banner.actionKind === "unblock-interrupted-migration" ? (
        <button
          type="button"
          disabled
          title={t({ locale: locale, key: "No unblock route exists yet — see this screen's file header." })}
          {...agentHandle({ handle: "recovery-banner-unblock" }, { role: "button", label: "Unblock an interrupted migration (not yet available)" })}
        >
          {t({ locale: locale, key: "Unblock (not yet available)" })}
        </button>
      ) : null}
    </div>
  );
}

function RestorePointsList(props: {
  locale: string;
  points: AdminRestorePoint[];
  onSelect: (point: AdminRestorePoint) => void;
}) {
  const { locale } = props;
  // Restore-point ids are stable and unique, same per-row-handle derivation every other list on
  // this workstream uses (`buildAgentListHandles`) — needed because `DataTable`'s `cell` callback
  // only receives the row, not its index.
  const rowHandles = buildAgentListHandles({ prefix: "recovery-row", ids: props.points.map((p) => p.id) }
  );
  const rowHandleById = new Map(props.points.map((p, index) => [p.id, rowHandles[index]!]));
  return (
    <DataTable
      rows={props.points}
      rowKey={(p) => p.id}
      empty={
        <div className="card">
          <div className="empty-state">
            <p>{t({ locale: locale, key: "No restore points yet." })}</p>
          </div>
        </div>
      }
      columns={[
        { key: "timestamp", header: t({ locale: locale, key: "Timestamp" }), cell: (p) => formatTimestamp({ iso: p.createdAt }, { timeZone: "local" }) },
        { key: "trigger", header: t({ locale: locale, key: "Trigger" }), cell: (p) => p.trigger },
        {
          key: "cost-class",
          header: t({ locale: locale, key: "Cost class" }),
          cell: (p) => <span className={`status status-${p.costClass}`}>{costClassLabel(p.costClass, locale)}</span>,
        },
        {
          key: "restore",
          cell: (p) =>
            p.costClass === "unavailable" ? (
              <span className="muted-cell">{t({ locale: locale, key: "No restore-point mechanism available — see the runbook." })}</span>
            ) : (
              <button
                type="button"
                onClick={() => props.onSelect(p)}
                // Every row's visible text is the identical "Restore…" — see
                // `rules.ts`'s `restoreButtonAccessibleName` doc comment for why that is ambiguous
                // to anything resolving elements by accessible name rather than table position, and
                // why this is the one screen where that ambiguity matters most.
                aria-label={restoreButtonAccessibleName(locale, p)}
                {...agentHandle({ handle: `${rowHandleById.get(p.id)}-restore` }, { role: "button", label: "Begin the restore ceremony for this restore point" })}
              >
                {t({ locale: locale, key: "Restore…" })}
              </button>
            ),
        },
      ]}
    />
  );
}

/** The "Restore points" tab's full panel — `RestorePointsList` (unchanged from before the tabs
 *  pass) plus the create action Database's own `RestorePointsSection` used to own
 *  (`development/todos.md`'s "Recovery vs Database's Restore Points tab" entry, 2026-09-10). Split
 *  out from `RestorePointsList` itself, rather than folding the header/button into it, so the bare
 *  list stays reusable exactly as it already is for anything that only needs the table (there is no
 *  such caller today, but the split cost nothing and matches how `Database.tsx`'s own
 *  `RestorePointsSection` kept its header separate from its `DataTable` call). */
function RestorePointsPanel(props: {
  locale: string;
  points: AdminRestorePoint[];
  creating: boolean;
  onCreate: () => void;
  onSelect: (point: AdminRestorePoint) => void;
}) {
  const { locale } = props;
  return (
    <div>
      <div className="editor-header">
        <h2>{t({ locale: locale, key: "Restore points" })}</h2>
        <button
          type="button"
          onClick={props.onCreate}
          disabled={props.creating}
          {...agentHandle({ handle: "recovery-create-restore-point" }, { role: "button", label: "Create a new restore point now" })}
        >
          {props.creating ? t({ locale: locale, key: "Creating…" }) : t({ locale: locale, key: "Create restore point" })}
        </button>
      </div>
      <RestorePointsList locale={locale} points={props.points} onSelect={props.onSelect} />
    </div>
  );
}

/** Step 2 — the discarded-write-window disclosure (design-spec.md §4.3): the load-bearing,
 * blocking centerpiece of this screen. Renders only categories the server response actually
 * contains (never a placeholder row for an uncovered category), and renders `"unknown"` distinctly
 * from `0` (INV-05 — a `0` implies verified-zero-loss, `"unknown"` means the baseline could not be
 * computed at all; these must never be conflated). */
function DisclosurePanel(props: {
  locale: string;
  point: AdminRestorePoint;
  disclosure: AdminDisclosureResult;
  acknowledged: boolean;
  onAcknowledgeChange: (checked: boolean) => void;
}) {
  const { locale } = props;
  const categories = Object.entries(props.disclosure.counts);

  return (
    <div className="recovery-disclosure-panel">
      <div className="recovery-loss-manifest">
        <p className="recovery-loss-lede">{sinceDiscardMessage(locale, props.point.createdAt)}</p>
        <ul className="recovery-loss-list">
          {categories.map(([category, count]) => (
            <li key={category}>{discardCountLine(locale, count, categoryLabel(category, locale))}</li>
          ))}
        </ul>
        <p className="recovery-loss-caveat">{t({ locale: locale, key: "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here." })}</p>
      </div>
      {/* A SIBLING of the manifest, not a child of it (web-design pass #3, 2026-09-10). This is the
          one sentence on the screen that changes what an operator should do — it says every figure
          they just read is unverified — so it is the composition's rank-1 element and gets the
          card's full width, the same full-bleed band treatment every other region here has. Nested
          inside the manifest it rendered as a rounded red box floating inside a tinted box, which
          is the boxes-in-boxes shape pass #2's own header says it set out to remove.

          Order is unchanged and must stay unchanged: its own text reads "every count **above** is
          shown as 'unknown'", so it has to follow the counts. That sentence is translated as one
          static block in all 19 locales (`BASELINE_UNAVAILABLE_TEXT`), so moving it ahead of the
          ledger would need 19 rewrites, not a reflow. */}
      {!props.disclosure.watermarkBaselineAvailable ? (
        <p className="save-error recovery-baseline-alarm" role="alert">
          {baselineUnavailableMessage(locale)}
        </p>
      ) : null}
      <label id="recovery-ack-label" className="recovery-ack-gate">
        <input
          type="checkbox"
          checked={props.acknowledged}
          onChange={(e) => props.onAcknowledgeChange(e.target.checked)}
          {...agentHandle({ handle: "recovery-disclosure-acknowledge" }, {
            role: "field",
            label: "Acknowledge the discarded-write-window disclosure",
          })}
        />
        {t({ locale: locale, key: "I understand this count is partial, not exhaustive, and accept the loss window described above." })}
      </label>
    </div>
  );
}

/** The disclosure section (top of `RestoreFlow`): the discarded-write-window error, its loading
 * placeholder, or the panel itself, in that priority order. Split out because — along with
 * `RestoreCeremonySteps` below — this is one of the two independent "wide branch set" halves of
 * the original `RestoreFlow`: this half decides what to show about data loss, the other half
 * decides what to show about ceremony progress, and neither needs the other's branches in scope. */
function RestoreDisclosureStatus(props: {
  locale: string;
  point: AdminRestorePoint;
  disclosure: AdminDisclosureResult | null;
  error: string | null;
  acknowledged: boolean;
  onAcknowledgeChange: (checked: boolean) => void;
}) {
  const { locale, point, disclosure, error, acknowledged, onAcknowledgeChange } = props;

  if (error) return <div className="notice error">{error}</div>;
  if (!disclosure) return <div className="notice">{t({ locale: locale, key: "Computing the discarded-write-window disclosure…" })}</div>;
  return <DisclosurePanel locale={locale} point={point} disclosure={disclosure} acknowledged={acknowledged} onAcknowledgeChange={onAcknowledgeChange} />;
}

/** Step 3a (design-spec.md §4.3) — acknowledge-gated entry into the ceremony. Its own component
 * (rather than inline in `RestoreCeremonySteps`) because the busy-label ternary and the
 * not-yet-acknowledged `title` ternary would otherwise nest two levels deep inside that
 * function's own `step === "idle"` branch — exactly the nesting SonarJS's cognitive-complexity
 * rule penalises beyond what the cyclomatic count shows. */
function RestoreIdleStep(props: { locale: string; acknowledged: boolean; busy: boolean; onStart: () => void }) {
  const { locale, acknowledged, busy, onStart } = props;
  return (
    <div className="recovery-ceremony-step">
      <button
        type="button"
        className="btn-primary"
        disabled={!acknowledged || busy}
        aria-describedby="recovery-ack-label"
        title={!acknowledged ? t({ locale: locale, key: "Acknowledge the disclosure above to continue." }) : undefined}
        onClick={onStart}
        {...agentHandle({ handle: "recovery-restore-start" }, { role: "button", label: "Continue to confirm the restore" })}
      >
        {busy ? t({ locale: locale, key: "Planning…" }) : t({ locale: locale, key: "Continue to confirm" })}
      </button>
    </div>
  );
}

/** Step 3b (SPEC-019 C-301) — plan issued, not yet confirmed. */
function RestorePlannedStep(props: { locale: string; planId: string; busy: boolean; onConfirm: () => void }) {
  const { locale, planId, busy, onConfirm } = props;
  return (
    <div className="recovery-ceremony-step">
      <p>{restorePlanReadyMessage(locale, planId)}</p>
      <button
        type="button"
        className="btn-secondary"
        onClick={onConfirm}
        disabled={busy}
        {...agentHandle({ handle: "recovery-restore-confirm" }, { role: "button", label: "Confirm the planned restore, issuing a one-time execution token" })}
      >
        {busy ? t({ locale: locale, key: "Confirming…" }) : t({ locale: locale, key: "Confirm restore" })}
      </button>
    </div>
  );
}

/** Step 3c (SPEC-019 C-302) — confirmed, execution token in hand, not yet executed. */
function RestoreConfirmedStep(props: { locale: string; busy: boolean; onExecute: () => void }) {
  const { locale, busy, onExecute } = props;
  return (
    <div className="recovery-ceremony-step">
      <p>{t({ locale: locale, key: "Confirmed. Executing performs the restore — this cannot be undone." })}</p>
      <button
        type="button"
        className="btn-danger"
        onClick={onExecute}
        disabled={busy}
        {...agentHandle({ handle: "recovery-restore-execute" }, { role: "button", label: "Execute the confirmed restore now — cannot be undone" })}
      >
        {busy ? t({ locale: locale, key: "Restoring…" }) : t({ locale: locale, key: "Execute restore" })}
      </button>
    </div>
  );
}

/** Step 3d (SPEC-019 C-303) — the ceremony's terminal state. `restartRequired` (2026-07-16,
 * `DbOpsPort.restoreFromArtifact`) surfaces the "already-running process still holds the
 * pre-restore file handle" caveat described in this file's header, rather than silently implying
 * a live hot-swap happened. */
function RestoreDoneStep(props: { locale: string; restoreRunId: string; state: string; restartRequired?: boolean }) {
  const { locale, restoreRunId, state, restartRequired } = props;
  return (
    <div className="recovery-ceremony-step">
      <p role="status">
        {restoreDoneMessage(locale, restoreRunId, <span className={`status status-${state}`}><ServerLabel value={state} /></span>)}
      </p>
      {restartRequired ? (
        <p className="save-error" role="alert">
          {t({ locale: locale, key: "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data." })}
        </p>
      ) : null}
    </div>
  );
}

/** The four-stage ceremony switch (idle → planned → confirmed → done) plus its own error slot.
 * Exactly one of the four step components below renders at a time, keyed off `step` — this
 * function owns that selection so `RestoreFlow` itself doesn't have to. */
function RestoreCeremonySteps(props: {
  locale: string;
  ceremonyError: string | null;
  step: CeremonyStep;
  busy: boolean;
  acknowledged: boolean;
  plan: { planId: string } | null;
  confirmationToken: string | null;
  result: { restoreRunId: string; state: string; restartRequired?: boolean } | null;
  onStart: () => void;
  onConfirm: () => void;
  onExecute: () => void;
}) {
  const { locale, ceremonyError, step, busy, acknowledged, plan, confirmationToken, result, onStart, onConfirm, onExecute } = props;

  return (
    <>
      {ceremonyError ? <div className="notice error">{ceremonyError}</div> : null}
      {step === "idle" ? <RestoreIdleStep locale={locale} acknowledged={acknowledged} busy={busy} onStart={onStart} /> : null}
      {step === "planned" && plan ? <RestorePlannedStep locale={locale} planId={plan.planId} busy={busy} onConfirm={onConfirm} /> : null}
      {step === "confirmed" && confirmationToken ? <RestoreConfirmedStep locale={locale} busy={busy} onExecute={onExecute} /> : null}
      {step === "done" && result ? (
        <RestoreDoneStep locale={locale} restoreRunId={result.restoreRunId} state={result.state} restartRequired={result.restartRequired} />
      ) : null}
    </>
  );
}

export interface RestoreFlowProps {
  point: AdminRestorePoint;
  onBack: () => void;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention.
   *  Defaulted to the WIRED hook (2026-08-14, Orc-BASH pass) — see `use-restore-flow.hooks.ts`'s
   *  own `useWiredRestoreFlow`. */
  useRestoreFlowHook?: typeof useWiredRestoreFlow;
}

function RestoreFlow({
  point,
  onBack,
  useRestoreFlowHook = useWiredRestoreFlow
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
    t,
    locale,
  } = useRestoreFlowHook({ point });

  return (
    <div className="recovery-restore-docket">
      <button
        type="button"
        className="btn-ghost recovery-back-link"
        onClick={onBack}
        {...agentHandle({ handle: "recovery-back-to-list" }, { role: "button", label: "Back to the restore points list" })}
      >
        {t("← Restore points")}
      </button>
      <div className="card recovery-restore-card">
        <div className="recovery-ceremony-summary">
          <div className="recovery-restore-title-row">
            <h2 className="recovery-restore-title">
              {t("Restore to")} {formatTimestamp({ iso: point.createdAt }, { timeZone: "local" })}
            </h2>
            <span className="visually-hidden">{t("Cost class")}</span>
            <span className={`status status-${point.costClass}`}>{costClassLabel(point.costClass, locale)}</span>
          </div>
          <p className="recovery-restore-meta">
            <span>
              <span className="recovery-meta-key">{t("Trigger")}</span>
              <span className="recovery-meta-value">{point.trigger}</span>
            </span>
            <span>
              <span className="recovery-meta-key">{t("Kind")}</span>
              <span className="recovery-meta-value">{point.kind}</span>
            </span>
          </p>
        </div>

        <RestoreDisclosureStatus locale={locale} point={point} disclosure={disclosure} error={error} acknowledged={acknowledged} onAcknowledgeChange={setAcknowledged} />

        <RestoreCeremonySteps
          locale={locale}
          ceremonyError={ceremonyError}
          step={step}
          busy={busy}
          acknowledged={acknowledged}
          plan={plan}
          confirmationToken={confirmationToken}
          result={result}
          onStart={startPlan}
          onConfirm={doConfirm}
          onExecute={doExecute}
        />
      </div>
    </div>
  );
}

/** The "Restore" tab's own panel — `RestoreFlow` for whichever point is selected, or a prompt back
 *  to the "Restore points" tab when nothing is selected yet (a direct `?tab=restore` visit, or the
 *  ceremony was already backed out of via `onBack`). Originally split out so `recoveryTabPanel`
 *  stayed a flat dispatch (Database's same complexity-gate reason). The shared shell now owns
 *  that dispatch; this component keeps the selected-point guard out of the page's markup. */
function RestoreTabPanel(props: { locale: string; selected: AdminRestorePoint | null; onBack: () => void }) {
  if (!props.selected) {
    return (
      <div className="notice">
        <p>{t({ locale: props.locale, key: "Select a restore point from the Restore points tab to begin." })}</p>
      </div>
    );
  }
  return <RestoreFlow point={props.selected} onBack={props.onBack} />;
}

export interface RecoveryProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before. See `PostsProps.usePostsHook` for the full rationale.
   * Defaulted to the WIRED hook (2026-08-14, Orc-BASH pass) — see `use-recovery.hooks.ts`'s own
   * `useWiredRecovery`.
   */
  useRecoveryHook?: typeof useWiredRecovery;
  /** The `?tab=` query value from `panels.tsx`'s `recovery` route (`URLSearchParams.get` returns
   *  `null` when the param is absent). Validated by `useRecoveryNavigation`. */
  tabId?: string | null;
}

export function Recovery({ useRecoveryHook = useWiredRecovery, tabId }: RecoveryProps = {}) {
  const { status, points, error, creating, createRestorePoint, selected, setSelected, t, locale } = useRecoveryHook();
  const { activeTabId, onTabChange, onSelectPoint, onBackFromFlow } = useRecoveryNavigation({ tabId, setSelected });

  if (error && !points) return <div className="notice error">{error}</div>;
  if (!points || !status) return <div className="notice">{t("Loading restore points…")}</div>;

  // The former recoveryTabPanel used a flat dispatch to avoid nested JSX branch complexity.
  // The shell now owns that dispatch: each tab supplies one presentation-only panel.
  const tabs: SettingsDialogTab[] = [
    {
      id: "restore-points", label: t("Restore points"), title: t("Recovery"),
      panel: <RestorePointsPanel locale={locale} points={points} creating={creating} onCreate={createRestorePoint} onSelect={onSelectPoint} />,
    },
    {
      id: "restore", label: t("Restore"), title: t("Recovery"),
      panel: <RestoreTabPanel locale={locale} selected={selected} onBack={onBackFromFlow} />,
    },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Operations")}</p>
          <h1 className="page-title">{t("Recovery")}</h1>
          <p className="page-description">{t("Restore this site to a previous point in time using a captured restore point.")}</p>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <DegradedBannerView locale={locale} status={status} />

      <I18nProvider initialLocale={locale} dictionaries={SETTINGS_DIALOG_DICTIONARIES} fallbackLocale="en" syncDocumentAttributes={false}>
        <div
          className="settings-ui-section settings-ui-section--page-flow recovery-section"
          {...agentHandle({ handle: "recovery-tab-bar" }, { role: "region", label: t("Recovery") })}
        >
          <SettingsDialogShell
            tabs={tabs}
            activeTabId={activeTabId}
            onActiveTabIdChange={onTabChange}
            presentation="inline"
            className="jini-tabbed-dialog--inline"
            fullscreenEnabled={false}
            dialogAriaLabelledBy="recovery-shell-title"
            labels={{ kicker: "", sidebarAriaLabel: t("Recovery") }}
          />
        </div>
      </I18nProvider>
    </div>
  );
}
