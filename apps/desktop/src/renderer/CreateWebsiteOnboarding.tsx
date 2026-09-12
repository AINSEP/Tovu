/**
 * The create-website onboarding flow: name the site, pick a database, review the instance
 * summary, submit. Split out of `App.tsx` as its own module — the form's field state and
 * submission lifecycle live in `useCreateWebsiteForm` (App.hooks.ts); everything here is layout
 * and markup on top of that hook's return value.
 */
import { useCreateWebsiteForm } from './App.hooks.js';
import type { CreateSiteInput, DatabaseProviderKind } from '../contracts/project.js';
import type { RefObject } from 'react';

const TOVU_VERSION = '0.1.0';

function DatabaseOption({
  value,
  selected,
  onSelect,
  title,
  hint,
  unavailable = false,
}: {
  value: DatabaseProviderKind;
  selected: boolean;
  onSelect: (value: DatabaseProviderKind) => void;
  title: string;
  hint: string;
  /** This app cannot provision this provider, so the option is shown and cannot be chosen — see
   *  `DatabasePicker`'s own comment on why it is shown at all rather than removed. */
  unavailable?: boolean;
}) {
  return (
    <label className={`database-option ${selected ? 'is-selected' : ''} ${unavailable ? 'is-unavailable' : ''}`}>
      {/* `disabled`, not just the class: a control that only LOOKS disabled is still reachable by
          keyboard and still selectable, which is the whole failure being fixed. */}
      <input
        type="radio"
        name="database"
        value={value}
        checked={selected}
        disabled={unavailable}
        onChange={() => onSelect(value)}
      />
      <span className="database-option__radio" aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <small>{hint}</small>
      </span>
    </label>
  );
}

function DatabasePicker({
  database,
  onSelect,
  supabaseUrl,
  onSupabaseUrlChange,
  supabaseKeyRef,
  onSupabaseKeyChange,
  customProvider,
  onCustomProviderChange,
  customConnection,
  onCustomConnectionChange,
  customCredentialRef,
  onCustomCredentialChange,
}: {
  database: DatabaseProviderKind;
  onSelect: (value: DatabaseProviderKind) => void;
  supabaseUrl: string;
  onSupabaseUrlChange: (value: string) => void;
  supabaseKeyRef: RefObject<HTMLInputElement | null>;
  onSupabaseKeyChange: (hasValue: boolean) => void;
  customProvider: string;
  onCustomProviderChange: (value: string) => void;
  customConnection: string;
  onCustomConnectionChange: (value: string) => void;
  customCredentialRef: RefObject<HTMLInputElement | null>;
  onCustomCredentialChange: (hasValue: boolean) => void;
}) {
  return (
    <>
      <fieldset className="database-picker">
        {/* D-02. Supabase and Custom were selectable, and choosing either made `computeCanCreate`
            refuse to enable the button until the operator typed a project URL and an API key —
            which `handleCreate` then discarded before reporting a plain SQLite site as success.
            This app has no hosted-database provisioner (`project-ipc.js`'s `handleCreate` now
            refuses the choice outright, which is the boundary these two must never reach).

            Shown-and-disabled rather than deleted: the options say what this app will be able to
            do, and a form that silently loses a whole axis of choice tells the operator less than
            one that says "not yet". Whether they should be removed entirely once the roadmap is
            settled is a product call, not this fix's. A disabled radio cannot be selected, so the
            vendor field blocks below never render and no credential is ever asked for. */}
        <DatabaseOption value="sqlite" selected={database === 'sqlite'} onSelect={onSelect} title="SQLite" hint="Default · created inside this Tovu workspace" />
        <DatabaseOption value="supabase" selected={database === 'supabase'} onSelect={onSelect} title="Supabase" hint="Not available in this app yet · needs a hosted-database provisioner" unavailable />
        <DatabaseOption value="custom" selected={database === 'custom'} onSelect={onSelect} title="Custom DB Provider" hint="Not available in this app yet · needs a hosted-database provisioner" unavailable />
      </fieldset>

      {database === 'supabase' && (
        <div className="vendor-fields">
          <label className="create-field">
            <span className="create-field__label">Supabase project URL</span>
            <input value={supabaseUrl} onChange={(event) => onSupabaseUrlChange(event.target.value)} placeholder="https://your-project.supabase.co" inputMode="url" />
          </label>
          <label className="create-field">
            <span className="create-field__label">Supabase API key</span>
            <input
              ref={supabaseKeyRef}
              defaultValue=""
              onChange={(event) => onSupabaseKeyChange(event.target.value.length > 0)}
              placeholder="Paste your API key"
              type="password"
              autoComplete="off"
            />
            <span className="create-field__hint">Credentials must be saved in the Runner vault before provisioning; this prototype does not retain the key.</span>
          </label>
        </div>
      )}

      {database === 'custom' && (
        <div className="vendor-fields vendor-fields--custom">
          <label className="create-field">
            <span className="create-field__label">Provider name</span>
            <input value={customProvider} onChange={(event) => onCustomProviderChange(event.target.value)} placeholder="e.g. Neon, PlanetScale, Turso" />
          </label>
          <label className="create-field">
            <span className="create-field__label">Connection string or API endpoint</span>
            <input value={customConnection} onChange={(event) => onCustomConnectionChange(event.target.value)} placeholder="https://… or postgres://…" autoComplete="off" />
          </label>
          <label className="create-field">
            <span className="create-field__label">
              API key or vendor credential <em>(optional)</em>
            </span>
            <input
              ref={customCredentialRef}
              defaultValue=""
              onChange={(event) => onCustomCredentialChange(event.target.value.length > 0)}
              placeholder="Paste a credential if your provider requires one"
              type="password"
              autoComplete="off"
            />
            <span className="create-field__hint">Credentials must be saved in the Runner vault before provisioning; this prototype does not retain them.</span>
          </label>
        </div>
      )}
    </>
  );
}

