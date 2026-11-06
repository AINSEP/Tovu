/**
 * @file The Import page's "live website address" source: the typed address, the busy flag, and a
 * failure with the details to copy. The folder source reuses `useAddSite` (it already is "point at
 * a folder"); this hook adds only what the address needs.
 *
 * A live website is imported by the site's own assistant plugin, which works inside a site. So the
 * address makes a NEW site first (the same call as Create website) and the page then opens that
 * site's tab on its Import tab with the address typed in. Nothing else is opened or started.
 * An archive (share link or .tovu.zip) is not offered here: its importer needs a running site
 * server to call, and this app has no site-less way to run it.
 */
import { useCallback, useState } from 'react';

import type { SiteRecord } from '../contracts/project.js';
import { copyableDetails } from './import-error-details.js';
import { siteNameFromAddress, websiteAddress, type SiteAdminPage } from './import-site-entry.js';
import { humanSiteError } from './site-shell-policy.js';

export interface ImportFailure { message: string; details: string }

const CREATE_FAILED = "Couldn't create a website for that address.";
/** A folder path in the message: the person gets the plain sentence, the path stays in the details. */
const HAS_PATH = /(?:^|[\s'"(])(?:\/[\w.~][^\s]*|[A-Za-z]:\\)/;

const BAD_ADDRESS: ImportFailure = {
  message: 'Type a full website address, like https://example.com.',
  details: '',
};

/**
 * @param required.createSite makes the site (`useProjectMutations().handleCreate`); resolves the new record.
 * @param required.openSite opens the new site's tab on the given admin page.
 * @returns the address field state and `importLive`, which never rejects: a failure becomes `failure`.
 * @complexity O(1) per call, plus one site creation.
 */
export function useImportWebsite(
  { createSite, openSite }: {
    createSite: (input: { displayName: string }) => Promise<SiteRecord | undefined>;
    openSite: (input: { id: string; adminPage: SiteAdminPage }) => void;
  },
  _optional: Record<string, never> = {},
): {
  address: string;
  setAddress: (address: string) => void;
  importing: boolean;
  failure: ImportFailure | null;
  importLive: () => Promise<void>;
  clearFailure: () => void;
} {
  const [address, setAddressState] = useState('');
  const [importing, setImporting] = useState(false);
  const [failure, setFailure] = useState<ImportFailure | null>(null);

  const setAddress = useCallback((next: string) => { setAddressState(next); setFailure(null); }, []);
  const clearFailure = useCallback(() => setFailure(null), []);

  const importLive = useCallback(async () => {
    const liveAddress = websiteAddress({ text: address });
    if (liveAddress === null) { setFailure(BAD_ADDRESS); return; }
    setImporting(true);
    setFailure(null);
    try {
      const created = await createSite({ displayName: siteNameFromAddress({ address: liveAddress }) });
      if (created === undefined) return;
      setAddressState('');
      openSite({ id: created.id, adminPage: { page: 'import', liveAddress } });
    } catch (error) {
      const message = humanSiteError({ error, fallback: CREATE_FAILED });
      setFailure({ message: HAS_PATH.test(message) ? CREATE_FAILED : message, details: copyableDetails({ error }) });
    } finally {
      setImporting(false);
    }
  }, [address, createSite, openSite]);

  return { address, setAddress, importing, failure, importLive, clearFailure };
}

/**
 * The one error the page shows: the address source's own, else the folder source's.
 * @complexity O(1).
 */
export function importPageError(
  { failure, addError, addDetails }: { failure: ImportFailure | null; addError: string | null; addDetails: string | null },
  _optional: Record<string, never> = {},
): ImportFailure | null {
  if (failure !== null) return failure;
  return addError === null ? null : { message: addError, details: addDetails ?? '' };
}

/**
 * "Copy details": writes the text to the clipboard and reports it for two seconds. A clipboard that
 * refuses (no permission, no bridge) leaves the button as it was rather than claiming success.
 * @complexity O(1).
 */
export function useCopyDetails(
  _required: Record<string, never> = {},
  { getClipboard = () => (typeof navigator === 'undefined' ? undefined : navigator.clipboard) }: {
    getClipboard?: () => Pick<Clipboard, 'writeText'> | undefined;
  } = {},
): { copied: boolean; copy: (details: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (details: string) => {
    try {
      await getClipboard()?.writeText(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* Nothing to report: the details stay on screen to select by hand. */ }
  }, [getClipboard]);
  return { copied, copy };
}
