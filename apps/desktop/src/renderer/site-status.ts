import type { SiteLifecycleStatus } from '../contracts/project.js';

/**
 * Operator-facing label for each lifecycle status. Shared between `SiteStartPanel` (App.tsx)
 * and the site grid's cards (SiteGrid.tsx) — one wording lives here so the two surfaces
 * cannot drift apart.
 */
export const STATUS_LABEL: Record<SiteLifecycleStatus, string> = {
  provisioning: 'Provisioning',
  starting: 'Starting',
  running: 'Running',
  stopping: 'Stopping',
  stopped: 'Stopped',
  failed: 'Failed',
  blocked: 'Provider support required',
};
