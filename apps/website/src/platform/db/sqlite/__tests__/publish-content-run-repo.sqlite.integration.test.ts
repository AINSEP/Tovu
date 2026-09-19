import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { getPublishContentRunStatus, type PublishContentRunRecord } from "#src/features/publish-content/run-repo";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqlitePublishContentRunRepo } from "#src/platform/db/sqlite/publish-content-run-repo.sqlite";

const REAL_CONTENT_DB_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../../sites/tovu-com/content.db"
);

function copyRealContentDbToTempDir(): { readonly dir: string; readonly dbPath: string } {
  assert.ok(fs.existsSync(REAL_CONTENT_DB_PATH), `expected the real content.db at ${REAL_CONTENT_DB_PATH}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-content-run-repo-test-"));
  const dbPath = path.join(dir, "content.db");
  fs.copyFileSync(REAL_CONTENT_DB_PATH, dbPath);
  for (const sidecar of ["-wal", "-shm"]) {
    const source = `${REAL_CONTENT_DB_PATH}${sidecar}`;
    if (fs.existsSync(source)) fs.copyFileSync(source, `${dbPath}${sidecar}`);
  }
  return { dir, dbPath };
}

test("SQLite run snapshots upsert durable per-item progress and remain workspace scoped", async () => {
  const { dir, dbPath } = copyRealContentDbToTempDir();
  const db = openContentDb(dbPath);
  try {
    const repo = new SqlitePublishContentRunRepo(db);
    const initial: PublishContentRunRecord = {
      id: "run-progress-1",
      workspaceId: "workspace-local",
      direction: "import",
      peerPrincipalId: "peer-1",
      peerLabel: null,
      phase: "applying",
      restorePointId: "rp-1",
      changeSetIdsJson: "[]",
      actorId: "operator-1",
      startedAt: "2026-09-19T00:00:00.000Z",
      finishedAt: null,
      reportJson: JSON.stringify({ refused: false, refusalReason: null, applyOrder: ["post"], rows: [] }),
      itemsJson: JSON.stringify([
        {
          entityType: "post",
          entityId: "post-1",
          idempotencyKey: "publish-content:v1:exact",
          phase: "pending",
          outcome: "created",
          writes: true,
          reason: null,
          changeSetId: null,
          errorSummary: null,
          updatedAt: "2026-09-19T00:00:00.000Z",
        },
      ]),
    };
    await repo.save(initial);
    await repo.save({
      ...initial,
      phase: "failed",
      changeSetIdsJson: '["cs-1"]',
      finishedAt: "2026-09-19T00:00:01.000Z",
      itemsJson: JSON.stringify([
        {
          entityType: "post",
          entityId: "post-1",
          idempotencyKey: "publish-content:v1:exact",
          phase: "content_applied",
          outcome: "created",
          writes: true,
          reason: null,
          changeSetId: "cs-1",
          errorSummary: "baseline write failed",
          updatedAt: "2026-09-19T00:00:01.000Z",
        },
      ]),
    });

    const status = await getPublishContentRunStatus(repo, {
      workspaceId: initial.workspaceId,
      runId: initial.id,
    });
    assert.equal(status?.phase, "failed");
    assert.deepEqual(status?.changeSetIds, ["cs-1"]);
    assert.equal(status?.items[0]?.phase, "content_applied");
    assert.equal(status?.items[0]?.idempotencyKey, "publish-content:v1:exact");
    assert.equal(
      await getPublishContentRunStatus(repo, { workspaceId: "another-workspace", runId: initial.id }),
      null,
      "a run id alone must not cross workspace boundaries"
    );
  } finally {
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
