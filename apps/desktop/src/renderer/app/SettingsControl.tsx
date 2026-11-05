import { navAvailability } from '../nav-availability.js';
import { reportShellTelemetry } from '../product-telemetry.js';
import { GearIcon, MenuIcon } from '../icons.js';
import type { ThemePreference } from '../theme.js';
import { settingsControlHandlers, useDismissibleDropdown, useMenuKeyboard } from '../App.hooks.js';
import { useUpdateCheck } from '../use-update-check.hooks.js';
import { SitesFoldersDialog } from '../SitesFolders.js';
import { useSiteStorageSettings } from '../use-site-storage-settings.hooks.js';
import { useLoadedSites } from '../use-loaded-sites.hooks.js';
import { LoadedSitesRow } from './LoadedSitesStepper.js';
import { useEffect, useRef, useState } from 'react';
import { runnerInventoryBridge } from '../runner-api.js';
import { IDLE_SITE_SLEEP, idleSiteSleepChoice, type IdleSiteSleepMinutes } from '../../contracts/site-view-preference.js';

const THEMES: readonly ThemePreference[] = ['light', 'system', 'dark'];

/** Gear icon that opens the Settings menu: two rows that open a screen (Sites settings…, Appearance),
 *  Check for updates…, an inline Theme switch, the Loaded sites stepper and idle sleep — the settings worth changing
 *  without leaving the menu. Closes on selection or on a click/tap outside the dropdown; arrow keys move
 *  between entries (inside the stepper they change its number instead). */
export function SettingsControl({
  theme,
  onThemeChange,
  onOpenAppearance,
  useSiteSettings = useSiteStorageSettings,
}: {
  theme: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
  onOpenAppearance: () => void;
  useSiteSettings?: typeof useSiteStorageSettings;
}) {
  const { open, setOpen, containerRef } = useDismissibleDropdown<HTMLDivElement>();
  const { menuRef, triggerRef, onMenuKeyDown } = useMenuKeyboard<HTMLDivElement, HTMLButtonElement>({ open });
  const sitesSettings = useSiteSettings({});
  const updateCheck = useUpdateCheck({ onDone: () => setOpen(false) });
  // Read while the menu is closed too, so the row opens on the saved number, never a flash of the default.
  const loadedSites = useLoadedSites();
  const idleSiteSleep = useIdleSiteSleep();
  // The menu used to share NavLink's temporary lock. Local sites settings now has a real
  // shared-config owner, so Settings can open without unlocking unfinished section links.
  // That lock is therefore permanently off: the gear passes `disabled: false` below and carries
  // none of NavLink's `aria-disabled`/`tabIndex`/`--disabled` styling, which a constant `false`
  // could never switch on.
  const { toggleOpen, chooseTheme, openAppearancePage } = settingsControlHandlers({
    disabled: false,
    setOpen,
    onThemeChange,
    onOpenAppearance,
  });

  return (
    <>
    <div className="settings" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`topnav__link ${open ? 'is-active' : ''}`}
        onClick={() => { reportShellTelemetry({ payload: { kind: 'action', id: 'open_settings' } }); toggleOpen(); }}
        aria-expanded={open}
        aria-haspopup="true"
        {...navAvailability({ label: "Settings", disabled: false })}
        aria-label="Settings"
      >
        <GearIcon />
      </button>
      {open && (
        <div className="settings__dropdown" role="menu" aria-label="Settings" ref={menuRef} onKeyDown={onMenuKeyDown}>
          <button type="button" role="menuitem" className="settings__item" onClick={() => { setOpen(false); sitesSettings.show(); }}>
            <MenuIcon kind="folder" />
            <span className="settings__label">Sites settings…</span>
          </button>
          {/* The Theme switch below changes the setting inline; this opens the real page for it —
              same relationship a form field has to "Advanced settings" elsewhere in the app. */}
          <button type="button" role="menuitem" className="settings__item" onClick={openAppearancePage}>
            <MenuIcon kind="appearance" />
            <span className="settings__label">Appearance</span>
            <svg className="settings__chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M7.5 4.5 13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {/* Stays open reading "Checking…" until main shows its answer, then closes. */}
          {updateCheck.available && (
            <button type="button" role="menuitem" className="settings__item" aria-disabled={updateCheck.checking} onClick={() => { reportShellTelemetry({ payload: { kind: 'action', id: 'check_updates' } }); void updateCheck.checkForUpdates(); }}>
              <MenuIcon kind="update" />
              <span className="settings__label">{updateCheck.checking ? 'Checking…' : 'Check for updates…'}</span>
            </button>
          )}
          <div className="settings__sep" role="separator" />
          <div className="settings__row">
            <span className="settings__label" id="settings-theme-label">Theme</span>
            <ThemeControl value={theme} onChange={chooseTheme} />
          </div>
          <LoadedSitesRow setting={loadedSites} />
          <IdleSiteSleepRow setting={idleSiteSleep} />
        </div>
      )}
    </div>
    <SitesFoldersDialog settings={sitesSettings} showTrigger={false} />
    </>
  );
}

