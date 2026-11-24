/** Tovu's live-guest preferences: keys, bounds, choices, channels, error codes and warning words.
 *  Jini owns the mechanics (`@jini-ai/desktop-host/electron/preferences`) and the lock and atomic
 *  JSON persistence. */
import {
  choiceOf, clampWholeNumber, persistedRadioGroup, positiveWholeNumber, readPreferenceValue, refreshRadioGroup,
  registerPreferenceIpc, wholeNumberSteps, writePreferenceValue,
} from '@jini-ai/desktop-host/electron/preferences';
import type { PreferenceIpcMain, RadioMenuPort } from '@jini-ai/desktop-host/electron/preferences';
import { readJsonFile, withFileLock, writeJsonFileAtomic } from './durable-json-file.ts';
import { LIVE_SITE_VIEWS, SITE_VIEW_PREFERENCE_CHANNELS } from './contracts/site-view-preference.ts';
import { IDLE_SITE_SLEEP, IDLE_SITE_SLEEP_CHANNELS, type IdleSiteSleepMinutes } from './contracts/site-view-preference.ts';

const file = { read: readJsonFile, withLock: withFileLock, writeAtomic: writeJsonFileAtomic };
const UNTRUSTED = 'UNTRUSTED_SITE_VIEW_PREFERENCE_SENDER';

function idleChoice({ value }: { value: unknown }, _optional = {}): IdleSiteSleepMinutes {
  const saved = choiceOf({ value, choices: IDLE_SITE_SLEEP.choices });
  if (saved === undefined) throw new Error('INVALID_IDLE_SITE_SLEEP_MINUTES');
  return saved;
}

/** Read the site-server timeout in minutes; missing or invalid settings use ten minutes.
 * @complexity O(file bytes) time and space. Does not modify unreadable preferences.
 */
export function readIdleSiteSleepMinutes({ preferencePath }: { preferencePath: string }, { warn = console.warn }: { warn?: (message: string) => void } = {}): IdleSiteSleepMinutes {
  return readPreferenceValue({ file, filePath: preferencePath, key: 'idleSiteSleepMinutes',
    parse: ({ value }) => choiceOf({ value, choices: IDLE_SITE_SLEEP.choices }), fallback: IDLE_SITE_SLEEP.fallback },
  { onProblem: ({ problem }) => { if (problem !== 'not-an-object') warn('tovu desktop: invalid idleSiteSleepMinutes; using 10'); } });
}

/** Save before answering, under the existing preferences lock. Reject invalid choices and leave
 * unreadable bytes untouched. Other preferences, including Loaded sites, survive each save.
 * @complexity O(file bytes) time and space, one atomic write.
 */
export function writeIdleSiteSleepMinutes({ preferencePath, idleSiteSleepMinutes }: { preferencePath: string; idleSiteSleepMinutes: number }, _options = {}): IdleSiteSleepMinutes {
  const saved = idleChoice({ value: idleSiteSleepMinutes });
  writePreferenceValue({ file, filePath: preferencePath, key: 'idleSiteSleepMinutes', value: saved });
  return saved;
}

/** Shell-only sleep preference endpoints. Failed writes reject without changing the saved value.
 * A path resolver is evaluated only for an authorized, valid request, so registration needs no storage.
 * @returns Teardown for both handlers. O(1) registration; storage costs belong to read/write above.
 */
export function registerIdleSiteSleepIpc<Sender>({ ipcMain, allowed, preferencePath }: {
  ipcMain: PreferenceIpcMain<Sender, number>;
  allowed: (required: { sender: Sender }) => boolean;
  preferencePath: string | (() => string);
}, _options = {}): () => void {
  const resolvePath = () => typeof preferencePath === 'function' ? preferencePath() : preferencePath;
  return registerPreferenceIpc<Sender, number>({ ipcMain, channels: IDLE_SITE_SLEEP_CHANNELS, allowed, untrustedError: UNTRUSTED,
    parse: idleChoice,
    read: () => readIdleSiteSleepMinutes({ preferencePath: resolvePath() }),
    write: ({ value }) => writeIdleSiteSleepMinutes({ preferencePath: resolvePath(), idleSiteSleepMinutes: value }),
  });
}

