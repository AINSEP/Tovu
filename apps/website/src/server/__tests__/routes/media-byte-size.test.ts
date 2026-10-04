import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { LocalFsBlobStore, uploadMedia } from "#src/features/media/index";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminMediaListRoute } from "../../inbound/admin-http/routes/media/list.js";
import { registerAdminMediaUpdateRoute } from "../../inbound/admin-http/routes/media/update.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";

/** Owner's 2026-10-04 corrected decision: size comes from the original blob; missing is null. */
test("admin media list and single-record response report exact stored bytes and null after removal", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "admin-media-byte-size-"));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const deps = { ...createRouteDeps(), blobStore: new LocalFsBlobStore({ rootDir }) };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminMediaListRoute(app, deps);
  registerAdminMediaUpdateRoute(app, deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);
  const { media } = await uploadMedia({
    deps: { clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo,
      blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore },
    input: { workspaceId: deps.workspaceId, bytes, filename: "seed.png", contentType: "image/png", createdByPrincipal: "seed-owner" },
  });
  const blob = await deps.assetBlobRepo.findByHash({ workspaceId: deps.workspaceId, sha256: media.source.sha256 });
  assert.ok(blob);
  const mediaUrl = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/media`;
  const list = async () => {
    const res = await fetch(mediaUrl, { headers: { cookie } });
    assert.equal(res.status, 200);
    const body = await res.json() as { media: Array<{ id: string; byteSize: number | null }> };
    const row = body.media.find((item) => item.id === media.id);
    assert.ok(row);
    return row;
  };
  assert.equal((await list()).byteSize, 13);
  assert.equal((await list()).byteSize, 13, "repeated list uses cached size");
  const patch = await fetch(`${mediaUrl}/${media.id}`, {
    method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ caption: "size survives edits" }),
  });
  assert.equal(patch.status, 200);
  assert.equal((await patch.json() as { media: { byteSize: number } }).media.byteSize, 13);
  await deps.blobStore.remove({ storageKey: blob.storageKey });
  assert.equal((await list()).byteSize, null, "missing blob cannot become a fictitious zero-byte file");
  // Absence is not cached forever: a restored original becomes visible without restarting.
  await deps.blobStore.put({ workspaceId: deps.workspaceId, sha256: media.source.sha256, bytes });
  assert.equal((await list()).byteSize, 13);
});
