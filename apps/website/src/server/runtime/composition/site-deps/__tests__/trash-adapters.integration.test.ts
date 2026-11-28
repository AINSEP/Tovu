import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { sql } from "kysely";
import { uploadMedia } from "@jini-ai/cms/media";
import { createUser } from "@jini-ai/user-management/server";
import { identityServiceDepsFrom } from "#src/server/inbound/admin-http/routes/users/deps";
import { pluginsInstallDir } from "../../site-paths.js";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { bootSite, isolateSiteEnvironment, removeSiteDir, type FixtureSite } from "../../__tests__/form-delivery-vertical-slice.fixture.js";

/**
 * @file The lazily-called Trash closures `composeTrashAdapters` (`site-deps/trash-adapters.ts`) hands
 * its adapters, driven through the assembled SQLite composition's own `deps.trash` (the door the
 * routes use): media purge delegates to `purgeMedia` (blob tombstoned, row gone), the user adapter's
 * account policy runs inside an identity transaction (seeded owner refused, ordinary user trashed),
 * and the plugin directory adapter locates the site-installed package (`<site>/plugins/<id>`) and forgets its activation on purge.
 */

const AT = "2030-01-01T00:00:00.000Z";
let site: FixtureSite;
let dir: string;
let home: string;
let restoreEnv: () => void;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-trash-adapters-"));
  home = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-trash-adapters-home-"));
  restoreEnv = isolateSiteEnvironment({ home });
  site = await bootSite({ dir });
});

after(async () => {
  await site?.close();
  restoreEnv();
  await removeSiteDir({ dir });
  fs.rmSync(home, { recursive: true, force: true });
});

async function uploadPng(required: { filename: string; tail: number }) {
  const { deps } = site;
  const { media } = await uploadMedia({ deps: { mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo,
    blobStore: deps.blobStore, clock: deps.clock, idGen: deps.idGen, createHash },
  input: { workspaceId: deps.workspaceId, filename: required.filename, contentType: "image/png", bytes: Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, required.tail), createdByPrincipal: "owner" } });
  return media;
}

async function itemIdFor(required: { entityType: string; entityId: string }): Promise<string> {
  const page = await site.deps.trash.list({ workspaceId: site.deps.workspaceId, now: AT, limit: 50 }, { entityTypes: [required.entityType] });
  const item = page.items.find(row => row.entityId === required.entityId);
  assert.ok(item, `${required.entityType} ${required.entityId} is in Trash`);
  return item.id;
}

test("media purge runs purgeMedia's ladder: the row is deleted and its blob tombstoned", async () => {
  const { deps } = site;
  const workspaceId = deps.workspaceId;
  const media = await uploadPng({ filename: "trash-me.png", tail: 1 });
  const hidden = await deps.trash.trash({ workspaceId, entityType: "media", entityId: media.id, actor: { principalId: "owner" }, display: { title: "trash-me" }, at: AT, expectedVersion: null });
  assert.equal(hidden.ok, true);
  assert.equal((await deps.mediaRepo.findById({ workspaceId, id: media.id }))?.status, "trashed");
  const report = await deps.trash.purgeSelected({ workspaceId, ids: [await itemIdFor({ entityType: "media", entityId: media.id })], actor: { principalId: "owner" }, authorizeItem: async () => true });
  assert.deepEqual(report.results.map(row => row.outcome), ["purged"]);
  assert.equal(await deps.mediaRepo.findById({ workspaceId, id: media.id }), null);
  assert.equal((await deps.assetBlobRepo.findByHash({ workspaceId, sha256: media.source.sha256 }))?.status, "tombstoned");
});

test("media still used by a post body is not purged: the outcome is still-referenced and the row and blob stay", async () => {
  const { deps } = site;
  const workspaceId = deps.workspaceId;
  const media = await uploadPng({ filename: "in-use.png", tail: 2 });
  await deps.postRepo.save(buildPostRecord({ id: "uses-media", workspaceId, slug: "uses-media", bodyFormat: "html", bodyHtml: `<p><img src="/media/${media.id}/in-use.png"></p>` }));
  assert.equal((await deps.trash.trash({ workspaceId, entityType: "media", entityId: media.id, actor: { principalId: "owner" }, display: { title: "in-use" }, at: AT, expectedVersion: null })).ok, true);
  const report = await deps.trash.purgeSelected({ workspaceId, ids: [await itemIdFor({ entityType: "media", entityId: media.id })], actor: { principalId: "owner" }, authorizeItem: async () => true });
  assert.deepEqual(report.results.map(row => row.outcome), ["still-referenced"]);
  assert.equal((await deps.mediaRepo.findById({ workspaceId, id: media.id }))?.status, "trashed");
  assert.equal((await deps.assetBlobRepo.findByHash({ workspaceId, sha256: media.source.sha256 }))?.status, "active");
});

