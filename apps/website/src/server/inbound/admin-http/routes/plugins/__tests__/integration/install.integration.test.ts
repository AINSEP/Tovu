/** Folder-install M1a: real HTTP/auth + disk + activation + Trash, no installer stubs. */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";

async function packageFixture(root: string) {
  const source = path.join(root, "source");
  const entry = 'export default { definition: { setup() {} } };';
  await mkdir(path.join(source, "server"), { recursive: true });
  await writeFile(path.join(source, "server/index.mjs"), entry);
  await writeFile(path.join(source, "tovu.plugin.json"), JSON.stringify({ id: "install-http", name: "Install HTTP", version: "1.0.0", sdkRange: "*", tier: "tier-3", engine: 1, fields: [], hooks: [], capabilities: [], integrity: { "server/index.mjs": `sha256-${createHash("sha256").update(entry).digest("hex")}` } }));
  return { kind: "folder", path: source };
}

test("admin preview -> install disabled -> enable -> disable -> Trash -> reinstall refuses", async (t) => {
  const old = process.env.TOVU_PLUGIN_LOCAL_INSTALL;
  process.env.TOVU_PLUGIN_LOCAL_INSTALL = "1";
  const root = await mkdtemp(path.join(tmpdir(), "plugin-install-http-"));
  t.after(async () => { if (old === undefined) delete process.env.TOVU_PLUGIN_LOCAL_INSTALL; else process.env.TOVU_PLUGIN_LOCAL_INSTALL = old; await rm(root, { recursive: true, force: true }); });
  const source = await packageFixture(root);
  const deps = createRouteDeps({ installDir: path.join(root, "plugins") });
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/plugins`;
  const headers = { cookie, "content-type": "application/json" };
  const previewResponse = await fetch(`${base}/install/preview`, { method: "POST", headers, body: JSON.stringify({ source }) });
  assert.equal(previewResponse.status, 200, await previewResponse.clone().text());
  const { plugin: preview } = await previewResponse.json() as { plugin: { digest: string; tier: string; hasCode: boolean } };
  assert.equal(preview.tier, "tier-3"); assert.equal(preview.hasCode, true);
  const installResponse = await fetch(`${base}/install`, { method: "POST", headers, body: JSON.stringify({ source, expectedDigest: preview.digest }) });
  assert.equal(installResponse.status, 201, await installResponse.clone().text());
  assert.deepEqual(await deps.pluginActivationRepo.listAll(), []);
  const listing = await (await fetch(base, { headers })).json() as { plugins: { id: string; enabled: boolean }[]; installSources: string[] };
  assert.deepEqual(listing.installSources, ["folder", "zip"]);
  assert.equal(listing.plugins.find((p) => p.id === "install-http")?.enabled, false);
  const lock = path.join(root, "plugins-install-lock");
  await mkdir(lock);
  const blockedEnable = await fetch(`${base}/install-http`, { method: "PATCH", headers, body: JSON.stringify({ enabled: true }) });
  assert.equal(blockedEnable.status, 409, await blockedEnable.clone().text());
  assert.equal((await blockedEnable.json() as { code: string }).code, "PLUGIN_INSTALL_BUSY");
  assert.deepEqual(await deps.pluginActivationRepo.listAll(), [], "rejected enable must compensate its temporary activation row");
  await rm(lock, { recursive: true });
  for (const enabled of [true, false]) {
    const response = await fetch(`${base}/install-http`, { method: "PATCH", headers, body: JSON.stringify({ enabled }) });
    assert.equal(response.status, 200, await response.clone().text());
  }
  assert.equal((await fetch(`${base}/install-http`, { method: "DELETE", headers })).status, 200);
  const retry = await fetch(`${base}/install`, { method: "POST", headers, body: JSON.stringify({ source, expectedDigest: preview.digest }) });
  assert.equal(retry.status, 409); assert.equal((await retry.json() as { code: string }).code, "PLUGIN_IN_TRASH");
});

test("install routes gate env, workspace, auth and permission before source inspection", async (t) => {
  const old = process.env.TOVU_PLUGIN_LOCAL_INSTALL;
  delete process.env.TOVU_PLUGIN_LOCAL_INSTALL;
  t.after(() => { if (old === undefined) delete process.env.TOVU_PLUGIN_LOCAL_INSTALL; else process.env.TOVU_PLUGIN_LOCAL_INSTALL = old; });
  const root = await mkdtemp(path.join(tmpdir(), "plugin-install-auth-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deps = createRouteDeps({ installDir: path.join(root, "plugins") });
  let inspected = 0;
  deps.pluginInstaller = { preview: async () => { inspected++; throw new Error("must never inspect"); }, install: async () => { inspected++; throw new Error("must never install"); } };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const bare = await loginAsBarePrincipal(deps, baseUrl);
  for (const endpoint of ["install/preview", "install"]) {
    const url = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/plugins/${endpoint}`;
    const body = JSON.stringify({ source: { kind: "folder", path: "/private/secret" } });
    const disabled = await fetch(url, { method: "POST", headers: { cookie, "content-type": "application/json" }, body });
    assert.equal(disabled.status, 403); assert.equal((await disabled.json() as { code: string }).code, "PLUGIN_LOCAL_INSTALL_DISABLED");
    process.env.TOVU_PLUGIN_LOCAL_INSTALL = "1";
    assert.equal((await fetch(url, { method: "POST", headers: { cookie: bare, "content-type": "application/json" }, body })).status, 403);
    assert.equal((await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body })).status, 401);
    assert.equal((await fetch(url.replace(deps.workspaceId, "wrong-workspace"), { method: "POST", headers: { cookie, "content-type": "application/json" }, body })).status, 404);
    delete process.env.TOVU_PLUGIN_LOCAL_INSTALL;
  }
  assert.equal(inspected, 0);
});

test("admin install rejects unreviewed or changed bytes and unsupported URL sources", async (t) => {
  const old = process.env.TOVU_PLUGIN_LOCAL_INSTALL; process.env.TOVU_PLUGIN_LOCAL_INSTALL = "1";
  t.after(() => { if (old === undefined) delete process.env.TOVU_PLUGIN_LOCAL_INSTALL; else process.env.TOVU_PLUGIN_LOCAL_INSTALL = old; });
  const root = await mkdtemp(path.join(tmpdir(), "plugin-install-digest-")); t.after(() => rm(root, { recursive: true, force: true }));
  const source = await packageFixture(root);
  const deps = createRouteDeps({ installDir: path.join(root, "plugins") });
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const url = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/plugins/install`;
  const headers = { cookie, "content-type": "application/json" };
  assert.equal((await fetch(url, { method: "POST", headers, body: JSON.stringify({ source }) })).status, 400);
  assert.equal((await fetch(url + "/preview", { method: "POST", headers, body: JSON.stringify({ source: { kind: "url", url: "http://localhost/" } }) })).status, 400);
  const { plugin } = await (await fetch(url + "/preview", { method: "POST", headers, body: JSON.stringify({ source }) })).json() as { plugin: { digest: string } };
  const file = path.join(source.path, "tovu.plugin.json");
  const manifest = JSON.parse(await readFile(file, "utf8")); manifest.name = "Changed"; await writeFile(file, JSON.stringify(manifest));
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ source, expectedDigest: plugin.digest }) });
  assert.equal(response.status, 409); assert.equal((await response.json() as { code: string }).code, "PLUGIN_CHANGED_SINCE_PREVIEW");
  assert.deepEqual(await deps.pluginActivationRepo.listAll(), []);
});
