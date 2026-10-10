/**
 * The post and page editors' Save button when nothing changed (owner, 2026-10-10): Save is never
 * disabled, in case a real change wasn't picked up. With changes it saves; with none it opens the
 * "Nothing changed. Save anyway?" warning, whose "Save anyway" closes it and saves anyway. The server
 * skips the write when the content really is identical and answers with the same version.
 *
 * @complexity O(1) — three closures, one branch.
 */
export function unchangedSaveHandlers(
  required: { dirty: boolean; save: () => Promise<void>; setConfirmingUnchangedSave: (open: boolean) => void },
  _optional: Record<string, never> = {}
): { onSave: () => void; onUnchangedSaveConfirm: () => void; onUnchangedSaveCancel: () => void } {
  const { dirty, save, setConfirmingUnchangedSave } = required;
  return {
    onSave: () => (dirty ? void save() : setConfirmingUnchangedSave(true)),
    onUnchangedSaveConfirm: () => {
      setConfirmingUnchangedSave(false);
      void save();
    },
    onUnchangedSaveCancel: () => setConfirmingUnchangedSave(false),
  };
}
