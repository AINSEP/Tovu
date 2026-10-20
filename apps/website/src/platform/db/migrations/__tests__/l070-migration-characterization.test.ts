import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import type { SchemaShape } from "../../kernel/schema-shape.js";
import { unifyVaultCredentials } from "../0013_unify_vault_credentials.js";
import { compareShapes } from "../legacy-sqlite.js";
import { vaultFixture, vaultStep } from "./secrets-vault.fixture.js";

const unify = unifyVaultCredentials({ checksum: "pin" });
const context = { note: () => {} };

test("shape comparison keeps ordered bidirectional differences and tolerates only absent optional tables", () => {
  const expected: SchemaShape = { tables: {
    absent: { columns: [], indexes: [], constraints: [] },
    optional: { columns: [], indexes: [], constraints: [] },
    shared: { columns: ["a", "a"], indexes: ["i"], constraints: ["c"] },
  }, others: ["trigger needed", "trigger present"] };
  const actual: SchemaShape = { tables: {
    shared: { columns: ["b"], indexes: ["j"], constraints: ["d"] },
    plugin: { columns: [], indexes: [], constraints: [] },
  }, others: ["trigger present", "extra trigger"] };
  assert.deepEqual(compareShapes(expected, actual, { optionalTables: new Set(["optional"]) }), {
    problems: ["missing table absent", 'shared: expected columns entry "a"', 'shared: expected columns entry "a"',
      'shared: unexpected columns entry "b"', 'shared: expected indexes entry "i"', 'shared: unexpected indexes entry "j"',
      'shared: expected constraints entry "c"', 'shared: unexpected constraints entry "d"', "missing trigger needed"],
    extraTables: ["plugin"],
  });
  assert.deepEqual(compareShapes(actual, actual), { problems: [], extraTables: [] });
  assert.deepEqual(compareShapes(expected, actual).problems.slice(0, 2), ["missing table absent", "missing table optional"]);
  assert.ok(compareShapes(expected, actual, { optionalTables: new Set(["shared"]) }).problems.includes('shared: unexpected columns entry "b"'));
});

test("unification preserves previous provenance, null providers, and already canonical vendors", async () => {
  const { kernel } = await vaultFixture("sqlite");
  try {
    await kernel.transaction(() => vaultStep.up(kernel, context));
    await kernel.execute(sql`UPDATE secrets_vault SET meta=${JSON.stringify({ migration: { source: "previous" } })},label='Vercel' WHERE id='custom'`);
    await kernel.execute(sql`UPDATE secrets_vault SET provider=NULL,meta='{}' WHERE kind='vendor' AND id='collision'`);
    await unify.up(kernel, context);
    const [custom] = await kernel.query<{ meta: string }>(sql`SELECT meta FROM secrets_vault WHERE id='custom'`);
    const metadata = JSON.parse(custom.meta);
    assert.deepEqual(metadata.worksFor, ["vercel"]);
    assert.equal(metadata.legacyAad.table, "secrets_vault_custom_v1");
    assert.deepEqual(metadata.migration.previous, { source: "previous" });
    const vendors = await kernel.query<{ meta: string }>(sql`SELECT meta FROM secrets_vault WHERE kind='vendor' AND provider IS NULL AND id='collision'`);
    assert.equal(vendors.length, 1);
    for (const row of vendors) assert.deepEqual(JSON.parse(row.meta).worksFor, []);
    const before = await kernel.query(sql`SELECT * FROM secrets_vault ORDER BY id`);
    await unify.up(kernel, context);
    assert.deepEqual(await kernel.query(sql`SELECT * FROM secrets_vault ORDER BY id`), before);
  } finally { await kernel.close(); }
});
