import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { publishTrustRevocationStoreFor, SqlPublishTrustRevocationStore } from "../publish-trust-revocations.js";
import { MAX_REVOCATIONS } from "#src/features/publish-trust/revocations";
import { sql } from "kysely";
import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import type { ContentDatabase } from "../../content-database.generated.js";

/** @file The publish-trust deny store's one Kysely body on SQLite and PGlite (storage plan §4). */

describeEachDialect(
  "publish trust revocations",
  { tables: ["publish_trust_revocations"], make: publishTrustRevocationStoreFor },
  (make) => {
    test("revoke is durable and idempotent, list is ordered, restore removes", async () => {
      const store = await make();
      assert.deepEqual(await store.list(), { ok: true, revocations: [] });
      const first = await store.revoke({ sourceInstallationId: "install-b", nowIso: "2026-09-02T00:00:00.000Z", note: "lost" });
      assert.equal(first.ok && first.changed, true);
      await store.revoke({ sourceInstallationId: "install-a", nowIso: "2026-09-01T00:00:00.000Z" });
      const again = await store.revoke({ sourceInstallationId: "install-b", nowIso: "2026-09-03T00:00:00.000Z" });
      assert.equal(again.ok && again.changed, false);
      assert.deepEqual(await store.list(), {
        ok: true,
        revocations: [
          { sourceInstallationId: "install-a", revokedAt: "2026-09-01T00:00:00.000Z", note: null },
          { sourceInstallationId: "install-b", revokedAt: "2026-09-02T00:00:00.000Z", note: "lost" },
        ],
      });
      const restored = await store.restore({ sourceInstallationId: "install-a" });
      assert.equal(restored.ok && restored.changed, true);
      const noop = await store.restore({ sourceInstallationId: "install-a" });
      assert.equal(noop.ok && noop.changed, false);
      assert.deepEqual(
        (await store.list()).ok && (await store.list()),
        { ok: true, revocations: [{ sourceInstallationId: "install-b", revokedAt: "2026-09-02T00:00:00.000Z", note: "lost" }] }
      );
    });

    test("concurrent revokes of one computer write one row", async () => {
      const store = await make();
      const results = await Promise.all(
        [1, 2, 3].map(() => store.revoke({ sourceInstallationId: "install-x", nowIso: "2026-09-01T00:00:00.000Z" }))
      );
      assert.deepEqual(results.map((r) => (r.ok ? r.changed : r.reason)).sort(), [false, false, true]);
      const listed = await store.list();
      assert.equal(listed.ok && listed.revocations.length, 1);
    });
  }
);

describeEachDialect("publish trust revocation failures", {
  tables: ["publish_trust_revocations"], make: kernel => kernel,
}, (make) => {
  test("an unavailable table rejects boot and refuses reads and writes", async () => {
    const kernel = make();
    await kernel.execute(sql`ALTER TABLE publish_trust_revocations RENAME TO revocations_aside`);
    try {
      const store = new SqlPublishTrustRevocationStore(kernel);
      await assert.rejects(publishTrustRevocationStoreFor(kernel), /publish trust revocation store is unavailable at boot/);
      for (const result of [await store.list(), await store.revoke({ sourceInstallationId: "new", nowIso: "2026-09-01T00:00:00.000Z" }),
        await store.restore({ sourceInstallationId: "existing" })]) {
        assert.equal(result.ok, false);
        assert.ok(!result.ok && result.reason.startsWith("the list of disconnected computers could not be read:"));
      }
    } finally {
      await kernel.execute(sql`ALTER TABLE revocations_aside RENAME TO publish_trust_revocations`);
    }
  });

  test("capacity refuses a new disconnect without changing the stored deny list", async () => {
    const kernel = make();
    const rows = Array.from({ length: MAX_REVOCATIONS }, (_, i) => ({
      source_installation_id: `install-${String(i).padStart(2, "0")}`, revoked_at: "2026-09-01T00:00:00.000Z", note: "keep",
    }));
    await kernel.run(db => db.insertInto("publish_trust_revocations").values(rows).execute());
    const store = await publishTrustRevocationStoreFor(kernel);
    const before = await store.list();
    assert.deepEqual(before, { ok: true, revocations: rows.map(row => ({
      sourceInstallationId: row.source_installation_id, revokedAt: row.revoked_at, note: row.note,
    })) });
    assert.deepEqual(await store.revoke({ sourceInstallationId: "overflow", nowIso: "2026-09-02T00:00:00.000Z" }), {
      ok: false, reason: `this site already lists ${MAX_REVOCATIONS} disconnected computers`,
    });
    assert.deepEqual(await store.list(), before);
    await kernel.run(db => db.insertInto("publish_trust_revocations").values({ source_installation_id: "corrupt-overflow", revoked_at: "2026-09-01T00:00:00.000Z", note: null }).execute());
    assert.deepEqual(await store.list(), { ok: false, reason: `revocation list holds more than ${MAX_REVOCATIONS} records` });
  });

  test("a refused insert reports a write error and keeps the deny list empty", async () => {
    const store = await publishTrustRevocationStoreFor(make());
    const result = await store.revoke({ sourceInstallationId: "new", nowIso: null as unknown as string });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.reason.startsWith("the disconnected-computer list could not be updated:"));
    assert.deepEqual(await store.list(), { ok: true, revocations: [] });
  });
});

test("a refused restore reports a write error and preserves the disconnected computer", async () => {
  const kernel = openMemorySqliteKernel<ContentDatabase>();
  try {
    await kernel.execute(sql`CREATE TABLE publish_trust_revocations (source_installation_id text PRIMARY KEY, revoked_at text NOT NULL, note text)`);
    await kernel.execute(sql`INSERT INTO publish_trust_revocations VALUES ('keep-disconnected', '2026-09-01T00:00:00.000Z', 'keep')`);
    await kernel.execute(sql`CREATE TRIGGER refuse_restore BEFORE DELETE ON publish_trust_revocations BEGIN SELECT RAISE(ABORT, 'deny-list locked'); END`);
    const store = await publishTrustRevocationStoreFor(kernel);
    assert.deepEqual(await store.restore({ sourceInstallationId: "keep-disconnected" }), {
      ok: false, reason: "the disconnected-computer list could not be updated: deny-list locked",
    });
    assert.deepEqual(await kernel.query(sql`SELECT * FROM publish_trust_revocations`), [{
      source_installation_id: "keep-disconnected", revoked_at: "2026-09-01T00:00:00.000Z", note: "keep",
    }]);
    await kernel.execute(sql`DROP TRIGGER refuse_restore`);
    assert.deepEqual(await store.restore({ sourceInstallationId: "keep-disconnected" }), { ok: true, revocations: [], changed: true });
    assert.deepEqual(await store.list(), { ok: true, revocations: [] });
  } finally { await kernel.close(); }
});
