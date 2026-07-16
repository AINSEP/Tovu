import assert from "node:assert/strict";
import test from "node:test";

import { eq } from "drizzle-orm";

import { openContentDb } from "../content-db";
import { findOneBy } from "../repo-helpers";
import { workspaces } from "../../db/schema";

/**
 * @file Direct unit coverage for `findOneBy` itself (ADR-042 item 1 / `/debate` D1,
 * 2026-07-15): previously only certified indirectly through 11 modules' contract
 * suites. Pins the null-on-no-match / mapped-row-on-match / first-row-on-multi-match
 * contract, and the `.limit(1)` fix (same debate) so the "one row" assumption is
 * structural, not implicit in `rows[0]` over an unbounded fetch.
 */

function seedWorkspace(db: ReturnType<typeof openContentDb>, id: string, slug: string) {
  db.insert(workspaces).values({ id, name: id, slug, createdAt: "2026-01-01T00:00:00.000Z" }).run();
}

test("findOneBy: returns null when no row matches", () => {
  const db = openContentDb(":memory:");
  const result = findOneBy(db, workspaces, [eq(workspaces.id, "missing")], (row) => row.id);
  assert.equal(result, null);
});

test("findOneBy: returns the mapped row when exactly one row matches", () => {
  const db = openContentDb(":memory:");
  seedWorkspace(db, "ws-1", "ws-one");
  const result = findOneBy(db, workspaces, [eq(workspaces.id, "ws-1")], (row) => row.slug);
  assert.equal(result, "ws-one");
});

test("findOneBy: on a non-unique condition, deterministically returns one matching row (not a crash or all rows)", () => {
  const db = openContentDb(":memory:");
  seedWorkspace(db, "ws-1", "dup-slug-owner-a");
  seedWorkspace(db, "ws-2", "dup-slug-owner-b");
  // Same createdAt is not unique-constrained -> both rows match this condition.
  const result = findOneBy(db, workspaces, [eq(workspaces.createdAt, "2026-01-01T00:00:00.000Z")], (row) => row.id);
  assert.ok(result === "ws-1" || result === "ws-2", "must return exactly one of the matching rows");
});
