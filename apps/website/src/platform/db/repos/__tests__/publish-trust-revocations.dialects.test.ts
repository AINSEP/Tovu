import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { publishTrustRevocationStoreFor } from "../publish-trust-revocations.js";

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
