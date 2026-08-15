import type { ReactNode } from "react";
import { agentHandle } from "@jini-ai/agentic";
import type { AdminDeploymentEnvVarStatus, AdminDeploymentOverview } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import {
  daemonStatusLabelKey,
  deploymentEnvVarNoteKey,
  isEnvVarRowUnsafe,
  ownerPasswordLabelKey,
  productionGateLabelKey,
  runtimeModeLabelKey,
  FULL_SITE_CAPABILITIES,
  STATIC_SITE_CAPABILITIES,
  type DeploymentCapability,
} from "./rules";
import { CapabilityList, FullSiteIcon, StaticSiteIcon } from "./deployment-visuals";
import { useWiredDeploymentOverview } from "./hooks/use-deployment-overview.hooks";

/**
 * @file Overview tab — the screen's actual "which path" moment, above how THIS instance happens to
 * be running right now. Every diagnostic value here is either `AdminDeploymentOverview` (read live
 * from `GET .../system/deployment-overview`, see `src/server/routes/admin/system/deployment-
 * overview.ts`) or a translated label derived from it by `rules.ts`'s pure helpers — nothing on
 * this tab is invented.
 *
 * ## Second pass (2026-08-15) — what changed and why
 *
 * The first pass put the two paths side by side, which was the right call and stays. What it did
 * not do was make them COMPARABLE: two cards, one sentence each, in prose. A reader still had to
 * hold "no checkout, no admin online, no assistant" in their head and diff it against "admin,
 * assistant, checkout, everything works" to see what they were choosing between. {@link
 * CapabilityList} turns that into four aligned rows with a ✓/✗ per path, so the difference is a
 * shape rather than a reading-comprehension exercise. No new claim is made — `rules.ts`'s
 * `STATIC_SITE_CAPABILITIES` is that same warning sentence, itemized, and its own doc comment
 * records the source for each row.
 *
 * Headings are `.card-title`, not bare `<h2>`. That primitive exists in `styles.css` (~L744) for
 * exactly this, and its own comment measured the defect this tab shipped: a bare `<h2>` in a
 * `.card` renders at the UA default 24px against a 26.4px `.page-title` — "not a hierarchy step,
 * it is a near-tie" — plus a stray 19.92px UA margin. Six such headings across five tabs is most of
 * why the panel read as a stack of equally loud boxes.
 *
 * The diagnostics no longer use `.field`/`.field-row`. `.field` is `display: flex; flex-direction:
 * column`, so a `.status` pill placed directly inside one stretches to the full column width — the
 * "Local" pill measured ~400px wide at a 1440px viewport, which is what made this section look
 * unfinished. `.deployment-fact` is the same label-over-value shape with the pill hugging its text.
 *
 * Links to the sibling tabs stay plain `<a href="/admin/deployment?tab=...">` — the established
 * internal-link idiom (`installInternalLinkInterceptor`, `@jini-ai/admin/browser`), so cmd-click,
 * middle-click and copy-link all keep working.
 */
export interface OverviewTabProps {
  /** DI seam for tests — same convention as every other wired-hook prop in this app. */
  useDeploymentOverviewHook?: typeof useWiredDeploymentOverview;
}

/** One path-choice card: identifying icon, name, an honest one-word availability pill, the promise,
 *  the capability comparison, and a footer holding the caveat above the link to that path's own tab.
 *  The footer is pushed to the card's bottom edge by CSS so both cards' links land on the same
 *  baseline even when one capability list runs longer. */
function OverviewPathCard({
  icon,
  heading,
  statusLabel,
  getLine,
  capabilities,
  costLine,
  detailsHref,
  detailsLabel,
  cardHandleId,
  detailsHandleId,
  t,
}: {
  icon: ReactNode;
  heading: string;
  statusLabel: string;
  getLine: string;
  capabilities: readonly DeploymentCapability[];
  costLine: string;
  detailsHref: string;
  detailsLabel: string;
  /** Distinguishes the Static Site vs. Full Site card — see the two `OverviewPathChoice` call
   *  sites, the only two instances this shared component ever renders. */
  cardHandleId: string;
  detailsHandleId: string;
  t: Translate;
}) {
  return (
    <div
      className="card deployment-path-card"
      {...agentHandle(cardHandleId, {
        role: "region",
        label: `${heading} path card — availability, what it gives you, capability comparison, and a link to its own tab`,
      })}
    >
      <div className="deployment-path-head">
        <span className="deployment-path-icon">{icon}</span>
        <h2 className="card-title">{heading}</h2>
        <span className="status status-neutral">{statusLabel}</span>
      </div>
      <p className="card-lead">{getLine}</p>
      <CapabilityList rows={capabilities} t={t} />
      <div className="deployment-path-foot">
        <p className="deployment-action-reason">{costLine}</p>
        <a
          className="btn-secondary"
          href={detailsHref}
          {...agentHandle(detailsHandleId, { role: "link", label: `Open the ${heading} tab for full details` })}
        >
          {detailsLabel}
        </a>
      </div>
    </div>
  );
}

/** The two-path comparison — see this file's header for why it leads the tab.
 *
 *  Both availability pills are `status-neutral`, deliberately. "Available from a terminal" is not a
 *  success state and "Not wired up yet" is not a failure, so neither earns `status-ok`/`status-
 *  warning`; the words carry the difference, which is also what keeps the distinction legible
 *  without color perception. */
