/** Tovu route/env/header bindings for Jini's credential and ownership policies. */
import type { RunLifecycle } from "@jini-ai/daemon";
import type { RequestHandler } from "express";
import { createNodeCredentialCrypto, authorizeDaemonRequest, createRouteAccessPolicy,
  ensureAgentDaemonToken as ensureDaemonToken, authorizeRunOwnership, listOwnedRuns,
  createRunScopedCredentials as createDaemonRunCredentials } from "@jini-ai/daemon/run-credentials";
import type { RunOwnerRegistry, RunScopedCallerResolver } from "@jini-ai/daemon/run-credentials";
import { createDaemonAuthMiddleware, createRunOwnershipMiddleware,
  createOwnedRunListHandler as createDaemonOwnedRunListHandler, registerAttachmentLookupRoutes,
  type AttachmentLookup } from "@jini-ai/daemon/http";
export { createRunOwnerRegistry } from "@jini-ai/daemon/run-credentials";
export type { RunOwnerRegistry, RunScopedCaller, RunScopedCredentials, RunScopedCallerResolver } from "@jini-ai/daemon/run-credentials";
export const AGENT_DAEMON_TOKEN_ENV_VAR = "TOVU_AGENT_DAEMON_TOKEN";
/** The server's tool RPC secret (ADR-070), separate from the daemon token. */
export const TOOL_EXEC_TOKEN_ENV_VAR = "TOVU_TOOL_EXEC_TOKEN";
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
// Module memory, never `process.env`: every `...process.env` child (plugin hosts, the import fork,
// CLI agents) would otherwise inherit it. Only the daemon spawn is handed it, by name.
const toolExecTokenHolder: NodeJS.ProcessEnv = {};
/**
 * Mints the per-boot tool RPC token once, adopting (and removing from `env`) an operator-set value.
 * @returns The token, the same for the life of this process.
 */
export function ensureToolExecToken({ env = process.env }: { env?: NodeJS.ProcessEnv }, optional = {}): string {
  const operatorToken = env[TOOL_EXEC_TOKEN_ENV_VAR];
  delete env[TOOL_EXEC_TOKEN_ENV_VAR];
  if (operatorToken && !toolExecTokenHolder[TOOL_EXEC_TOKEN_ENV_VAR]) toolExecTokenHolder[TOOL_EXEC_TOKEN_ENV_VAR] = operatorToken;
  return ensureDaemonToken({ env: toolExecTokenHolder, envVarName: TOOL_EXEC_TOKEN_ENV_VAR, crypto }, optional);
}
/** The minted tool RPC token, or `undefined` before {@link ensureToolExecToken} ran. */
export function currentToolExecToken(_required = {}, _optional = {}): string | undefined {
  return toolExecTokenHolder[TOOL_EXEC_TOKEN_ENV_VAR];
}
/**
 * Mounts the daemon's attachment lookup (the server's chat-attachment tools read the daemon-owned
 * store through it) behind its own full-daemon-token gate, so neither the gate nor the route's
 * 64 KB parser depends on what the daemon mounts later. Run-scoped credentials are refused.
 */
export function registerDaemonAttachmentLookup({ app, store }: { app: { post(path: string, ...handlers: RequestHandler[]): unknown }; store: AttachmentLookup },
  { env = process.env }: { env?: NodeJS.ProcessEnv } = {}): void {
  const gate = requireAgentDaemonToken({ env }, {});
  registerAttachmentLookupRoutes({ app: { post: (path, ...handlers) => app.post(path, gate, ...handlers) }, store }, {});
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
