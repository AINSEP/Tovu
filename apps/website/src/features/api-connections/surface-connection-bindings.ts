import { ApiConnectionError, deriveApiConnectionKey, type DeclaredApiConnection } from '@jini-ai/integrations/api-connections';
import type { AdminSurfaceConnectionsHost } from '@jini-ai/agent-plugins/admin-surfaces/connections';
import { startApiConnectionSignIn } from './connect.js';
import type { ApiConnectionHost } from './host.js';
import type { IssuedSignIn } from '@jini-ai/agent-plugins/admin-surfaces/connections';
import { confirmedTokenOptions, type FrozenConnectionAccounts } from '@jini-ai/agent-plugins/connect/executable';

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

/** Adapts the existing host without constructing another host, inbox, store or frozen-account map. */
export function bindAdminSurfaceConnectionsHost(required: Pick<SurfaceConnectionsDeps, 'host' | 'frozen'>, _optional: Record<string, never> = {}): AdminSurfaceConnectionsHost<DeclaredApiConnection> {
  const { host, frozen } = required;
  const shared = host.sharedOAuth;
  return {
    workspaceId: host.workspaceId, nowMs: () => host.clock.nowMs(), connectionKey: deriveApiConnectionKey,
    listConnections: input => host.listConnections(input), requestedScopes: input => host.requestedScopes(input),
    readRecord: input => host.records.read(input),
    getAccessToken: (input, options) => host.toolConnections.getAccessToken(input, options),
    startSignIn: (input, options) => startApiConnectionSignIn({ host, ...input }, options),
    service: input => host.serviceFor(input), attempts: host.lastSignInAttempts, callbackInbox: host.callbackInbox,
    ...(shared ? { sharedOAuth: {
      hasBinding: (connection: DeclaredApiConnection) => shared.hasBinding(connection),
      async getStatus(connection: DeclaredApiConnection) {
        const status = await shared.getStatus(connection);
        return status && status.account ? { ...status, account: { ...status.account, displayName: `${status.account.displayName} (shared on this Mac)` } } : status;
      },
      stopUsing: (connection: DeclaredApiConnection) => shared.stopUsing(connection),
    } } : {}),
    notAvailable,
    ...(frozen ? { pinnedTokenOptions: (input: { signal?: AbortSignal | undefined; connectionRef: string }) => confirmedTokenOptions({ frozen, signal: input.signal, connectionRef: input.connectionRef }) } : {}),
  };
}
