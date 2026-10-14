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

/**
 * A card's status line copy: its hover title, and the detail line under it (or `null`).
 *
 * The address and the app that runs the site live in the title, never in the card's main copy —
 * owner 2026-10-13: "it says running in web port 3000. That's unnecessary." A running card reads
 * "● Running" and nothing more; pointing at the status still answers "where, and in which app".
 * A stopped site's last exit ("the server exited (code 1)") stays a visible line: it is the one
 * detail that tells an operator something is wrong.
 *
 * @param required.project the record's `runningApp` and main's `statusDetail`.
 * @param required.connection {@link sitePortPresentation}'s answer for the rendered status.
 * @returns `title` for the status element, `detail` for the line under it.
 * Pure: no effects or errors.
 * @complexity O(1).
 */
export function siteCardStatus(
  { project, connection }: {
    project: { runningApp?: string; statusDetail?: string | null };
    connection: Pick<ReturnType<typeof sitePortPresentation>, 'origin' | 'statusDescription'>;
  },
  _optional: Record<string, never> = {},
) {
  const where = connection.origin ? ` at ${connection.origin.replace('127.0.0.1', 'localhost')}` : '';
  const app = project.runningApp ? ` in ${project.runningApp}` : '';
  const title = connection.origin ? `${STATUS_LABEL.running}${app}${where}` : connection.statusDescription;
  return { title, detail: project.runningApp ? null : (project.statusDetail ?? null) };
}
