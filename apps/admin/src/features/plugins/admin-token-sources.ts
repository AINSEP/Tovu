import { type AdminSurfaceThemeToken } from "@jini-ai/agent-plugins/admin-surfaces";

/**
 * @file The admin's design tokens for plugin surfaces: which admin custom property each shared
 * `--jini-*` token is read from, the host's half of the surface theme bridge. The reading and watching live in
 * `@jini-ai/admin/screens/plugins/admin-surface-theme`, which takes this map as an argument.
 *
 * Why a map: the admin draws with its own names (`--fg`, `--primary`, `--r-sm`…), and an admin
 * theme may set those without touching the `--jini-*` names, so reading the Jini names alone would
 * give a surface colours the admin does not show. Tokens the admin has no name for are read under
 * their Jini name.
 */
export const ADMIN_TOKEN_SOURCES: Readonly<Partial<Record<AdminSurfaceThemeToken, string>>> = {
  "--jini-bg": "--surface",
  "--jini-surface": "--surface-2",
  "--jini-bg-subtle": "--surface-2",
  "--jini-text": "--fg",
  "--jini-text-muted": "--muted",
  "--jini-border": "--border",
  "--jini-border-strong": "--border-strong",
  "--jini-primary": "--primary",
  "--jini-primary-ink": "--primary-ink",
  "--jini-link": "--link",
  "--jini-danger": "--danger",
  "--jini-danger-bg": "--danger-bg",
  "--jini-warning": "--warning",
  "--jini-font-ui": "--font-ui",
  "--jini-font-mono": "--font-mono",
  "--jini-font-size-xs": "--text-xs",
  "--jini-font-size-sm": "--text-sm",
  "--jini-font-size-base": "--text-base",
  "--jini-font-size-md": "--text-md",
  "--jini-radius-sm": "--r-sm",
  "--jini-radius-md": "--r-md",
  "--jini-space-1": "--space-1",
  "--jini-space-2": "--space-2",
  "--jini-space-3": "--space-3",
  "--jini-space-4": "--space-4",
};
