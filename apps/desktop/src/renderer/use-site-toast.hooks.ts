/**
 * @file The "new site" toast's wording and classes, bound into Jini's `useSiteToast` / `SiteToast`
 * (which own the one-at-a-time state, the timers and the markup). Kept out of `App`, which is at its
 * complexity ceiling.
 */
import { useSiteToast as useJiniSiteToast, type SiteToastClassNames, type SiteToastCopy, type SiteToastLabels } from '@jini-ai/ui/app-shell';

import type { CreatedSiteRecord } from '../contracts/project.js';

const SITE_TOAST_COPY: SiteToastCopy = {
  created: ({ displayName }) => `New website created: ${displayName}`,
  added: ({ displayName }) => `Website added: ${displayName}`,
  setAside: ({ count }) => `${count} ${count === 1 ? 'item was' : 'items were'} kept off or set aside.`,
};

export const SITE_TOAST_LABELS: SiteToastLabels = { showList: 'Show list', dismiss: 'Dismiss' };

/** `app.css` styles the toast under these; the Jini `jini-site-toast*` classes ride alongside. */
export const SITE_TOAST_CLASSES: SiteToastClassNames = {
  root: 'site-toast', message: 'site-toast__message', note: 'site-toast__note', items: 'site-toast__items', dismiss: 'button button--quiet',
};

/**
 * @param required.lastCreated Create website's latest result (a live-address import makes its site
 *   the same way), so those two need no call here.
 * @returns the toast to show, `dismiss`, and the announcers for the two paths that do not create
 *   through `handleCreate`.
 */
export function useSiteToast(
  { lastCreated }: { lastCreated: CreatedSiteRecord | null }, options: { autoHideMs?: number } = {},
) {
  return useJiniSiteToast({ lastCreated, copy: SITE_TOAST_COPY }, options);
}