test("post purge deletes the row and, the table probe answering yes, its search document", async () => {
  const { deps } = site;
  const workspaceId = deps.workspaceId;
  await deps.postRepo.save(buildPostRecord({ id: "purge-post", workspaceId, slug: "purge-post", status: "draft" }));
  await site.kernel.run(db => sql`INSERT OR REPLACE INTO post_search_document (post_id, title, slug, body_text) VALUES ('purge-post', 'Purge', 'purge-post', 'body')`.execute(db));
  const searchRows = async () => Number((await site.kernel.run(db => sql<{ n: number }>`SELECT count(*) AS n FROM post_search_document WHERE post_id = 'purge-post'`.execute(db))).rows[0]!.n);
  assert.equal(await searchRows(), 1);
  assert.equal((await deps.trash.trash({ workspaceId, entityType: "post", entityId: "purge-post", actor: { principalId: "owner" }, display: { title: "purge-post" }, at: AT, expectedVersion: null })).ok, true);
  const report = await deps.trash.purgeSelected({ workspaceId, ids: [await itemIdFor({ entityType: "post", entityId: "purge-post" })], actor: { principalId: "owner" }, authorizeItem: async () => true });
  assert.deepEqual(report.results.map(row => row.outcome), ["purged"]);
  assert.equal(await deps.postRepo.findById({ workspaceId, id: "purge-post" }), null);
  assert.equal(await searchRows(), 0);
});

test("user trash checks the account policy: deleting your own account is refused, an ordinary user is trashed", async () => {
  const { deps } = site;
  const workspaceId = deps.workspaceId;
  const ownerId = await deps.ownerPrincipalId;
  const service = identityServiceDepsFrom({ ...deps, clock: deps.clock, idGen: deps.idGen });
  const { principal } = await createUser({ deps: service, input: { workspaceId, callerPrincipalId: ownerId, username: "ordinary-jane", password: "correct-horse-battery" } });
  await assert.rejects(deps.trash.trash({ workspaceId, entityType: "user", entityId: ownerId, actor: { principalId: ownerId }, display: { title: "owner" }, at: AT, expectedVersion: null }),
    /you cannot delete your own account/);
  assert.equal((await deps.trash.list({ workspaceId, now: AT, limit: 50 }, { entityTypes: ["user"] })).items.some(row => row.entityId === ownerId), false);
  const trashed = await deps.trash.trash({ workspaceId, entityType: "user", entityId: principal.id, actor: { principalId: ownerId }, display: { title: "ordinary-jane" }, at: AT, expectedVersion: null });
  assert.equal(trashed.ok, true);
  assert.equal(await itemIdFor({ entityType: "user", entityId: principal.id }) !== "", true);
});

test("plugin trash parks the site-installed package, and purge deletes it and forgets its activation", async () => {
  const { deps } = site;
  const workspaceId = deps.workspaceId;
  const pluginId = "parked-plugin";
  const packageDir = path.join(pluginsInstallDir({ siteDir: dir }), pluginId);
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, "plugin.json"), JSON.stringify({ id: pluginId, version: "1.0.0" }));
  assert.equal(fs.existsSync(packageDir), true, "the installed package is on disk before trash");
  await deps.pluginActivationRepo.save({ pluginId, workspaceId, version: "1.0.0", enabled: false, updatedAt: AT });
  assert.equal((await deps.pluginActivationRepo.getActivation({ workspaceId, pluginId }))?.version, "1.0.0");
  const hidden = await deps.trash.trash({ workspaceId, entityType: "plugin", entityId: pluginId, actor: { principalId: "owner" }, display: { title: pluginId }, at: AT, expectedVersion: null });
  assert.equal(hidden.ok, true);
  assert.equal(fs.existsSync(packageDir), false, "trash parks the package out of the live tree");
  assert.equal(fs.existsSync(path.join(`${pluginsInstallDir({ siteDir: dir })}-trash`, pluginId, pluginId, "plugin.json")), true, "the parked copy keeps the package files");
  const report = await deps.trash.purgeSelected({ workspaceId, ids: [await itemIdFor({ entityType: "plugin", entityId: pluginId })], actor: { principalId: "owner" }, authorizeItem: async () => true });
  assert.deepEqual(report.results.map(row => row.outcome), ["purged"]);
  assert.equal(await deps.pluginActivationRepo.getActivation({ workspaceId, pluginId }), null);
  assert.equal(fs.existsSync(path.join(`${pluginsInstallDir({ siteDir: dir })}-trash`, pluginId)), false, "purge removes the parked copy");
});
