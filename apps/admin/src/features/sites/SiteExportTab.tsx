import { DataTable } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import { formatTimestamp, type Translate } from "@jini-ai/ui/panel-kit";
import type { SiteShare } from "./hooks/site-transfer-dependencies.hooks";
import { useWiredSiteExport, type SiteExportController } from "./hooks/use-site-transfer.hooks";
import { formatTransferBytes, shareStatusView, shortLink } from "./site-transfer-rules";

/**
 * @file The "Export Site" screen (owner, 2026-10-18; on Sites, then the Import & Export page's
 * Export tab from 2026-10-25): one button that makes a
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
  return (
    <section className="site-transfer" aria-label={t("Export Site")}>
      <p className="onboarding-section-lead site-transfer-lead">{t("Makes a .tovu.zip copy of this site that another Tovu can import.")}</p>
      <p className="site-transfer-lead">{t("Images are exported as web-optimized copies.")}</p>
      <div className="site-export-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={controller.exporting}
          aria-busy={controller.exporting}
          onClick={() => void controller.exportSite()}
          {...agentHandle({ handle: "sites-export-create" }, { role: "button", label: "Export this site as a .tovu.zip" })}
        >
          {controller.exporting ? <span className="site-transfer-spinner" aria-hidden="true" /> : null}
          {controller.exporting ? t("Exporting…") : t("Export this site")}
        </button>
      </div>
      {controller.exportError ? <div className="notice error" role="alert">{controller.exportError}</div> : null}
      {controller.zipOnly ? (
        <div className="notice">{t("No link host is set up, so exports are zip downloads only. Set up storage to get a share link.")}</div>
      ) : null}
      <ExportList controller={controller} t={t} />
    </section>
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
      columns={[
        { key: "date", header: t("Date"), cellClassName: "site-transfer-num", cell: (share) => formatTimestamp({ iso: share.createdAt }, { timeZone: "local" }) },
        { key: "size", header: t("Size"), cellClassName: "site-transfer-num", cell: (share) => formatTransferBytes(share.bytes) },
        { key: "link", header: t("Link"), cell: (share) => <ShareLinkCell share={share} t={t} /> },
        {
          key: "status",
          header: t("Status"),
          cell: (share) => {
            const view = shareStatusView(share.status, t);
            return <span className={view.className}>{view.label}</span>;
          },
        },
        { key: "actions", headerLabel: t("Actions"), cell: (share, index) => <ShareActions share={share} index={index} controller={controller} t={t} /> },
      ]}
    />
  );
}

function ShareLinkCell({ share, t }: { share: SiteShare; t: Translate }) {
  if (!share.url) return <span className="muted-cell">{t("Zip only")}</span>;
  return <span className="site-transfer-link" title={share.url}>{shortLink(share.url)}</span>;
}

/** Copy link, Download zip and Revoke for an active export; nothing for a revoked or failed one. */
function ShareActions({ share, index, controller, t }: { share: SiteShare; index: number; controller: SiteExportController; t: Translate }) {
  if (share.status !== "active") return <span className="muted-cell">—</span>;
  const revoking = controller.revokingId === share.shareId;
  return (
    <div className="site-transfer-actions">
      {share.url ? (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void controller.copyLink(share)}
          {...agentHandle({ handle: `sites-export-${index + 1}-copy` }, { role: "button", label: "Copy this export's share link" })}
        >
          <span aria-live="polite">{controller.copiedId === share.shareId ? t("Copied") : t("Copy link")}</span>
        </button>
      ) : null}
      <a
        className="btn-secondary"
        href={controller.downloadHref(share)}
        download={share.file}
        {...agentHandle({ handle: `sites-export-${index + 1}-download` }, { role: "link", label: "Download this export's .tovu.zip" })}
      >
        {t("Download zip")}
      </a>
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
