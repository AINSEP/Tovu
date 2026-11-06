import type { PasskeyStore } from '@jini-ai/user-management/server';
import type { ContentKernel } from '../../platform/db/content-kernel.js';
import { createIdentityTransactions } from './repo.js';

/** Public keys/counters only. Every query joins the identity lock and rollback boundary.
 * @complexity One indexed query per method, list bounded to six rows (five-key cap plus overflow detection).
 */
export function createPasskeyStore({ kernel }: { kernel: ContentKernel }, _options: Record<string, never> = {}): PasskeyStore {
  const transactions = createIdentityTransactions({ kernel });
  return {
    list: scope => transactions.run({ workspaceId: scope.workspaceId, execute: () => kernel.run(async db => {
      const rows = await db.selectFrom('owner_passkeys').selectAll().where('workspace_id', '=', scope.workspaceId)
        .where('principal_id', '=', scope.principalId).orderBy('credential_id').limit(6).execute();
      return rows.map(r => ({ workspaceId: r.workspace_id, principalId: r.principal_id, id: r.credential_id,
        publicKey: r.public_key, counter: Number(r.counter), rpId: r.rp_id }));
    }) }),
    save: credential => transactions.run({ workspaceId: credential.workspaceId, execute: () => kernel.run(async db => {
      const result = await db.insertInto('owner_passkeys').values({ workspace_id: credential.workspaceId,
        principal_id: credential.principalId, credential_id: credential.id, public_key: credential.publicKey,
        counter: credential.counter, rp_id: credential.rpId }).onConflict(c => c.columns(['workspace_id', 'credential_id'])
          .doUpdateSet({ counter: credential.counter }).where('owner_passkeys.principal_id', '=', credential.principalId)
          .where('owner_passkeys.public_key', '=', credential.publicKey).where('owner_passkeys.rp_id', '=', credential.rpId))
        .executeTakeFirst();
      if (result.numInsertedOrUpdatedRows === 0n) throw new Error('Passkey credential ownership conflict');
    }) }),
    remove: input => transactions.run({ workspaceId: input.workspaceId, execute: () => kernel.run(async db => {
      await db.deleteFrom('owner_passkeys').where('workspace_id', '=', input.workspaceId)
        .where('principal_id', '=', input.principalId).where('credential_id', '=', input.id).execute();
    }) }),
    clear: scope => transactions.run({ workspaceId: scope.workspaceId, execute: () => kernel.run(async db => {
      await db.deleteFrom('owner_passkeys').where('workspace_id', '=', scope.workspaceId).where('principal_id', '=', scope.principalId).execute();
    }) }),
  };
}
