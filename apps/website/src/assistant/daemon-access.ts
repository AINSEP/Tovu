/** Tovu route/env/header bindings for Jini's credential and ownership policies. */
import type { RunLifecycle } from "@jini-ai/daemon";
import { createNodeCredentialCrypto, authorizeDaemonRequest, createRouteAccessPolicy,
  ensureAgentDaemonToken as ensureDaemonToken, authorizeRunOwnership, listOwnedRuns,
  createRunScopedCredentials as createDaemonRunCredentials } from "@jini-ai/daemon/run-credentials";
import type { RunOwnerRegistry, RunScopedCallerResolver } from "@jini-ai/daemon/run-credentials";
import { createDaemonAuthMiddleware, createRunOwnershipMiddleware,
  createOwnedRunListHandler as createDaemonOwnedRunListHandler } from "@jini-ai/daemon/http";
export { createRunOwnerRegistry } from "@jini-ai/daemon/run-credentials";
export type { RunOwnerRegistry, RunScopedCaller, RunScopedCredentials, RunScopedCallerResolver } from "@jini-ai/daemon/run-credentials";
export const AGENT_DAEMON_TOKEN_ENV_VAR = "TOVU_AGENT_DAEMON_TOKEN";
export const RUN_PRINCIPAL_HEADER = "x-tovu-principal-id";
export const DELEGATED_TOOL_CALLS_PATH = "/api/delegated-tool-calls";
const RUN_SCOPED_ROUTES: readonly { method: string; path: RegExp }[] = [
  { method: "GET", path: /^\/api\/runs\/[^/]+$/ },
  { method: "POST", path: /^\/api\/runs\/[^/]+\/cancel$/ },
  { method: "GET", path: /^\/api\/tools\/[^/]+$/ },
  { method: "GET", path: /^\/api\/components\/[^/]+$/ },
  { method: "GET", path: /^\/api\/active$/ },
  { method: "GET", path: /^\/api\/agents$/ },
  { method: "POST", path: /^\/api\/delegated-tool-calls$/ },
];


const crypto = createNodeCredentialCrypto({}, {});
const routes = createRouteAccessPolicy({ runPathPrefix: "/api/runs", delegatedToolCallsPath: DELEGATED_TOOL_CALLS_PATH,
  eventStreamSuffix: "/events", allowedRoutes: RUN_SCOPED_ROUTES }, {});
export function ensureAgentDaemonToken({ env = process.env }: { env?: NodeJS.ProcessEnv }, optional = {}): string {
  return ensureDaemonToken({ env, envVarName: AGENT_DAEMON_TOKEN_ENV_VAR, crypto }, optional);
}
export function isRunScopedRoute(required: { method: string; path: string }, optional = {}): boolean {
  return routes.allowsRunScoped(required, optional);
}
export interface AgentDaemonTokenGateOptions {
  env?: NodeJS.ProcessEnv; exemptPaths?: readonly string[]; runScopedCallers?: RunScopedCallerResolver; validateDelegatedRunId?: boolean;
}
export function requireAgentDaemonToken(required: AgentDaemonTokenGateOptions, optional = {}) {
  const { env = process.env, exemptPaths, runScopedCallers, validateDelegatedRunId } = required;
  return createDaemonAuthMiddleware({ authorizationHeaderName: "authorization",
    authorize: ({ request }, gateOptions) => authorizeDaemonRequest({ request, env,
      envVarName: AGENT_DAEMON_TOKEN_ENV_VAR, principalHeaderName: RUN_PRINCIPAL_HEADER,
      authorizationHeaderName: "authorization", crypto, routes }, { ...gateOptions,
      ...(exemptPaths ? { exemptPaths } : {}), ...(runScopedCallers ? { runScopedCallers } : {}) }) },
    { ...optional, ...(validateDelegatedRunId === undefined ? {} : { validateDelegatedRunId }) });
}
export function requireRunOwnership({ registry, lifecycle }: { registry: RunOwnerRegistry; lifecycle: Pick<RunLifecycle, "get"> }, optional = {}) {
  return createRunOwnershipMiddleware({ principalHeaderName: RUN_PRINCIPAL_HEADER,
    isEventStream: ({ path }) => path.endsWith("/events"),
    authorize: (input) => authorizeRunOwnership({ ...input, principalHeaderName: RUN_PRINCIPAL_HEADER, registry,
      runExists: async ({ runId }) => (await lifecycle.get({ runId })) !== undefined }, {}) }, optional);
}
export function createOwnedRunListHandler({ lifecycle, registry }: { lifecycle: RunLifecycle; registry: RunOwnerRegistry }, optional = {}) {
  return createDaemonOwnedRunListHandler({ principalHeaderName: RUN_PRINCIPAL_HEADER,
    listRuns: (required, options) => lifecycle.list(required, options),
    filterOwnedRuns: (input) => listOwnedRuns({ ...input, registry, principalHeaderName: RUN_PRINCIPAL_HEADER }, {}) }, optional);
}
export function createRunScopedCredentials(required: { principalOfLiveRun: (required: { runId: string }) => string | undefined }, optional = {}) {
  return createDaemonRunCredentials({ ...required, crypto }, optional);
}
