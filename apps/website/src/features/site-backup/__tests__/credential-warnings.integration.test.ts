import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import * as yauzl from "yauzl";
import Database from "better-sqlite3";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { createSiteShareBackend } from "../share-backend.js";
import { SiteShareRegistry } from "../share-registry.js";
import { requireShareSecretFree, excludedSharePath, validateSharePath } from "../share-file-policy.js";
import type { CredentialWarning } from "../credential-warnings.js";
import type { SiteSharePlanContent } from "../plan-store.js";
import { sanitizeShareDatabase, rebuildImportDatabase } from "#src/server/runtime/composition/site-portability";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { runtimeSchemaVersion } from "#src/platform/site-dir/schema-guard";
import { createShareArchiveReader } from "../import-archive-reader.js";
import { verifySiteImport } from "../import-verifier.js";
import { registerAdminSiteShareRoutes } from "#src/server/inbound/admin-http/routes/system/site-shares";
import { dispatchJsonRequest, dispatchHttpRequest } from "#src/server/__tests__/helpers/in-process-http";
import type { RouteDeps } from "#src/server/routes/types";

const key = "ghp_" + "a".repeat(36);
const stamp = "2026-11-03T00:00:00Z";

test("credential-looking files stay included and warnings contain only locations and match kinds", () => {
  const credentialWarnings: CredentialWarning[] = [];
  for (const [path, text] of [["themes/site/private-key.pem", "-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----"],
    ["themes/site/.env", `TOKEN=${key}`], ["themes/site/SKILL.md", "Token = the access-policy token"], ["themes/site/main.js", JSON.stringify(key)]]) {
    assert.equal(excludedSharePath({ path: path! }), false);
    assert.equal(requireShareSecretFree({ path: path!, bytes: Buffer.from(text!) }, { credentialWarnings }), true);
    assert.ok(credentialWarnings.some(warning => warning.path === path));
  }
  assert.ok(credentialWarnings.some(warning => warning.kind === "private key"));
  assert.ok(credentialWarnings.some(warning => warning.kind === "provider key shape"));
  assert.ok(credentialWarnings.some(warning => warning.kind === "labeled secret"));
  assert.equal(JSON.stringify(credentialWarnings).includes(key), false);
  assert.throws(() => validateSharePath({ path: "themes/../escape" }), { code: "UNSAFE_PATH" });
});

