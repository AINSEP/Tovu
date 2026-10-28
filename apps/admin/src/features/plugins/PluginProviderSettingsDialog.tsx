import { agentHandle } from "@jini-ai/agentic";
import { Button, Dialog } from "@jini-ai/ui-kit/react";
import { interpolate } from "@jini-ai/ui/panel-kit";
import { useEffect, useId } from "react";

import type { AdminPlugin, AdminPluginProviderSettings } from "@/lib/api";
import { useWiredPluginProviderSettings } from "./hooks/use-plugin-provider-settings.hooks";
import { ProviderSettingField } from "./PluginProviderSettingField";
import { providerSettingRequiredHere } from "./rules";
import "../../styles/native-domain-dialogs.css";
import "./provider-settings-dialog.css";

/**
 * @file A provider plugin's secure settings card (2026-10-26): Plugins → Installed (or Downloaded) →
 * the plugin's Settings button. Every field comes from the plugin's manifest; secret fields are
 * password inputs that never show a saved value ("Saved — leave blank to keep"). Saved values are
 * sealed on the server (the project store visible to attached sites, or this site's vault) and
 * apply now.
 *
 * 2026-10-25 redesign (owner: "looks awful"): the admin's native domain dialog (`PostUrlDialog`'s
 * Jini `Dialog` + `.jini-dialog-body`/`.jini-dialog-footer`) with the `.field` primitives — label
 * above a full-width control, hint below — instead of bare inline labels. Titled "<Name> settings";
 * a successful Save hands off to `onSaved` (the screen closes the card and shows a toast), so the
 * outcome is never a small line inside a card the owner is about to dismiss.
 */

export interface PluginProviderSettingsDialogProps {
  readonly plugin: Pick<AdminPlugin, "id" | "name">;
  readonly agentHandleBase: string;
  readonly onClose: () => void;
  /** After the server accepted the values; the screen closes the card and confirms with a notice. */
  readonly onSaved: () => void;
  /** Injectable seam for tests. Defaults to the real {@link useWiredPluginProviderSettings}. */
  readonly useSettings?: typeof useWiredPluginProviderSettings;
}

/** Field names are manifest keys (`apiKey`); agent handles allow only lowercase words joined by hyphens. */
function handleWords(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** The card's re-entry notices (a key saved the retired way, or saved keys this machine can't open). */
function ReentryNotices({ card, t }: { card: AdminPluginProviderSettings | null; t: (key: string) => string }) {
  return (
    <>
      {card?.unreadable ? <p className="provider-settings-notice" role="note">{t("Saved keys for this plugin can't be read on this machine. Enter them again here and save.")}</p> : null}
      {card?.legacyCredential ? <p className="provider-settings-notice" role="note">{t("A key for this plugin was saved in an older format that Tovu no longer reads. Enter it again here and save.")}</p> : null}
    </>
  );
}

/** Cancel and Save; disabled with a spinner while saving. */
function SettingsFooter({ shown, saving, pluginName, agentHandleBase, onClose, t }: { shown: boolean; saving: boolean; pluginName: string; agentHandleBase: string; onClose: () => void; t: (key: string) => string }) {
  return (
    <div className="jini-dialog-footer">
      <Button variant="secondary" className="btn-secondary" disabled={saving} onPress={() => onClose()}
        attrs={agentHandle({ handle: `${agentHandleBase}-settings-close` }, { role: "button", label: `Close ${pluginName} settings` })}>
        {t("Cancel")}
      </Button>
      <Button type="submit" variant="primary" className="provider-settings-save" disabled={!shown} pending={saving}
        attrs={agentHandle({ handle: `${agentHandleBase}-settings-save` }, { role: "button", label: `Save ${pluginName} settings` })}>
        {saving ? <><span className="provider-settings-spinner" aria-hidden="true" />{t("Saving…")}</> : t("Save")}
      </Button>
    </div>
  );
}

function SettingsSubtitle({ card, t }: { card: AdminPluginProviderSettings | null; t: (key: string) => string }) {
  if (!card) return null;
  return <p className="provider-settings-subtitle">{card.store === "project" ? card.usedBy.length ? interpolate({ template: t("Used by {sites}"), vars: { sites: card.usedBy.join(", ") } }) : t("Saved to your project — not used by any site yet") : t(card.projectAvailable ? "Saved for this site only" : "Saved for this site")}</p>;
}

function useProviderSettingsFocus({ card, fieldId }: { card: AdminPluginProviderSettings | null; fieldId: string }, _options = {}) {
  // The native dialog focuses on open, before the card has loaded; once it has, start in its first field.
  const firstField = card?.fields[0]?.name;
  useEffect(() => { if (firstField) document.getElementById(`${fieldId}-${firstField}`)?.focus(); }, [fieldId, firstField]);
}

export function PluginProviderSettingsDialog({ plugin, agentHandleBase, onClose, onSaved, useSettings = useWiredPluginProviderSettings }: PluginProviderSettingsDialogProps) {
  const { card, values, setValue, save, useSavedKey, saving, error, t } = useSettings(plugin.id);
  const fieldId = useId();
  const fields = card?.fields ?? [];
  // Presence only: a saved alternate secret satisfies the same manifest rule as an entered value.
  const effectiveValues = Object.fromEntries(fields.map(field => [field.name,
    values[field.name]?.trim() || (field.secret && field.saved ? "saved" : field.default ?? "")]));
  useProviderSettingsFocus({ card, fieldId });
  return (
    <Dialog open title={interpolate({ template: t("{name} settings"), vars: { name: plugin.name } })} pending={saving} onClose={() => onClose()} className="settings-dialog jini-domain-dialog provider-settings-dialog">
      <SettingsSubtitle card={card} t={t} />
      <form onSubmit={(event) => { event.preventDefault(); void save().then((accepted) => { if (accepted) onSaved(); }); }} noValidate>
        <div className="jini-dialog-body">
          <ReentryNotices card={card} t={t} />
          {card?.store === "project" && card.keyId && !card.usedByThisSite ? <Button variant="secondary" disabled={saving}
            onPress={() => { void useSavedKey().then(accepted => { if (accepted) onSaved(); }); }}>
            {t("Use the saved key for this site")}
          </Button> : null}
          {fields.map((field) => (
            <ProviderSettingField key={field.name} field={{ ...field, required: providerSettingRequiredHere({ field, fields, entered: values, values: effectiveValues }) }} id={`${fieldId}-${field.name}`} value={values[field.name] ?? ""}
              onChange={(value) => setValue(field.name, value)} handle={`${agentHandleBase}-setting-${handleWords(field.name)}`} pluginName={plugin.name} t={t} />
          ))}
        </div>
        {error ? <p className="save-error" role="alert">{error}</p> : null}
        <SettingsFooter shown={card !== null} saving={saving} pluginName={plugin.name} agentHandleBase={agentHandleBase} onClose={onClose} t={t} />
      </form>
    </Dialog>
  );
}