function OverviewPathChoice({ t }: { t: Translate }) {
  return (
    <div className="deployment-path-grid">
      <OverviewPathCard
        icon={<StaticSiteIcon />}
        heading={t("Static Site")}
        statusLabel={t("Available from a terminal")}
        getLine={t("A fast, read-only copy of this site's published pages — no server behind it.")}
        capabilities={STATIC_SITE_CAPABILITIES}
        costLine={t("Runs on any static host, including free ones. Nothing dynamic survives the export.")}
        detailsHref="/admin/deployment?tab=static-site"
        detailsLabel={t("View Static Site details")}
        cardHandleId="deployment-overview-static-path-card"
        detailsHandleId="deployment-overview-static-details-link"
        t={t}
      />
      <OverviewPathCard
        icon={<FullSiteIcon />}
        heading={t("Full Site")}
        statusLabel={t("Not wired up yet")}
        getLine={t("The complete Tovu server — admin, assistant, checkout, everything works.")}
        capabilities={FULL_SITE_CAPABILITIES}
        costLine={t("Needs a host to run on — provider setup is planned, not wired up yet.")}
        detailsHref="/admin/deployment?tab=full-site"
        detailsLabel={t("View Full Site details")}
        cardHandleId="deployment-overview-full-path-card"
        detailsHandleId="deployment-overview-full-details-link"
        t={t}
      />
    </div>
  );
}

/** One label-over-value diagnostic cell. `children` rather than a `value` string so the same cell
 *  shape holds either a status pill or a verbatim `<code>` path — two different renderings of the
 *  same "here is one fact about this instance" row, which is why they share a component instead of
 *  each having their own. */
function OverviewFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="deployment-fact">
      <span className="deployment-fact-label">{label}</span>
      <span className="deployment-fact-value">{children}</span>
    </div>
  );
}

/** A filesystem path, shown verbatim. `translate="no"` so a machine translator leaves it alone — a
 *  path is an identifier, not prose (Web Interface Guidelines: "brand names, code tokens,
 *  identifiers: wrap with `translate=\"no\"`"). Wrapping is `overflow-wrap: anywhere` in CSS
 *  because an absolute path has no spaces to break at, and at 390px an unbreakable one is what
 *  pushes the whole page into horizontal scroll. */
function OverviewPathValue({ path }: { path: string }) {
  return <code translate="no">{path}</code>;
}

/** One environment-variable row: name, Set/Not set pill, and the one-line note explaining what
 *  happens when it's absent (`deploymentEnvVarNoteKey`, `rules.ts`). */
function OverviewEnvVarRow({ varStatus, t }: { varStatus: AdminDeploymentEnvVarStatus; t: Translate }) {
  const unsafe = isEnvVarRowUnsafe(varStatus);
  const tone: "ok" | "warning" | "neutral" = varStatus.set ? "ok" : unsafe ? "warning" : "neutral";
  return (
    <li className="deployment-env-row">
      <div className="deployment-env-head">
        <span className="deployment-env-name" translate="no">
          {varStatus.name}
        </span>
        <span className={`status status-${tone}`}>{varStatus.set ? t("Set") : t("Not set")}</span>
      </div>
      <p className="deployment-env-note">{t(deploymentEnvVarNoteKey(varStatus.name))}</p>
    </li>
  );
}

/** The loaded snapshot's body — split from `OverviewTab` so the loading/error early returns there
 *  stay flat guard clauses, same shape `Database.tsx`'s section components use. */
function OverviewSnapshotBody({ snapshot, t }: { snapshot: AdminDeploymentOverview; t: Translate }) {
  return (
    <>
      <div
        className="card"
        {...agentHandle("deployment-overview-instance-facts", {
          role: "region",
          label: "How this instance is running — runtime mode, readiness gate, owner password, agent daemon, and file paths",
        })}
      >
        <div className="card-head">
          <h2 className="card-title">{t("How this instance is running")}</h2>
        </div>
        <div className="deployment-facts">
          <OverviewFact label={t("Runtime mode")}>
            <span className="status status-neutral">{t(runtimeModeLabelKey(snapshot.mode))}</span>
          </OverviewFact>
          <OverviewFact label={t("Production readiness gate")}>
            <span className={`status status-${snapshot.productionReadinessGate.applicable ? "ok" : "neutral"}`}>
              {t(productionGateLabelKey(snapshot.productionReadinessGate))}
            </span>
          </OverviewFact>
          <OverviewFact label={t("Owner password")}>
            <span className={`status status-${snapshot.defaultOwnerPasswordUnsafe ? "warning" : "ok"}`}>
              {t(ownerPasswordLabelKey(snapshot.defaultOwnerPasswordUnsafe))}
            </span>
          </OverviewFact>
          <OverviewFact label={t("Agent daemon")}>
            <span className={`status status-${snapshot.daemonKnownFailed ? "warning" : "ok"}`}>
              {t(daemonStatusLabelKey(snapshot.daemonKnownFailed))}
            </span>
          </OverviewFact>
          <OverviewFact label={t("Database file")}>
            <OverviewPathValue path={snapshot.dbPath} />
          </OverviewFact>
          <OverviewFact label={t("Uploads folder")}>
            <OverviewPathValue path={snapshot.uploadsDir} />
          </OverviewFact>
        </div>
      </div>

      <div
        className="card"
        {...agentHandle("deployment-overview-env-vars", {
          role: "region",
          label: "Environment variables this instance reads, with each one's Set/Not set state and what happens when it's absent",
        })}
      >
        <div className="card-head">
          <h2 className="card-title">{t("Environment variables")}</h2>
        </div>
        <ul className="deployment-env-list">
          {snapshot.envVars.map((varStatus) => (
            <OverviewEnvVarRow key={varStatus.name} varStatus={varStatus} t={t} />
          ))}
        </ul>
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
    <div className="deployment-tab">
      <OverviewPathChoice t={t} />
      <OverviewDiagnostics snapshot={snapshot} error={error} t={t} />
    </div>
  );
}