test("export keeps database values and complete plugin packages; download requires a durable acknowledgement", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "credential-warning-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const db = openContentDb({ filePath: ":memory:" }); t.after(() => closeSqliteConnection(db));
  db.$client.prepare("INSERT INTO workspaces(id,name,slug,created_at) VALUES ('ws','Site','site',?)").run(stamp);
  db.$client.prepare("INSERT INTO posts(id,workspace_id,title,slug,body_json,status,kind,updated_at,version) VALUES (?,'ws','Title',?,?,'draft','post',?,1)").run("one", key, JSON.stringify({ text: key }), stamp);
  const projected = await sanitizeShareDatabase({ snapshot: db.$client.serialize() });
  const fresh = new Database(projected.bytes); t.after(() => fresh.close());
  assert.equal(fresh.prepare("SELECT body_json FROM posts").get() && projected.bytes.includes(Buffer.from(key)), true);
  assert.ok(projected.credentialWarnings?.some(warning => warning.path === "content.db:posts.body_json"));
  const plan: SiteSharePlanContent = { target: { kind: "zip" }, profile: "share", database: { bytes: projected.bytes, watermarkAtCapture: 1 },
    credentialWarnings: projected.credentialWarnings, files: [], bufferedFiles: [
      { path: "settings.json", content: Buffer.from('{"name":"Site"}') },
      { path: "agent-plugins/custom/package/SKILL.md", content: Buffer.from(`Token = the access-policy token\n${key}`) },
      { path: "agent-plugins/custom/package/plugin.json", content: Buffer.from('{}') },
    ], plugins: [{ kind: "agent", id: "custom", version: "1", digest: "a".repeat(64), enabled: true, shipped: true }],
    include: { database: true, media: true, themes: true, plugins: true, settings: true }, skipped: [], scopeNotes: {},
    totalBytes: projected.bytes.length + 500, site: { name: "Site", folderName: "site" }, schema: runtimeSchemaVersion(), tovuVersion: "test", createdAt: stamp };
  const registry = new SiteShareRegistry({ directory });
  let uploads = 0;
  const delivery = { provider: "fixture", store: { upload: async ({ key }: { key: string }) => {
    const [, token, file] = key.split("/");
    assert.ok(await registry.findToken({ token: token!, file: file! }), "runtime delivery can see the acknowledged artifact before verification");
    uploads++; return { url: "https://example.test/shared.zip" };
  }, verify: async () => true, delete: async () => {} } };
  const backend = createSiteShareBackend({ registry, site: "ws", prepare: async () => plan, zip: zipFolderFiles, delivery: async () => delivery });
  const created = await backend.create({ principalId: "owner", signal: new AbortController().signal }, { waitMs: 60_000 }) as { shareId: string; credentialWarnings: CredentialWarning[]; needsAcknowledgement: boolean; url: string | null };
  assert.equal(created.needsAcknowledgement, true); assert.equal(created.url, null); assert.equal(uploads, 0);
  assert.ok(created.credentialWarnings.some(warning => warning.path === "agent-plugins/custom/package/SKILL.md"));
  assert.equal(JSON.stringify(created.credentialWarnings).includes(key), false);
  const pendingRow = (await registry.get({ shareId: created.shareId }))!;
  assert.equal(await registry.findToken(pendingRow), null, "public tokens cannot bypass acknowledgement");
  const archive = await readFile(registry.artifactPath(created));
  const imported = await verifySiteImport({ archive, reader: createShareArchiveReader({ yauzl }), sanitize: rebuildImportDatabase, schema: runtimeSchemaVersion() });
  assert.ok([...imported.files.values()].some(bytes => bytes.includes(Buffer.from(key))));
  assert.ok(imported.database.includes(Buffer.from(key)));
  assert.equal(imported.plugins.length, 1); assert.equal(imported.trustedPlugins.length, 0);
  assert.ok(imported.credentialWarnings!.some(warning => warning.path === "content.db:posts.body_json"));
  let allowed = false;
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminSiteShareRoutes({ app, deps: { workspaceId: "ws", authorize: async () => ({ allowed, reason: "fixture" }), siteShareBackend: backend } as unknown as RouteDeps });
  const root = `/api/admin/v1/workspaces/ws/site-shares/${created.shareId}`;
  assert.equal((await dispatchJsonRequest(app, "POST", root + "/acknowledge", {})).status, 403);
  assert.equal((await registry.get({ shareId: created.shareId }))?.needsAcknowledgement, true);
  allowed = true;
  const blocked = await dispatchJsonRequest(app, "GET", root + "/download");
  assert.equal(blocked.status, 409);
  assert.deepEqual(blocked.body, { code: "ACKNOWLEDGE_CREDENTIALS", message: "This export may contain credentials. Review the warnings and acknowledge that you understand before downloading.", credentialWarnings: created.credentialWarnings });
  const acknowledged = await dispatchJsonRequest(app, "POST", root + "/acknowledge", {});
  assert.equal(acknowledged.status, 200); assert.equal(uploads, 1);
  const reopened = new SiteShareRegistry({ directory });
  assert.equal((await reopened.get({ shareId: created.shareId }))?.needsAcknowledgement, false);
  assert.equal((await backend.list({}))[0]?.needsAcknowledgement, false);
  assert.equal((await registry.findToken(pendingRow))?.needsAcknowledgement, false);
  assert.equal((await dispatchJsonRequest(app, "POST", root + "/acknowledge", {})).status, 200);
  assert.equal(uploads, 1, "acknowledgement retries do not upload twice");
  const downloaded = await dispatchHttpRequest({ app, method: "GET", url: root + "/download" });
  assert.equal(downloaded.status, 200);
  assert.equal((await dispatchJsonRequest(app, "POST", root.replace("workspaces/ws/", "workspaces/other/") + "/acknowledge", {})).status, 404);
  await registry.disable({ shareId: created.shareId, site: "ws" });
  assert.equal((await dispatchJsonRequest(app, "POST", root + "/acknowledge", {})).status, 404);
  assert.equal((await reopened.get({ shareId: created.shareId }))?.status, "revoked");
});

test("old share rows without warning metadata remain acknowledged", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "legacy-share-warning-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const shareId = "00000000-0000-0000-0000-000000000001";
  await writeFile(path.join(directory, shareId + ".json"), JSON.stringify({ shareId, site: "ws", status: "active" }));
  const row = await new SiteShareRegistry({ directory }).get({ shareId });
  assert.deepEqual(row?.credentialWarnings, []); assert.equal(row?.needsAcknowledgement, false);
});
