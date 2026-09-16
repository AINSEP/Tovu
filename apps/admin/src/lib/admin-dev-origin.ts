/**
 * Tells apart the two ways a DEV-built admin bundle can reach a browser.
 *
 * `import.meta.env.DEV` answers "was this bundle built by Vite in dev mode", which used to be the
 * same question as "is Vite itself serving this document". It is not any more: `apps/desktop` starts
 * an admin Vite and has each site server proxy `/admin/*` to it
 * (`apps/website/src/server/inbound/admin-http/admin-static.ts`'s dev-proxy branch), so the SPA is
 * dev-built but served from the SITE's own origin, on a port assigned at runtime. Anything that
 * branches on "the admin is on a different origin from the site" needs this predicate instead.
 *
 * The port comparison is the only runtime signal that separates the two: there is one Vite for any
 * number of desktop sites on any number of dynamic ports, so nothing per-site can be baked in at
 * build time. Both origins always carry an explicit port in dev, so the empty-string default-port
 * case is a clean "not the dev server".
 */

/**
 * The port `apps/admin/vite.config.ts` binds its dev server to, baked in at Vite start from the same
 * `TOVU_ADMIN_DEV_PORT` expression that config uses for `server.port`, so the two cannot disagree.
 */
export const ADMIN_DEV_SERVER_PORT: string = __TOVU_ADMIN_DEV_PORT__;

/**
 * Whether the page was served by the admin Vite dev server ITSELF rather than proxied through a Tovu
 * server at `/admin/*`.
 *
 * Pure, and takes the port rather than reading `window.location` itself, so callers' tests can drive
 * it without reconfiguring jsdom's `location` (which is not reliably possible).
 *
 * @param locationPort - `window.location.port`; `""` for a default-port origin.
 * @param adminDevPort - the dev server's port; defaults to {@link ADMIN_DEV_SERVER_PORT}.
 * @complexity O(1).
 */
export function isAdminDevServerOrigin(
  locationPort: string,
  adminDevPort: string = ADMIN_DEV_SERVER_PORT
): boolean {
  return locationPort === adminDevPort;
}
