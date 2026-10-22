import type { Translate } from "@jini-ai/ui/panel-kit";
import { adminHref } from "@/lib/router";
import { consentProblemTab, pausedByCategory } from "./rules";
import type { ConsentReadiness } from "./settings.hooks";

/**
 * @file Overview: is the banner live, what blocks publishing, and what the banner will pause on
 * the home page. Readiness checks the draft as if it were on, so blockers show before Publish.
 */

export interface ConsentOverviewTabProps {
  liveEnabled: boolean;
  hasUnpublished: boolean;
  readiness: ConsentReadiness | null;
  readinessError: string | null;
  t: Translate;
}

const CATEGORY_LABELS: Readonly<Record<string, string>> = { necessary: "Necessary", functional: "Functional", analytics: "Analytics", marketing: "Marketing" };

function StatusCard({ liveEnabled, hasUnpublished, t }: Pick<ConsentOverviewTabProps, "liveEnabled" | "hasUnpublished" | "t">) {
  return (
    <section className="card consent-card" aria-labelledby="consent-status-title">
      <div className="card-head">
        <h2 id="consent-status-title" className="card-title">{t("Banner")}</h2>
        <span className={`status ${liveEnabled ? "status-ok" : "status-neutral"}`}>{liveEnabled ? t("On") : t("Off")}</span>
      </div>
      <p className="card-lead">{liveEnabled ? t("Visitors choose before optional cookies run.") : t("Visitors see no banner. Optional scripts run as usual.")}</p>
      {hasUnpublished && <p className="consent-note">{t("You have changes that are not live yet.")}</p>}
    </section>
  );
}

function BlockersCard({ readiness, readinessError, t }: Pick<ConsentOverviewTabProps, "readiness" | "readinessError" | "t">) {
  const problems = readiness?.blockingProblems ?? [];
  return (
    <section className="card consent-card" aria-labelledby="consent-blockers-title">
      <h2 id="consent-blockers-title" className="card-title">{t("Before you turn it on")}</h2>
      {readinessError && <p className="notice error" role="alert">{readinessError}</p>}
      {!readiness && !readinessError && <p className="card-lead">{t("Checking…")}</p>}
      {readiness && problems.length === 0 && <p className="card-lead">{t("Nothing blocks the banner.")}</p>}
      {problems.length > 0 && (
        <ul className="consent-problem-list">
          {problems.map((problem) => {
            const tab = consentProblemTab({ problem });
            return (
              <li key={`${problem.code ?? ""}:${problem.message}`}>
                <span>{problem.message}</span>
                {tab && <a className="consent-fix-link" href={adminHref(`/consent?tab=${tab}`)}>{t("Fix")}</a>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PausedCard({ readiness, t }: Pick<ConsentOverviewTabProps, "readiness" | "t">) {
  if (!readiness) return null;
  const counts = pausedByCategory({ detected: readiness.detected });
  return (
    <section className="card consent-card" aria-labelledby="consent-paused-title">
      <h2 id="consent-paused-title" className="card-title">{t("Waits for consent")}</h2>
      <p className="card-lead">{counts.length ? t("On the home page, these wait for a visitor's choice:") : t("Nothing on the home page waits for consent.")}</p>
      {counts.length > 0 && (
        <ul className="consent-paused-list">
          {counts.map(({ category, count }) => (
            <li key={category}><span>{t(CATEGORY_LABELS[category] ?? category)}</span><strong>{count}</strong></li>
          ))}
        </ul>
      )}
      {readiness.truncated && <p className="consent-note">{t("Only the first 200 items were checked.")}</p>}
    </section>
  );
}

export function ConsentOverviewTab(props: ConsentOverviewTabProps) {
  return (
    <div className="consent-overview">
      <StatusCard liveEnabled={props.liveEnabled} hasUnpublished={props.hasUnpublished} t={props.t} />
      <BlockersCard readiness={props.readiness} readinessError={props.readinessError} t={props.t} />
      <PausedCard readiness={props.readiness} t={props.t} />
    </div>
  );
}
