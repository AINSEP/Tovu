/** k1 T1–T4: real SQL vaults, project attachments, envelope, ZIP, isolated worker and site creation. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import express from "express";
import { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import type { Socket } from "node:net";
import type { RouteDeps } from "../../../../server/routes/types.js";
import { registerAdminSiteShareRoutes } from "../../../../server/inbound/admin-http/routes/system/site-shares.js";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { buildVaultAad } from "@jini-ai/platform/secrets/credential-sets";
import { contentKernel } from "../../../../platform/db/content-kernel.js";
import { openContentDb } from "../../../../platform/db/sqlite/content-db.js";
import { closeSqliteConnection, openSqliteFileKernel } from "../../../../platform/db/kernel/drivers/sqlite.js";
import type { ContentDatabase } from "../../../../platform/db/content-database.generated.js";
import { resolveSiteDatabasePaths } from "../../../../platform/site-dir/site-databases.js";
import { readTemplate } from "../../../../platform/site-dir/read-template.js";
import { FixedSiteKeyKeyring, EnvOrFileKeyring } from "../../../webhooks/keyring.env.js";
import { AesGcmSecretSealer } from "../../../webhooks/secret-sealer.aesgcm.js";
import { siteKeySourcesForSiteDir } from "../../../webhooks/site-key-sources.js";
import { attachedOnlyVault } from "../../../project-keys/attached-vault.js";
import { resolveAgentPluginLayout } from "../../../agent-plugins/layout.js";
import { openProjectStore } from "../../../../server/runtime/composition/project-store.js";
import { composeSiteSavedKeys, createSavedKeysStore, sanitizeShareDatabase, rewriteArchiveMedia, restoreStagedImport } from "../../../../server/runtime/composition/site-portability.js";
import { createSiteShareBackend } from "../../share-backend.js";
import { createSiteImportBackend } from "../../import-backend.js";
import { SiteShareRegistry } from "../../share-registry.js";
import { prepareShareContent } from "../../share-preparation.js";
import { SAVED_KEYS_PATH } from "../../saved-keys-port.js";
import { importFixture, MEDIA, OWNER_PASSWORD, reader } from "../import.fixture.js";
import { verifySiteImport } from "../../import-verifier.js";
import { rebuildImportDatabase } from "../../../../server/runtime/composition/site-portability.js";
import { runtimeSchemaVersion } from "../../../../platform/site-dir/schema-guard.js";

/** Real admin handlers over an in-process stream; no listening socket is needed. */
async function shareRequest(app: express.Express, endpoint: string, body: unknown) {
  const socket = new PassThrough(), req = new IncomingMessage(socket as unknown as Socket);
  req.method = "POST"; req.url = endpoint;
  req.headers = { host: "localhost", origin: "http://localhost", "sec-fetch-site": "same-origin" };
  Object.assign(req, { body }); req.push(null);
  const res = new ServerResponse(req); res.assignSocket(socket as unknown as Socket);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<any>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("share request timeout")), 60000);
      const chunks: Buffer[] = []; socket.on("data", chunk => chunks.push(Buffer.from(chunk)));
      res.on("finish", () => {
        try {
          const wire = Buffer.concat(chunks).toString();
          assert.equal(res.statusCode, 200, wire);
          resolve(JSON.parse(wire.slice(wire.indexOf("\r\n\r\n") + 4)));
        } catch (error) { reject(error); }
      });
      app(req, res);
    });
  } finally { clearTimeout(timer); socket.destroy(); }
}

