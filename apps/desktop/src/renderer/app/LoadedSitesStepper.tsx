/** Settings › Loaded sites: − / number / + on the gear menu's row under Theme. Every step and every
 *  typed digit saves at once through {@link useLoadedSites}; there is no Save button to forget. */
import { useState, type KeyboardEvent } from 'react';
import { LIVE_SITE_VIEWS } from '../../contracts/site-view-preference.js';
import { loadedSitesFromText, type LoadedSitesSetting } from '../use-loaded-sites.hooks.js';

export const LOADED_SITES_TIP = 'Each loaded site stays in memory (~300 MB each). Higher = instant switching between sites, more memory. Other open tabs reload when you switch to them.';

const { min: MIN, max: MAX } = LIVE_SITE_VIEWS;

/** The spinbutton keys and where each one goes from `value`; `null` for any other key. O(1). */
function keyTarget({ key, value }: { key: string; value: number }, _options = {}): number | null {
  if (key === 'ArrowUp') return Math.min(MAX, value + 1);
  if (key === 'ArrowDown') return Math.max(MIN, value - 1);
  if (key === 'Home') return MIN;
  if (key === 'End') return MAX;
  return null;
}

/**
 * The field is the one tab stop (a spinbutton); − and + are pointer and touch targets, as in the
 * WAI spinbutton pattern. The tip hangs on the whole control for hover and keyboard focus, and on
 * the field itself because a tapped text field is `:focus-visible`, which is what Jini's
 * TooltipLayer needs to show a tip after a touch (a tapped button is not).
 */
export function LoadedSitesStepper({ setting, labelledBy }: { setting: LoadedSitesSetting; labelledBy: string }, _options = {}) {
  // `null` shows the saved value; a string is the field mid-edit (cleared, or a non-digit typed).
  const [draft, setDraft] = useState<string | null>(null);
  const { value, save } = setting;
  const tipId = `${labelledBy}-tip`;
  const onChange = (text: string) => {
    const next = loadedSitesFromText({ text });
    if (next === null) { setDraft(''); return; }
    setDraft(null);
    save(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const next = keyTarget({ key: event.key, value });
    if (next === null) return;
    // The menu's own Up/Down/Home/End would move focus to another row; here they change the number.
    event.preventDefault();
    event.stopPropagation();
    setDraft(null);
    save(next);
  };
  return (
    <div className="stepper jini-tooltip" role="group" aria-labelledby={labelledBy} data-tooltip={LOADED_SITES_TIP} data-tooltip-placement="bottom">
      <button type="button" className="stepper__step" tabIndex={-1} aria-label="Fewer loaded sites" disabled={value <= MIN} onClick={() => save(value - 1)}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7" /></svg>
      </button>
      <input
        className="stepper__value jini-tooltip"
        data-tooltip={LOADED_SITES_TIP}
        data-tooltip-placement="bottom"
        type="text"
        inputMode="numeric"
        role="spinbutton"
        aria-label="Loaded sites"
        aria-describedby={tipId}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={value}
        value={draft ?? String(value)}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={() => setDraft(null)}
        onKeyDown={onKeyDown}
      />
      <button type="button" className="stepper__step" tabIndex={-1} aria-label="More loaded sites" disabled={value >= MAX} onClick={() => save(value + 1)}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7M6 2.5v7" /></svg>
      </button>
      <span id={tipId} className="visually-hidden">{LOADED_SITES_TIP}</span>
    </div>
  );
}

/** The gear menu's row under Theme, plus a failed save's message. An older preload with no save
 *  channel gets no row rather than a stepper that cannot save. */
export function LoadedSitesRow({ setting }: { setting: LoadedSitesSetting }, _options = {}) {
  if (!setting.available) return null;
  return <>
    <div className="settings__row">
      <span className="settings__label" id="settings-loaded-sites-label">Loaded sites</span>
      <LoadedSitesStepper setting={setting} labelledBy="settings-loaded-sites-label" />
    </div>
    {setting.error && <p role="alert" className="settings__note settings__note--error">{setting.error}</p>}
  </>;
}
