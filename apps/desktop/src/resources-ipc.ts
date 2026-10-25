/** Read-only, pull-only resource bridge; the existing project IPC remains the only Stop owner. */
import { RUNNER_RESOURCES_GET_CHANNEL, type ResourcesRequest, type ResourcesSnapshot } from './contracts/resources.ts';

interface ResourcesEvent { senderFrame: { url: string; parent: unknown } | null }

/** Validate before sampling; native errors and renderer input never enter messages or logs. */
function requestInput({ input }: { input: unknown }, _options = {}): ResourcesRequest {
  if (!input || typeof input !== 'object' || !('panelOpen' in input) || typeof input.panelOpen !== 'boolean') {
    throw new Error('Invalid resource monitor request.');
  }
  return { panelOpen: input.panelOpen };
}

/**
 * Register once before the sites home renderer opens. Only its exact frame URL may read resources.
 * @param required IPC registration, trusted sites-home URL predicate and monitor get port.
 * @returns Nothing; registers one fixed channel. Invalid/untrusted calls reject before sampling.
 * @complexity O(1) boundary work; sampling is delegated to the monitor.
 */
export function registerResourcesIpc({ ipcMain, allowed, monitor }: {
  ipcMain: { handle: (channel: string, listener: (event: ResourcesEvent, input: unknown) => Promise<ResourcesSnapshot>) => void };
  allowed: (url: string) => boolean;
  monitor: { get: (input: ResourcesRequest) => Promise<ResourcesSnapshot> };
}, _options = {}): void {
  ipcMain.handle(RUNNER_RESOURCES_GET_CHANNEL, (event, input) => {
    // Main frame only: a subframe can share the file URL but is not the sites home document.
    if (!event.senderFrame || event.senderFrame.parent !== null || !allowed(event.senderFrame.url)) throw new Error('Resource monitor is only available in the sites home window.');
    return monitor.get(requestInput({ input }));
  });
}
