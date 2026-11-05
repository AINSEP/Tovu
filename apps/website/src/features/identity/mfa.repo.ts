import type { MfaStore } from '@jini-ai/user-management/server';
import type { ContentKernel } from '../../platform/db/content-kernel.js';
import { createIdentityTransactions } from './repo.js';

/** Store sealed owner factors and bounded pending proofs in the existing identity transaction.
 * Errors propagate for rollback; no plaintext factor or bearer proof is persisted.
 * @complexity Each method uses a fixed number of indexed queries and O(1) result space.
 */
export function createMfaStore(
  { kernel }: { kernel: ContentKernel },
  _options: Record<string, never> = {},
): MfaStore {
  const transactions = createIdentityTransactions({ kernel });
  const clearPending: MfaStore['clearPending'] = scope => transactions.run({ workspaceId: scope.workspaceId,
    execute: () => kernel.run(async db => {
      await db.deleteFrom('owner_mfa_pending').where('workspace_id', '=', scope.workspaceId)
        .where('principal_id', '=', scope.principalId).execute();
    }),
  });
  return {
    clearPending,
    factor: scope => transactions.run({ workspaceId: scope.workspaceId, execute: async () => {
      const row = await kernel.run(db => db.selectFrom('owner_mfa_factors').selectAll()
        .where('workspace_id', '=', scope.workspaceId).where('principal_id', '=', scope.principalId).executeTakeFirst());
      return row ? { ...scope, sealedSecret: row.sealed_secret, lastStep: Number(row.last_step) } : null;
    } }),
    saveFactor: factor => transactions.run({ workspaceId: factor.workspaceId, execute: () => kernel.run(async db => {
      const values = { workspace_id: factor.workspaceId, principal_id: factor.principalId,
        sealed_secret: factor.sealedSecret, last_step: factor.lastStep };
      await db.insertInto('owner_mfa_factors').values(values).onConflict(conflict =>
        conflict.columns(['workspace_id', 'principal_id']).doUpdateSet(values)).execute();
    }) }),
    pending: input => transactions.run({ workspaceId: input.workspaceId, execute: async () => {
      const row = await kernel.run(db => db.selectFrom('owner_mfa_pending').selectAll()
        .where('workspace_id', '=', input.workspaceId).where('token_hash', '=', input.tokenHash).executeTakeFirst());
      if (!row) return null;
      return { workspaceId: row.workspace_id, principalId: row.principal_id, purpose: row.purpose as 'login' | 'enroll',
        tokenHash: row.token_hash, expiresAt: Number(row.expires_at), attempts: Number(row.attempts),
        ...(row.sealed_secret === null ? {} : { sealedSecret: row.sealed_secret }) };
    } }),
    savePending: pending => transactions.run({ workspaceId: pending.workspaceId, execute: () => kernel.run(async db => {
      const values = { workspace_id: pending.workspaceId, principal_id: pending.principalId, purpose: pending.purpose,
        token_hash: pending.tokenHash, expires_at: pending.expiresAt, attempts: pending.attempts,
        sealed_secret: pending.sealedSecret ?? null };
      await db.insertInto('owner_mfa_pending').values(values).onConflict(conflict =>
        conflict.columns(['workspace_id', 'principal_id', 'purpose']).doUpdateSet(values)).execute();
    }) }),
    clear: scope => transactions.run({ workspaceId: scope.workspaceId, execute: async () => {
      await clearPending(scope);
      await kernel.run(db => db.deleteFrom('owner_mfa_factors').where('workspace_id', '=', scope.workspaceId)
        .where('principal_id', '=', scope.principalId).execute());
    } }),
  };
}
