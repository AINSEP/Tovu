import type { RecoveryCodeStore } from '@jini-ai/user-management/server';
import { createSqlRecoveryCodeStore } from '@jini-ai/user-management/server/sql';
import { type ContentKernel, schemaErasedKernel } from '../../platform/db/content-kernel.js';

/**
 * @file Tovu's bindings of the Jini SQL identity stores (`@jini-ai/user-management/server/sql`): the
 * content kernel (schema erased once, in `schemaErasedKernel`), the identity transaction helper from `repo.ts`
 * and Tovu's table names. The store logic and queries live in Jini; nothing here queries.
 */

/** Bind the owner recovery-code store to Tovu's `owner_recovery_codes` table on the content kernel. */
export function createRecoveryCodeStore({ kernel }: { kernel: ContentKernel }, _options: Record<string, never> = {}): RecoveryCodeStore {
  return createSqlRecoveryCodeStore({ kernel: schemaErasedKernel({ store: kernel }), tables: { recoveryCodes: 'owner_recovery_codes' } });
}
