import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file `PLUGIN_UNINSTALL` HTTP surface (Milestone 2, 2026-08-20) — end-to-end proof against a
 * REAL on-disk plugin artifact (real `server/index.mjs`, real integrity hash, real `import()`
 * through `createRouteDeps({ installDir })`), not a hand-mocked discovery array. Mirrors
 * `activation.integration.test.ts`'s "AC-01 end to end" pattern (`createApp(createRouteDeps())` +
 * `bootAuthenticated`) so this test exercises the exact same composition root a real boot uses.
 */

/** Writes one real, loadable site plugin under `installDir/<id>/1.0.0/` — a real ESM entry file
 * whose `setup()` attaches a beforeSave filter writing `ext.<id>.touched`, with a correct integrity
 * hash (so it discovers AND loads as `status: "valid"`), mirroring the M1b `greeter-plugin` fixture
 * pattern but parameterized by id for reuse across this file's several scenarios. */
async function writeRealPluginFixture(installDir: string, id: string): Promise<void> {
  const versionDir = path.join(installDir, id, "1.0.0");
  await mkdir(path.join(versionDir, "server"), { recursive: true });
  const entryContents = [
    "export default {",
    "  definition: {",
    "    setup(sdk) {",
    "      sdk.addFilter('content.entry.beforeSave', async () => ({ touched: true }));",
    "    },",
    "  },",
    "};",
    "",
  ].join("\n");
  await writeFile(path.join(versionDir, "server", "index.mjs"), entryContents, "utf8");
  const correctHash = `sha256-${createHash("sha256").update(entryContents, "utf8").digest("hex")}`;
  await writeFile(
    path.join(versionDir, "tovu.plugin.json"),
    JSON.stringify({
      id,
      name: id,
      version: "1.0.0",
      sdkRange: "^0.1.0",
      engine: 1,
      tier: "tier-3",
      capabilities: ["hooks.attach"],
      hooks: ["content.entry.beforeSave"],
      fields: [{ path: `ext.${id}.touched`, type: "boolean", queryable: false }],
      integrity: { "server/index.mjs": correctHash },
    }),
    "utf8"
  );
}

