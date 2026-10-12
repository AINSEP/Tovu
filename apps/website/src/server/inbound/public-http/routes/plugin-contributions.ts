/** Thin HTTP binding for the existing plugin host. A live Router per request generation avoids
 * Express stack surgery: disabled/reloaded handlers have no route entry to dispatch to. */
import express, { type Express, type RequestHandler, type ErrorRequestHandler } from 'express';
import type { PluginAuthContext, PluginContributionsSnapshot } from '@jini-ai/plugins/host';
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
/** All bodies, including authenticated ones, use the small public cap. The admin middleware
 * owns credential resolution; its parser also selects this cap for the /api/p mount.
 * Auth and a durable activation check precede reading any body. Handler errors are redacted. */
export function registerPluginContributionRoutes(
  { app, deps, auth }: { app: Express; deps: Pick<RouteDeps, 'workspaceId' | 'pluginContributions' | 'pluginActivationRepo'>; auth: PluginRouteAuthPorts },
  optional: { onError?: (required: { pluginId: string; error: unknown }, optional?: Record<string, never>) => void } = {},
): void {
  const json = express.json({ limit: PUBLIC_JSON_BODY_LIMIT });
  const form = express.urlencoded({ limit: PUBLIC_JSON_BODY_LIMIT, extended: false, parameterLimit: 256 });
  const raw = express.raw({ limit: PUBLIC_JSON_BODY_LIMIT, type: 'application/octet-stream' });
  const text = express.text({ limit: PUBLIC_JSON_BODY_LIMIT, type: 'text/*' });
  const invoke = (snapshot: PluginContributionsSnapshot, route: PluginContributionsSnapshot['routes'][number]): RequestHandler => async (req, res, next) => {
    try {
      const row = await deps.pluginActivationRepo.getActivation({ workspaceId: deps.workspaceId, pluginId: snapshot.pluginId });
      if (!row?.enabled || !deps.pluginContributions?.list({}).includes(snapshot)) { res.status(404).json({ code: 'NOT_FOUND' }); return; }
      const context: PluginAuthContext = { access: route.access, workspaceId: deps.workspaceId,
        ...(route.access === 'admin' ? { principalId: res.locals.principal?.id } : route.access === 'member' ? { principalId: res.locals.pluginMemberId } : {}),
      };
      const result = await route.handler({ pluginId: snapshot.pluginId, sdk: snapshot.sdk, auth: context, body: req.body, params: req.params as Record<string, string>, query: req.query }, {});
      // A disable/reload while the handler awaited must not emit a retired generation's result.
      if (!deps.pluginContributions?.list({}).includes(snapshot) || !(await deps.pluginActivationRepo.getActivation({ workspaceId: deps.workspaceId, pluginId: snapshot.pluginId }))?.enabled) { res.status(404).json({ code: 'NOT_FOUND' }); return; }
      res.set('Cache-Control', 'no-store');
      if (result === undefined) { res.status(204).end(); return; }
      res.status(result.status ?? 200).json(result.body ?? null);
    } catch (error) {
      (optional.onError ?? ((failure) => console.warn(`[plugins] Plugin '${failure.pluginId}' route failed`, failure.error)))({ pluginId: snapshot.pluginId, error }, {});
      res.status(500).json({ code: 'PLUGIN_ROUTE_FAILED' });
    }
  };
  app.use('/api/p', (req, res, next) => {
    const router = express.Router();
    for (const snapshot of deps.pluginContributions?.list({}) ?? []) {
      for (const route of snapshot.routes) {
        const path = `/${snapshot.pluginId}${route.path}`;
        const enabled: RequestHandler = async (_req, response, proceed) => {
          try {
            const row = await deps.pluginActivationRepo.getActivation({ workspaceId: deps.workspaceId, pluginId: snapshot.pluginId });
            if (!row?.enabled) { response.status(404).json({ code: 'NOT_FOUND' }); return; }
            response.locals.pluginOwnerId = snapshot.pluginId;
            proceed();
          } catch (error) { proceed(error); }
        };
        const guard: RequestHandler = route.access === 'public' ? (_req, _res, proceed) => proceed() : auth[route.access];
        router.route(path)[route.method.toLowerCase() as 'get'](enabled, guard, json, form, text, raw, invoke(snapshot, route));
      }
    }
    router.use((_req, response) => { response.status(404).json({ code: 'NOT_FOUND' }); });
    router(req, res, next);
  });
  app.use('/api/p', respondToOversizedBody);
  const errors: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) { next(error); return; }
    res.status(error?.type === 'entity.parse.failed' ? 400 : 500).json({ code: error?.type === 'entity.parse.failed' ? 'INVALID_BODY' : 'PLUGIN_ROUTE_FAILED' });
  };
  app.use('/api/p', errors);
}
