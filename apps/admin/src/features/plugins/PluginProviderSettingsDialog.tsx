import { agentHandle } from "@jini-ai/agentic";
import { useId } from "react";

import type { AdminPlugin } from "@/lib/api";
import { useWiredPluginProviderSettings } from "./hooks/use-plugin-provider-settings.hooks";

/**
 * @file A provider plugin's secure settings card (2026-10-26): Plugins → Installed (or Downloaded) →
 * the plugin's Settings button. Every field comes from the plugin's manifest; secret fields are
 * password inputs that never show a saved value ("Saved — leave blank to keep"). Saved values are
 * sealed on the server (the project store shared by this machine's sites, or this site's vault) and
 * take effect at the next start.
 */

export interface PluginProviderSettingsDialogProps {
  readonly plugin: Pick<AdminPlugin, "id" | "name">;
  readonly agentHandleBase: string;
  readonly onClose: () => void;
  /** Injectable seam for tests. Defaults to the real {@link useWiredPluginProviderSettings}. */
  readonly useSettings?: typeof useWiredPluginProviderSettings;
}

export function PluginProviderSettingsDialog({ plugin, agentHandleBase, onClose, useSettings = useWiredPluginProviderSettings }: PluginProviderSettingsDialogProps) {
  const { card, values, setValue, save, saving, error, saved, t } = useSettings(plugin.id);
  const titleId = useId();
  const fieldId = useId();
  return (
    <div className="settings-dialog-backdrop" onClick={onClose}>
      <div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId}>{`${plugin.name} — ${t("Settings")}`}</h2>
        {card ? (
          <p>{card.store === "project" ? t("Saved for every site in this project. Takes effect the next time Tovu starts.") : t("Saved for this site. Takes effect the next time Tovu starts.")}</p>
        ) : null}
        {error ? <p className="save-error" role="alert">{error}</p> : null}
        {saved ? <p role="status">{t("Settings saved.")}</p> : null}
        <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
          {(card?.fields ?? []).map((field) => (
            <label key={field.name} htmlFor={`${fieldId}-${field.name}`} className="form-field">
              <span>{field.label}{field.required ? " *" : ""}</span>
              <input
                id={`${fieldId}-${field.name}`}
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                value={values[field.name] ?? ""}
                placeholder={field.secret && field.saved ? t("Saved — leave blank to keep") : field.hint ?? ""}
                onChange={(event) => setValue(field.name, event.target.value)}
                {...agentHandle({ handle: `${agentHandleBase}-setting-${field.name}` }, { role: "field", label: `${plugin.name} setting: ${field.label}` })}
              />
              {field.hint && !field.secret ? <small>{field.hint}</small> : null}
            </label>
          ))}
          <span className="editor-actions">
            <button type="button" className="btn-secondary" onClick={onClose}
              {...agentHandle({ handle: `${agentHandleBase}-settings-close` }, { role: "button", label: `Close ${plugin.name} settings` })}>
              {t("Close")}
            </button>
            <button type="submit" disabled={!card || saving}
              {...agentHandle({ handle: `${agentHandleBase}-settings-save` }, { role: "button", label: `Save ${plugin.name} settings` })}>
              {saving ? t("Saving…") : t("Save")}
            </button>
          </span>
        </form>
      </div>
    </div>
  );
}
