import { StaticExportPicker } from "./StaticExportPicker";
import { CredentialWarningList, TransferNoticeTip, credentialSummary } from "./CredentialWarnings";
import type { CredentialGate } from "./hooks/use-share-credential-gate.hooks";
import { DataTable } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import { ErrorNotice, formatTimestamp, type Translate } from "@jini-ai/ui/panel-kit";
import { siteShareNotices, type SiteShare } from "./hooks/site-transfer-dependencies.hooks";
import { useWiredSiteExport, type SiteExportController } from "./hooks/use-site-transfer.hooks";
import { formatTransferBytes, shareStatusView, shortLink } from "./site-transfer-rules";

/**
 * @file The "Export Site" screen (owner, 2026-10-18; on Sites, then the Import & Export page's
 * Export tab from 2026-10-25): the primary action makes a
 * `.tovu.zip` of this site (no confirmation, owner rule) and the list of this site's exports. Markup
 * only; every effect is in {@link useWiredSiteExport}.
 */

export interface SiteExportTabProps {
  t: Translate;
  /** Test seam, same convention as `SitesProps.useSitesHook`. */
  useExport?: typeof useWiredSiteExport;
}

export function SiteExportTab({ t, useExport = useWiredSiteExport }: SiteExportTabProps) {
  const controller = useExport({ t });
  const exporting = controller.exporting || controller.exportingStatic;
  return (
    <section className="site-transfer" aria-label={t("Export Site")}>
      <p className="onboarding-section-lead site-transfer-lead">{t("Makes a .tovu.zip copy of this site that another Tovu can import.")}</p>
      <p className="site-transfer-lead">{t("Images are exported as web-optimized copies.")}</p>
      <div className="site-export-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={exporting}
          aria-busy={controller.exporting}
          onClick={() => void controller.exportSite()}
          {...agentHandle({ handle: "sites-export-create" }, { role: "button", label: "Export this site as a .tovu.zip" })}
        >
          {controller.exporting ? <span className="site-transfer-spinner" aria-hidden="true" /> : null}
          {controller.exporting ? t("Exporting…") : t("Export Tovu site")}
        </button>
        <StaticExportPicker controller={controller} t={t} />
      </div>
      <ExportFailureNotice controller={controller} t={t} />
      {controller.passwordError ? <div className="notice error" role="alert">{controller.passwordError}</div> : null}
      <ExportPassword controller={controller} t={t} />
      {controller.zipOnly ? (
        <div className="notice">{t("No link host is set up, so exports are zip downloads only. Set up storage to get a share link.")}</div>
      ) : null}
      <ExportList controller={controller} t={t} />
    </section>
  );
}

function ExportFailureNotice({ controller, t }: { controller: SiteExportController; t: Translate }) {
  if (controller.exportFailure) return <ErrorNotice failure={controller.exportFailure} t={t} />;
  return controller.exportError ? <div className="notice error" role="alert">{controller.exportError}</div> : null;
}

/** Passwords exist only while explicitly displayed; refreshing requires an owner reveal again. */
function ExportPassword({ controller, t }: { controller: SiteExportController; t: Translate }) {
  if (!controller.revealedPassword) return null;
  return (
    <div className="notice" data-agent-private="">
      <div className="field">
        <label className="field-label" htmlFor="sites-export-password">{t("Export password")}</label>
        <input id="sites-export-password" type="text" readOnly autoComplete="off" spellCheck={false}
          value={controller.revealedPassword.password} aria-describedby="sites-export-password-hint" />
        <p className="field-hint" id="sites-export-password-hint">{t("Send this password separately")}</p>
      </div>
      <div className="site-transfer-actions">
        <button type="button" className="btn-secondary" onClick={() => void controller.copyPassword()}>
          <span aria-live="polite">{controller.passwordCopied ? t("Copied") : t("Copy")}</span>
        </button>
        <button type="button" className="btn-secondary" onClick={controller.hidePassword}>{t("Hide password")}</button>
      </div>
    </div>
  );
}

function ExportList({ controller, t }: { controller: SiteExportController; t: Translate }) {
  if (controller.listError) return <div className="notice error">{controller.listError}</div>;
  if (!controller.shares) return <div className="notice">{t("Loading exports…")}</div>;
  return (
    <DataTable
      rows={controller.shares}
      rowKey={(share) => share.shareId}
      label={t("Exports")}
      empty={<div className="sites-empty"><p className="sites-empty-lead">{t("No exports yet.")}</p></div>}
      rowDetail={(share, index) => <ExportCredentialDetail share={share} index={index} controller={controller} t={t} />}
      columns={[
        { key: "date", header: t("Date"), cellClassName: "site-transfer-num", cell: (share) => formatTimestamp({ iso: share.createdAt }, { timeZone: "local" }) },
        { key: "size", header: t("Size"), cellClassName: "site-transfer-num", cell: (share) => formatTransferBytes(share.bytes) },
        { key: "link", header: t("Link"), cell: (share) => <ShareLinkCell share={share} t={t} /> },
        {
          key: "status",
          header: t("Status"),
          cell: (share) => {
            const view = shareStatusView(share.status, t);
            return <span className="site-transfer-status"><span className={view.className}>{view.label}</span><TransferNoticeTip notices={exportRowNotices({ share, t })} t={t} /></span>;
          },
        },
        { key: "actions", headerLabel: t("Actions"), cell: (share, index) => <ShareActions share={share} index={index} controller={controller} t={t} /> },
      ]}
    />
  );
}

