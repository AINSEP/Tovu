import { DataTable } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import { FileDropzone } from "@jini-ai/ui";
import { InfoTip } from "@jini-ai/ui/admin-widgets";
import { formatTimestamp, interpolate, type Translate } from "@jini-ai/ui/panel-kit";
import type { SiteImport } from "./hooks/site-transfer-dependencies.hooks";
import { useWiredSiteImport, type SiteImportController } from "./hooks/use-site-transfer.hooks";
import { formatTransferBytes, importOptionsTip, importSourceLabel, importStateView } from "./site-transfer-rules";

/**
 * @file The "Import Site" screen (owner, 2026-10-18; on Sites, then the Import & Export page's
 * Import tab from 2026-10-25). Two ways in, under one ⓘ:
 * - a Tovu share link or `.tovu.zip` becomes a NEW site, then the new owner's password is chosen
 *   here (the backend's needs-owner step; the password never goes through an agent tool);
 * - a live website goes to the existing `site-import` agent plugin as a drafted assistant request.
 *   v1 (coordinator, 2026-10-18) imports into THIS site, and the copy says so with a New site link.
 * Then the list of past imports. Markup only; every effect is in {@link useWiredSiteImport}.
 */

export interface SiteImportTabProps {
  t: Translate;
  /** Test seam, same convention as `SitesProps.useSitesHook`. */
  useImport?: typeof useWiredSiteImport;
  /** Whether to link to Sites → New site. Off where this deployment has no Sites section (the
   *  desktop app, a hosted install), since that route would bounce to the dashboard. */
  showNewSiteLink?: boolean;
}

export function SiteImportTab({ t, useImport = useWiredSiteImport, showNewSiteLink = false }: SiteImportTabProps) {
  const controller = useImport({ t });
  return (
    <section className="site-transfer" aria-label={t("Import Site")}>
      <div className="site-transfer-head">
        <p className="onboarding-section-lead site-transfer-lead">
          {t("Bring in a site from a Tovu export or a live website.")}
          <InfoTip label={importOptionsTip(t)} triggerLabel={t("About importing")} placement="inline" agentHandle="sites-import-info" />
        </p>
      </div>
      <ImportProgress controller={controller} t={t} />
      <div className="onboarding-card">
        <ArchiveSource controller={controller} t={t} />
        <LiveWebsiteSource controller={controller} showNewSiteLink={showNewSiteLink} t={t} />
      </div>
      <h3 className="site-transfer-subtitle">{t("Past imports")}</h3>
      <ImportList controller={controller} t={t} />
    </section>
  );
}

/** "From a Tovu share link or zip": a link OR a file, one Import button. */
function ArchiveSource({ controller, t }: { controller: SiteImportController; t: Translate }) {
  return (
    <form
      className="onboarding-section"
      onSubmit={(event) => {
        event.preventDefault();
        void controller.startImport();
      }}
      {...agentHandle({ handle: "sites-import-archive-form" }, { role: "form", label: "Import a Tovu share link or .tovu.zip as a new site" })}
    >
      <div className="onboarding-section-head">
        <h3 className="onboarding-section-title">{t("From a Tovu share link or zip")}</h3>
        <p className="onboarding-section-lead">{t("Makes a new site. This site stays as it is.")}</p>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="sites-import-link">{t("Share link")}</label>
        <input
          id="sites-import-link"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={controller.link}
          disabled={controller.importing}
          onChange={(event) => controller.setLink(event.target.value)}
          {...agentHandle({ handle: "sites-import-link" }, { role: "field", label: "Tovu share link to import" })}
        />
      </div>
      <p className="site-transfer-or">{t("or")}</p>
      {controller.file ? (
        <div className="site-transfer-file">
          <span className="site-transfer-file-name">{controller.file.name}</span>
          <span className="site-transfer-num">{formatTransferBytes(controller.file.size)}</span>
          <button type="button" className="btn-secondary" disabled={controller.importing} onClick={controller.clearFile}
            {...agentHandle({ handle: "sites-import-file-remove" }, { role: "button", label: "Remove the chosen .tovu.zip" })}>
            {t("Remove")}
          </button>
        </div>
      ) : (
        <FileDropzone
          accept=".zip,application/zip"
          prompt={t("Drop a .tovu.zip here, or click to browse")}
          helper={t("Up to 300 MB")}
          onFiles={controller.chooseFiles}
        />
      )}
      {controller.importError ? <div className="notice error" role="alert">{controller.importError}</div> : null}
      <div className="site-transfer-actions">
        <button type="submit" className="btn-primary" disabled={!controller.canImport || controller.importing} aria-busy={controller.importing}
          {...agentHandle({ handle: "sites-import-start" }, { role: "button", label: "Import the link or zip as a new site" })}>
          {controller.importing ? <span className="site-transfer-spinner" aria-hidden="true" /> : null}
          {controller.importing ? t("Importing…") : t("Import as a new site")}
        </button>
      </div>
    </form>
  );
}

