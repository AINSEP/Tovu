import classicManifest from "./classic/manifest.json";

/**
 * @file The installed admin themes (ADR-069). One list: the Admin Themes page renders a card per
 * entry and the document applier only ever sets an id found here.
 *
 * A new theme is a drop-in: add its folder (manifest.json + token-only admin.css/chat.css), import
 * its stylesheets in `styles.css` / `styles/assistant.css`, and add its manifest below. Its CSS
 * scopes every block under `:root[data-admin-theme="<id>"]` (plus `[data-theme="dark"]` for its
 * dark values). Tovu installs only its own themes; platform widget compatibility tokens live in
 * `styles/admin-theme-bridge.css`, independently of this registry.
 */

export type AdminThemeScheme = "light" | "dark";

/** The four colours a card's preview draws, plus the page behind them, per scheme. */
export interface AdminThemeSwatch {
  bg: string;
  surface: string;
  text: string;
  accent: string;
  border: string;
}

export interface AdminThemeManifest {
  id: string;
  name: string;
  schemes: readonly AdminThemeScheme[];
  stylesheets: { admin: string; chat: string };
  fonts: readonly { family: string; stylesheet: string }[];
  preview: Partial<Record<AdminThemeScheme, AdminThemeSwatch>>;
}

/** Classic is Tovu's default: what renders with no `data-admin-theme` on <html>. */
export const DEFAULT_ADMIN_THEME_ID = "classic";

export const ADMIN_THEMES: readonly AdminThemeManifest[] = [
  classicManifest as AdminThemeManifest,
];

/** An unknown id (a theme since removed) falls back to classic rather than matching no theme. */
export function findAdminTheme(
  { id }: { id: string },
  { themes = ADMIN_THEMES }: { themes?: readonly AdminThemeManifest[] } = {},
): AdminThemeManifest {
  return themes.find((theme) => theme.id === id) ?? themes.find((theme) => theme.id === DEFAULT_ADMIN_THEME_ID) ?? themes[0]!;
}

/** The scheme to render: the operator's choice when the theme has it, else the theme's first. */
export function resolveAdminThemeScheme(
  { theme, scheme }: { theme: AdminThemeManifest; scheme: AdminThemeScheme },
  _optional: object,
): AdminThemeScheme {
  return theme.schemes.includes(scheme) ? scheme : theme.schemes[0] ?? "light";
}
