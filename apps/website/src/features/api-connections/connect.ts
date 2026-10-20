import { ApiConnectionError, type ApiConnectionService } from "@jini-ai/integrations/api-connections";
import { startLoopbackAuthorizationReceiver } from "@jini-ai/oauth";
import { ToolInputError } from "@jini-ai/core";

import type { DeclaredApiConnection } from "./contribution.js";
import type { ApiConnectionHost } from "./host.js";

/**
 * @file The plugin-declared API-connection branch of `agent_plugin_connect` (the single sign-in
 * entry point): start the generic sign-in, hand the card its link, and wait for the result.
 *
 * Hosted: the provider returns to the public callback route, which completes the sign-in; this call
 * watches the connection record until its credential generation moves past the one it started from
 * and it reads `connected`. Desktop: an ephemeral 127.0.0.1 loopback listener (Jini's installed-app
 * receiver) catches the redirect and this call completes it itself. The card's link opens in the
 * system browser through the desktop shell's existing external-link policy, so nothing here launches
 * a browser. Results carry a status only, never a token, code or URL.
 */

export interface ApiConnectionConnectDeps {
  readonly host: ApiConnectionHost;
  /** Scope sets (opaque product-module ids) to request; default none, i.e. the plugin's base scopes. */
  readonly scopeSetIds?: (input: { readonly pluginId: string; readonly connectionId: string }) => Promise<readonly string[]>;
  /** Injectable for tests; production uses Jini's loopback receiver. */
  readonly startLoopback?: typeof startLoopbackAuthorizationReceiver;
}

export type ApiConnectionConnectStatus = { readonly status: "connected" | "waiting-for-sign-in" };

interface ConnectRun {
  readonly deps: ApiConnectionConnectDeps;
  readonly connection: DeclaredApiConnection;
  readonly actorId: string;
  /** Shows the waiting card with the sign-in link; returns once it is on screen. */
  readonly showSignIn: (input: { readonly signInUrl: string }) => Promise<void>;
  readonly signal: AbortSignal;
  readonly pollIntervalMs: number;
  readonly waitTimeoutMs: number;
}

/** API-connection refusals carry safe, actionable messages; surface them as caller-facing input errors. */
function asToolError(error: unknown): never {
  if (error instanceof ApiConnectionError) throw new ToolInputError({ message: `agent_plugin_connect: ${error.message}` });
  throw error;
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done(): void { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); }
  });
}

/** Hosted: wait for the callback route to install a newer credential. @complexity O(t / interval) record reads. */
async function waitForCallback(run: ConnectRun, service: ApiConnectionService, connectionRef: string, startGeneration: number): Promise<boolean> {
  const deadline = Date.now() + run.waitTimeoutMs;
  while (Date.now() < deadline && !run.signal.aborted) {
    const status = await service.getStatus({ connectionRef });
    if (status.status === "connected" && (await service.readGeneration({ key: connectionRef })) > startGeneration) return true;
    await pause(Math.min(run.pollIntervalMs, Math.max(deadline - Date.now(), 0)), run.signal);
  }
  return false;
}

async function connectHosted(run: ConnectRun, scopeSetIds: readonly string[]): Promise<boolean> {
  const { host } = run.deps;
  const service = host.serviceFor({ connection: run.connection });
  const connectionRef = service.connectionRefFor({ workspaceId: host.workspaceId });
  const startGeneration = await service.readGeneration({ key: connectionRef });
  const redirectUri = host.hostedCallbackUrl({ connection: run.connection });
  const start = await service.start({ workspaceId: host.workspaceId, actorId: run.actorId, intent: "connect", scopeSetIds, redirectUri }).catch(asToolError);
  await run.showSignIn({ signInUrl: start.authorizationUrl });
  return waitForCallback(run, service, connectionRef, startGeneration);
}

/** Desktop: loopback receiver, consent in the system browser, completion here. The listener always closes. */
async function connectDesktop(run: ConnectRun, scopeSetIds: readonly string[]): Promise<boolean> {
  const { host } = run.deps;
  const listening = new AbortController();
  const stop = (): void => listening.abort();
  run.signal.addEventListener("abort", stop, { once: true });
  try {
    const receiver = await (run.deps.startLoopback ?? startLoopbackAuthorizationReceiver)({}, {
      callbackFields: run.connection.descriptor.callbackFields.map((field) => field.name), timeoutMs: run.waitTimeoutMs, signal: listening.signal,
    });
    const service = host.serviceFor({ connection: run.connection, redirectUri: receiver.redirectUri });
    const start = await service.start({ workspaceId: host.workspaceId, actorId: run.actorId, intent: "connect", scopeSetIds, redirectUri: receiver.redirectUri }).catch(asToolError);
    const state = new URL(start.authorizationUrl).searchParams.get("state") ?? "";
    const received = receiver.receive({ expectedState: state });
    await run.showSignIn({ signInUrl: start.authorizationUrl });
    const callback = await received.catch(() => null);
    if (!callback) return false;
    await service.complete({ workspaceId: host.workspaceId, actorId: run.actorId, redirectUri: receiver.redirectUri,
      callbackParams: { ...callback.fields, state, code: callback.code } }).catch(asToolError);
    return true;
  } finally {
    run.signal.removeEventListener("abort", stop);
    stop();
  }
}

/**
 * Connects one declared API connection. Already connected with every scope it would request:
 * returns `connected` with no sign-in, like the MCP branch does for a connected server.
 * @throws {ToolInputError} The connection refused to start or complete (safe message, next step).
 * @complexity One status read, one sign-in round trip bounded by `waitTimeoutMs`.
 */
export async function runApiConnectionConnect(
  required: ConnectRun,
  _optional: Record<string, never> = {},
): Promise<ApiConnectionConnectStatus> {
  const { host } = required.deps;
  const { connection } = required;
  const scopeSetIds = await (required.deps.scopeSetIds?.({ pluginId: connection.pluginId, connectionId: connection.descriptor.connectionId }) ?? Promise.resolve([]));
  const status = await host.statusOf({ connection });
  const wanted = await host.requestedScopes({ connection, scopeSetIds });
  if (status.status === "connected" && wanted.every((scope) => status.grantedScopes.includes(scope))) return { status: "connected" };
  const connected = host.runtime === "desktop" ? await connectDesktop(required, scopeSetIds) : await connectHosted(required, scopeSetIds);
  return { status: connected ? "connected" : "waiting-for-sign-in" };
}
