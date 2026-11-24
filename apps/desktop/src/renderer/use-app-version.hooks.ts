/** Version loading for the sites home brand; no package metadata enters the renderer bundle. */
import { createAppVersionLoader, type AppVersionBridge, type AppVersionState } from '@jini-ai/desktop-host/app-version';
import { useAppVersion as useVersionLabel } from '@jini-ai/ui/app-version';
import { runnerInventoryBridge } from './runner-api.js';

/**
 * Binds `@jini-ai/ui/app-version`'s hook to this app's preload bridge and the desktop host's loader.
 * @param _requiredArgs No caller-supplied version; main is the source of truth.
 * @param options Optional bridge port for tests; defaults to the sites home preload.
 * @returns Version and error state; failures are contained rather than thrown from React.
 * @complexity O(1) time and space, with one IPC request per bridge.
 */
export function useAppVersion(
  _requiredArgs: Record<string, never>,
  { bridge = runnerInventoryBridge() }: { bridge?: AppVersionBridge } = {},
): AppVersionState {
  return useVersionLabel({ bridge, createLoader: createAppVersionLoader });
}
