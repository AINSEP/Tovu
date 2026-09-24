import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { InMemoryPluginActivationRepo } from "#src/features/plugin-runtime/repo.memory";
import { WORD_COUNT_MANIFEST } from "#src/features/plugin-runtime/built-ins/word-count/index";
import { composePluginRuntime } from "#src/server/runtime/composition/plugin-runtime";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { bootAuthenticated, loginAsBarePrincipal, startTestServer } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file `PLUGIN_FILES` HTTP surface (2026-09-13) through the real composition root
 * (`createApp(createRouteDeps({ installDir }))` + a real login), against real on-disk fixtures:
 * the built-in Word Count plugin's own source folder, a site plugin with binary and symlinked
 * files, both traversal shapes (an encoded path in the URL, and a manifest that declares a
 * traversal id), a symlinked plugin folder, and the authorization gate.
 *
 * Every refusal also asserts a planted `TOP-SECRET-OUTSIDE` marker is absent from the body, so a
 * test cannot pass on status code alone while the bytes leaked anyway.
 */

const SECRET = "TOP-SECRET-OUTSIDE";

interface FilesBody {
  pluginId: string;
  source: "built-in" | "site";
  files: Array<{ relativePath: string; sizeBytes: number; content: string | null; omitted: string | null }>;
  truncated: boolean;
  limits: { maxFiles: number; maxEntries: number; maxFileBytes: number; maxTotalBytes: number };
}

async function tempRoot(t: TestContext): Promise<{ root: string; installDir: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-files-http-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const installDir = path.join(root, "plugins");
  await mkdir(installDir, { recursive: true });
  return { root, installDir };
}

/** One site plugin folder, `<base>/<folder>/1.0.0/`. Validity is irrelevant here — the viewer lists
 *  an invalid plugin's files too — so the manifest is only as complete as discovery needs to read an id. */
async function writeSitePlugin(base: string, folder: string, manifestId: string): Promise<string> {
  const versionDir = path.join(base, folder, "1.0.0");
  await mkdir(path.join(versionDir, "server"), { recursive: true });
  await writeFile(
    path.join(versionDir, "tovu.plugin.json"),
    JSON.stringify({ id: manifestId, name: "Fixture", version: "1.0.0", sdkRange: "^0.1.0 || ^0.2.0", engine: 1, tier: "tier-3", capabilities: [], hooks: [], fields: [], integrity: {} }),
    "utf8"
  );
  await writeFile(path.join(versionDir, "server", "index.mjs"), "export default {};\n", "utf8");
  return versionDir;
}

async function getFiles(baseUrl: string, workspaceId: string, encodedPluginId: string, cookie: string): Promise<{ status: number; text: string }> {
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${workspaceId}/plugins/${encodedPluginId}/files`, { headers: { cookie } });
  return { status: response.status, text: await response.text() };
}

test("PLUGIN_FILES: an owner reads the built-in Word Count plugin's own source folder", async (t) => {
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const { status, text } = await getFiles(baseUrl, deps.workspaceId, "word-count", cookie);

  assert.equal(status, 200, text);
  const body = JSON.parse(text) as FilesBody;
  assert.equal(body.pluginId, "word-count");
  assert.equal(body.source, "built-in");
  assert.equal(body.truncated, false);
  // Under `tsx` the source folder holds `index.ts`; a production build's `dist/` twin holds `index.js`.
  const entry = body.files.find((file) => /^index\.(ts|js)$/.test(file.relativePath));
  assert.ok(entry, `expected the built-in's entry file, got ${body.files.map((file) => file.relativePath).join(", ")}`);
  assert.equal(entry.omitted, null);
  assert.match(entry.content ?? "", /WORD_COUNT_MANIFEST/);
  assert.deepEqual(Object.keys(body.limits).sort(), ["maxEntries", "maxFileBytes", "maxFiles", "maxTotalBytes"]);
});

