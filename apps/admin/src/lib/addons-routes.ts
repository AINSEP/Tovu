/**
 * @file Tovu's Add-ons URL migration (owner decision, 2026-10-13).
 * Jini still matches stable panel IDs; this adapter translates only Tovu's moved URLs.
 * Legacy redirects are resolved here and executed by the existing IntegrationsRedirect.
 */
export const ADDONS_PANEL_PATHS: Readonly<Record<string, string>> = {
  plugins: "/addons/plugins",
  "agent-plugins": "/addons/agent-plugins",
  skills: "/addons/skills",
  providers: "/addons/integrations",
  integrations: "/addons/integrations?tab=webhooks",
};

export interface AddonsRouteResolution {
  /** Stable-ID path for Jini's matcher; never written to browser history. */
  readonly matchPath: string;
  /** Canonical destination for a legacy URL, absent on current or unrelated routes. */
  readonly redirectPath?: string;
}

/**
 * Resolves moved Add-ons URLs without changing unrelated sections or query bytes.
 * Bare legacy Integrations links keep their former Webhooks default; explicit tabs survive.
 * @param input Base-agnostic route path, including its query string.
 * @returns Matcher path and, for a legacy URL, replacement destination. No side effects/errors.
 * @example resolveAddonsRoute({ routePath: "/providers?tab=webhooks" })
 * @complexity O(n) time and space in URL length; the Add-ons table has five fixed entries.
 */
export function resolveAddonsRoute(
  { routePath }: { readonly routePath: string },
  _options = {},
): AddonsRouteResolution {
  const pathname = routePath.split("?")[0] ?? "";
  const query = routePath.slice(pathname.length);
  const parts = pathname.split("/").filter(Boolean);
  const path = `/${parts.join("/")}`;

  if (parts[0] === "addons") {
    if (parts.length === 3 && parts[1] === "integrations") {
      return { matchPath: `/integrations/${parts[2]}${query}` };
    }
    const panel = Object.entries(ADDONS_PANEL_PATHS).find(([, destination]) => destination === path);
    return { matchPath: panel ? `/${panel[0]}${query}` : routePath };
  }

  if (parts.length === 2 && parts[0] === "integrations") {
    return { matchPath: routePath, redirectPath: `${ADDONS_PANEL_PATHS.providers}/${parts[1]}${query}` };
  }
  if (parts.length !== 1) return { matchPath: routePath };
  const destination = Object.hasOwn(ADDONS_PANEL_PATHS, parts[0]!) ? ADDONS_PANEL_PATHS[parts[0]!] : undefined;
  if (!destination) return { matchPath: routePath };
  if (parts[0] === "integrations") {
    const redirectQuery = new URLSearchParams(query).has("tab") ? query : `${query}${query ? "&" : "?"}tab=webhooks`;
    return { matchPath: routePath, redirectPath: `${ADDONS_PANEL_PATHS.providers}${redirectQuery}` };
  }
  return { matchPath: routePath, redirectPath: `${destination}${query}` };
}
