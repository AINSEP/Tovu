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
import { importFixture, seedPluginShareData, OWNER_PASSWORD, HASH, STORAGE_KEY, reader } from "./import.fixture.js";
import { loadTheme } from "../../theme/theme.js";
import { requireShareSecretFree } from "../share-file-policy.js";

// Real installed packages include both MCP transport declarations and credential schema metadata.
const packageRoot = `agent-plugins/ws/ws/portable/package/sha256/${"a".repeat(64)}`;
/** v2 archives the runtime package root above at its portable path, and the database at the root. */
const archivePackageRoot = "agent-plugins/portable/package";
const packageFiles = new Map([
  ["plugin.json", Buffer.from('{"name":"portable","version":"1.0.0"}')],
  ["mcp.json", Buffer.from('{"mcpServers":{"portable":{"command":"node","args":["server.mjs"]}}}')],
  ["server.mjs", Buffer.from("throw new Error('must never execute during import');")],
  ["tovu-credential-schemes.json", Buffer.from('{"schemes":[]}')],
  ["tovu-deploy-targets.json", Buffer.from('{"targets":[]}')],
  ["tovu-deploy-configs.json", Buffer.from('{"configs":[]}')],
  // These references must survive the same package scan as literal credential-bearing files.
  ["targets/cloudflare-pages.mjs", Buffer.from([
    'export const headers = config => ({ Authorization: `Bearer ${config.token}` });',
    'export const auth = credential => ({ Authorization: `Bearer ${credential.token}` });',
    'export const env = () => ({ Authorization: `Bearer ${process.env.CLOUDFLARE_TOKEN}` });',
    'export const bind = credential => ({ token: credential.token });',
  ].join("\n"))],
  ["targets/vercel.mjs", Buffer.from("export const target = 'vercel';")],
  ["source-control/write-files.mjs", Buffer.from("export const writeFiles = () => {};")],
  ["skills/web-compliance/SKILL.md", Buffer.from("Portable plugin documentation")],
]);

test("share code awareness is restricted to code extensions", () => {
  const bytes = Buffer.from("{ token: credential.token }");
  for (const ext of ["js", "mjs", "cjs", "ts", "tsx", "jsx"]) {
    assert.doesNotThrow(() => requireShareSecretFree({ path: `plugins/example/source.${ext}`, bytes }));
  }
  for (const ext of ["json", "yaml", "yml", "md", "html", "mjs.txt"]) {
    assert.throws(() => requireShareSecretFree({ path: `content/example.${ext}`, bytes }),
      (error: unknown) => (error as { code: string }).code === "SECRET_IN_CONTENT");
  }
});

