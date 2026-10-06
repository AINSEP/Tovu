import { agentHandle } from "@jini-ai/agentic";

import { InstallTabCard, InstallTabFieldRow, InstallTabOption, ZipDropZone } from "../../components/InstallTabCard/InstallTabCard";
import { UploadIcon } from "./agent-plugins-visuals";
import type { PluginInstallController } from "./hooks/use-plugin-install.hooks";

/**
 * The Plugins "Add a plugin" tab, on the shared `InstallTabCard` (owner, 2026-10-06 — replaces the
 * header "Install plugin" popup, whose raw file input and cramped layout "looks awful"). A server
 * folder OR one `.zip`, the replace option, then Preview: the trust review must be seen before
 * Install appears. All state, async work and consent invalidation live in `use-plugin-install.hooks.ts`.
 *
 * `canInstall` is the server's `installSources` answer: when local installs are switched off the
 * card says so instead of offering fields that would only be refused.
 */
export function AddPluginPanel({ controller: c, canInstall }: { controller: PluginInstallController; canInstall: boolean }) {
  const { t } = c;
  if (!canInstall) {
    return (
      <InstallTabCard titleId="plugins-add-title" title={t("Add a plugin")} lede={t("Local folder installs are disabled on this server.")}>
        <p className="field-hint">{t("Install a plugin by placing its files in this site's plugin install directory.")}</p>
      </InstallTabCard>
    );
  }
  return (
    <InstallTabCard titleId="plugins-add-title" title={t("Add a plugin")} lede={t("It stays off in every workspace until you turn it on.")}>
      <InstallTabOption>
        <InstallTabFieldRow
          inputId="plugins-install-folder"
          label={t("Folder on this server")}
          value={c.folder}
          disabled={c.busy}
          onChange={c.onFolderChange}
          placeholder="/path/to/plugin"
          onSubmit={c.onSubmitFolder}
          inputProps={agentHandle({ handle: "plugins-install-folder" }, { role: "field", label: t("Folder on this server") })}
        />
      </InstallTabOption>
      <InstallTabOption heading={t("Upload a .zip")}>
        <ZipDropZone
          drop={c.drop}
          glyph={<UploadIcon size={24} />}
          title={c.zipFile ? c.zipFile.name : t("Drop a .zip here")}
          hint={c.zipFile ? c.zipSizeLabel : t("Upload .zip (max 32 MiB)")}
          busy={c.busy}
          chooseLabel={t("Choose a file")}
          onChoose={c.onChooseZip}
          inputRef={c.zipInputRef}
          inputLabel={t("Upload .zip (max 32 MiB)")}
          onFileChange={c.onZipChange}
          chooseProps={agentHandle({ handle: "plugins-install-zip" }, { role: "button", label: "Choose a plugin .zip" })}
        />
      </InstallTabOption>
      <InstallTabOption>
        <label className="install-tab-check">
          <input type="checkbox" checked={c.replace} disabled={c.busy} onChange={c.onReplaceChange} />
          {t("Replace existing version")}
        </label>
        {c.previewDisplay ? <PluginInstallPreviewDetails controller={c} /> : null}
        {c.error ? <p className="install-tab-alert" role="alert">{c.error}</p> : null}
        {c.installedMessage ? <p className="install-tab-success" role="status">{c.installedMessage}</p> : null}
        <div className="install-tab-actions">
          {c.preview ? (
            <>
              <button type="button" className="btn-secondary" disabled={c.busy} onClick={c.cancelReview}>{t("Cancel")}</button>
              <button type="button" className="btn-primary" disabled={c.busy} onClick={c.install} {...agentHandle({ handle: "plugins-install-confirm" }, { role: "button", label: t("Install (stays off)") })}>{t("Install (stays off)")}</button>
            </>
          ) : (
            <button type="button" className="btn-primary" disabled={c.reviewDisabled} onClick={c.review} {...agentHandle({ handle: "plugins-install-preview" }, { role: "button", label: t("Preview plugin") })}>{t("Preview plugin")}</button>
          )}
        </div>
      </InstallTabOption>
    </InstallTabCard>
  );
}

/** The trust review shown after Preview: what the package is, what it may do, and any clashes. */
function PluginInstallPreviewDetails({ controller: c }: { controller: PluginInstallController }) {
  const { t } = c;
  const d = c.previewDisplay!;
  return (
    <div className="install-tab-review" aria-live="polite">
      <h3 className="install-tab-option-heading">{d.title}</h3>
      <p>{t("Version")}: {d.version}</p>
      <p>{t("Tier")}: {d.tier} · {t("Local plugin · unverified publisher")}</p>
      <p>{t("Capabilities")}: {d.capabilities}</p>
      <p>{t("Hooks")}: {d.hooks}</p>
      <p>{t("Content types")}: {d.contentTypes}</p>
      <p><strong>{d.codeNotice}</strong></p>
      <p>{t("It stays off in every workspace until you turn it on.")}</p>
      {d.conflicts ? (
        <div className="plugin-errors">
          <span className="save-error">{d.conflicts.heading}</span>
          <ul>
            {d.conflicts.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
