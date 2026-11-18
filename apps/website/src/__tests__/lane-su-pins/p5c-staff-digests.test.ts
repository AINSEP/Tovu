import assert from "node:assert/strict";
import { test } from "node:test";

import { sql } from "kysely";

import { createMfaStore } from "#src/features/identity/mfa.repo";
import { createRecoveryCodeStore } from "#src/features/identity/recovery-codes.repo";
import { SqlSessionRepo } from "#src/features/identity/repo";
import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";

/**
 * @file P5c (S0): staff session, pending-MFA-proof and recovery-code digests. The digests themselves
 * are produced inside `@jini-ai/user-management/server` (not lane code); lanes S/U move only the
 * storage that looks them up. So the rows below are frozen stored rows, as an N-1 install holds them
 * (literal `token_hash` / `code_hash` values of the digest class, inserted with raw SQL): each Tovu
 * store must find a row by exactly its digest and by no other, so a moved store cannot drop the
 * digest predicate and start matching any row of the workspace.
 */

const WS = "lane-su-ws";
const PRINCIPAL = "principal-1";
const NOW = "2026-11-17T00:00:00.000Z";
const SESSION_DIGEST = "5e1e0fa7c4a0c2b4f3d7a96c2a7d1b8e0c3f4a5b6d7e8f90a1b2c3d4e5f60718";
const OTHER_SESSION_DIGEST = "5e1e0fa7c4a0c2b4f3d7a96c2a7d1b8e0c3f4a5b6d7e8f90a1b2c3d4e5f60719";
const PENDING_DIGEST = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
const OTHER_PENDING_DIGEST = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f91";
const RECOVERY_DIGEST = "9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0";
const OTHER_RECOVERY_DIGEST = "9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a1";

async function seededKernel() {
  const kernel = freshSqliteContentKernel();
  await kernel.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES (${WS}, ${WS}, ${WS}, ${NOW})`);
  return kernel;
}

test("the staff session store finds a stored row by its digest and by no other", async () => {
  const kernel = await seededKernel();
  await kernel.execute(sql`INSERT INTO sessions (id, workspace_id, principal_id, token_hash, created_at, expires_at)
    VALUES ('session-1', ${WS}, ${PRINCIPAL}, ${SESSION_DIGEST}, ${NOW}, '2026-11-18T00:00:00.000Z')`);
  const sessions = new SqlSessionRepo(kernel);
  assert.equal((await sessions.findByTokenHash({ workspaceId: WS, tokenHash: SESSION_DIGEST }))?.id, "session-1");
  assert.equal(await sessions.findByTokenHash({ workspaceId: WS, tokenHash: OTHER_SESSION_DIGEST }), null);
});

test("the pending-proof store finds a stored row by its digest and by no other", async () => {
  const kernel = await seededKernel();
  await kernel.execute(sql`INSERT INTO owner_mfa_pending (workspace_id, principal_id, purpose, token_hash, expires_at, attempts, sealed_secret)
    VALUES (${WS}, ${PRINCIPAL}, 'verify', ${PENDING_DIGEST}, 1900000000000, 0, NULL)`);
  const store = createMfaStore({ kernel });
  assert.equal((await store.pending({ workspaceId: WS, tokenHash: PENDING_DIGEST }))?.tokenHash, PENDING_DIGEST);
  assert.equal(await store.pending({ workspaceId: WS, tokenHash: OTHER_PENDING_DIGEST }), null);
});

test("the recovery-code store contains a stored digest and no other", async () => {
  const kernel = await seededKernel();
  await kernel.execute(sql`INSERT INTO owner_recovery_codes (workspace_id, principal_id, code_hash) VALUES (${WS}, ${PRINCIPAL}, ${RECOVERY_DIGEST})`);
  const store = createRecoveryCodeStore({ kernel });
  assert.equal(await store.contains({ workspaceId: WS, principalId: PRINCIPAL, hash: RECOVERY_DIGEST }), true);
  assert.equal(await store.contains({ workspaceId: WS, principalId: PRINCIPAL, hash: OTHER_RECOVERY_DIGEST }), false);
});
