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
  const running = status === 'running' && validPort;
  const portLabel = running ? String(port) : '';
  const label = STATUS_LABEL[status === 'running' && !running ? 'stopped' : status];
  return {
    running,
    portLabel,
    origin: running ? `http://127.0.0.1:${portLabel}` : '',
    statusDescription: running ? `${label} on port ${portLabel}.` : `${label}.`,
  };
}
