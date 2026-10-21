import { agentHandle } from "@jini-ai/agentic";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { IMPORT_EXPORT_LINKS, type ImportExportLink } from "./import-export-links";
import { useImportExportTranslate } from "./hooks/use-import-export.hooks";

/**
 * @file Operations → Import & Export (`/admin/import-export`). A hub, not a second copy of any flow:
 * one card per existing screen that moves a site in or out (see `import-export-links.ts`). Git
 * backup has tools but no route or screen yet, so it is not listed here.
 */

export interface ImportExportProps {
  /** Injected in tests; the panel uses the locale-bound translator otherwise. */
  useTranslate?: () => Translate;
}

function ImportExportCard({ link, t }: { link: ImportExportLink; t: Translate }) {
  return (
    <section className="card import-export-card" aria-labelledby={`import-export-${link.id}-title`}>
      <h2 id={`import-export-${link.id}-title`} className="card-title">{t(link.title)}</h2>
      <p className="card-lead">{t(link.lead)}</p>
      {/* Named "Open <title>" by its own text plus the heading, so three "Open" links stay distinct. */}
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

export function ImportExport({ useTranslate = useImportExportTranslate }: ImportExportProps = {}) {
  const t = useTranslate();
  return (
    <div className="page import-export-page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Operations")}</p>
          <h1 className="page-title">{t("Import & Export")}</h1>
          <p className="page-description">{t("Move a site in or out.")}</p>
        </div>
      </div>
      <div className="import-export-grid">
        {IMPORT_EXPORT_LINKS.map((link) => <ImportExportCard key={link.id} link={link} t={t} />)}
      </div>
    </div>
  );
}
