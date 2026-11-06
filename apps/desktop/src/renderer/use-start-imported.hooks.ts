/**
 * @file Starts a site right after it was imported, so the person lands on a running, signed-in
 * site instead of a "Stopped. Start site" tab. Reuses `performSiteStart` (the Start button's own
 * call, which already waits for the site to boot). A failed start keeps the site and tells the
 * person in plain words, with the redacted error to copy. Kept out of `App`, at its complexity ceiling.
 */
import { useCallback } from 'react';

import type { SiteRecord } from '../contracts/project.js';
import { copyableDetails } from './import-error-details.js';
import { runnerInventoryBridge, type BridgeLookup } from './runner-api.js';
import { performSiteStart } from './use-site-start.hooks.js';
import type { SiteToast } from './use-site-toast.hooks.js';

/** Tracked folders already on the list (or already running) are left as they were. */
type StartableSite = Pick<SiteRecord, 'id' | 'displayName' | 'status'> & { alreadyTracked?: boolean };

/**
 * @returns the toast to show if the start failed, else nothing; never rejects.
 * @complexity O(1) beyond the start's own boot wait.
 */
export async function startImportedSite(
  { site, applyRecord }: { site: StartableSite; applyRecord: (record: SiteRecord) => void },
  { getBridge = runnerInventoryBridge }: { getBridge?: BridgeLookup<'startSite'> } = {},
): Promise<SiteToast | undefined> {
  if (site.alreadyTracked || site.status === 'running') return undefined;
  const bridge = getBridge();
  // `performSiteStart` turns a rejection into a short sentence; the person's copy-able details want the real one.
  let raw: unknown;
  const result = await performSiteStart(site.id, bridge && {
    startSite: (id) => bridge.startSite(id).catch((error: unknown) => { raw = error; throw error; }),
  });
  if (result.error === undefined) { applyRecord(result.record); return undefined; }
  return {
    message: `${site.displayName} was added, but it didn't start. Open its tab and press Start site to try again.`,
    note: `Details: ${copyableDetails({ error: raw ?? result.error })}`,
  };
}

/** @param required.applyRecord puts main's refreshed record on screen; `showToast` shows a failure. */
export function useStartImported(
  { applyRecord, showToast }: { applyRecord: (record: SiteRecord) => void; showToast: (toast: SiteToast) => void },
  optional: { getBridge?: BridgeLookup<'startSite'> } = {},
): (site: StartableSite) => Promise<void> {
  return useCallback(async (site) => {
    const failed = await startImportedSite({ site, applyRecord }, optional);
    if (failed) showToast(failed);
  }, [applyRecord, showToast, optional.getBridge]);
}