/**
 * `useForm` is the form hook itself, defaulted to the real one — the function, never its result
 * (a default of `useCreateWebsiteForm(onCreate)` would run only when the prop is omitted, making
 * hook order depend on the caller).
 *
 * This is the highest-value injection point in the renderer. The form has a wide state space —
 * slug preview, three database branches with different required fields, submit enabled/disabled,
 * mid-submit, and a submission error — and reaching most of it through the UI means typing into
 * several fields in the right order first. A stub puts the layout in any one of those states in a
 * single line, which separates "does this render correctly" from "is the validation right"; the
 * latter is already answerable against `computeCanCreate` with no React at all.
 *
 * `typeof useCreateWebsiteForm` rather than a hand-written signature: the return type includes the
 * two credential REFS, and a stub that returns plain objects instead of refs — the mistake that
 * would quietly break the input clearing this form does for security — will not compile.
 */
export function CreateWebsiteOnboarding({
  onBack,
  onCreate,
  useForm = useCreateWebsiteForm,
}: {
  onBack: () => void;
  onCreate: (input: CreateSiteInput) => Promise<void>;
  useForm?: typeof useCreateWebsiteForm;
}) {
  const {
    name,
    setName,
    database,
    setDatabase,
    supabaseUrl,
    setSupabaseUrl,
    setHasSupabaseKey,
    customProvider,
    setCustomProvider,
    customConnection,
    setCustomConnection,
    setHasCustomCredential,
    supabaseKeyRef,
    customCredentialRef,
    slug,
    canCreate,
    isSubmitting,
    formError,
    handleSubmit,
  } = useForm(onCreate);

  return (
    <section className="onboarding" aria-labelledby="create-website-title">
      <div className="onboarding__intro">
        <button type="button" className="back-link" onClick={onBack}>← All websites</button>
        <p className="onboarding__eyebrow">New Tovu instance</p>
        <h2 id="create-website-title">Set up your website</h2>
        <p>Each website gets an isolated directory, database, port, and Tovu release.</p>
      </div>

      <form className="onboarding__form" onSubmit={handleSubmit}>
        <section className="onboarding-card">
          <div className="onboarding-section">
            <div className="onboarding-card__head">
              <div>
                <h3>Website details</h3>
                <p>Name the isolated workspace for this Tovu instance.</p>
              </div>
            </div>

            <label className="create-field">
              <span className="create-field__label">Website name</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Corner Bakery"
              />
              <span className="create-field__hint">
                {slug ? `Workspace folder: ${slug}` : 'This becomes the isolated local workspace folder.'}
              </span>
            </label>
          </div>

          <div className="onboarding-section">
            <div>
              <h3>Database</h3>
              <p>SQLite is the zero-configuration default. Bring a hosted vendor when you need one.</p>
            </div>

            <DatabasePicker
              database={database}
              onSelect={setDatabase}
              supabaseUrl={supabaseUrl}
              onSupabaseUrlChange={setSupabaseUrl}
              supabaseKeyRef={supabaseKeyRef}
              onSupabaseKeyChange={setHasSupabaseKey}
              customProvider={customProvider}
              onCustomProviderChange={setCustomProvider}
              customConnection={customConnection}
              onCustomConnectionChange={setCustomConnection}
              customCredentialRef={customCredentialRef}
              onCustomCredentialChange={setHasCustomCredential}
            />
          </div>

          <div className="onboarding-section onboarding-section--instance">
            <div>
              <h3>Instance copy</h3>
              <p>Runner will create a separate Tovu workspace from the selected release.</p>
            </div>
            <dl className="instance-summary">
              <div><dt>Template</dt><dd>Starter Site</dd></div>
              <div><dt>Tovu release</dt><dd>v{TOVU_VERSION}</dd></div>
              <div><dt>Local port</dt><dd>Assigned automatically</dd></div>
              <div><dt>Workspace</dt><dd>{slug || 'Set a website name'}</dd></div>
            </dl>
          </div>

          <footer className="onboarding__actions">
            {formError ? (
              <p className="onboarding__error" role="alert">{formError}</p>
            ) : (
              <p>UI onboarding is ready. Provisioning the copy and securely saving vendor credentials needs the Runner supervisor connection.</p>
            )}
            <div>
              <button type="button" className="button button--quiet" onClick={onBack}>Cancel</button>
              <button type="submit" className="button button--primary" disabled={!canCreate || isSubmitting}>
                {isSubmitting ? 'Creating…' : 'Create local instance'}
              </button>
            </div>
          </footer>
        </section>
      </form>
    </section>
  );
}