/** "From a live website": hands a drafted request to the assistant; the owner presses Send. */
function LiveWebsiteSource({ controller, showNewSiteLink, t }: { controller: SiteImportController; showNewSiteLink: boolean; t: Translate }) {
  return (
    <form
      className="onboarding-section"
      onSubmit={(event) => {
        event.preventDefault();
        controller.startLiveImport();
      }}
      {...agentHandle({ handle: "sites-import-live-form" }, { role: "form", label: "Import a live website with the assistant" })}
    >
      <div className="onboarding-section-head">
        <h3 className="onboarding-section-title">{t("From a live website")}</h3>
        <p className="onboarding-section-lead">
          {t("Imports into this site. To keep this site as it is, make a new site first.")}
          {showNewSiteLink ? (
            <>
              {" "}
              <a className="link-button" href="/admin/sites?tab=new"
                {...agentHandle({ handle: "sites-import-live-new-site" }, { role: "link", label: "Go to the New site tab" })}>
                {t("New site")}
              </a>
            </>
          ) : null}
        </p>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="sites-import-live-address">{t("Website address")}</label>
        <input
          id="sites-import-live-address"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={controller.liveAddress}
          aria-describedby="sites-import-live-hint"
          onChange={(event) => controller.setLiveAddress(event.target.value)}
          {...agentHandle({ handle: "sites-import-live-address" }, { role: "field", label: "Address of the live website to import" })}
        />
        <p className="field-hint" id="sites-import-live-hint">{t("The assistant opens with the request written. Press Send to start.")}</p>
      </div>
      <div className="site-transfer-actions">
        <button type="submit" className="btn-secondary" disabled={!controller.liveAddressValid}
          {...agentHandle({ handle: "sites-import-live-start" }, { role: "button", label: "Open the assistant with the import request" })}>
          {t("Import with the assistant")}
        </button>
      </div>
    </form>
  );
}

/** The import just started or resumed: the new owner's password step, then Open. */
function ImportProgress({ controller, t }: { controller: SiteImportController; t: Translate }) {
  const current = controller.current;
  if (!current) return null;
  const name = current.newSiteName ?? t("the new site");
  if (current.state === "needs-owner") return <OwnerStep controller={controller} name={name} t={t} />;
  if (current.state === "failed") return <div className="notice error" role="alert">{current.error ?? t("Import failed. No site was changed.")}</div>;
  if (current.state === "ready") {
    return (
      <div className="notice site-transfer-done" role="status">
        <span>{interpolate({ template: t("{name} is ready."), vars: { name } })}</span>
        {current.adminUrl ? (
          <a className="btn-primary" href={current.adminUrl} target="_blank" rel="noreferrer"
            {...agentHandle({ handle: "sites-import-open" }, { role: "link", label: "Open the imported site's admin" })}>
            {t("Open")}
          </a>
        ) : <span>{t("Start it from All sites to open its admin.")}</span>}
      </div>
    );
  }
  return <div className="notice" role="status">{t("Checking the archive…")}</div>;
}

