/**
 * @file Finding a free TCP port for a dev server, for `development/scripts/dev-desktop.mjs`.
 *
 * Exists because `npm run desktop` and `npm run dev` both used to put the admin Vite on :5173, so
 * whichever started second could not have it. The desktop now picks its own port from a range of
 * its own (see `dev-desktop.mjs`'s `resolveDesktopAdminVitePort`) and leaves :5173 to the web stack.
 *
 * Split into a real bind check plus a pure range scan with the check injected, so the scan is
 * testable with a fake and no real port has to be busy on the test machine.
 */
import { isPortFree as isSharedPortFree, pickFreePort as pickSharedFreePort } from "@jini-ai/devops/local-dev";

/**
 * Whether `port` is free on BOTH loopback addresses.
 *
 * Both, because Vite binds `localhost`, which resolves to `::1` on this machine (the desktop's Vite
 * was found on `[::1]:5173`), while other servers bind `127.0.0.1`. A v4-only check would call a
 * port held on `::1` free, and Vite's `strictPort` would then fail on it.
 *
 * Inherently a hint, not a reservation: the port can be taken between this check and the real bind.
 * `apps/admin/vite.config.ts`'s `strictPort: true` turns that race into a loud exit, which
 * `dev-desktop.mjs`'s `reportAdminViteGone` already handles.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 * @complexity O(1); two bind/close round trips.
 */
export function isPortFree(port) {
  return isSharedPortFree({ port });
}

/**
 * The launchers' seam: tests replace this module file (see desktop-portable.unit.test.ts), so it keeps
 * the positional `deps.isPortFree(port)` shape its callers and fakes use.
 *
 * @param {{start: number, span: number}} range
 * @param {{isPortFree?: (port: number) => Promise<boolean>}} [deps]
 * @returns {Promise<number | null>}
 */
export function pickFreePort(range, deps = {}) {
  const check = deps.isPortFree ?? isPortFree;
  return pickSharedFreePort(range, { isPortFree: ({ port }) => check(port) });
}
