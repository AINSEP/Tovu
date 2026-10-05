import { agentHandle } from "@jini-ai/agentic";
import type { PluginInstallController } from "./hooks/use-plugin-install.hooks";

/** All state, async work and consent invalidation live in the paired hook. */
export function InstallPluginDialog({ controller: c }: { controller: PluginInstallController }) {
  return (
    <div className="settings-dialog-backdrop">
      <div ref={c.dialogRef} className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="plugins-install-title" aria-busy={c.busy}>
        <h2 id="plugins-install-title">{c.t("Install plugin")}</h2>
        <label htmlFor="plugins-install-folder">{c.t("Folder on this server")}</label>
        <input id="plugins-install-folder" autoFocus value={c.folder} disabled={c.busy} onChange={(e) => c.setFolder(e.target.value)} {...agentHandle({ handle: "plugins-install-folder" }, { role: "field", label: c.t("Folder on this server") })} />
        <label htmlFor="plugins-install-zip">{c.t("Upload .zip (max 32 MiB)")}</label>
        <input ref={c.zipInputRef} id="plugins-install-zip" type="file" accept=".zip,application/zip" disabled={c.busy} onChange={(e) => c.setZipFile(e.target.files?.[0] ?? null)} {...agentHandle({ handle: "plugins-install-zip" }, { role: "field", label: c.t("Upload .zip (max 32 MiB)") })} />
        <label>
          <input type="checkbox" checked={c.replace} disabled={c.busy} onChange={(e) => c.setReplace(e.target.checked)} />
          {c.t("Replace existing version")}
        </label>
        {c.previewDisplay ? (
          <div>
            <h3>{c.previewDisplay.title}</h3>
            <p>{c.t("Version")}: {c.previewDisplay.version}</p>
            <p>{c.t("Tier")}: {c.previewDisplay.tier} · {c.t("Local plugin · unverified publisher")}</p>
            <p>{c.t("Capabilities")}: {c.previewDisplay.capabilities}</p>
            <p>{c.t("Hooks")}: {c.previewDisplay.hooks}</p>
            <p>{c.t("Content types")}: {c.previewDisplay.contentTypes}</p>
            <p>{c.previewDisplay.codeNotice}</p>
            <p>{c.t("It stays off in every workspace until you turn it on.")}</p>
            {c.previewDisplay.conflicts ? (
              <div className="plugin-errors">
                <span className="save-error">{c.previewDisplay.conflicts.heading}</span>
                <ul>
                  {c.previewDisplay.conflicts.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {c.error ? <p role="alert">{c.error}</p> : null}
        <span className="editor-actions">
          <button type="button" className="btn-secondary" disabled={c.busy} onClick={c.close}>{c.t("Cancel")}</button>
          {c.preview ? (
            <button type="button" disabled={c.busy} onClick={c.install} {...agentHandle({ handle: "plugins-install-confirm" }, { role: "button", label: c.t("Install (stays off)") })}>{c.t("Install (stays off)")}</button>
          ) : (
            <button type="button" disabled={c.reviewDisabled} onClick={c.review}>{c.t("Preview plugin")}</button>
          )}
        </span>
      </div>
    </div>
  );
}
