import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { mock, type TestContext } from "node:test";
import Database from "better-sqlite3";

import type { BackstopAuditRecord, BackstopInverse } from "#src/features/publish-content/backstop-audit";
import * as rawFileContributor from "#src/features/publish-content/raw-file-contributor";
import * as rawRowContributor from "#src/features/publish-content/raw-row-contributor";
import { contentKernel } from "#src/platform/db/content-kernel";
import { createBackstopAuditSqlitePort } from "#src/platform/db/sqlite/publish-backstop-audit.sqlite";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";

import type { PublishContentRouteDeps } from "../deps.js";

/**
 * @file Pins `backstop.ts`'s undo apply loop: inverses run newest-first inside the rows
 * transaction, a skipped item is reported rather than failing the undo, and a file the loop
 * already restored is put back when the transaction fails afterwards. The per-item undo functions
 * are replaced (typed against the real ones) so each item's outcome is chosen by the test; the
 * audit log, the rows transaction and the site's file port stay real.
 */

type UndoRow = typeof rawRowContributor.undoRawRow;
type UndoFile = typeof rawFileContributor.undoRawFile;
const undo: { row: UndoRow; file: UndoFile; order: string[] } = {
  row: async () => null,
  file: async () => null,
  order: [],
};
const undoRawRow: UndoRow = async (input) => { undo.order.push(input.entity.id); return undo.row(input); };
const undoRawFile: UndoFile = async (input) => { undo.order.push(input.entity.id); return undo.file(input); };
mock.module("#src/features/publish-content/raw-row-contributor", { namedExports: { ...rawRowContributor, undoRawRow } });
mock.module("#src/features/publish-content/raw-file-contributor", { namedExports: { ...rawFileContributor, undoRawFile } });
// Imported after the mocks: the fixture's composition deps load `backstop.ts` too, and a module
// linked before `mock.module` keeps the real bindings.
const { registerPublishBackstopRoutes } = await import("../backstop.js");
const { BASE, routeApp, routeDeps } = await import("./route-fixture.js");

const AUDIT_TABLE = `CREATE TABLE publish_backstop_log (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, direction TEXT NOT NULL,
  actor_id TEXT NOT NULL, destination TEXT NOT NULL, reason TEXT NOT NULL, at TEXT NOT NULL, items_json TEXT NOT NULL,
  gap_labels_json TEXT NOT NULL, result TEXT NOT NULL, run_id TEXT, details_json TEXT NOT NULL, inverses_json TEXT NOT NULL)`;

function entity(entityType: "raw-row" | "raw-file", id: string) {
  return { entityType, id, schemaVersion: 1, hashVersion: 1, contentHash: "after", requiredBlobs: [], state: {} };
}
const ROW: BackstopInverse = { kind: "raw-row", entity: entity("raw-row", 'p_banner:{"id":"one"}'), before: null, afterHash: "after" };
const FILE: BackstopInverse = {
  kind: "raw-file", entity: entity("raw-file", "assets/footer.txt"), afterHash: "after",
  before: { relPath: "assets/footer.txt", backupName: null, sha256: null, size: null, mode: 0o644 },
};

function record(inverses: readonly BackstopInverse[]): BackstopAuditRecord {
  return { id: "run-1", runId: "run-1", workspaceId: "ws", direction: "destination", actorId: "owner", destination: "live.example", reason: "Emergency footer fix",
    at: "2026-10-04T00:00:00.000Z", items: [], gapLabels: [], result: "success", details: { source: "kept" }, inverses };
}

/** A destination with the audit log seeded with `inverses` and a site folder holding
 *  `assets/footer.txt` = "live". */
