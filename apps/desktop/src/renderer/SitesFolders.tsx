/** Shared local settings are available from Websites and the desktop Settings menu. */
import { SettingsDialogShell } from '@jini-ai/ui';
import '@jini-ai/ui/tabbed-dialog.css';
import { useSiteFolders } from './use-site-folders.hooks.js';
import { useSiteStorageSettings } from './use-site-storage-settings.hooks.js';

/** Jini supplies dialog lifecycle/accessibility; hooks own all state and preload effects. */
export function SitesFolders({ useSettings = useSiteFolders }: { useSettings?: typeof useSiteFolders } = {}) {
  const settings = useSiteStorageSettings({}, { useFolders: useSettings });
  return <SitesFoldersDialog settings={settings} />;
}

/** Kept outside the dropdown: closing its menu never unmounts a draft or a dialog.
 * Self-contained on purpose (inline SVG, CSS-drawn icons, no local helpers): the component tests
 * evaluate this one function with only `SettingsDialogShell` bound, so any other identifier here
 * would be undefined there. `jini-tooltip` tips render through the TooltipLayer in main.tsx. The sync warning renders inside the dialog while it is open; the
 * outside copy would sit behind the modal backdrop. */
export function SitesFoldersDialog({ settings, showTrigger = true }: { settings: ReturnType<typeof useSiteStorageSettings>; showTrigger?: boolean }) {
  // Middle truncation: the parent path gives way first, the folder's own name stays readable.
  const home = settings.folders.home ?? '', homeCut = home.lastIndexOf('/', home.length - 2) + 1;
  const warning = settings.folders.warning && <div role="alert" className="sites-settings__warning">
    <p>{settings.folders.warning.message}</p>
    <div className="sites-settings__warning-actions">
      <button type="button" className="button button--quiet" disabled={settings.busy} onClick={() => void settings.useAppData()}>Store databases in app-data</button>
      <button type="button" className="button button--quiet" disabled={settings.busy || settings.folders.overrides?.sitesHome} onClick={() => void settings.useLocalHome()}>Choose a local folder</button>
    </div>
    {settings.warningError && <p className="sites-settings__error">{settings.warningError}</p>}
  </div>;
  return <>
    {showTrigger && <button type="button" className="button button--quiet" onClick={settings.show}>Sites settings</button>}
    {showTrigger && !settings.open && warning}
    {settings.open && <SettingsDialogShell onClose={settings.close} fullscreenEnabled={false} dialogAriaLabelledBy="desktop-sites-settings-title"
      className="sites-settings-dialog"
      tabs={[{ id: 'sites', label: 'Sites', title: 'Sites settings', panel:
        <form className="sites-settings" aria-busy={settings.busy} onSubmit={(event) => { event.preventDefault(); void settings.save(); }}>
          {warning}
          <div className="sites-settings__row">
            <div className="sites-settings__label">
              <span id="sites-settings-home-label">New websites folder</span>
              <button type="button" className="sites-settings__tip jini-tooltip" aria-label="New websites are created in this folder." data-tooltip="New websites are created in this folder." />
            </div>
            <div className="sites-settings__control">
              <span className="sites-settings__path sites-settings__path--field jini-tooltip" data-tooltip={settings.folders.home}>
                <span className="sites-settings__path-head">{home.slice(0, homeCut)}</span>
                <span className="sites-settings__path-tail">{home.slice(homeCut)}</span>
              </span>
              <button type="button" className="button button--quiet" disabled={settings.busy || settings.folders.overrides?.sitesHome} onClick={() => void settings.chooseHome()}>Choose folder</button>
            </div>
            {settings.folders.overrides?.sitesHome && <p className="sites-settings__note">TOVU_SITES_HOME overrides this setting.</p>}
          </div>

          <div className="sites-settings__row sites-settings__row--stack">
            <div className="sites-settings__label">
              <span id="sites-settings-roots-label">Site folders</span>
              <button type="button" className="sites-settings__tip jini-tooltip" aria-label="Rescan finds websites in these folders. Removing one keeps its files and cards."
                data-tooltip="Rescan finds websites in these folders. Removing one keeps its files and cards." />
            </div>
            <ul className="sites-settings__roots" aria-labelledby="sites-settings-roots-label">{settings.folders.roots.map((root) => {
              const cut = root.lastIndexOf('/', root.length - 2) + 1;
              return <li key={root} className="sites-settings__root">
                <svg className="sites-settings__folder" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                </svg>
                <span className="sites-settings__path jini-tooltip" data-tooltip={root}>
                  <span className="sites-settings__path-head">{root.slice(0, cut)}</span>
                  <span className="sites-settings__path-tail">{root.slice(cut)}</span>
                </span>
                {root === settings.folders.home && <span className="sites-settings__badge">New sites</span>}
                {root !== settings.folders.home && settings.folders.extraRoots.includes(root) && <button type="button" className="sites-settings__remove jini-tooltip" disabled={settings.busy || settings.folders.overrides?.siteRoots}
                  aria-label={`Remove sites folder ${root}`} data-tooltip="Remove from list (files stay)" onClick={() => void settings.removeFolder({ root })}>Remove</button>}
              </li>;
            })}</ul>
            <div className="sites-settings__list-actions">
              <button type="button" className="button button--quiet sites-settings__add" disabled={settings.busy || settings.folders.overrides?.siteRoots} onClick={() => void settings.addFolder()}>Add sites folder</button>
            </div>
            {settings.folders.overrides?.siteRoots && <p className="sites-settings__note">TOVU_SITE_ROOTS overrides this setting.</p>}
          </div>

          <div className="sites-settings__row">
            <div className="sites-settings__label">
              <label htmlFor="sites-settings-databases">Database location</label>
              <button type="button" className="sites-settings__tip jini-tooltip" aria-label="Applies to new sites. Existing databases stay put until moved with sites:move-home while the site is stopped."
                data-tooltip="Applies to new sites. Existing databases stay put until moved with sites:move-home while the site is stopped." />
            </div>
            <div className="sites-settings__control">
              <select id="sites-settings-databases" className="sites-settings__select" value={settings.databases} onChange={(event) => settings.setDatabases(event.target.value as 'inSite' | 'appData')}>
                <option value="inSite">Inside each site (data.nosync)</option><option value="appData">OS app-data</option>
              </select>
            </div>
            {settings.databases === 'appData' && <p className="sites-settings__note">App-data databases live outside the site folder. Copy them too when you move a site.</p>}
          </div>

          {settings.error && <p role="alert" className="sites-settings__error">{settings.error}</p>}
          <footer className="sites-settings__footer">
            {settings.folders.configPath && <span className="sites-settings__saved jini-tooltip" data-tooltip={settings.folders.configPath}>Saved in {settings.folders.configPath}</span>}
            <div className="sites-settings__footer-actions">
              <button type="button" className="button button--quiet" onClick={settings.close}>Cancel</button>
              <button type="submit" className="button button--primary" disabled={settings.busy}>Save</button>
            </div>
          </footer>
        </form> }]} />}
  </>;
}
