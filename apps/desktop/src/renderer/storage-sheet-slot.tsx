/**
 * @file P11 ST-18a.T — the sites home's binding of the Storage sheet: its words, its button, and the
 * hook bound to the fixed `tovuStorageSheet` bridge. `storageSheetSlot` returns nothing while the
 * release flag is off (or the preload exposed no bridge), and no slot means no entry anywhere.
 */
import { useCallback, useEffect, useState } from 'react';
import type { DesktopStorageActionResult, DesktopStorageView } from '@tovu/contracts/desktop-storage';
import type { StorageSheetBridge } from '../contracts/storage-sheet.js';
import type { ReadyStoragePreview, StorageButtonProps, StorageSheetCopy, StorageSheetSlot, StorageSheetState } from './app/StorageSheet.js';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
/** Binary units, one decimal under 10. @complexity O(1). */
function formatBytes({ bytes }: { bytes: number }): string {
  let value = bytes, unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) { value /= 1024; unit += 1; }
  return `${value < 10 && unit > 0 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)} ${UNITS[unit]}`;
}

const RESULT_WORDS: Readonly<Record<DesktopStorageActionResult['state'], string>> = {
  done: 'Done.', declined: 'Nothing was changed.', kept: 'Kept: it is in use or changed. Nothing was removed.', relist: 'The list changed. It has been refreshed.',
};

export const STORAGE_SHEET_COPY: StorageSheetCopy = {
  open: 'Storage', title: 'Storage', close: 'Close', loading: 'Checking storage…', sites: 'Websites', signIns: 'Saved sign-ins',
  signInsUnknown: 'Saved sign-ins could not be checked, so none can be removed right now.', otherFolders: 'Other folders',
  unknownSize: 'Unknown size', confirm: 'Confirm', cancel: 'Cancel',
  actions: { 'remove-sign-in': 'Remove sign-in', 'trash-folder': 'Move to Trash', clean: 'Clean', compact: 'Compact' },
  bytes: formatBytes,
  confirmDetail: ({ preview }) => (preview.action === 'remove-sign-in'
    ? `Remove the saved sign-in for ${preview.label}? Website files are not touched.`
    : `${STORAGE_SHEET_COPY.actions[preview.action]}: ${preview.label}?`),
  result: ({ result }) => RESULT_WORDS[result.state],
};

export function StorageButton({ onClick, className, children }: StorageButtonProps) {
  return <button type="button" className={className} onClick={onClick}>{children}</button>;
}

/**
 * The production hook: lists on mount, asks main for a confirmation, and calls `act` only from
 * `confirm`. Any failed call reads as `relist` — never a raw error string.
 */
export function useStorageSheetBridge({ bridge }: { bridge: StorageSheetBridge }, _optional = {}): StorageSheetState {
  const [view, setView] = useState<DesktopStorageView | null>(null);
  const [pending, setPending] = useState<ReadyStoragePreview | null>(null);
  const [result, setResult] = useState<DesktopStorageActionResult | null>(null);
  const relist = useCallback(() => { bridge.list().then(setView, () => setView(null)); }, [bridge]);
  useEffect(relist, [relist]);
  const settle = (next: DesktopStorageActionResult) => { setResult(next); relist(); };
  return {
    view, pending, result,
    ask: ({ id, action }) => {
      setResult(null);
      bridge.preview({ id, action }).then((preview) => (preview.state === 'ready' ? setPending(preview) : settle({ state: 'relist' })), () => settle({ state: 'relist' }));
    },
    confirm: () => {
      if (!pending) return;
      setPending(null);
      bridge.act({ confirmationId: pending.confirmationId }).then(settle, () => settle({ state: 'relist' }));
    },
    cancel: () => setPending(null),
  };
}

/** The Storage entry's slot, or none while dark. @complexity O(1). */
export function storageSheetSlot(
  { enabled, bridge }: { enabled: boolean; bridge: StorageSheetBridge | undefined },
  _optional: Record<string, never> = {},
): StorageSheetSlot | undefined {
  if (!enabled || !bridge) return undefined;
  return { useStorageSheet: () => useStorageSheetBridge({ bridge }), copy: STORAGE_SHEET_COPY, components: { Button: StorageButton } };
}
