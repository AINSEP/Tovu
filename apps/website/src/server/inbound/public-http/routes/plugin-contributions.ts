/** Thin HTTP binding for the existing plugin host. A live Router per request generation avoids
 * Express stack surgery: disabled/reloaded handlers have no route entry to dispatch to. */
import express, { type Express, type RequestHandler, type ErrorRequestHandler, type Response } from 'express';
import type { PluginContributionsSnapshot } from '@jini-ai/core/contracts/site/plugins-host';
import { isPluginActivated, invokeLivePluginRoute } from '@jini-ai/cms/public-http/routes/plugin-contributions';
import type { RouteDeps } from '../../../routes/types.js';
import { authorizeOrRespond } from '../../admin-http/authorize-guard.js';
import { requireAdminSession } from '../../admin-http/dev-auth.js';
import { DefaultMemberAccessResolver } from '@jini-ai/user-management/members/access-resolver';
import { MEMBER_SESSION_COOKIE } from '../http/members.js';
import { readRequestCookie } from '../../../http/request-cookie.js';
import { PUBLIC_JSON_BODY_LIMIT, respondToOversizedBody } from '../../shared/json-body-parsers.js';

export interface PluginRouteAuthPorts { readonly member: RequestHandler; readonly admin: RequestHandler }
/** Uses the same operator gate and distinct member cookie resolver as core routes; a member
 * credential never counts as an operator credential. No plugin receives raw tokens or repos. */
export function createPluginRouteAuthPorts({ deps }: { deps: RouteDeps }, _optional: Record<string, never> = {}): PluginRouteAuthPorts {
  const resolver = new DefaultMemberAccessResolver({ sessions: deps.memberSessionRepo, subscriptions: deps.memberSubscriptionRepo, tiers: deps.memberTierRepo });
  const operatorSession = requireAdminSession(deps);
  return {
    // The session gate admits operators, including users with no grants. Arbitrary in-process
    // plugin execution needs the same operator permission as plugin tools, not just a cookie.
    admin: (req, res, next) => operatorSession(req, res, error => {
      if (error) { next(error); return; }
      void authorizeOrRespond({ res, authorize: deps.authorize, params: { principalId: res.locals.principal.id,
        permission: 'admin.plugins.enable', workspaceId: deps.workspaceId,
        entityType: 'plugin', entityId: res.locals.pluginOwnerId,
      } }).then(allowed => { if (allowed) next(); }).catch(next);
    }),
    member: async (req, res, next) => {
      try {
        const context = await resolver.resolveContext({ workspaceId: deps.workspaceId, sessionToken: readRequestCookie({ request: req, name: MEMBER_SESSION_COOKIE }), nowIso: deps.clock.nowIso() });
        if (!context.isAuthenticated || !context.memberId) { res.status(401).json({ code: 'UNAUTHENTICATED' }); return; }
        // Session resolution alone must not resurrect a suspended/trashed member.
        const member = await deps.memberRepo.findById({ workspaceId: deps.workspaceId, id: context.memberId });
        if (!member || member.status !== 'active') { res.status(401).json({ code: 'UNAUTHENTICATED' }); return; }
        res.locals.pluginMemberId = context.memberId;
        next();
      } catch (error) { next(error); }
    },
  };
}
type PluginRoute = PluginContributionsSnapshot['routes'][number];
type PluginRouteDeps = Pick<RouteDeps, 'workspaceId' | 'pluginContributions' | 'pluginActivationRepo'>;
type PluginRouteErrorReporter = (required: { pluginId: string; error: unknown }, optional?: Record<string, never>) => void;

const respondNotFound = (res: Response): void => { res.status(404).json({ code: 'NOT_FOUND' }); };
const warnPluginRouteFailure: PluginRouteErrorReporter = ({ pluginId, error }, _optional = {}) => console.warn(`[plugins] Plugin '${pluginId}' route failed`, error);

