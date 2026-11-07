/**
 * @file The Import page's address and archive sources: the typed address, the busy flag, and a
 * failure with the details to copy. The folder source reuses `useAddSite` (it already is "point at
 * a folder"); this hook adds only what the other sources need.
 *
 * A live website is imported by the site's own assistant plugin, which works inside a site. So the
 * address makes a NEW site first (the same call as Create website) and the page then opens that
 * site's tab on its Import tab with the address typed in. Nothing else is opened or started.
 * An archive (share link or .tovu.zip) is finished by main with no site involved, so it just
 * resolves with the new site.
 */
import { useCallback, useRef, useState } from 'react';

import type { ImportArchiveInput, ImportedSiteRecord, SiteRecord } from '../contracts/project.js';
import { copyableDetails } from './import-error-details.js';
import { isShareLink, siteNameFromAddress, websiteAddress, type SiteAdminPage } from './import-site-entry.js';
import { runnerInventoryBridge, type BridgeLookup } from './runner-api.js';
import { humanSiteError } from './site-shell-policy.js';

export interface ImportFailure { message: string; details: string }
/** Where an archive import stands. Only a running archive import can be stopped. */
export type ArchiveRun = 'none' | 'running' | 'cancelling';

const CREATE_FAILED = "Couldn't create a website for that address.";
const ARCHIVE_FAILED = "Couldn't import that website. No website was created.";
const NO_ARCHIVE_BRIDGE: ImportFailure = { message: "This version of the app can't import that. Update Tovu and try again.", details: '' };
/** A folder path in the message: the person gets the plain sentence, the path stays in the details. */
const HAS_PATH = /(?:^|[\s'"(])(?:\/[\w.~][^\s]*|[A-Za-z]:\\)/;

const BAD_ADDRESS: ImportFailure = {
  message: 'Type a full website address, like https://example.com.',
  details: '',
};

/** The importer's check-failed sentence for a file whose contents no longer match what was exported. */
const CHANGED_FILE = /size or SHA-256 mismatch/i;
const DAMAGED_FILE = "That file looks damaged or changed since it was exported. No website was created. Export it again and import the fresh copy.";

/** A rejection as the page shows it: the importer's sentence (plain words for a changed file), or the plain one if it names a path. The importer's own text stays in the details. */
function importFailure({ error, fallback }: { error: unknown; fallback: string }): ImportFailure {
  const message = humanSiteError({ error, fallback });
  const shown = CHANGED_FILE.test(message) ? DAMAGED_FILE : message;
  return { message: HAS_PATH.test(shown) ? fallback : shown, details: copyableDetails({ error }) };
}

/**
 * @param required.createSite makes the site (`useProjectMutations().handleCreate`); resolves the new record.
 * @param required.openSite opens the new site's tab on the given admin page.
 * @param required.onFailureWhileClosed tells the person about a failure when the page is not open,
 *   since `failure` shows only on that page and opening it clears the old one.
 * @returns the address field state and `importLive`, which never rejects: a failure becomes `failure`.
 * @complexity O(1) per call, plus one site creation.
 */
export function useImportWebsite(
  { createSite, openSite, onArchiveImported, onFailureWhileClosed }: {
    createSite: (input: { displayName: string }) => Promise<SiteRecord | undefined>;
    openSite: (input: { id: string; adminPage: SiteAdminPage }) => void;
    /** A .tovu.zip or share link became this site. */
    onArchiveImported: (site: ImportedSiteRecord) => void;
    onFailureWhileClosed: (toast: { message: string; note?: string }) => void;
  },
  { getBridge = runnerInventoryBridge }: { getBridge?: BridgeLookup<'importSiteArchive' | 'cancelSiteImport'> } = {},
): {
  address: string;
  setAddress: (address: string) => void;
  importing: boolean;
  archiveRun: ArchiveRun;
  failure: ImportFailure | null;
  importLive: () => Promise<void>;
  importArchive: (source: ImportArchiveInput) => Promise<void>;
  /** Asks main to stop a running archive import. It ends with no site, or with one that had just finished. */
  cancelArchive: () => Promise<void>;
  /** Call when the page opens; the returned function when it closes. Shaped for `useEffect`. */
  pageOpened: () => () => void;
  /** Shows a message the page itself decided, such as a wrong file type dropped. */
  refuse: (message: string) => void;
  clearFailure: () => void;
} {
  const [address, setAddressState] = useState('');
  const [importing, setImporting] = useState(false);
  const [archiveRun, setArchiveRun] = useState<ArchiveRun>('none');
  const [failure, setFailure] = useState<ImportFailure | null>(null);
  // A ref, not state: the running import reads it when it fails, long after it was started.
  const pageClosed = useRef(false);

  const pageOpened = useCallback(() => {
    pageClosed.current = false;
    return () => { pageClosed.current = true; };
  }, []);
  /** A failure from a run that may have outlived the page. */
  const reportRunFailure = useCallback((failed: ImportFailure) => {
    if (!pageClosed.current) { setFailure(failed); return; }
    onFailureWhileClosed({ message: failed.message, ...(failed.details === '' ? {} : { note: failed.details }) });
  }, [onFailureWhileClosed]);

  const setAddress = useCallback((next: string) => { setAddressState(next); setFailure(null); }, []);
  const clearFailure = useCallback(() => setFailure(null), []);
  const refuse = useCallback((message: string) => setFailure({ message, details: '' }), []);

  const importArchive = useCallback(async (source: ImportArchiveInput) => {
    const bridge = getBridge();
    if (bridge?.importSiteArchive === undefined) { setFailure(NO_ARCHIVE_BRIDGE); return; }
    setImporting(true);
    setArchiveRun('running');
    setFailure(null);
    try {
      const imported = await bridge.importSiteArchive(source);
      if (imported === null) return;
      setAddressState('');
      onArchiveImported(imported);
    } catch (error) {
      reportRunFailure(importFailure({ error, fallback: ARCHIVE_FAILED }));
    } finally {
      setImporting(false);
      setArchiveRun('none');
    }
  }, [getBridge, onArchiveImported, reportRunFailure]);

  const cancelArchive = useCallback(async () => {
    const stop = getBridge()?.cancelSiteImport;
    if (stop === undefined) return;
    setArchiveRun('cancelling');
    await stop();
  }, [getBridge]);

  const importLive = useCallback(async () => {
    const liveAddress = websiteAddress({ text: address });
    if (liveAddress === null) { setFailure(BAD_ADDRESS); return; }
    if (isShareLink({ address: liveAddress })) { await importArchive({ url: liveAddress }); return; }
    setImporting(true);
    setFailure(null);
    try {
      const created = await createSite({ displayName: siteNameFromAddress({ address: liveAddress }) });
      if (created === undefined) return;
      setAddressState('');
      openSite({ id: created.id, adminPage: { page: 'import', liveAddress } });
    } catch (error) {
      reportRunFailure(importFailure({ error, fallback: CREATE_FAILED }));
    } finally {
      setImporting(false);
    }
  }, [address, createSite, openSite, importArchive, reportRunFailure]);

  return { address, setAddress, importing, archiveRun, failure, importLive, importArchive, cancelArchive, pageOpened, refuse, clearFailure };
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
