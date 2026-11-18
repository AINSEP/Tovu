/** Settings › Check for updates…: main runs the check and shows every notice; this only waits. */
import { useMemo, useRef, useSyncExternalStore } from 'react';
import { createUpdateCheck, type UpdateCheckState } from '@jini-ai/desktop-host/app-version';
import type { RunnerUpdateCheckBridge } from '../contracts/app-version.js';
import { runnerInventoryBridge } from './runner-api.js';

/**
 * One check at a time from this window; `onDone` closes the menu once main has answered.
 * The row reads "Checking…" until main has shown its first notice; `available` is false with a
 * stale preload so the menu leaves the row out rather than offer a dead one.
 * @complexity O(1), with one IPC request per click.
 */
export function useUpdateCheck(
  { onDone }: { onDone: () => void },
  { bridge = runnerInventoryBridge() }: { bridge?: Partial<RunnerUpdateCheckBridge> } = {},
): UpdateCheckState & { checkForUpdates: () => Promise<void> } {
  // An inline `onDone` is a new function every render; the controller keeps calling the latest one.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const check = useMemo(() => createUpdateCheck({
    bridge,
    onDone: () => onDoneRef.current(),
    // Main reports check failures itself; this is only a broken IPC channel.
    report: ({ message }) => console.error(`[tovu-desktop] check for updates: ${message}`),
  }), [bridge]);
  const state = useSyncExternalStore(check.subscribe, check.getSnapshot);
  return { ...state, checkForUpdates: check.checkForUpdates };
}
