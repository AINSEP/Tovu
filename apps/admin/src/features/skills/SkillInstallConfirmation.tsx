import type { useSkillInstall } from "./use-skill-install.hooks";
import { useSkillInstallConfirmation } from "./use-skill-confirmation.hooks";
import "./skills.css";

export function SkillInstallConfirmation({ install }: { install: ReturnType<typeof useSkillInstall> }) {
  const confirmation = useSkillInstallConfirmation(install);
  if (!install.pending) return install.error ? <p className="notice error" role="alert">{install.error}</p> : null;
  return (
    <div className="settings-dialog-backdrop" onClick={install.cancel}>
      <div ref={confirmation.dialogRef} className="settings-dialog skills-confirm-dialog" role="dialog" aria-modal="true" aria-label="Install skill" aria-busy={install.busy} onClick={confirmation.onDialogClick}>
        <h2>Install skill?</h2>
        <p className="skills-confirm-source">{confirmation.source}</p>
        <p>Review instructions from sources you trust. Installation runs no code.</p>
        {install.error ? <p className="notice error" role="alert">{install.error}</p> : null}
        <span className="editor-actions">
          <button type="button" className="btn-secondary" disabled={install.busy} onClick={install.cancel}>Cancel</button>
          <button type="button" className="btn-primary" disabled={install.busy} onClick={confirmation.onConfirm}>Confirm install</button>
        </span>
      </div>
    </div>
  );
}
