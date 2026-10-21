import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createDomainBindingStore, type DomainBinding } from "../binding.repo.js";
import { mailRequirement, siteRequirement } from "./dns-fakes.js";

/**
 * @file The `domain_binding` store on SQLite and PGlite (migrated to head): a binding round-trips
 * with its requirements and last result, a compare-and-swap write replaces it in place only from the
 * version it read (a stale write changes nothing), every read is workspace scoped, and the due
 * query returns only bindings whose next check has come, earliest first.
 */

const AT = "2026-10-21T12:00:00.000Z";
const binding = (overrides: Partial<DomainBinding> = {}): DomainBinding => ({
  hostname: "www.example.com", providerId: "manual", zone: "example.com", requirements: [siteRequirement(), mailRequirement], status: "pending",
  delegation: "delegated", attempt: 0, startedAt: AT, nextCheckAt: "2026-10-21T12:00:30.000Z", lastCheckedAt: AT, lastResult: { state: "pending" }, version: 1, ...overrides,
});

for (const adapter of eachDialect({ tables: ["domain_binding", "workspaces"], make: kernel => kernel })) {
  test(`[${adapter.name}] domain_binding store round-trips, upserts in place, scopes by workspace and lists due bindings`, async () => {
    const kernel = adapter.make();
    try {
      await kernel.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES ('w', 'W', 'w', ${AT}), ('w2', 'W2', 'w2', ${AT})`);
      const store = createDomainBindingStore({ kernel, workspaceId: "w" });
      const other = createDomainBindingStore({ kernel, workspaceId: "w2" });
      assert.equal(await store.get({ hostname: "www.example.com" }), null);

      assert.equal(await store.put({ binding: binding(), now: AT, expectedVersion: null }), true);
      assert.deepEqual(await store.get({ hostname: "www.example.com" }), binding());
      assert.equal(await store.put({ binding: binding({ status: "mismatch" }), now: AT, expectedVersion: null }), false, "a second first write loses");
      assert.equal(await other.get({ hostname: "www.example.com" }), null, "another workspace never sees the row");

      const settled = binding({ status: "propagated", delegation: null, attempt: 3, nextCheckAt: null, lastResult: null, version: 2 });
      assert.equal(await store.put({ binding: settled, now: "2026-10-21T12:05:00.000Z", expectedVersion: 1 }), true);
      assert.deepEqual(await store.get({ hostname: "www.example.com" }), settled);
      const stale = binding({ requirements: [mailRequirement], version: 2 });
      assert.equal(await store.put({ binding: stale, now: "2026-10-21T12:06:00.000Z", expectedVersion: 1 }), false, "a write from a version that moved on is refused");
      assert.equal(await other.put({ binding: stale, now: AT, expectedVersion: 2 }), false, "another workspace's row is never matched");
      assert.deepEqual(await store.get({ hostname: "www.example.com" }), settled, "and changes nothing");
      const [row] = await kernel.query<{ created_at: string; updated_at: string }>(sql`SELECT created_at, updated_at FROM domain_binding WHERE workspace_id = 'w'`);
      assert.deepEqual(row, { created_at: AT, updated_at: "2026-10-21T12:05:00.000Z" }, "an upsert keeps created_at");

      await store.put({ binding: binding({ hostname: "b.example.com", nextCheckAt: "2026-10-21T12:01:00.000Z" }), now: AT, expectedVersion: null });
      await store.put({ binding: binding({ hostname: "a.example.com", nextCheckAt: "2026-10-21T12:00:30.000Z" }), now: AT, expectedVersion: null });
      await store.put({ binding: binding({ hostname: "later.example.com", nextCheckAt: "2026-10-21T13:00:00.000Z" }), now: AT, expectedVersion: null });
      await other.put({ binding: binding({ hostname: "theirs.example.com", nextCheckAt: AT }), now: AT, expectedVersion: null });
      const due = await store.listDue({ now: "2026-10-21T12:01:00.000Z", limit: 10 });
      assert.deepEqual(due.map(entry => entry.hostname), ["a.example.com", "b.example.com"]);
      assert.deepEqual((await store.listDue({ now: "2026-10-21T12:01:00.000Z", limit: 1 })).map(entry => entry.hostname), ["a.example.com"]);
    } finally {
      if (adapter.name === "sqlite") await kernel.close();
    }
  });
}
