/** Separate visitor façade; no admin daemon, registry or proxy enters this composition. */
import { createFrontendControl, createFrontendGuestScope, type DaemonRouteHost, type FrontendHookInput, type FrontendSessionTimer } from '@jini-ai/daemon/http';
import { PAGE_CAPABILITIES } from '@jini-ai/agentic';
import { createLocalSameOriginPolicy, type RouteHostContext, type ServerRoute } from '@jini-ai/core/contracts/server';
import {
  isSameOrigin,
  normalizeOriginCandidate,
  type VerifiedOrigin,
} from '@jini-ai/core/contracts/server/verified-origin';
import type { Express, Request, Response } from 'express';
import type { Clock } from '@jini-ai/core/primitives';
import { createRateLimiter, resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';
import { requestHookInput } from '#src/server/inbound/shared/request-facts';
import { readRequestFacts } from '#src/contracts/core/request-facts';
import { allowsVisitorRequestOrigin } from './visitor-request-origin.js';
import { readVisitorPagePublication } from '#src/features/theme/visitor-publication';

type GuestScope = ReturnType<typeof createFrontendGuestScope>;
type VisitorControl = ReturnType<typeof createFrontendControl>;
type VisitorLimiter = ReturnType<typeof createRateLimiter>;
type ReportVisitorError = (required: { error: unknown }, optional?: Record<string, never>) => void;
/** What the composition root lends this module so it can put Jini's frontend-session routes on the visitor app without importing the root. */
export interface VisitorRoutePorts {
  /** Mounts a Jini route list on the app, on the line of the call (the composition's `mountJiniRoutes`). */
  readonly mountRoutes: (required: { app: Express; routes: readonly ServerRoute[] }) => void;
  /** Builds the host the route list is given (the composition's `daemonRouteHost`). */
  readonly routeHost: (required: { context: RouteHostContext; parserLimitBytes: number }) => DaemonRouteHost;
  /** Byte limit of the JSON parser the app runs above `.../responses` (the public parser's). */
  readonly parserLimitBytes: number;
  /** Ends a guest session whose tab never disconnects. */
  readonly setTimer: FrontendSessionTimer;
}

type ResolveVisitorOwner = (required: FrontendHookInput) => Promise<NonNullable<Awaited<ReturnType<GuestScope['resolveOwner']>>> | null>;

async function bindVisitorRequest(
  required: { req: Request; signal: AbortSignal; runId: string; workspaceId: string; control: VisitorControl; resolveOwner: ResolveVisitorOwner },
  _optional = {},
) {
  const { req, signal, runId, workspaceId, control, resolveOwner } = required;
  const owner = await resolveOwner(requestHookInput({ req }));
  const publication = readVisitorPagePublication({ revision: req.get('x-visitor-publication') ?? '', workspaceId });
  const unbound = { owner, publication: null, release: () => {} };
  if (!owner || !publication) return unbound;
  try {
    const release = control.bindRequest({ runId, bindToken: req.get('x-frontend-bind-token') ?? '', owner, signal });
    return { owner, publication, release };
  } catch { return unbound; }
}

/** Answers a refusal's status, and hands the error that caused it to the visitor reporter: the visitor still sees only the status. */
function refuseWithReport({ res, error, reportError }: { res: Response; error: unknown; reportError: ReportVisitorError }, _optional = {}): void {
  reportError({ error });
  res.sendStatus(403);
}

function mountVisitorFrontendRoutes(required: { app: Express; scope: GuestScope; control: VisitorControl; limiter: VisitorLimiter; reportError: ReportVisitorError; ports: VisitorRoutePorts }, _optional = {}): void {
  const { app, scope, control, limiter, reportError, ports } = required;
  // Both routes share per-IP and authenticated guest budgets. Minting fresh cookies/tabs
  // cannot reset the IP budget, and reconnecting releases capacity through registry detach.
  for (const path of ['credentials', 'stream']) app.use(`/api/site-assistant/frontend-sessions/${path}`, async (req, res, next) => {
    try {
      const ip = await limiter.check({ key: `ip:${resolveClientIp(req)}` });
      if (!ip.allowed) { res.sendStatus(429); return; }
      const guest = await scope.resolveGuest(requestHookInput({ req }));
      if (guest && !(await limiter.check({ key: `guest:${guest}` })).allowed) { res.sendStatus(429); return; }
      next();
    } catch (error) { refuseWithReport({ res, error, reportError }); }
  });
  app.post('/api/site-assistant/frontend-sessions/credentials', async (req, res) => {
    try {
      const issued = await scope.issue(requestHookInput({ req }));
      if (!issued) { res.sendStatus(403); return; }
      // The cookie is HttpOnly and travels only in this header; the body carries the tab credential alone.
      res.append('Set-Cookie', issued.setCookie);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ tabCredential: issued.tabCredential });
    } catch (error) { refuseWithReport({ res, error, reportError }); }
  });
  // Port 0 and an empty env: no browser origin is ever same-origin here, only a header-less loopback request.
  const originPolicy = createLocalSameOriginPolicy({ port: () => 0, env: {},
    config: { allowedOriginsEnvVar: 'TOVU_ALLOWED_ORIGINS', webPortEnvVar: 'PORT', bindHostEnvVar: 'HOST' } });
  ports.mountRoutes({ app, routes: control.routes({ host: ports.routeHost({ context: { originPolicy }, parserLimitBytes: ports.parserLimitBytes }) }) });
}

