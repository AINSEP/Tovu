import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { stageBundle } from "#src/features/publish-content/bundle-staging";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqlitePublishContentBundleRepo } from "#src/platform/db/sqlite/publish-content-bundle-repo.sqlite";

const REAL_CONTENT_DB_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../../sites/tovu-com/content.db"
);

function copyRealContentDbToTempDir(): { readonly dir: string; readonly dbPath: string } {
  assert.ok(fs.existsSync(REAL_CONTENT_DB_PATH), `expected the real content.db at ${REAL_CONTENT_DB_PATH}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-content-bundle-repo-test-"));
  const dbPath = path.join(dir, "content.db");
  fs.copyFileSync(REAL_CONTENT_DB_PATH, dbPath);
  for (const sidecar of ["-wal", "-shm"]) {
    const source = `${REAL_CONTENT_DB_PATH}${sidecar}`;
    if (fs.existsSync(source)) fs.copyFileSync(source, `${dbPath}${sidecar}`);
  }
  return { dir, dbPath };
}

test("SQLite staging sweeps rows strictly older than the staging clock", async () => {
  const { dir, dbPath } = copyRealContentDbToTempDir();
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
      clock: { nowIso: () => "2026-09-18T00:00:00.000Z" },
      idGen: { newId: () => "bundle-sweep-old" },
      ttlMs: 1_000,
    });
    assert.ok(await repo.findById({ workspaceId: input.workspaceId, id: "bundle-sweep-old" }));

    await stageBundle(input, {
      repo,
      clock: { nowIso: () => "2026-09-18T00:00:01.000Z" },
      idGen: { newId: () => "bundle-sweep-boundary" },
    });
    assert.ok(
      await repo.findById({ workspaceId: input.workspaceId, id: "bundle-sweep-old" }),
      "the SQLite sweep must preserve a row exactly at expiresAt"
    );

    await stageBundle(input, {
      repo,
      clock: { nowIso: () => "2026-09-18T00:00:01.001Z" },
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
