import {
  ApiConnectionError, createApiConnectionGenerationReader, deriveApiConnectionKey, type ApiConnectionIntent, type ApiConnectionService, type CompletedAuthorization,
} from "@jini-ai/integrations/api-connections";
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
 * a browser. Results carry a status and the opaque `connectionRef` only, never a token, code or URL. At most one desktop listener
 * per connection is pending: a newer sign-in closes the previous one.
 */

export interface ApiConnectionConnectDeps {
  readonly host: ApiConnectionHost;
}

/**
 * `connectionRef` is the opaque, plugin-scoped key the plugin's tools take as input. It is not a
 * secret: the host refuses it for any plugin that does not declare the connection in this workspace.
 * Returned in both states so a later call can use it once the person finishes signing in.
 */
export type ApiConnectionConnectStatus = { readonly status: "connected" | "waiting-for-sign-in"; readonly connectionRef: string };

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

interface CallbackWatch {
  readonly connectionRef: string;
  readonly startGeneration: number;
  readonly readGeneration: ReturnType<typeof createApiConnectionGenerationReader>;
}

/** Hosted: wait for the callback route to install a newer credential. @complexity O(t / interval) record reads. */
async function waitForCallback(run: ConnectRun, service: ApiConnectionService, watch: CallbackWatch): Promise<boolean> {
  const { connectionRef, startGeneration, readGeneration } = watch;
  const { workspaceId } = run.deps.host;
  const deadline = Date.now() + run.waitTimeoutMs;
  while (Date.now() < deadline && !run.signal.aborted) {
    const status = await service.getStatus({ connectionRef, workspaceId });
    if (status.status === "connected" && (await readGeneration({ key: connectionRef })) > startGeneration) return true;
    await pause(Math.min(run.pollIntervalMs, Math.max(deadline - Date.now(), 0)), run.signal);
  }
  return false;
}

/** A started sign-in. Desktop also carries its own completion; hosted completes at the public callback. */
export interface ApiConnectionSignInStart {
  readonly authorizationUrl: string;
  /** The service's opaque attempt id: what plugin code and frames get, never the OAuth `state`. */
  readonly attemptId: string;
  readonly expiresAt: string;
  /** Desktop only: the redeemed sign-in, or null when the loopback callback never came (timeout, abort, refusal). */
  readonly completion?: Promise<CompletedAuthorization | null>;
}

/**
 * Starts one sign-in for a declared connection: the generic start with the caller's declared start
 * parameters (Jini refuses undeclared ones), on the runtime's redirect. Desktop arms Jini's
 * 127.0.0.1 loopback receiver first (it closes on its callback, `timeoutMs` or `signal`) and
 * redeems the callback itself, returning the plugin's declared callback fields with the result.
 * Shared by `agent_plugin_connect` and the admin-surface connection port.
 * @complexity One start; desktop adds one loopback listener and, later, one exchange.
 */
export async function startApiConnectionSignIn(
  required: SignInRequest,
  optional: SignInOptions = {},
): Promise<ApiConnectionSignInStart> {
  if (required.host.runtime === "desktop") return startDesktopSignIn(required, optional);
  const { host, connection, actorId, intent, scopeSetIds } = required;
  const start = await host.serviceFor({ connection }).start(
    { workspaceId: host.workspaceId, actorId, intent, scopeSetIds, redirectUri: host.hostedCallbackUrl({ connection }) }, startOptionsOf(optional));
  return { authorizationUrl: start.authorizationUrl, attemptId: start.attemptId, expiresAt: start.expiresAt };
}

interface SignInRequest {
  readonly host: ApiConnectionHost; readonly connection: DeclaredApiConnection; readonly actorId: string;
  readonly intent: ApiConnectionIntent; readonly scopeSetIds: readonly string[];
}

interface SignInOptions {
  readonly startParams?: Readonly<Record<string, string>>; readonly timeoutMs?: number; readonly signal?: AbortSignal;
}

const startOptionsOf = (optional: SignInOptions) => (optional.startParams === undefined ? {} : { startParams: optional.startParams });

/** Per host (one per workspace), the listener of each connection's pending desktop sign-in. */
const pendingDesktopSignIns = new WeakMap<ApiConnectionHost, Map<string, AbortController>>();

/**
 * One pending desktop sign-in per connection (cancel-previous): a new one closes the previous
 * listener, so repeated clicks never stack 127.0.0.1 listeners that each wait out their timeout.
 * The previous attempt could not complete anyway once a newer one started.
 * @returns Frees the slot, only while it still holds this listener. @complexity O(1).
 */
