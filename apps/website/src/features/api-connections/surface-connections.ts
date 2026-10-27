import { ApiConnectionError, deriveApiConnectionKey, type ApiConnectionStagedSwitch, type ApiConnectionStatusView } from "@jini-ai/integrations/api-connections";
import {
  ADMIN_SURFACE_ACTION_INTENTS, type AdminSurfaceAuthorizationStart, type AdminSurfaceConnections, type AdminSurfaceConnectionStatus, type AdminSurfaceSignInAttempt,
} from "@jini-ai/agent-plugins/admin-surfaces";

import { startApiConnectionSignIn } from "./connect.js";
import type { DeclaredApiConnection } from "./contribution.js";
import type { ApiConnectionHost } from "./host.js";
import { confirmedTokenOptions, type FrozenConnectionAccounts } from "../agent-plugins/executable-tools/host-capabilities.js";

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
 * the URLs this host issued. Revocation outcomes are reported verbatim: `confirmed` only when the
 * provider confirmed. A sign-in's `attemptId` is the service's own random id; the OAuth `state`
 * never reaches the plugin.
 */

export interface IssuedSignIn extends AdminSurfaceAuthorizationStart {
  readonly pluginId: string;
  readonly connectionId: string;
}

export interface SurfaceConnectionsDeps {
  readonly host: ApiConnectionHost;
  /** Called with every authorization URL `begin` issued (the per-request registry the admin route reads). */
  readonly onSignInIssued?: (issued: IssuedSignIn) => void;
  /** Accounts the assistant's confirmation froze (shared with the executable-tool registrar); with the
   *  call's `signal`, an action run as an assistant tool gets only the account its card showed. */
  readonly frozen?: FrozenConnectionAccounts;
}

/** The one refusal for an id the plugin does not declare here, a foreign workspace, or no admin. */
function notAvailable(): ApiConnectionError {
  return new ApiConnectionError({ code: "connection-not-found", message: "This connection is not available to this plugin here. Reopen the plugin's settings from this site's admin and retry." });
}

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "unknown";
}

