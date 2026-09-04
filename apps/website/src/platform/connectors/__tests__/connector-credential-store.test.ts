import assert from "node:assert/strict";
import test from "node:test";

import type { ConnectorCredentialRecord } from "@jini-ai/integrations/composio";

import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import type { KeyringPort } from "#src/features/webhooks/index";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryConnectorCredentialRepo } from "../connector-credential-store.memory.js";
import {
  createSnapshotConnectorCredentialStore,
  type ConnectorCredentialRepoPort,
  type ConnectorCredentialRow,
} from "../connector-credential-store.js";
import { buildConnectorCredentialAad } from "../connector-credential-aad.js";

/**
 * @file `connector-credential-store.ts` — the serialized write queue behind connected accounts.
 *
 * The assertions that matter most are about what happens AFTER a write fails. The queue is a single
 * chained promise shared by every connector in the workspace and by every in-flight request, so a
 * naive `queue = queue.then(work)` chain is permanently poisoned by the first rejection: later work
 * is never invoked and every later `flush()` re-throws the original, stale error. These tests pin
 * down the opposite behavior — a failure is reported once, to the flush that owns it, and the next
 * write still runs.
 */

const WORKSPACE = "workspace-1";
const clock = { nowIso: () => "2026-08-09T00:00:00.000Z" };

/** Wraps the in-memory repo so a named connector's `upsert` can be made to fail on demand. */
class FlakyRepo implements ConnectorCredentialRepoPort {
  private readonly inner = new InMemoryConnectorCredentialRepo();
  failUpsertFor = new Set<string>();
  /** Every write the queue actually reached the repo with, in the order it arrived. */
  readonly calls: string[] = [];

  async listByWorkspaceId(workspaceId: string): Promise<ConnectorCredentialRow[]> {
    return this.inner.listByWorkspaceId(workspaceId);
  }

  async upsert(row: ConnectorCredentialRow): Promise<void> {
    this.calls.push(`upsert:${row.connectorId}`);
    if (this.failUpsertFor.has(row.connectorId)) {
      throw new Error(`database is locked (${row.connectorId})`);
    }
    return this.inner.upsert(row);
  }

  async deleteByConnectorId(input: { workspaceId: string; connectorId: string }): Promise<void> {
    this.calls.push(`delete:${input.connectorId}`);
    return this.inner.deleteByConnectorId(input);
  }
}

function makeStore(
  repo: ConnectorCredentialRepoPort = new InMemoryConnectorCredentialRepo(),
  // Sealed rows are only readable by the keyring that sealed them (InMemoryKeyring mints a random
  // root key per instance), so any test that writes with one store and reads with another must
  // hand both the same one.
  keyring: KeyringPort = new InMemoryKeyring()
) {
  return createSnapshotConnectorCredentialStore({
    workspaceId: WORKSPACE,
    repo,
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock,
  });
}

function makeRecord(connectorId: string): ConnectorCredentialRecord {
  return {
    schemaVersion: 1,
    connectorId,
    accountLabel: `${connectorId} account`,
    credentials: { provider: "composio", token: `tok_${connectorId}` },
    updatedAt: clock.nowIso(),
  };
}

test("a failed write does not stop the next, independent write from persisting", async () => {
  // The regression this file exists for: connector A's write fails, and connector B — a wholly
  // unrelated connect request, possibly minutes later — silently never reaches the database.
  const repo = new FlakyRepo();
  repo.failUpsertFor.add("connector-a");
  const store = makeStore(repo);

  store.set(makeRecord("connector-a"));
  await assert.rejects(() => store.flush(), /database is locked \(connector-a\)/);

  store.set(makeRecord("connector-b"));
  await store.flush();

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  assert.deepEqual(
    rows.map((row) => row.connectorId),
    ["connector-b"],
    "connector-b's write must have run despite the earlier failure"
  );
  assert.notEqual(rows[0]?.sealed, null, "and it must have persisted real sealed material");
});

test("a failure is reported once, not re-thrown by every later flush", async () => {
  // A stale re-throw is how connector A's failure surfaced as a 500 on connector B's request.
  const repo = new FlakyRepo();
  repo.failUpsertFor.add("connector-a");
  const store = makeStore(repo);

  store.set(makeRecord("connector-a"));
  await assert.rejects(() => store.flush(), /database is locked/);

  await store.flush();
  await store.flush();
});

