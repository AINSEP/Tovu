import { useAdminThemeBoundary } from "../../admin-themes/use-admin-theme.hooks";
import { agentHandle } from "@jini-ai/agentic";
import { SettingsDialogShell, type SettingsDialogTab } from "@jini-ai/ui";
import { ErrorNotice, type Translate } from "@jini-ai/ui/panel-kit";
import { useCallback } from "react";
import { t as translateSkills } from "./skills-i18n";
import "@jini-ai/ui/settings-dialog.css";
import { SkillInstallConfirmation } from "./SkillInstallConfirmation";
import { SkillRemoveConfirmDialog } from "./SkillRemoveConfirmDialog";
import { SkillRow } from "./SkillRow";
import { SkillDocumentIcon } from "./skills-visuals";
import { SKILL_FILE_ACCEPT, useSkills, type SkillsController } from "./use-skills.hooks";
import { PackageFilesModal } from "../plugins/PackageFilesModal";
import { InstallTabCard, InstallTabFieldRow, InstallTabOption } from "../../components/InstallTabCard/InstallTabCard";
import { useSkillFilesModal } from "./use-skill-files.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import "./skills.css";

/** Installed rows and their loading/empty states share the default Skills tab. */
function InstalledSkillsPanel({ controller, t }: { controller: SkillsController; t: Translate }) {
  return (
    <>
      {controller.loading ? <div className="notice" role="status">{t("Loading skills…")}</div> : null}
      {controller.empty ? (
        <div className="card">
          <div className="empty-state" role="status">
            <p>{t("No skills installed yet")}</p>
            <p className="page-description">{t("Add a GitHub skill or upload files to get started.")}</p>
            <button type="button" className="btn-primary" onClick={controller.onShowAdd}>{t("Add a skill")}</button>
          </div>
        </div>
      ) : null}
      {controller.rows.length > 0 ? (
        <ul className="agent-plugin-rows" aria-label={t("Installed skills")}>
          {controller.rows.map(row => <SkillRow key={row.skill.toolId} row={row} t={t} />)}
        </ul>
      ) : null}
    </>
  );
}

/** Install inputs keep their values and pending confirmation in the page controller. */
function AddSkillPanel({ controller, t }: { controller: SkillsController; t: Translate }) {
  return (
    <InstallTabCard titleId="skills-add-title" title={t("Add a skill")}>
      <InstallTabOption>
        <InstallTabFieldRow
          inputProps={agentHandle({ handle: "skills-add-url-input" }, { role: "field", label: t("GitHub URL") })}
          actionProps={agentHandle({ handle: "skills-add-url" }, { role: "button", label: t("Add from GitHub") })}
          inputId="skills-github-url"
          label={t("GitHub URL")}
          value={controller.githubUrl}
          onChange={controller.onGithubUrlChange}
          placeholder="https://github.com/owner/skill"
          onSubmit={controller.onSubmitGithub}
          action={{ label: t("Add from GitHub"), disabled: controller.githubDisabled, primary: true }}
        />
        <div className="editor-actions">
          <button type="button" className="btn-secondary" disabled={controller.addBusy} onClick={controller.onChooseFiles} {...agentHandle({ handle: "skills-add-files" }, { role: "button", label: t("Upload files") })}>{t("Upload files")}</button>
          <button type="button" className="btn-secondary" disabled={controller.addBusy} onClick={controller.onChooseFolder} {...agentHandle({ handle: "skills-add-folder" }, { role: "button", label: t("Upload folder") })}>{t("Upload folder")}</button>
        </div>
      </InstallTabOption>
      <input ref={controller.filesInput} {...agentHandle({ handle: "skills-add-files-input" }, { role: "field", label: t("Choose skill files") })} className="skills-file-input" type="file" aria-label={t("Choose skill files")} multiple accept={SKILL_FILE_ACCEPT} onChange={controller.onFilesChange} hidden />
      <input ref={controller.folderInput} {...agentHandle({ handle: "skills-add-folder-input" }, { role: "field", label: t("Choose skill folder") })} className="skills-file-input" type="file" aria-label={t("Choose skill folder")} multiple {...{ webkitdirectory: "" }} onChange={controller.onFilesChange} hidden />
    </InstallTabCard>
  );
}

/** Agent Plugins' shared tab shell; navigation and installation behavior live in hooks. */
export function Skills({ useSkillsHook = useSkills, useLocaleHook = useAdminLocale }: {
  useSkillsHook?: typeof useSkills; useLocaleHook?: typeof useAdminLocale;
} = {}) {
  const themeBoundary = useAdminThemeBoundary({}, {});
  const locale = useLocaleHook();
  const t = useCallback((key: string) => translateSkills({ locale, key }), [locale]);
  const controller = useSkillsHook({ t });
  const filesModal = useSkillFilesModal(controller.inspecting, controller.onCloseFiles, { t });
  const tabs: SettingsDialogTab[] = [
    { id: "skills", label: t("Skills"), icon: <SkillDocumentIcon />, title: t("Skills"), subtitle: t("Instructions for your assistant. Type /sk in chat to use one."), panel: <InstalledSkillsPanel controller={controller} t={t} /> },
    { id: "add", label: t("Add a skill"), title: t("Skills"), subtitle: t("Instructions for your assistant. Type /sk in chat to use one."), panel: <AddSkillPanel controller={controller} t={t} /> },
  ];
  return (
    // Classic keeps its unverified-dark light pin; Glass follows the document scheme.
    <section className="page skills-page settings-ui-section" {...themeBoundary} aria-label={t("Skills")}>
      <SettingsDialogShell
        tabs={tabs}
        activeTabId={controller.activeTabId}
        onActiveTabIdChange={controller.onTabChange}
        presentation="inline"
        className="jini-tabbed-dialog--inline"
        fullscreenEnabled={false}
        dialogAriaLabelledBy="skills-page-title"
        labels={{ kicker: t("Add-Ons"), sidebarAriaLabel: t("Skills sections") }}
      />
      <SkillInstallConfirmation install={controller.install} locale={locale} />
      {controller.failure ? <ErrorNotice failure={controller.failure} t={t} /> : null}
      {controller.removing ? <SkillRemoveConfirmDialog controller={controller} t={t} /> : null}
      {filesModal ? <PackageFilesModal {...filesModal} /> : null}
      <p className="field-hint">{t("Skills work with Claude Code, Codex and BYOK. Aider, Gemini CLI and Pi can't use them.")}</p>
    </section>
  );
}
