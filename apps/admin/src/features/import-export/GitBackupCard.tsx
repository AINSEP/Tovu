import { agentHandle } from "@jini-ai/agentic";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { interpolate } from "@jini-ai/ui/panel-kit";
import type { GitBackupController } from "./hooks/use-git-backup.hooks";

/**
 * @file The Import & Export panel's Git backup card: commit this site to a private repository with
 * a saved Source Control connection. Markup only; every effect is in `use-git-backup.hooks.ts`, and
 * the server side is the same service as the assistant's `site_backup_plan`/`site_backup_push`.
 */

export const SOURCE_CONTROL_HREF = "/admin/source-control";

export interface GitBackupCardProps {
  controller: GitBackupController;
  t: Translate;
}

export function GitBackupCard({ controller, t }: GitBackupCardProps) {
  return (
    <section
      className="card import-export-card import-export-card-wide"
      aria-labelledby="import-export-git-backup-title"
      {...agentHandle({ handle: "import-export-git-backup-card" }, { role: "region", label: "Back up this site to a private Git repository" })}
    >
      <h2 id="import-export-git-backup-title" className="card-title">{t("Git backup")}</h2>
      <p className="card-lead">{t("Commit this site to a private Git repository.")}</p>
      <GitBackupBody controller={controller} t={t} />
    </section>
  );
}

function GitBackupBody({ controller, t }: GitBackupCardProps) {
  if (controller.connectionsError) return <div className="notice error" role="alert">{controller.connectionsError}</div>;
  if (!controller.connections) return <div className="notice">{t("Loading connections…")}</div>;
  if (controller.connections.length === 0) return <NoConnection t={t} />;
  if (controller.phase === "planned" || controller.phase === "pushing") return <PlanSummary controller={controller} t={t} />;
  if (controller.phase === "done") return <BackupDone controller={controller} t={t} />;
  if (controller.phase === "refused") return <BackupRefused controller={controller} t={t} />;
  return <GitBackupFormFields controller={controller} connections={controller.connections} t={t} />;
}

function NoConnection({ t }: { t: Translate }) {
  return (
    <>
      <p className="field-hint">{t("No Git connection yet.")}</p>
      <a className="btn-secondary" href={SOURCE_CONTROL_HREF} {...agentHandle({ handle: "import-export-git-backup-source-control-link" }, { role: "link", label: "Open Source Control to connect a Git host" })}>
        {t("Open Source Control")}
      </a>
    </>
  );
}

function GitBackupFormFields({ controller, connections, t }: GitBackupCardProps & { connections: string[] }) {
  const { form } = controller;
  const planning = controller.phase === "planning";
  return (
    <form className="field-group" onSubmit={(event) => { event.preventDefault(); void controller.planBackup(); }}>
      <div className="field-row">
        {connections.length > 1 ? (
          <div className="field">
            <label className="field-label" htmlFor="git-backup-connection">{t("Connection")}</label>
            <select id="git-backup-connection" value={form.connection} onChange={(event) => controller.setField("connection", event.target.value)}>
              {connections.map((label) => <option key={label} value={label}>{label}</option>)}
            </select>
          </div>
        ) : null}
        <TextField id="git-backup-owner" label={t("Owner")} value={form.owner} onChange={(value) => controller.setField("owner", value)} />
        <TextField id="git-backup-repo" label={t("Repository")} value={form.repo} onChange={(value) => controller.setField("repo", value)} />
        <TextField id="git-backup-branch" label={t("Branch")} placeholder={t("Default branch")} value={form.branch} onChange={(value) => controller.setField("branch", value)} />
      </div>
      {connections.length === 1 ? <p className="field-hint">{interpolate({ template: t("Uses {connection}."), vars: { connection: connections[0]! } })}</p> : null}
      <div>
        <button type="submit" className="btn-primary" disabled={!controller.canPlan} aria-busy={planning} {...agentHandle({ handle: "import-export-git-backup-plan" }, { role: "button", label: "Plan a Git backup of this site" })}>
          {planning ? t("Planning…") : t("Plan backup")}
        </button>
      </div>
    </form>
  );
}

function TextField({ id, label, value, placeholder, onChange }: { id: string; label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} type="text" autoComplete="off" spellCheck={false} maxLength={200} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function PlanSummary({ controller, t }: GitBackupCardProps) {
  const plan = controller.plan!;
  const pushing = controller.phase === "pushing";
  return (
    <>
      <ul className="git-backup-facts">
        <li><strong>{plan.repository}</strong> · {plan.branch}</li>
        <li>{interpolate({ template: t(plan.folderExists ? "Replaces folder {folder}." : "Creates folder {folder}."), vars: { folder: plan.folder } })}</li>
        <li>{interpolate({ template: t("{files} files, {size}"), vars: { files: String(plan.fileCount), size: plan.totalSize } })}</li>
        {plan.skipped.length > 0 ? <li>{interpolate({ template: t("{count} skipped"), vars: { count: String(plan.skipped.length) } })}</li> : null}
      </ul>
      {pushing && controller.progress ? (
        <p className="field-hint" role="status">{interpolate({ template: t("Uploaded {done} of {total} files…"), vars: { done: String(controller.progress.filesDone), total: String(controller.progress.filesTotal) } })}</p>
      ) : null}
      <div className="git-backup-actions">
        <button type="button" className="btn-primary" disabled={pushing} aria-busy={pushing} onClick={() => void controller.pushBackup()} {...agentHandle({ handle: "import-export-git-backup-push" }, { role: "button", label: "Push the planned Git backup" })}>
          {pushing ? t("Pushing…") : t("Push backup")}
        </button>
        {pushing ? null : <button type="button" className="btn-secondary" onClick={controller.reset}>{t("Cancel")}</button>}
      </div>
    </>
  );
}

function BackupDone({ controller, t }: GitBackupCardProps) {
  const done = controller.done!;
  return (
    <>
      <p role="status">{interpolate({ template: t("Backed up to {repository}."), vars: { repository: done.repository } })}</p>
      <div className="git-backup-actions">
        <a className="btn-secondary" href={done.commitUrl} target="_blank" rel="noopener noreferrer" {...agentHandle({ handle: "import-export-git-backup-commit-link" }, { role: "link", label: "Open the backup commit on the Git host" })}>
          {t("View commit")}
        </a>
        <button type="button" className="btn-secondary" onClick={controller.reset}>{t("Back up again")}</button>
      </div>
    </>
  );
}

function BackupRefused({ controller, t }: GitBackupCardProps) {
  return (
    <>
      <div className="notice error" role="alert">{controller.message}</div>
      <div className="git-backup-actions">
        <button type="button" className="btn-secondary" onClick={controller.reset}>{t("Try again")}</button>
      </div>
    </>
  );
}
