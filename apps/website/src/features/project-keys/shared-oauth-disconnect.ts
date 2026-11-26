import { ApiConnectionError, disconnectApiConnection, type ApiConnectionHooks } from '@jini-ai/integrations/api-connections';
import { inspectSharedOAuthDisconnect as inspect, disconnectSharedOAuth as disconnect } from '@jini-ai/user-management/project-keys/shared-oauth-disconnect';

const changed = () => new ApiConnectionError({ code: 'storage-conflict', message: 'This saved connection or its site grants changed. Review the disconnect confirmation again.' });

export function inspectSharedOAuthDisconnect(required: Omit<Parameters<typeof inspect>[0], 'ownerWorkspaceId' | 'changed' | 'disconnectApiConnection'>, _optional = {}) {
  return inspect({ ...required, ownerWorkspaceId: 'project', changed, disconnectApiConnection });
}

export function disconnectSharedOAuth(required: Omit<Parameters<typeof disconnect>[0], 'ownerWorkspaceId' | 'changed' | 'disconnectApiConnection'>, optional: { revoke?: ApiConnectionHooks['revoke'] } = {}) {
  return disconnect({ ...required, ownerWorkspaceId: 'project', changed, disconnectApiConnection }, optional);
}
