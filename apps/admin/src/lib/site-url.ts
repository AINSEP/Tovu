import { isAdminDevServerOrigin } from "./admin-dev-origin";

/**
 * Builds a link to a page on the public Tovu site, not the admin SPA.
 *
 * In production the admin SPA is served by the same Tovu server at the same
 * origin, so a relative path is correct. When Vite serves the admin SPA on its
 * own origin (`base: "/admin/"`, default :5173) it knows nothing about the
 * public site's routes — a plain relative `<a href="/slug">` resolves against
 * the admin SPA's own origin and 404s there. Mirrors the existing
 * `TOVU_API_URL` convention `apps/admin/vite.config.ts` uses for the `/api`
 * proxy target.
 *
 * `import.meta.env.DEV` alone is NOT that question any more. `apps/desktop`
 * starts an admin Vite and has every site server proxy `/admin/*` to it, so the
 * SPA is dev-built while the browser sits on the SITE's own origin, on a port
 * assigned at runtime — where relative links are not only fine but the only
 * thing that can work, since one Vite serves any number of sites and no single
 * origin could be baked in. Absolutizing there sent `api.ts`'s
 * `templatePreviewUrl` iframe and every "View site" link to
 * `https://localhost:3000`, which a bare `npm run desktop` has nothing
 * listening on. `isAdminDevServerOrigin` (`lib/admin-dev-origin.ts`) is the
 * runtime check that tells the two apart.
 */
export function siteUrl(path: string): string {
  if (import.meta.env.DEV && isAdminDevServerOrigin(window.location.port)) {
    // The dev API server terminates TLS too as of 51c59f5c ("feat(dev): terminate TLS on the API
    // dev server too") — both dev servers now agree on https, so this fallback must too.
    const origin = import.meta.env.VITE_TOVU_SITE_URL ?? "https://localhost:3000";
    return `${origin}${path}`;
  }
  return path;
}
