import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sqliteKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { siteProviderRevisions, watchProviderRevisions } from "../provider-revision-watch.js";

test("one scheduled metadata read notices revision, attachment and detach changes and stops after close", async () => {
  const key = "plugin-state:analytics-example:provider.config";
  let rows = [{ id: key, revision: 1, attached_at: "first" }];
  let check!: () => Promise<void>; let cancelled = 0; const applied: string[] = [];
  const stop = watchProviderRevisions({ read: async () => rows, reapply: async ({ pluginId }) => { applied.push(pluginId); return "now"; } }, {
    schedule: (run, interval) => { assert.equal(interval, 30_000); check = run; return () => { cancelled++; }; },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(applied, ["analytics-example"]);
  await check(); assert.equal(applied.length, 1);
  rows = [{ id: key, revision: 2, attached_at: "first" }];
  await check(); assert.equal(applied.length, 2);
  rows = [{ id: key, revision: 2, attached_at: "reattached" }];
  await check(); assert.equal(applied.length, 3);
  rows = []; await check(); assert.equal(applied.length, 4);
  stop(); await check(); assert.equal(applied.length, 4); assert.equal(cancelled, 1);
});

test("site revisions apply without a project store, and identical ids in both stores remain observable", async () => {
  const id = "plugin-state:analytics-example:provider.config";
  let site = [{ id, revision: 1 }];
  let project: { id: string; revision: number; attached_at: string }[] = [];
  let check!: () => Promise<void>;
  const applied: string[] = [];
  const stop = watchProviderRevisions({ read: async () => project, readSite: async () => site,
    reapply: async ({ pluginId }) => { applied.push(pluginId); return "now"; },
  }, { schedule: run => { check = run; return () => {}; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(applied, ["analytics-example"]);
  site = [{ id, revision: 2 }]; await check();
  assert.equal(applied.length, 2);
  project = [{ id, revision: 1, attached_at: "attached" }]; await check();
  assert.equal(applied.length, 3);
  site = [{ id, revision: 3 }]; await check();
  assert.equal(applied.length, 4, "a project sibling cannot mask the site's changed revision");
  project = [{ id, revision: 2, attached_at: "attached" }]; await check();
  assert.equal(applied.length, 5);
  site = []; await check(); assert.equal(applied.length, 6);
  stop();
});

test("independent API and daemon connections observe site saves without a project store or restart", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "provider-revisions-"));
  const file = path.join(dir, "site.db");
  const apiDb = new Database(file);
  apiDb.exec("CREATE TABLE secrets_vault (workspace_id TEXT, id TEXT, kind TEXT, revision INTEGER)");
  const daemonDb = new Database(file);
  const api = sqliteKernel<unknown>(apiDb), daemon = sqliteKernel<unknown>(daemonDb);
  const keyId = "plugin-state:observability-example:provider.config";
  const insert = apiDb.prepare("INSERT INTO secrets_vault VALUES (?, ?, ?, ?)");
  insert.run("ws", keyId, "api-connection", 1);
  insert.run("other-ws", "plugin-state:hidden:provider.config", "api-connection", 2);
  insert.run("ws", "plugin-state:other:unrelated", "api-connection", 3);
  insert.run("ws", "not-provider", "vendor", 4);
  const checks: (() => Promise<void>)[] = [], calls: string[][] = [[], []];
  const stops = [api, daemon].map((kernel, index) => watchProviderRevisions({ read: async () => [],
    readSite: () => siteProviderRevisions({ kernel, workspaceId: "ws" }),
    reapply: async ({ pluginId }) => { calls[index]!.push(pluginId); return "now"; },
  }, { schedule: run => { checks.push(run); return () => {}; } }));
  t.after(() => { stops.forEach(stop => stop()); daemonDb.close(); apiDb.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, [["observability-example"], ["observability-example"]]);
  daemonDb.prepare("UPDATE secrets_vault SET revision=2 WHERE workspace_id=? AND id=?").run("ws", keyId);
  await Promise.all(checks.map(check => check()));
  assert.deepEqual(calls, [["observability-example", "observability-example"], ["observability-example", "observability-example"]]);
  apiDb.prepare("UPDATE secrets_vault SET revision=3 WHERE workspace_id=? AND id=?").run("ws", keyId);
  await Promise.all(checks.map(check => check()));
  assert.deepEqual(calls.map(entries => entries.length), [3, 3]);
  assert.deepEqual(await siteProviderRevisions({ kernel: api, workspaceId: "ws" }), [{ id: keyId, revision: 3 }]);
});
