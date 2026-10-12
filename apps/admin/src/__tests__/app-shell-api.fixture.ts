/** Empty API payloads for the screens mounted alongside App chrome in wiring tests. */
export function appShellApiBody(
  { url }: { url: string },
  { locale = "en" }: { locale?: string } = {},
): Record<string, unknown> {
  const href = new URL(url, "http://localhost");
  if (href.pathname.endsWith("/settings/effective")) {
    return { data: href.searchParams.get("namespace") === "core.language" ? [{ key: "locale", value: locale }] : [] };
  }
  if (href.pathname.endsWith("/posts") || href.pathname.endsWith("/pages")) return { posts: [] };
  if (href.pathname.endsWith("/media")) return { media: [] };
  if (href.pathname.endsWith("/comments/queue")) return { items: [] };
  if (href.pathname.endsWith("/presentation")) {
    return { settings: { activeThemeId: null }, availableThemeIds: [], availableThemes: [], activeThemeTemplates: [], activeThemeStaticPageIds: [] };
  }
  return {};
}
