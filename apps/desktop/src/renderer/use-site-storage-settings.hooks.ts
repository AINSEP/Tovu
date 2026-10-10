import { useCallback, useEffect, useState } from 'react';
import { useSiteFolders } from './use-site-folders.hooks.js';

/** Native preload effects remain in useSiteFolders; this hook only owns settings drafts/dialog.
 * Env-controlled paths are disabled and never sent by the renderer; placement still works with overrides.
 * @complexity O(n) root strings for display; each save sends one placement enum.
 */
export function useSiteStorageSettings(_required = {}, { useFolders = useSiteFolders }: { useFolders?: typeof useSiteFolders } = {}) {
  const settings = useFolders({});
  const [open, setOpen] = useState(false);
  const [home, setHome] = useState('');
  const [roots, setRoots] = useState('');
  const [databases, setDatabases] = useState<'inSite' | 'appData'>('inSite');
  useEffect(() => {
    setHome(settings.folders.home ?? ''); setRoots(settings.folders.extraRoots.join('\n'));
    setDatabases(settings.folders.databases ?? 'inSite');
  }, [settings.folders]);
  const save = useCallback(() => settings.saveSettings({ databases }), [settings, databases]);
  return { ...settings, chooseHome: settings.setHome, open, show: () => setOpen(true), close: () => setOpen(false), home, setHome,
    roots, setRoots, databases, setDatabases, save,
    useAppData: () => settings.saveSettings({ databases: 'appData' }),
    useLocalHome: settings.setHome,
  };
}
