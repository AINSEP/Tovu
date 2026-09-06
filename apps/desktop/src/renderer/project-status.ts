import type { ProjectLifecycleStatus } from '../contracts/project.js';

/**
 * Operator-facing label for each lifecycle status. Shared between `ProjectStartPanel` (App.tsx)
 * and the project grid's cards (ProjectGrid.tsx) — one wording lives here so the two surfaces
 * cannot drift apart.
 */
export const STATUS_LABEL: Record<ProjectLifecycleStatus, string> = {
  provisioning: 'Provisioning',
  starting: 'Starting',
  running: 'Running',
  stopping: 'Stopping',
  stopped: 'Stopped',
  failed: 'Failed',
  blocked: 'Provider support required',
};
