import assert from "node:assert/strict";
import test from "node:test";

// The real fixture helper runs; only its subprocess boundary is replaced. No local psql/server
// is needed, and every attempted statement is retained, including a forbidden CREATE after DROP.
test("recreateDatabase never issues CREATE after a failed DROP", async (t) => {
  const statements: string[] = [];
  t.mock.module("node:child_process", {
    namedExports: {
      spawnSync(binary: string, args: string[], options: object) {
        assert.equal(binary, "psql");
        assert.deepEqual(options, { encoding: "utf8" });
        assert.equal(args[args.indexOf("-d") + 1], "postgres");
        assert.equal(args[args.indexOf("-v") + 1], "ON_ERROR_STOP=1");
        const statement = args[args.indexOf("-c") + 1];
        assert.ok(statement);
        statements.push(statement);
        assert.equal(statement, "DROP DATABASE IF EXISTS isolated_fixture;");
        return { status: 1, stdout: "", stderr: "isolated DROP refusal" };
      },
    },
  });
  const { recreateDatabase } = await import("../migration/pg-fixture.js");
  assert.throws(() => recreateDatabase("isolated_fixture"), {
    message: 'failed to drop fixture database "isolated_fixture": isolated DROP refusal',
  });
  assert.deepEqual(statements, ["DROP DATABASE IF EXISTS isolated_fixture;"]);
});
