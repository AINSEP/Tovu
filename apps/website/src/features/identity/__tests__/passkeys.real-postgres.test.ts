import type { StorageKernel } from '#src/platform/db/kernel/port';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { beginOwnerLogin, beginOwnerPasskeyEnrollment, confirmOwnerPasskeyEnrollment, beginOwnerPasskeyLogin,
  completeOwnerPasskeyLogin, resetOwnerPassword, type OwnerPasskeyDeps } from '@jini-ai/user-management/server';
import { freshPostgresDatabase, dropDatabase } from '#src/platform/db/__tests__/postgres-database';
import { openPostgresKernel } from '#src/platform/db/kernel/drivers/postgres';
import type { ContentDatabase } from '#src/platform/db/content-database.generated';
import { migrateContentDatabase } from '#src/platform/db/migrations/index';
import { createSqliteIdentityRouteDeps } from '../wiring.js';
import { createPermissionGrantRegistry } from '../permission-grants.js';
import { identityServiceDepsFrom } from '#src/server/inbound/admin-http/routes/users/deps';

/** Two independent PostgreSQL pools prove identity serialization, not a process-local mutex. */
test('real PostgreSQL passkey completion has one winner, atomic session rollback, and recovery clears credentials', async t => {
  const database = `tovu_passkeys_${process.pid}`;
  const url = freshPostgresDatabase(database);
  const first = openPostgresKernel<ContentDatabase>({ connectionString: url });
  const second = openPostgresKernel<ContentDatabase>({ connectionString: url });
  t.after(async () => { await first.close(); await second.close(); dropDatabase({ database }); });
  await migrateContentDatabase(first as unknown as StorageKernel<unknown>);
  const workspaceId = 'synthetic-passkey-site';
  const clock = { nowIso: () => '2026-11-06T00:00:00.000Z', nowMs: () => Date.parse('2026-11-06T00:00:00.000Z') };
  async function deps(kernel: typeof first): Promise<OwnerPasskeyDeps> {
    const identity = createSqliteIdentityRouteDeps({ db: kernel, workspaceId, clock,
      idGen: { newId: () => randomUUID() }, permissionGrants: createPermissionGrantRegistry(),
      ownerCredentials: { username: 'synthetic-owner', password: 'synthetic-password' } });
    await identity.identityReady;
    const auth = identityServiceDepsFrom({ ...identity, clock, idGen: { newId: () => randomUUID() } });
    return { mfa: { auth, store: identity.mfaStore!, seededOwnerPrincipalId: await identity.ownerPrincipalId,
      secrets: { seal: async input => input.secret, open: async input => input.sealedSecret },
      totp: { generate: () => 'synthetic', uri: () => 'otpauth://synthetic', verify: async () => 100 } },
      credentials: identity.passkeyStore!, site: { origin: 'http://localhost:3000', rpId: 'localhost', name: 'Synthetic' },
      webauthn: { registration: async () => ({ challenge: 'registration' }), authentication: async () => ({ challenge: 'assertion' }),
        register: async () => ({ id: 'synthetic-public-key', publicKey: 'public', counter: 0 }),
        authenticate: async ({ credential }) => credential.counter + 1 } };
  }
  const a = await deps(first), b = await deps(second);
  const scope = { workspaceId, principalId: a.mfa.seededOwnerPrincipalId };
  assert.equal(b.mfa.seededOwnerPrincipalId, scope.principalId);
  await a.mfa.store.saveFactor({ ...scope, sealedSecret: 'synthetic', lastStep: 99 });
  const registration = await beginOwnerPasskeyEnrollment({ deps: a, input: { ...scope, password: 'synthetic-password', code: '123456' } });
  await confirmOwnerPasskeyEnrollment({ deps: a, input: { ...scope, pendingToken: registration.pendingToken, response: {} } });
  async function begin() {
    const password = await beginOwnerLogin({ deps: a.mfa, input: { workspaceId, username: 'synthetic-owner', password: 'synthetic-password' } });
    assert.ok('pendingToken' in password);
    return beginOwnerPasskeyLogin({ deps: a, input: { workspaceId, pendingToken: password.pendingToken } });
  }
  const begun = await begin();
  assert.equal((await a.mfa.auth.repos.sessions.listByPrincipalId(scope)).length, 0);
  const input = { workspaceId, pendingToken: begun.pendingToken, response: { id: 'synthetic-public-key' } };
  const results = await Promise.allSettled([completeOwnerPasskeyLogin({ deps: a, input }), completeOwnerPasskeyLogin({ deps: b, input })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await a.mfa.auth.repos.sessions.listByPrincipalId(scope)).length, 1);
  assert.equal((await a.credentials.list(scope))[0]?.counter, 1);
  const next = await begin();
  const save = a.mfa.auth.repos.sessions.save;
  a.mfa.auth.repos.sessions.save = async () => { throw Error('injected session failure'); };
  const retryInput = { ...input, pendingToken: next.pendingToken };
  await assert.rejects(completeOwnerPasskeyLogin({ deps: a, input: retryInput }), /injected session failure/);
  assert.equal((await a.credentials.list(scope))[0]?.counter, 1);
  a.mfa.auth.repos.sessions.save = save;
  await completeOwnerPasskeyLogin({ deps: a, input: retryInput });
  assert.equal((await a.credentials.list(scope))[0]?.counter, 2);
  await resetOwnerPassword({ deps: { auth: a.mfa.auth, mfa: a.mfa, seededOwnerPrincipalId: scope.principalId,
    codes: { replace: async () => {}, clear: async () => {}, contains: async () => false } },
    input: { ...scope, password: 'synthetic-recovered-password' } });
  assert.deepEqual(await a.credentials.list(scope), []);
  assert.equal(await a.mfa.store.factor(scope), null);
  assert.ok((await a.mfa.auth.repos.sessions.listByPrincipalId(scope)).every(session => !!session.revokedAt));
});
