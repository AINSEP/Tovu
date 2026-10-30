/** Version loading for the sites home brand; no package metadata enters the renderer bundle. */
import { useEffect, useState } from 'react';
import type { RunnerAppVersionBridge } from '../contracts/app-version.js';
import { runnerInventoryBridge } from './runner-api.js';

/** No guessed version while pending/unavailable; IPC failures retain their actual message. */
export interface AppVersionState {
  version: string | null;
  error: string | null;
}

/**
 * Read the version once per bridge, ignoring responses after cleanup. An older preload without
 * the new method keeps the brand usable until the preload is rebuilt.
 * @param _requiredArgs No caller-supplied version; main is the source of truth.
 * @param options Optional bridge port for tests; defaults to the sites home preload.
 * @returns Version and error state; failures are contained rather than thrown from React.
 * @complexity O(1) time and space, with one IPC request per bridge.
 */
export function useAppVersion(
  _requiredArgs: Record<string, never>,
  { bridge = runnerInventoryBridge() }: { bridge?: Partial<RunnerAppVersionBridge> } = {},
): AppVersionState {
  const [state, setState] = useState<AppVersionState>({ version: null, error: null });

  useEffect(() => {
    setState({ version: null, error: null });
    const getVersion = bridge?.getAppVersion;
    if (!getVersion) return undefined;
    let live = true;
    const load = async (): Promise<void> => {
      try {
        const version = await getVersion();
        if (live) setState({ version, error: null });
      } catch (error) {
        if (live) setState({ version: null, error: error instanceof Error ? error.message : String(error) });
      }
    };
    void load();
    return () => { live = false; };
  }, [bridge]);

  return state;
}
