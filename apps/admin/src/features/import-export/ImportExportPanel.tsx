import { ImportExport, type ImportExportProps } from "@jini-ai/admin/screens/import-export/ImportExport";

import { SiteExportTab, SiteImportTab } from "../sites";
import { useImportExportTranslate, useSitesSectionAvailable, useSiteTransferTranslate } from "./hooks/use-import-export.hooks";
import { useWiredGitBackup } from "./hooks/use-git-backup.hooks";

/**
 * @file The Import & Export panel's mount: renders `@jini-ai/admin`'s `ImportExport` with this app's
 * wiring (see `README.md` `## Wiring`) — the locale-bound translators, the live Git backup
 * controller, the Sites availability rule, the Sites screen's own Export/Import tabs, and the
 * tabs' agent labels, which name this product's `.tovu.zip` archive. Any of them can be overridden
 * (tests inject doubles), as the screen's own defaults could be before it moved.
 */

export const IMPORT_EXPORT_HANDLE_LABELS: ImportExportProps["handleLabels"] = {
  export: "Switch to the Export tab — make a .tovu.zip of this site and manage its share links",
  import: "Switch to the Import tab — import a share link, a .tovu.zip or a live website",
};

export function ImportExportPanel(overrides: Partial<ImportExportProps> = {}) {
  return (
    <ImportExport
      useTranslate={useImportExportTranslate}
      useGitBackup={useWiredGitBackup}
      useTransferTranslate={useSiteTransferTranslate}
      useSitesAvailable={useSitesSectionAvailable}
      SiteExportTab={SiteExportTab}
      SiteImportTab={SiteImportTab}
      handleLabels={IMPORT_EXPORT_HANDLE_LABELS}
      {...overrides}
    />
  );
}
