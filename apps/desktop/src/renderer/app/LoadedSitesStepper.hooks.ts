import { useState, type KeyboardEvent } from 'react';
import { LIVE_SITE_VIEWS } from '../../contracts/site-view-preference.js';
import { loadedSitesFromText, type LoadedSitesSetting } from '../use-loaded-sites.hooks.js';

const { min: MIN, max: MAX } = LIVE_SITE_VIEWS;

/** The spinbutton keys and where each one goes from `value`; `null` for any other key. O(1). */
function keyTarget({ key, value }: { key: string; value: number }, _options = {}): number | null {
  if (key === 'ArrowUp') return Math.min(MAX, value + 1);
  if (key === 'ArrowDown') return Math.max(MIN, value - 1);
  if (key === 'Home') return MIN;
  if (key === 'End') return MAX;
  return null;
}

/** Manage the editable loaded-sites value and spinbutton keys. */
export function useLoadedSitesStepper({ setting }: { setting: LoadedSitesSetting }, _options = {}) {
  // `null` shows the saved value; a string is the field mid-edit (cleared, or a non-digit typed).
  const [draft, setDraft] = useState<string | null>(null);
  const { value, save } = setting;
  const onChange = ({ text }: { text: string }, _options = {}) => {
    const next = loadedSitesFromText({ text });
    if (next === null) { setDraft(''); return; }
    setDraft(null);
    save({ next });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const next = keyTarget({ key: event.key, value });
    if (next === null) return;
    // The menu's own Up/Down/Home/End would move focus to another row; here they change the number.
    event.preventDefault();
    event.stopPropagation();
    setDraft(null);
    save({ next });
  };
  return { draft, setDraft, value, save, onChange, onKeyDown };
}