test("verified plugin package files get a vendor-key scan only; settings JSON elsewhere stays strict", () => {
  const refused = (error: unknown) => (error as { code: string }).code === "SECRET_IN_CONTENT";
  const at = (name: string) => `${packageRoot}/${name}`;
  const publicFiles = [
    ["tovu-deploy-targets.json", '{"i18n":{"es":{"API token": "Token de API", "token": "Zq7xK2mP9vR4tL8wN3bY6cH1"}}}'],
    ["skills/jev/SKILL.md", "curl -H 'Authorization: Bearer <API_KEY>' https://api.example.com"],
    ["deploy-configs/railway.mjs", 'export const regions = ["us-west2", "europe-west4-drams3a", "asia-southeast1-eqsg3a"];'],
  ] as const;
  // The build ships these exact bytes under this digest (`package-file-inventory.ts`).
  const packageFiles = new Map([[packageRoot.split("/").at(-1)!, new Map(publicFiles.map(([name, text]) => [name, createHash("sha256").update(text).digest("hex")]))]]);
  // Public package labels, doc placeholders and region ids are not credentials.
  for (const [name, text] of publicFiles) assert.doesNotThrow(() => requireShareSecretFree({ path: at(name), bytes: Buffer.from(text) }, { packageFiles }), name);
  // Unverified, the same labels are an ordinary file's content and get the full scan.
  assert.throws(() => requireShareSecretFree({ path: at(publicFiles[0][0]), bytes: Buffer.from(publicFiles[0][1]) }), refused);
  // A provider-shaped key is refused wherever it sits in a package.
  for (const secret of [["sk", "proj", ""].join("-") + "Zq7xK2mP9vR4tL8wN3bY6cH1", "gh" + "p_" + "a1".repeat(18),
    "-----BEGIN " + "PRIVATE KEY-----\nabc\n-----END " + "PRIVATE KEY-----"]) {
    assert.throws(() => requireShareSecretFree({ path: at("tovu-deploy-targets.json"), bytes: Buffer.from(`{"note": "${secret}"}`) }, { packageFiles }), refused);
    assert.throws(() => requireShareSecretFree({ path: at("skills/jev/SKILL.md"), bytes: Buffer.from(secret) }, { packageFiles }), refused);
  }
  // A malformed package root is not a package payload; non-package settings keep the strict scan.
  assert.throws(() => requireShareSecretFree({ path: `agent-plugins/ws/ws/portable/package/sha256/${"a".repeat(63)}/m.json`, bytes: Buffer.from('{"API token": "abc123def456ghi789"}') }), refused);
  assert.throws(() => requireShareSecretFree({ path: "settings/site.json", bytes: Buffer.from('{"API token": "abc123def456ghi789"}') }), refused);
});

