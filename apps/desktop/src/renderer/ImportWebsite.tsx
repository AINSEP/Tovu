/**
 * The Import page: one place to bring in a website that already exists, in the same shape as
 * Create website (intro, one card of sections, actions row). Layout and markup only; the state is in
 * `use-import-website.hooks.ts` and `use-add-site.hooks.ts`. Explanations are tooltips, not text.
 */
import { InfoTip } from './CreateWebsiteOnboarding.js';
import { importPageError, useCopyDetails, type ImportFailure } from './use-import-website.hooks.js';

export interface ImportWebsiteProps {
  /** The page is on screen. Decided here, not by `App`, which is at its complexity ceiling. */
  shown: boolean;
  onBack: () => void;
  /** Folder source ("a folder on this computer that already holds a Tovu site"). */
  adding: boolean;
  onChooseFolder: () => Promise<void>;
  /** Address source ("a live website"). */
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

export function ImportWebsite({
  shown, onBack, adding, onChooseFolder, address, onAddressChange, importing, onImportAddress, failure, addError, addDetails,
}: ImportWebsiteProps) {
  if (!shown) return null;
  const error = importPageError({ failure, addError, addDetails });
  const busy = adding || importing;
  return (
    <section className="onboarding" aria-labelledby="import-website-title">
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
          <div className="onboarding-section">
            <div className="onboarding-card__head onboarding__heading">
              <h3>A folder on this computer</h3>
              <InfoTip text="A folder that already holds a Tovu site. Its files stay where they are." />
            </div>
            <div className="import-actions">
              <button type="button" className="button button--contrast" onClick={() => void onChooseFolder()} disabled={busy}>
                {adding ? 'Adding…' : 'Choose folder…'}
              </button>
            </div>
          </div>

          <form
            className="onboarding-section"
            onSubmit={(event) => { event.preventDefault(); void onImportAddress(); }}
          >
            <div className="onboarding-card__head onboarding__heading">
              <h3>A live website</h3>
              <InfoTip text="Makes a new website and opens it with the assistant ready to import this address. Press Import with the assistant there to start." />
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
                {importing ? 'Creating…' : 'Import website'}
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
