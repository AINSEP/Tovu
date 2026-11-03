/**
 * The app-wide Settings menu (Automatic updates, and the product-sharing checkboxes when product
 * telemetry booted), its in-place refresh after the first-run sharing dialog, and the own-server
 * mode application menu that carries it. Templates only: `main.ts` hands them to Electron's `Menu`.
 */
import path from "node:path";
import type { MenuItemConstructorOptions } from "electron";
import { automaticUpdatesMenu, readAutomaticUpdates } from "../../desktop-update-preference.ts";
import { maximumLiveSiteViewsMenu, readMaximumLiveSiteViews, writeMaximumLiveSiteViews } from "../../site-view-preference.ts";
import { desktopCopy } from "../../desktop-i18n.ts";
import { productTelemetryMenu, readProductTelemetryPreference, writeProductTelemetryPreference } from "../../product-telemetry-preference.ts";
import type { ProductTelemetryPreference } from "../../product-telemetry-preference.ts";

/** Shown when a sharing choice cannot be persisted; the same words the first-run dialog uses. */
export const SHARING_SAVE_ERROR = "Your sharing choice could not be saved. No choice was changed.";

/** The checkbox labels `product-telemetry-preference.ts`'s `productTelemetryMenu` builds. */
const CRASHES_LABEL = "Send crash reports to Tovu";
const USAGE_LABEL = "Send usage statistics to Tovu";

/** The durable desktop preferences file (automatic updates, product sharing) in Electron's userData. */
export function desktopPreferencesPath({ userData }: { userData: string }, _optionalArgs = {}): string {
  return path.join(userData, "desktop-preferences.json");
}

/** The booted product telemetry's slice the menu reads; `launch` is unset when nothing booted. */
export interface ProductMenuSource {
  launch: unknown;
  consentChanged(preference: ProductTelemetryPreference): void;
}

/**
 * Settings: Automatic updates, plus the two sharing checkboxes when product telemetry booted.
 * Every checkbox persists before it applies; a failed save shows a native error box.
 * @complexity O(1) plus the preference reads.
 */
export function desktopSettingsMenu({ locale, preferencePath, product, setAutomaticUpdates, setMaximumLiveSiteViews, showErrorBox }: {
  locale: string;
  preferencePath: string;
  product: ProductMenuSource;
  setAutomaticUpdates: (args: { enabled: boolean }) => void;
  setMaximumLiveSiteViews?: (args: { maximumLiveSiteViews: number }) => void;
  showErrorBox: (title: string, content: string) => void;
}, {
  readAutomatic = readAutomaticUpdates,
  readSharing = readProductTelemetryPreference,
  writeSharing = writeProductTelemetryPreference,
  readViewMaximum = readMaximumLiveSiteViews,
}: {
  readAutomatic?: typeof readAutomaticUpdates;
  readSharing?: typeof readProductTelemetryPreference;
  writeSharing?: typeof writeProductTelemetryPreference;
  readViewMaximum?: typeof readMaximumLiveSiteViews;
} = {}): MenuItemConstructorOptions & { submenu: MenuItemConstructorOptions[] } {
  const settings = automaticUpdatesMenu({
    locale,
    enabled: readAutomatic({ preferencePath }),
    setEnabled: setAutomaticUpdates,
    onError: ({ error }) => showErrorBox(desktopCopy({ locale }).saveUpdateError,
      error instanceof Error ? error.message : String(error)),
  });
  const submenu: MenuItemConstructorOptions[] = [...settings.submenu];
  if (product.launch) submenu.push(...productTelemetryMenu({
    preference: readSharing({ preferencePath }),
    save: patch => writeSharing({ preferencePath, patch }),
    changed: preference => product.consentChanged(preference),
    onError: () => showErrorBox("Tovu", SHARING_SAVE_ERROR),
  }));
  submenu.push(maximumLiveSiteViewsMenu({
    maximumLiveSiteViews: readViewMaximum({ preferencePath }),
    setMaximum: setMaximumLiveSiteViews ?? (input => writeMaximumLiveSiteViews({ preferencePath, ...input })),
    onError: ({ error }) => showErrorBox('Tovu', error instanceof Error ? error.message : String(error)),
  }));
  return { label: settings.label, submenu };
}

/** The slice of an installed Electron `Menu` the refresh walks. */
export interface CheckableMenu {
  items: { submenu?: { items: { label: string; checked: boolean }[] } | null }[];
}

/** Electron's `Menu` statics: the installed application menu, if any. */
export interface ApplicationMenuPort {
  getApplicationMenu(): CheckableMenu | null;
}

/** Refresh checkbox state after the dialog without rebuilding other menus. O(n) menu items. */
export function refreshProductMenu({ menu, preferencePath }: { menu: ApplicationMenuPort; preferencePath: string }, {
  readSharing = readProductTelemetryPreference,
}: { readSharing?: typeof readProductTelemetryPreference } = {}): void {
  const preference = readSharing({ preferencePath });
  const items = menu.getApplicationMenu()?.items.flatMap(item => item.submenu?.items ?? []) ?? [];
  for (const item of items) {
    if (item.label === CRASHES_LABEL) item.checked = preference.crashes;
    if (item.label === USAGE_LABEL) item.checked = preference.usage;
  }
}

/**
 * The own-server mode application menu. The "Window" menu's native `role: "windowMenu"` (macOS) is
 * the site switcher itself — every open site is a distinctly-titled window, and macOS lists and
 * switches between them for free; nothing custom was built for this. "Open Recent" is rebuilt on
 * every call (see `main.ts`'s `refreshAppMenu`) so a just-opened site appears there next time.
 * @complexity O(n) in the MRU length (bounded, see `site-dir-store.ts`'s `MAX_RECENT_SITE_DIRS`).
 */
export function ownServerMenuTemplate({ platform, recents, settings, openNewSite, openRecent }: {
  platform: NodeJS.Platform;
  recents: readonly string[];
  settings: MenuItemConstructorOptions;
  openNewSite: () => void;
  openRecent: (args: { dir: string }) => void;
}, _optionalArgs = {}): MenuItemConstructorOptions[] {
  return [
    // `as const`: a conditional spread otherwise widens this role, and every entry after it, to `string`.
    ...(platform === "darwin" ? [{ role: "appMenu" } as const] : []),
    {
      label: "File",
      submenu: [
        { label: "Open Site…", accelerator: "CmdOrCtrl+O", click: () => openNewSite() },
        {
          label: "Open Recent",
          submenu:
            recents.length === 0
              ? [{ label: "No recent sites", enabled: false }]
              : recents.map((dir) => ({ label: dir, click: () => openRecent({ dir }) })),
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { role: "editMenu" },
    settings,
    { role: "windowMenu" },
  ];
}
