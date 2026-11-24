/** Host binding of Jini's resource polling to this desktop's preload bridge, document and timers. */
import { useResourceReadings, type ResourceReadingsPorts } from '@jini-ai/ui/resource-monitor';
import { runnerInventoryBridge } from './runner-api.js';
import type { ResourcesRequest, ResourcesSnapshot } from '../contracts/resources.js';

/** Effects at the renderer boundary; fakes need neither Electron nor real timers. */
export type ResourcesPorts = ResourceReadingsPorts<ResourcesSnapshot>;

const browserPorts: ResourcesPorts = {
  getBridge: runnerInventoryBridge,
  get document() { return document; },
  setTimer: ({ run, delay }) => window.setTimeout(run, delay),
  clearTimer: ({ id }) => window.clearTimeout(id),
};

/**
 * Read one shared snapshot from main while this window is visible (see `useResourceReadings`).
 * @example const snapshot = useResources({ panelOpen });
 */
export function useResources({ panelOpen }: ResourcesRequest, { ports = browserPorts, refreshKey }: { ports?: ResourcesPorts; refreshKey?: string } = {}) {
  return useResourceReadings({ panelOpen, ports }, { refreshKey });
}
