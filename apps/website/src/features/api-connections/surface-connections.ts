import { createHash } from "node:crypto";

import { ApiConnectionError, deriveApiConnectionKey, type ApiConnectionRemoteRevocation, type ApiConnectionStatusView } from "@jini-ai/integrations/api-connections";
import type {
  AdminSurfaceAuthorizationStart, AdminSurfaceConnectionAction, AdminSurfaceConnections, AdminSurfaceConnectionStatus, AdminSurfaceRevocationOutcome,
} from "@jini-ai/agent-plugins/admin-surfaces";
import type { startLoopbackAuthorizationReceiver } from "@jini-ai/oauth";

import { startApiConnectionSignIn } from "./connect.js";
import type { DeclaredApiConnection } from "./contribution.js";
import type { ApiConnectionHost } from "./host.js";

/**
 * @file Tovu's `connections` port for plugin admin-surface handlers (Jini's `AdminSurfaceConnections`):
 * account actions a signed-in admin takes on a plugin's own settings screen, over the same
 * api-connections host the chat sign-in and the tools use.
 *
 * Why the host resolves ids itself: Jini's session already refuses ids the SURFACE did not declare,
 * but only the host knows which connections the calling PLUGIN declares in THIS workspace, so a
 * connection id is turned into its opaque ref here, from the scope's plugin and workspace, and any
 * other id gets one refusal. Refs never leave. A sign-in's authorization URL is reported to
 * `onSignInIssued` so the admin route can let the host page (not the sandboxed frame) open exactly
 * the URLs this host issued. Revocation outcomes are reported verbatim: `revoked` only when the
 * provider confirmed.
 */

/** The opaque attempt id a plugin uses to take callback fields: a digest of the state, never the state. */
export function callbackAttemptId(required: { readonly state: string }, _optional: Record<string, never> = {}): string {
  return createHash("sha256").update(required.state).digest("base64url");
}

export interface IssuedSignIn extends AdminSurfaceAuthorizationStart {
  readonly pluginId: string;
  readonly connectionId: string;
}

export interface SurfaceConnectionsDeps {
  readonly host: ApiConnectionHost;
  /** Called with every authorization URL `begin` issued (the per-request registry the admin route reads). */
  readonly onSignInIssued?: (issued: IssuedSignIn) => void;
  /** Where a desktop sign-in that failed after the browser opened is reported (error codes only). */
  readonly log?: (line: string) => void;
  readonly startLoopback?: typeof startLoopbackAuthorizationReceiver;
}

const REVOCATION: Readonly<Record<ApiConnectionRemoteRevocation, AdminSurfaceRevocationOutcome>> = { confirmed: "revoked", pending: "revocation-pending", "not-needed": "not-needed" };

/** The one refusal for an id the plugin does not declare here, a foreign workspace, or no admin. */
function notAvailable(): ApiConnectionError {
  return new ApiConnectionError({ code: "connection-not-found", message: "This connection is not available to this plugin here. Reopen the plugin's settings from this site's admin and retry." });
}

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "unknown";
}

/** What a status is built from: a record (with its staged switch's account) or a service status view. */
type StatusSource = Pick<ApiConnectionStatusView, "status" | "account" | "grantedScopes" | "pendingSwitch">;
const NEVER_CONNECTED: StatusSource = { status: "disconnected", account: null, grantedScopes: [], pendingSwitch: null };

/** The plugin's declared scope sets whose scopes are all granted. @complexity O(s) hook calls. */
async function grantedScopeSets(host: ApiConnectionHost, connection: DeclaredApiConnection, granted: readonly string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const id of connection.scopeSets) {
    if ((await host.requestedScopes({ connection, scopeSetIds: [id] })).every((scope) => granted.includes(scope))) ids.push(id);
  }
  return ids;
}

/** Token-free status; scope sets are the plugin's own ids, never raw provider scopes. */
async function statusFrom(host: ApiConnectionHost, connection: DeclaredApiConnection, view: StatusSource): Promise<AdminSurfaceConnectionStatus> {
  return {
    connectionId: connection.descriptor.connectionId, state: view.status, accountLabel: view.account?.displayName ?? null,
    grantedScopeSetIds: view.status === "connected" ? await grantedScopeSets(host, connection, view.grantedScopes) : [],
    pendingSwitchAccountLabel: view.pendingSwitch?.displayName ?? null,
  };
}

