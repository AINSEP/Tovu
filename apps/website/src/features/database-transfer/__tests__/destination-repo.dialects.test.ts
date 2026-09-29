import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { DatabaseDestinationRepo } from "../destination-repo.js";
import type { DatabaseDestinationRecord } from "../destination-store.js";

/** @file The destination repo's one query body on SQLite and PGlite: insert, replace, last run. */

const RECORD: DatabaseDestinationRecord = {
  workspaceId: "ws-1",
  description: { host: "db.example.test", port: "5432", database: "site", user: "owner" },
  sealed: { keyId: "v1", ciphertext: "c1", nonce: "n1", alg: "aes-256-gcm" },
  aadVersion: 1,
  savedAt: "2026-09-28T00:00:00.000Z",
  lastRunJson: null,
};

describeEachDialect("DatabaseDestinationRepo", { tables: ["database_transfer_destinations"], make: (kernel) => new DatabaseDestinationRepo(kernel) }, (make) => {
  test("upsert inserts, replaces, and setLastRun writes JSON text back as written", async () => {
    const repo = make();
    assert.equal(await repo.find("ws-1"), null);
    await repo.upsert(RECORD);
    assert.deepEqual(await repo.find("ws-1"), RECORD);
    const replaced = { ...RECORD, description: { ...RECORD.description, host: "db2.example.test" }, sealed: { ...RECORD.sealed, ciphertext: "c2" } };
    await repo.upsert(replaced);
    assert.deepEqual(await repo.find("ws-1"), replaced);
    await repo.setLastRun("ws-1", '{"ok":true,"rows":3}');
    assert.equal((await repo.find("ws-1"))?.lastRunJson, '{"ok":true,"rows":3}');
    await repo.setLastRun("ws-missing", "{}");
    assert.equal(await repo.find("ws-missing"), null);
  });
});
