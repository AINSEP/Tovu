import { createServer, type RequestListener } from 'node:http';
import { reserveBootListener } from './boot-listener.js';
import { stopServingWithinGrace } from '../lifecycle/close-store-on-shutdown.js';

// This is a Tovu route adapter: parsing, bearer/peer checks and attempt authority stay with
// the existing private route owners. The extra listener exposes no public/admin route.
const CALLBACK_PATHS = new Set([
  '/internal/agent-daemon-core', '/internal/tool-catalog', '/internal/tool-executions',
  '/internal/component-catalog', '/internal/agent-plugin-preflight',
]);

/** Give a LAN-bound site a reachable private callback without changing its public origin.
 * Loopback listeners are reused; otherwise bind an ephemeral IPv4 loopback HTTP listener to
 * the same site's private handlers. All callers still pass the existing authenticated peer gate.
 * @param required Public listener origin and the serving site's composed request handler.
 * @returns Callback origin and idempotent bounded close, owned by the site's boot/shutdown path.
 * @throws Listener bind errors; no alternate host or unauthenticated transport is attempted.
 * @complexity O(1) time/space; at most one extra socket per LAN-bound site, no process or timer loop.
 * @example const callback = await startSiteDaemonListener({ publicOrigin, handler: app });
 */
export async function startSiteDaemonListener(
  { publicOrigin, handler }: { publicOrigin: string; handler: RequestListener },
  _options: Record<string, never> = {},
): Promise<{ origin: string; close(): Promise<void> }> {
  const host = new URL(publicOrigin).hostname;
  if (['127.0.0.1', 'localhost', '[::1]'].includes(host)) return { origin: publicOrigin, close: async () => {} };
  const server = createServer((request, response) => {
    const pathname = request.url?.split('?', 1)[0];
    if (!pathname || !CALLBACK_PATHS.has(pathname)) { response.writeHead(404).end(); return; }
    handler(request, response);
  });
  const port = await reserveBootListener({ server, port: 0, bindHost: '127.0.0.1' });
  let closing: Promise<void> | undefined;
  return { origin: `http://127.0.0.1:${port}`,
    close() {
      closing ??= stopServingWithinGrace({ server, workers: [] });
      return closing;
    },
  };
}
