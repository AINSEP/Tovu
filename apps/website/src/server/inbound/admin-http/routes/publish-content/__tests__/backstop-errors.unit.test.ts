import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import express from "express";
import Database from "better-sqlite3";
import { contentKernel } from "#src/platform/db/content-kernel";
import { createBackstopAuditSqlitePort } from "#src/platform/db/sqlite/publish-backstop-audit.sqlite";
import { createRawFileSitePort } from "#src/features/publish-content/publish-backstop-file";
import { BACKSTOP_LIMITS } from "#src/features/publish-content/backstop-policy";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import { registerPublishBackstopRoutes } from "../backstop.js";
import type { PublishContentRouteDeps } from "../deps.js";

const BASE = "/api/admin/v1/workspaces/ws/publish-content";
const TOO_LARGE = "Choose files totaling at most 50 MB per send.";
const KEY = "sk-" + "a".repeat(40);

function fixture(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backstop-errors-"));
  const db = new Database(":memory:");
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  db.exec(`CREATE TABLE publish_backstop_log (id TEXT PRIMARY KEY, workspace_id TEXT, direction TEXT,
    actor_id TEXT, destination TEXT, reason TEXT, at TEXT, items_json TEXT, gap_labels_json TEXT,
    result TEXT, run_id TEXT, details_json TEXT, inverses_json TEXT)`);
  const kernel = contentKernel(db);
  const reports: unknown[] = [], logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const app = express();
  app.use((_req, res, next) => {
    res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session";
    res.locals.adminFailureTracker = { error: (input: unknown) => { reports.push(input); } }; next();
  });
  registerPublishBackstopRoutes(app, portFake<PublishContentRouteDeps>({ workspaceId: "ws", ownerPrincipalId: Promise.resolve("owner"),
    authorize: async () => ({ allowed: true, reason: "owner" }), contentKernel: kernel, siteBinding: { dir }, fileBlobIndex: new Map(),
    publishContentPeerRepo: { findById: async () => ({ baseUrl: "https://live.example" }) },
  }));
  const plan = (files: string[]) => dispatchJsonRequest(app, "POST", `${BASE}/backstop`, { action: "plan", peerId: "peer", reason: "Emergency file repair", files });
  const undo = () => dispatchJsonRequest(app, "POST", `${BASE}/runs/run/undo-backstop`);
  const seedUndo = () => createBackstopAuditSqlitePort({ kernel }).save({ record: { id: "run", runId: "run", workspaceId: "ws", direction: "destination", actorId: "owner", destination: "live.example",
    reason: "Emergency file repair", at: "2026-10-31T00:00:00.000Z", result: "success", details: {}, items: [], gapLabels: [], inverses: [{ kind: "raw-file",
      entity: { entityType: "raw-file", id: "large.txt", schemaVersion: 1, hashVersion: 1, contentHash: "after", requiredBlobs: [], state: {} }, afterHash: "after",
      before: { relPath: "large.txt", backupName: null, sha256: null, size: null, mode: 0o644 } }] } });
  const planRows = (rows = [{ table: "p_widgets", pk: { id: "a" } }]) => dispatchJsonRequest(app, "POST", `${BASE}/backstop`, {
    action: "plan", peerId: "peer", reason: "Emergency row repair", rows,
  });
  return { dir, db, plan, planRows, undo, seedUndo, reports, logs };
}

for (const operation of ["read", "columns"] as const) {
  test(`manual row planning sends unexpected ${operation} failures through the redacted correlated 500 handler`, async (t) => {
    const f = fixture(t);
    f.db.exec("CREATE TABLE p_widgets(id TEXT PRIMARY KEY, title TEXT); INSERT INTO p_widgets VALUES('a', 'footer')");
    const original = f.db.prepare;
    let columnReads = 0;
    t.mock.method(f.db, "prepare", (source: string) => {
      const fail = operation === "read" ? source.includes('SELECT * FROM "p_widgets"')
        : source.includes("pragma_table_info") && ++columnReads === 2;
      if (fail) throw new Error(`database failed ${KEY}`);
      return original.call(f.db, source);
    });
    const response = await f.planRows();
    // Check the leak itself first: before the fix this is a 200 skipped-item reason.
    assert.equal(JSON.stringify(response).includes(KEY), false, "raw driver detail reached the admin client");
    assert.equal(response.status, 500);
    const body = response.body as { code: string; errorId: string; error: string };
    assert.equal(body.code, "INTERNAL_ERROR");
    assert.match(body.errorId, /^[a-f0-9-]{36}$/);
    assert.ok(body.error.includes(body.errorId));
    assert.equal(f.logs.length, 1); assert.equal(f.reports.length, 1);
    assert.ok(JSON.stringify(f.logs).includes(body.errorId));
    for (const sink of [f.logs, f.reports]) {
      assert.equal(JSON.stringify(sink).includes(KEY), false);
    }
    assert.match(JSON.stringify(f.logs), /REDACTED/);
    assert.equal((f.reports[0] as { error: Error }).error.message.includes(KEY), false);
  });
}

