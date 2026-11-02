/**
 * @file The "Open Site…" and "Open Recent" menu actions, extracted from `main.ts`'s
 * `adoptAndOpenSite` / `promptAndOpenNewSite` so their failure handling — every failure reported
 * where the user can see it, the menu refreshed only after a real open, a cancelled picker doing
 * nothing — is verified without Electron. `main.ts` passes `dialog.showErrorBox` and the bound
 * adopt/open/refresh steps in.
 */

/** The steps one menu open is made of, bound by `main.ts` to this launch's `ctx`. */
interface SiteOpenActionPorts {
  /** `site-dir-store.ts`'s `adoptSiteDir`: re-classify (and init, if empty) the folder; resolves to the site dir. */
  adoptSiteDir: (dir: string) => Promise<string>;
  /** `main.ts`'s `openSiteWindow`. */
  openSiteWindow: (siteDir: string) => Promise<unknown>;
  /** Rebuild the app menu so "Open Recent" reflects the new MRU order. */
  refreshAppMenu: () => void;
  /** The site-folder picker (`site-folder-prompt.ts`) with nothing rejected; `null` when cancelled. */
  promptForSiteDir: () => Promise<string | null>;
  showErrorBox: (title: string, message: string) => void;
}

/**
 * Shared by "Open Site…" and "Open Recent": re-classify `dir` through `adoptSiteDir` (never trust a
 * folder blindly, even one from the MRU — it could have been moved or emptied since the menu was
 * built), open it, then refresh the menu so "Open Recent" reflects the new MRU order. Reports a
 * failure where the user can see it instead of the app silently doing nothing.
 * @complexity O(1) beyond `adoptSiteDir`/`openSiteWindow`'s own cost.
 */
async function adoptAndOpenSite({ dir, ports }: { dir: string; ports: SiteOpenActionPorts }, _optional = {}): Promise<void> {
  try {
    const adopted = await ports.adoptSiteDir(dir);
    await ports.openSiteWindow(adopted);
  } catch (error) {
    ports.showErrorBox("Tovu could not open that site", (error as Error).message);
    return;
  }
  ports.refreshAppMenu();
}

/** The "Open Site…" menu action: ask for a folder with no MRU/dev-fallback precedence (those are
 *  startup-only conveniences — see `resolveSiteDir`), then hand it to {@link adoptAndOpenSite}.
 *  @complexity O(1) beyond the picker and the open. */
async function promptAndOpenNewSite({ ports }: { ports: SiteOpenActionPorts }, _optional = {}): Promise<void> {
  let dir;
  try {
    dir = await ports.promptForSiteDir();
  } catch (error) {
    ports.showErrorBox("Tovu could not open that folder", (error as Error).message);
    return;
  }
  if (dir === null) return;
  await adoptAndOpenSite({ dir, ports });
}

export { adoptAndOpenSite, promptAndOpenNewSite };
export type { SiteOpenActionPorts };