test("a flush with nothing queued since the last one resolves", async () => {
  const store = makeStore();
  await store.flush();
  await store.flush();
});

test("a sealing failure is reported to the caller rather than dropped", async () => {
  // `sealCredentials` runs INSIDE the queued work, so an absent or rotated root key rejects there
  // rather than at the `set` call the operator is watching.
  const keyring: KeyringPort = {
    activeKey: () => Promise.reject(new Error("TOVU_INTEGRATIONS_ROOT_KEY is not set")),
    deriveSigningSecret: () => Promise.reject(new Error("unused")),
    derive: () => Promise.reject(new Error("unused")),
  };
  const repo = new InMemoryConnectorCredentialRepo();
  const store = makeStore(repo, keyring);

  store.set(makeRecord("connector-a"));
  await assert.rejects(() => store.flush(), /ROOT_KEY is not set/);
  assert.deepEqual(await repo.listByWorkspaceId(WORKSPACE), []);
});

test("writes still land in enqueue order after a failure", async () => {
  // Ordering is the reason the queue is serialized at all: a `set` followed by a `delete` for the
  // same connector must not be reordered by the failure-recovery path into a resurrected row.
  const repo = new FlakyRepo();
  repo.failUpsertFor.add("connector-a");
  const store = makeStore(repo);

  store.set(makeRecord("connector-a"));
  store.set(makeRecord("connector-b"));
  store.delete("connector-b");

  await assert.rejects(() => store.flush(), /database is locked/);

  // Asserted against the repo's call log, not just the final rows: an empty table is ALSO what a
  // poisoned queue produces (connector-b's write never running at all), so the end state alone
  // cannot tell "ordered correctly" apart from "never ran".
  assert.deepEqual(repo.calls, ["upsert:connector-a", "upsert:connector-b", "delete:connector-b"]);
  assert.deepEqual(
    (await repo.listByWorkspaceId(WORKSPACE)).map((row) => row.connectorId),
    [],
    "connector-b was written then deleted; a reordered delete would have left the row behind"
  );
});

test("hydrate reloads what a successful write persisted", async () => {
  const repo = new InMemoryConnectorCredentialRepo();
  const keyring = new InMemoryKeyring();
  const store = makeStore(repo, keyring);

  store.set(makeRecord("connector-a"));
  await store.flush();

  const reader = makeStore(repo, keyring);
  assert.equal(reader.get("connector-a"), undefined, "nothing is readable before hydrate");
  await reader.hydrate();
  assert.deepEqual(reader.get("connector-a")?.credentials, {
    provider: "composio",
    token: "tok_connector-a",
  });
});

test("hydrate against an empty table leaves the snapshot empty (missing row)", async () => {
  const store = makeStore();
  await store.hydrate();
  assert.equal(store.get("connector-a"), undefined);
});

test("hydrate skips a row in the degenerate pre-credential state (sealed: null)", async () => {
  const repo = new InMemoryConnectorCredentialRepo();
  await repo.upsert({
    workspaceId: WORKSPACE,
    connectorId: "connector-pending",
    accountLabel: null,
    sealed: null,
    aadVersion: 0,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
  });

  const store = makeStore(repo);
  await store.hydrate();
  assert.equal(store.get("connector-pending"), undefined);
});

test("hydrate skips a row whose opened plaintext is not credential-shaped (an array, not an object)", async () => {
  const repo = new InMemoryConnectorCredentialRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const sealed = await sealer.seal({
    plaintext: JSON.stringify(["not", "an", "object"]),
    key: await keyring.activeKey(),
    aad: buildConnectorCredentialAad({ workspaceId: WORKSPACE, connectorId: "connector-malformed" }),
  });
  await repo.upsert({
    workspaceId: WORKSPACE,
    connectorId: "connector-malformed",
    accountLabel: "malformed",
    sealed,
    aadVersion: 1,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
  });

  const store = makeStore(repo, keyring);
  await store.hydrate();
  assert.equal(store.get("connector-malformed"), undefined);
});

