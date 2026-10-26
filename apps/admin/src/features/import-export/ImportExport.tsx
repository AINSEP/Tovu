import { agentHandle } from "@jini-ai/agentic";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { TabBar } from "@jini-ai/ui/tab-strip";
import { navigate } from "../../lib/router";
import { SiteExportTab, SiteImportTab } from "../sites";
import { IMPORT_EXPORT_LINKS, type ImportExportLink } from "./import-export-links";
import { resolveImportExportTabId, resolveImportExportTabs, type ImportExportTabId } from "./import-export-tabs";
import { useImportExportTranslate, useSitesSectionAvailable, useSiteTransferTranslate } from "./hooks/use-import-export.hooks";
import { useWiredGitBackup } from "./hooks/use-git-backup.hooks";
import { GitBackupCard } from "./GitBackupCard";

/**
 * @file Operations → Import & Export (`/admin/import-export`). Three tabs (owner, 2026-10-25,
 * option A): Export and Import render the Sites screen's own Export Site / Import Site tabs as they
 * are — moved here because the desktop app and a hosted install have no Sites section, so the links
 * this page used to hold bounced to the dashboard. Other is still a hub, not a second copy of any
 * flow: one card per screen elsewhere that moves a site (see `import-export-links.ts`), plus the Git
 * backup card, whose flow lives here because it has no other screen (`GitBackupCard.tsx`).
 */

export interface ImportExportProps {
  /** Injected in tests; the panel uses the locale-bound translator otherwise. */
  useTranslate?: () => Translate;
  /** Injected in tests; the live Git backup controller otherwise. */
  useGitBackup?: typeof useWiredGitBackup;
  /** Injected in tests; the Sites dictionary the Export and Import tabs read, otherwise. */
  useTransferTranslate?: () => Translate;
  /** Injected in tests; whether this deployment has a Sites section, otherwise. */
  useSitesAvailable?: () => boolean;
  /** The `?tab=` query value from `panels.tsx` (`null` when absent). See `resolveImportExportTabId`. */
  tabId?: string | null;
}

function ImportExportCard({ link, t }: { link: ImportExportLink; t: Translate }) {
  return (
    <section className="card import-export-card" aria-labelledby={`import-export-${link.id}-title`}>
      <h2 id={`import-export-${link.id}-title`} className="card-title">{t(link.title)}</h2>
      <p className="card-lead">{t(link.lead)}</p>
      {/* Named "Open <title>" by its own text plus the heading, so each "Open" link stays distinct. */}
      <a
        id={`import-export-${link.id}-link`}
        className="btn-secondary"
        href={link.href}
        aria-labelledby={`import-export-${link.id}-link import-export-${link.id}-title`}
        {...agentHandle({ handle: `import-export-${link.id}-link` }, { role: "link", label: `Open ${link.title}` })}
      >
        {t("Open")}
      </a>
    </section>
  );
}

/** The Other tab: the cards for screens elsewhere, then Git backup. Its own component so the Git
 *  backup read runs only while this tab is open. */
function OtherTab({ t, useGitBackup }: { t: Translate; useGitBackup: typeof useWiredGitBackup }) {
  const gitBackup = useGitBackup({ t });
  return (
    <>
      <div className="import-export-grid">
        {IMPORT_EXPORT_LINKS.map((link) => <ImportExportCard key={link.id} link={link} t={t} />)}
      </div>
      <GitBackupCard controller={gitBackup} t={t} />
    </>
  );
}

/** The Export and Import tabs, each with the translator it was written against. Hooks run here, not
 *  in `ImportExport`, so the Other tab never reads the sites list. */
function TransferTab({ tab, useTransferTranslate, useSitesAvailable }: {
  tab: "export" | "import";
  useTransferTranslate: () => Translate;
  useSitesAvailable: () => boolean;
}) {
  const t = useTransferTranslate();
  const sitesAvailable = useSitesAvailable();
  // No Publish button beside "Export this site" any more. It sat here from 2026-10-18 and was kept
  // on every host earlier on 2026-10-25 ("i should be able to publish media, posts, pages, etc"),
  // then removed the same day (owner: "lets remove it") because it republishes the WHOLE site and
  // read as publishing the zip. Publishing stays on the dashboard's "Publish All" and Deployment,
  // both present on desktop too. `SitePublishButton` is kept, unmounted, for reuse.
  if (tab === "export") return <SiteExportTab t={t} />;
  return <SiteImportTab t={t} showNewSiteLink={sitesAvailable} />;
}

/** `replace: true` so switching tabs does not grow the back stack, as Sites and Deployment do. */
function goToImportExportTab(id: string) {
  navigate(`/import-export?tab=${id}`, { replace: true });
}

export function ImportExport({
  useTranslate = useImportExportTranslate,
  useGitBackup = useWiredGitBackup,
  useTransferTranslate = useSiteTransferTranslate,
  useSitesAvailable = useSitesSectionAvailable,
  tabId,
}: ImportExportProps = {}) {
  const t = useTranslate();
  const tab: ImportExportTabId = resolveImportExportTabId(tabId);
  return (
    // `import-export-page` also scopes the greyed "Soon" tab labels (`styles.css`).
    <div className="page import-export-page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Operations")}</p>
          <h1 className="page-title">{t("Import & Export")}</h1>
          <p className="page-description">{t("Move a site in or out.")}</p>
        </div>
      </div>
      <TabBar
        tabs={resolveImportExportTabs({ t })}
        activeId={tab}
        onChange={goToImportExportTab}
        ariaLabel={t("Import & Export")}
        containerHandle="import-export-tabs"
      />
      {tab === "other"
        ? <OtherTab t={t} useGitBackup={useGitBackup} />
        : <TransferTab key={tab} tab={tab} useTransferTranslate={useTransferTranslate} useSitesAvailable={useSitesAvailable} />}
    </div>
  );
}
