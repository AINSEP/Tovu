import { agentHandle } from "@jini-ai/agentic";

import { UploadIcon } from "./agent-plugins-visuals";
import type { AgentPluginInstallController } from "./hooks/use-agent-plugin-install.hooks";
import "./agent-plugin-install.css";

/**
 * The Agent Plugins "Add a plugin" tab: upload one `.zip` (drop or pick), installed switched off.
 * "From a URL" is shown disabled as Coming soon: the server has no fetch-and-install route yet, so
 * a working-looking field would be one the operator tries and fails. State lives in
 * `use-agent-plugin-install.hooks.ts`.
 */
export function AddAgentPluginPanel({ controller: c }: { controller: AgentPluginInstallController }) {
  const { t } = c;
  return (
    <section className="jini-settings-section agent-plugin-add" aria-label={t("Add a plugin")}>
      <p className="agent-plugins-lede">{t("Install an Agent Plugin package from a .zip. New plugins stay off until you switch them on in Installed.")}</p>

      <div className="agent-plugin-add-option">
        <h3>{t("Upload a .zip")}</h3>
        <div
          className={`agent-plugin-dropzone${c.dragging ? " is-dragging" : ""}`}
          onDragOver={c.onDragOver}
          onDragLeave={c.onDragLeave}
          onDrop={c.onDrop}
          aria-busy={c.busy}
        >
          <span className="agent-plugin-dropzone-glyph">
            <UploadIcon size={24} />
          </span>
          <p className="agent-plugin-dropzone-title">{c.file ? c.file.name : t("Drop a .zip here")}</p>
          <p className="jini-field-hint">{c.file ? c.fileSizeLabel : t("An agent-plugins.org package with plugin.json at its top. Up to 32 MiB.")}</p>
          <button
            type="button"
            className="btn-secondary"
            disabled={c.busy}
            onClick={c.onChooseFile}
            {...agentHandle({ handle: "agent-plugin-add-choose" }, { role: "button", label: "Choose an Agent Plugin .zip" })}
          >
            {t("Choose a file")}
          </button>
        </div>
        <input ref={c.inputRef} type="file" accept=".zip,application/zip" hidden aria-label={t("Upload a .zip")} onChange={c.onFileChange} />
        {c.error ? (
          <p className="agent-plugins-alert" role="alert">
            {c.error}
          </p>
        ) : null}
        {c.installedMessage ? (
          <p className="agent-plugin-add-success" role="status">
            {c.installedMessage}
          </p>
        ) : null}
        <div className="agent-plugin-add-actions">
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
      </div>

      <div className="agent-plugin-add-option is-soon">
        <h3>
          {t("From a URL")} <span className="agent-plugin-soon-badge">{t("Coming soon")}</span>
        </h3>
        <p className="jini-field-hint">{t("Install from a GitHub repository or a .zip link.")}</p>
        <div className="agent-plugin-url-controls">
          <input type="url" disabled placeholder="https://github.com/owner/plugin" aria-label={t("Plugin URL")} />
          <button type="button" className="btn-secondary" disabled>
            {t("Add from URL")}
          </button>
        </div>
      </div>
    </section>
  );
}
