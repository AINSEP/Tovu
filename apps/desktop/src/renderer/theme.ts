import { useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'system' | 'dark';

const STORAGE_KEY = 'tovu-runner.theme';

/**
 * Default is `light`, not `system`. Runner is early enough that most of what gets
 * looked at is being designed, and a fixed starting point makes "does this look
 * right" answerable without first asking what the OS is set to. `system` is one
 * click away for anyone who wants it.
 */
const DEFAULT: ThemePreference = 'light';

function readStored(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : DEFAULT;
}

/**
 * `data-theme` on the root element is always the *resolved* value — `light` or
 * `dark`, never `system`. That keeps the stylesheet to a single dark block instead
 * of repeating the whole palette once for the explicit choice and again inside a
 * `prefers-color-scheme` query, which is the usual way these two drift apart.
 */
export function useTheme(): [ThemePreference, (next: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(readStored);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const resolved =
        preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
      document.documentElement.dataset['theme'] = resolved;
      // Tells the engine which form controls and scrollbars to draw.
      document.documentElement.style.colorScheme = resolved;
    };

    apply();
    localStorage.setItem(STORAGE_KEY, preference);

    // Only `system` tracks the OS; an explicit choice must not move underneath you.
    if (preference !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  return [preference, setPreference];
}
