import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import Database from "better-sqlite3";
import { contentKernel } from "#src/platform/db/content-kernel";
import { createBackstopAuditSqlitePort } from "#src/platform/db/sqlite/publish-backstop-audit.sqlite";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerPublishBackstopRoutes } from "../backstop.js";
import type { PublishContentRouteDeps } from "../deps.js";

test("UI status is owner/built-in-admin and session only, even when a custom admin has the permission", async (t) => {
  const app = express();
  app.use((req, res, next) => { res.locals.principal = { id: req.get("x-actor") ?? "owner" }; res.locals.authCredentialKind = req.get("x-kind") ?? "session"; next(); });
  registerPublishBackstopRoutes(app, { workspaceId: "ws", ownerPrincipalId: Promise.resolve("owner"),
    authorize: async () => ({ allowed: true, reason: "fixture wildcard" }),
    principalRoleRepo: { listByPrincipalId: async () => [{ roleId: "admin" }] },
    roleRepo: { findById: async () => ({ name: "admin", isBuiltin: false }) },
  } as unknown as PublishContentRouteDeps);
  const server = await startTestServer(app, t);
  const path = `${server}/api/admin/v1/workspaces/ws/publish-content/backstop/status`;
  assert.equal((await fetch(path, { headers: { "x-actor": "custom-admin" } })).status, 403);
  assert.equal((await fetch(path, { headers: { "x-kind": "api_key" } })).status, 403);
  const owner = await fetch(path);
  assert.equal(owner.status, 200); assert.deepEqual(await owner.json(), { allowed: true, installed: false });
  assert.equal((await fetch(path.replace("/ws/", "/foreign/"))).status, 404);
});

test("Check may omit the human address, but Send cannot; missing schema stops Check before transport", async (t) => {
  const app = express(); app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; next(); });
  let calls = 0;
  registerPublishBackstopRoutes(app, { workspaceId: "ws", ownerPrincipalId: Promise.resolve("owner"),
    authorize: async () => ({ allowed: true, reason: "owner" }),
    publishContentPeerRepo: { findById: async () => ({ id: "live", baseUrl: "https://live.example" }) },
    publishContentPeerHttpClient: { send: async () => { calls++; throw new Error("must not dial"); } },
  } as unknown as PublishContentRouteDeps);
  const server = await startTestServer(app, t);
  const body = { peerId: "live", reason: "Footer has no publish type", rows: [{ table: "p_banner", pk: { id: "one" } }] };
  const check = await fetch(`${server}/api/admin/v1/workspaces/ws/publish-content/backstop`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, action: "plan" }) });
  assert.equal(check.status, 503); assert.equal((await check.json()).code, "BACKSTOP_NOT_INSTALLED");
  const send = await fetch(`${server}/api/admin/v1/workspaces/ws/publish-content/backstop`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, action: "send", logId: "log" }) });
  assert.equal(send.status, 400); assert.equal((await send.json()).error, "Type live.example to confirm where this send will go.");
  assert.equal(calls, 0);
});

test("destination Undo summary exposes item names but no inverses or private snapshots", async (t) => {
  const db = new Database(":memory:"); t.after(() => db.close());
  // Test-only schema; no active migration is created or installed.
  db.exec(`CREATE TABLE publish_backstop_log (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, direction TEXT NOT NULL,
    actor_id TEXT NOT NULL, destination TEXT NOT NULL, reason TEXT NOT NULL, at TEXT NOT NULL, items_json TEXT NOT NULL,
    gap_labels_json TEXT NOT NULL, result TEXT NOT NULL, run_id TEXT, details_json TEXT NOT NULL, inverses_json TEXT NOT NULL)`);
  const kernel = contentKernel(db); const audit = createBackstopAuditSqlitePort({ kernel });
  await audit.save({ record: { id: "run-1", runId: "run-1", workspaceId: "ws", direction: "destination", actorId: "owner",
    destination: "live.example", reason: "Emergency footer fix", at: "2026-10-04", result: "success", gapLabels: ["table:p_banner"],
    items: [{ entityType: "raw-row", id: "p_banner:one", afterHash: "after" }], details: { private: "must not disclose" }, inverses: [] } });
  const app = express(); app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; next(); });
  registerPublishBackstopRoutes(app, { workspaceId: "ws", contentKernel: kernel, ownerPrincipalId: Promise.resolve("owner"),
    authorize: async () => ({ allowed: true, reason: "owner" }),
  } as unknown as PublishContentRouteDeps);
  const server = await startTestServer(app, t);
  const response = await fetch(`${server}/api/admin/v1/workspaces/ws/publish-content/runs/run-1/backstop`);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { runId: "run-1", reason: "Emergency footer fix", items: [{ entityType: "raw-row", id: "p_banner:one" }], canUndo: true });
  assert.equal((await fetch(`${server}/api/admin/v1/workspaces/ws/publish-content/runs/missing/backstop`)).status, 404);
});
