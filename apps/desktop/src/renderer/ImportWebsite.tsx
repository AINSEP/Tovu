/**
 * The Import page: one place to bring in a website that already exists, in the same shape as
 * Create website (intro, one card of sections, actions row). Layout and markup only; the state is in
 * `use-import-website.hooks.ts` and `use-add-site.hooks.ts`. Explanations are tooltips, not text.
 * It is a temporary tab beside All (owner, 2026-11-10), so the header carries its one title and
 * the tab's close button is the way back; the page has no back link of its own. Same drop zone and
 * order (files, then the web address) as the web admin's Import tab.
 */
import { useEffect } from 'react';
import { FileDropzone, useClassifiedPathDrop, useWiredCopyToClipboard } from '@jini-ai/ui';

import type { ImportArchiveInput } from '../contracts/project.js';
import { InfoTip } from './CreateWebsiteOnboarding.js';
import { classifyImportDrop, classifyImportFiles } from './import-drop.js';
import { runnerInventoryBridge } from './runner-api.js';
import { importPageError, type ArchiveRun, type ImportFailure } from './use-import-website.hooks.js';

export interface ImportWebsiteProps {
  /** The page is on screen. Decided here, not by `App`, which is at its complexity ceiling. */
  shown: boolean;
  /** Closes the Import tab. */
  onBack: () => void;
  /** Folder source ("a folder on this computer that already holds a Tovu site"). */
  adding: boolean;
  onChooseFolder: () => Promise<void>;
  onDropFolder: (folder: string) => Promise<void>;
  /** Archive source (a dropped or chosen .tovu.zip; a share link arrives through `onImportAddress`). */
  onImportArchive: (source: ImportArchiveInput) => Promise<void>;
  /** Shows why a drop can't be imported. */
  onRefuse: (message: string) => void;
  /** Address source ("a share link or live website"). */
  address: string;
  onAddressChange: (address: string) => void;
  importing: boolean;
  /** An archive import can be stopped; making a site for a live address cannot. */
  archiveRun: ArchiveRun;
  onCancelImport: () => void;
  /** Called when the page opens; the function it returns when the page closes. */
  onPageOpen: () => () => void;
  onImportAddress: () => Promise<void>;
  failure: ImportFailure | null;
  addError: string | null;
  addDetails: string | null;
}

function ImportError({ error,
  useCopyDetailsHook = useWiredCopyToClipboard }: { error: ImportFailure;
  useCopyDetailsHook?: typeof useWiredCopyToClipboard; }) {
  const { copied, copy } = useCopyDetailsHook(2000);
  return (
    <footer>
      <p className="onboarding__error" role="alert">{error.message}</p>
      {error.details !== '' && (
        <button type="button" className="button button--quiet" onClick={() => void copy(error.details)}>
          {copied ? 'Copied' : 'Copy details'}
        </button>
      )}
    </footer>
  );
}

/** The page's Cancel: leaves, stops a running archive import, or waits for what cannot be stopped. */
function CancelButton({ importing, archiveRun, onBack, onCancelImport }: Pick<ImportWebsiteProps, 'importing' | 'archiveRun' | 'onBack' | 'onCancelImport'>) {
  const stoppable = archiveRun === 'running';
  return (
    <button type="button" className="button button--quiet" onClick={stoppable ? onCancelImport : onBack} disabled={importing && !stoppable}>
      {archiveRun === 'cancelling' ? 'Cancelling…' : 'Cancel'}
    </button>
  );
}

/** The preload's real path for a dropped or picked file; `''` when the bridge has none. */
const getPathForFile = (file: File) => runnerInventoryBridge()?.getPathForFile?.(file) ?? '';
/** This page's drop classification (copy and file types are the import page's), handed to Jini's drop hook. */
const classifyDrop = ({ dataTransfer }: { dataTransfer: DataTransfer }) => classifyImportDrop({ dataTransfer, getPathForFile });
const classifyFiles = ({ files }: { files: File[] }) => classifyImportFiles({ files, getPathForFile });

export function ImportWebsite({ shown, ...page }: ImportWebsiteProps) {
  return shown ? <ImportPage {...page} /> : null;
}

/** Its own component so the drag state is dropped with the page. */
function ImportPage({
  onBack, adding, onChooseFolder, onDropFolder, onImportArchive, onRefuse, address, onAddressChange, importing, archiveRun, onCancelImport, onPageOpen, onImportAddress, failure, addError, addDetails, useImportDropHook = useClassifiedPathDrop,
}: (Omit<ImportWebsiteProps, 'shown'>) & { useImportDropHook?: typeof useClassifiedPathDrop; }) {
  useEffect(onPageOpen, [onPageOpen]);
  const error = importPageError({ failure, addError, addDetails });
  const busy = adding || importing;
  const { dragging, dropProps, onPicked } = useImportDropHook({ busy, onRefused: onRefuse, classifyDrop, classifyFiles,
    onFolder: ({ path: folder }, _options = {}) => void onDropFolder(folder),
    onArchive: ({ path: file }, _options = {}) => void onImportArchive({ file }),
  });
  return (
    <section className="onboarding" aria-label="Import a website" {...dropProps}>
      <div className="onboarding__intro onboarding__heading">
        <p className="import-subtitle">From a folder, a .tovu.zip, or a web address.</p>
        <InfoTip text="It is added to Websites and opens in its own tab. The original is not changed." />
      </div>

      <div className="onboarding__form">
        <section className="onboarding-card">
          <div className="onboarding-section">
            <div className="onboarding-card__head onboarding__heading">
              <h3>From your computer</h3>
              <InfoTip text="A folder that holds a Tovu site stays where it is. A .tovu.zip file becomes a new website. The original is not changed." />
            </div>
            {/* The buttons sit in the zone's dashed box beside the shared zone rather than inside its
                own element: that element is itself a button, and a button cannot hold another. */}
            <div className={`import-zone ${dragging ? 'is-dragging' : ''}`}>
              <FileDropzone accept=".zip,application/zip" prompt="Drop a folder or .tovu.zip here" onFiles={(files) => onPicked({ files })} />
              <div className="import-actions">
                <button type="button" className="button button--contrast" onClick={() => void onChooseFolder()} disabled={busy}>
                  {adding ? 'Adding…' : 'Choose folder…'}
                </button>
                <button type="button" className="button button--quiet" onClick={() => void onImportArchive({ pick: true })} disabled={busy}>
                  Choose file…
                </button>
              </div>
            </div>
          </div>

          <form
            className="onboarding-section"
            onSubmit={(event) => { event.preventDefault(); void onImportAddress(); }}
          >
            <div className="onboarding-card__head onboarding__heading">
              <h3>From the web</h3>
              <InfoTip text="A share link ending in .tovu.zip becomes a new website here. Any other address makes a new website and opens it with the assistant ready: press Import with the assistant there to start." />
            </div>
            <label className="create-field">
              <span className="create-field__label">Website address</span>
              <input
                value={address}
                inputMode="url"
                autoComplete="off"
                disabled={busy}
                onChange={(event) => onAddressChange(event.target.value)}
                placeholder="https://example.com"
              />
            </label>
            <div className="import-actions">
              <button type="submit" className="button button--primary" disabled={busy || address.trim() === ''}>
                {importing ? 'Importing…' : 'Import as a new site'}
              </button>
            </div>
          </form>

          <div className="onboarding__actions">
            {error !== null && <ImportError error={error} />}
            <div>
              <CancelButton importing={importing} archiveRun={archiveRun} onBack={onBack} onCancelImport={onCancelImport} />
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
