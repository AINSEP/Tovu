import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { freshPostgresContentDatabase } from "#src/platform/db/__tests__/postgres-database";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { openPostgresKernel } from "#src/platform/db/kernel/index";
import { resolveWorkspace } from "../../resolve-workspace.js";

/**
 * @file `resolveWorkspace` on a REAL Postgres server (R1b): the workspace a boot resolves comes back
 * field for field from the `workspaces` row. Fails (never skips) when the local server is down.
 */

const DATABASE = "tovu_resolve_workspace_pg_fixture";

let kernel: ContentKernel;

before(async () => {
  kernel = openPostgresKernel<ContentDatabase>({ connectionString: freshPostgresContentDatabase(DATABASE) });
});

after(async () => {
  await kernel?.close();
});

test("resolves the one workspace row and rejects an unknown explicit id", async () => {
  await kernel.run((db) =>
    db.insertInto("workspaces").values({ id: "ws-pg", name: "PG", slug: "pg", created_at: "2026-09-28T00:00:00.000Z" }).execute()
  );
  assert.deepEqual(await resolveWorkspace({ kernel }), { id: "ws-pg", name: "PG", slug: "pg", createdAt: "2026-09-28T00:00:00.000Z" });
  await assert.rejects(resolveWorkspace({ kernel }, { workspaceId: "missing" }), { name: "ValidationError" });
});