test("manual row planning keeps expected adapter refusals as public skips without incidents", async (t) => {
  const f = fixture(t);
  f.db.exec("CREATE TABLE p_unsafe(id TEXT PRIMARY KEY, api_key TEXT)");
  const response = await f.planRows([{ table: "p_unsafe", pk: { id: "a" } }]);
  assert.deepEqual(response, { status: 200, body: { entities: [], logId: null, skipped: [{
    entityType: "raw-row", id: 'p_unsafe:{"id":"a"}', label: 'p_unsafe:{"id":"a"}',
    reason: "Column 'api_key' may hold a key or password; this row is never sent.",
  }] } });
  assert.deepEqual([f.logs, f.reports], [[], []]);
});

test("manual undo keeps typed file-size refusals at 409 without reporting an incident", async (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.dir, "large.txt"), "");
  fs.truncateSync(path.join(f.dir, "large.txt"), BACKSTOP_LIMITS.bytes + 1);
  await f.seedUndo();
  // Assert the owner's error contract as well as its HTTP mapping, so plain Errors cannot regress.
  await assert.rejects(createRawFileSitePort({ siteDir: f.dir }).read({ relPath: "large.txt" }), { name: "BackstopRefusal", message: TOO_LARGE });
  assert.deepEqual(await f.undo(), { status: 409, body: { error: TOO_LARGE } });
  assert.deepEqual([f.logs, f.reports], [[], []]);
});

test("manual planning preserves the aggregate file-size refusal at 409", async (t) => {
  const f = fixture(t);
  for (const file of ["one.txt", "two.txt"]) {
    fs.writeFileSync(path.join(f.dir, file), "");
    fs.truncateSync(path.join(f.dir, file), BACKSTOP_LIMITS.bytes / 2 + 1);
  }
  assert.deepEqual(await f.plan(["one.txt", "two.txt"]), { status: 409, body: { error: TOO_LARGE } });
  assert.deepEqual([f.logs, f.reports], [[], []]);
});

for (const operation of ["plan", "undo"] as const) {
  test(`manual ${operation} sends unexpected file I/O errors through the redacted correlated 500 handler`, async (t) => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.dir, "large.txt"), "content");
    await f.seedUndo();
    const original = fs.openSync;
    t.mock.method(fs, "openSync", (...args: Parameters<typeof fs.openSync>) => {
      if (args[0] === path.join(f.dir, "large.txt")) throw new Error(`storage failed ${KEY}`);
      return Reflect.apply(original, fs, args);
    });
    const response = operation === "plan" ? await f.plan(["large.txt"]) : await f.undo();
    assert.equal(response.status, 500);
    const body = response.body as { code: string; errorId: string; error: string };
    assert.equal(body.code, "INTERNAL_ERROR");
    assert.match(body.errorId, /^[a-f0-9-]{36}$/);
    assert.ok(body.error.includes(body.errorId));
    assert.equal(JSON.stringify(response).includes(KEY), false);
    assert.equal(f.logs.length, 1); assert.equal(f.reports.length, 1);
    assert.ok(JSON.stringify(f.logs).includes(body.errorId));
    assert.equal(JSON.stringify(f.logs).includes(KEY), false);
    assert.match(JSON.stringify(f.logs), /REDACTED/);
    assert.equal((f.reports[0] as { error: Error }).error.message.includes(KEY), false);
  });
}
