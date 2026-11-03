/** Tovu's live-guest preference. Jini owns the lock and atomic JSON persistence. */
import { readJsonFile, withFileLock, writeJsonFileAtomic } from './durable-json-file.ts';
import { SITE_VIEW_PREFERENCE_CHANNELS } from './contracts/site-view-preference.ts';

function settingsAt(preferencePath: string): Record<string, unknown> {
  const read = readJsonFile(preferencePath);
  const value = read.state === 'ok' ? read.value : null;
  return objectSettings(value);
}

function objectSettings(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Read a positive integer, warning and using two for malformed saved values. O(file bytes). */
export function readMaximumLiveSiteViews({ preferencePath }: { preferencePath: string }, { warn = console.warn }: { warn?: (message: string) => void } = {}): number {
  const read = readJsonFile(preferencePath);
  if (read.state === 'missing') return 2;
  if (read.state === 'unreadable') { warn('tovu desktop: unreadable maximumLiveSiteViews; using 2'); return 2; }
  const settings = objectSettings(read.value);
  if (settings !== read.value) { warn('tovu desktop: invalid preferences object; using 2 live site views'); return 2; }
  const value = settings.maximumLiveSiteViews;
  if (value === undefined) return 2;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  warn('tovu desktop: invalid maximumLiveSiteViews; using 2');
  return 2;
}

/** Persist before notifying the shell. Preserve other settings and unreadable bytes. O(file bytes). */
export function writeMaximumLiveSiteViews({ preferencePath, maximumLiveSiteViews }: { preferencePath: string; maximumLiveSiteViews: number }, _options = {}): void {
  if (!Number.isSafeInteger(maximumLiveSiteViews) || maximumLiveSiteViews < 1) throw new Error('INVALID_MAXIMUM_LIVE_SITE_VIEWS');
  withFileLock(preferencePath, () => {
    if (readJsonFile(preferencePath).state === 'unreadable') throw new Error('DESKTOP_PREFERENCES_UNREADABLE');
    writeJsonFileAtomic(preferencePath, { ...settingsAt(preferencePath), maximumLiveSiteViews });
  });
}

type RadioItem = { id: string; checked: boolean };
interface ViewRadioItem extends RadioItem {
  label: string;
  type: 'radio';
  click: (item: { checked: boolean; menu?: { items: RadioItem[] } }) => void;
}
/** Native menu choice with no renderer write channel. Failed saves restore the native radio group. O(1). */
export function maximumLiveSiteViewsMenu({ maximumLiveSiteViews, setMaximum, onError }: {
  maximumLiveSiteViews: number;
  setMaximum: (input: { maximumLiveSiteViews: number }) => void;
  onError: (input: { error: unknown }) => void;
}, _options = {}) {
  let saved = maximumLiveSiteViews;
  const submenu: ViewRadioItem[] = [1, 2, 3, 5].map(value => ({
    id: `maximum-live-site-views-${value}`, label: String(value), type: 'radio' as const, checked: value === saved,
    click(item: { checked: boolean; menu?: { items: RadioItem[] } }) {
      try { setMaximum({ maximumLiveSiteViews: value }); saved = value; }
      catch (error) {
        for (const radio of item.menu?.items ?? submenu) radio.checked = radio.id === `maximum-live-site-views-${saved}`;
        item.checked = value === saved;
        onError({ error });
      }
    },
  }));
  return { label: 'Maximum live site views', submenu };
}

/** Register the single shell-only read endpoint; changes arrive through the menu's push event. O(1). */
export function registerSiteViewPreferenceIpc<Sender>({ ipcMain, allowed, read }: {
  ipcMain: {
    handle: (channel: string, handler: (event: { sender: Sender }) => number) => void;
    removeHandler: (channel: string) => void;
  };
  allowed: (sender: Sender) => boolean;
  read: () => number;
}, _options = {}): () => void {
  ipcMain.handle(SITE_VIEW_PREFERENCE_CHANNELS.read, ({ sender }) => {
    if (!allowed(sender)) throw new Error('UNTRUSTED_SITE_VIEW_PREFERENCE_SENDER');
    return read();
  });
  return () => ipcMain.removeHandler(SITE_VIEW_PREFERENCE_CHANNELS.read);
}
