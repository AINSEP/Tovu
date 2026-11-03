/** One ordering owner for the menu preference consumed by Settings and live-view admission. */
import { useEffect, useState } from 'react';
import { LIVE_SITE_VIEWS, clampLiveSiteViews } from '../contracts/site-view-preference.js';
import type { BridgeLookup } from './runner-api.js';

/** A positive saved whole number, otherwise the shipped default. */
export function liveViewLimit({ value }: { value: unknown }, _options = {}): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? clampLiveSiteViews({ value }) : LIVE_SITE_VIEWS.fallback;
}

/** A change event or local save supersedes the initial IPC snapshot. O(1) per update. */
export function useSiteViewPreference({ getBridge }: {
  getBridge: BridgeLookup<'getMaximumLiveSiteViews' | 'onMaximumLiveSiteViewsChanged'>;
}, _options = {}) {
  const [value, setValue] = useState<number>(LIVE_SITE_VIEWS.fallback);
  const [ordering] = useState(() => ({ changed: false }));
  useEffect(() => {
    const bridge = getBridge();
    let active = true;
    ordering.changed = false;
    void bridge?.getMaximumLiveSiteViews?.().then(
      saved => { if (active && !ordering.changed) setValue(liveViewLimit({ value: saved })); },
      () => undefined,
    );
    const off = bridge?.onMaximumLiveSiteViewsChanged?.(saved => {
      if (!active) return;
      ordering.changed = true;
      setValue(liveViewLimit({ value: saved }));
    });
    return () => { active = false; off?.(); };
  }, [getBridge, ordering]);
  return { value, setValue: (next: number) => { ordering.changed = true; setValue(next); } };
}