/** Our own lowercase hyphenated codes pass; anything else (an upstream library's code) becomes one generic code. */
const SAFE_ATTEMPT_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function failedAttempt(error: unknown): AdminSurfaceSignInAttempt {
  const code = codeOf(error);
  return { code: code.length <= 64 && SAFE_ATTEMPT_CODE.test(code) ? code : "sign-in-failed", nextAction: "reconnect" };
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

/** A staged switch's account while it can still be confirmed: after its expiry the confirm refuses, so no label. @complexity O(1). */
function liveStagedAccount(host: ApiConnectionHost, staged: ApiConnectionStagedSwitch | null | undefined): StatusSource["pendingSwitch"] {
  return staged && Date.parse(staged.expiresAt) > host.clock.nowMs() ? staged.account : null;
}

/** Token-free status; scope sets are the plugin's own ids, never raw provider scopes. */
async function statusFrom(host: ApiConnectionHost, connection: DeclaredApiConnection, view: StatusSource, connectionRef: string): Promise<AdminSurfaceConnectionStatus> {
  return {
    connectionId: connection.descriptor.connectionId, status: view.status, accountLabel: view.account?.displayName ?? null,
    grantedScopeSetIds: view.status === "connected" ? await grantedScopeSets(host, connection, view.grantedScopes) : [],
    pendingSwitchAccountLabel: view.pendingSwitch?.displayName ?? null,
    lastSignInAttempt: host.lastSignInAttempts.get(connectionRef) ?? null,
  };
}

/**
 * Builds the per-call connections port for one plugin, workspace and (for account actions) admin.
 * @complexity Each call: one contribution load plus one record read or one service call.
 */
export function createSurfaceConnections(
  required: SurfaceConnectionsDeps & { readonly pluginId: string; readonly workspaceId: string; readonly principalId?: string | undefined; readonly signal?: AbortSignal | undefined },
  _optional: Record<string, never> = {},
): AdminSurfaceConnections {
  const { host, pluginId, workspaceId, principalId } = required;

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

  /** An action's result view, its staged-switch label re-read from the record so an expired one never shows. */
  async function viewAfterAction(connectionRef: string, view: ApiConnectionStatusView): Promise<StatusSource> {
    return { ...view, pendingSwitch: liveStagedAccount(host, (await host.records.read({ key: connectionRef }))?.staged) };
  }

  /**
   * Desktop: deposit the callback fields once the loopback sign-in redeemed, and clear a failed
   * attempt; a failure is kept (code and next action only) for `status` and logged by code only.
   */
  function watchDesktopCompletion(connectionId: string, attemptId: string, completion: Promise<{ readonly callbackFields: Readonly<Record<string, string>> } | null> | undefined): void {
    const connectionRef = deriveApiConnectionKey({ workspaceId, pluginId, connectionId });
    void completion?.then(
      (done) => {
        if (!done) return;
        host.lastSignInAttempts.delete(connectionRef);
        host.callbackInbox.deposit({ workspaceId, pluginId, connectionId, attemptId, fields: done.callbackFields });
      },
      // Error codes only: a desktop sign-in that failed after the browser opened.
      (error: unknown) => {
        host.lastSignInAttempts.set(connectionRef, failedAttempt(error));
        console.warn(`[admin-surfaces] desktop sign-in for '${pluginId}' did not complete: ${codeOf(error)}`);
      },
    );
  }

  return {
    async getAccessToken({ connectionId }) {
      const { connectionRef } = await forActor(connectionId);
      const pinned = required.frozen ? confirmedTokenOptions({ frozen: required.frozen, signal: required.signal, connectionRef }) : {};
      return host.toolConnections.getAccessToken({ workspaceId, pluginId, connectionRef }, pinned);
    },
    async status({ connectionId }) {
      const { connection, connectionRef } = await resolve(connectionId);
      const record = await host.records.read({ key: connectionRef });
      return statusFrom(host, connection, record ? { ...record, pendingSwitch: liveStagedAccount(host, record.staged) } : NEVER_CONNECTED, connectionRef);
    },
    async begin({ connectionId, action }, optional = {}) {
      const { connection, actorId } = await forActor(connectionId);
      const start = await startApiConnectionSignIn({ host, connection, actorId, intent: ADMIN_SURFACE_ACTION_INTENTS[action], scopeSetIds: optional.scopeSetIds ?? [] }, {
        ...(optional.startParams === undefined ? {} : { startParams: optional.startParams }),
      });
      const issued = { authorizationUrl: start.authorizationUrl, attemptId: start.attemptId, expiresAt: start.expiresAt };
      watchDesktopCompletion(connectionId, issued.attemptId, start.completion);
      required.onSignInIssued?.({ ...issued, pluginId, connectionId });
      return issued;
    },
    async confirmSwitch({ connectionId }) {
      const { connection, connectionRef, actorId } = await forActor(connectionId);
      const view = await host.serviceFor({ connection }).confirmSwitchAccount({ connectionRef, workspaceId, actorId });
      return statusFrom(host, connection, await viewAfterAction(connectionRef, view), connectionRef);
    },
    async cancelSwitch({ connectionId }) {
      const { connection, connectionRef } = await forActor(connectionId);
      const view = await host.serviceFor({ connection }).cancelSwitchAccount({ connectionRef, workspaceId });
      return statusFrom(host, connection, await viewAfterAction(connectionRef, view), connectionRef);
    },
    async disconnect({ connectionId }) {
      const { connection, connectionRef } = await forActor(connectionId);
      const outcome = await host.serviceFor({ connection }).disconnect({ connectionRef, workspaceId });
      // Same vocabulary on both sides: the provider's outcome passes through unchanged.
      return { ...(await statusFrom(host, connection, await viewAfterAction(connectionRef, outcome), connectionRef)), revocation: outcome.remoteRevocation };
    },
    async takeCallbackFields({ connectionId, attemptId }) {
      await resolve(connectionId);
      return host.callbackInbox.take({ workspaceId, pluginId, connectionId, attemptId });
    },
  };
}
