import assert from "node:assert/strict";
import test from "node:test";

import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteDeploymentsReadRepo } from "../repo.sqlite.js";

for (const mode of ["handle", "kernel"] as const) {
  test(`SQLite deployment adapter reads the supplied ${mode} and applies the 200-row cap`, async (t) => {
    const db = openContentDb(":memory:");
    t.after(() => db.$client.close());
    const kernel = contentKernel(db);
    await kernel.run(async (q) => {
      await q.insertInto("workspaces").values({ id: "ws-b08", name: "Site", slug: "site", created_at: "created" }).execute();
      await q.insertInto("deployment_environments").values(Array.from({ length: 201 }, (_, i) => ({ id: `env-${String(i).padStart(3, "0")}`, workspace_id: "ws-b08", name: `Environment ${i}`, slug: `env-${i}`, is_production: i === 200 ? 1 : 0, created_at: `2026-10-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z` }))).execute();
    });
    const repo = new SqliteDeploymentsReadRepo(mode === "handle" ? db : kernel);
    const environments = await repo.listEnvironments({ workspaceId: "ws-b08" });
    assert.deepEqual(environments.map((e) => e.id), Array.from({ length: 200 }, (_, i) => `env-${String(200 - i).padStart(3, "0")}`));
    assert.deepEqual(environments.find((e) => e.id === "env-200"), { id: "env-200", workspaceId: "ws-b08", name: "Environment 200", slug: "env-200", isProduction: true, createdAtIso: "2026-10-01T00:03:20Z", version: 1 });
    assert.deepEqual(await repo.listEnvironments({ workspaceId: "other" }), []);
    assert.deepEqual(await repo.listTargets({ workspaceId: "ws-b08" }), []);
    assert.deepEqual(await repo.listReleases({ workspaceId: "ws-b08" }), []);
    assert.deepEqual(await repo.listRuns({ workspaceId: "ws-b08" }), []);
  });
}
