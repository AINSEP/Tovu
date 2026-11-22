/** Version loading for the sites home brand; no package metadata enters the renderer bundle. */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createAppVersionLoader, type AppVersionState } from '@jini-ai/desktop-host/app-version';
import type { RunnerAppVersionBridge } from '../contracts/app-version.js';
import { runnerInventoryBridge } from './runner-api.js';

/**
 * No guessed version while pending/unavailable; IPC failures retain their actual message.
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
  const loader = useMemo(() => createAppVersionLoader({ bridge }), [bridge]);
  useEffect(() => loader.start(), [loader]);
  return useSyncExternalStore(loader.subscribe, loader.getSnapshot);
}
