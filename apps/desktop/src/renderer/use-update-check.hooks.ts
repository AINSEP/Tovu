/** Settings › Check for updates…: main runs the check and shows every notice; this only waits. */
import { useState } from 'react';
import type { RunnerUpdateCheckBridge } from '../contracts/app-version.js';
import { runnerInventoryBridge } from './runner-api.js';

export interface UpdateCheckState {
  /** False with a stale preload: the menu leaves the row out rather than offer a dead one. */
  available: boolean;
  /** The row reads "Checking…" until main has shown its first notice. */
  checking: boolean;
  checkForUpdates: () => Promise<void>;
}

/**
 * One check at a time from this window; `onDone` closes the menu once main has answered.
 * @complexity O(1), with one IPC request per click.
 */
export function useUpdateCheck(
  { onDone }: { onDone: () => void },
  { bridge = runnerInventoryBridge() }: { bridge?: Partial<RunnerUpdateCheckBridge> } = {},
): UpdateCheckState {
  const [checking, setChecking] = useState(false);
  const check = bridge?.checkForUpdates;
  return {
    available: check !== undefined,
    checking,
    async checkForUpdates() {
      if (!check || checking) return;
      setChecking(true);
      try {
        await check();
      } catch (error) {
        // Main reports check failures itself; this is only a broken IPC channel.
        console.error(`[tovu-desktop] check for updates: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setChecking(false);
        onDone();
      }
    },
  };
}
