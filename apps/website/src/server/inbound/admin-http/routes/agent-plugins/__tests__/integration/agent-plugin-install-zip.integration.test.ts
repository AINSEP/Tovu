import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";

import { buildZipFixture } from "#src/features/agent-plugins/__tests__/fixtures/build-zip";
import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { registerAgentPluginInstallRoute } from "../../install.js";

/**
 * @file `AGENT_PLUGIN_INSTALL_ZIP` — the Agent Plugins "Add a plugin" upload. Real zips (yazl) through
 * the real yauzl reader and `installAgentPlugin`, isolated under a temp `TOVU_AGENT_PLUGINS_DIR`.
 */

const WORKSPACE = "workspace-local";
const PLUGIN_ID = "note-taker";

const manifest = (version: string) =>
  JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: PLUGIN_ID, version });
const skill = `---\nname: ${PLUGIN_ID}\ndescription: Takes notes.\n---\n# Notes\nTake notes.`;
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function withTempPluginsDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-install-zip-test-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

function buildTestApp(baseDeps = createRouteDeps()): express.Express {
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, baseDeps);
  app.use("/api/admin", requireAdminSession(baseDeps));
  registerAgentPluginInstallRoute(app, baseDeps);
  return app;
}

function upload(baseUrl: string, cookie: string, archive: Buffer, expectedSha256 = sha(archive)) {
  return fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/install/zip?expectedSha256=${expectedSha256}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/zip" },
    body: archive,
  });
}

test("AGENT_PLUGIN_INSTALL_ZIP: a folder zip installs switched off; the same bytes again are a no-op", async (t) => {
  await withTempPluginsDir(async () => {
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    const archive = await buildZipFixture([
      { path: "note-taker/plugin.json", content: manifest("1.0.0") },
      { path: `note-taker/skills/${PLUGIN_ID}/SKILL.md`, content: skill },
      { path: "__MACOSX/note-taker/._plugin.json", content: "resource fork" },
    ]);

    const first = await upload(baseUrl, cookie, archive);
    assert.equal(first.status, 201);
    const body = (await first.json()) as { alreadyInstalled: boolean; agentPlugin: { pluginId: string; enabled: boolean; version: string; skills: Array<{ name: string }> } };
    assert.equal(body.alreadyInstalled, false);
    assert.equal(body.agentPlugin.pluginId, PLUGIN_ID);
    assert.equal(body.agentPlugin.enabled, false);
    assert.equal(body.agentPlugin.version, "1.0.0");
    assert.deepEqual(body.agentPlugin.skills.map((entry) => entry.name), [PLUGIN_ID]);

    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE).root;
    const record = JSON.parse(await readFile(path.join(workspaceRoot, "activations.json"), "utf8")).plugins[PLUGIN_ID];
    assert.equal(record?.enabled, false);
    assert.equal(record?.origin, "operator-installed");

    const again = await upload(baseUrl, cookie, archive);
    assert.equal(again.status, 200);
    assert.equal(((await again.json()) as { alreadyInstalled: boolean }).alreadyInstalled, true);
  });
});

test("AGENT_PLUGIN_INSTALL_ZIP: a different package under an installed name is refused", async (t) => {
  await withTempPluginsDir(async () => {
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    const v1 = await buildZipFixture([{ path: "plugin.json", content: manifest("1.0.0") }]);
    const v2 = await buildZipFixture([{ path: "plugin.json", content: manifest("2.0.0") }]);
    assert.equal((await upload(baseUrl, cookie, v1)).status, 201);

    const clash = await upload(baseUrl, cookie, v2);
    assert.equal(clash.status, 409);
    assert.deepEqual(await clash.json(), { code: "AGENT_PLUGIN_PLUGIN_ID_TAKEN", error: "A different plugin with this name is already installed." });
  });
});

test("AGENT_PLUGIN_INSTALL_ZIP: bad uploads are refused in plain words and install nothing", async (t) => {
  await withTempPluginsDir(async () => {
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    const noManifest = await buildZipFixture([{ path: "README.md", content: "hi" }]);
    const badManifest = await buildZipFixture([{ path: "plugin.json", content: "{not json" }]);
    const twoFolders = await buildZipFixture([
      { path: "a/plugin.json", content: manifest("1.0.0") },
      { path: "b/plugin.json", content: manifest("1.0.0") },
    ]);
    const symlink = await buildZipFixture([
      { path: "plugin.json", content: manifest("1.0.0") },
      { path: "link", content: "/etc/passwd", mode: 0o120777 },
    ]);
    const garbage = Buffer.from("this is not a zip");

    const cases: Array<[Buffer, string | undefined, number, string]> = [
      [noManifest, undefined, 400, "AGENT_PLUGIN_MANIFEST_MISSING"],
      [badManifest, undefined, 400, "AGENT_PLUGIN_MANIFEST_INVALID"],
      [twoFolders, undefined, 400, "AGENT_PLUGIN_MANIFEST_MISSING"],
      [symlink, undefined, 400, "AGENT_PLUGIN_SYMLINK_ENTRY_REJECTED"],
      [garbage, undefined, 400, "AGENT_PLUGIN_ARCHIVE_UNREADABLE"],
      [noManifest, "0".repeat(64), 400, "AGENT_PLUGIN_DIGEST_MISMATCH"],
    ];
    for (const [archive, digest, status, code] of cases) {
      const response = await upload(baseUrl, cookie, archive, digest);
      const body = (await response.json()) as { code: string; error: string };
      assert.equal(response.status, status, code);
      assert.equal(body.code, code);
      assert.equal(body.error.includes(path.sep + "tmp") || body.error.includes("/ws/"), false, "no host path in the message");
    }

    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE).root;
    // The symlink case passes the pre-pass, so its disabled record is the only trace left behind.
    const plugins = JSON.parse(await readFile(path.join(workspaceRoot, "activations.json"), "utf8").catch(() => '{"plugins":{}}')).plugins;
    assert.equal(plugins[PLUGIN_ID]?.enabled ?? false, false);
  });
});

test("AGENT_PLUGIN_INSTALL_ZIP: input checks, auth, and permission", async (t) => {
  await withTempPluginsDir(async () => {
    const deps = createRouteDeps();
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(deps), t);
    const archive = await buildZipFixture([{ path: "plugin.json", content: manifest("1.0.0") }]);

    assert.equal((await upload(baseUrl, cookie, archive, "not-a-digest")).status, 400);
    const notZip = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/install/zip?expectedSha256=${sha(archive)}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(notZip.status, 400);
    assert.equal((await upload(baseUrl, "", archive)).status, 401);
    const otherWorkspace = await fetch(`${baseUrl}/api/admin/v1/workspaces/other/agent-plugins/install/zip?expectedSha256=${sha(archive)}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/zip" },
      body: archive,
    });
    assert.equal(otherWorkspace.status, 404);

    const bare = await loginAsBarePrincipal(deps, baseUrl);
    const forbidden = await upload(baseUrl, bare, archive);
    assert.equal(forbidden.status, 403);
    assert.equal(((await forbidden.json()) as { details: { permission: string } }).details.permission, "admin.plugins.enable");
  });
});