test("hydrate defaults a null accountLabel to the connectorId", async () => {
  const repo = new InMemoryConnectorCredentialRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const sealed = await sealer.seal({
    plaintext: JSON.stringify({ provider: "composio", token: "tok_unlabeled" }),
    key: await keyring.activeKey(),
    aad: buildConnectorCredentialAad({ workspaceId: WORKSPACE, connectorId: "connector-unlabeled" }),
  });
  await repo.upsert({
    workspaceId: WORKSPACE,
    connectorId: "connector-unlabeled",
    accountLabel: null,
    sealed,
    aadVersion: 1,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
  });

  const store = makeStore(repo, keyring);
  await store.hydrate();
  assert.equal(store.get("connector-unlabeled")?.accountLabel, "connector-unlabeled");
});

// ---------------------------------------------------------------------------
// AAD (2026-09-02 gap closure) — `composio_connector_credentials` used to seal with no additional
// authenticated data at all, so a ciphertext was transplantable between connector rows. New writes
// must bind `(workspaceId, connectorId)` into the seal; existing (`aad_version = 0`) rows must keep
// opening exactly as before so no live connected account goes dark mid-migration.
// ---------------------------------------------------------------------------

test("a freshly set credential is sealed with AAD bound to (workspaceId, connectorId) and the row is marked aadVersion 1", async () => {
  const repo = new InMemoryConnectorCredentialRepo();
  const keyring = new InMemoryKeyring();
  const store = makeStore(repo, keyring);

  store.set(makeRecord("connector-a"));
  await store.flush();

  const [row] = await repo.listByWorkspaceId(WORKSPACE);
  assert.equal(row?.aadVersion, 1);

  const sealer = new AesGcmSecretSealer(keyring);
  // Opening under the WRONG aad (the legacy no-aad shape) must fail closed.
  await assert.rejects(() => sealer.open({ sealed: row!.sealed! }));
  const opened = await sealer.open({
    sealed: row!.sealed!,
    aad: buildConnectorCredentialAad({ workspaceId: WORKSPACE, connectorId: "connector-a" }),
  });
  assert.deepEqual(JSON.parse(opened), { provider: "composio", token: "tok_connector-a" });
});

test("a legacy row sealed with NO aad (aadVersion 0) still hydrates to its exact credentials — existing accounts are never disconnected", async () => {
  const repo = new InMemoryConnectorCredentialRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const legacySealed = await sealer.seal({
    plaintext: JSON.stringify({ provider: "composio", token: "tok_legacy" }),
    key: await keyring.activeKey(),
  });
  await repo.upsert({
    workspaceId: WORKSPACE,
    connectorId: "connector-legacy",
    accountLabel: "legacy account",
    sealed: legacySealed,
    aadVersion: 0,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
  });

  const store = makeStore(repo, keyring);
  await store.hydrate();
  assert.deepEqual(store.get("connector-legacy")?.credentials, { provider: "composio", token: "tok_legacy" });
});

test("AAD binding: swapping one connector's ciphertext onto another connector's row fails closed (adversarial cross-row transplant) — hydrate skips it rather than surfacing a decrypt error", async () => {
  const repo = new InMemoryConnectorCredentialRepo();
  const keyring = new InMemoryKeyring();
  const store = makeStore(repo, keyring);

  store.set(makeRecord("connector-a"));
  store.set(makeRecord("connector-b"));
  await store.flush();

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  const rowA = rows.find((r) => r.connectorId === "connector-a")!;
  const rowB = rows.find((r) => r.connectorId === "connector-b")!;

  // Simulate an attacker (or a bad migration) with DB write access moving connector-b's ciphertext
  // onto connector-a's row — the AAD (bound to the row's OWN connectorId) must reject this even
  // though the AES key is shared app-wide.
  await repo.upsert({ ...rowA, sealed: rowB.sealed });

  const reader = makeStore(repo, keyring);
  await reader.hydrate();
  // `hydrate`'s own documented contract: an unreadable row is SKIPPED, not thrown — the connector
  // reads as disconnected rather than taking down the whole surface.
  assert.equal(reader.get("connector-a"), undefined, "a transplanted ciphertext must fail closed, never decrypt as connector-a's own credentials");
});
