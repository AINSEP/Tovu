/** Discovery settings state; all filesystem/picker effects stay behind the preload port. */
import { useCallback, useEffect, useState } from 'react';
import { useAsyncAction } from '@jini-ai/ui/panel-kit';
import { humanSiteError } from './site-shell-policy.js';
import type { SiteFolders } from '../contracts/project.js';
import { runnerInventoryBridge } from './runner-api.js';
import type { RunnerInventoryBridge } from './runner-api.js';

type FoldersBridge = Pick<RunnerInventoryBridge, 'listSiteFolders' | 'addSiteFolder' | 'removeSiteFolder' | 'setSitesHome' | 'saveSiteSettings' | 'rescanSites'>;

/** Presentation contract for the Websites screen's sites-folders setting. */
export interface SiteFoldersSettings {
  folders: SiteFolders;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  addFolder: () => Promise<void>;
  setHome: () => Promise<void>;
  saveSettings: (patch: import("../contracts/project.js").SiteSettingsPatch) => Promise<void>;
  removeFolder: (required: { root: string }, options?: {}) => Promise<void>;
}

/** Load settings once per mount and apply mutation results immediately. Null picker results leave
 * settings intact; transport prefixes are removed from real failures. Add rescans discovery without starting sites.
 * @param options.getBridge Injectable preload reader for tests and hosts with older preloads.
 * @returns Settings plus busy/error state and native-picker/removal actions.
 * @complexity O(n) stored roots in state; Add uses picker + scan, other actions one IPC operation.
 */
export function useSiteFolders(_required = {}, { getBridge = runnerInventoryBridge, useAction = useAsyncAction }: {
  getBridge?: () => FoldersBridge | undefined;
  useAction?: typeof useAsyncAction;
} = {}): SiteFoldersSettings {
  const [folders, setFolders] = useState<SiteFolders>({ roots: [], extraRoots: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { saving, error: actionError, setError, run } = useAction();
  useEffect(() => {
    let active = true;
    const bridge = getBridge();
    if (!bridge?.listSiteFolders) {
      setLoadError('Sites folders settings are unavailable in this desktop version.');
      setLoading(false);
      return undefined;
    }
    void bridge.listSiteFolders().then((next) => {
      if (active) setFolders(next);
    }).catch((failure: unknown) => {
      if (active) setLoadError(humanSiteError({ error: failure, fallback: 'Could not update sites folders. Try again.' }));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [getBridge]);

  // Jini owns the action lifecycle; Tovu only applies this setting's nullable picker result.
  const change = useCallback((operation: () => Promise<SiteFolders | null>) => run({
    action: async () => {
      const next = await operation();
      if (next !== null) setFolders(next);
      setLoadError(null);
    },
    describeError: (failure) => humanSiteError({ error: failure, fallback: 'Could not update sites folders. Try again.' }),
  }), [run]);

  const addFolder = useCallback(() => change(async () => {
    const bridge = getBridge();
    if (!bridge?.addSiteFolder) throw new Error('Sites folders settings are unavailable in this desktop version.');
    const next = await bridge.addSiteFolder();
    if (next !== null) {
      // Admission validated before saving. A later rescan may still fail if the disk changes;
      // retain the saved root so the operator can retry or remove it.
      setFolders(next);
      await bridge.rescanSites();
    }
    return next;
  }), [change, getBridge]);

  const removeFolder = useCallback(({ root }: { root: string }, _options = {}) => change(async () => {
    const bridge = getBridge();
    if (!bridge?.removeSiteFolder) throw new Error('Sites folders settings are unavailable in this desktop version.');
    return bridge.removeSiteFolder({ root });
  }), [change, getBridge]);

  const setHome = useCallback(() => change(async () => {
    const bridge = getBridge();
    if (!bridge?.setSitesHome) throw new Error('Sites home settings are unavailable in this desktop version.');
    return bridge.setSitesHome();
  }), [change, getBridge]);

  const saveSettings = useCallback((patch: import("../contracts/project.js").SiteSettingsPatch) => change(async () => {
    const bridge = getBridge();
    if (!bridge?.saveSiteSettings) throw new Error('Sites settings are unavailable in this desktop version.');
    return bridge.saveSiteSettings(patch);
  }), [change, getBridge]);

  return { clearError: () => { setError(null); setLoadError(null); }, saveSettings, setHome, folders, busy: loading || saving, error: actionError ?? loadError, addFolder, removeFolder };
}
