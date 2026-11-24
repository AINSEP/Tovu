import type { MfaStore, PasskeyStore, RecoveryCodeStore } from '@jini-ai/user-management/server';
import { createSqlMfaStore, createSqlPasskeyStore, createSqlRecoveryCodeStore } from '@jini-ai/user-management/server/sql';
import { type ContentKernel, schemaErasedKernel } from '../../platform/db/content-kernel.js';
import { createIdentityTransactions } from './repo.js';

/**
 * @file Tovu's bindings of the Jini SQL identity stores (`@jini-ai/user-management/server/sql`): the
 * content kernel (schema erased once, in `schemaErasedKernel`), the identity transaction helper from `repo.ts`
 * and Tovu's table names. The store logic and queries live in Jini; nothing here queries.
 */

/** Bind the owner recovery-code store to Tovu's `owner_recovery_codes` table on the content kernel. */
export function createRecoveryCodeStore({ kernel }: { kernel: ContentKernel }, _options: Record<string, never> = {}): RecoveryCodeStore {
  return createSqlRecoveryCodeStore({ kernel: schemaErasedKernel({ store: kernel }), tables: { recoveryCodes: 'owner_recovery_codes' } });
}

/** Bind the owner passkey store to Tovu's `owner_passkeys` table, inside the identity transaction on the same kernel. */
export function createPasskeyStore({ kernel }: { kernel: ContentKernel }, _options: Record<string, never> = {}): PasskeyStore {
  return createSqlPasskeyStore({ kernel: schemaErasedKernel({ store: kernel }), transactions: createIdentityTransactions({ kernel }), tables: { passkeys: 'owner_passkeys' } });
}

/** Bind the owner MFA store to Tovu's `owner_mfa_factors` / `owner_mfa_pending` (and `owner_passkeys`, cleared with the factor), inside the identity transaction. */
export function createMfaStore({ kernel }: { kernel: ContentKernel }, _options: Record<string, never> = {}): MfaStore {
  return createSqlMfaStore({
    kernel: schemaErasedKernel({ store: kernel }), transactions: createIdentityTransactions({ kernel }),
    tables: { factors: 'owner_mfa_factors', pending: 'owner_mfa_pending', passkeys: 'owner_passkeys' },
  });
}
