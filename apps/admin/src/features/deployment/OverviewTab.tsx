import type { AdminDeploymentEnvVarStatus, AdminDeploymentOverview } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import {
  daemonStatusLabelKey,
  deploymentEnvVarNoteKey,
  isEnvVarRowUnsafe,
  ownerPasswordLabelKey,
  productionGateLabelKey,
  runtimeModeLabelKey,
} from "./rules";
import { useWiredDeploymentOverview } from "./hooks/use-deployment-overview.hooks";

/**
 * @file Overview tab — how THIS instance is running right now. Every value here is either
 * `AdminDeploymentOverview` (read live from `GET .../system/deployment-overview`, see
 * `src/server/routes/admin/system/deployment-overview.ts`) or a translated label derived from it by
 * `rules.ts`'s pure helpers — nothing on this tab is invented.
 *
 * Split into small presentational pieces (`OverviewStatusRow`, `OverviewPathRow`,
 * `OverviewEnvVarRow`) from the start, per this app's per-scope complexity gate — see
 * `Deployment.tsx`'s own file header for the same reasoning applied at the shell level.
 */
export interface OverviewTabProps {
  /** DI seam for tests — same convention as every other wired-hook prop in this app. */
  useDeploymentOverviewHook?: typeof useWiredDeploymentOverview;
}

/** One label/value row with a status pill — Runtime mode, Production readiness gate, Owner
 *  password, Agent daemon. `tone` picks which of the three pill classes `styles.css` defines for
 *  this tab (`status-ok`/`status-warning`/`status-neutral`). */
function OverviewStatusRow({ label, value, tone }: { label: string; value: string; tone: "ok" | "warning" | "neutral" }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className={`status status-${tone}`}>{value}</span>
    </div>
  );
}

/** One label/value row showing a filesystem path verbatim — Database file, Uploads folder. Not a
 *  status pill: a path isn't a state, it's a fact to read or copy. Plain `<code>`, monospaced by
 *  the browser's own default, matching how `ThemeExplore.tsx`'s `PageRenameWarningBody` renders a
 *  path inline. */
function OverviewPathRow({ label, path }: { label: string; path: string }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <code>{path}</code>
    </div>
  );
}

/** One environment-variable row: name, Set/Not set pill, and the one-line note explaining what
 *  happens when it's absent (`deploymentEnvVarNoteKey`, `rules.ts`). */
function OverviewEnvVarRow({ varStatus, t }: { varStatus: AdminDeploymentEnvVarStatus; t: Translate }) {
  const unsafe = isEnvVarRowUnsafe(varStatus);
  const tone: "ok" | "warning" | "neutral" = varStatus.set ? "ok" : unsafe ? "warning" : "neutral";
  return (
    <div className="field">
      <span className="field-label">{varStatus.name}</span>
      <span className={`status status-${tone}`}>{varStatus.set ? t("Set") : t("Not set")}</span>
      <p className="field-hint">{t(deploymentEnvVarNoteKey(varStatus.name))}</p>
    </div>
  );
}

/** The loaded snapshot's body — split from `OverviewTab` so the loading/error early returns there
 *  stay flat guard clauses, same shape `Database.tsx`'s section components use. */
function OverviewSnapshotBody({ snapshot, t }: { snapshot: AdminDeploymentOverview; t: Translate }) {
  return (
    <>
      <div className="card">
        <h2>{t("How this instance is running")}</h2>
        <div className="field-row">
          <OverviewStatusRow
            label={t("Runtime mode")}
            value={t(runtimeModeLabelKey(snapshot.mode))}
            tone="neutral"
          />
          <OverviewStatusRow
            label={t("Production readiness gate")}
            value={t(productionGateLabelKey(snapshot.productionReadinessGate))}
            tone={snapshot.productionReadinessGate.applicable ? "ok" : "neutral"}
          />
          <OverviewStatusRow
            label={t("Owner password")}
            value={t(ownerPasswordLabelKey(snapshot.defaultOwnerPasswordUnsafe))}
            tone={snapshot.defaultOwnerPasswordUnsafe ? "warning" : "ok"}
          />
          <OverviewStatusRow
            label={t("Agent daemon")}
            value={t(daemonStatusLabelKey(snapshot.daemonKnownFailed))}
            tone={snapshot.daemonKnownFailed ? "warning" : "ok"}
          />
        </div>
        <div className="field-row">
          <OverviewPathRow label={t("Database file")} path={snapshot.dbPath} />
          <OverviewPathRow label={t("Uploads folder")} path={snapshot.uploadsDir} />
        </div>
      </div>

      <div className="card">
        <h2>{t("Environment variables")}</h2>
        <div className="field-row">
          {snapshot.envVars.map((varStatus) => (
            <OverviewEnvVarRow key={varStatus.name} varStatus={varStatus} t={t} />
          ))}
        </div>
      </div>
    </>
  );
}

/** Resolves {@link OverviewTabProps.useDeploymentOverviewHook} to the real hook when a caller
 *  passes none — a call out to a separately-scoped resolver, rather than a destructuring default
 *  plus a `= {}` parameter default on `OverviewTab` itself, keeps this function's own ESLint
 *  cyclomatic-complexity count from counting a second branch for the empty-props case (same
 *  reasoning `SettingsUi.tsx`'s `resolveSettingsUiHook` documents for its own props). */
function resolveDeploymentOverviewHook(
  override: typeof useWiredDeploymentOverview | undefined
): typeof useWiredDeploymentOverview {
  return override ?? useWiredDeploymentOverview;
}

export function OverviewTab(props: OverviewTabProps) {
  const useDeploymentOverviewHook = resolveDeploymentOverviewHook(props.useDeploymentOverviewHook);
  const { snapshot, error, t } = useDeploymentOverviewHook();

  if (error && !snapshot) return <div className="notice error">{error}</div>;
  if (!snapshot) return <div className="notice">{t("Loading deployment status…")}</div>;

  return (
    <div>
      {error ? <div className="notice error">{error}</div> : null}
      <OverviewSnapshotBody snapshot={snapshot} t={t} />
    </div>
  );
}
