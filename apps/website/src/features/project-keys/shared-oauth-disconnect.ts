import { createHash } from 'node:crypto';
import { ApiConnectionError, disconnectApiConnection, type ApiConnectionHooks } from '@jini-ai/integrations/api-connections';
import type { Clock } from '@jini-ai/core/primitives';
import type { SharedOAuthOwnerStorage } from '../api-connections/shared-owner.js';
import type { KeyAttachments, ProjectKeyTransaction } from './attachments.js';

export interface SharedOAuthDisconnectReport {
  id: string; label: string; sites: string[]; revision: number; sourceDigest: string;
  applied: boolean; status: string; remoteRevocation: 'confirmed' | 'pending' | 'not-needed';
}

type DisconnectOwner = { storage: SharedOAuthOwnerStorage; attachments: KeyAttachments; transaction: ProjectKeyTransaction; clock: Clock };
const changed = () => new ApiConnectionError({ code: 'storage-conflict', message: 'This saved connection or its site grants changed. Review the disconnect confirmation again.' });

/** Review only the selected owner connection and its current grants.
 * @complexity One context/record lookup and one selected connection's grant query; no token read.
 */
export async function inspectSharedOAuthDisconnect(required: DisconnectOwner & { credentialId: string }, _optional = {}) {
  const { storage, credentialId } = required;
  const [context, record, sites] = await Promise.all([storage.readContext({ credentialId }), storage.records.read({ key: credentialId }), required.attachments.usersOf({ keyId: credentialId })]);
  if (!context || !record || record.workspaceId !== 'project' || record.pluginId !== context.identity.pluginId || record.connectionId !== context.identity.connectionId) throw changed();
  const sourceDigest = createHash('sha256').update(JSON.stringify({ credentialId, revision: record.revision, sites })).digest('hex');
  const report: SharedOAuthDisconnectReport = { id: credentialId, label: context.descriptor.label, sites: sites.map(site => site.siteName),
    revision: record.revision, sourceDigest, applied: false, status: record.status, remoteRevocation: 'pending' };
  return { context, record, report };
}

/** Stop this owner's shared connection and every site grant atomically before provider traffic.
 * Jini owns pending-revocation/retry semantics. Without a loaded plugin hook, remote confirmation
 * remains pending and disabled tokens stay available for an explicit retry by that plugin.
 * @complexity Selected-row CAS plus one connection's grant delete, then Jini's bounded lifecycle I/O.
 */
export async function disconnectSharedOAuth(required: DisconnectOwner & {
  credentialId: string; expectedRevision: number; expectedDigest: string;
}, optional: { revoke?: ApiConnectionHooks['revoke'] } = {}): Promise<SharedOAuthDisconnectReport> {
  const inspected = await required.transaction({ run: async () => {
    const current = await inspectSharedOAuthDisconnect(required);
    if (current.record.revision !== required.expectedRevision || current.report.sourceDigest !== required.expectedDigest) throw changed();
    if (current.record.status !== 'revocation-pending') {
      const stopped = { ...current.record, status: 'revocation-pending' as const, generation: current.record.generation + 1,
        revision: current.record.revision + 1, staged: null, updatedAt: new Date(required.clock.nowMs()).toISOString() };
      if (!await required.storage.records.compareAndSet({ key: required.credentialId, expectedRevision: current.record.revision, record: stopped })) throw changed();
    }
    await required.attachments.removeKey({ keyId: required.credentialId });
    return current;
  } });
  const result = await disconnectApiConnection({ deps: { descriptor: inspected.context.descriptor, records: required.storage.records,
    tokens: required.storage.tokensFor({ context: inspected.context }), clock: required.clock,
    hooks: { revoke: optional.revoke ?? (async () => { throw Object.assign(new Error('Provider revocation is not available in this owner window.'), { code: 'provider-unreachable' }); }) } },
    connectionRef: required.credentialId, workspaceId: 'project' });
  return { ...inspected.report, applied: true, status: result.status, remoteRevocation: result.remoteRevocation };
}