/** The row's warning sign: the export's own notices, plus where credentials may be. @complexity O(n) notices. */
function exportRowNotices({ share, t }: { share: SiteShare; t: Translate }, _options = {}): readonly string[] {
  const notices = siteShareNotices({ share });
  if (!share.needsAcknowledgement && !share.credentialWarnings?.length) return notices;
  return [...notices, credentialSummary({ subject: "export", warnings: share.credentialWarnings ?? [], t })];
}

/**
 * The full-width line under an export with credential warnings: "Show files" has the row's whole
 * width instead of the narrow Status column. The one checkbox records "I understand" and then enables
 * Download zip and Copy link; deliberately no agent handle, acknowledging is the user's own act. The
 * line stays once the checkbox has gone, so Revoke and "I understand" never move the rows below.
 */
function ExportCredentialDetail({ share, index, controller, t }: { share: SiteShare; index: number; controller: SiteExportController; t: Translate }) {
  const gate = controller.credentialGate(share);
  const warnings = gate?.warnings ?? share.credentialWarnings ?? [];
  if (!gate && !warnings.length) return null;
  return (
    <div className="site-transfer-detail" role={gate?.message ? "alert" : undefined}>
      {gate?.message ? <p className="site-transfer-detail-message">{gate.message}</p> : null}
      <CredentialWarningList warnings={warnings} t={t} />
      {gate ? <ExportAcknowledge share={share} gate={gate} index={index} controller={controller} t={t} /> : null}
    </div>
  );
}

function ExportAcknowledge({ share, gate, index, controller, t }: { share: SiteShare; gate: CredentialGate; index: number; controller: SiteExportController; t: Translate }) {
  const errorId = `sites-export-${index + 1}-credentials-error`;
  return <>
    <label className="site-transfer-acknowledge">
      <input type="checkbox" checked={gate.acknowledging} disabled={gate.acknowledging} aria-busy={gate.acknowledging}
        aria-describedby={gate.error ? errorId : undefined}
        onChange={event => { if (event.target.checked) void controller.acknowledge(share); }} />
      {t("I understand this export may contain credentials")}
    </label>
    {gate.error ? <p className="field-error" id={errorId} role="alert">{gate.error}</p> : null}
  </>;
}

function ShareLinkCell({ share, t }: { share: SiteShare; t: Translate }) {
  if (!share.url) return <span className="muted-cell">{t("Zip only")}</span>;
  return <span className="site-transfer-link" title={share.url}>{shortLink(share.url)}</span>;
}

/** Human-only reveal: keep the native control private even when its export row is published. */
function ExportPasswordRevealAction({ share, controller, t }: { share: SiteShare; controller: SiteExportController; t: Translate }) {
  if (!share.hasEncryptedKeys || !controller.canManageSavedKeys) return null;
  return <button type="button" className="btn-secondary" disabled={controller.revealingId !== null || controller.exporting || controller.exportingStatic}
    onClick={() => void controller.revealPassword({ shareId: share.shareId })}
    data-agent-private="">
    {controller.revealingId === share.shareId ? t("Revealing…") : t("Reveal password")}
  </button>;
}

/** Copy link, Download zip and Revoke for an active export; nothing for a revoked or failed one.
 * Copy link and Download zip stay disabled while the row's credential warning waits for "I understand". */
function ShareActions({ share, index, controller, t }: { share: SiteShare; index: number; controller: SiteExportController; t: Translate }) {
  if (share.status !== "active") return <span className="muted-cell">—</span>;
  const revoking = controller.revokingId === share.shareId;
  // Handing the archive out waits for "I understand"; Revoke and the password reveal do not.
  const gated = controller.credentialGate(share) !== null;
  return (
    <div className="site-transfer-actions">
      <ExportPasswordRevealAction share={share} controller={controller} t={t} />
      {share.url ? (
        <button
          type="button"
          className="btn-secondary"
          disabled={gated}
          onClick={() => void controller.copyLink(share)}
          {...agentHandle({ handle: `sites-export-${index + 1}-copy` }, { role: "button", label: "Copy this export's share link" })}
        >
          <span aria-live="polite">{controller.copiedId === share.shareId ? t("Copied") : t("Copy link")}</span>
        </button>
      ) : null}
      {gated ? (
        <button type="button" className="btn-secondary" disabled>{t("Download zip")}</button>
      ) : (
        <a
          className="btn-secondary"
          href={controller.downloadHref(share)}
          download={share.file}
          // The server is asked first, so a refusal shows its reason instead of being saved as the "zip".
          onClick={event => { event.preventDefault(); void controller.download(share); }}
          {...agentHandle({ handle: `sites-export-${index + 1}-download` }, { role: "link", label: "Download this export's .tovu.zip" })}
        >
          {t("Download zip")}
        </a>
      )}
      <button
        type="button"
        className="btn-danger"
        disabled={controller.revokingId !== null}
        onClick={() => void controller.revoke(share)}
        {...agentHandle({ handle: `sites-export-${index + 1}-revoke` }, { role: "button", label: "Revoke this export so its link stops working" })}
      >
        {revoking ? t("Revoking…") : t("Revoke")}
      </button>
    </div>
  );
}
