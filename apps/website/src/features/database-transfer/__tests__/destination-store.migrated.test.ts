import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { PARITY_DIALECTS, migratedParityFixture } from "#src/platform/db/__tests__/parity/parity-harness";
import { stamp } from "#src/platform/db/migrations/__tests__/secrets-vault.fixture";
import { DatabaseDestinationRepo } from "../destination-repo.js";
import { SealedDatabaseDestinationStore } from "../destination-store.js";

/**
 * @file R1 (2026-10-11 query parity): 0012 maps the legacy `database_transfer_destinations` row with
 * is_default=false (that table had no such column). The store must still find it after the upgrade
 * and the boot re-seal, which is exactly the state of sites already migrated to 0012: get/lastRun
 * read it, recordRun updates it, and saving a new address replaces it instead of colliding with it.
 */

for (const dialect of PARITY_DIALECTS) {
  describe(`database destination after 0012 [${dialect}]`, () => {
    test("the migrated destination is read, recorded and replaced", async () => {
      const fixture = await migratedParityFixture(dialect);
      try {
        const store = new SealedDatabaseDestinationStore({ repo: new DatabaseDestinationRepo(fixture.kernel as never), sealer: fixture.sealer, keyring: fixture.keyring as never });
        const saved = await store.get("ws");
        assert.equal(saved?.connectionString, "postgres://writer:password@db.example.test/content");
        assert.deepEqual(saved?.description, { host: "db.example.test", port: "5432", database: "content", user: "writer" });
        assert.deepEqual(await store.lastRun("ws"), { copied: true, snapshotAt: stamp, tableCount: 2, rowCount: 4 });

        const run = { copied: false, snapshotAt: stamp, code: "unreachable", message: "no route" } as const;
        await store.recordRun("ws", run);
        assert.deepEqual(await store.lastRun("ws"), run);

        const next = { connectionString: "postgres://new:pw@new.example.test/db", savedAt: stamp,
          description: { host: "new.example.test", port: "5432", database: "db", user: "new" } };
        await store.save("ws", next);
        assert.equal((await store.get("ws"))?.connectionString, next.connectionString);
        assert.equal(await store.lastRun("ws"), null);
      } finally { await fixture.kernel.close(); }
    });
  });
}
