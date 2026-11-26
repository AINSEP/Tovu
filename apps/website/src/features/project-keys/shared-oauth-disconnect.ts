import { createHash } from 'node:crypto';
import { type ApiConnectionHooks } from '@jini-ai/integrations/api-connections';
import { inspectSharedOAuthDisconnect as inspect, disconnectSharedOAuth as disconnect } from '@jini-ai/integrations/api-connections/shared-oauth-disconnect';

const digest = ({ text }: { text: string }) => createHash('sha256').update(text).digest('hex');
const copy = { changed: 'This saved connection or its site grants changed. Review the disconnect confirmation again.',
  revocationUnavailable: 'Provider revocation is not available in this owner window.' };

export const inspectSharedOAuthDisconnect = (required: Omit<Parameters<typeof inspect>[0], 'ownerWorkspaceId' | 'digest' | 'copy'>, _optional = {}) =>
  inspect({ ...required, ownerWorkspaceId: 'project', digest, copy });

export const disconnectSharedOAuth = (required: Omit<Parameters<typeof disconnect>[0], 'ownerWorkspaceId' | 'digest' | 'copy'>, optional: { revoke?: ApiConnectionHooks['revoke'] } = {}) =>
  disconnect({ ...required, ownerWorkspaceId: 'project', digest, copy }, optional);
