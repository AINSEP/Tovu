/** Tovu's app-wide update choice: its key, default and menu copy. Jini owns the preference
 * mechanics (`@jini-ai/desktop-host/electron/preferences`) and the locking/atomic JSON persistence. */
import { persistedCheckbox, readPreferenceValue, writePreferenceValue } from '@jini-ai/desktop-host/electron/preferences';
import { readJsonFile, withFileLock, writeJsonFileAtomic } from './durable-json-file.ts';
import { desktopCopy } from './desktop-i18n.ts';

const file = { read: readJsonFile, withLock: withFileLock, writeAtomic: writeJsonFileAtomic };
const KEY = 'automaticUpdates';

/** On unless the operator saved `false`; bad values and unreadable files cannot disable updates. */
export function readAutomaticUpdates({ preferencePath }: { preferencePath: string }, _optionalArgs = {}): boolean {
  return readPreferenceValue({ file, filePath: preferencePath, key: KEY, parse: ({ value }) => value !== false, fallback: true });
}
export function writeAutomaticUpdates({ preferencePath, enabled }: { preferencePath: string; enabled: boolean }, _optionalArgs = {}): void {
  writePreferenceValue({ file, filePath: preferencePath, key: KEY, value: enabled });
}

export function automaticUpdatesMenu({ locale, enabled, setEnabled, onError }: {
  locale: string;
  enabled: boolean;
  setEnabled: (args: { enabled: boolean }) => void;
  onError: (args: { error: unknown }) => void;
}, _optionalArgs = {}) {
  const copy = desktopCopy({ locale });
  return {
    label: copy.settings,
    submenu: [persistedCheckbox({ label: copy.automaticUpdates, checked: enabled,
      save: ({ checked }) => setEnabled({ enabled: checked }), onError })],
  };
}