const intentOf = (action: AdminSurfaceConnectionAction) => (action === "switch" ? "switch-account" as const : "connect" as const);

/**
 * Builds the per-call connections port for one plugin, workspace and (for account actions) admin.
 * @complexity Each call: one contribution load plus one record read or one service call.
 */
export function createSurfaceConnections(
  required: SurfaceConnectionsDeps & { readonly pluginId: string; readonly workspaceId: string; readonly principalId?: string | undefined },
  _optional: Record<string, never> = {},
): AdminSurfaceConnections {
  const { host, pluginId, workspaceId, principalId } = required;
  const log = required.log ?? ((line: string) => console.warn(line));

  async function resolve(connectionId: string): Promise<{ readonly connection: DeclaredApiConnection; readonly connectionRef: string }> {
    const connection = workspaceId === host.workspaceId ? (await host.listConnections({ pluginId })).find((candidate) => candidate.descriptor.connectionId === connectionId) : undefined;
    if (!connection) throw notAvailable();
    return { connection, connectionRef: deriveApiConnectionKey({ workspaceId, pluginId, connectionId }) };
  }

  /** Account actions need the admin the route authenticated; Jini checks it too. */
  async function forActor(connectionId: string) {
    if (principalId === undefined) throw notAvailable();
    return { ...(await resolve(connectionId)), actorId: principalId };
  }

  /** Desktop: deposit the callback fields once the loopback sign-in redeemed; failures go to the log by code. */
  function watchDesktopCompletion(connectionId: string, attemptId: string, completion: Promise<{ readonly callbackFields: Readonly<Record<string, string>> } | null> | undefined): void {
    void completion?.then(
      (done) => { if (done) host.callbackInbox.deposit({ workspaceId, pluginId, connectionId, attemptId, fields: done.callbackFields }); },
      (error: unknown) => log(`[admin-surfaces] desktop sign-in for '${pluginId}' did not complete: ${codeOf(error)}`),
    );
  }

  return {
    async getAccessToken({ connectionId }) {
      const { connectionRef } = await resolve(connectionId);
      return host.toolConnections.getAccessToken({ workspaceId, pluginId, connectionRef });
    },
    async status({ connectionId }) {
      const { connection, connectionRef } = await resolve(connectionId);
      const record = await host.records.read({ key: connectionRef });
      return statusFrom(host, connection, record ? { ...record, pendingSwitch: record.staged?.account ?? null } : NEVER_CONNECTED);
    },
    async begin({ connectionId, action }, optional = {}) {
      const { connection, actorId } = await forActor(connectionId);
      const start = await startApiConnectionSignIn({ host, connection, actorId, intent: intentOf(action), scopeSetIds: optional.scopeSetIds ?? [] }, {
        ...(optional.startParams === undefined ? {} : { startParams: optional.startParams }),
        ...(required.startLoopback === undefined ? {} : { startLoopback: required.startLoopback }),
      });
      const issued = { authorizationUrl: start.authorizationUrl, attemptId: callbackAttemptId({ state: start.state }), expiresAt: start.expiresAt };
      watchDesktopCompletion(connectionId, issued.attemptId, start.completion);
      required.onSignInIssued?.({ ...issued, pluginId, connectionId });
      return issued;
    },
    async confirmSwitch({ connectionId }) {
      const { connection, connectionRef, actorId } = await forActor(connectionId);
      const view = await host.serviceFor({ connection }).confirmSwitchAccount({ connectionRef, actorId });
      return statusFrom(host, connection, view);
    },
    async cancelSwitch({ connectionId }) {
      const { connection, connectionRef } = await forActor(connectionId);
      return statusFrom(host, connection, await host.serviceFor({ connection }).cancelSwitchAccount({ connectionRef }));
    },
    async disconnect({ connectionId }) {
      const { connection, connectionRef } = await forActor(connectionId);
      const outcome = await host.serviceFor({ connection }).disconnect({ connectionRef });
      return { ...(await statusFrom(host, connection, outcome)), revocation: REVOCATION[outcome.remoteRevocation] };
    },
    async takeCallbackFields({ connectionId, attemptId }) {
      await resolve(connectionId);
      return host.callbackInbox.take({ workspaceId, pluginId, connectionId, attemptId });
    },
  };
}
