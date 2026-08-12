import { api, type PresentationSettings, type ThemeTier } from "../../../lib/api";
import type { ThemesPort } from "./themes-port.hooks";

/**
 * @file The only place under `features/themes` that reaches `lib/api` for the five `ThemesPort`
 * routes — see `themes-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. */
export const defaultThemesPort: ThemesPort = {
  getPresentation: () => api.getPresentation(),
  rescanThemes: () => api.rescanThemes(),
  setActiveTheme: (activeThemeId) => api.setActiveTheme(activeThemeId),
  listMarketplaceThemes: () => api.listMarketplaceThemes(),
  downloadMarketplaceTheme: (themeId) => api.downloadMarketplaceTheme(themeId),
};

/** Seed state for {@link createFakeThemesPort}. */
export interface FakeThemesPortOptions {
  settings?: PresentationSettings;
  availableThemeIds?: string[];
  availableThemes?: Array<{ id: string; tier: ThemeTier }>;
  marketplace?: Array<{ id: string; name: string; tier: string; description?: string; idTaken: boolean }>;
  /** Lets a test script what a rescan/download reports without the fake reimplementing the
   *  server's own theme-directory scan. */
  onRescan?: () => { added: string[]; removed: string[]; total: number; availableThemeIds: string[]; duplicateIds: string[] };
  onDownload?: (themeId: string) => { id: string; suffixed: boolean; tier: string; rescan: { added: string[]; removed: string[]; total: number } };
}

/**
 * An in-memory {@link ThemesPort} for tests — lets a test describe "these themes are installed,
 * this one is active" directly, instead of hand-building `Response` objects and stubbing global
 * `fetch`. Shipped alongside the real binding per the pattern's "every port gets a fake" rule.
 */
export function createFakeThemesPort(options: FakeThemesPortOptions = {}): ThemesPort {
  let settings: PresentationSettings = options.settings ?? { workspaceId: "fake-ws", activeThemeId: "basic", updatedAt: new Date(0).toISOString() };
  const availableThemeIds = [...(options.availableThemeIds ?? ["basic"])];
  const availableThemes = [...(options.availableThemes ?? [{ id: "basic", tier: "declarative" as ThemeTier }])];

  return {
    async getPresentation() {
      return { settings, availableThemeIds: [...availableThemeIds], availableThemes: [...availableThemes] };
    },

    async rescanThemes() {
      if (options.onRescan) return options.onRescan();
      return { added: [], removed: [], total: availableThemeIds.length, availableThemeIds: [...availableThemeIds], duplicateIds: [] };
    },

    async setActiveTheme(activeThemeId) {
      settings = { ...settings, activeThemeId };
      return { settings, availableThemeIds: [...availableThemeIds] };
    },

    async listMarketplaceThemes() {
      return { themes: [...(options.marketplace ?? [])] };
    },

    async downloadMarketplaceTheme(themeId) {
      if (options.onDownload) return options.onDownload(themeId);
      return { id: themeId, suffixed: false, tier: "declarative", rescan: { added: [themeId], removed: [], total: availableThemeIds.length + 1 } };
    },
  };
}
