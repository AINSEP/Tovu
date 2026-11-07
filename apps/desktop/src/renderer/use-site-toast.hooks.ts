/**
 * @file The "new site" toast: one at a time, and it outlives the page that made the site, because
 * every path that makes one leaves that page. Kept out of `App`, which is at its complexity ceiling.
 */
import { useCallback, useEffect, useState } from 'react';

import type { CreatedSiteRecord, ImportedSiteRecord, SiteRecord } from '../contracts/project.js';

/** `note` is one short line; `items` is the full list behind it, shown on request. */
export interface SiteToast { message: string; note?: string; items?: string[] }

const AUTO_HIDE_MS = 5000;
/** Long enough to read what was kept off or left out. */
const AUTO_HIDE_WITH_NOTE_MS = 12000;

const createdToast = ({ displayName }: Pick<SiteRecord, 'displayName'>): SiteToast => ({ message: `New website created: ${displayName}` });

/**
 * @param required.lastCreated Create website's latest result (a live-address import makes its site
 *   the same way), so those two need no call here.
 * @returns the toast to show, `dismiss`, and the announcers for the two paths that do not create
 *   through `handleCreate`.
 * @complexity O(1) per toast: one state value and one timer.
 */
export function useSiteToast(
  { lastCreated }: { lastCreated: CreatedSiteRecord | null },
  { autoHideMs = AUTO_HIDE_MS }: { autoHideMs?: number } = {},
) {
  const [toast, setToast] = useState<SiteToast | null>(null);
  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => { if (lastCreated) setToast(createdToast(lastCreated)); }, [lastCreated]);
  useEffect(() => {
    if (toast === null) return undefined;
    const timer = setTimeout(() => setToast(null), (toast.note || toast.items) ? Math.max(autoHideMs, AUTO_HIDE_WITH_NOTE_MS) : autoHideMs);
    return () => clearTimeout(timer);
  }, [toast, autoHideMs]);

  const announceImported = useCallback((site: ImportedSiteRecord) => {
    const count = site.warnings.length;
    // Each notice stays whole in `items`; the toast itself only counts them.
    setToast({ ...createdToast(site), ...(count > 0
      ? { note: `${count} ${count === 1 ? 'item was' : 'items were'} kept off or set aside.`, items: site.warnings } : {}) });
  }, []);
  /** A folder is added rather than made, and one already on the list has its own notice. */
  const announceAdded = useCallback((site: SiteRecord & { alreadyTracked?: boolean }) => {
    if (!site.alreadyTracked) setToast({ message: `Website added: ${site.displayName}` });
  }, []);

  return { toast, dismiss, announceImported, announceAdded, showToast: setToast };
}
