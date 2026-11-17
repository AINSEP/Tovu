

import type { TabBarTab } from "@jini-ai/ui/tab-strip";
import { Icon } from "@jini-ai/ui";

import { type Translate, resolveActiveTabId } from '@jini-ai/core/text';
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
export function resolveImportExportTabId({ tabId }: { tabId: string | null | undefined }, _optional = {}): ImportExportTabId {
  return resolveActiveTabId({ tabId: tabId, validIds: IMPORT_EXPORT_TAB_IDS, defaultId: "export" });
}

/**
 * The three tabs, in the shape `TabBar` takes. Actions, so no counts.
 * @complexity O(1) — a fixed array of three tabs.
 */
export function resolveImportExportTabs(
  { t }: { t: Translate },
  _options: Record<string, never> = {},
): TabBarTab[] {
  return [
    {
      id: "export",
      label: t("Export"),
      icon: <Icon name="tray-export" size={16} strokeWidth={1.5} />,
      handle: "import-export-tab-export",
      handleLabel: "Switch to the Export tab — make a .tovu.zip of this site and manage its share links",
    },
    {
      id: "import",
      label: t("Import"),
      icon: <Icon name="tray-import" size={16} strokeWidth={1.5} />,
      handle: "import-export-tab-import",
      handleLabel: "Switch to the Import tab — import a share link, a .tovu.zip or a live website",
    },
    {
      id: "other",
      label: t("Other"),
      icon: <Icon name="more-horizontal-outline" size={16} strokeWidth={1.5} />,
      handle: "import-export-tab-other",
      handleLabel: "Switch to the Other tab — static site export and Git backup",
    },
  ];
}
