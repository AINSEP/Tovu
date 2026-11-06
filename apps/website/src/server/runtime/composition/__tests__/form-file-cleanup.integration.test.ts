import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { uploadMedia } from "@jini-ai/cms/media";
import { bootSite, isolateSiteEnvironment, outboxRows, removeSiteDir } from "./form-delivery-vertical-slice.fixture.js";

test("attachment purge journals rendition identities and tombstones after its snapshot owner is removed", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-form-file-cleanup-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-form-file-cleanup-owner-"));
  const restore = isolateSiteEnvironment({ home });
  let site: Awaited<ReturnType<typeof bootSite>> | undefined;
  try {
    site = await bootSite({ dir });
    const { deps } = site;
    const workspaceId = deps.workspaceId;
    const at = "2030-01-01T00:00:00.000Z";
    await deps.formDefinitionRepo.create({ id: "attachment-form", workspaceId, name: "Files", slug: "files", status: "active", version: 1,
      createdAt: at, updatedAt: at, fields: [], notify: { enabled: false, recipients: [] } });
    const { media } = await uploadMedia({ deps: { mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo,
      renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore, clock: deps.clock, idGen: deps.idGen },
      input: { workspaceId, filename: "private-photo.png", contentType: "image/png", bytes: Uint8Array.of(137,80,78,71,13,10,26,10), createdByPrincipal: "owner", access: "private" } });
    const storageKey = (await deps.assetBlobRepo.findByHash({ workspaceId, sha256: media.source.sha256 }))!.storageKey;
    await deps.formSubmissionRepo.create({ workspaceId, id: "attachment-submission", formDefinitionId: "attachment-form",
      data: { photo: { mediaId: media.id, filename: "photo.png", contentType: "image/png", byteSize: 8 } }, sourceIp: null, submittedAt: at });
    const hidden = await deps.trash.trash({ workspaceId, entityType: "form_submission", entityId: "attachment-submission", actor: { principalId: "owner" }, display: { title: "Files" }, at, expectedVersion: null });
    assert.equal(hidden.ok, true);
    const listed = await deps.trash.list({ workspaceId, now: at, limit: 50 });
    const item = listed.items.find(row => row.entityId === "attachment-submission"); assert.ok(item);
    const report = await deps.trash.purgeSelected({ workspaceId, ids: [item.id], actor: { principalId: "owner" }, authorizeItem: async () => true });
    assert.deepEqual(report.results.map(row => row.outcome), ["purged"]);
    assert.equal((await deps.assetBlobRepo.findByHash({ workspaceId, sha256: media.source.sha256 }))!.status, "tombstoned");
    assert.equal(await deps.mediaRepo.findById({ workspaceId, id: media.id }), null);
    const cleanup = (await outboxRows({ kernel: site.kernel })).find(row => row.event.name === "form.attachment.cleanup" && row.event.aggregateId === media.id);
    assert.ok(cleanup, "the cleanup work survives the purge transaction");
    assert.deepEqual(cleanup.event.payload.storageKeys, [storageKey]);
  } finally {
    await site?.close(); restore();
    await removeSiteDir({ dir }); fs.rmSync(home, { recursive: true, force: true });
  }
});

test('a public editorial asset with a submission-like filename is retained during form purge', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-form-file-owner-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-form-file-owner-state-'));
  const restore = isolateSiteEnvironment({ home }); let site: Awaited<ReturnType<typeof bootSite>> | undefined;
  try {
    site = await bootSite({ dir }); const { deps } = site; const workspaceId = deps.workspaceId, at = '2030-01-01T00:00:00.000Z';
    await deps.formDefinitionRepo.create({ id: 'public-ref-form', workspaceId, name: 'Files', slug: 'files', status: 'active', version: 1, createdAt: at, updatedAt: at, fields: [], notify: { enabled: false, recipients: [] } });
    const { media } = await uploadMedia({ deps: { mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore, clock: deps.clock, idGen: deps.idGen },
      input: { workspaceId, filename: 'forged-photo.png', contentType: 'image/png', bytes: Uint8Array.of(137,80,78,71,13,10,26,10), createdByPrincipal: 'owner' } });
    await deps.formSubmissionRepo.create({ workspaceId, id: 'forged', formDefinitionId: 'public-ref-form', data: { photo: { mediaId: media.id, filename: 'photo.png', contentType: 'image/png', byteSize: 8 } }, sourceIp: null, submittedAt: at });
    const hidden = await deps.trash.trash({ workspaceId, entityType: 'form_submission', entityId: 'forged', actor: { principalId: 'owner' }, display: { title: 'Files' }, at, expectedVersion: null }); assert.equal(hidden.ok, true);
    const listed = await deps.trash.list({ workspaceId, now: at, limit: 50 }); const item = listed.items.find(row => row.entityId === 'forged'); assert.ok(item);
    await assert.rejects(deps.trash.purgeSelected({ workspaceId, ids: [item.id], actor: { principalId: 'owner' }, authorizeItem: async () => true }), /no proven form upload owner/);
    assert.equal((await deps.mediaRepo.findById({ workspaceId, id: media.id }))!.status, 'active');
    assert.equal((await outboxRows({ kernel: site.kernel })).some(row => row.event.name === 'form.attachment.cleanup' && row.event.aggregateId === media.id), false);
  } finally { await site?.close(); restore(); await removeSiteDir({ dir }); fs.rmSync(home, { recursive: true, force: true }); }
});
