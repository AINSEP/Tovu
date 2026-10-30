import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { contentKernel } from "#src/platform/db/content-kernel";
import { ensureVaultRepoFixture } from "#src/platform/db/repos/__tests__/vault-repo.fixture";
import { buildVaultAad, InMemoryVaultRepo, VaultError } from "@jini-ai/platform/secrets/credential-sets";
import { InMemoryDatabaseDestinationStore } from "../destination-store.js";
import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { DestinationUnreadableError, SealedDatabaseDestinationStore, type SavedDatabaseDestination } from "../destination-store.js";
import { DatabaseDestinationRepo } from "../destination-repo.js";
import { CredentialInputError } from "../../../contracts/core/credential-token.js";

/**
 * @file The saved destination is persistent and sealed: a server restart (a new store over the same
 * content.db) still finds it, the stored row never holds the address or its password in the clear,
 * and a sealed address moved onto another workspace's row does not open (the AAD binds the workspace).
 */

const PASSWORD = "PW-SENTINEL-9d2e";
const ADDRESS = `postgresql://owner:${PASSWORD}@db.example.test:6543/postgres?sslmode=require`;
const DESTINATION: SavedDatabaseDestination = {
  connectionString: ADDRESS,
  description: { host: "db.example.test", port: "6543", database: "postgres", user: "owner" },
  savedAt: "2026-09-27T20:00:00.000Z",
};

async function fixture(t: test.TestContext): Promise<{ db: ContentDb; keyring: InMemoryKeyring; open: () => SealedDatabaseDestinationStore; reopen: () => void }> {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-destination-"));
  let db = openContentDb(path.join(dir, "content.db"));
  t.after(() => {
    db.$client.close();
    rmSync(dir, { recursive: true, force: true });
  });
  for (const id of ["ws-1", "ws-2"]) db.$client.prepare("INSERT INTO workspaces(id,name,slug,created_at) VALUES(?,?,?,?)").run(id, id, id, DESTINATION.savedAt);
  await ensureVaultRepoFixture({ kernel: contentKernel(db) });
  const keyring = new InMemoryKeyring();
  // Every `open()` builds a fresh store and repo; `reopen()` also reopens the database file —
  // together, what a restart does.
  const reopen = () => {
    db.$client.close();
    db = openContentDb(path.join(dir, "content.db"));
  };
  const open = () => new SealedDatabaseDestinationStore({ repo: new DatabaseDestinationRepo(contentKernel(db)), sealer: new AesGcmSecretSealer(keyring), keyring });
  return { get db() { return db; }, keyring, open, reopen };
}

test("a saved destination and its last run survive a restart", async (t) => {
  const { open, reopen } = await fixture(t);
  await open().save("ws-1", DESTINATION);
  await open().recordRun("ws-1", { copied: true, snapshotAt: "2026-09-27T21:00:00.000Z", tableCount: 88, rowCount: 1234 });

  reopen();
  const restarted = open();
  assert.deepEqual(await restarted.get("ws-1"), DESTINATION);
  assert.deepEqual(await restarted.lastRun("ws-1"), { copied: true, snapshotAt: "2026-09-27T21:00:00.000Z", tableCount: 88, rowCount: 1234 });
  assert.equal(await restarted.get("ws-other"), null);
  assert.equal(await restarted.lastRun("ws-other"), null);
});

