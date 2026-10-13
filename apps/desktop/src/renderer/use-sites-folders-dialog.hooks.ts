/** SitesFoldersDialog's display values and event adapters; settings hooks retain drafts and IPC ownership. */
import type { useSiteStorageSettings } from './use-site-storage-settings.hooks.js';

type Settings = ReturnType<typeof useSiteStorageSettings>;
type FolderPath = { head: string; tail: string };

/** Presentation-only contract; actions delegate to the settings instance from the current render. */
export interface SitesFoldersDialogView {
  home: FolderPath;
  roots: (FolderPath & { root: string; isHome: boolean; canRemove: boolean; removeLabel: string; onRemove: () => void })[];
  showTrigger: boolean;
  showOutsideWarning: boolean;
  showAppDataNote: boolean;
  homeOverridden: boolean | undefined;
  rootsOverridden: boolean | undefined;
  homeDisabled: boolean | undefined;
  rootsDisabled: boolean | undefined;
  onChooseHome: () => void;
  onAddFolder: () => void;
  onUseAppData: () => void;
  onUseLocalHome: () => void;
  onSubmit: (event: { preventDefault(): void }) => void;
  onDatabasesChange: (event: { target: { value: string } }) => void;
}

function folderPath({ root }: { root: string }): FolderPath {
  // Middle truncation: the parent path gives way first, the folder's own name stays readable.
  const cut = root.lastIndexOf('/', root.length - 2) + 1;
  return { head: root.slice(0, cut), tail: root.slice(cut) };
}

/** Derive dialog props without adding state or invoking settings actions during rendering.
 * @param required.settings Current settings owner, including native-picker and save actions.
 * @param options.showTrigger Whether this instance supplies the Websites settings button.
 * @returns Display values and void event adapters; action errors remain owned by the settings hook.
 * @complexity O(n*m + p) time for n roots, m extra roots and p total path characters;
 * O(n + p) display storage. Retains the existing membership scan; no per-row I/O.
 */
export function useSitesFoldersDialog(
  { settings }: { settings: Settings },
  { showTrigger = true }: { showTrigger?: boolean } = {},
): SitesFoldersDialogView {
  const homeOverridden = settings.folders.overrides?.sitesHome;
  const rootsOverridden = settings.folders.overrides?.siteRoots;
  return {
    home: folderPath({ root: settings.folders.home ?? '' }),
    roots: settings.folders.roots.map((root) => ({
      root, ...folderPath({ root }), isHome: root === settings.folders.home,
      canRemove: root !== settings.folders.home && settings.folders.extraRoots.includes(root),
      removeLabel: `Remove sites folder ${root}`,
      onRemove: () => void settings.removeFolder({ root }),
    })),
    showTrigger,
    // The sync warning renders inside the dialog while it is open; the outside copy would
    // sit behind the modal backdrop. Menu-only instances do not supply an outside copy.
    showOutsideWarning: showTrigger && !settings.open,
    showAppDataNote: settings.databases === 'appData',
    homeOverridden, rootsOverridden,
    homeDisabled: settings.busy || homeOverridden,
    rootsDisabled: settings.busy || rootsOverridden,
    onChooseHome: () => void settings.chooseHome(),
    onAddFolder: () => void settings.addFolder(),
    onUseAppData: () => void settings.useAppData(),
    onUseLocalHome: () => void settings.useLocalHome(),
    onSubmit: (event) => { event.preventDefault(); void settings.save(); },
    onDatabasesChange: (event) => settings.setDatabases(event.target.value as 'inSite' | 'appData'),
  };
}
