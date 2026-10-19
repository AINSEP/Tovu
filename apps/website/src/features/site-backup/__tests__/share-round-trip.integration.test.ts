/** Approved round17 import half of row 8. Baseline RED: import verifier/restore/owner flow absent.
 * Production collection → ZIP → public /_share download → isolated rebuild → initSite.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import express from "express";
import { SiteShareRegistry } from "../share-registry.js";
import { createSiteShare } from "../share-service.js";
import { registerPublicShareRoutes } from "../../../server/inbound/public-http/routes/site-share.js";
import { createSiteImportBackend } from "../import-backend.js";
import { createHash } from "node:crypto";
import { openContentDb } from "../../../platform/db/sqlite/content-db.js";
import { closeSqliteConnection } from "../../../platform/db/kernel/drivers/sqlite.js";
import { resolveSiteDatabasePaths } from "../../../platform/site-dir/site-databases.js";
import { importFixture, OWNER_PASSWORD, HASH, STORAGE_KEY, reader } from "./import.fixture.js";
import { loadTheme } from "../../theme/theme.js";

for (const placement of ["inSite", "appData"] as const) test("A production preparation → public download → B import preserves content: " + placement, async t => {
  const h = await importFixture(t, placement);
  const prepared = await h.prepareProductionShare();
  const shareRegistry = new SiteShareRegistry({ directory: path.join(h.root, "shares") });
  const shared = await createSiteShare({ registry: shareRegistry, site: "source-site", name: "portable", archive: prepared.archive });
  const app = express();
  registerPublicShareRoutes({ app, registry: shareRegistry });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let downloads = 0;
  const backend = createSiteImportBackend({ ...h.backendPorts, http: { send: async request => {
    assert.equal(new URL(request.url).pathname, `/_share/${shared.token}/${shared.file}`);
    const response = await fetch(base + new URL(request.url).pathname);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const bodyBytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(bodyBytes, prepared.archive);
    downloads++;
    return { status: response.status, headers: Object.fromEntries(response.headers), bodyText: "", bodyBytes, bodyBytesTruncated: false };
  } } });
  let archivedDatabase: Buffer | undefined;
  for await (const file of reader.entries({ archive: prepared.archive })) if (file.kind === "file" && file.entryPath === "database/content.db") {
    const chunks: Buffer[] = [];
    for await (const chunk of file.openReadStream({})) chunks.push(Buffer.from(chunk));
    archivedDatabase = Buffer.concat(chunks);
  }
  assert.deepEqual(archivedDatabase, prepared.plan.database!.bytes, "A's exact projected DB is what its ZIP contains");
  const archivePath = path.join(h.root, "exported.db");
  fs.writeFileSync(archivePath, archivedDatabase!);
  const exported = openContentDb({ filePath: archivePath });
  try {
    for (const table of ["principals", "identity_users", "sessions", "api_keys", "secrets_vault", "external_mcp_servers"]) assert.equal((exported.$client.prepare('SELECT count(*) AS n FROM "' + table + '"').get() as { n: number }).n, 0, "source rows in ZIP: " + table);
    assert.equal(exported.$client.serialize().includes(Buffer.from("source-secret")), false);
    assert.equal(exported.$client.serialize().includes(Buffer.from("source-session")), false);
    assert.equal(exported.$client.serialize().includes(Buffer.from("source-chat-private")), false);
  } finally { closeSqliteConnection(exported); }
  const pending = await backend.importBackup({ principalId: "recipient", source: { url: `https://public.example/_share/${shared.token}/${shared.file}` } });
  assert.equal(downloads, 1);
  const stage = h.registry.stagePath({ importId: pending.importId });
  const projected = openContentDb({ filePath: path.join(stage, "database/content.db") });
  try {
    for (const table of ["principals", "identity_users", "sessions", "api_keys", "secrets_vault", "external_mcp_servers"]) {
      const count = projected.$client.prepare('SELECT count(*) AS n FROM "' + table + '"').get() as { n: number };
      assert.equal(count.n, 0, table + " must contribute zero source rows before owner setup");
    }
    const names = projected.$client.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all() as { name: string }[];
    assert.equal(names.some(row => /^(?:ai_chats|ai_chat_messages|assistant_agent_sessions)$/.test(row.name)), false);
  } finally { closeSqliteConnection(projected); }
  const result = await backend.completeOwner({ principalId: "recipient", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  const entry = h.workspace.registry({}).list({})[0]!;
  assert.equal(result.newSiteId, entry.id);
  assert.notEqual(result.newSiteId, "source-owner");
  const meta = JSON.parse(fs.readFileSync(path.join(entry.path, ".site-meta.json"), "utf8"));
  assert.equal(meta.siteId, meta.siteKeyId);
  assert.equal(meta.siteId, result.newSiteId);
  const importedDbPath = resolveSiteDatabasePaths({ dir: entry.path }, { workspace: h.workspace }).contentDbPath;
  assert.equal(importedDbPath.startsWith(entry.path + path.sep), placement === "inSite");
  if (placement === "appData") assert.equal(importedDbPath.startsWith(path.join(h.workspace.config({}).appData, "databases") + path.sep), true);
  const imported = openContentDb({ filePath: importedDbPath });
  try {
    const rows = (db: typeof imported, table: string) => (db.$client.prepare('SELECT * FROM "' + table + '" ORDER BY 1').all() as Record<string, unknown>[]).map(({ workspace_id, ...rest }) => rest);
    for (const table of ["posts", "menus", "nav_location_bindings", "media", "asset_blobs", "presentation_settings"]) assert.deepEqual(rows(imported, table), rows(h.db, table), table);
    for (const table of ["sessions", "api_keys", "secrets_vault", "external_mcp_servers"]) assert.equal((imported.$client.prepare('SELECT count(*) AS n FROM "' + table + '"').get() as { n: number }).n, 0);
    const accounts = imported.$client.prepare("SELECT principal_id FROM identity_users").all() as { principal_id: string }[];
    assert.equal(accounts.length, 1);
    assert.notEqual(accounts[0]!.principal_id, "source-owner");
  } finally { closeSqliteConnection(imported); }
  assert.equal(createHash("sha256").update(fs.readFileSync(path.join(entry.path, "uploads", STORAGE_KEY))).digest("hex"), HASH);
  assert.deepEqual(fs.readFileSync(path.join(entry.path, "themes/static/site/index.html")), h.files.get("themes/static/site/index.html"));
  assert.equal(loadTheme({ themeDir: path.join(entry.path, "themes/static/site"), id: "site", source: "site" }).status, "valid");
});
