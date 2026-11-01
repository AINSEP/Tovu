import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { sqliteKernel } from "#src/platform/db/kernel/drivers/sqlite";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { composeSiteSavedKeys, createSavedKeysStore } from "../site-portability.js";
import { openProjectStore } from "../project-store.js";
import { attachedOnlyVault } from "#src/features/project-keys/attached-vault";
import { EnvOrFileKeyring } from "#src/features/webhooks/keyring.env";
import { siteKeySourcesForSiteDir } from "#src/features/webhooks/site-key-sources";
import { AesGcmSecretSealer as SiteSealer } from "#src/features/webhooks/secret-sealer.aesgcm";

const stamp = "2026-10-31T00:00:00Z";
const scope = (workspaceId: string) => ({ workspaceId, kind: "vendor" as const, ownerKey: "tovu", principalId: null, binding: null });
async function seed(store: Awaited<ReturnType<typeof createSavedKeysStore>>, id: string, label: string, token: string) {
  await store.vault.put({ ...scope(store.workspaceId), id, label, provider: "provider", meta: { credentialType: "vendor", worksFor: ["provider"] }, payload: { token }, expectedRevision: null });
}

for (const placement of ["inSite", "appData"] as const) test(`real snapshot and attachment-filtered project vault restore with a third site key in SQLite (${placement})`, { timeout: 120000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "saved-keys-sqlite-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceDb = openContentDb(":memory:");
  t.after(() => sourceDb.$client.close());
  sourceDb.$client.prepare("INSERT INTO workspaces (id,slug,name,created_at) VALUES (?,?,?,?)").run("source", "source", "Source", stamp);
  const keyring = new InMemoryKeyring({ hkdfSalt: "real-saved-keys" }, { keyId: "source-key" });
  const sealer = new AesGcmSecretSealer({ keyring });
  const source = await createSavedKeysStore({ kernel: sqliteKernel<ContentDatabase>(sourceDb), workspaceId: "source", keyring, sealer });
  await seed(source, "site", "Hosting", "site-secret");
  await source.settings.saveDefinition({ settingId: "secret-setting", workspaceId: "source", namespace: "site.private", key: "credential", version: 1,
    ownerKind: "site", ownerId: null, schema: { type: "string" }, defaultValue: null, scopes: 2, secret: true, status: "active",
    aliasOfNamespace: null, aliasOfKey: null, coercionTag: null, createdAt: stamp, updatedAt: stamp });
  await source.settings.saveWorkspaceValue({ settingId: "secret-setting", workspaceId: "source", principalId: null, scope: "workspace", state: "set",
    valueJson: "private-setting-value", defVersion: 1, seq: 0, updatedBy: "share", updatedAt: stamp, originPluginId: null });
  const snapshot = sourceDb.$client.serialize();
  await seed(source, "after-snapshot", "Later", "must-not-export");
  const project = await openProjectStore({ home: root, sitesHome: path.join(root, "sites") });
  t.after(() => project.close({}));
  const projectVault = { ...project.vault, repo: attachedOnlyVault({ vault: project.vault.repo, siteId: "source-meta-uuid", attachments: project.attachments }) };
  // Seed through the real project service, then attach only two rows to this site's META UUID.
  const { SecretsVaultService, createVaultMetaParsers } = await import("@jini-ai/platform/secrets/credential-sets");
  const pv = new SecretsVaultService({ ...project.vault, metaParsers: createVaultMetaParsers({}), authorize: async () => {}, now: () => stamp, newId: () => "unused" });
  for (const [id, label] of [["attached", "Other"], ["shadowed", "Hosting"], ["sibling", "Sibling"]]) {
    await pv.put({ ...scope("project"), id, label, provider: "provider", meta: { credentialType: "vendor", worksFor: ["provider"] }, payload: { token: id + "-secret" }, expectedRevision: null });
    if (id !== "sibling") await project.attachments.attach({ siteId: "source-meta-uuid", siteName: "source", keyId: id });
  }
  const home = path.join(root, "recipient-home"), dir = path.join(root, "recipient");
  fs.mkdirSync(dir);
  const databaseDir = placement === "inSite" ? dir : path.join(root, "app-data");
  fs.mkdirSync(databaseDir, { recursive: true });
  const dbPath = path.join(databaseDir, "content.db"), recipientDb = openContentDb(dbPath);
  recipientDb.$client.prepare("INSERT INTO workspaces (id,slug,name,created_at) VALUES (?,?,?,?)").run("recipient", "recipient", "Recipient", stamp);
  recipientDb.$client.close();
  const keys = composeSiteSavedKeys({ workspaceId: "source", keyring, sealer, settingsRepo: source.settings,
    projectVault, projectTransaction: project.transaction }, { home, env: {}, mode: "local" });
  const identity = { shareId: "share", workspaceId: "source" };
  const exported = await keys.capture({ ...identity, snapshot });
  const { password } = await keys.reveal({ ...identity, sealedPassword: exported.sealedPassword });
  const destination = { dir, dbPath, siteId: "recipient-meta-uuid", encryptedKeys: exported.encryptedKeys };
  assert.equal((await keys.restore(destination)).notices.length, 1);
  assert.equal((await keys.restore({ ...destination, password: "wrong" })).notices.length, 1);
  assert.deepEqual(await keys.restore({ ...destination, password }), { notices: [] });
  // Creation commits metadata only after restore, using the identity allocated above.
  assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), false);
  assert.deepEqual(fs.readdirSync(path.join(home, ".tovu", "site-keys")), [destination.siteId + ".hex"]);
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: destination.siteId, siteKeyId: destination.siteId }));
  const reopened = openContentDb(dbPath);
  t.after(() => reopened.$client.close());
  const recipientKeyring = new EnvOrFileKeyring({ sources: siteKeySourcesForSiteDir({ siteDir: dir, home, cwd: root, mode: "local", env: {} }) }, { env: () => ({}) });
  const recipientSealer = new SiteSealer(recipientKeyring);
  const recipient = await createSavedKeysStore({ kernel: sqliteKernel<ContentDatabase>(reopened), workspaceId: "recipient", keyring: recipientKeyring, sealer: recipientSealer });
  assert.deepEqual((await recipient.repo.list(scope("recipient"))).map(row => row.id).sort(), ["attached", "site"]);
  assert.deepEqual((await recipient.vault.get({ ...scope("recipient"), id: "attached" }))?.payload, { token: "attached-secret" });
  assert.equal((await recipient.settings.getWorkspaceValue({ workspaceId: "recipient", settingId: "secret-setting" }))?.valueJson, "private-setting-value");
  assert.equal((await recipient.settings.findDefinitionBySettingId({ settingId: "secret-setting" }))?.workspaceId, "recipient");
  assert.deepEqual(await recipient.settings.listRevisions({ settingId: "secret-setting" }), [], "secret values never enter an imported revision history");
  const imported = (await recipient.repo.find({ workspaceId: "recipient", id: "site" }))!;
  const { buildVaultAad } = await import("@jini-ai/platform/secrets/credential-sets");
  await assert.rejects(sealer.open({ sealed: imported.sealed! }, { aad: buildVaultAad(imported) }));
  await assert.rejects(project.vault.sealer.open({ sealed: imported.sealed! }, { aad: buildVaultAad(imported) }));
  assert.equal(reopened.$client.serialize().includes(Buffer.from("site-secret")), false);
  // Force a real SQL label conflict AFTER the first new row is written. Preparation alone cannot
  // detect this unique-index failure; only the shared transaction can undo the earlier insert.
  for (const id of ["site", "after-snapshot"]) {
    const existing = (await source.repo.find({ workspaceId: "source", id }))!;
    await source.vault.delete({ ...scope("source"), id, expectedRevision: existing.revision });
  }
  await seed(source, "a-fresh", "Fresh", "fresh-secret");
  await seed(source, "z-conflict", "Other", "conflicting-secret");
  const noProject = composeSiteSavedKeys({ workspaceId: "source", keyring, sealer, settingsRepo: source.settings }, { home, env: {}, mode: "local" });
  const collision = await noProject.capture({ ...identity, snapshot: sourceDb.$client.serialize() });
  const collisionPassword = await noProject.reveal({ ...identity, sealedPassword: collision.sealedPassword });
  assert.equal((await noProject.restore({ ...destination, encryptedKeys: collision.encryptedKeys, password: collisionPassword.password })).notices.length, 1);
  assert.deepEqual((await recipient.repo.list(scope("recipient"))).map(row => row.id).sort(), ["attached", "site"], "SQL failure must roll back a-fresh too");
});
