import type { CSSProperties } from "react";
import type { SettingsThemeChoice } from "@jini-ai/ui";
import { interpolate } from "@jini-ai/ui/panel-kit";
import { agentHandle } from "@jini-ai/agentic";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { resolveAdminThemeDocument } from "../../admin-themes/apply";
import { ADMIN_THEMES, findAdminTheme, type AdminThemeManifest, type AdminThemeScheme } from "../../admin-themes/registry";
import { useAdminThemePicker, type AdminThemeDocumentEnv, type AdminThemePort } from "../../admin-themes/use-admin-theme.hooks";
import { t } from "./admin-themes-i18n";
import "./admin-themes.css";

/**
 * @file Admin UI theme cards and its Appearance tab's compact scheme control.
 * A click repaints the admin at once; the choice is
 * saved per operator. Site (public) themes are a separate screen and are never touched here.
 */

const SCHEME_OPTIONS: readonly { value: SettingsThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** "system" needs both schemes; an explicit scheme needs that one. */
export function schemeOptionAvailable({ theme, value }: { theme: AdminThemeManifest; value: SettingsThemeChoice }, _optional: object): boolean {
  return value === "system" ? theme.schemes.includes("light") && theme.schemes.includes("dark") : theme.schemes.includes(value);
}

/** Card previews resolve "system" against the same media port the picker paints with: the injected
 *  `env`'s when one is given, otherwise the browser's. No `typeof window` guard: without `env` the
 *  picker already reads `document.documentElement` during this same render, so a window-less
 *  (non-browser) render never gets this far. */
function previewMatchMedia(env: AdminThemeDocumentEnv | undefined) {
  if (env) return env.matchMedia;
  return typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : undefined;
}

function ThemeSwatch({ theme, scheme }: { theme: AdminThemeManifest; scheme: AdminThemeScheme }) {
  const swatch = theme.preview[scheme] ?? theme.preview[theme.schemes[0] ?? "light"];
  if (!swatch) return null;
  const style = {
    "--swatch-bg": swatch.bg,
    "--swatch-surface": swatch.surface,
    "--swatch-text": swatch.text,
    "--swatch-accent": swatch.accent,
    "--swatch-border": swatch.border,
  } as CSSProperties;
  return (
    <span className="admin-theme-swatch" style={style} aria-hidden="true" data-scheme={scheme}>
      <span className="admin-theme-swatch-rail" />
      <span className="admin-theme-swatch-panel">
        <span className="admin-theme-swatch-line" />
        <span className="admin-theme-swatch-line is-short" />
        <span className="admin-theme-swatch-accent" />
      </span>
    </span>
  );
}

/** Appearance reuses the picker so scheme preview, persistence and rollback have one owner. */
export function AdminThemeSchemeControl({ port, env }: { port?: AdminThemePort; env?: AdminThemeDocumentEnv } = {}) {
  const locale = useAdminLocale();
  const picker = useAdminThemePicker({}, { port, env });
  const activeTheme = findAdminTheme({ id: picker.themeId ?? "" });
  return (
    <div className="jini-field">
      <span className="jini-field-label">{t({ locale, key: "Color scheme" })}</span>
      <div className="segmented admin-themes-scheme" role="radiogroup" aria-label={t({ locale, key: "Color scheme" })}>
        {SCHEME_OPTIONS.map((option) => {
          const checked = picker.preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              className={checked ? "is-active" : undefined}
              disabled={!picker.ready || !schemeOptionAvailable({ theme: activeTheme, value: option.value }, {})}
              onClick={() => picker.selectPreference(option.value)}
              {...agentHandle({ handle: `admin-themes-scheme-${option.value}` }, { role: "button", label: `${option.label} color scheme` })}
            >
              {t({ locale, key: option.label })}
            </button>
          );
        })}
      </div>
      {picker.error ? (
        <p className="form-error" role="alert">
          {interpolate({ template: t({ locale, key: "Couldn't save the theme: {error}" }), vars: { error: picker.error } })}
        </p>
      ) : null}
    </div>
  );
}

/** `themes` defaults to the installed registry; a host (or test) can pass its own manifests. */
export function AdminThemes({ port, env, themes = ADMIN_THEMES }: { port?: AdminThemePort; env?: AdminThemeDocumentEnv; themes?: readonly AdminThemeManifest[] } = {}) {
  const locale = useAdminLocale();
  const picker = useAdminThemePicker({}, { port, env });
  const activeTheme = findAdminTheme({ id: picker.themeId ?? "" }, { themes });
  const matchMedia = previewMatchMedia(env);
  return (
    <div className="page admin-themes-page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t({ locale, key: "Studio" })}</p>
          <h1 className="page-title">{t({ locale, key: "Admin Themes" })}</h1>
          <p className="page-description">{t({ locale, key: "How the admin looks to you." })}</p>
        </div>
      </div>
      {picker.error ? (
        <p className="form-error" role="alert">
          {interpolate({ template: t({ locale, key: "Couldn't save the theme: {error}" }), vars: { error: picker.error } })}
        </p>
      ) : null}
      <div className="theme-grid admin-themes-grid" role="radiogroup" aria-label={t({ locale, key: "Admin Themes" })}>
        {themes.map((theme) => {
          const active = picker.ready && theme.id === activeTheme.id;
          const { scheme } = resolveAdminThemeDocument({ choice: { themeId: theme.id, preference: picker.preference ?? "light" } }, { matchMedia, themes });
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!picker.ready}
              className={`theme-card admin-theme-card${active ? " active" : ""}`}
              onClick={() => picker.selectTheme(theme.id)}
              {...agentHandle({ handle: `admin-themes-card-${theme.id}` }, { role: "button", label: `${theme.name} admin theme` })}
            >
              <ThemeSwatch theme={theme} scheme={scheme} />
              <span className="admin-theme-card-title">
                <span className="admin-theme-card-name">{theme.name}</span>
                {active ? <span className="admin-theme-card-badge">{t({ locale, key: "Active" })}</span> : null}
              </span>
              <span className="admin-theme-card-schemes">{theme.schemes.map((value) => t({ locale, key: value === "dark" ? "Dark" : "Light" })).join(" · ")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
