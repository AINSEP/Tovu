/** Thin HTTP binding for the existing plugin host. A live Router per request generation avoids
 * Express stack surgery: disabled/reloaded handlers have no route entry to dispatch to. */
import express, { type Express, type RequestHandler, type ErrorRequestHandler, type Response } from 'express';
import type { PluginAuthContext, PluginContributionsSnapshot, PluginRouteResult } from '@jini-ai/plugins/host';
import type { RouteDeps } from '../../../routes/types.js';
import { authorizeOrRespond } from '../../admin-http/authorize-guard.js';
import { requireAdminSession } from '../../admin-http/dev-auth.js';
import { DefaultMemberAccessResolver } from '../../../../features/members/index.js';
import { MEMBER_SESSION_COOKIE } from './members/complete-sign-in.js';
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
      void authorizeOrRespond(res, deps.authorize, { principalId: res.locals.principal.id,
        permission: 'admin.plugins.enable', workspaceId: deps.workspaceId,
        entityType: 'plugin', entityId: res.locals.pluginOwnerId,
      }).then(allowed => { if (allowed) next(); }).catch(next);
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
const warnPluginRouteFailure: PluginRouteErrorReporter = failure => console.warn(`[plugins] Plugin '${failure.pluginId}' route failed`, failure.error);

/** Whether the durable activation row says the plugin is enabled right now. */
async function isPluginActivated({ deps, pluginId }: { deps: PluginRouteDeps; pluginId: string }): Promise<boolean> {
  const row = await deps.pluginActivationRepo.getActivation({ workspaceId: deps.workspaceId, pluginId });
  return Boolean(row?.enabled);
}

/** Whether this exact snapshot is still the live generation (a reload or disable retires it). */
function isLiveGeneration({ deps, snapshot }: { deps: PluginRouteDeps; snapshot: PluginContributionsSnapshot }): boolean {
  return Boolean(deps.pluginContributions?.list({}).includes(snapshot));
}

/** The principal the access level's auth port resolved; public routes carry none. */
function principalFor({ access, locals }: { access: PluginRoute['access']; locals: Response['locals'] }): Pick<PluginAuthContext, 'principalId'> {
  if (access === 'admin') return { principalId: locals.principal?.id };
  if (access === 'member') return { principalId: locals.pluginMemberId };
  return {};
}

function sendPluginRouteResult({ res, result }: { res: Response; result: PluginRouteResult | void }): void {
  res.set('Cache-Control', 'no-store');
  if (result === undefined) { res.status(204).end(); return; }
  res.status(result.status ?? 200).json(result.body ?? null);
}

/** Gate before auth and body parsing: a disabled plugin's route answers 404 without reading anything. */
const requireActivatedPlugin = (deps: PluginRouteDeps, snapshot: PluginContributionsSnapshot): RequestHandler => async (_req, res, next) => {
  try {
    if (!(await isPluginActivated({ deps, pluginId: snapshot.pluginId }))) { respondNotFound(res); return; }
    res.locals.pluginOwnerId = snapshot.pluginId;
    next();
  } catch (error) { next(error); }
};

const invokePluginRoute = (
  { deps, snapshot, route }: { deps: PluginRouteDeps; snapshot: PluginContributionsSnapshot; route: PluginRoute },
  { onError }: { onError: PluginRouteErrorReporter },
): RequestHandler => async (req, res) => {
  try {
    if (!(await isPluginActivated({ deps, pluginId: snapshot.pluginId })) || !isLiveGeneration({ deps, snapshot })) { respondNotFound(res); return; }
    const context: PluginAuthContext = { access: route.access, workspaceId: deps.workspaceId, ...principalFor({ access: route.access, locals: res.locals }) };
    const result = await route.handler({ pluginId: snapshot.pluginId, sdk: snapshot.sdk, auth: context, body: req.body, params: req.params as Record<string, string>, query: req.query }, {});
    // A disable/reload while the handler awaited must not emit a retired generation's result.
    if (!isLiveGeneration({ deps, snapshot }) || !(await isPluginActivated({ deps, pluginId: snapshot.pluginId }))) { respondNotFound(res); return; }
    sendPluginRouteResult({ res, result });
  } catch (error) {
    onError({ pluginId: snapshot.pluginId, error }, {});
    res.status(500).json({ code: 'PLUGIN_ROUTE_FAILED' });
  }
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
