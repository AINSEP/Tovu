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
 * @file Overview tab — the screen's actual "which path" moment, above how THIS instance happens to
 * be running right now. Every diagnostic value here is either `AdminDeploymentOverview` (read live
 * from `GET .../system/deployment-overview`, see `src/server/routes/admin/system/deployment-
 * overview.ts`) or a translated label derived from it by `rules.ts`'s pure helpers — nothing on
 * this tab is invented.
 *
 * CORRECTED post-launch (2026-08-15, owner UI/UX pass): the original version of this tab was ONLY
 * the current-instance diagnostics below. That buried the panel's own stated job — "Choose how
 * this site gets published" is the page's own subtitle, but nothing on the page ever put Static
 * Site and Full Site side by side so a reader could actually compare them; you'd have to click
 * into each tab separately and hold the difference in your head. `OverviewPathChoice` now renders
 * first, unconditionally (it has no fetch of its own, so it shows immediately even while the
 * diagnostics below are still loading) — two cards, same "what you get" sentences already used
 * verbatim on `StaticSiteTab.tsx`/`FullSiteTab.tsx` (not new claims, just surfaced earlier), each
 * linking to its own tab via a plain `<a href="/admin/deployment?tab=...">` — the established
 * internal-link idiom (`Integrations.tsx`'s row links), not a synthetic `onClick`/`navigate()`
 * call, so cmd-click/middle-click/copy-link all keep working (`installInternalLinkInterceptor`,
 * `@jini-ai/admin/browser`).
 *
 * Split into small presentational pieces (`OverviewStatusRow`, `OverviewPathRow`,
 * `OverviewEnvVarRow`) from the start, per this app's per-scope complexity gate — see
 * `Deployment.tsx`'s own file header for the same reasoning applied at the shell level.
 */
export interface OverviewTabProps {
  /** DI seam for tests — same convention as every other wired-hook prop in this app. */
  useDeploymentOverviewHook?: typeof useWiredDeploymentOverview;
}

/** One path-choice card — a heading, the one-line "what you get" (verbatim from that path's own
 *  tab), a one-line "what it needs/gives up" in the same muted `.field-hint` voice the diagnostics
 *  below already use for a value's footnote, and a real link to that tab's full detail. */
function OverviewPathCard({
  heading,
  getLine,
  costLine,
  detailsHref,
  detailsLabel,
}: {
  heading: string;
  getLine: string;
  costLine: string;
  detailsHref: string;
  detailsLabel: string;
}) {
  return (
    <div className="card deployment-path-card">
      <h2>{heading}</h2>
      <p>{getLine}</p>
      <p className="field-hint">{costLine}</p>
      <a className="btn-secondary" href={detailsHref}>
        {detailsLabel}
      </a>
    </div>
  );
}

/** The two-path comparison — see this file's header for why it leads the tab. */
function OverviewPathChoice({ t }: { t: Translate }) {
  return (
    <div className="deployment-path-grid">
      <OverviewPathCard
        heading={t("Static Site")}
        getLine={t("A fast, read-only copy of this site's published pages — no server behind it.")}
        costLine={t("No checkout, no admin online, no assistant, no dynamic anything.")}
        detailsHref="/admin/deployment?tab=static-site"
        detailsLabel={t("View Static Site details")}
      />
      <OverviewPathCard
        heading={t("Full Site")}
        getLine={t("The complete Tovu server — admin, assistant, checkout, everything works.")}
        costLine={t("Needs a host to run on — provider setup is planned, not wired up yet.")}
        detailsHref="/admin/deployment?tab=full-site"
        detailsLabel={t("View Full Site details")}
      />
    </div>
  );
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
        {/* Both `.field-row`s wrapped in one `.field-group`: two sibling `.field-row`s with nothing
            between them have a MEASURED 0px gap (confirmed via `getBoundingClientRect()` — row
            two's top edge was exactly row one's bottom edge, to the pixel), because a grid's own
            row height is set by its tallest cell and nothing adds space after it. That reads as
            broken alignment whenever a value wraps to two lines (e.g. the Owner password pill) —
            row two ends up flush against the wrapped cell on one side and floating under a big gap
            on the others. `.field-group`'s own `gap: var(--space-4)` (already defined for its
            children generally, not added here) now sits between the two rows — 16px, confirmed by
            the same measurement, matching the gap already used *within* each row rather than
            inventing a new spacing value. */}
        <div className="field-group">
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

/** The current-instance diagnostics half of the tab — same guard-clause shape this function always
 *  had, just pulled out of `OverviewTab` so `OverviewPathChoice` above it can render unconditionally
 *  (this dispatcher's own early returns would otherwise skip it during loading/error too). */
function OverviewDiagnostics({
  snapshot,
  error,
  t,
}: {
  snapshot: AdminDeploymentOverview | undefined;
  error: string | null;
  t: Translate;
}) {
  if (error && !snapshot) return <div className="notice error">{error}</div>;
  if (!snapshot) return <div className="notice">{t("Loading deployment status…")}</div>;

  return (
    <>
      {error ? <div className="notice error">{error}</div> : null}
      <OverviewSnapshotBody snapshot={snapshot} t={t} />
    </>
  );
}

export function OverviewTab(props: OverviewTabProps) {
  const useDeploymentOverviewHook = resolveDeploymentOverviewHook(props.useDeploymentOverviewHook);
  const { snapshot, error, t } = useDeploymentOverviewHook();

  return (
    <div>
      <OverviewPathChoice t={t} />
      <OverviewDiagnostics snapshot={snapshot} error={error} t={t} />
    </div>
  );
}
