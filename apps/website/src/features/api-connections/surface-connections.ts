import { createAdminSurfaceConnections } from '@jini-ai/agent-plugins/admin-surfaces/connections';
import type { AdminSurfaceConnections } from '@jini-ai/agent-plugins/admin-surfaces';
import { bindAdminSurfaceConnectionsHost, type SurfaceConnectionsDeps } from './surface-connection-bindings.js';
export { createAdminSurfaceConnections };
export type { IssuedSignIn } from '@jini-ai/agent-plugins/admin-surfaces/connections';
export type { SurfaceConnectionsDeps } from './surface-connection-bindings.js';

/** Legacy host signature: the one API host and frozen-account map fulfill the local domain port. */
export function createSurfaceConnections(required: SurfaceConnectionsDeps & { readonly pluginId: string; readonly workspaceId: string; readonly principalId?: string; readonly signal?: AbortSignal }, optional: Record<string, never> = {}): AdminSurfaceConnections {
  return createAdminSurfaceConnections({ host: bindAdminSurfaceConnectionsHost(required), pluginId: required.pluginId, workspaceId: required.workspaceId,
    ...(required.principalId === undefined ? {} : { principalId: required.principalId }),
    ...(required.signal === undefined ? {} : { signal: required.signal }),
    ...(required.onSignInIssued === undefined ? {} : { onSignInIssued: required.onSignInIssued }),
  }, optional);
}
