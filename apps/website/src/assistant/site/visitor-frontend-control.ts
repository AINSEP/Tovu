/** Separate visitor façade; no admin daemon, registry or proxy enters this composition. */
import { createFrontendControl, createFrontendGuestScope } from '@jini-ai/daemon/http';
import { PAGE_CAPABILITIES } from '@jini-ai/agentic';
import { isSameOrigin, normalizeOriginCandidate, type VerifiedOrigin } from '@jini-ai/http-kit/verified-origin';
import type { Express, Request } from 'express';
import type { Clock } from '@jini-ai/core/primitives';
import { createRateLimiter, resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';
import { resolveProtocol } from '#src/server/inbound/public-http/routes/oauth/public-origin';
import { readVisitorPagePublication } from '#src/features/theme/visitor-publication';

export function createVisitorFrontendControl({ workspaceId, enabled, canonicalOrigin, clock }: {
  workspaceId: string; enabled: () => Promise<boolean>; canonicalOrigin: () => Promise<VerifiedOrigin>; clock: Clock;
}, _options = {}) {
  const limiter = createRateLimiter({ clock, profile: { max: 30, windowSeconds: 60, burst: 0 } });
  const scope = createFrontendGuestScope({ workspaceId, cookieName: 'tovu_visitor_frontend', cookiePath: '/api/site-assistant',
    allowsRequest: async ({ req }: { req: Request }) => {
      if (!await enabled()) return false;
      // Fetch metadata is only a hint. Validate Origin (or GET's Referer) against the
      // request host/public origin, as public comment submissions do. A forged hint grants nothing.
      const raw = req.get('origin') ?? req.get('referer') ?? '';
      const target = normalizeOriginCandidate({ rawUrl: raw });
      if (!target) return false;
      if (new URL(raw).origin === `${resolveProtocol(req)}://${req.get('host')}`) return true;
      return isSameOrigin({ target, canonical: await canonicalOrigin() });
    } });
  const resolveOwner = async ({ req }: { req: Request }) => {
    const owner = await scope.resolveOwner({ req });
    const revision = req.get('x-visitor-publication') ?? '';
    if (!owner || !readVisitorPagePublication({ revision, workspaceId })) return null;
    return { ...owner, tabId: `${owner.tabId}:${revision}` };
  };
  const control = createFrontendControl({ capabilities: PAGE_CAPABILITIES, resolveBindToken: () => undefined,
    session: { routePrefix: '/api/site-assistant/frontend-sessions', resolveOwner, maxSessions: 256, maxSessionsPerKey: 3,
      resolveCapacityKeys: ({ req, owner }) => [`ip:${resolveClientIp(req)}`, `guest:${owner!.principalId}`],
    } }, { maxOutputBytes: 24_000 });
  return { control, resolveOwner,
    async bindRequest({ req, signal, runId }: { req: Request; signal: AbortSignal; runId: string }, _optional = {}) {
      const owner = await resolveOwner({ req });
      const publication = readVisitorPagePublication({ revision: req.get('x-visitor-publication') ?? '', workspaceId });
      const unbound = { owner, publication: null, release: () => {} };
      if (!owner || !publication) return unbound;
      try {
        const release = control.bindRequest({ runId, bindToken: req.get('x-frontend-bind-token') ?? '', owner, signal });
        return { owner, publication, release };
      } catch { return unbound; }
    },
    mount({ app }: { app: Express }, _optional = {}) {
      // Both routes share per-IP and authenticated guest budgets. Minting fresh cookies/tabs
      // cannot reset the IP budget, and reconnecting releases capacity through registry detach.
      for (const path of ['credentials', 'stream']) app.use(`/api/site-assistant/frontend-sessions/${path}`, async (req, res, next) => {
        try {
          const ip = await limiter.check({ key: `ip:${resolveClientIp(req)}` });
          if (!ip.allowed) { res.sendStatus(429); return; }
          const guest = await scope.resolveGuest({ req });
          if (guest && !(await limiter.check({ key: `guest:${guest}` })).allowed) { res.sendStatus(429); return; }
          next();
        } catch { res.sendStatus(403); }
      });
      app.post('/api/site-assistant/frontend-sessions/credentials', async (req, res) => {
        try {
          const issued = await scope.issue({ req, res });
          if (!issued) { res.sendStatus(403); return; }
          res.json(issued);
        } catch { res.sendStatus(403); }
      });
      control.httpExtension({ app, context: { adapter: { env: {}, resolvedPortRef: { current: 0 },
        allowedOriginsEnvVar: 'TOVU_ALLOWED_ORIGINS', webPortEnvVar: 'PORT', bindHostEnvVar: 'HOST' } } });
    },
  };
}
