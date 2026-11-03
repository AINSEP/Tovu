/** Tovu's live-guest preference. Jini owns the lock and atomic JSON persistence. */
import { readJsonFile, withFileLock, writeJsonFileAtomic } from './durable-json-file.ts';
import { LIVE_SITE_VIEWS, SITE_VIEW_PREFERENCE_CHANNELS, clampLiveSiteViews } from './contracts/site-view-preference.ts';

function settingsAt(preferencePath: string): Record<string, unknown> {
  const read = readJsonFile(preferencePath);
  const value = read.state === 'ok' ? read.value : null;
  return objectSettings(value);
}

function objectSettings(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Read the saved whole number, clamped to 1–5; malformed values warn and fall back to one. O(file bytes). */
export function readMaximumLiveSiteViews({ preferencePath }: { preferencePath: string }, { warn = console.warn }: { warn?: (message: string) => void } = {}): number {
  const fallback = LIVE_SITE_VIEWS.fallback;
  const read = readJsonFile(preferencePath);
  if (read.state === 'missing') return fallback;
  if (read.state === 'unreadable') { warn(`tovu desktop: unreadable maximumLiveSiteViews; using ${fallback}`); return fallback; }
  const settings = objectSettings(read.value);
  if (settings !== read.value) { warn(`tovu desktop: invalid preferences object; using ${fallback} live site views`); return fallback; }
  const value = settings.maximumLiveSiteViews;
  if (value === undefined) return fallback;
  // An older build offered any positive number; a larger saved choice now means the most there is.
  if (isWholeViewCount(value)) return clampLiveSiteViews({ value });
  warn(`tovu desktop: invalid maximumLiveSiteViews; using ${fallback}`);
  return fallback;
}

function isWholeViewCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Persist before notifying the shell, clamped to 1–5, and answer with the saved value. Preserve
 * other settings and unreadable bytes. O(file bytes). */
export function writeMaximumLiveSiteViews({ preferencePath, maximumLiveSiteViews }: { preferencePath: string; maximumLiveSiteViews: number }, _options = {}): number {
  if (!isWholeViewCount(maximumLiveSiteViews)) throw new Error('INVALID_MAXIMUM_LIVE_SITE_VIEWS');
  const saved = clampLiveSiteViews({ value: maximumLiveSiteViews });
  withFileLock(preferencePath, () => {
    if (readJsonFile(preferencePath).state === 'unreadable') throw new Error('DESKTOP_PREFERENCES_UNREADABLE');
    writeJsonFileAtomic(preferencePath, { ...settingsAt(preferencePath), maximumLiveSiteViews: saved });
  });
  return saved;
}

type RadioItem = { id: string; checked: boolean };
const VIEW_COUNTS = Array.from({ length: LIVE_SITE_VIEWS.max - LIVE_SITE_VIEWS.min + 1 }, (_, index) => LIVE_SITE_VIEWS.min + index);
const radioId = (value: number) => `maximum-live-site-views-${value}`;

/** Electron's `Menu` statics, narrowed to finding the installed menu's radios by id. */
export interface RadioMenuPort {
  getApplicationMenu(): { getMenuItemById(id: string): { checked: boolean } | null } | null;
}

/** A choice saved from the shell's stepper checks the matching native radio, so the two never
 * disagree. Electron leaves sibling radios alone when one is set from code, so each is set. O(5). */
export function refreshMaximumLiveSiteViewsMenu({ menu, maximumLiveSiteViews }: { menu: RadioMenuPort; maximumLiveSiteViews: number }, _options = {}): void {
  const installed = menu.getApplicationMenu();
  for (const value of VIEW_COUNTS) {
    const radio = installed?.getMenuItemById(radioId(value));
    if (radio) radio.checked = value === maximumLiveSiteViews;
  }
}
interface ViewRadioItem extends RadioItem {
  label: string;
  type: 'radio';
  click: (item: { checked: boolean; menu?: { items: RadioItem[] } }) => void;
}
/** Native menu choice, the twin of the shell's Loaded sites stepper. Failed saves restore the native radio group. O(1). */
export function maximumLiveSiteViewsMenu({ maximumLiveSiteViews, setMaximum, onError }: {
  maximumLiveSiteViews: number;
  setMaximum: (input: { maximumLiveSiteViews: number }) => void;
  onError: (input: { error: unknown }) => void;
}, _options = {}) {
  let saved = maximumLiveSiteViews;
  const submenu: ViewRadioItem[] = VIEW_COUNTS.map(value => ({
    id: radioId(value), label: String(value), type: 'radio' as const, checked: value === saved,
    click(item: { checked: boolean; menu?: { items: RadioItem[] } }) {
      try { setMaximum({ maximumLiveSiteViews: value }); saved = value; }
      catch (error) {
        for (const radio of item.menu?.items ?? submenu) radio.checked = radio.id === radioId(saved);
        item.checked = value === saved;
        onError({ error });
      }
    },
  }));
  return { label: 'Loaded sites', submenu };
}

/** The shell-only read and save endpoints. Main answers a save with the value it stored and pushes
 * it to every shell through the change event, the same path the native menu takes. O(1). */
export function registerSiteViewPreferenceIpc<Sender>({ ipcMain, allowed, read, write }: {
  ipcMain: {
    handle: (channel: string, handler: (event: { sender: Sender }, value?: unknown) => number) => void;
    removeHandler: (channel: string) => void;
  };
  allowed: (sender: Sender) => boolean;
  read: () => number;
  write: (input: { maximumLiveSiteViews: number }) => number;
}, _options = {}): () => void {
  const trusted = (sender: Sender) => { if (!allowed(sender)) throw new Error('UNTRUSTED_SITE_VIEW_PREFERENCE_SENDER'); };
  ipcMain.handle(SITE_VIEW_PREFERENCE_CHANNELS.read, ({ sender }) => { trusted(sender); return read(); });
  ipcMain.handle(SITE_VIEW_PREFERENCE_CHANNELS.write, ({ sender }, value) => {
    trusted(sender);
    if (!isWholeViewCount(value)) throw new Error('INVALID_MAXIMUM_LIVE_SITE_VIEWS');
    return write({ maximumLiveSiteViews: value });
  });
  return () => {
    ipcMain.removeHandler(SITE_VIEW_PREFERENCE_CHANNELS.read);
    ipcMain.removeHandler(SITE_VIEW_PREFERENCE_CHANNELS.write);
  };
}
