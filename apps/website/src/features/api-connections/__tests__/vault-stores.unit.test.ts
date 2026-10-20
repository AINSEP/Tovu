/**
 * @file Phase-C unit tests for `vault-stores.ts`: the confined vault refuses every other
 * workspace, kind, owner, principal and binding before any crypto, and never invents a row id;
 * records are served only under the key they were sealed for and CAS maps conflicts to `false`;
 * attempts are consume-once (a racing delete reads as used), malformed attempt rows read as none,
 * and expired attempts are swept while live ones and other rows stay. Storage faults that are not
 * conflicts always propagate. In-memory vault repo; no network.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { InMemoryVaultRepo, VaultError, type SecretsVaultService } from "@jini-ai/platform/secrets/credential-sets";
import type { ApiConnectionAttempt, ApiConnectionRecord } from "@jini-ai/integrations/api-connections";

import { API_CONNECTION_VAULT_KIND, apiConnectionVaultScope, createApiConnectionVault, createApiConnectionVaultRecordStore } from "../vault-stores.js";

const WORKSPACE = "ws-1";

function stores(clock = { nowMs: () => Date.parse("2026-10-20T12:00:00.000Z") }) {
  const keyring = new InMemoryKeyring({ hkdfSalt: "vault-stores-c3" });
  const vault = createApiConnectionVault({ repo: new InMemoryVaultRepo({}), keyring, sealer: new AesGcmSecretSealer({ keyring }), clock, workspaceId: WORKSPACE });
  return { vault, records: createApiConnectionVaultRecordStore({ vault, workspaceId: WORKSPACE, clock }), scope: apiConnectionVaultScope({ workspaceId: WORKSPACE }) };
}

const record = (key: string, revision = 1): ApiConnectionRecord => ({
  key, workspaceId: WORKSPACE, pluginId: "acme-office", connectionId: "account", status: "connected", revision, generation: 1,
  account: { accountId: "acct-1", displayName: "Ada" }, grantedScopes: ["acme.files"], staged: null, revocationFailure: null, updatedAt: "2026-10-20T12:00:00.000Z",
});

const attempt = (state: string, expiresAt: string): ApiConnectionAttempt => ({
  state, attemptId: `attempt-id-${state}`, key: "key-1", ownerKey: "owner", browserBindingHash: "binding-hash", workspaceId: WORKSPACE, actorId: "admin-1", pluginId: "acme-office",
  connectionId: "account", intent: "connect", requestedScopes: ["acme.files"], redirectUri: "https://site.test/cb", generation: 0,
  codeVerifier: "v".repeat(43), createdAt: "2026-10-20T11:59:00.000Z", expiresAt,
});

/** Replaces one vault method with a fault (an instance property with the method's own type). */
function failing<K extends "put" | "delete">(vault: SecretsVaultService, method: K, error: Error): void {
  (vault as Pick<SecretsVaultService, K>)[method] = (async () => { throw error; }) as SecretsVaultService[K];
}

test("vault: every other workspace, kind, owner, principal or binding is refused as a context error", async () => {
  const { vault, scope } = stores();
  for (const other of [{ workspaceId: "ws-2" }, { kind: "custom" as const }, { ownerKey: "someone" }, { principalId: "p-1" }, { binding: "https://x.test" }]) {
    await assert.rejects(vault.get({ ...scope, ...other, id: "record:k" }), (error: unknown) => error instanceof VaultError && error.code === "context", JSON.stringify(other));
  }
  assert.equal(scope.kind, API_CONNECTION_VAULT_KIND);
});

test("vault: a row is never given a generated id (every row id is derived by its store)", async () => {
  const { vault, scope } = stores();
  await assert.rejects(vault.put({ ...scope, expectedRevision: null, provider: null, label: "no id", meta: { credentialFormat: "agent-plugin-state" }, payload: { value: 1 } }),
    (error: unknown) => error instanceof VaultError && error.code === "invalid-record");
});

test("records: a row sealed under another key is never served", async () => {
  const { vault, records, scope } = stores();
  await vault.put({ ...scope, id: "record:key-b", expectedRevision: null, provider: null, label: "API connection key-b", meta: { credentialFormat: "api-connection-record" },
    // The stored JSON form of a record sealed for key-a, copied under key-b's row id.
    payload: { record: JSON.parse(JSON.stringify(record("key-a"))) } });
  await assert.rejects(records.read({ key: "key-b" }), (error: unknown) => error instanceof VaultError && error.code === "invalid-record");
});

test("records: a row whose payload holds no record reads as none", async () => {
  const { vault, records, scope } = stores();
  await vault.put({ ...scope, id: "record:key-a", expectedRevision: null, provider: null, label: "API connection key-a", meta: { credentialFormat: "api-connection-record" }, payload: { other: true } });
  assert.equal(await records.read({ key: "key-a" }), null);
});

test("records: writing a record under a key that is not its own is refused before anything is stored", async () => {
  const { records } = stores();
  await assert.rejects(records.compareAndSet({ key: "key-a", expectedRevision: 0, record: record("key-b") }), (error: unknown) => error instanceof VaultError && error.code === "invalid-record");
  assert.equal(await records.read({ key: "key-a" }), null);
});

test("records: a stale expected revision loses the CAS (false) and the stored record is unchanged", async () => {
  const { records } = stores();
  assert.equal(await records.compareAndSet({ key: "key-a", expectedRevision: 0, record: record("key-a") }), true);
  assert.equal(await records.compareAndSet({ key: "key-a", expectedRevision: 0, record: { ...record("key-a"), status: "disconnected" } }), false);
  assert.equal((await records.read({ key: "key-a" }))?.status, "connected");
});

