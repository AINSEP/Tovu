/** Read once at shell startup; menu changes push the new numeric limit to each shell. The shell's
 *  own Settings › Loaded sites stepper saves through `write`, which answers with the saved value. */
export const SITE_VIEW_PREFERENCE_CHANNELS = {
  read: 'runner:site-view-preference:read',
  write: 'runner:site-view-preference:write',
  changed: 'runner:site-view-preference:changed',
} as const;

/** Loaded sites: each one is a whole Chromium renderer plus the site's admin (~300 MB), so the
 *  choice is 1 to 5 and a fresh install keeps only the tab on screen. */
export const LIVE_SITE_VIEWS = { min: 1, max: 5, fallback: 1 } as const;

/** Zero keeps unused site servers running continuously. Open tabs always count as present. */
export const IDLE_SITE_SLEEP = { choices: [0, 5, 10, 30], fallback: 10 } as const;
export type IdleSiteSleepMinutes = typeof IDLE_SITE_SLEEP.choices[number];
export const IDLE_SITE_SLEEP_CHANNELS = {
  read: 'runner:site-view-preference:sleep:read',
  write: 'runner:site-view-preference:sleep:write',
} as const;

/** Return a shipped timeout choice or undefined; zero means Off. O(1) time and space. */
export function idleSiteSleepChoice({ value }: { value: unknown }, _options = {}): IdleSiteSleepMinutes | undefined {
  return IDLE_SITE_SLEEP.choices.find(choice => choice === value);
}

/** Clamp a whole number into 1–5; callers validate that it IS a whole number first. O(1). */
export function clampLiveSiteViews({ value }: { value: number }, _options = {}): number {
  return Math.min(LIVE_SITE_VIEWS.max, Math.max(LIVE_SITE_VIEWS.min, value));
}
