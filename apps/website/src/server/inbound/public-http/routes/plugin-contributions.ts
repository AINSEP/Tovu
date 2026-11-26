/** Thin HTTP binding for the existing plugin host. A live Router per request generation avoids
 * Express stack surgery: disabled/reloaded handlers have no route entry to dispatch to. */
import express, { type Express, type RequestHandler } from 'express';
import { createPluginRouteAuthPorts as createAuthPorts, registerPluginContributionRoutes as registerRoutes } from '@jini-ai/cms/public-http/routes/plugin-contributions';
import type { RouteDeps } from '../../../routes/types.js';
import { authorizeOrRespond } from '../../admin-http/authorize-guard.js';
import { requireAdminSession } from '../../admin-http/dev-auth.js';
import { activeMemberFromSession } from '@jini-ai/user-management/members/access-resolver';
import { MEMBER_SESSION_COOKIE } from '../http/members.js';
import { readRequestCookie } from '../../../http/request-cookie.js';
import { PUBLIC_JSON_BODY_LIMIT, respondToOversizedBody } from '../../shared/json-body-parsers.js';

export interface PluginRouteAuthPorts { readonly member: RequestHandler; readonly admin: RequestHandler }
export const createPluginRouteAuthPorts = ({ deps }: { deps: RouteDeps }, _optional: Record<string, never> = {}): PluginRouteAuthPorts => createAuthPorts({ deps: {
  workspaceId: deps.workspaceId,
  operatorSession: requireAdminSession(deps),
  authorizeOrRespond: ({ res, params }) => authorizeOrRespond({ res, params, authorize: deps.authorize }),
  activeMemberFromSession: ({ request }) => activeMemberFromSession({ deps: {
    get memberSessionRepo() { return deps.memberSessionRepo; },
    get memberRepo() { return deps.memberRepo; },
    get workspaceId() { return deps.workspaceId; },
    sessionToken: () => readRequestCookie({ request, name: MEMBER_SESSION_COOKIE }),
    nowIso: () => deps.clock.nowIso(),
  } }),
} });

type PluginRouteDeps = Pick<RouteDeps, 'workspaceId' | 'pluginContributions' | 'pluginActivationRepo'>;
type PluginRouteErrorReporter = (required: { pluginId: string; error: unknown }, optional?: Record<string, never>) => void;
const warnPluginRouteFailure: PluginRouteErrorReporter = ({ pluginId, error }, _optional = {}) => console.warn(`[plugins] Plugin '${pluginId}' route failed`, error);

export const registerPluginContributionRoutes = (
  { app, deps, auth }: { app: Express; deps: PluginRouteDeps; auth: PluginRouteAuthPorts },
  optional: { onError?: PluginRouteErrorReporter } = {},
): void => registerRoutes({ app, deps, auth, kit: {
  Router: () => express.Router(),
  parsers: [
    express.json({ limit: PUBLIC_JSON_BODY_LIMIT }),
    express.urlencoded({ limit: PUBLIC_JSON_BODY_LIMIT, extended: false, parameterLimit: 256 }),
    express.text({ limit: PUBLIC_JSON_BODY_LIMIT, type: 'text/*' }),
    express.raw({ limit: PUBLIC_JSON_BODY_LIMIT, type: 'application/octet-stream' }),
  ],
  respondToOversizedBody,
  onError: optional.onError ?? warnPluginRouteFailure,
} });