function claimLoopbackSlot(host: ApiConnectionHost, connection: DeclaredApiConnection, listening: AbortController): () => void {
  const slots = pendingDesktopSignIns.get(host) ?? new Map<string, AbortController>();
  pendingDesktopSignIns.set(host, slots);
  const key = deriveApiConnectionKey({ workspaceId: host.workspaceId, pluginId: connection.pluginId, connectionId: connection.descriptor.connectionId });
  slots.get(key)?.abort();
  slots.set(key, listening);
  return () => { if (slots.get(key) === listening) slots.delete(key); };
}

async function startDesktopSignIn(required: SignInRequest, optional: SignInOptions): Promise<ApiConnectionSignInStart> {
  const { host, connection, actorId, intent, scopeSetIds } = required;
  const listening = new AbortController();
  const stop = (): void => listening.abort();
  const free = claimLoopbackSlot(host, connection, listening);
  const release = (): void => { free(); optional.signal?.removeEventListener("abort", stop); };
  optional.signal?.addEventListener("abort", stop, { once: true });
  try {
    const receiver = await host.startLoopback({}, {
      callbackFields: connection.descriptor.callbackFields.map((field) => field.name), signal: listening.signal,
      ...(optional.timeoutMs === undefined ? {} : { timeoutMs: optional.timeoutMs }),
    });
    const service = host.serviceFor({ connection, redirectUri: receiver.redirectUri });
    const start = await service.start({ workspaceId: host.workspaceId, actorId, intent, scopeSetIds, redirectUri: receiver.redirectUri }, startOptionsOf(optional));
    // `state` stays here: it arms the receiver and goes back to `complete`, never into the result.
    const { state } = start;
    const completion = receiver.receive({ expectedState: state }).then(
      (callback) => service.complete({ workspaceId: host.workspaceId, actorId, redirectUri: receiver.redirectUri, callbackParams: { ...callback.fields, state, code: callback.code } }),
      () => null,
    ).finally(release);
    return { authorizationUrl: start.authorizationUrl, attemptId: start.attemptId, expiresAt: start.expiresAt, completion };
  } catch (error) {
    // Nothing will arm the listener now: close it instead of leaving it to its timeout.
    stop();
    release();
    throw error;
  }
}

async function connectHosted(run: ConnectRun, scopeSetIds: readonly string[]): Promise<boolean> {
  const { host } = run.deps;
  const service = host.serviceFor({ connection: run.connection });
  const connectionRef = deriveApiConnectionKey({ workspaceId: host.workspaceId, pluginId: run.connection.pluginId, connectionId: run.connection.descriptor.connectionId });
  const readGeneration = createApiConnectionGenerationReader({ records: host.records });
  const startGeneration = await readGeneration({ key: connectionRef });
  const start = await startApiConnectionSignIn({ host, connection: run.connection, actorId: run.actorId, intent: "connect", scopeSetIds }).catch(asToolError);
  await run.showSignIn({ signInUrl: start.authorizationUrl });
  return waitForCallback(run, service, { connectionRef, startGeneration, readGeneration });
}

/**
 * Desktop: loopback receiver, consent in the system browser, completion here. The listener always
 * closes: this call's own controller also closes it when the card cannot be shown or the run ends,
 * not only on `run.signal`, so a failed card never leaves a 127.0.0.1 listener up for its timeout.
 */
async function connectDesktop(run: ConnectRun, scopeSetIds: readonly string[]): Promise<boolean> {
  const { host } = run.deps;
  const listening = new AbortController();
  const stop = (): void => listening.abort();
  run.signal.addEventListener("abort", stop, { once: true });
  try {
    const start = await startApiConnectionSignIn({ host, connection: run.connection, actorId: run.actorId, intent: "connect", scopeSetIds }, {
      timeoutMs: run.waitTimeoutMs, signal: listening.signal,
    }).catch(asToolError);
    await run.showSignIn({ signInUrl: start.authorizationUrl });
    return (await (start.completion ?? Promise.resolve(null)).catch(asToolError)) !== null;
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
  // Chat connects the plugin's base scopes; products add theirs from the plugin's own panel.
  const scopeSetIds: readonly string[] = [];
  const status = await host.statusOf({ connection });
  const { connectionRef } = status;
  const wanted = await host.requestedScopes({ connection, scopeSetIds });
  if (status.status === "connected" && wanted.every((scope) => status.grantedScopes.includes(scope))) return { status: "connected", connectionRef };
  const connected = host.runtime === "desktop" ? await connectDesktop(required, scopeSetIds) : await connectHosted(required, scopeSetIds);
  return { status: connected ? "connected" : "waiting-for-sign-in", connectionRef };
}
