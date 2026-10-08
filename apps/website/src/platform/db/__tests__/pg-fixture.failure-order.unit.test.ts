import assert from "node:assert/strict";
import test from "node:test";
import { createPgFixture } from "@jini-ai/db/testing/pg-fixture";

// The real fixture helper runs; only its subprocess boundary is replaced. No local psql/server
// is needed, and every attempted statement is retained, including a forbidden CREATE after DROP.
test("recreateDatabase never issues CREATE after a failed DROP", () => {
  const statements: string[] = [];
  const { recreateDatabase } = createPgFixture({ host: "/tmp", user: "fixture-role", port: "5544" }, {
    spawnSync(binary, args, options) {
      assert.equal(binary, "psql");
      assert.deepEqual(options, { encoding: "utf8" });
      assert.deepEqual(args, ["-h", "/tmp", "-U", "fixture-role", "-p", "5544", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", "DROP DATABASE IF EXISTS isolated_fixture;"]);
      const statement = args[args.indexOf("-c") + 1];
      assert.ok(statement);
      statements.push(statement);
      return { status: 1, stdout: "", stderr: "isolated DROP refusal" };
    },
  });
  assert.throws(() => recreateDatabase({ database: "isolated_fixture" }), {
    message: 'failed to drop fixture database "isolated_fixture": isolated DROP refusal',
  });
  assert.deepEqual(statements, ["DROP DATABASE IF EXISTS isolated_fixture;"]);
});

test("recreateDatabase reports CREATE refusal only after a successful DROP", () => {
  const statements: string[] = [];
  const fixture = createPgFixture({ host: "/tmp", user: "fixture-role" }, {
    spawnSync(_binary, args) {
      assert.equal(args[args.indexOf("-d") + 1], "postgres");
      assert.equal(args.includes("-p"), false);
      const sql = args[args.indexOf("-c") + 1];
      assert.ok(sql);
      statements.push(sql);
      return { status: statements.length === 1 ? 0 : 1, stdout: "", stderr: "isolated CREATE refusal" };
    },
  });
  assert.throws(() => fixture.recreateDatabase({ database: "isolated_fixture" }), {
    message: 'failed to create fixture database "isolated_fixture": isolated CREATE refusal',
  });
  assert.deepEqual(statements, ["DROP DATABASE IF EXISTS isolated_fixture;", "CREATE DATABASE isolated_fixture;"]);
});

test("fixture queries select the requested database and normalize absent subprocess output", () => {
  const fixture = createPgFixture({ host: "/tmp", user: "fixture-role" }, {
    spawnSync(_binary, args) {
      assert.equal(args[args.indexOf("-d") + 1], "isolated_fixture");
      assert.equal(args[args.indexOf("-c") + 1], "SELECT 1;");
      return { status: null, stdout: null, stderr: null };
    },
  });
  assert.deepEqual(fixture.psql({ database: "isolated_fixture", sql: "SELECT 1;" }), {
    ok: false, stdout: "", stderr: "",
  });
});
