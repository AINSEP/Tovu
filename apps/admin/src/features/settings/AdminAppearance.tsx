import { ACCENT_SWATCHES, I18nProvider, resolveAccentColor, SETTINGS_DIALOG_DICTIONARIES, useT } from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { agentHandleProps, agentSubHandle, buildAgentListHandles } from "@jini-ai/agentic";
import type { AdminThemeDocumentEnv, AdminThemePort } from "../../admin-themes/use-admin-theme.hooks";
import { useAdminThemeBoundary, useAdminThemeState } from "../../admin-themes/use-admin-theme.hooks";
import { adminThemeAccentDefaults, findAdminTheme } from "../../admin-themes/registry";
import { adminThemeAccent, withAdminThemeAccent } from "../../lib/settings-tabs";
import { AdminThemeSchemeControl } from "../admin-themes";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { useAdminAppearanceSettings } from "./hooks/use-admin-appearance-settings.hooks";
import { describeSaveStatus } from "./rules";
import { t } from "./settings-i18n";

/** Admin UI composes the compact scheme picker and Jini-backed accent fields.
 * @complexity O(1): a fixed palette; persistence stays in the existing controllers. */
export function AdminAppearance({ useAppearanceHook = useAdminAppearanceSettings, port, env }: {
  useAppearanceHook?: typeof useAdminAppearanceSettings;
  port?: AdminThemePort;
  env?: AdminThemeDocumentEnv;
} = {}) {
  const locale = useAdminLocale();
  const root = env?.root ?? document.documentElement;
  const boundary = useAdminThemeBoundary({}, { root });
  const { themeId, scheme } = useAdminThemeState({}, { root });
  const appearance = useAppearanceHook({}, { root });
  // Loading precedes the dialog provider, so use the settings-shell translator here.
  if (!appearance.value) return <p role="status">{t({ locale, key: "Loading appearance…" })}</p>;
  const value = appearance.value;
  const preview = findAdminTheme({ id: themeId }).preview[scheme]!;
  return (
    <I18nProvider key={locale} initialLocale={locale} dictionaries={SETTINGS_DIALOG_DICTIONARIES} syncDocumentAttributes={false}>
      {/* Classic retains its unverified-dark light pin; Glass follows the document scheme. */}
      <div className="settings-ui-section" {...boundary}>
        {appearance.loadError ? <p role="alert">{appearance.loadError}</p> : null}
        <section className="jini-settings-section jini-settings-appearance">
          {/* The admin shell owns the document scheme. The compact picker persists the same
              core.appearance.theme value; accent preview stays in the existing settings slice. */}
          <AdminThemeSchemeControl port={port} env={env} />
          <AdminAccentFields accentColor={adminThemeAccent({ appearance: value, themeId }, {})} {...adminThemeAccentDefaults(preview)} onChange={(accentColor) => appearance.onChange(withAdminThemeAccent({ appearance: value, themeId, accentColor }, {}))} />
        </section>
        <p className={`settings-ui-save is-${appearance.saveState.status}`} role={appearance.saveState.status === "error" ? "alert" : "status"}>
          {describeSaveStatus(appearance.saveState)}
        </p>
      </div>
    </I18nProvider>
  );
}

/** Host composition of Jini's palette/validation. Default clears the override; CSS is preview-only. */
function AdminAccentFields({ accentColor, defaultAccent, defaultPickerAccent, onChange }: { accentColor: string | undefined; defaultAccent: string; defaultPickerAccent: string; onChange: (color: string | undefined) => void }) {
  const t = useT();
  const resolvedAccent = resolveAccentColor({ value: accentColor ?? defaultPickerAccent });
  const swatches = [...new Set([defaultAccent, ...ACCENT_SWATCHES])];
  const swatchHandles = buildAgentListHandles({ prefix: agentSubHandle({ base: "settings-appearance", action: "swatch" }), ids: swatches });
  return (
    <div className="jini-field">
      <span className="jini-field-label">{t("Accent color")}</span>
      <div className="jini-accent-swatches" role="radiogroup" aria-label={t("Accent color")}>
        {swatches.map((color, index) => {
          const label = color === defaultAccent ? t("Default accent color") : color;
          const selected = color === defaultAccent ? accentColor === undefined : accentColor !== undefined && resolvedAccent === color;
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-label={label}
              aria-checked={selected}
              className={`jini-accent-swatch${selected ? " active" : ""}`}
              style={{ background: color }}
              onClick={() => onChange(color === defaultAccent ? undefined : color)}
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
