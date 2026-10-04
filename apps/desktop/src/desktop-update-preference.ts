/** Tovu's app-wide update choice; Jini owns locking, atomic persistence and update coordination. */
import { readJsonFile, withFileLock, writeJsonFileAtomic } from './durable-json-file.ts';
import { desktopCopy } from './desktop-i18n.ts';

function settingsAt(preferencePath: string): Record<string, unknown> {
  const read = readJsonFile(preferencePath);
  if (read.state !== 'ok') return {};
  const value = read.value;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function readAutomaticUpdates({ preferencePath }: { preferencePath: string }, _optionalArgs = {}): boolean {
  return settingsAt(preferencePath).automaticUpdates !== false;
}
export function writeAutomaticUpdates({ preferencePath, enabled }: { preferencePath: string; enabled: boolean }, _optionalArgs = {}): void {
  withFileLock(preferencePath, () => {
    // Preserve damaged bytes rather than silently replacing an unreadable preferences file.
    if (readJsonFile(preferencePath).state === 'unreadable') throw new Error('DESKTOP_PREFERENCES_UNREADABLE');
    writeJsonFileAtomic(preferencePath, { ...settingsAt(preferencePath), automaticUpdates: enabled });
  });
}

export function automaticUpdatesMenu({ locale, enabled, setEnabled, onError }: {
  locale: string;
  enabled: boolean;
  setEnabled: (args: { enabled: boolean }) => void;
  onError: (args: { error: unknown }) => void;
}, _optionalArgs = {}) {
  const copy = desktopCopy({ locale });
  let currentEnabled = enabled;
  return {
    label: copy.settings,
    submenu: [{
      type: 'checkbox' as const,
      label: copy.automaticUpdates,
      checked: enabled,
      click(item: { checked: boolean }) {
        try { setEnabled({ enabled: item.checked }); currentEnabled = item.checked; }
        catch (error) { item.checked = currentEnabled; onError({ error }); }
      },
    }],
  };
}
