import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer, loginAsOwner, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import { SHARE_TOKEN_LENGTH, SiteShareRegistry } from "#src/features/site-backup/share-registry";

// RED gap: these routes previously had no assertion through the actual session/RBAC mount.
test("all six share routes require authentication, site-backup.push and the correct workspace", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-admin-auth-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const deps = createRouteDeps();
  let calls = 0;
  const registry = new SiteShareRegistry({ directory: path.join(directory, ".hidden", "shares") });
  const operation = async () => { calls++; return { ok: true }; };
  deps.siteShareBackend = { registry, create: operation, revoke: operation as never, list: async () => { calls++; return []; } };
  const app = createApp(deps);
  const base = await startTestServer(app, t);
  const owner = await loginAsOwner(base);
  const bare = await loginAsBarePrincipal(deps, base);
  const id = "00000000-0000-4000-8000-000000000001";
  // Share tokens are 16 letters since d3ea26cfd (owner 10-25); a 64-hex token is refused as INVALID_INPUT.
  const token = "a".repeat(SHARE_TOKEN_LENGTH);
  const routes = [
    ["GET", ""], ["POST", ""], ["GET", `/${id}/download`], ["DELETE", `/${id}`],
    ["PUT", `/artifacts/${token}/site.tovu.zip`], ["DELETE", `/artifacts/${token}/site.tovu.zip`],
  ];
  for (const [method, suffix] of routes) {
    const request = (workspace: string, cookie?: string) => fetch(`${base}/api/admin/v1/workspaces/${workspace}/site-shares${suffix}`, { method,
      headers: { ...(cookie ? { cookie } : {}), "content-type": method === "PUT" ? "application/zip" : "application/json" },
      ...(method === "PUT" ? { body: Buffer.from([0x50, 0x4b, 3, 4]) } : method === "POST" ? { body: "{}" } : {}),
    });
    assert.equal((await request(deps.workspaceId)).status, 401, `${method} ${suffix}: no session`);
    assert.equal((await request(deps.workspaceId, bare)).status, 403, `${method} ${suffix}: permission denied`);
    assert.equal((await request("wrong-workspace", owner)).status, 404, `${method} ${suffix}: foreign workspace`);
  }
  assert.equal(calls, 0);
  assert.deepEqual(await registry.list({}), []);
  assert.equal((await fetch(`${base}/api/admin/v1/workspaces/${deps.workspaceId}/site-shares`, { headers: { cookie: owner } })).status, 200);
  assert.equal(calls, 1);
  const root = `${base}/api/admin/v1/workspaces/${deps.workspaceId}/site-shares`;
  const archive = Buffer.from([0x50, 0x4b, 3, 4, 0, 0xff]);
  const upload = await fetch(`${root}/artifacts/${token}/site.tovu.zip`, { method: "PUT", headers: { cookie: owner, "content-type": "application/zip" }, body: archive });
  assert.equal(upload.status, 201);
  const received = await upload.json() as { shareId: string };
  const download = await fetch(`${root}/${received.shareId}/download`, { headers: { cookie: owner } });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), archive);
});