test("PLUGIN_FILES: a site plugin lists nested files breadth-first, and binary and symlinked files carry no content", async (t) => {
  const { root, installDir } = await tempRoot(t);
  await writeFile(path.join(root, "outside-secret.txt"), SECRET, "utf8");
  const versionDir = await writeSitePlugin(installDir, "site-fixture", "site-fixture");
  await mkdir(path.join(versionDir, "assets"));
  await writeFile(path.join(versionDir, "assets", "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0a]));
  await symlink(path.join(root, "outside-secret.txt"), path.join(versionDir, "leak.txt"));

  const deps = createRouteDeps({ installDir });
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const { status, text } = await getFiles(baseUrl, deps.workspaceId, "site-fixture", cookie);

  assert.equal(status, 200, text);
  const body = JSON.parse(text) as FilesBody;
  assert.equal(body.source, "site");
  assert.deepEqual(
    body.files.map((file) => [file.relativePath, file.omitted]),
    [
      ["leak.txt", "symlink"],
      ["tovu.plugin.json", null],
      ["assets/logo.png", "binary"],
      ["server/index.mjs", null],
    ]
  );
  assert.equal(body.files[3]!.content, "export default {};\n");
  assert.equal(text.includes(SECRET), false, "a symlink's target must never be read into the response");
});

test("PLUGIN_FILES traversal: an encoded path in the URL that names no discovered plugin is 404 and reads nothing", async (t) => {
  const { root, installDir } = await tempRoot(t);
  await writeFile(path.join(root, "outside-secret.txt"), SECRET, "utf8");
  await writeSitePlugin(installDir, "site-fixture", "site-fixture");

  const deps = createRouteDeps({ installDir });
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  for (const encoded of ["..%2Foutside-secret.txt", "site-fixture%2F..%2F..", "..%2F..%2F..%2Fetc"]) {
    const { status, text } = await getFiles(baseUrl, deps.workspaceId, encoded, cookie);
    assert.equal(status, 404, `${encoded}: ${text}`);
    assert.equal(JSON.parse(text).code, "PLUGIN_NOT_FOUND");
    assert.equal(text.includes(SECRET), false);
  }
});

test("PLUGIN_FILES traversal: a manifest that declares a traversal id is refused with PLUGIN_ID_INVALID, not followed", async (t) => {
  const { root, installDir } = await tempRoot(t);
  // Discovery takes a site record's id from its manifest, so this record's id is `../escape` — and
  // `<installDir>/../escape/1.0.0/` is a real directory holding the secret, so only the path guard
  // stands between the request and that file.
  await writeSitePlugin(installDir, "innocent-folder", "../escape");
  const escapeDir = path.join(root, "escape", "1.0.0");
  await mkdir(escapeDir, { recursive: true });
  await writeFile(path.join(escapeDir, "secret.txt"), SECRET, "utf8");

  const deps = createRouteDeps({ installDir });
  const listed = (await deps.discoverPlugins()).map((record) => record.id);
  assert.ok(listed.includes("../escape"), `fixture precondition: discovery must surface the traversal id, got ${listed.join(", ")}`);

  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const { status, text } = await getFiles(baseUrl, deps.workspaceId, "..%2Fescape", cookie);

  assert.equal(status, 400, text);
  assert.deepEqual(JSON.parse(text), { error: "plugin id or version is not a safe path", code: "PLUGIN_ID_INVALID" });
  assert.equal(text.includes(SECRET), false);
  assert.equal(text.includes(root), false, "the refusal must not echo a server path");
});

test("PLUGIN_FILES symlink escape: a plugin folder symlinked to a directory outside the install dir is never listed or read", async (t) => {
  const { root, installDir } = await tempRoot(t);
  const outsideVersionDir = await writeSitePlugin(root, "outside-plugin", "linked");
  await writeFile(path.join(outsideVersionDir, "secret.txt"), SECRET, "utf8");
  await symlink(path.join(root, "outside-plugin"), path.join(installDir, "linked"));

  const deps = createRouteDeps({ installDir });
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const { status, text } = await getFiles(baseUrl, deps.workspaceId, "linked", cookie);

  assert.equal(status, 404, text);
  assert.equal(text.includes(SECRET), false);
});

test("PLUGIN_FILES symlink escape: the binding refuses a site record whose folder resolves outside the install dir", async (t) => {
  // Discovery already skips a symlinked folder (the test above), so this drives the binding
  // directly with the record a racing swap would produce — the guard must hold on its own.
  const { root, installDir } = await tempRoot(t);
  const outsideVersionDir = await writeSitePlugin(root, "outside-plugin", "raced");
  await writeFile(path.join(outsideVersionDir, "secret.txt"), SECRET, "utf8");
  await symlink(path.join(root, "outside-plugin"), path.join(installDir, "raced"));

  const runtime = composePluginRuntime({
    workspaceId: "ws",
    clock: { nowIso: () => new Date(0).toISOString() },
    activationRepo: new InMemoryPluginActivationRepo(),
    sources: [],
    installDir,
  });

  await assert.rejects(
    runtime.readPluginPackageFiles({ id: "raced", name: "raced", version: "1.0.0", source: "site", status: "valid", errors: [] }),
    { name: "PluginPackagePathError" }
  );
});

test("PLUGIN_FILES: a built-in with no sourceDir, or a site record with no installDir, lists no files", async () => {
  const runtime = composePluginRuntime({
    workspaceId: "ws",
    clock: { nowIso: () => new Date(0).toISOString() },
    activationRepo: new InMemoryPluginActivationRepo(),
    sources: [{ manifest: WORD_COUNT_MANIFEST, source: "built-in", entryPath: "built-in:word-count", importModule: async () => ({}) }],
  });

  assert.deepEqual(
    await runtime.readPluginPackageFiles({ id: "word-count", name: "Word Count", version: "1.0.0", source: "built-in", status: "valid", errors: [] }),
    { files: [], truncated: false }
  );
  assert.deepEqual(
    await runtime.readPluginPackageFiles({ id: "site-only", name: "Site", version: "1.0.0", source: "site", status: "valid", errors: [] }),
    { files: [], truncated: false }
  );
});

test("PLUGIN_FILES authz: a signed-in principal without admin.plugins.read is 403, and no session is 401", async (t) => {
  const deps = createRouteDeps();
  const baseUrl = await startTestServer(createApp(deps), t);

  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const denied = await getFiles(baseUrl, deps.workspaceId, "word-count", bareCookie);
  assert.equal(denied.status, 403, denied.text);
  assert.equal(denied.text.includes("WORD_COUNT_MANIFEST"), false);

  const anonymous = await getFiles(baseUrl, deps.workspaceId, "word-count", "");
  assert.equal(anonymous.status, 401, anonymous.text);
});

test("PLUGIN_FILES: an unknown workspace id is 404", async (t) => {
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const { status } = await getFiles(baseUrl, "not-this-workspace", "word-count", cookie);
  assert.equal(status, 404);
});
