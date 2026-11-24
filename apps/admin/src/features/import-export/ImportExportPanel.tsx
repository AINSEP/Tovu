import { ImportExport, type ImportExportProps } from "@jini-ai/admin/screens/import-export/ImportExport";
import { navigate } from "@jini-ai/admin/shell/lib/router";

import { SiteExportTab, SiteImportTab } from "../sites";
import { useSiteTransferTranslate, useWiredImportExportTranslate, useWiredSitesSectionAvailable } from "./hooks/import-export-dependencies.hooks";
import { useWiredGitBackup } from "./hooks/git-backup-dependencies.hooks";

/**
 * @file The Import & Export panel's mount: renders `@jini-ai/admin`'s `ImportExport` with this app's
 * wiring (see `README.md` `## Wiring`) — the locale-bound translators, the live Git backup
 * controller, the Sites availability rule, the Sites screen's own Export/Import tabs, the admin
 * router's `navigate`, and the
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
      useTranslate={useWiredImportExportTranslate}
      useGitBackup={useWiredGitBackup}
      useTransferTranslate={useSiteTransferTranslate}
      useSitesAvailable={useWiredSitesSectionAvailable}
      SiteExportTab={SiteExportTab}
      SiteImportTab={SiteImportTab}
      handleLabels={IMPORT_EXPORT_HANDLE_LABELS}
      navigate={navigate}
      {...overrides}
    />
  );
}