test("records: a storage fault that is not a conflict propagates from CAS", async () => {
  const { vault, records } = stores();
  failing(vault, "put", new VaultError({ code: "context" }));
  await assert.rejects(records.compareAndSet({ key: "key-a", expectedRevision: 0, record: record("key-a") }), (error: unknown) => error instanceof VaultError && error.code === "context");
});

test("attempts: an unknown state is null for take and peek", async () => {
  const { records } = stores();
  assert.equal(await records.takeAttempt({ state: "missing" }), null);
  assert.equal(await records.peekAttempt({ state: "missing" }), null);
});

test("attempts: a row whose payload holds no attempt reads as none", async () => {
  const { vault, records, scope } = stores();
  await vault.put({ ...scope, id: "attempt:s-1", expectedRevision: null, provider: null, label: "odd", meta: { credentialFormat: "api-connection-attempt", expiresAtMs: Date.parse("2030-01-01T00:00:00.000Z") }, payload: { attempt: "not an object" } });
  assert.equal(await records.peekAttempt({ state: "s-1" }), null);
});

test("attempts: peek does not consume; take consumes once", async () => {
  const { records } = stores();
  await records.putAttempt({ attempt: attempt("s-1", "2026-10-20T12:10:00.000Z") });
  assert.equal((await records.peekAttempt({ state: "s-1" }))?.attemptId, "attempt-id-s-1");
  assert.equal((await records.takeAttempt({ state: "s-1" }))?.attemptId, "attempt-id-s-1");
  assert.equal(await records.takeAttempt({ state: "s-1" }), null);
});

test("attempts: a take that loses the delete race to another callback reads as already used", async () => {
  const { vault, records } = stores();
  await records.putAttempt({ attempt: attempt("s-1", "2026-10-20T12:10:00.000Z") });
  failing(vault, "delete", new VaultError({ code: "conflict" }));
  assert.equal(await records.takeAttempt({ state: "s-1" }), null);
});

test("attempts: a storage fault on the consuming delete propagates", async () => {
  const { vault, records } = stores();
  await records.putAttempt({ attempt: attempt("s-1", "2026-10-20T12:10:00.000Z") });
  failing(vault, "delete", new Error("vault storage write failed"));
  await assert.rejects(records.takeAttempt({ state: "s-1" }), { message: "vault storage write failed" });
});

test("sweep: a new attempt removes expired attempts and keeps live attempts and every other row", async () => {
  let now = Date.parse("2026-10-20T12:00:00.000Z");
  const { records } = stores({ nowMs: () => now });
  await records.compareAndSet({ key: "key-a", expectedRevision: 0, record: record("key-a") });
  await records.putAttempt({ attempt: attempt("old", "2026-10-20T12:05:00.000Z") });
  await records.putAttempt({ attempt: attempt("live", "2026-10-20T12:30:00.000Z") });
  now = Date.parse("2026-10-20T12:06:00.000Z");
  await records.putAttempt({ attempt: attempt("new", "2026-10-20T12:16:00.000Z") });
  assert.equal(await records.peekAttempt({ state: "old" }), null);
  assert.equal((await records.peekAttempt({ state: "live" }))?.state, "live");
  assert.equal((await records.peekAttempt({ state: "new" }))?.state, "new");
  assert.equal((await records.read({ key: "key-a" }))?.status, "connected");
});

test("sweep: an expired attempt another process already removed (conflict) does not block the new attempt", async () => {
  let now = Date.parse("2026-10-20T12:00:00.000Z");
  const { vault, records } = stores({ nowMs: () => now });
  await records.putAttempt({ attempt: attempt("old", "2026-10-20T12:05:00.000Z") });
  now = Date.parse("2026-10-20T12:06:00.000Z");
  const realDelete = vault.delete.bind(vault);
  failing(vault, "delete", new VaultError({ code: "conflict" }));
  await records.putAttempt({ attempt: attempt("new", "2026-10-20T12:16:00.000Z") });
  vault.delete = realDelete;
  assert.equal((await records.peekAttempt({ state: "new" }))?.state, "new");
});

test("sweep: a storage fault while removing an expired attempt propagates and stores no new attempt", async () => {
  let now = Date.parse("2026-10-20T12:00:00.000Z");
  const { vault, records } = stores({ nowMs: () => now });
  await records.putAttempt({ attempt: attempt("old", "2026-10-20T12:05:00.000Z") });
  now = Date.parse("2026-10-20T12:06:00.000Z");
  failing(vault, "delete", new Error("vault storage write failed"));
  await assert.rejects(records.putAttempt({ attempt: attempt("new", "2026-10-20T12:16:00.000Z") }), { message: "vault storage write failed" });
  assert.equal(await records.peekAttempt({ state: "new" }), null);
});

test("row ids: an attempt whose state equals a connection key never touches that connection's record row", async () => {
  const { records } = stores();
  await records.compareAndSet({ key: "key-a", expectedRevision: 0, record: record("key-a") });
  await records.putAttempt({ attempt: attempt("key-a", "2026-10-20T12:10:00.000Z") });
  assert.equal((await records.read({ key: "key-a" }))?.status, "connected");
  assert.equal((await records.takeAttempt({ state: "key-a" }))?.state, "key-a");
  assert.equal((await records.read({ key: "key-a" }))?.revision, 1, "consuming the attempt left the record row alone");
});

test("vault: rows are stamped with the host clock, not the machine's", async () => {
  const at = Date.parse("2031-02-03T04:05:06.000Z");
  const { vault, records, scope } = stores({ nowMs: () => at });
  await records.compareAndSet({ key: "key-a", expectedRevision: 0, record: record("key-a") });
  const [row] = await vault.list({ workspaceId: scope.workspaceId, kind: scope.kind, ownerKey: scope.ownerKey, principalId: null });
  assert.equal(row?.updatedAt, "2031-02-03T04:05:06.000Z");
});
