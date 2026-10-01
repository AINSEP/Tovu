import assert from "node:assert/strict";
import test from "node:test";

import { ValidationError, describeTables, readRows } from "../../tier3-browser.js";

/**
 * @file SPEC-017 C-109 / INV-07 / REQ-25 / REQ-26 / AC-31–AC-35 — the Tier-3 read-only browser's
 * unconditional sensitive-column redaction guarantee.
 *
 * Assumed seam design:
 *
 * ```ts
 * export interface ColumnDescriptor { name: string; sensitive: boolean; }
 * export interface TableDescriptor { name: string; columns: ColumnDescriptor[]; }
 * export class ValidationError extends Error {}
 *
 * export async function describeTables(
 *   required: { tables: TableDescriptor[] },
 *   optional?: {}
 * ): Promise<Array<{ name: string; columns: string[] }>>; // sensitive columns never listed
 *
 * export async function readRows(
 *   required: {
 *     table: TableDescriptor;
 *     where?: { column: string; op: "eq"|"gt"|"lt"|"gte"|"lte"; value: unknown } | null;
 *     orderBy?: string; cursor?: string; limit?: number;
 *     fetch: (params: { where?: unknown; orderBy?: string; cursor?: string; limit: number }) => Promise<{ rows: Record<string, unknown>[]; nextCursor: string | null }>;
 *   },
 *   optional?: {}
 * ): Promise<{ rows: Record<string, unknown>[]; nextCursor: string | null }>;
 * ```
 */

const usersTable = {
  name: "identityUsers",
  columns: [
    { name: "id", sensitive: false },
    { name: "username", sensitive: false },
    { name: "passwordHash", sensitive: true },
    { name: "apiKeySecret", sensitive: true },
  ],
};

test("AC-31 / REQ-25: describeTables never lists a sensitive:true column, for any table", async () => {
  const described = await describeTables({ tables: [usersTable] });
  const table = described.find((t) => t.name === "identityUsers");

  assert.ok(table);
  assert.ok(!table.columns.includes("passwordHash"));
  assert.ok(!table.columns.includes("apiKeySecret"));
  assert.deepEqual(table.columns.sort(), ["id", "username"]);
});

test("AC-32 / INV-07: readRows never returns a sensitive column's value in any row, regardless of what the underlying fetch returns", async () => {
  const result = await readRows({
    table: usersTable,
    limit: 10,
    fetch: async () => ({
      rows: [{ id: "u-1", username: "ada", passwordHash: "hash-should-never-leak", apiKeySecret: "secret-should-never-leak" }],
      nextCursor: null,
    }),
  });

  assert.equal(result.rows.length, 1);
  assert.ok(!("passwordHash" in result.rows[0]));
  assert.ok(!("apiKeySecret" in result.rows[0]));
  assert.equal(result.rows[0].username, "ada");
});

test("INV-07 (property): redaction follows column sensitivity rather than hard-coded names", async () => {
  for (const mask of [0, 1, 2, 3]) {
    const columns = ["customToken", "ordinaryLookingName"].map((name, index) => ({ name, sensitive: Boolean(mask & (1 << index)) }));
    const result = await readRows({ table: { name: "custom", columns }, fetch: async () => ({ rows: [{ customToken: "a", ordinaryLookingName: "b" }], nextCursor: null }) });
    for (const column of columns) assert.equal(column.name in result.rows[0]!, !column.sensitive);
  }
});

test("EC-05 / AC-32: a where-clause referencing a sensitive column is silently omitted from the output projection, never an error, never a leak", async () => {
  const result = await readRows({
    table: usersTable,
    where: { column: "passwordHash", op: "eq", value: "guess" },
    limit: 10,
    fetch: async (params) => {
      assert.equal(params.where, undefined, "a sensitive predicate must not reach the reader");
      return { rows: params.where ? [] : [{ id: "u-1", passwordHash: "irrelevant" }], nextCursor: null };
    },
  });

  assert.ok(!("passwordHash" in result.rows[0]));
});

test("AC-34 / REQ-26: readRows accepts a bounded predicate (column/op/value) but rejects raw SQL text", async () => {
  const where = { column: "username", op: "eq" as const, value: "ada" };
  const result = await readRows({ table: usersTable, where, orderBy: "username", cursor: "page-1", limit: 10, fetch: async (params) => {
    assert.deepEqual(params, { where, orderBy: "username", cursor: "page-1", limit: 10 });
    return { rows: [{ username: "ada" }], nextCursor: "page-2" };
  } });
  assert.deepEqual(result, { rows: [{ username: "ada" }], nextCursor: "page-2" });
  await assert.rejects(
    readRows({
      table: usersTable,
      // @ts-expect-error — intentionally passing a raw-SQL-shaped where clause to prove rejection
      where: "username = 'ada' OR 1=1",
      limit: 10,
      fetch: async () => ({ rows: [], nextCursor: null }),
    }),
    (err: unknown) => err instanceof ValidationError
  );
});

test("AC-35 / REQ-26: a missing limit defaults to the server's ≤200 cap, and an explicit limit above 200 is rejected", async () => {
  const defaulted = await readRows({
    table: usersTable,
    fetch: async (params) => {
      assert.ok(params.limit <= 200, "default limit must never exceed the server cap");
      return { rows: [], nextCursor: null };
    },
  });
  assert.ok(defaulted);

  await assert.rejects(
    readRows({
      table: usersTable,
      limit: 500,
      fetch: async () => ({ rows: [], nextCursor: null }),
    }),
    (err: unknown) => err instanceof ValidationError
  );
});
