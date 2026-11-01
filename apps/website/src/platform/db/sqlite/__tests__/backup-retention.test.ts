import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { journalKernel } from "../database-journal-db.js";
import { SqliteRestorePointsRepo } from "../database-journal-repo.js";
import { openContentDb } from "../content-db.js";
import { contentKernel } from "../../content-kernel.js";
import { SqlPublishContentRunRepo } from "../../repos/publish-content-run-repo.js";

test("saving restore points retains newest five row/file pairs, preserving foreign files and folders", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-retention-"));
  const journal = journalKernel(path.join(dir, "journal.db"));
  t.after(async () => { await journal.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const repo = new SqliteRestorePointsRepo({ db: journal, siteId: "s" });
  const other = path.join(dir, "other");
  fs.mkdirSync(other);
  const foreign = ["content.db", "restore-point-not-ours.db", "pre-migrations-not-ours.db", "notes.txt"];
  for (const name of foreign) fs.writeFileSync(path.join(dir, name), "FOREIGN");
  fs.writeFileSync(path.join(other, "restore-point-s-wm0-1.db"), "OTHER");
  for (let i = 1; i <= 8; i++) {
    const artifactRef = path.join(dir, `restore-point-s-wm0-${i}.db`);
    fs.writeFileSync(artifactRef, "COPY");
    await repo.save({ restorePointId: `r${i}`, idempotencyKey: `r${i}`, trigger: "manual", createdAt: `2026-11-01T00:00:0${i}Z`, createdBy: "owner", artifactRef });
  }
  assert.deepEqual((await repo.list()).map(r => r.id), ["r8", "r7", "r6", "r5", "r4"]);
  assert.deepEqual(fs.readdirSync(dir).filter(n => /^restore-point-s-wm0-\d+\.db$/.test(n)).sort(), [4, 5, 6, 7, 8].map(i => `restore-point-s-wm0-${i}.db`));
  for (const name of foreign) assert.equal(fs.readFileSync(path.join(dir, name), "utf8"), "FOREIGN");
  assert.equal(fs.readFileSync(path.join(other, "restore-point-s-wm0-1.db"), "utf8"), "OTHER");
});

test("a caller-supplied publish trigger label cannot bypass restore-point retention", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-trigger-"));
  const journal = journalKernel(path.join(dir, "journal.db"));
  t.after(async () => { await journal.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const repo = new SqliteRestorePointsRepo({ db: journal, siteId: "s" });
  for (let i = 1; i <= 8; i++) {
    const artifactRef = path.join(dir, `restore-point-s-wm0-${i}.db`);
    fs.writeFileSync(artifactRef, "COPY");
    await repo.save({ restorePointId: `r${i}`, idempotencyKey: `r${i}`, trigger: "publish-content-import", createdAt: `2026-11-01T00:00:0${i}Z`, createdBy: "owner", artifactRef });
  }
  assert.deepEqual((await repo.list()).map(row => row.id), ["r8", "r7", "r6", "r5", "r4"]);
});

test("retention cleanup cannot turn a save into an error, and an unlink failure keeps its row", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-cleanup-"));
  const journal = journalKernel(path.join(dir, "journal.db"));
  t.after(async () => { await journal.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const repo = new SqliteRestorePointsRepo({ db: journal, siteId: "s" });
  t.mock.method(fsp, "rm", async () => { throw new Error("EACCES"); });
  const warnings = t.mock.method(console, "warn", () => {});
  for (let i = 1; i <= 6; i++) {
    const artifactRef = path.join(dir, `restore-point-s-wm0-${i}.db`);
    fs.writeFileSync(artifactRef, "COPY");
    await assert.doesNotReject(repo.save({ restorePointId: `r${i}`, idempotencyKey: `r${i}`, trigger: "manual", createdAt: `2026-11-01T00:00:0${i}Z`, createdBy: "owner", artifactRef }));
  }
  assert.ok((await repo.list()).some(row => row.id === "r1"));
  assert.ok(fs.existsSync(path.join(dir, "restore-point-s-wm0-1.db")));
  assert.equal(warnings.mock.calls.length, 1);
});

test("in-flight publish runs keep their restore points; finished runs do not pin theirs forever", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-inflight-"));
  const content = openContentDb(path.join(dir, "content.db"));
  const journal = journalKernel(path.join(dir, "journal.db"));
  t.after(async () => { await journal.close(); content.$client.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const runs = new SqlPublishContentRunRepo(contentKernel(content));
  const repo = new SqliteRestorePointsRepo({ db: journal, siteId: "s", protectedRestorePointIds: () => runs.inFlightRestorePointIds({ workspaceId: "s" }) });
  // Every import records its restore point on its run, so finished runs must not protect them.
  for (const [i, phase] of [[1, "applying"], [2, "planned"], [3, "applied"], [4, "failed"]] as const) {
    await runs.save({ id: `run${i}`, workspaceId: "s", direction: "import", peerPrincipalId: "peer", peerLabel: null,
      phase, restorePointId: `r${i}`, changeSetIdsJson: null, actorId: "owner", startedAt: "2026-11-01T00:00:00Z", finishedAt: null, reportJson: null, itemsJson: null });
  }
  for (let i = 1; i <= 9; i++) {
    const artifactRef = path.join(dir, `restore-point-s-wm0-${i}.db`);
    fs.writeFileSync(artifactRef, "COPY");
    await repo.save({ restorePointId: `r${i}`, idempotencyKey: `r${i}`, trigger: "publish-content-import", createdAt: `2026-11-01T00:00:0${i}Z`, createdBy: "owner", artifactRef });
  }
  assert.deepEqual((await repo.list()).map(r => r.id), ["r9", "r8", "r7", "r6", "r5", "r2", "r1"]);
  for (const i of [1, 2]) assert.ok(fs.existsSync(path.join(dir, `restore-point-s-wm0-${i}.db`)));
  for (const i of [3, 4]) assert.equal(fs.existsSync(path.join(dir, `restore-point-s-wm0-${i}.db`)), false);
});
