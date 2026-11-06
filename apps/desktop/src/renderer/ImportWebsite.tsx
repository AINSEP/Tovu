/**
 * The Import page: one place to bring in a website that already exists, in the same shape as
 * Create website (intro, one card of sections, actions row). Layout and markup only; the state is in
 * `use-import-website.hooks.ts` and `use-add-site.hooks.ts`. Explanations are tooltips, not text.
 */
import type { ImportArchiveInput } from '../contracts/project.js';
import { InfoTip } from './CreateWebsiteOnboarding.js';
import { useImportDrop } from './use-import-drop.hooks.js';
import { importPageError, useCopyDetails, type ImportFailure } from './use-import-website.hooks.js';

export interface ImportWebsiteProps {
  /** The page is on screen. Decided here, not by `App`, which is at its complexity ceiling. */
  shown: boolean;
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
  onImportAddress: () => Promise<void>;
  failure: ImportFailure | null;
  addError: string | null;
  addDetails: string | null;
}

function ImportError({ error }: { error: ImportFailure }) {
  const { copied, copy } = useCopyDetails();
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

export function ImportWebsite({ shown, ...page }: ImportWebsiteProps) {
  return shown ? <ImportPage {...page} /> : null;
}

/** Its own component so the drag state is dropped with the page. */
function ImportPage({
  onBack, adding, onChooseFolder, onDropFolder, onImportArchive, onRefuse, address, onAddressChange, importing, onImportAddress, failure, addError, addDetails,
}: Omit<ImportWebsiteProps, 'shown'>) {
  const error = importPageError({ failure, addError, addDetails });
  const busy = adding || importing;
  const { dragging, dropProps } = useImportDrop({ busy, onRefused: onRefuse,
    onFolder: (folder) => void onDropFolder(folder),
    onArchive: (file) => void onImportArchive({ file }),
  });
  return (
    <section className="onboarding" aria-labelledby="import-website-title" {...dropProps}>
      <div className="onboarding__intro">
        <button type="button" className="back-link" onClick={onBack}>← All websites</button>
        <p className="onboarding__eyebrow">Existing website</p>
        <div className="onboarding__heading">
          <h2 id="import-website-title">Where is it now?</h2>
          <InfoTip text="Pick where the site is now. It is added to Websites and opens in its own tab. The original is not changed." />
        </div>
      </div>

      <div className="onboarding__form">
        <section className="onboarding-card">
          <div className={`onboarding-section import-drop ${dragging ? 'is-dragging' : ''}`}>
            <div className="onboarding-card__head onboarding__heading">
              <h3>Drop a folder or .tovu.zip file</h3>
              <InfoTip text="A folder that holds a Tovu site stays where it is. A .tovu.zip file becomes a new website. The original is not changed." />
            </div>
            <div className="import-actions">
              <button type="button" className="button button--contrast" onClick={() => void onChooseFolder()} disabled={busy}>
                {adding ? 'Adding…' : 'Choose folder…'}
              </button>
              <button type="button" className="button button--quiet" onClick={() => void onImportArchive({ pick: true })} disabled={busy}>
                Choose file…
              </button>
            </div>
          </div>

          <form
            className="onboarding-section"
            onSubmit={(event) => { event.preventDefault(); void onImportAddress(); }}
          >
            <div className="onboarding-card__head onboarding__heading">
              <h3>A share link or live website</h3>
              <InfoTip text="A share link ending in .tovu.zip becomes a new website here. Any other address makes a new website and opens it with the assistant ready: press Import with the assistant there to start." />
            </div>
            <label className="create-field">
              <span className="create-field__label">Address</span>
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
                {importing ? 'Importing…' : 'Import website'}
              </button>
            </div>
          </form>

          <div className="onboarding__actions">
            {error !== null && <ImportError error={error} />}
            <div>
              <button type="button" className="button button--quiet" onClick={onBack}>Cancel</button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