async function existsOnDisk(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

test("site plugin end to end: remove -> list in Trash -> restore disabled -> remove -> purge", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-uninstall-lifecycle-"));
  const installDir = path.join(root, "plugins");
  const pluginId = "lifecycle-plugin";
  try {
    await writeRealPluginFixture(installDir, pluginId);

    const deps = createRouteDeps({ installDir });
    const app = createApp(deps);
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const pluginsBase = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/plugins`;
    const trashBase = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/trash`;

    // --- enable ---
    const enableResponse = await fetch(`${pluginsBase}/${pluginId}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    if (enableResponse.status !== 200) assert.fail(`enable returned ${enableResponse.status}: ${await enableResponse.text()}`);

    // --- save while enabled: proves the real on-disk plugin actually ran ---
    const saveResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/posts`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Uninstall lifecycle proof",
        slug: "uninstall-lifecycle-proof",
        status: "draft",
        bodyJson: { type: "doc", content: [] },
      }),
    });
    if (saveResponse.status !== 201) assert.fail(`save returned ${saveResponse.status}: ${await saveResponse.text()}`);
    const saved = (await saveResponse.json()) as { post: { id: string; ext?: Record<string, unknown> } };
    assert.deepEqual(
      saved.post.ext?.[pluginId],
      { touched: true },
      "the real on-disk plugin's setup() must have actually run through a genuine import()"
    );
    const postId = saved.post.id;

    // --- disable: must actually detach, not just flip a flag ---
    const disableResponse = await fetch(`${pluginsBase}/${pluginId}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    if (disableResponse.status !== 200) assert.fail(`disable returned ${disableResponse.status}: ${await disableResponse.text()}`);

    const saveAfterDisable = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/posts`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Post-disable proof",
        slug: "post-disable-proof",
        status: "draft",
        bodyJson: { type: "doc", content: [] },
      }),
    });
    if (saveAfterDisable.status !== 201) assert.fail(`save returned ${saveAfterDisable.status}: ${await saveAfterDisable.text()}`);
    const savedAfterDisable = (await saveAfterDisable.json()) as { post: { ext?: Record<string, unknown> } };
    assert.equal(
      savedAfterDisable.post.ext?.[pluginId],
      undefined,
      "a disabled plugin's filter must be genuinely detached — it must not fire on a save after disable"
    );

    // --- uninstall ---
    const uninstallResponse = await fetch(`${pluginsBase}/${pluginId}`, { method: "DELETE", headers: { cookie } });
    if (uninstallResponse.status !== 200) assert.fail(`uninstall returned ${uninstallResponse.status}: ${await uninstallResponse.text()}`);
    assert.deepEqual(await uninstallResponse.json(), { pluginId, trashed: true });
    const parkedDir = path.join(root, "plugins-trash", pluginId);
    assert.equal(await existsOnDisk(path.join(installDir, pluginId)), false);
    assert.equal(await existsOnDisk(parkedDir), true);
    assert.equal((await deps.pluginActivationRepo.listAll()).filter((row) => row.pluginId === pluginId).length, 1);

    const trashListResponse = await fetch(trashBase, { headers: { cookie } });
    assert.equal(trashListResponse.status, 200);
    const trashList = (await trashListResponse.json()) as {
      items: Array<{ id: string; entityType: string; entityId: string; title: string }>;
    };
    const trashItem = trashList.items.find((item) => item.entityType === "plugin" && item.entityId === pluginId);
    assert.ok(trashItem);
    assert.equal(trashItem.title, pluginId);

    const restoreResponse = await fetch(`${trashBase}/restore`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ items: [{ entityType: "plugin", entityId: pluginId }] }),
    });
    assert.equal(restoreResponse.status, 200, await restoreResponse.clone().text());
    assert.deepEqual(await restoreResponse.json(), {
      restored: 1,
      results: [{ entityType: "plugin", entityId: pluginId, outcome: "restored" }],
    });
    assert.equal(await existsOnDisk(path.join(installDir, pluginId)), true);

    const restoredListResponse = await fetch(pluginsBase, { headers: { cookie } });
    const restoredList = (await restoredListResponse.json()) as { plugins: Array<{ id: string; enabled: boolean }> };
    assert.equal(restoredList.plugins.find((plugin) => plugin.id === pluginId)?.enabled, false);

    const secondDelete = await fetch(`${pluginsBase}/${pluginId}`, { method: "DELETE", headers: { cookie } });
    assert.equal(secondDelete.status, 200, await secondDelete.clone().text());
    const secondTrashList = (await (await fetch(trashBase, { headers: { cookie } })).json()) as {
      items: Array<{ id: string; entityType: string; entityId: string }>;
    };
    const secondTrashItem = secondTrashList.items.find((item) => item.entityType === "plugin" && item.entityId === pluginId);
    assert.ok(secondTrashItem);
    const purgeResponse = await fetch(`${trashBase}/purge`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ ids: [secondTrashItem.id] }),
    });
    assert.equal(purgeResponse.status, 200, await purgeResponse.clone().text());
    assert.deepEqual(await purgeResponse.json(), {
      purged: 1,
      results: [{ id: secondTrashItem.id, outcome: "purged" }],
    });
    assert.equal(await existsOnDisk(parkedDir), false);
    assert.equal((await deps.pluginActivationRepo.listAll()).filter((row) => row.pluginId === pluginId).length, 0);

    // INV-03: the ext data written while it was enabled MUST survive uninstall, inert.
    const getPostResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/posts/${postId}`, { headers: { cookie } });
    const gotPost = (await getPostResponse.json()) as { post: { ext?: Record<string, unknown> } };
    assert.deepEqual(
      gotPost.post.ext?.[pluginId],
      { touched: true },
      "INV-03: ext data from an uninstalled plugin must be retained inert, never deleted"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PLUGIN_NOT_FOUND: DELETE .../plugins/:pluginId for an id absent from discovery is 404", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-uninstall-notfound-"));
  const installDir = path.join(root, "plugins");
  try {
    const deps = createRouteDeps({ installDir });
    const app = createApp(deps);
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const pluginsBase = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/plugins`;

    const response = await fetch(`${pluginsBase}/does-not-exist`, { method: "DELETE", headers: { cookie } });
    assert.equal(response.status, 404);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "PLUGIN_NOT_FOUND");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PLUGIN_NOT_UNINSTALLABLE: DELETE .../plugins/word-count (a built-in) is 422, and its files (there are none) are untouched", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-uninstall-builtin-"));
  const installDir = path.join(root, "plugins");
  try {
    const deps = createRouteDeps({ installDir });
    const app = createApp(deps);
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const pluginsBase = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/plugins`;

    const response = await fetch(`${pluginsBase}/word-count`, { method: "DELETE", headers: { cookie } });
    assert.equal(response.status, 422);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "PLUGIN_NOT_UNINSTALLABLE");

    // word-count must still be fully listed/enableable afterward — nothing was mutated.
    const listResponse = await fetch(pluginsBase, { headers: { cookie } });
    const listed = (await listResponse.json()) as { plugins: Array<{ id: string; status: string }> };
    assert.equal(listed.plugins.find((p) => p.id === "word-count")?.status, "valid");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PLUGIN_ENABLED: DELETE .../plugins/:pluginId while still enabled is 409, refuses, and the files remain on disk", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-uninstall-enabled-"));
  const installDir = path.join(root, "plugins");
  const pluginId = "still-enabled-plugin";
  try {
    await writeRealPluginFixture(installDir, pluginId);
    const deps = createRouteDeps({ installDir });
    const app = createApp(deps);
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const pluginsBase = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/plugins`;

    const enableResponse = await fetch(`${pluginsBase}/${pluginId}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    if (enableResponse.status !== 200) assert.fail(`enable returned ${enableResponse.status}: ${await enableResponse.text()}`);

    const uninstallResponse = await fetch(`${pluginsBase}/${pluginId}`, { method: "DELETE", headers: { cookie } });
    assert.equal(uninstallResponse.status, 409);
    const body = (await uninstallResponse.json()) as { code: string };
    assert.equal(body.code, "PLUGIN_ENABLED");

    assert.equal(await existsOnDisk(path.join(installDir, pluginId)), true, "a refused uninstall must not remove any files");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PLUGIN_IN_TRASH: a newly copied live folder cannot replace the same plugin already in Trash", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-uninstall-double-"));
  const installDir = path.join(root, "plugins");
  const pluginId = "double-uninstall-plugin";
  try {
    await writeRealPluginFixture(installDir, pluginId);
    const deps = createRouteDeps({ installDir });
    const app = createApp(deps);
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const pluginsBase = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/plugins`;

    const first = await fetch(`${pluginsBase}/${pluginId}`, { method: "DELETE", headers: { cookie } });
    assert.equal(first.status, 200);

    await writeRealPluginFixture(installDir, pluginId);

    const second = await fetch(`${pluginsBase}/${pluginId}`, { method: "DELETE", headers: { cookie } });
    assert.equal(second.status, 409);
    const body = (await second.json()) as { code: string };
    assert.equal(body.code, "PLUGIN_IN_TRASH");
    assert.equal(await existsOnDisk(path.join(installDir, pluginId)), true);
    assert.equal(await existsOnDisk(path.join(root, "plugins-trash", pluginId)), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** Sends a raw HTTP request with the EXACT given path string, bypassing WHATWG URL normalization
 * entirely — `node:http`'s `request()` treats `path` as an opaque request-line string, unlike
 * `fetch()`/`undici` (see this file's own real finding below). Node's `http` client does not
 * collapse dot-segments either, which is what makes this the faithful way to reach a server-side
 * traversal guard with an actually-adversarial request. */
function rawRequest(baseUrl: string, requestPath: string, options: { method: string; headers: Record<string, string> }): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: requestPath, method: options.method, headers: options.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

test("path traversal (no matching plugin, raw wire request): DELETE .../plugins/.. with nothing installed under that id is 404, never reaches the filesystem removal at all", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-uninstall-traversal-notfound-"));
  const installDir = path.join(root, "plugins");
  try {
    const deps = createRouteDeps({ installDir });
    const app = createApp(deps);
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const pluginsPath = `/api/admin/v1/workspaces/${deps.workspaceId}/plugins`;

    // REAL FINDING (not test noise): `fetch()` cannot be used for this case at all. Both a literal
    // `..` segment AND its single-percent-encoded form `%2e%2e` are collapsed by `fetch`'s own
    // WHATWG URL parser BEFORE the request is even sent — `.../plugins/..` resolves client-side to
    // `.../workspaces/<id>/` and hits a DIFFERENT route entirely (this was caught here: it returned
    // 409 LAST_WORKSPACE, a workspace-delete guard, not this route at all — confirmed both literal
    // `..` and `%2e%2e` normalize identically, since the WHATWG URL spec treats percent-encoded dot
    // segments as equivalent to literal ones for path-shortening purposes). A well-behaved fetch
    // client can never even construct this request; a raw/non-normalizing one (curl
    // `--path-as-is`, a hand-built TCP client) can. `rawRequest()` above sends the literal,
    // unnormalized wire path so this test reaches the server's OWN guard instead of a client one.
    const response = await rawRequest(baseUrl, `${pluginsPath}/..`, { method: "DELETE", headers: { cookie } });
    // Safe either way: Express's own router may 404 before reaching this handler, or the handler's
    // own PLUGIN_NOT_FOUND gate may catch it — both are an unambiguous refusal, never a 2xx.
    assert.equal(response.status, 404, `expected 404, got ${response.status}: ${response.body}`);
    assert.equal(await existsOnDisk(root), true, "the fixture's own temp root (an ancestor of installDir) must be untouched");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("path traversal (malicious manifest id): a discovered-but-invalid site record whose manifest id is a traversal path is refused 400 PLUGIN_ID_INVALID — never deletes outside installDir", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-uninstall-traversal-malicious-"));
  const installDir = path.join(root, "plugins");
  // A file OUTSIDE installDir a successful traversal would be able to reach — must survive.
  const canaryFile = path.join(root, "canary.txt");
  const maliciousId = "../../../canary-target";
  try {
    await mkdir(installDir, { recursive: true });
    await writeFile(canaryFile, "must survive\n", "utf8");

    // A real folder (safe name) whose MANIFEST declares an unsafe `id` — discovery.ts reads `id`
    // from the manifest first, falling back to the folder name only when the manifest omits it
    // (discovery.ts's own `discoverOneSiteCandidate`), so this candidate is discovered with
    // `id: maliciousId`, `status: "invalid"` (EC-01: id must equal folder name) — but still present
    // in the discovery array (discovery never drops an invalid candidate, only marks it).
    const versionDir = path.join(installDir, "innocuous-folder-name", "1.0.0");
    await mkdir(path.join(versionDir, "server"), { recursive: true });
    await writeFile(path.join(versionDir, "server", "index.mjs"), "export default {};\n", "utf8");
    await writeFile(
      path.join(versionDir, "tovu.plugin.json"),
      JSON.stringify({
        id: maliciousId,
        name: "Malicious",
        version: "1.0.0",
        sdkRange: "^1.0.0",
        engine: 1,
        tier: "tier-3",
        capabilities: [],
        hooks: [],
        fields: [],
        integrity: {},
      }),
      "utf8"
    );

    const deps = createRouteDeps({ installDir });
    const app = createApp(deps);
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const pluginsBase = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/plugins`;

    // Precondition: discovery really does surface this record under the malicious id (otherwise
    // this test would only be proving the earlier, easier not-found gate, not the traversal guard).
    const listResponse = await fetch(pluginsBase, { headers: { cookie } });
    const listed = (await listResponse.json()) as { plugins: Array<{ id: string; status: string; source: string }> };
    const maliciousRecord = listed.plugins.find((p) => p.id === maliciousId);
    assert.ok(maliciousRecord, "precondition failed: discovery must surface the malicious-id record for this test to mean anything");
    assert.equal(maliciousRecord?.status, "invalid");
    assert.equal(maliciousRecord?.source, "site");

    const response = await fetch(`${pluginsBase}/${encodeURIComponent(maliciousId)}`, { method: "DELETE", headers: { cookie } });
    const body = (await response.json()) as { code?: string };
    assert.equal(response.status, 400, `expected 400 PLUGIN_ID_INVALID, got ${response.status}: ${JSON.stringify(body)}`);
    assert.equal(body.code, "PLUGIN_ID_INVALID");

    assert.equal(await existsOnDisk(canaryFile), true, "a file outside installDir must never be reachable by an uninstall attempt");
    assert.equal(
      await existsOnDisk(path.join(installDir, "innocuous-folder-name")),
      true,
      "a refused uninstall must not delete anything at all, including the malicious candidate's own real folder"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