async function destination(t: TestContext, inverses: readonly BackstopInverse[], options: { refuseAuditWrites?: boolean } = {}) {
  undo.order = [];
  t.after(() => { undo.row = async () => null; undo.file = async () => null; });
  const db = new Database(":memory:"); t.after(() => db.close());
  // Test-only schema; no active migration is created or installed.
  db.exec(AUDIT_TABLE);
  const kernel = contentKernel(db);
  const audit = createBackstopAuditSqlitePort({ kernel });
  await audit.save({ record: record(inverses) });
  if (options.refuseAuditWrites) {
    db.exec(`CREATE TRIGGER refuse_update BEFORE UPDATE ON publish_backstop_log BEGIN SELECT RAISE(ABORT, 'audit write refused'); END;
      CREATE TRIGGER refuse_insert BEFORE INSERT ON publish_backstop_log BEGIN SELECT RAISE(ABORT, 'audit write refused'); END;`);
  }
  const base = routeDeps({ contentKernel: kernel, ownerPrincipalId: Promise.resolve("owner") });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backstop-undo-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const footer = path.join(dir, "assets", "footer.txt");
  fs.mkdirSync(path.dirname(footer));
  fs.writeFileSync(footer, "live");
  const deps: PublishContentRouteDeps = { ...base, siteBinding: { ...base.siteBinding, dir } };
  return { app: routeApp(registerPublishBackstopRoutes, deps), audit, footer };
}

const UNDO = `${BASE}/runs/run-1/undo-backstop`;

test("undo runs inverses newest-first, reports skips, and records the run as undone", async (t) => {
  const { app, audit } = await destination(t, [ROW, FILE]);
  undo.row = async () => "Row 'p_banner:{\"id\":\"one\"}' changed on live after this send; it was left alone.";
  const result = await dispatchJsonRequest(app, "POST", UNDO);
  assert.deepEqual(result, { status: 200, body: { runId: "run-1", undone: 1, skipped: ["Row 'p_banner:{\"id\":\"one\"}' changed on live after this send; it was left alone."] } });
  assert.deepEqual(undo.order, ["assets/footer.txt", 'p_banner:{"id":"one"}']);
  const saved = await audit.get({ workspaceId: "ws", id: "run-1" });
  assert.deepEqual([saved?.result, saved?.details], ["undone", { source: "kept", undoSkipped: ["Row 'p_banner:{\"id\":\"one\"}' changed on live after this send; it was left alone."] }]);
});

test("a skipped file is reported and is not rolled back", async (t) => {
  const { app } = await destination(t, [FILE]);
  undo.file = async () => "File 'assets/footer.txt' changed on live after this send; it was left alone.";
  assert.deepEqual(await dispatchJsonRequest(app, "POST", UNDO), {
    status: 200, body: { runId: "run-1", undone: 0, skipped: ["File 'assets/footer.txt' changed on live after this send; it was left alone."] },
  });
});

test("when the audit write fails after a file was restored, the file is put back and the error is the 409", async (t) => {
  const { app, footer } = await destination(t, [FILE], { refuseAuditWrites: true });
  undo.file = async () => { fs.writeFileSync(footer, "undone"); return null; };
  assert.deepEqual(await dispatchJsonRequest(app, "POST", UNDO), { status: 409, body: { error: "audit write refused" } });
  assert.equal(fs.readFileSync(footer, "utf8"), "live");
});

test("a failed undo with no file restored rethrows without rolling anything back", async (t) => {
  const { app, footer } = await destination(t, [FILE], { refuseAuditWrites: true });
  undo.file = async () => "File 'assets/footer.txt' changed on live after this send; it was left alone.";
  assert.deepEqual(await dispatchJsonRequest(app, "POST", UNDO), { status: 409, body: { error: "audit write refused" } });
  assert.equal(fs.readFileSync(footer, "utf8"), "live");
});

test("a non-Error thrown by an undo answers the fixed 409 text", async (t) => {
  const { app } = await destination(t, [ROW]);
  undo.row = async () => { throw "rows driver dropped"; };
  assert.deepEqual(await dispatchJsonRequest(app, "POST", UNDO), { status: 409, body: { error: "This send could not be undone." } });
});
