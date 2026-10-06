import { agentHandle } from "@jini-ai/agentic";

import { InstallTabCard, InstallTabFieldRow, InstallTabOption, ZipDropZone } from "../../components/InstallTabCard/InstallTabCard";
import { UploadIcon } from "./agent-plugins-visuals";
import type { AgentPluginInstallController } from "./hooks/use-agent-plugin-install.hooks";

/**
 * The Agent Plugins "Add a plugin" tab: upload one `.zip` (drop or pick) or a picked folder (zipped
 * in the browser), installed switched off.
 * "From a URL" is shown disabled as Coming soon: the server has no fetch-and-install route yet, so
 * a working-looking field would be one the operator tries and fails. State lives in
 * `use-agent-plugin-install.hooks.ts`; the card is the shared `InstallTabCard` Skills and Plugins
 * use too.
 */
export function AddAgentPluginPanel({ controller: c }: { controller: AgentPluginInstallController }) {
  const { t } = c;
  return (
    <InstallTabCard
      titleId="agent-plugin-add-title"
      title={t("Add a plugin")}
      lede={t("Install an Agent Plugin package from a .zip. New plugins stay off until you switch them on in Installed.")}
    >
      <InstallTabOption heading={t("Upload a .zip or a folder")}>
        <ZipDropZone
          drop={c.drop}
          glyph={<UploadIcon size={24} />}
          title={c.file ? c.file.name : t("Drop a .zip here")}
          hint={c.file ? c.fileSizeLabel : t("An agent-plugins.org package with plugin.json at its top. Up to 32 MiB.")}
          busy={c.busy}
          chooseLabel={t("Choose a file")}
          onChoose={c.onChooseFile}
          inputRef={c.inputRef}
          inputLabel={t("Upload a .zip")}
          onFileChange={c.onFileChange}
          chooseProps={agentHandle({ handle: "agent-plugin-add-choose" }, { role: "button", label: "Choose an Agent Plugin .zip" })}
          folder={{
            label: t("Choose a folder"),
            inputLabel: t("Choose a plugin folder"),
            onChoose: c.folderUpload.onChoose,
            inputRef: c.folderUpload.inputRef,
            onFilesChange: c.folderUpload.onChange,
            chooseProps: agentHandle({ handle: "agent-plugin-add-choose-folder" }, { role: "button", label: "Choose an Agent Plugin folder to upload" }),
          }}
        />
        {c.error ? (
          <p className="install-tab-alert" role="alert">
            {c.error}
          </p>
        ) : null}
        {c.installedMessage ? (
          <p className="install-tab-success" role="status">
            {c.installedMessage}
          </p>
        ) : null}
        <div className="install-tab-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={c.installDisabled}
            onClick={c.install}
            {...agentHandle({ handle: "agent-plugin-add-install" }, { role: "button", label: "Install the chosen Agent Plugin (stays off)" })}
          >
            {c.busy ? t("Installing…") : t("Install (stays off)")}
          </button>
        </div>
      </InstallTabOption>

      <InstallTabOption heading={t("From a URL")} badge={t("Coming soon")} hint={t("Install from a GitHub repository or a .zip link.")}>
        <InstallTabFieldRow
          inputId="agent-plugin-add-url"
          type="url"
          disabled
          placeholder="https://github.com/owner/plugin"
          inputProps={{ "aria-label": t("Plugin URL") }}
          action={{ label: t("Add from URL"), disabled: true }}
        />
      </InstallTabOption>
    </InstallTabCard>
  );
}
