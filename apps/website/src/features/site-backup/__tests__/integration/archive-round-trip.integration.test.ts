import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import { createCustomCredential } from "../../../custom-credentials/store.js";
import { InMemoryCustomCredentialSetRepo } from "../../../custom-credentials/repo.memory.js";
import { InMemoryKeyring } from "../../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../../webhooks/secret-sealer.aesgcm.js";
import { githubFromSource } from "../../../source-control/__tests__/fixtures/github-from-source.js";
import { resolveAgentPluginLayout } from "../../../agent-plugins/layout.js";
import { planSiteBackup, pushSiteBackup, type PushResult, type SiteBackupToolDeps } from "../../backup-service.js";
import { SiteBackupPlanStore } from "../../plan-store.js";
import { SiteBackupPushJobs } from "../../push-jobs.js";
import { SHARE_TABLES } from "../../share-policy.js";
import { runtimeSchemaVersion } from "#src/platform/site-dir/schema-guard";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { sanitizeShareDatabase } from "#src/server/runtime/composition/site-portability";
import { FakeGitHub } from "../fixtures/fake-github.js";
import { importFixture, MEDIA, HASH, STORAGE_KEY, OWNER_PASSWORD, reader, stamp } from "../import.fixture.js";

type ImportHarness = Awaited<ReturnType<typeof importFixture>>;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function write(required: { root: string; file: string; bytes: Buffer }): void {
  const file = path.join(required.root, required.file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, required.bytes);
}

async function repositoryHarness(required: { h: ImportHarness }) {
  const { h } = required, siteDir = path.join(h.root, "source");
  const github = new FakeGitHub(), repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring(), sealer = new AesGcmSecretSealer(keyring);
  const provider = (await githubFromSource({ workspaceId: "ws" })).get({ providerId: "github" });
  assert.ok(provider);
  await createCustomCredential({ repo, sealer, keyring, clock: { nowMs: () => Date.parse(stamp) }, idGen: { newId: () => "backup-credential" } }, {
    workspaceId: "ws", label: "github", category: "source-control", baseUrl: provider.descriptor.apiOrigin,
    additionalHosts: [], connection: { token: "fixture-token" },
  });
  write({ root: siteDir, file: "uploads/" + STORAGE_KEY, bytes: MEDIA });
  const deps: SiteBackupToolDeps = {
    workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }),
    customCredentialSetRepo: repo, siteAssistantSecretSealer: sealer, customCredentialsHttpClient: github,
    loadSourceControlProviders: githubFromSource, siteBackupSanitize: sanitizeShareDatabase,
    siteBackupPlanStore: new SiteBackupPlanStore(), siteBackupPushJobs: new SiteBackupPushJobs<PushResult>(),
    siteBackupNow: () => new Date(stamp), siteBackupSiteKeyStatus: () => ({ active: true }),
    siteBackupSources: { siteDir, themesDir: path.join(siteDir, "themes"), mediaUploadsDir: path.join(siteDir, "uploads"),
      skillsDir: path.join(siteDir, "skills"), agentPlugins: resolveAgentPluginLayout({ siteDir }, { env: {} }), tovuVersion: "test" },
    dbOps: { getCapabilities: async () => ({ restorePoint: { kind: "file-snapshot", costClass: "cheap" } }),
      captureRestorePoint: async () => {
        const artifactRef = path.join(h.root, "repository-snapshot.db");
        fs.writeFileSync(artifactRef, h.db.$client.serialize());
        return { artifactRef, watermarkAtCapture: 42 };
      }, restoreFromArtifact: async () => assert.fail("backup must not restore the source") },
  };
  return { deps, github, siteDir };
}

function assertPortableCounts(required: { source: Database.Database; copy: Database.Database }, optional: { share?: boolean } = {}): void {
  for (const table of SHARE_TABLES) {
    const sql = 'SELECT count(*) AS n FROM "' + table + '"';
    // This non-raster share adds one original rendition; repository projection keeps source rows.
    const expected = optional.share && table === "asset_renditions" ? { n: 1 } : required.source.prepare(sql).get();
    assert.deepEqual(required.copy.prepare(sql).get(), expected, table);
  }
  for (const table of ["sessions", "api_keys", "secrets_vault", "external_mcp_servers"]) {
    assert.deepEqual(required.copy.prepare('SELECT count(*) AS n FROM "' + table + '"').get(), { n: 0 }, table);
  }
}

