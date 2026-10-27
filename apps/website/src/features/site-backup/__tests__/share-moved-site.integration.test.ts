/**
 * @file A share this server delivered itself lives in the catalog beside the site's database
 * (`<db dir>/ops/shares`), which moves with the site folder. Its record saved the catalog's absolute path
 * as its binding; revoke must still work after the site folder is moved or renamed.
 * Real files. Paths come from the unresolved tmpdir (a symlink on macOS) and registries from real paths,
 * as `deps.ts` builds them.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, realpathSync, renameSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { HttpClientPort, HttpResponse } from "@jini-ai/core/primitives";
import { createSiteShareBackend } from "../share-backend.js";
import { createRuntimeShareDelivery, resolveShareDelivery } from "../share-hosting.js";
import { SiteShareRegistry } from "../share-registry.js";
import { createSiteShare } from "../share-service.js";

/** The anonymous `/_share/<token>/<file>` download as the public route answers it, from whichever catalog is live. */
function anonymousDownloads(current: () => SiteShareRegistry): HttpClientPort {
  return { send: async ({ request }): Promise<HttpResponse> => {
    const [, , token = "", file = ""] = new URL(request.url).pathname.split("/");
    const row = await current().findToken({ token, file });
    if (!row) return { status: 404, headers: {}, bodyText: "" };
    return { status: 200, bodyText: "", headers: { "content-length": String(row.bytes), "cache-control": "no-store", "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow", "content-disposition": `attachment; filename="${row.file}"` } };
  } };
}

// RED (design 2026-10-27): revoke compared the record's saved absolute catalog path with the live one, so
// after a move it looked for a delivery bound to the old folder, found none and failed with DELETE_FAILED.
test("a runtime-delivered share still revokes after its site folder is moved, delivery removed", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-share-moved-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const before = path.join(root, "sites", "portable"), after = path.join(root, "sites", "renamed");
  const catalog = (siteDir: string) => path.join(siteDir, "data.nosync", "ops", "shares");
  mkdirSync(catalog(before), { recursive: true });
  let live = new SiteShareRegistry({ directory: realpathSync(catalog(before)) });
  const http = anonymousDownloads(() => live);
  const runtime = () => createRuntimeShareDelivery({ registry: live, site: "ws", publicOrigin: "https://share.example.test", http });
  const created = await createSiteShare({ registry: live, site: "ws", name: "portable", archive: Buffer.from("PK moved share") }, { delivery: runtime() });
  assert.equal(created.storage?.binding, realpathSync(catalog(before)), "sanity: the runtime delivery bound the share to its catalog folder");

  renameSync(before, after);
  live = new SiteShareRegistry({ directory: realpathSync(catalog(after)) });
  const backend = createSiteShareBackend({ registry: live, site: "ws",
    prepare: async () => assert.fail("revoke never prepares"), zip: async () => assert.fail("revoke never zips"),
    delivery: selection => resolveShareDelivery({ peer: async () => undefined, http, objectStore: async () => undefined, runtime }, selection) });
  const revoked = await backend.revoke({ shareId: created.shareId });
  assert.equal(revoked.status, "revoked");
  assert.equal((await live.get({ shareId: created.shareId, site: "ws" }))?.status, "revoked");
  assert.equal(existsSync(live.artifactPath({ shareId: created.shareId })), false, "the delivered ZIP is gone");
  assert.equal(await live.findToken({ token: created.token, file: created.file }), null, "its public link no longer resolves");
});
