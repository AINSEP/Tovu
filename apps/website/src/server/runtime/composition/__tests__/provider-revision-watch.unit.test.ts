import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sqliteKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { siteProviderRevisions } from "../provider-revision-watch.js";
import { watchProviderRevisions } from "@jini-ai/plugins/host";
import { providerPluginOf } from "#src/features/project-keys/service";

test("independent API and daemon connections observe site saves without a project store or restart", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "provider-revisions-"));
  const file = path.join(dir, "site.db");
  const apiDb = new Database(file);
  apiDb.exec("CREATE TABLE secrets_vault (workspace_id TEXT, id TEXT, kind TEXT, revision INTEGER)");
  const daemonDb = new Database(file);
  const api = sqliteKernel<unknown>({ source: apiDb }), daemon = sqliteKernel<unknown>({ source: daemonDb });
  const keyId = "plugin-state:observability-example:provider.config";
  const insert = apiDb.prepare("INSERT INTO secrets_vault VALUES (?, ?, ?, ?)");
  insert.run("ws", keyId, "api-connection", 1);
  insert.run("other-ws", "plugin-state:hidden:provider.config", "api-connection", 2);
  insert.run("ws", "plugin-state:other:unrelated", "api-connection", 3);
  insert.run("ws", "not-provider", "vendor", 4);
  const checks: (() => Promise<void>)[] = [], calls: string[][] = [[], []];
  const stops = [api, daemon].map((kernel, index) => watchProviderRevisions({ read: async () => [], pluginIdOf: providerPluginOf,
    reapply: async ({ pluginId }) => { calls[index]!.push(pluginId); return "now"; },
  }, { readSite: () => siteProviderRevisions({ kernel, workspaceId: "ws" }), schedule: ({ run }) => { checks.push(run); return () => {}; } }));
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
