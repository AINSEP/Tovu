/** Settings › Check for updates…: main runs the check and shows every notice; this only waits. */
import { createUpdateCheck, type UpdateCheckBridge, type UpdateCheckState } from '@jini-ai/desktop-host/app-version';
import { useUpdateCheck as useCheckRow } from '@jini-ai/ui/app-version';
import { runnerInventoryBridge } from './runner-api.js';

/** Main reports check failures itself; this is only a broken IPC channel. Module-level, so stable. */
function reportBrokenChannel({ message }: { readonly message: string }, _optional = {}): void {
  console.error(`[tovu-desktop] check for updates: ${message}`);
}

/**
 * One check at a time from this window; `onDone` closes the menu once main has answered.
 * The row reads "Checking…" until main has shown its first notice; `available` is false with a
 * stale preload so the menu leaves the row out rather than offer a dead one.
 * @complexity O(1), with one IPC request per click.
 */
export function useUpdateCheck(
  { onDone }: { onDone: () => void },
  { bridge = runnerInventoryBridge() }: { bridge?: UpdateCheckBridge } = {},
): UpdateCheckState & { checkForUpdates: () => Promise<void> } {
  return useCheckRow({ bridge, onDone, report: reportBrokenChannel, createCheck: createUpdateCheck });
}
