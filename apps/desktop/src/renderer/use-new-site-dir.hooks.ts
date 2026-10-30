/** New-site destination preview; main owns home resolution and collision suffixes. */
import { useEffect, useState } from 'react';
import { runnerInventoryBridge, type RunnerInventoryBridge } from './runner-api.js';
import { humanSiteError } from './site-shell-policy.js';

/** Show the latest name's planned destination, ignoring replies after a name change/unmount.
 * Planning is read-only; Create checks the destination again when submitted.
 * @complexity O(n) display formatting for n path characters; one IPC call per name change.
 */
export function useNewSiteDir({ name }: { name: string }, {
  getBridge = runnerInventoryBridge,
}: { getBridge?: () => Pick<RunnerInventoryBridge, 'planNewDir'> | undefined } = {}): string {
  const [preview, setPreview] = useState({ name: '', hint: 'Checking website destination…' });
  useEffect(() => {
    let active = true;
    const plan = getBridge()?.planNewDir;
    if (!plan) {
      setPreview({ name, hint: 'Website destination is unavailable in this desktop version.' });
      return undefined;
    }
    void plan({ name }).then(({ path, homeDir }) => {
      const separator = homeDir.includes('\\') ? '\\' : '/';
      const display = path.startsWith(homeDir + separator) ? '~' + path.slice(homeDir.length) : path;
      if (active) setPreview({ name, hint: `Creates ${display}` });
    }).catch((error: unknown) => {
      if (active) setPreview({ name, hint: humanSiteError({ error, fallback: 'Could not plan the website destination. Check Sites settings.' }) });
    });
    return () => { active = false; };
  }, [name, getBridge]);
  return preview.name === name ? preview.hint : 'Checking website destination…';
}
