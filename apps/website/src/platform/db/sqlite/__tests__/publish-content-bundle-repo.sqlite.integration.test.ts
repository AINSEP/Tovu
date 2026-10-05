import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { stageBundle } from "#src/features/publish-content/bundle-staging";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqlitePublishContentBundleRepo } from "#src/platform/db/sqlite/publish-content-bundle-repo.sqlite";
import { workspaces } from "#src/platform/db/schema.sqlite";

function createFreshContentDbInTempDir(): { readonly dir: string; readonly dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-content-bundle-repo-test-"));
  const dbPath = path.join(dir, "content.db");
  const db = openContentDb(dbPath);
  try {
    db.insert(workspaces).values({ id: "workspace-local", name: "Bundle test workspace", slug: "bundle-test", createdAt: "2026-09-18T00:00:00.000Z" }).run();
  } finally { db.$client.close(); }
  return { dir, dbPath };
}

test("SQLite staging sweeps rows strictly older than the staging clock", async () => {
  const { dir, dbPath } = createFreshContentDbInTempDir();
  const db = openContentDb(dbPath);
  try {
    const repo = new SqlitePublishContentBundleRepo(db);
    const input = {
      workspaceId: "workspace-local",
      sourcePrincipalId: "bundle-sweep-test-principal",
      artifactFormatVersion: 1,
      hashVersion: 1,
      entities: [],
      blobManifest: [],
    };
    await stageBundle(input, {
      repo,
      clock: { nowMs: () => Date.parse("2026-09-18T00:00:00.000Z") },
      idGen: { newId: () => "bundle-sweep-old" },
      ttlMs: 1_000,
    });
    assert.ok(await repo.findById({ workspaceId: input.workspaceId, id: "bundle-sweep-old" }));

    await stageBundle(input, {
      repo,
      clock: { nowMs: () => Date.parse("2026-09-18T00:00:01.000Z") },
      idGen: { newId: () => "bundle-sweep-boundary" },
    });
    assert.ok(
      await repo.findById({ workspaceId: input.workspaceId, id: "bundle-sweep-old" }),
      "the SQLite sweep must preserve a row exactly at expiresAt"
    );

    await stageBundle(input, {
      repo,
      clock: { nowMs: () => Date.parse("2026-09-18T00:00:01.001Z") },
      idGen: { newId: () => "bundle-sweep-new" },
    });

    assert.equal(await repo.findById({ workspaceId: input.workspaceId, id: "bundle-sweep-old" }), null);
    assert.ok(await repo.findById({ workspaceId: input.workspaceId, id: "bundle-sweep-boundary" }));
    assert.ok(await repo.findById({ workspaceId: input.workspaceId, id: "bundle-sweep-new" }));
  } finally {
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
