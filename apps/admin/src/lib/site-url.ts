/**
 * Builds a link to a page on the public Tovu site, not the admin SPA.
 *
 * In production the admin SPA is served by the same Tovu server at the same
 * origin, so a relative path is correct. In dev, Vite serves the admin SPA on
 * its own origin (`base: "/admin/"`, default :5173) and knows nothing about
 * the public site's routes — a plain relative `<a href="/slug">` resolves
 * against the admin SPA's own origin and 404s there. Mirrors the existing
 * `TOVU_API_URL` convention `apps/admin/vite.config.ts` uses for the `/api`
 * proxy target.
 */
export function siteUrl(path: string): string {
  if (import.meta.env.DEV) {
    const origin = import.meta.env.VITE_TOVU_SITE_URL ?? "http://localhost:3000";
    return `${origin}${path}`;
  }
  return path;
}
