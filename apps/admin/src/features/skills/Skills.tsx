import { SettingsDialogShell, type SettingsDialogTab } from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { SkillInstallConfirmation } from "./SkillInstallConfirmation";
import { SkillRemoveConfirmDialog } from "./SkillRemoveConfirmDialog";
import { SkillRow } from "./SkillRow";
import { SkillDocumentIcon } from "./skills-visuals";
import { SKILL_FILE_ACCEPT, useSkills, type SkillsController } from "./use-skills.hooks";
import { PackageFilesModal } from "../plugins/PackageFilesModal";
import { InstallTabCard, InstallTabFieldRow, InstallTabOption } from "../../components/InstallTabCard/InstallTabCard";
import { useSkillFilesModal } from "./use-skill-files.hooks";
import "./skills.css";

/** Installed rows and their loading/empty states share the default Skills tab. */
function InstalledSkillsPanel({ controller }: { controller: SkillsController }) {
  return (
    <>
      {controller.loading ? <div className="notice" role="status">Loading skills…</div> : null}
      {controller.empty ? (
        <div className="card">
          <div className="empty-state" role="status">
            <p>No skills installed yet</p>
            <p className="page-description">Add a GitHub skill or upload files to get started.</p>
            <button type="button" className="btn-primary" onClick={controller.onShowAdd}>Add a skill</button>
          </div>
        </div>
      ) : null}
      {controller.rows.length > 0 ? (
        <ul className="agent-plugin-rows" aria-label="Installed skills">
          {controller.rows.map(row => <SkillRow key={row.skill.toolId} row={row} />)}
        </ul>
      ) : null}
    </>
  );
}

/** Install inputs keep their values and pending confirmation in the page controller. */
function AddSkillPanel({ controller }: { controller: SkillsController }) {
  return (
    <InstallTabCard titleId="skills-add-title" title="Add a skill">
      <InstallTabOption>
        <InstallTabFieldRow
          inputId="skills-github-url"
          label="GitHub URL"
          value={controller.githubUrl}
          onChange={controller.onGithubUrlChange}
          placeholder="https://github.com/owner/skill"
          onSubmit={controller.onSubmitGithub}
          action={{ label: "Add from GitHub", disabled: controller.githubDisabled, primary: true }}
        />
        <div className="editor-actions">
          <button type="button" className="btn-secondary" disabled={controller.addBusy} onClick={controller.onChooseFiles}>Upload files</button>
          <button type="button" className="btn-secondary" disabled={controller.addBusy} onClick={controller.onChooseFolder}>Upload folder</button>
        </div>
      </InstallTabOption>
      <input ref={controller.filesInput} className="skills-file-input" type="file" aria-label="Choose skill files" multiple accept={SKILL_FILE_ACCEPT} onChange={controller.onFilesChange} hidden />
      <input ref={controller.folderInput} className="skills-file-input" type="file" aria-label="Choose skill folder" multiple {...{ webkitdirectory: "" }} onChange={controller.onFilesChange} hidden />
    </InstallTabCard>
  );
}

/** Agent Plugins' shared tab shell; navigation and installation behavior live in hooks. */
export function Skills() {
  const controller = useSkills();
  const filesModal = useSkillFilesModal(controller.inspecting, controller.onCloseFiles);
  const tabs: SettingsDialogTab[] = [
    { id: "skills", label: "Skills", icon: <SkillDocumentIcon />, title: "Skills", subtitle: "Instructions for your assistant. Type /sk in chat to use one.", panel: <InstalledSkillsPanel controller={controller} /> },
    { id: "add", label: "Add a skill", title: "Skills", subtitle: "Instructions for your assistant. Type /sk in chat to use one.", panel: <AddSkillPanel controller={controller} /> },
  ];
  return (
    <section className="page skills-page settings-ui-section" data-theme="light" aria-label="Skills">
      <SettingsDialogShell
        tabs={tabs}
        activeTabId={controller.activeTabId}
        onActiveTabIdChange={controller.onTabChange}
        presentation="inline"
        className="jini-tabbed-dialog--inline"
        fullscreenEnabled={false}
        dialogAriaLabelledBy="skills-page-title"
        labels={{ kicker: "Add-Ons", sidebarAriaLabel: "Skills sections" }}
      />
      <SkillInstallConfirmation install={controller.install} />
      {controller.error ? <div className="notice error" role="alert">{controller.error}</div> : null}
      {controller.removing ? <SkillRemoveConfirmDialog controller={controller} /> : null}
      {filesModal ? <PackageFilesModal {...filesModal} /> : null}
      <p className="field-hint">Skills work with Claude Code, Codex and BYOK. Aider, Gemini CLI and Pi can't use them.</p>
    </section>
  );
}
