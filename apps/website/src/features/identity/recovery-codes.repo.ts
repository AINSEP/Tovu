import type { RecoveryCodeStore } from '@jini-ai/user-management/server';
import type { ContentKernel } from '../../platform/db/content-kernel.js';

/** Persist only digests, using the same kernel/transaction as the password and session repositories.
 * @returns A workspace/owner-scoped store; errors propagate to the identity transaction for rollback.
 * @complexity Each replace writes at most ten rows in one insert after one scoped delete. Contains
 * is one primary-key lookup returning at most one digest; clear deletes at most ten scoped rows.
 */
export function createRecoveryCodeStore(
  { kernel }: { kernel: ContentKernel },
  _options: Record<string, never> = {},
): RecoveryCodeStore {
  const clear: RecoveryCodeStore['clear'] = scope => kernel.run(async db => {
    await db.deleteFrom('owner_recovery_codes').where('workspace_id', '=', scope.workspaceId)
      .where('principal_id', '=', scope.principalId).execute();
  });
  return {
    clear,
    async replace(input) {
      if (input.hashes.length > 10) throw new RangeError('Recovery codes could not be saved. Generate a new set of ten codes. Details: recovery-code-limit');
      await clear(input);
      if (input.hashes.length === 0) return;
      await kernel.run(db => db.insertInto('owner_recovery_codes').values(input.hashes.map(hash => ({
        workspace_id: input.workspaceId, principal_id: input.principalId, code_hash: hash,
      }))).execute());
    },
    async contains(input) {
      const row = await kernel.run(db => db.selectFrom('owner_recovery_codes').select('code_hash')
        .where('workspace_id', '=', input.workspaceId).where('principal_id', '=', input.principalId)
        .where('code_hash', '=', input.hash).limit(1).executeTakeFirst());
      return row !== undefined;
    },
  };
}
