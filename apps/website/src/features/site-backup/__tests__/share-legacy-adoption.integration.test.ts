/**
 * @file A share made through runtime delivery before the 2026-10-27 share-storage move (its catalog under
 * the database's `ops/shares`) must still revoke after the one-time move to `<sites root>/.tovu/site-shares/<ws>`.
 * Real files. Paths come from the unresolved tmpdir (a symlink on macOS) and registries from real paths,
 * as `deps.ts` builds them.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { HttpClientPort, HttpResponse } from "@jini-ai/core/primitives";
import { createSiteShareBackend } from "../share-backend.js";
import { createRuntimeShareDelivery, resolveShareDelivery } from "../share-hosting.js";
import { adoptLegacyShareDirectory, SiteShareRegistry } from "../share-registry.js";
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

test("a runtime-delivered share made before the share-storage move still revokes after it, delivery removed", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-share-adopt-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const from = path.join(root, "sites", "portable", "data.nosync", "ops", "shares");
  const to = path.join(root, "sites", ".tovu", "site-shares", "ws");
  mkdirSync(from, { recursive: true });
  let live = new SiteShareRegistry({ directory: realpathSync(from) });
  const http = anonymousDownloads(() => live);
  const runtime = () => createRuntimeShareDelivery({ registry: live, site: "ws", publicOrigin: "https://share.example.test", http });
  const created = await createSiteShare({ registry: live, site: "ws", name: "portable", archive: Buffer.from("PK legacy share") }, { delivery: runtime() });
  assert.equal(created.storage?.binding, realpathSync(from), "the old runtime delivery bound the share to its own catalog folder");

  adoptLegacyShareDirectory({ from, to });
  live = new SiteShareRegistry({ directory: realpathSync(to) });
  const backend = createSiteShareBackend({ registry: live, site: "ws",
    prepare: async () => assert.fail("revoke never prepares"), zip: async () => assert.fail("revoke never zips"),
    delivery: selection => resolveShareDelivery({ peer: async () => undefined, http, objectStore: async () => undefined, runtime }, selection) });
  // Baseline RED: the moved record still named the old folder, so revoke found no delivery (DELETE_FAILED).
  const revoked = await backend.revoke({ shareId: created.shareId });
  assert.equal(revoked.status, "revoked");
  assert.equal((await live.get({ shareId: created.shareId, site: "ws" }))?.status, "revoked");
  assert.equal(existsSync(live.artifactPath({ shareId: created.shareId })), false, "the delivered ZIP is gone");
  assert.equal(await live.findToken({ token: created.token, file: created.file }), null, "its public link no longer resolves");
});
