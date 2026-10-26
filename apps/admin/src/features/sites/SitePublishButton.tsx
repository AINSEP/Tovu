import { useId, useRef } from "react";
import { agentHandle, agentHandleSegment } from "@jini-ai/agentic";
import { useDismissOnOutsideOrEscape } from "@jini-ai/ui";
import { interpolate, type Translate } from "@jini-ai/ui/panel-kit";

import { adminHref } from "../../lib/router";
import { PublishRunResult } from "../deployment/PublishRunResult";
import {
  useWiredSitePublish,
  type SitePublishController,
  type SitePublishRowState,
  type SitePublishRowView,
} from "./hooks/use-site-publish.hooks";

/**
 * @file The Export tab's "Publish" button (owner, 2026-10-18; on Sites, then Import & Export from
 * 2026-10-25): beside "Export this site", it opens a small panel of the places this site was
 * published or deployed to before.
 * Nothing ships until a row's own Publish is picked. Markup only; see `use-site-publish.hooks.ts`.
 */

export interface SitePublishButtonProps {
  t: Translate;
  /** Test seam, same convention as `SitesProps.useSitesHook`. */
  usePublish?: typeof useWiredSitePublish;
}

export function SitePublishButton({ t, usePublish = useWiredSitePublish }: SitePublishButtonProps) {
  const controller = usePublish({ t });
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useDismissOnOutsideOrEscape({ onDismiss: () => { controller.close(); triggerRef.current?.focus(); } }, { enabled: controller.open, containerRef });

  return (
    <div className="site-publish" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="btn-secondary site-publish-button"
        aria-expanded={controller.open}
        aria-controls={panelId}
        onClick={controller.toggle}
        {...agentHandle({ handle: "sites-publish-open" }, { role: "button", label: "Show the places this site was published to before" })}
      >
        <UploadIcon />{t("Publish")}
      </button>
      {controller.open ? (
        <div id={panelId} className="site-publish-panel" role="region" aria-label={t("Publish destinations")}>
          <p className="site-publish-title">{t("Publish again to")}</p>
          <PublishPanelBody controller={controller} />
        </div>
      ) : null}
    </div>
  );
}

function PublishPanelBody({ controller }: { controller: SitePublishController }) {
  const { t } = controller;
  if (controller.status === "loading") return <p className="site-publish-note">{t("Loading destinations…")}</p>;
  if (controller.status === "error") return (
    <div className="notice error" role="alert">
      <p>{controller.error}</p>
      <button type="button" className="btn-secondary" onClick={controller.retry}>{t("Retry")}</button>
    </div>
  );
  if (controller.rows.length === 0) {
    return (
      <div className="site-publish-empty">
        <p className="site-publish-note">{t("Nothing published yet. Publish once from Deployment, then publish again from here.")}</p>
        <a className="btn-secondary" href={adminHref("/deployment?tab=static-site")}>{t("Set up publishing")}</a>
      </div>
    );
  }
  return (
    <ul className="site-publish-list">
      {controller.rows.map((row) => <PublishRow key={row.id} row={row} controller={controller} />)}
    </ul>
  );
}

function PublishRow({ row, controller }: { row: SitePublishRowView; controller: SitePublishController }) {
  const { t } = controller;
  return (
    <li className="site-publish-row">
      <div className="site-publish-row-main">
        <div className="site-publish-row-head">
          <span className="site-publish-label">{row.label}</span>
          <span className="status status-neutral">{row.kindLabel}</span>
        </div>
        <a className="site-publish-url" href={row.url} target="_blank" rel="noreferrer" title={row.url} translate="no">{row.url}</a>
        <span className="site-publish-when">{interpolate({ template: t("Last published {when}"), vars: { when: row.when } })}</span>
        {row.pendingDeploy ? <span className="status status-warning site-publish-pending">{t("Deploy started, not confirmed")}</span> : null}
      </div>
      <PublishRowAction row={row} controller={controller} />
      <PublishRowState row={row} controller={controller} />
    </li>
  );
}

function PublishRowAction({ row, controller }: { row: SitePublishRowView; controller: SitePublishController }) {
  const { t } = controller;
  if (row.action === "connect") {
    return (
      <button type="button" className="btn-secondary site-publish-action" disabled={controller.busy} onClick={controller.openPublishDialog}
        aria-label={interpolate({ template: t("Connect {name}"), vars: { name: row.label } })}
        {...agentHandle({ handle: `sites-publish-connect-${agentHandleSegment({ value: row.id })}` }, { role: "button", label: "Open the Publish dialog to connect this deploy as a Tovu site" })}
      >{t("Connect")}</button>
    );
  }
  if (row.action !== "publish") return null;
  const running = row.state?.kind === "running";
  return (
    <button type="button" className="btn-primary site-publish-action" disabled={controller.busy} aria-busy={running}
      onClick={() => controller.publish(row.id)}
      aria-label={interpolate({ template: t("Publish to {name}"), vars: { name: row.label } })}
      {...agentHandle({ handle: `sites-publish-row-${agentHandleSegment({ value: row.id })}` }, { role: "button", label: "Publish this site to this past destination now — live immediately" })}
    >
      {running ? <span className="site-transfer-spinner" aria-hidden="true" /> : null}
      {running ? t("Publishing…") : t("Publish")}
    </button>
  );
}

function PublishRowState({ row, controller }: { row: SitePublishRowView; controller: SitePublishController }) {
  const state = row.state;
  if (state === null || state.kind === "running") return null;
  return <div className="site-publish-result" role="status">{rowStateBody(state, controller)}</div>;
}

/** Flat dispatch, kept out of the component for the complexity gate. @complexity O(1). */
function rowStateBody(state: Exclude<SitePublishRowState, { kind: "running" }>, controller: SitePublishController) {
  const { t } = controller;
  if (state.kind === "static-run") return <PublishRunResult run={state.run} t={t} linkHandle="sites-publish-result-url" />;
  if (state.kind === "error") return <p className="save-error">{state.message}</p>;
  const skipped = state.skipped > 0 ? <SkippedNote count={state.skipped} controller={controller} /> : null;
  if (state.kind === "nothing") return <><p className="save-ok">{t("Already up to date.")}</p>{skipped}</>;
  return (
    <>
      <p className="save-ok">{t("Published:")} <a href={state.url} target="_blank" rel="noreferrer" translate="no">{state.url}</a></p>
      {skipped}
    </>
  );
}

function SkippedNote({ count, controller }: { count: number; controller: SitePublishController }) {
  const { t } = controller;
  return (
    <p className="site-publish-skipped">
      {interpolate({ template: t("{count} skipped: changed on the live site."), vars: { count } })}{" "}
      <button type="button" className="btn-ghost site-publish-review" onClick={controller.openPublishDialog}>{t("Review in Publish")}</button>
    </p>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
    </svg>
  );
}
