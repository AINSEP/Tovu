import assert from "node:assert/strict";
import test from "node:test";

import { PostgresDbOpsAdapter, RestorePointsUnavailableError } from "../db-ops-adapter.js";

test("the Postgres adapter advertises no managed restore point and refuses capture and restore", async () => {
  const adapter = new PostgresDbOpsAdapter();
  assert.deepEqual(await adapter.getCapabilities(), {
    restorePoint: { costClass: "unavailable", kind: "logical-dump" },
  });
  for (const [action, attempt] of [
    ["capture", () => adapter.captureRestorePoint()],
    ["restore", () => adapter.restoreFromArtifact()],
  ] as const) {
    await assert.rejects(attempt, (error: unknown) => {
      assert.ok(error instanceof RestorePointsUnavailableError);
      assert.equal(error.name, "RestorePointsUnavailableError");
      assert.equal(error.message, `restore points are not available on this site's storage (Postgres/PGlite); cannot ${action} one`);
      return true;
    });
  }
});