async function archiveFiles(required: { archive: Buffer }): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for await (const entry of reader.entries(required)) {
    if (entry.kind !== "file") continue;
    const chunks: Buffer[] = [];
    for await (const chunk of entry.openReadStream({})) chunks.push(Buffer.from(chunk));
    files.set(entry.entryPath, Buffer.concat(chunks));
  }
  return files;
}

function assertInventory(required: { inventory: readonly { path: string; bytes: number; sha256: string }[]; files: ReadonlyMap<string, Buffer> }): void {
  for (const item of required.inventory) {
    const bytes = required.files.get(item.path);
    assert.ok(bytes, item.path);
    assert.equal(bytes.length, item.bytes, item.path);
    assert.equal(digest(bytes), item.sha256, item.path);
  }
  assert.equal(required.inventory.length, required.files.size - 1);
}

async function source(required: { t: TestContext }) {
  const h = await importFixture(required.t);
  h.files.set("themes/static/site/credential.js", Buffer.from('export const token = "' + "ghp_" + "b".repeat(36) + '";'));
  h.files.set("agent-plugins/ws/ws/portable/package/sha256/" + "a".repeat(64) + "/plugin.json", Buffer.from('{"name":"portable","version":"1.0.0"}'));
  h.files.set("agent-plugins/ws/ws/portable/memory/notes/note.md", Buffer.from("portable plugin state"));
  const exported = await h.prepareProductionShare();
  assert.deepEqual(h.db.$client.prepare("SELECT id FROM secrets_vault").all(), [{ id: "vault" }]);
  return { h, exported };
}

// Mutation: remove any scope from SITE_BACKUP_SCOPES; the exact scope manifest assertion fails.
test("repository backup plan and fake-provider push preserve every portable scope and omit the saved key", { timeout: 120000 }, async t => {
  const { h } = await source({ t }), f = await repositoryHarness({ h });
  const call = { principal: { id: "owner" }, signal: new AbortController().signal };
  const planned = await planSiteBackup({ deps: f.deps, call: { ...call, input: { owner: "octo", repo: "backups", folder: "demo-site" } } }) as { planned: boolean; planId: string };
  assert.equal(planned.planned, true);
  const pushed = await pushSiteBackup({ deps: f.deps, call: { ...call, input: { planId: planned.planId } } });
  assert.equal(pushed.pushed, true);
  assert.deepEqual(f.github.unexpected, []);
  const files = new Map([...f.github.files].filter(([name]) => name.startsWith("demo-site/")).map(([name, bytes]) => [name.slice(10), bytes]));
  const copy = new Database(files.get("database/content.db")!);
  try { assertPortableCounts({ source: h.db.$client, copy }); } finally { copy.close(); }
  assert.equal(digest(files.get("uploads/" + STORAGE_KEY)!), HASH);
  assert.deepEqual(files.get("themes/static/site/index.html"), h.files.get("themes/static/site/index.html"));
  assert.deepEqual(files.get("themes/static/site/credential.js"), h.files.get("themes/static/site/credential.js"));
  assert.ok("credentialWarnings" in pushed && pushed.credentialWarnings?.some(warning => warning.path === "themes/static/site/credential.js"));
  assert.equal(JSON.stringify("credentialWarnings" in pushed && pushed.credentialWarnings).includes("ghp_" + "b".repeat(36)), false);
  assert.deepEqual(files.get("settings/config.json"), h.files.get("settings/config.json"));
  assert.deepEqual(files.get("agent-plugins/ws/ws/portable/memory/notes/note.md"), Buffer.from("portable plugin state"));
  const manifest = JSON.parse(files.get("tovu-backup.json")!.toString());
  assert.equal(manifest.format, "tovu-site-backup");
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.createdAt, stamp);
  assert.deepEqual(manifest.tovu, { version: "test" });
  assert.deepEqual(manifest.schema, runtimeSchemaVersion());
  assert.deepEqual(manifest.site, { name: "Portable", folderName: "source" });
  assert.deepEqual(manifest.database, { path: "database/content.db", engine: "sqlite", watermarkAtCapture: 42 });
  assert.deepEqual(manifest.scopes, Object.fromEntries(["database", "media", "themes", "plugins", "settings"].map(scope => [scope, { included: true }])));
  assertInventory({ inventory: manifest.files, files });
  assert.equal(f.github.writeRoutes().filter(route => route === "POST /git/commits").length, 1);
});

