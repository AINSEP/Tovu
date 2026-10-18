import type { SettingsThemeChoice } from "@jini-ai/ui";
import { resolveColorScheme, type MatchMediaPort } from "@jini-ai/ui/theme";
import { ADMIN_THEMES, findAdminTheme, resolveAdminThemeScheme, type AdminThemeManifest, type AdminThemeScheme } from "./registry";

/**
 * @file Puts the operator's admin theme on <html>. Themes are token-only CSS scoped by attribute
 * (ADR-069), so switching is three attribute writes and never a reload:
 *
 * - `data-admin-theme="<id>"` picks the theme's custom-property blocks.
 * - `data-color-scheme` is the canonical scheme (Jini's contract flips on it).
 * - `data-theme="dark"` keeps classic's `:root[data-theme="dark"]` values and Tovu's structural
 *   dark rules working. It is REMOVED for light rather than set to "light": `[data-theme="light"]`
 *   is the per-screen light pin (`SettingsUi.tsx`, the chat dock) and re-declares tokens wherever
 *   it matches, so writing it on <html> would repaint the whole admin.
 *
 * The same choice is remembered in localStorage for `index.html`'s inline bootstrap, which applies
 * it before first paint so a reload never flashes classic first. The settings ledger stays the
 * source of truth; the stored copy is only that pre-paint hint.
 */

/** Read by the inline script in `index.html` — keep both spellings identical. */
export const ADMIN_THEME_STORAGE_KEY = "tovu.adminTheme";

export interface AdminThemeChoice {
  themeId: string;
  /** Appearance's `theme` setting: an explicit scheme or "system". */
  preference: SettingsThemeChoice;
}

export interface AdminThemeDocumentState {
  themeId: string;
  scheme: AdminThemeScheme;
}

export interface AdminThemeStoragePort {
  setItem(key: string, value: string): void;
}

/** The ids and scheme actually rendered: unknown ids fall back, unsupported schemes snap. */
export function resolveAdminThemeDocument(
  { choice }: { choice: AdminThemeChoice },
  { matchMedia, themes = ADMIN_THEMES }: { matchMedia?: MatchMediaPort; themes?: readonly AdminThemeManifest[] } = {},
): AdminThemeDocumentState {
  const theme = findAdminTheme({ id: choice.themeId }, { themes });
  // Without a media port (non-browser), "system" reads as light, the admin's default scheme.
  const wanted = choice.preference === "system" && !matchMedia ? "light" : resolveColorScheme({ preference: choice.preference }, { matchMedia });
  return { themeId: theme.id, scheme: resolveAdminThemeScheme({ theme, scheme: wanted }, {}) };
}

export function applyAdminThemeToDocument({ state }: { state: AdminThemeDocumentState }, { root }: { root: HTMLElement }): void {
  root.setAttribute("data-admin-theme", state.themeId);
  root.setAttribute("data-color-scheme", state.scheme);
  if (state.scheme === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
}

/** Best effort: private windows and blocked storage just lose the pre-paint hint. */
export function rememberAdminThemeChoice(
  { choice }: { choice: AdminThemeChoice },
  { storage, themes = ADMIN_THEMES }: { storage: AdminThemeStoragePort | undefined; themes?: readonly AdminThemeManifest[] },
): void {
  const theme = findAdminTheme({ id: choice.themeId }, { themes });
  try {
    storage?.setItem(ADMIN_THEME_STORAGE_KEY, JSON.stringify({ themeId: theme.id, preference: choice.preference, schemes: theme.schemes }));
  } catch {
    // Storage can throw (quota, disabled site data); the ledger still holds the choice.
  }
}
