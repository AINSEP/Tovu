import { ImportExport as ImportExportScreen } from "@jini-ai/admin/screens/import-export/ImportExport";
import { agentHandle } from "@jini-ai/core/agent-handles";
import { navigate } from "@jini-ai/admin/shell/lib/router";
import { SiteExportTab, SiteImportTab } from "../sites";
import { useWiredImportExportTranslate, useWiredSitesSectionAvailable, useSiteTransferTranslate } from "./hooks/import-export-dependencies.hooks";
import { useWiredGitBackup } from "./hooks/git-backup-dependencies.hooks";
import { type Translate } from '@jini-ai/core/text';
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

export function ImportExport({
  useTranslate = useWiredImportExportTranslate,
  useGitBackup = useWiredGitBackup,
  useTransferTranslate = useSiteTransferTranslate,
  useSitesAvailable = useWiredSitesSectionAvailable,
  tabId,
}: ImportExportProps = {}) {
  return <ImportExportScreen {...(tabId === undefined ? {} : { tabId })} useTranslate={useTranslate} useGitBackup={useGitBackup} useTransferTranslate={useTransferTranslate} useSitesAvailable={useSitesAvailable} SiteExportTab={SiteExportTab} SiteImportTab={SiteImportTab} agentHandle={agentHandle} navigate={navigate}
    handleLabels={{ export: "Switch to the Export tab — make a .tovu.zip of this site and manage its share links", import: "Switch to the Import tab — import a share link, a .tovu.zip or a live website" }} />;
}