/** Read the saved whole number, clamped to 1–5; malformed values warn and fall back to one. O(file bytes). */
export function readMaximumLiveSiteViews({ preferencePath }: { preferencePath: string }, { warn = console.warn }: { warn?: (message: string) => void } = {}): number {
  const fallback = LIVE_SITE_VIEWS.fallback;
  const warning = {
    'unreadable': `tovu desktop: unreadable maximumLiveSiteViews; using ${fallback}`,
    'not-an-object': `tovu desktop: invalid preferences object; using ${fallback} live site views`,
    'invalid-value': `tovu desktop: invalid maximumLiveSiteViews; using ${fallback}`,
  } as const;
  return readPreferenceValue({ file, filePath: preferencePath, key: 'maximumLiveSiteViews', fallback,
    // An older build offered any positive number; a larger saved choice now means the most there is.
    parse: ({ value }) => { const whole = positiveWholeNumber({ value }); return whole === undefined ? undefined : clampWholeNumber({ value: whole, bounds: LIVE_SITE_VIEWS }); },
  }, { onProblem: ({ problem }) => warn(warning[problem]) });
}

/** Persist before notifying the shell, clamped to 1–5, and answer with the saved value. Preserve
 * other settings and unreadable bytes. O(file bytes). */
export function writeMaximumLiveSiteViews({ preferencePath, maximumLiveSiteViews }: { preferencePath: string; maximumLiveSiteViews: number }, _options = {}): number {
  if (positiveWholeNumber({ value: maximumLiveSiteViews }) === undefined) throw new Error('INVALID_MAXIMUM_LIVE_SITE_VIEWS');
  const saved = clampWholeNumber({ value: maximumLiveSiteViews, bounds: LIVE_SITE_VIEWS });
  writePreferenceValue({ file, filePath: preferencePath, key: 'maximumLiveSiteViews', value: saved });
  return saved;
}

const VIEW_COUNTS = wholeNumberSteps({ bounds: LIVE_SITE_VIEWS });
const radioId = ({ value }: { value: number }, _optional = {}) => `maximum-live-site-views-${value}`;

/** A choice saved from the shell's stepper checks the matching native radio, so the two never disagree. O(5). */
export function refreshMaximumLiveSiteViewsMenu({ menu, maximumLiveSiteViews }: { menu: RadioMenuPort; maximumLiveSiteViews: number }, _options = {}): void {
  refreshRadioGroup({ menu, values: VIEW_COUNTS, idOf: radioId, checked: maximumLiveSiteViews });
}

/** Native menu choice, the twin of the shell's Loaded sites stepper. Failed saves restore the native radio group. O(1). */
export function maximumLiveSiteViewsMenu({ maximumLiveSiteViews, setMaximum, onError }: {
  maximumLiveSiteViews: number;
  setMaximum: (input: { maximumLiveSiteViews: number }) => void;
  onError: (input: { error: unknown }) => void;
}, _options = {}) {
  const submenu = persistedRadioGroup({ values: VIEW_COUNTS, checked: maximumLiveSiteViews, idOf: radioId,
    labelOf: ({ value }) => String(value), save: ({ value }) => setMaximum({ maximumLiveSiteViews: value }), onError });
  return { label: 'Loaded sites', submenu };
}

/** The shell-only read and save endpoints. Main answers a save with the value it stored and pushes
 * it to every shell through the change event, the same path the native menu takes. O(1). */
export function registerSiteViewPreferenceIpc<Sender>({ ipcMain, allowed, read, write }: {
  ipcMain: PreferenceIpcMain<Sender, number> & { removeHandler: (channel: string) => void };
  allowed: (required: { sender: Sender }) => boolean;
  read: () => number;
  write: (input: { maximumLiveSiteViews: number }) => number;
}, _options = {}): () => void {
  return registerPreferenceIpc<Sender, number>({ ipcMain, channels: SITE_VIEW_PREFERENCE_CHANNELS, allowed, untrustedError: UNTRUSTED,
    parse: ({ value }) => { const whole = positiveWholeNumber({ value }); if (whole === undefined) throw new Error('INVALID_MAXIMUM_LIVE_SITE_VIEWS'); return whole; },
    read, write: ({ value }) => write({ maximumLiveSiteViews: value }),
  });
}