/** Read once, then save through the existing locked preferences owner. A save supersedes a late
 * startup read; failed saves retain the last shown choice. One request per read/save, O(1) state.
 */
function useIdleSiteSleep() {
  const [value, setValue] = useState<IdleSiteSleepMinutes>(IDLE_SITE_SLEEP.fallback);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const bridge = runnerInventoryBridge();
  useEffect(() => {
    let active = true;
    const initialRevision = revision.current;
    void runnerInventoryBridge()?.getIdleSiteSleepMinutes?.().then(saved => {
      const choice = idleSiteSleepChoice({ value: saved });
      if (active && revision.current === initialRevision && choice !== undefined) setValue(choice);
    }, () => { if (active && revision.current === initialRevision) setError('Sleep idle sites setting could not be loaded.'); });
    return () => { active = false; };
  }, []);
  const save = (next: IdleSiteSleepMinutes) => {
    if (saving || next === value || !bridge?.setIdleSiteSleepMinutes) return;
    revision.current++;
    setSaving(true);
    setError(null);
    void bridge.setIdleSiteSleepMinutes(next).then(saved => {
      const choice = idleSiteSleepChoice({ value: saved });
      if (choice !== undefined) setValue(choice);
      setSaving(false);
    }, () => {
      setError('Sleep idle sites setting could not be saved.');
      setSaving(false);
    });
  };
  return { value, saving, error, save, available: Boolean(bridge?.getIdleSiteSleepMinutes && bridge?.setIdleSiteSleepMinutes) };
}

/** The existing settings row and Theme radio treatment, with no native-menu duplicate. */
function IdleSiteSleepRow({ setting }: { setting: ReturnType<typeof useIdleSiteSleep> }) {
  if (!setting.available) return null;
  return <>
    <div className="settings__row">
      <span className="settings__label">Sleep idle sites after</span>
      <div className="themer" role="group" aria-label="Sleep idle sites after">
        {IDLE_SITE_SLEEP.choices.map(minutes => <button
          key={minutes} type="button" role="menuitemradio"
          className={`themer__opt ${setting.value === minutes ? 'is-on' : ''}`}
          aria-checked={setting.value === minutes} aria-label={minutes === 0 ? 'Off' : `${minutes} min`}
          data-tip={minutes === 0 ? 'Off' : `${minutes} min`} disabled={setting.saving}
          onClick={() => setting.save(minutes)}
        >{minutes === 0 ? 'Off' : minutes}</button>)}
      </div>
      <span>min</span>
    </div>
    {setting.error && <p role="alert" className="settings__note settings__note--error">{setting.error}</p>}
  </>;
}

function ThemeControl({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (next: ThemePreference) => void;
}) {
  // Icon-only segments inside the Settings menu: menu radios, so the arrow keys reach them like the
  // rows above, with the name in `aria-label` and the visible `data-tip`.
  return (
    <div className="themer" role="group" aria-labelledby="settings-theme-label">
      {THEMES.map((option) => {
        let label = 'Dark';
        if (option === 'light') label = 'Light';
        if (option === 'system') label = 'System';
        return (
          <button
            type="button"
            key={option}
            role="menuitemradio"
            className={`themer__opt ${option === value ? 'is-on' : ''}`}
            onClick={() => onChange(option)}
            aria-checked={option === value}
            aria-label={label}
            data-tip={label}
          >
            <MenuIcon kind={option} />
          </button>
        );
      })}
    </div>
  );
}
