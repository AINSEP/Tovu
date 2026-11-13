/** Warm children delegate Sites management to the original dev host, never own another pool. */
import type { Express } from 'express';
import { requestLoopbackHttp } from '@jini-ai/platform/net';
import type { SiteBinding } from '#src/platform/site-dir/index';
import { resolveCheckoutRoot } from '#src/platform/site-dir/product-root';
import { resolveDevTls, resolveDevTlsCertPaths } from '#src/server/runtime/boot/dev-tls';

/** Preserve the child's actual serving binding in a host-owned listing. O(sites) time/space. */
export function warmSiteListing({ snapshot, binding }: { snapshot: Record<string, unknown>; binding: SiteBinding }, _options = {}) {
  const sites = Array.isArray(snapshot.sites) ? snapshot.sites as Array<{ name: string }> : [];
  return { ...snapshot, currentSite: { ...binding, listed: sites.some(site => site.name === binding.name) },
    sites: sites.map(site => ({ ...site, active: site.name === binding.name })) };
}

/** Relay only this resource after the ordinary admin session gate. Forward the original cookies,
 * so the host still authenticates/authorizes its own port-keyed session; no session is copied or
 * minted for a different site. The child subsequently authenticates on its own port as usual.
 * @returns True when this child delegates management; false for the host and every non-dev boot.
 * @complexity O(response bytes), bounded to 1 MiB and 55 seconds by the local HTTP adapter.
 */
export function registerWarmSiteControl({ app, binding, workspaceId }: { app: Express; binding: SiteBinding; workspaceId: string },
  { env = process.env }: { env?: NodeJS.ProcessEnv } = {}): boolean {
  const origin = env.TOVU_DEV_WARM_CONTROL_URL;
  const hostWorkspace = env.TOVU_DEV_WARM_CONTROL_WORKSPACE;
  if (env.TOVU_DEV_WARM_SITES !== '1' || !origin || !hostWorkspace) return false;
  const tls = resolveDevTls(resolveDevTlsCertPaths(resolveCheckoutRoot()), { env });
  const prefix = `/api/admin/v1/workspaces/${encodeURIComponent(workspaceId)}/system/sites`;
  app.use(prefix, async (req, res) => {
    try {
      const suffix = req.originalUrl.slice(prefix.length);
      const target = `${origin}/api/admin/v1/workspaces/${encodeURIComponent(hostWorkspace)}/system/sites${suffix}`;
      const reply = await requestLoopbackHttp({ url: target, method: req.method,
        headers: { cookie: req.headers.cookie ?? '', 'content-type': 'application/json' },
        ...(req.body === undefined ? {} : { body: JSON.stringify(req.body) }),
      }, { certificate: tls.credentials?.cert, timeoutMs: 55_000 });
      // Set-Cookie is intentionally not relayed: those are the host's credentials, never this
      // child's. Session renewal remains at each origin's ordinary auth endpoints.
      if (/\/preview(?:\?|$)/.test(suffix) && reply.status === 200) {
        res.status(200).type(reply.contentType ?? 'image/png').send(reply.body);
        return;
      }
      const snapshot = JSON.parse(reply.body.toString('utf8')) as Record<string, unknown>;
      res.status(reply.status).json(req.method === 'GET' && (suffix === '' || suffix.startsWith('?'))
        ? warmSiteListing({ snapshot, binding }) : snapshot);
    } catch {
      console.warn('tovu dev: warm site management host is unavailable.');
      res.status(503).json({ error: 'The dev site manager is unavailable. Return to the original dev server.' });
    }
  });
  return true;
}
