import type { Translate } from "@jini-ai/ui/panel-kit";
import { resolveActiveTabId } from "@jini-ai/ui/panel-kit";
import type { TabBarTab } from "@jini-ai/ui/tab-strip";
import { ExportSiteIcon, ImportSiteIcon } from "../sites";

/**
 * @file The Import & Export page's tabs (owner, 2026-10-25, option A): Export and Import moved here
 * from Sites, so they work on every host — the desktop app and a hosted install have no Sites
 * section, and their links to `/sites?tab=export|import` bounced to the dashboard. Other keeps the
 * cards that link elsewhere plus Git backup. `?tab=` names the tab, the same key every tabbed admin
 * screen uses and `panels.tsx` threads in.
 */
export const IMPORT_EXPORT_TAB_IDS = ["export", "import", "other"] as const;
export type ImportExportTabId = (typeof IMPORT_EXPORT_TAB_IDS)[number];

/** Falls back to Export for an absent or unrecognized `?tab=`, through the shared guard Sites and
 *  Deployment use — a stale bookmark or a typo must open a tab, never a blank panel. */
export function resolveImportExportTabId(tabId: string | null | undefined): ImportExportTabId {
  return resolveActiveTabId({ tabId: tabId, validIds: IMPORT_EXPORT_TAB_IDS, defaultId: "export" });
}

/**
 * Export / Import carry the sidebar's "Soon" tag (owner, 2026-10-18, on Sites: "greyed out for both
 * but you can still go to them and try it"); the move keeps it. Tagged tabs stay enabled; the grey
 * label comes from `.import-export-page` in `styles.css`. Set to `false` to drop both tags.
 */
export const SITE_TRANSFER_TABS_SOON = true;

/** Other — three dots, the plain "more" mark: the remaining ways out (static HTML, Git backup).
 *  Same 24px grid, 1.5 stroke and `aria-hidden` as `sites-visuals.tsx`, so it sits with the Export
 *  and Import glyphs; without it Other was the one icon-less row in an admin of icon-led tab bars. */
function OtherIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden>
      <circle cx="6" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="18" cy="12" r="1" />
    </svg>
  );
}

/**
 * The three tabs, in the shape `TabBar` takes. Actions, so no counts.
 * @complexity O(1) — a fixed array of three tabs.
 */
export function resolveImportExportTabs(
  { t }: { t: Translate },
  { transferTabsSoon = SITE_TRANSFER_TABS_SOON }: { transferTabsSoon?: boolean } = {},
): TabBarTab[] {
  const soonTag = transferTabsSoon ? t("Soon") : undefined;
  const soonSuffix = transferTabsSoon ? " (coming soon)" : "";
  return [
    {
      id: "export",
      label: t("Export"),
      icon: <ExportSiteIcon />,
      tag: soonTag,
      handle: "import-export-tab-export",
      handleLabel: "Switch to the Export tab — make a .tovu.zip of this site and manage its share links" + soonSuffix,
    },
    {
      id: "import",
      label: t("Import"),
      icon: <ImportSiteIcon />,
      tag: soonTag,
      handle: "import-export-tab-import",
      handleLabel: "Switch to the Import tab — import a share link, a .tovu.zip or a live website" + soonSuffix,
    },
    {
      id: "other",
      label: t("Other"),
      icon: <OtherIcon />,
      handle: "import-export-tab-other",
      handleLabel: "Switch to the Other tab — static site export and Git backup",
    },
  ];
}