function OwnerStep({ controller, name, t }: { controller: SiteImportController; name: string; t: Translate }) {
  const ready = controller.password.length > 0 && controller.confirm === controller.password;
  return (
    <form
      className="onboarding-card site-transfer-owner"
      onSubmit={(event) => {
        event.preventDefault();
        void controller.completeOwner();
      }}
      {...agentHandle({ handle: "sites-import-owner-form" }, { role: "form", label: "Choose the imported site's owner password" })}
    >
      <div className="onboarding-section">
        <div className="onboarding-section-head">
          <h3 className="onboarding-section-title">{interpolate({ template: t("Choose a password for {name}"), vars: { name } })}</h3>
          <p className="onboarding-section-lead">{t("The site opens once it has an owner password. Username: admin")}</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="sites-import-owner-password">{t("Password")}</label>
          <input id="sites-import-owner-password" type="password" autoComplete="new-password" maxLength={512} value={controller.password}
            // It appears in answer to Import or Finish setup, often above the button pressed: focus
            // brings it into view and puts the cursor where the next keystroke belongs.
            autoFocus
            disabled={controller.settingOwner} onChange={(event) => controller.setPassword(event.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="sites-import-owner-confirm">{t("Confirm password")}</label>
          <input id="sites-import-owner-confirm" type="password" autoComplete="new-password" maxLength={512} value={controller.confirm}
            disabled={controller.settingOwner} aria-invalid={controller.passwordProblem ? true : undefined}
            aria-describedby={controller.passwordProblem ? "sites-import-owner-problem" : undefined}
            onChange={(event) => controller.setConfirm(event.target.value)} />
          {controller.passwordProblem ? <p className="field-error" id="sites-import-owner-problem">{controller.passwordProblem}</p> : null}
        </div>
        {controller.ownerError ? <div className="notice error" role="alert">{controller.ownerError}</div> : null}
        <div className="site-transfer-actions">
          <button type="submit" className="btn-primary" disabled={!ready || controller.settingOwner} aria-busy={controller.settingOwner}
            {...agentHandle({ handle: "sites-import-owner-submit" }, { role: "button", label: "Create the imported site with this password" })}>
            {controller.settingOwner ? t("Creating…") : t("Create site")}
          </button>
        </div>
      </div>
    </form>
  );
}

function ImportList({ controller, t }: { controller: SiteImportController; t: Translate }) {
  if (controller.listError) return <div className="notice error">{controller.listError}</div>;
  if (!controller.imports) return <div className="notice">{t("Loading imports…")}</div>;
  return (
    <DataTable
      rows={controller.imports}
      rowKey={(item) => item.importId}
      label={t("Past imports")}
      empty={<div className="sites-empty"><p className="sites-empty-lead">{t("No imports yet.")}</p></div>}
      columns={[
        { key: "date", header: t("Date"), cellClassName: "site-transfer-num", cell: (item) => formatTimestamp({ iso: item.createdAt }, { timeZone: "local" }) },
        { key: "source", header: t("Source"), cell: (item) => "url" in item.source ? <span className="site-transfer-link" title={item.source.url}>{importSourceLabel(item.source, t)}</span> : importSourceLabel(item.source, t) },
        { key: "site", header: t("New site"), cell: (item) => item.newSiteName ?? <span className="muted-cell">—</span> },
        {
          key: "status",
          header: t("Status"),
          cell: (item) => {
            const view = importStateView(item.state, t);
            return <span className={view.className}>{view.label}</span>;
          },
        },
        { key: "actions", headerLabel: t("Actions"), cell: (item, index) => <ImportAction item={item} index={index} controller={controller} t={t} /> },
      ]}
    />
  );
}

function ImportAction({ item, index, controller, t }: { item: SiteImport; index: number; controller: SiteImportController; t: Translate }) {
  if (item.state === "needs-owner") {
    return (
      <button type="button" className="btn-secondary" onClick={() => controller.resume(item)}
        {...agentHandle({ handle: `sites-import-${index + 1}-finish` }, { role: "button", label: "Finish this import's owner password step" })}>
        {t("Finish setup")}
      </button>
    );
  }
  if (item.state === "ready" && item.adminUrl) {
    return (
      <a className="btn-secondary" href={item.adminUrl} target="_blank" rel="noreferrer"
        {...agentHandle({ handle: `sites-import-${index + 1}-open` }, { role: "link", label: "Open this imported site's admin" })}>
        {t("Open")}
      </a>
    );
  }
  return <span className="muted-cell">—</span>;
}
