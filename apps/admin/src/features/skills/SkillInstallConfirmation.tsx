import { agentHandle } from "@jini-ai/agentic";
import type { useSkillInstall } from "./use-skill-install.hooks";
import { useSkillInstallConfirmation } from "./use-skill-confirmation.hooks";
import { t } from "./skills-i18n";
import { ErrorNotice } from "@jini-ai/ui/panel-kit";
import { skillFailure } from "./skill-failure";
import "./skills.css";

/** `locale` is the caller's admin locale (the dock and the Skills page each resolve one); English when omitted. */
export function SkillInstallConfirmation({ install, locale = "en" }: { install: ReturnType<typeof useSkillInstall>; locale?: string }) {
  const confirmation = useSkillInstallConfirmation(install);
  const tr = (key: string) => t({ locale, key });
  const failure = install.error ? skillFailure({ error: install.cause ?? new Error(install.error), message: install.error, t: tr }) : null;
  // A read failure has no confirmation dialog. Keep it in a compact, dismissible row;
  // a bare notice inherits the dock's flex: 1 rule and consumes half the transcript.
  if (!install.pending) return install.error ? (
    <div className="notice error skills-install-error" role="alert">
      {failure ? <ErrorNotice failure={failure} t={tr} role="status" className="skills-install-details" /> : null}
      <button type="button" className="btn-secondary" onClick={install.cancel} aria-label={tr("Dismiss")}>{tr("Dismiss")}</button>
    </div>
  ) : null;
  return (
    <div className="settings-dialog-backdrop" onClick={install.cancel}>
      <div ref={confirmation.dialogRef} className="settings-dialog skills-confirm-dialog" role="dialog" aria-modal="true" aria-label={tr("Install skill")} aria-busy={install.busy} onClick={confirmation.onDialogClick}>
        <h2>{tr("Install skill?")}</h2>
        <p className="skills-confirm-source">{tr(confirmation.source)}</p>
        <p>{tr("Review instructions from sources you trust. Installation runs no code.")}</p>
        {failure ? <ErrorNotice failure={failure} t={tr} /> : null}
        <span className="editor-actions">
          <button type="button" className="btn-secondary" disabled={install.busy} onClick={install.cancel} {...agentHandle({ handle: "skills-install-cancel" }, { role: "button", label: tr("Cancel") })}>{tr("Cancel")}</button>
          <button type="button" className="btn-primary" disabled={install.busy} onClick={confirmation.onConfirm} {...agentHandle({ handle: "skills-install-confirm" }, { role: "button", label: tr("Confirm install") })}>{tr("Confirm install")}</button>
        </span>
      </div>
    </div>
  );
}
