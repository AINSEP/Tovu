import assert from "node:assert/strict";
import test from "node:test";

import type { ConnectorCredentialRecord } from "@jini-ai/integrations/composio";

import { InMemoryKeyring } from "../../../features/webhooks/keyring.memory.js";
import type { KeyringPort } from "../../../features/webhooks/index.js";
import { AesGcmSecretSealer } from "../../../features/webhooks/secret-sealer.aesgcm.js";
import { InMemoryConnectorCredentialRepo } from "../connector-credential-store.memory.js";
import {
  createSnapshotConnectorCredentialStore,
  type ConnectorCredentialRepoPort,
  type ConnectorCredentialRow,
} from "../connector-credential-store.js";

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