/** Gate before auth and body parsing: a disabled plugin's route answers 404 without reading anything. */
const requireActivatedPlugin = (deps: PluginRouteDeps, snapshot: PluginContributionsSnapshot): RequestHandler => async (_req, res, next) => {
  try {
    if (!(await isPluginActivated({ workspaceId: deps.workspaceId, pluginId: snapshot.pluginId, getActivation: (input) => deps.pluginActivationRepo.getActivation(input) }))) { respondNotFound(res); return; }
    res.locals.pluginOwnerId = snapshot.pluginId;
    next();
  } catch (error) { next(error); }
};

const invokePluginRoute = (
  { deps, snapshot, route }: { deps: PluginRouteDeps; snapshot: PluginContributionsSnapshot; route: PluginRoute },
  { onError }: { onError: PluginRouteErrorReporter },
): RequestHandler => async (req, res) => {
  const result = await invokeLivePluginRoute({ workspaceId: deps.workspaceId, snapshot, route,
    input: { body: req.body, params: Object.fromEntries(Object.entries(req.params).map(([key, value]) => [key, String(value)])), query: req.query },
    ports: {
      isActivated: ({ pluginId }) => isPluginActivated({ workspaceId: deps.workspaceId, pluginId, getActivation: (input) => deps.pluginActivationRepo.getActivation(input) }),
      isLive: ({ snapshot }) => Boolean(deps.pluginContributions?.list({}).includes(snapshot)),
      principalIdFor: ({ access }) => access === 'admin' ? res.locals.principal?.id : res.locals.pluginMemberId,
      reportError: onError,
    },
  });
  if (result.kind !== 'result') { res.status(result.status).json(result.body); return; }
  res.set('Cache-Control', result.cacheControl);
  if (result.response === 'empty') { res.status(result.status).end(); return; }
  res.status(result.status).json(result.body);
};

const passThrough: RequestHandler = (_req, _res, next) => next();

const pluginRouteErrors: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  const invalidBody = error?.type === 'entity.parse.failed';
  res.status(invalidBody ? 400 : 500).json({ code: invalidBody ? 'INVALID_BODY' : 'PLUGIN_ROUTE_FAILED' });
};

/** All bodies, including authenticated ones, use the small public cap. The admin middleware
 * owns credential resolution; its parser also selects this cap for the /api/p mount.
 * Auth and a durable activation check precede reading any body. Handler errors are redacted. */
export function registerPluginContributionRoutes(
  { app, deps, auth }: { app: Express; deps: PluginRouteDeps; auth: PluginRouteAuthPorts },
  optional: { onError?: PluginRouteErrorReporter } = {},
): void {
  const parsers = [
    express.json({ limit: PUBLIC_JSON_BODY_LIMIT }),
    express.urlencoded({ limit: PUBLIC_JSON_BODY_LIMIT, extended: false, parameterLimit: 256 }),
    express.text({ limit: PUBLIC_JSON_BODY_LIMIT, type: 'text/*' }),
    express.raw({ limit: PUBLIC_JSON_BODY_LIMIT, type: 'application/octet-stream' }),
  ];
  const onError = optional.onError ?? warnPluginRouteFailure;
  const buildRouter = () => {
    const router = express.Router();
    for (const snapshot of deps.pluginContributions?.list({}) ?? []) {
      for (const route of snapshot.routes) {
        const guard = route.access === 'public' ? passThrough : auth[route.access];
        router.route(`/${snapshot.pluginId}${route.path}`)[route.method.toLowerCase() as 'get'](requireActivatedPlugin(deps, snapshot), guard, ...parsers, invokePluginRoute({ deps, snapshot, route }, { onError }));
      }
    }
    router.use((_req, response) => respondNotFound(response));
    return router;
  };
  app.use('/api/p', (req, res, next) => buildRouter()(req, res, next));
  app.use('/api/p', respondToOversizedBody);
  app.use('/api/p', pluginRouteErrors);
}
