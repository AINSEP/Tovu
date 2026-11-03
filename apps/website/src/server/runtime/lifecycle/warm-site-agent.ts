/** Agent tools reach the single dev-host pool without importing process-launch assembly. */
import { LocalSiteError } from '#src/platform/site-dir/local-site-supervisor';
import { resolveCheckoutRoot } from '#src/platform/site-dir/product-root';
import { resolveDevTls, resolveDevTlsCertPaths } from '../boot/dev-tls.js';
import { requestLoopbackHttp } from '@jini-ai/platform/net';

/** Tool handlers can run in a daemon: use the dev host's capability rather than assembling a
 * second pool there. Tool permission checks still run in the feature before this port is called.
 * @complexity O(1), one bounded loopback request.
 */
export function warmSiteServerForAgent(_required = {}, { env = process.env }: { env?: NodeJS.ProcessEnv } = {}) {
  const token = env.TOVU_DEV_WARM_CONTROL_TOKEN;
  const origin = env.TOVU_DEV_WARM_HOST_URL;
  if (env.TOVU_DEV_WARM_SITES !== '1' || !token || !origin) return undefined;
  const tls = resolveDevTls(resolveDevTlsCertPaths(resolveCheckoutRoot()), { env });
  return async ({ name }: { name: string }): Promise<string> => {
    const reply = await requestLoopbackHttp({ url: `${origin}/internal/dev-warm-site`, method: 'POST',
      headers: { 'x-tovu-warm-control': token, 'content-type': 'application/json' }, body: JSON.stringify({ name }) },
    { certificate: tls.credentials?.cert, timeoutMs: 50_000 });
    const result = JSON.parse(reply.body.toString('utf8')) as { url?: unknown; code?: unknown };
    if (reply.status !== 200 || typeof result.url !== 'string') {
      throw new LocalSiteError(typeof result.code === 'string' ? result.code : 'SITE_START_FAILED');
    }
    return result.url;
  };
}
