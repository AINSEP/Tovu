import type { SkillsController } from "./use-skills.hooks";

/** Mirrors PluginRemoveConfirmDialog with Skills' existing copy and busy guard. */
export function SkillRemoveConfirmDialog({ controller }: { controller: SkillsController }) {
  return (
    <div className="settings-dialog-backdrop" onClick={controller.onCancelRemove}>
      <div ref={controller.confirmation.dialogRef} className="settings-dialog skills-confirm-dialog" role="dialog" aria-modal="true" aria-label="Remove skill" aria-busy={controller.busy} onClick={controller.confirmation.onDialogClick}>
        <h2>Remove {controller.removing?.name}?</h2>
        {controller.error ? <p className="notice error" role="alert">{controller.error}</p> : null}
        <span className="editor-actions">
          <button type="button" className="btn-secondary" disabled={controller.busy} onClick={controller.onCancelRemove}>Cancel</button>
          <button type="button" className="btn-danger" disabled={controller.busy} onClick={controller.onConfirmRemove}>Confirm remove</button>
        </span>
      </div>
    </div>
  );
}
