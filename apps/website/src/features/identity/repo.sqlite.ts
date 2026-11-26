import { keepStoredRevocation } from '../../platform/db/keep-stored-revocation.js';
import type { MfaStore, PasskeyStore, RecoveryCodeStore } from "@jini-ai/user-management/server";
import type { AssertVersionedWritePort } from "@jini-ai/core/optimistic-concurrency";
import { createSqlMfaStore, createSqlPasskeyStore, createSqlRecoveryCodeStore } from "@jini-ai/user-management/server/sql";
import { type ContentKernel, contentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";

import { SqlPrincipalRepo, SqlUserRepo, createIdentityTransactions } from "@jini-ai/user-management/identity/repo";
import { SqlApiKeyRepo, SqlSessionRepo } from "@jini-ai/user-management/identity/repo.authentication";
import { SqlPolicyPermissionRepo, SqlPolicyRepo, SqlRoleRepo } from "@jini-ai/user-management/identity/repo.authorization";
import {
  SqlPrincipalPolicyRepo,
  SqlPrincipalRoleRepo,
  SqlRolePolicyRepo,
} from "@jini-ai/user-management/server/sql";

/**
 * @file The identity repo adapters on a site's SQLite `content.db`: each class is its `Sql*` repo
 * (the one Kysely query body, `repo.ts`), kept as a named class so `wiring.ts`, which builds them
 * from the content db handle, stays as it is. Each constructor takes the connection's kernel, or
 * the content db handle it is derived from.
 */

type Store = ContentKernel | ContentDb;

export class SqlitePrincipalRepo extends SqlPrincipalRepo {
  constructor(store: Store) {
    super({ kernel: schemaErasedKernel({ store }), table: "principals" });
  }
}

export class SqliteUserRepo extends SqlUserRepo {
  constructor({ store, assertVersionedWrite }: { store: Store; assertVersionedWrite: AssertVersionedWritePort }, _optional: Record<string, never> = {}) {
    super({ kernel: schemaErasedKernel({ store }), table: "identity_users", assertVersionedWrite });
  }
}

export class SqliteSessionRepo extends SqlSessionRepo {
  constructor(store: Store) {
    super({ kernel: schemaErasedKernel({ store }), table: "sessions", keepStoredRevocation: () => keepStoredRevocation({ table: "sessions" }) });
  }
}

export class SqliteRoleRepo extends SqlRoleRepo {
  constructor({ store, assertVersionedWrite }: { store: Store; assertVersionedWrite: AssertVersionedWritePort }, _optional: Record<string, never> = {}) {
    super({ kernel: schemaErasedKernel({ store }), table: "roles", assertVersionedWrite });
  }
}

export class SqlitePolicyRepo extends SqlPolicyRepo {
  constructor({ store, assertVersionedWrite }: { store: Store; assertVersionedWrite: AssertVersionedWritePort }, _optional: Record<string, never> = {}) {
    super({ kernel: schemaErasedKernel({ store }), table: "policies", assertVersionedWrite });
  }
}

export class SqlitePolicyPermissionRepo extends SqlPolicyPermissionRepo {
  constructor(store: Store) {
    super({ kernel: schemaErasedKernel({ store }), table: "policy_permissions" });
  }
}

export class SqliteRolePolicyRepo extends SqlRolePolicyRepo {
  constructor(store: Store) {
    const kernel = contentKernel({ store });
    super({ kernel: schemaErasedKernel({ store: kernel }), transactions: createIdentityTransactions({ kernel }), tables: { rolePolicies: "role_policies" } });
  }
}

export class SqlitePrincipalRoleRepo extends SqlPrincipalRoleRepo {
  constructor(store: Store) {
    const kernel = contentKernel({ store });
    super({ kernel: schemaErasedKernel({ store: kernel }), transactions: createIdentityTransactions({ kernel }), tables: { principalRoles: "principal_roles" } });
  }
}

export class SqlitePrincipalPolicyRepo extends SqlPrincipalPolicyRepo {
  constructor(store: Store) {
    const kernel = contentKernel({ store });
    super({ kernel: schemaErasedKernel({ store: kernel }), transactions: createIdentityTransactions({ kernel }), tables: { principalPolicies: "principal_policies" } });
  }
}

export class SqliteApiKeyRepo extends SqlApiKeyRepo {
  constructor(store: Store) {
    super({ kernel: schemaErasedKernel({ store }), table: "api_keys" });
  }
}

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
