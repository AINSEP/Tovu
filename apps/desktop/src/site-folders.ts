/** Tovu site discovery settings, stored in the shared config; legacy MRU-profile imports preserve discovery.
 * Atomic replacement and cross-process locking remain owned by Jini's durable JSON adapter.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readJsonFile, withFileLock, writeJsonFileAtomic, quarantineUnreadableFile } from './durable-json-file.ts';
import type { SitesWorkspace } from './shared-sites.ts';
import type { SiteFolders } from './contracts/project.ts';
import { assertSpecificSiteRoot } from './site-scan-policy.ts';

interface StoredSiteFolders {
  creationRoots: string[];
  extraRoots: string[];
}

/** Native-picking IPC and discovery consume this Tovu-specific settings port. */
export interface SiteFoldersPort {
  read(required: {}, options?: {}): SiteFolders;
  add(required: { root: string }, options?: {}): SiteFolders;
  remove(required: { root: string }, options?: {}): SiteFolders;
  rememberCreated(required: { siteDir: string }, options?: {}): void;
}

/** Resolve existing root aliases once per read; absent/removable volumes keep their saved path.
 * @complexity O(n) path resolutions for n roots.
 */
function distinctRoots({ roots }: { roots: string[] }, _options = {}): string[] {
  return [...new Set(roots.map((root) => {
    try { return fs.realpathSync(root); }
    catch { return path.resolve(root); }
  }))];
}

/** Missing/damaged settings cannot prevent the Websites window opening. Preserve damaged bytes
 * before the next mutation, using the same recovery policy as the MRU.
 * @complexity O(n) in settings size.
 */
function readStoredFolders({ filePath }: { filePath: string }, _options = {}): { stored: StoredSiteFolders; damaged: boolean } {
  const result = readJsonFile(filePath);
  const value = result.state === 'ok' ? result.value as Partial<StoredSiteFolders> | null : null;
  const valid = Array.isArray(value?.creationRoots) && Array.isArray(value?.extraRoots);
  if (!valid) return { stored: { creationRoots: [], extraRoots: [] }, damaged: result.state !== 'missing' };
  return {
    stored: {
      creationRoots: value!.creationRoots!.filter((root): root is string => typeof root === 'string' && path.isAbsolute(root)),
      extraRoots: value!.extraRoots!.filter((root): root is string => typeof root === 'string' && path.isAbsolute(root)),
    },
    damaged: false,
  };
}

/** Bind discovery settings to this profile. Creation parents survive MRU eviction and card removal;
 * old creation rows contribute parents until the operator creates another site there.
 * @param required The MRU path, built-in roots and optional live legacy creation-row reader.
 * @param optional.quarantine Moves a damaged settings file aside, `false` when it could not; defaults to `quarantineUnreadableFile`.
 * @returns The settings port; mutations lock, recover and atomically write only its own JSON file.
 * @throws Filesystem errors, or an error if damaged settings cannot be preserved on mutation.
 * @example createSiteFolders({ statePath, defaultRoots: [repoSites] }).read({})
 * @complexity O(n) roots per operation, plus JSON I/O and the durable lock wait for mutations.
 */
