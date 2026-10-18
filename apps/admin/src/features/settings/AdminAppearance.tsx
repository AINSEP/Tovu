import { ACCENT_SWATCHES, DEFAULT_ACCENT_COLOR, I18nProvider, resolveAccentColor, SETTINGS_DIALOG_DICTIONARIES, useT } from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { agentHandleProps, agentSubHandle, buildAgentListHandles } from "@jini-ai/agentic";
import type { AdminThemeDocumentEnv, AdminThemePort } from "../../admin-themes/use-admin-theme.hooks";
import { AdminThemeSchemeControl } from "../admin-themes";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { useAdminAppearanceSettings } from "./hooks/use-admin-appearance-settings.hooks";
import { describeSaveStatus } from "./rules";

/** Admin UI composes the compact scheme picker and Jini-backed accent fields.
 * @complexity O(1): a fixed palette; persistence stays in the existing controllers. */
export function AdminAppearance({ useAppearanceHook = useAdminAppearanceSettings, port, env }: {
  useAppearanceHook?: typeof useAdminAppearanceSettings;
  port?: AdminThemePort;
  env?: AdminThemeDocumentEnv;
} = {}) {
  const locale = useAdminLocale();
  const appearance = useAppearanceHook();
  if (!appearance.value) return <p role="status">Loading appearance…</p>;
  const value = appearance.value;
  return (
    <I18nProvider key={locale} initialLocale={locale} dictionaries={SETTINGS_DIALOG_DICTIONARIES} syncDocumentAttributes={false}>
      <div className="settings-ui-section" data-theme="light">
        {appearance.loadError ? <p role="alert">{appearance.loadError}</p> : null}
        <section className="jini-settings-section jini-settings-appearance">
          {/* The admin shell owns the document scheme. The compact picker persists the same
              core.appearance.theme value; accent preview stays in the existing settings slice. */}
          <AdminThemeSchemeControl port={port} env={env} />
          <AdminAccentFields accentColor={value.accentColor} onChange={(accentColor) => appearance.onChange({ ...value, accentColor })} />
        </section>
        <p className={`settings-ui-save is-${appearance.saveState.status}`} role={appearance.saveState.status === "error" ? "alert" : "status"}>
          {describeSaveStatus(appearance.saveState)}
        </p>
      </div>
    </I18nProvider>
  );
}

/** Host composition of Jini's exported palette/validation and native colour input. */
function AdminAccentFields({ accentColor, onChange }: { accentColor: string; onChange: (color: string) => void }) {
  const t = useT();
  const resolvedAccent = resolveAccentColor({ value: accentColor });
  const swatchHandles = buildAgentListHandles({ prefix: agentSubHandle({ base: "settings-appearance", action: "swatch" }), ids: ACCENT_SWATCHES });
  return (
    <div className="jini-field">
      <span className="jini-field-label">{t("Accent color")}</span>
      <div className="jini-accent-swatches" role="radiogroup" aria-label={t("Accent color")}>
        {ACCENT_SWATCHES.map((color, index) => {
          const label = color === DEFAULT_ACCENT_COLOR ? t("Default accent color") : color;
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-label={label}
              aria-checked={resolvedAccent === color}
              className={`jini-accent-swatch${resolvedAccent === color ? " active" : ""}`}
              style={{ background: color }}
              onClick={() => onChange(color)}
              {...agentHandleProps({}, { base: swatchHandles[index], role: "button", label })}
            />
          );
        })}
        <input
          type="color"
          aria-label={t("Custom accent color")}
          className="jini-accent-swatch-picker"
          value={resolvedAccent}
          onChange={(event) => onChange(event.target.value)}
          {...agentHandleProps({}, { base: "settings-appearance", action: "custom-accent", role: "field", label: t("Custom accent color") })}
        />
      </div>
    </div>
  );
}