for (const placement of ["inSite", "appData"] as const) for (const scenario of ["off", "correct", "wrong", "missing"] as const) {
  test(`real saved keys ${scenario} round trip (${placement})`, { timeout: 120000 }, async t => {
    const h = await importFixture(t, placement), workspaceId = "ws";
    // Production sites use WAL. A memory-only source hides deserialization failures on export.
    const sourcePath = path.join(h.root, "source.db");
    fs.writeFileSync(sourcePath, h.db.$client.serialize());
    const sourceDb = openContentDb({ filePath: sourcePath });
    t.after(() => closeSqliteConnection(sourceDb));
    assert.equal(sourceDb.$client.pragma("journal_mode", { simple: true }), "wal");
    const bearer = "roundTripCredentialValue987654321";
    sourceDb.$client.prepare("UPDATE posts SET body_json=? WHERE id='post-0'").run(JSON.stringify({ text: "Authorization: Bearer " + bearer }));
    const keyring = new FixedSiteKeyKeyring("11".repeat(32)), sealer = new AesGcmSecretSealer(keyring);
    const source = await createSavedKeysStore({ kernel: contentKernel(sourceDb), workspaceId, keyring, sealer });
    const put = async (store: typeof source, id: string, label: string, token: string) => store.vault.put({ workspaceId: store.workspaceId, id,
      kind: "vendor", ownerKey: "tovu", principalId: null, binding: null, provider: "hosting", label, isDefault: false, expectedRevision: null,
      meta: { credentialType: "vendor", worksFor: ["hosting"] }, payload: { token } });
    const sourceToken = "ghp_" + "s".repeat(36), projectToken = "ghp_" + "p".repeat(36);
    await put(source, "site-key", "Hosting", sourceToken);
    const settingSecret = "current-site-setting-secret";
    sourceDb.$client.prepare("INSERT INTO setting_definitions(setting_id,version,namespace,key,owner_kind,schema_json,default_json,scopes,secret,status,created_at,updated_at) VALUES ('saved-secret',1,'core.archive-fixture','secret','core',?,'null',2,1,'active',?,?)").run('{"type":"string"}', "2026-10-31T00:00:00Z", "2026-10-31T00:00:00Z");
    sourceDb.$client.prepare("INSERT INTO setting_values_workspace(setting_id,workspace_id,value_json,state,def_version,seq,updated_by,updated_at) VALUES ('saved-secret','ws',?,'set',1,1,'owner',?)").run(JSON.stringify(settingSecret), "2026-10-31T00:00:00Z");
    const project = await openProjectStore({ sitesHome: h.workspace.home({}), home: h.root }); t.after(() => project.close({}));
    const projectKernel = openSqliteFileKernel<ContentDatabase>(project.dbPath); t.after(() => projectKernel.close());
    const projectKeys = await createSavedKeysStore({ kernel: projectKernel, ...project.vault });
    await put(projectKeys, "attached", "Attached", projectToken);
    await put(projectKeys, "shadow", "Hosting", "shadowed-project-secret");
    await put(projectKeys, "unattached", "Other site", "unattached-project-secret");
    for (const keyId of ["attached", "shadow"]) await project.attachments.attach({ siteId: "source-meta", keyId, siteName: "Source" });
    const savedKeys = composeSiteSavedKeys({ workspaceId, keyring, sealer, settingsRepo: source.settings,
      projectVault: { ...project.vault, repo: attachedOnlyVault({ vault: project.vault.repo, siteId: "source-meta", attachments: project.attachments }) },
      projectTransaction: project.transaction,
    }, { home: h.root, env: {}, mode: "local" });
    const sourceDir = path.join(h.root, "source"); fs.mkdirSync(sourceDir); fs.writeFileSync(path.join(sourceDir, "config.json"), '{"name":"Portable"}');
    const shares = new SiteShareRegistry({ directory: path.join(h.root, "shares") });
    const backend = createSiteShareBackend({ registry: shares, site: workspaceId, ownerPrincipalId: "owner", savedKeys, zip: zipFolderFiles, delivery: async () => undefined,
      prepare: input => prepareShareContent({ ...input, savedKeys, snapshotRoot: h.root, sanitize: sanitizeShareDatabase, rewriteMedia: rewriteArchiveMedia,
        sources: { siteDir: sourceDir, mediaUploadsDir: null, themesDir: path.join(sourceDir, "themes"), skillsDir: path.join(sourceDir, "skills"), agentPlugins: resolveAgentPluginLayout({ siteDir: sourceDir }, { env: {} }), tovuVersion: "test" },
        imageTransformer: { transform: async () => assert.fail("not raster") }, blobStore: { get: async () => MEDIA, sizeOf: async () => MEDIA.length },
        dbOps: { getCapabilities: async () => ({ restorePoint: { kind: "file-snapshot", costClass: "cheap" } }), captureRestorePoint: async () => {
          const artifactRef = path.join(h.root, "snapshot.db"); fs.writeFileSync(artifactRef, sourceDb.$client.serialize()); return { artifactRef, watermarkAtCapture: 1 };
        }, restoreFromArtifact: async () => assert.fail("must not restore source") },
      }, { signal: input.signal }),
    });
    const app = express();
    app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; next(); });
    registerAdminSiteShareRoutes({ app, deps: { workspaceId, ownerPrincipalId: "owner", siteShareBackend: backend, authorize: async () => ({ allowed: true }) } as unknown as RouteDeps });
    const endpoint = `/api/admin/v1/workspaces/${workspaceId}/site-shares`;
    let exported = await shareRequest(app, endpoint, { includeSavedKeys: scenario !== "off" });
    while (exported.jobId) exported = await shareRequest(app, endpoint, { jobId: exported.jobId });
    assert.equal(exported.hasEncryptedKeys === true, scenario !== "off");
    assert.match(exported.shareId, /^[0-9a-f-]{36}$/);
    assert.equal(exported.downloadUrl, `/api/admin/v1/workspaces/ws/site-shares/${exported.shareId}/download`);
    assert.match(exported.notices.join(), /posts\.body_json.*post-0/);
    const password = scenario === "off" ? undefined : (await shareRequest(app, `${endpoint}/${exported.shareId}/password`, {})).password;
    const archive = fs.readFileSync(shares.artifactPath(exported));
    const files = new Map<string, Buffer>();
    for await (const e of reader.entries({ archive })) if (e.kind === "file") {
      const chunks: Buffer[] = []; for await (const c of e.openReadStream({})) chunks.push(Buffer.from(c)); files.set(e.entryPath, Buffer.concat(chunks));
    }
    assert.equal(files.has(SAVED_KEYS_PATH), scenario !== "off");
    assert.equal(Boolean(JSON.parse(files.get("manifest.json")!.toString()).encryptedKeys), scenario !== "off");
    for (const bytes of files.values()) for (const secret of [bearer, sourceToken, projectToken, settingSecret, "shadowed-project-secret", "unattached-project-secret", "11".repeat(32), ...(password ? [password] : [])]) assert.equal(bytes.includes(Buffer.from(secret)), false);
    const imports = createSiteImportBackend({ ...h.backendPorts, restoreStagedImport: (input, options) => restoreStagedImport({ ...input, savedKeys }, options) });
    const { uploadId } = await imports.upload({ principalId: "owner", archive });
    const pending = await imports.importBackup({ principalId: "owner", source: { uploadId } });
    assert.equal(pending.hasEncryptedKeys, scenario !== "off");
    const supplied = scenario === "correct" ? password : scenario === "wrong" ? "wrong-password" : undefined;
    const ready = await imports.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD, savedKeysPassword: supplied });
    assert.equal(ready.status, "ready");
    const dir = path.join(h.workspace.home({}), ready.newSiteName!), dbPath = resolveSiteDatabasePaths({ dir }, { workspace: h.workspace }).contentDbPath;
    const imported = openContentDb({ filePath: dbPath }); t.after(() => closeSqliteConnection(imported));
    assert.equal(imported.$client.serialize().includes(Buffer.from(bearer)), false);
    const ids = imported.$client.prepare("SELECT id FROM secrets_vault ORDER BY id").all().map(row => row.id);
    assert.deepEqual(ids, scenario === "correct" ? ["attached", "site-key"] : []);
    const settings = imported.$client.prepare("SELECT value_json FROM setting_values_workspace WHERE setting_id='saved-secret'").all();
    assert.deepEqual(settings, scenario === "correct" ? [{ value_json: JSON.stringify(settingSecret) }] : []);
    if (scenario === "wrong" || scenario === "missing") {
      assert.match(ready.warnings!.join(), /Saved keys were left out/);
      assert.deepEqual((await imports.list({ principalId: "owner" }))[0]!.warnings, ready.warnings);
    }
    if (scenario === "correct") {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8"));
      assert.equal(meta.siteKeyId, ready.newSiteId);
      assert.deepEqual(fs.readdirSync(path.join(h.root, ".tovu", "site-keys")), [meta.siteKeyId + ".hex"]);
      const recipientWorkspace = readTemplate({ templateId: "starter" }).seed.workspace.id;
      const recipientKeyring = new EnvOrFileKeyring({ sources: siteKeySourcesForSiteDir({ siteDir: dir, env: {}, home: h.root, mode: "local", cwd: h.root }) }, { env: () => ({}) });
      const recipient = await createSavedKeysStore({ kernel: contentKernel(imported), workspaceId: recipientWorkspace, keyring: recipientKeyring, sealer: new AesGcmSecretSealer(recipientKeyring) });
      for (const [id, token] of [["attached", projectToken], ["site-key", sourceToken]]) {
        const context = { workspaceId: recipientWorkspace, kind: "vendor" as const, ownerKey: "tovu", principalId: null, binding: null, id: id! };
        assert.deepEqual((await recipient.vault.get(context))!.payload, { token });
        const row = (await recipient.repo.find({ workspaceId: recipientWorkspace, id: id! }))!;
        await assert.rejects(sealer.open({ sealed: row.sealed! }, { aad: buildVaultAad(row) }));
        await assert.rejects(project.vault.sealer.open({ sealed: row.sealed! }, { aad: buildVaultAad(row) }));
      }
    }
    await h.assertOwnerLogin({ dir, rejectedPassword: "source-password" });
  });
}

test("edited bundled plugin labels survive production export and quarantined import", { timeout: 120000 }, async t => {
  const h = await importFixture(t);
  const label = Buffer.from('{"API token":"Token de API","edited":true}');
  h.files.set(`agent-plugins/ws/ws/github/package/sha256/${"a".repeat(64)}/locales/es.json`, label);
  const { archive } = await h.prepareProductionShare();
  const verified = await verifySiteImport({ archive, reader, sanitize: rebuildImportDatabase, schema: runtimeSchemaVersion() });
  assert.deepEqual(verified.files.get("agent-plugins/github/package/locales/es.json"), label);
  assert.equal(verified.trustedPlugins.some(plugin => plugin.id === "github"), false);
  const { uploadId } = await h.backend.upload({ principalId: "owner", archive });
  const pending = await h.backend.importBackup({ principalId: "owner", source: { uploadId } });
  const ready = await h.backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(ready.status, "ready");
  const quarantined = path.join(h.workspace.home({}), ready.newSiteName!, ".import-quarantine/agent-plugins/github/package/locales/es.json");
  assert.deepEqual(fs.readFileSync(quarantined), label);
});