test("the address is sealed at rest: no stored column holds it or its password", async (t) => {
  const { db, open } = await fixture(t);
  await open().save("ws-1", DESTINATION);
  const rows = db.$client.prepare("SELECT * FROM secrets_vault WHERE kind='database-destination'").all() as Record<string, unknown>[];
  assert.equal(rows.length, 1);
  const stored = JSON.stringify(rows);
  assert.doesNotMatch(stored, new RegExp(PASSWORD));
  assert.doesNotMatch(stored, /postgresql:\/\//);
  assert.equal(rows[0]!.sealed_alg, "aes-256-gcm");
  assert.equal(rows[0]!.last4, null);
  assert.equal(rows[0]!.token_length, null);
  assert.deepEqual(JSON.parse(rows[0]!.meta as string).description, DESTINATION.description);
});

test("saving again replaces the destination, and a new destination forgets the old one's last run", async (t) => {
  const { db, open } = await fixture(t);
  const store = open();
  await store.save("ws-1", DESTINATION);
  await store.recordRun("ws-1", { copied: false, snapshotAt: "x", code: "COPY_FAILED", message: "m" });
  const next = { ...DESTINATION, connectionString: "postgresql://other@db2.example.test/app", description: { host: "db2.example.test", port: "5432", database: "app", user: "other" } };
  await store.save("ws-1", next);
  assert.deepEqual(await open().get("ws-1"), next);
  assert.equal(await open().lastRun("ws-1"), null);
  assert.equal(db.$client.prepare<[], { n: number }>("SELECT count(*) AS n FROM secrets_vault WHERE kind='database-destination'").get()?.n, 1);
});

test("a sealed address copied onto another workspace's row does not open, and says to save it again", async (t) => {
  const { db, open } = await fixture(t);
  await open().save("ws-1", DESTINATION);
  const repo = new DatabaseDestinationRepo(contentKernel(db));
  const record = (await repo.findDefault({ workspaceId: "ws-1", kind: "database-destination", ownerKey: "tovu", principalId: null, provider: null }))!;
  await repo.put({ record: { ...record, workspaceId: "ws-2", revision: 1 }, expectedRevision: null });
  await assert.rejects(open().get("ws-2"), (err: unknown) => {
    assert.ok(err instanceof DestinationUnreadableError);
    assert.equal(err.message, "the saved destination database could not be unlocked (the site's key may have changed); save it again with database_transfer_set_destination");
    return true;
  });
});

test("a destination sealed under another site key does not open", async (t) => {
  const { db } = await fixture(t);
  const other = new InMemoryKeyring("v1");
  const repo = new DatabaseDestinationRepo(contentKernel(db));
  await new SealedDatabaseDestinationStore({ repo, sealer: new AesGcmSecretSealer(other), keyring: other }).save("ws-1", DESTINATION);
  const mine = new InMemoryKeyring("v1");
  await assert.rejects(new SealedDatabaseDestinationStore({ repo, sealer: new AesGcmSecretSealer(mine), keyring: mine }).get("ws-1"), DestinationUnreadableError);
});

test("an unnormalized legacy vault row is refused before attempting decryption", async (t) => {
  const { db, open, keyring } = await fixture(t);
  await open().save("ws-1", DESTINATION);
  db.$client.prepare("UPDATE secrets_vault SET meta = json_set(meta, '$.legacyAad', json('{}')) WHERE workspace_id = 'ws-1'").run();
  const realSealer = new AesGcmSecretSealer(keyring);
  let opens = 0;
  const store = new SealedDatabaseDestinationStore({ repo: new DatabaseDestinationRepo(contentKernel(db)), keyring, sealer: {
    seal: input => realSealer.seal(input),
    open: (input, optional) => { opens += 1; return realSealer.open(input, optional); },
  } });
  await assert.rejects(store.get("ws-1"), (error: unknown) => {
    assert.ok(error instanceof DestinationUnreadableError);
    assert.equal(error.message, "the saved destination database could not be unlocked (the site's key may have changed); save it again with database_transfer_set_destination");
    return true;
  });
  assert.equal(opens, 0);
  const stored = db.$client.prepare("SELECT meta FROM secrets_vault WHERE workspace_id = 'ws-1'").get() as { meta: string };
  assert.deepEqual(JSON.parse(stored.meta).legacyAad, {});
});

test("memory destination uses the vault lifecycle, with no URI hint and missing-row run writes as no-ops", async () => {
  const store = new InMemoryDatabaseDestinationStore();
  const run = { copied: true as const, snapshotAt: DESTINATION.savedAt, tableCount: 1, rowCount: 2 };
  await store.recordRun("missing", run);
  assert.equal(await store.lastRun("missing"), null);
  await store.save("ws-1", DESTINATION);
  await store.recordRun("ws-1", run);
  assert.deepEqual(await store.get("ws-1"), DESTINATION);
  await store.save("ws-1", { ...DESTINATION, connectionString: "" });
  assert.deepEqual(await store.lastRun("ws-1"), run);
  await assert.rejects(store.recordRun("ws-1", { ...run, rowCount: -1 }), VaultError);
  assert.deepEqual(await store.lastRun("ws-1"), run);
  await store.save("ws-1", { ...DESTINATION, savedAt: "2026-10-11T00:00:00.000Z" });
  assert.equal(await store.lastRun("ws-1"), null);
  assert.equal((await store.get("ws-1"))?.savedAt, "2026-10-11T00:00:00.000Z");
});

for (const concurrent of ["replacement", "deletion", "metadata"] as const) {
  test(`lastRun CAS handles concurrent ${concurrent} without writing a stale credential`, async () => {
    let interfere: (() => Promise<void>) | undefined;
    class RacingRepo extends InMemoryVaultRepo {
      override async patchMeta(input: Parameters<InMemoryVaultRepo["patchMeta"]>[0]) {
        const pending = interfere;
        interfere = undefined;
        await pending?.();
        return super.patchMeta(input);
      }
    }
    const repo = new RacingRepo({});
    const keyring = new InMemoryKeyring();
    const store = new SealedDatabaseDestinationStore({ repo, keyring, sealer: new AesGcmSecretSealer(keyring) });
    await store.save("ws-1", DESTINATION);
    const old = (await repo.findDefault({ workspaceId: "ws-1", kind: "database-destination", ownerKey: "tovu", principalId: null, provider: null }))!;
    const replacement = { ...DESTINATION, connectionString: "postgres://new-user@new-host/new-db", description: { host: "new-host", port: "5432", database: "new-db", user: "new-user" } };
    interfere = async () => {
      if (concurrent === "replacement") await store.save("ws-1", replacement);
      else if (concurrent === "deletion") await repo.delete({ ...old, expectedRevision: old.revision });
      else await repo.patchMeta({ ...old, expectedRevision: old.revision, updatedAt: old.updatedAt,
        patch: { lastRun: { copied: false, snapshotAt: "other", code: "COPY_FAILED", message: "safe" } } });
    };
    const run = { copied: true as const, snapshotAt: DESTINATION.savedAt, tableCount: 2, rowCount: 3 };
    await store.recordRun("ws-1", run);
    assert.deepEqual(await store.lastRun("ws-1"), concurrent === "metadata" ? run : null);
    assert.deepEqual(await store.get("ws-1"), concurrent === "deletion" ? null : concurrent === "replacement" ? replacement : DESTINATION);
    if (concurrent === "metadata") assert.deepEqual((await repo.find(old))?.sealed, old.sealed);
  });
}

test("lastRun remains readable without opening the destination envelope", async (t) => {
  const { db, open, keyring } = await fixture(t);
  const run = { copied: true as const, snapshotAt: DESTINATION.savedAt, tableCount: 1, rowCount: 2 };
  await open().save("ws-1", DESTINATION);
  await open().recordRun("ws-1", run);
  const store = new SealedDatabaseDestinationStore({ repo: new DatabaseDestinationRepo(contentKernel(db)), keyring,
    sealer: { seal: async () => { throw new Error("no key"); }, open: async () => { throw new Error("no key"); } } });
  assert.deepEqual(await store.lastRun("ws-1"), run);
  await store.recordRun("missing", run);
  assert.equal(await store.lastRun("missing"), null);
});

test("legacy metadata without savedAt uses the row creation time", async (t) => {
  const { db, open } = await fixture(t);
  await open().save("ws-1", DESTINATION);
  db.$client.prepare("UPDATE secrets_vault SET meta = json_remove(meta, '$.savedAt') WHERE workspace_id = 'ws-1'").run();
  const row = db.$client.prepare("SELECT created_at FROM secrets_vault WHERE workspace_id = 'ws-1'").get() as { created_at: string };
  assert.deepEqual(await open().get("ws-1"), { ...DESTINATION, savedAt: row.created_at });
});

for (const payload of [null, {}, { connectionString: 123 }]) {
  test(`an envelope without a string address is reported as unreadable: ${JSON.stringify(payload)}`, async () => {
    const repo = new InMemoryVaultRepo({});
    const keyring = new InMemoryKeyring();
    const sealer = new AesGcmSecretSealer(keyring);
    const store = new SealedDatabaseDestinationStore({ repo, keyring, sealer }, {});
    await store.save("ws-1", DESTINATION);
    const existing = (await repo.findOne({ workspaceId: "ws-1", kind: "database-destination" }))!;
    const sealed = payload === null ? null : await sealer.seal({ plaintext: JSON.stringify(payload),
      key: await keyring.activeKey(), aad: buildVaultAad(existing) });
    await repo.put({ record: { ...existing, sealed, revision: existing.revision + 1 }, expectedRevision: existing.revision });
    await assert.rejects(store.get("ws-1"), error => {
      assert.ok(error instanceof DestinationUnreadableError);
      assert.equal(error.message, "the saved destination database could not be unlocked (the site's key may have changed); save it again with database_transfer_set_destination");
      return true;
    });
    assert.equal(await store.lastRun("ws-1"), null);
  });
}

test("a blank first save is rejected without creating a destination", async () => {
  const store = new InMemoryDatabaseDestinationStore({}, {});
  await assert.rejects(store.save("ws-1", { ...DESTINATION, connectionString: "" }), error => {
    assert.ok(error instanceof CredentialInputError);
    assert.equal(error.message, "Enter a token. Spaces alone are not a token.");
    assert.equal(error.field, "address");
    return true;
  });
  assert.equal(await store.get("ws-1"), null);
});

for (const failure of [new Error("repository unavailable"), new VaultError({ code: "invalid-record" }), new VaultError({ code: "conflict" })]) {
  test(`lastRun propagates ${failure.message} and leaves the previous run intact`, async () => {
    class FailingRepo extends InMemoryVaultRepo {
      attempts = 0;
      fail = false;
      override async patchMeta(input: Parameters<InMemoryVaultRepo["patchMeta"]>[0]) {
        this.attempts += 1;
        if (this.fail) throw failure;
        return super.patchMeta(input);
      }
    }
    const repo = new FailingRepo({});
    const keyring = new InMemoryKeyring();
    const store = new SealedDatabaseDestinationStore({ repo, keyring, sealer: new AesGcmSecretSealer(keyring) });
    const previous = { copied: false as const, snapshotAt: "earlier", code: "COPY_FAILED", message: "previous failure" };
    await store.save("ws-1", DESTINATION);
    await store.recordRun("ws-1", previous);
    repo.attempts = 0;
    repo.fail = true;
    await assert.rejects(store.recordRun("ws-1", { copied: true, snapshotAt: "later", tableCount: 1, rowCount: 2 }), error => error === failure);
    assert.equal(repo.attempts, failure instanceof VaultError && failure.code === "conflict" ? 3 : 1);
    assert.deepEqual(await store.lastRun("ws-1"), previous);
    assert.deepEqual(await store.get("ws-1"), DESTINATION);
  });
}

test("a concurrent destination with a new identity is not stamped with the old run", async () => {
  let replace: (() => Promise<void>) | undefined;
  class RacingRepo extends InMemoryVaultRepo {
    override async patchMeta(input: Parameters<InMemoryVaultRepo["patchMeta"]>[0]) {
      const pending = replace;
      replace = undefined;
      await pending?.();
      return super.patchMeta(input);
    }
  }
  const repo = new RacingRepo({});
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const store = new SealedDatabaseDestinationStore({ repo, keyring, sealer });
  await store.save("ws-1", DESTINATION);
  const old = (await repo.findOne({ workspaceId: "ws-1", kind: "database-destination" }))!;
  const next = { ...old, id: "replacement-destination", revision: 1 };
  next.sealed = await sealer.seal({ plaintext: JSON.stringify({ connectionString: ADDRESS }),
    key: await keyring.activeKey(), aad: buildVaultAad(next) });
  replace = async () => {
    await repo.delete({ workspaceId: old.workspaceId, id: old.id, expectedRevision: old.revision });
    await repo.put({ record: next, expectedRevision: null });
  };
  await store.recordRun("ws-1", { copied: true, snapshotAt: "stale", tableCount: 1, rowCount: 2 });
  assert.equal(await store.lastRun("ws-1"), null);
  assert.deepEqual(await store.get("ws-1"), DESTINATION);
  assert.equal((await repo.findOne({ workspaceId: "ws-1", kind: "database-destination" }))?.id, next.id);
});