for (const placement of ["inSite", "appData"] as const) test("A production preparation → public download → B import preserves content: " + placement, async t => {
  const h = await importFixture(t, placement);
  await seedPluginShareData({ db: h.db });
  for (const [name, bytes] of packageFiles) h.files.set(`${packageRoot}/${name}`, bytes);
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
  const archivedPackage = new Map<string, Buffer>();
  for await (const file of reader.entries({ archive: prepared.archive })) if (file.kind === "file" && (file.entryPath === "content.db" || file.entryPath.startsWith(archivePackageRoot + "/"))) {
    const chunks: Buffer[] = [];
    for await (const chunk of file.openReadStream({})) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    if (file.entryPath === "content.db") archivedDatabase = bytes;
    else archivedPackage.set(file.entryPath.slice(archivePackageRoot.length + 1), bytes);
  }
  assert.deepEqual(archivedPackage, packageFiles, "A exports every required package byte");
  assert.deepEqual(archivedDatabase, prepared.plan.database!.bytes, "A's exact projected DB is what its ZIP contains");
  const archivePath = path.join(h.root, "exported.db");
  fs.writeFileSync(archivePath, archivedDatabase!);
  const exported = openContentDb({ filePath: archivePath });
  try {
    for (const table of ["principals", "identity_users", "sessions", "api_keys", "secrets_vault", "external_mcp_servers"]) assert.equal((exported.$client.prepare('SELECT count(*) AS n FROM "' + table + '"').get() as { n: number }).n, 0, "source rows in ZIP: " + table);
    assert.deepEqual(exported.$client.prepare("SELECT name,is_default FROM p_newsletter__lists").all(), [{ name: "All subscribers", is_default: 1 }]);
    assert.equal(exported.$client.serialize().includes(Buffer.from("private-visitor@example.test")), false);
    const privateTables = ["p_newsletter__subscriptions", "p_newsletter__sends", "p_newsletter__audience_snapshots", "p_newsletter__confirmation_tokens", "p_comments__comments", "p_comments__moderation_log"];
    for (const table of privateTables) assert.equal(exported.$client.prepare("SELECT 1 FROM sqlite_schema WHERE name=?").get(table), undefined, table);
    assert.equal(exported.$client.serialize().includes(Buffer.from("source-secret")), false);
    assert.equal(exported.$client.serialize().includes(Buffer.from("source-session")), false);
    assert.equal(exported.$client.serialize().includes(Buffer.from("source-chat-private")), false);
  } finally { closeSqliteConnection(exported); }
  const pending = await backend.importBackup({ principalId: "recipient", source: { url: `https://public.example/_share/${shared.token}/${shared.file}` } });
  assert.equal(downloads, 1);
  const stage = h.registry.stagePath({ importId: pending.importId });
  const projected = openContentDb({ filePath: path.join(stage, "database/content.db") });
  try {
    assert.deepEqual(projected.$client.prepare("SELECT id,name,is_default,workspace_id FROM p_newsletter__lists").all(), [{ id: "default-list", name: "All subscribers", is_default: 1, workspace_id: (projected.$client.prepare("SELECT id FROM workspaces").get() as { id: string }).id }]);
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
    for (const table of ["posts", "menus", "nav_location_bindings", "media", "presentation_settings"]) assert.deepEqual(rows(imported, table), rows(h.db, table), table);
    // A v2 share fills a never-sniffed (null) content_type with the sniffed type, as share.integration pins.
    assert.deepEqual(rows(imported, "asset_blobs"), rows(h.db, "asset_blobs").map(row => ({ ...row, content_type: "application/octet-stream" })), "asset_blobs");
    for (const table of ["sessions", "api_keys", "secrets_vault", "external_mcp_servers"]) assert.equal((imported.$client.prepare('SELECT count(*) AS n FROM "' + table + '"').get() as { n: number }).n, 0);
    assert.deepEqual(imported.$client.prepare("SELECT id,name,is_default FROM p_newsletter__lists").all(), [{ id: "default-list", name: "All subscribers", is_default: 1 }]);
    const accounts = imported.$client.prepare("SELECT principal_id FROM identity_users").all() as { principal_id: string }[];
    assert.equal(accounts.length, 1);
    assert.notEqual(accounts[0]!.principal_id, "source-owner");
  } finally { closeSqliteConnection(imported); }
  assert.equal(createHash("sha256").update(fs.readFileSync(path.join(entry.path, "uploads", STORAGE_KEY))).digest("hex"), HASH);
  assert.deepEqual(fs.readFileSync(path.join(entry.path, "themes/static/site/index.html")), h.files.get("themes/static/site/index.html"));
  for (const [name, bytes] of packageFiles) assert.deepEqual(fs.readFileSync(path.join(entry.path, ".import-quarantine/agent-plugins/portable/package", name)), bytes, "B preserves quarantined " + name);
  assert.equal(loadTheme({ themeDir: path.join(entry.path, "themes/static/site"), id: "site", source: "site" }).status, "valid");
});

test("production export still refuses literal credentials inside a hashed plugin package", async t => {
  const h = await importFixture(t);
  const file = `${packageRoot}/targets/cloudflare-pages.mjs`;
  const key = ["sk", "proj", ""].join("-") + "a1".repeat(15);
  h.files.set(file, Buffer.from(`export const config = { token: "${key}" };`));
  await assert.rejects(h.prepareProductionShare(), (error: unknown) => {
    assert.equal((error as { code: string }).code, "SECRET_IN_CONTENT");
    // The owner is shown the file's archive path, never the synthetic `ws/archive` path the scan rules use.
    assert.ok((error as Error).message.includes(`'${archivePackageRoot}/targets/cloudflare-pages.mjs'`), (error as Error).message);
    assert.equal((error as Error).message.includes(key), false);
    return true;
  });
});

for (const kind of ["post", "page"]) test(`production export refuses dotted OAuth tokens in a ${kind}`, async t => {
  const h = await importFixture(t);
  const token = "ya29." + "a0AfH6SMBxyzQWERTYuiop1234";
  h.db.$client.prepare("UPDATE posts SET body_json = ? WHERE kind = ?").run(JSON.stringify({ token }), kind);
  await assert.rejects(h.prepareProductionShare(), (error: unknown) => {
    assert.equal((error as { code: string }).code, "SECRET_IN_CONTENT");
    return true;
  });
});