export function createVisitorFrontendControl({ workspaceId, enabled, canonicalOrigin, clock, reportError, ports }: {
  workspaceId: string; enabled: () => Promise<boolean>; canonicalOrigin: () => Promise<VerifiedOrigin>; clock: Clock; ports: VisitorRoutePorts;
  /** Where the error behind a refusal goes; the visitor sees only the status. */
  reportError: ReportVisitorError;
}, _options = {}) {
  const limiter = createRateLimiter({ clock, profile: { max: 30, windowSeconds: 60, burst: 0 } });
  const scope = createFrontendGuestScope({ workspaceId, cookieName: 'tovu_visitor_frontend', cookiePath: '/api/site-assistant',
    // Express's `req.secure`, as the facts hold it: not the serving protocol the origin check compares with.
    isSecureRequest: ({ locals }) => readRequestFacts({ locals }).secure,
    allowsRequest: async (input: FrontendHookInput) => {
      if (!await enabled()) return false;
      return allowsVisitorRequestOrigin({ ...input, allowsOrigin: async ({ origin }) => {
        const target = normalizeOriginCandidate({ rawUrl: origin });
        return target !== null && isSameOrigin({ target, canonical: await canonicalOrigin() });
      } });
    } });
  const resolveOwner = async (input: FrontendHookInput) => {
    const owner = await scope.resolveOwner(input);
    const revision = input.request.headers.get('x-visitor-publication') ?? '';
    if (!owner || !readVisitorPagePublication({ revision, workspaceId })) return null;
    return { ...owner, tabId: `${owner.tabId}:${revision}` };
  };
  const control = createFrontendControl({ capabilities: PAGE_CAPABILITIES, resolveBindToken: () => undefined, setTimer: ports.setTimer,
    // The capacity key is the address the host's facts hold (the same answer the IP gate above keys on), never the bridge's socket peer.
    session: { routePrefix: '/api/site-assistant/frontend-sessions', resolveOwner, maxSessions: 256, maxSessionsPerKey: 3,
      resolveCapacityKeys: ({ locals, owner }) => [`ip:${readRequestFacts({ locals }).clientAddress}`, `guest:${owner!.principalId}`],
    } }, { maxOutputBytes: 24_000 });
  return { control, resolveOwner,
    bindRequest: ({ req, signal, runId }: { req: Request; signal: AbortSignal; runId: string }, _optional = {}) =>
      bindVisitorRequest({ req, signal, runId, workspaceId, control, resolveOwner }),
    mount: ({ app }: { app: Express }, _optional = {}) => mountVisitorFrontendRoutes({ app, scope, control, limiter, reportError, ports }),
  };
}