export function createSiteFolders({ statePath, defaultRoots, createdSiteDirs = () => [], home, workspace }: {
  statePath: string;
  defaultRoots: string[];
  createdSiteDirs?: () => string[];
  home?: () => string;
  workspace?: SitesWorkspace;
}, { quarantine = quarantineUnreadableFile }: { quarantine?: typeof quarantineUnreadableFile } = {}): SiteFoldersPort {
  const filePath = path.join(path.dirname(statePath), 'desktop-site-folders.json');
  if (workspace) return sharedSiteFolders({ workspace, filePath, createdSiteDirs, quarantine });
  const read = (_required: {}, _optional = {}): SiteFolders => {
    const { stored } = readStoredFolders({ filePath });
    const sitesHome = home?.();
    return {
      ...(sitesHome ? { home: sitesHome } : {}),
      roots: distinctRoots({ roots: [...(sitesHome ? [sitesHome] : []), ...defaultRoots, ...stored.creationRoots, ...createdSiteDirs().map((dir) => path.dirname(dir)), ...stored.extraRoots] }),
      extraRoots: distinctRoots({ roots: stored.extraRoots }),
    };
  };
  /** Preserve sibling-process edits and damaged bytes across a settings mutation. */
  const update = (change: (stored: StoredSiteFolders) => StoredSiteFolders): void => {
    withFileLock(filePath, () => {
      const { stored, damaged } = readStoredFolders({ filePath });
      if (damaged && !quarantine(filePath, {
        label: 'sites folders settings', consequence: 'the previous folder settings are only in that copy now.',
      })) throw new Error(`Could not preserve damaged sites folders settings at ${filePath}. Nothing was saved.`);
      writeJsonFileAtomic(filePath, change(stored));
    });
  };
  return {
    read,
    add({ root }, _optional = {}) {
      assertSpecificSiteRoot({ root });
      const canonical = fs.realpathSync(root);
      assertSpecificSiteRoot({ root: canonical });
      if (!fs.statSync(canonical).isDirectory()) throw new Error(`Sites folder is not a directory: ${root}`);
      update((stored) => ({ ...stored, extraRoots: distinctRoots({ roots: [...stored.extraRoots, canonical] }) }));
      return read({});
    },
    remove({ root }, _optional = {}) {
      const [canonical] = distinctRoots({ roots: [root] });
      update((stored) => ({ ...stored, extraRoots: distinctRoots({ roots: stored.extraRoots }).filter((entry) => entry !== canonical) }));
      return read({});
    },
    rememberCreated({ siteDir }, _optional = {}) {
      update((stored) => ({ ...stored, creationRoots: distinctRoots({ roots: [...stored.creationRoots, path.dirname(siteDir)] }) }));
    },
  };
}

/** Import old profile roots once, then every writer uses the same app-data config as Web/CLI.
 * Discovery changes never relocate a site or database. Missing volumes retain their paths.
 * @complexity O(n) roots and legacy created rows per read, one atomic settings mutation per action.
 */
function sharedSiteFolders({ workspace, filePath, createdSiteDirs, quarantine }: {
  workspace: SitesWorkspace; filePath: string; createdSiteDirs: () => string[]; quarantine: typeof quarantineUnreadableFile;
}): SiteFoldersPort {
  const read = (): SiteFolders => {
    const config = workspace.config({});
    return { roots: workspace.roots({}), extraRoots: config.extraRoots.filter((root) => root !== config.sitesHome && !config.defaultRoots.includes(root)), home: config.sitesHome,
      databases: config.databases, warning: config.warning, configPath: config.configPath, overrides: config.overrides };
  };
  const registry = workspace.registry({});
  const importLegacyRoots = () => {
    if (registry.hasMigration({ migration: "desktop-roots-config-v1" })) return;
    const { stored, damaged } = readStoredFolders({ filePath });
    if (damaged) {
      withFileLock(filePath, () => {
        if (readStoredFolders({ filePath }).damaged && !quarantine(filePath, {
          label: "sites folders settings", consequence: "Using shared settings; the damaged legacy bytes are preserved.",
        })) throw new Error("Could not preserve legacy settings.");
      });
    }
    const config = workspace.config({});
    if (!config.overrides.siteRoots) {
      const inherited = [...stored.extraRoots, ...stored.creationRoots, ...createdSiteDirs().map((dir) => path.dirname(dir))];
      if (inherited.length) workspace.updateRoots({ add: inherited });
      registry.merge({ entries: [], migration: "desktop-roots-config-v1" });
    }
  };
  try { importLegacyRoots(); }
  catch { console.warn("tovu desktop: legacy sites folder import could not complete; using shared settings and retrying next boot."); }
  return { read,
    add({ root }, _options = {}) {
      const policy = { homeDir: workspace.homeDir, sitesHome: workspace.home({}) };
      assertSpecificSiteRoot({ root }, policy);
      assertSpecificSiteRoot({ root: fs.realpathSync(root) }, policy);
      if (!fs.statSync(root).isDirectory()) throw new Error(`Sites folder is not a directory: ${root}`);
      workspace.updateRoots({ add: [root] });
      return read();
    },
    remove({ root }, _options = {}) {
      workspace.updateRoots({ remove: distinctRoots({ roots: [root] }) });
      return read();
    },
    rememberCreated({ siteDir }, _options = {}) {
      const parent = path.dirname(siteDir);
      if (workspace.roots({}).includes(parent)) return;
      workspace.updateRoots({ add: [parent] });
    },
  };
}
