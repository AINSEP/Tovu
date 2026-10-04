import type { SiteLifecycleStatus } from '../contracts/project.js';
import { STATUS_LABEL } from './site-status.js';

/**
 * The site's address and lifecycle copy, shared by cards, stopped panels and workspace URLs.
 * Stopped/new records use port 0 because each start allocates a new port; showing that sentinel
 * (or a stale port after stopping) would promise an address with no server listening there.
 *
 * @param input.port the registry port; absent, zero and invalid ports have no address.
 * @param input.status the registry/rendered status, or running for a port-only URL request.
 * @returns blank address fields when not running, plus status copy without a fictitious port.
 * Pure: no effects or errors.
 * @complexity O(1) time and space.
 */
export function sitePortPresentation(
  input: { port: number | null | undefined; status?: SiteLifecycleStatus },
  _optional: Record<string, never> = {},
) {
  const { port, status = 'running' } = input;
  const validPort = typeof port === 'number' && Number.isInteger(port) && port > 0 && port <= 65535;
  if (status !== 'running' || !validPort) {
    const label = STATUS_LABEL[status === 'running' ? 'stopped' : status];
    return { running: false, portLabel: '', origin: '', statusDescription: `${label}.` };
  }
  const portLabel = String(port);
  return {
    running: true,
    portLabel,
    origin: `http://127.0.0.1:${portLabel}`,
    statusDescription: `${STATUS_LABEL.running} on port ${portLabel}.`,
  };
}