// Mutation: omit a restored media file in restoreStagedImport; the destination hash assertion fails.
test("share export and new-site import preserve portable rows, bytes, plugin state and the import report", { timeout: 120000 }, async t => {
  const { h, exported } = await source({ t }), files = await archiveFiles({ archive: exported.archive });
  const manifest = JSON.parse(files.get("manifest.json")!.toString());
  assert.equal(manifest.formatVersion, 2);
  assert.equal(manifest.profile, "share");
  assert.deepEqual(manifest.schema, runtimeSchemaVersion());
  assert.deepEqual(manifest.site, { name: "Portable" });
  assert.deepEqual(manifest.scopes, { database: true, media: true, themes: true, plugins: true, settings: true });
  assert.ok(manifest.plugins.some((plugin: { id: string; enabled: boolean }) => plugin.id === "portable" && !plugin.enabled));
  assertInventory({ inventory: manifest.files, files });
  assert.deepEqual(JSON.parse(files.get("settings.json")!.toString()), { name: "Portable", template: { schemaVersion: runtimeSchemaVersion().index } });
  assert.equal(digest(files.get("media/media.bin")!), HASH);
  assert.deepEqual(files.get("themes/site/index.html"), h.files.get("themes/static/site/index.html"));
  assert.deepEqual(files.get("agent-plugins/portable/memory/notes/note.md"), Buffer.from("portable plugin state"));
  const archived = new Database(files.get("content.db")!);
  try { assertPortableCounts({ source: h.db.$client, copy: archived }, { share: true }); } finally { archived.close(); }
  const { uploadId } = await h.backend.upload({ principalId: "owner", archive: exported.archive });
  const pending = await h.backend.importBackup({ principalId: "owner", source: { uploadId } });
  assert.equal(pending.status, "needs-owner");
  assert.equal(pending.hasEncryptedKeys, false);
  const ready = await h.backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.credentialWarnings, exported.plan.credentialWarnings ?? []);
  assert.ok(ready.warnings?.some(warning => /kept off|switched off/i.test(warning)));
  const entry = h.workspace.registry({}).list({}).find(row => row.id === ready.newSiteId)!;
  assert.equal(entry.name, ready.newSiteName);
  const imported = new Database(resolveSiteDatabasePaths({ dir: entry.path }, { workspace: h.workspace }).contentDbPath, { readonly: true });
  try { assertPortableCounts({ source: h.db.$client, copy: imported }, { share: true }); } finally { imported.close(); }
  assert.equal(digest(fs.readFileSync(path.join(entry.path, "uploads", STORAGE_KEY))), HASH);
  assert.deepEqual(fs.readFileSync(path.join(entry.path, "themes/static/site/index.html")), h.files.get("themes/static/site/index.html"));
  assert.deepEqual(fs.readFileSync(path.join(entry.path, ".import-quarantine/plugins/custom/package/server/index.mjs")), h.files.get("plugins/custom/package/server/index.mjs"));
  assert.deepEqual(fs.readFileSync(path.join(entry.path, ".import-quarantine/agent-plugins/portable/memory/notes/note.md")), Buffer.from("portable plugin state"));
  assert.equal(fs.existsSync(h.registry.stagePath({ importId: pending.importId })), false);
  assert.deepEqual(h.started, [ready.newSiteName]);
});
