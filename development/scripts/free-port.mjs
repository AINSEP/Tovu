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
import net from "node:net";

/**
 * Whether nothing is listening on `port` on `host`, by binding it and letting go.
 *
 * Only `EADDRINUSE` counts as taken. Any other bind error (e.g. `EADDRNOTAVAIL` for `::1` on a box
 * with IPv6 off) means this address family cannot be used at all, which says nothing about the port.
 *
 * @param {number} port
 * @param {string} host
 * @returns {Promise<boolean>}
 * @complexity O(1); one bind/close round trip.
 */
function isPortFreeOn(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => resolve(error.code !== "EADDRINUSE"));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

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
export async function isPortFree(port) {
  return (await isPortFreeOn(port, "127.0.0.1")) && (await isPortFreeOn(port, "::1"));
}

/**
 * The first port in `[start, start + span)` that `isPortFree` reports free, or `null` when none is.
 *
 * Scans upward from a fixed base rather than asking the OS for `:0`, so the desktop's Vite lands on a
 * predictable port (the base, in the common one-instance case) that is easy to spot in `lsof` and
 * logs, while a second instance still gets the next one.
 *
 * @param {{start: number, span: number}} range
 * @param {{isPortFree?: (port: number) => Promise<boolean>}} [deps]
 * @returns {Promise<number | null>}
 * @complexity O(span) checks in the worst case.
 */
export async function pickFreePort({ start, span }, deps = {}) {
  const check = deps.isPortFree ?? isPortFree;
  for (let port = start; port < start + span; port += 1) {
    if (await check(port)) return port;
  }
  return null;
}
