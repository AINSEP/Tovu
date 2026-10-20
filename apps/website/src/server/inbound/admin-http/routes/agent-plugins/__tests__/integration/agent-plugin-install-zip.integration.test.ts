import "../../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
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

const manifest = (version?: string) =>
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
    body: Uint8Array.from(archive),
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
    assert.deepEqual(await clash.json(), { code: "AGENT_PLUGIN_PLUGIN_ID_TAKEN", error: "This plugin ID is already installed. Choose Replace existing version to upgrade it." });
  });
});

test("AGENT_PLUGIN_INSTALL_ZIP: omitted display metadata is returned as explicit nulls", async (t) => {
  await withTempPluginsDir(async () => {
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    const archive = await buildZipFixture([
      { path: "plugin.json", content: manifest() },
    ]);

    const response = await upload(baseUrl, cookie, archive);
    assert.equal(response.status, 201);
    const { agentPlugin } = await response.json();
    assert.equal(agentPlugin.pluginId, PLUGIN_ID);
    assert.equal(agentPlugin.displayName, null);
    assert.equal(agentPlugin.summary, null);
    assert.equal(agentPlugin.version, null);
    assert.equal(agentPlugin.description, null);
  });
});

test("AGENT_PLUGIN_INSTALL_ZIP: an invalid replace value refuses an otherwise valid upload", async (t) => {
  await withTempPluginsDir(async () => {
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    const archive = await buildZipFixture([{ path: "plugin.json", content: manifest("1.0.0") }]);
    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/install/zip?expectedSha256=${sha(archive)}&replace=yes`, {
      method: "POST",
      headers: { cookie, "content-type": "application/zip" },
      body: Uint8Array.from(archive),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: "VALIDATION_ERROR", error: "replace must be true or false." });
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

    const badDigest = await upload(baseUrl, cookie, archive, "not-a-digest");
    assert.equal(badDigest.status, 400);
    // A status-only check also passes when the installer's digest refusal masks missing validation.
    assert.deepEqual(await badDigest.json(), {
      code: "VALIDATION_ERROR",
      error: "expectedSha256 must be the file's lowercase hex SHA-256.",
    });
    const notZip = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/install/zip?expectedSha256=${sha(archive)}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(notZip.status, 400);
    assert.deepEqual(await notZip.json(), { code: "VALIDATION_ERROR", error: "An application/zip upload is required." });
    assert.equal((await upload(baseUrl, "", archive)).status, 401);
    const otherWorkspace = await fetch(`${baseUrl}/api/admin/v1/workspaces/other/agent-plugins/install/zip?expectedSha256=${sha(archive)}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/zip" },
      body: Uint8Array.from(archive),
    });
    assert.equal(otherWorkspace.status, 404);
    assert.deepEqual(await otherWorkspace.json(), { error: "workspace was not found" });

    const bare = await loginAsBarePrincipal(deps, baseUrl);
    const forbidden = await upload(baseUrl, bare, archive);
    assert.equal(forbidden.status, 403);
    assert.equal(((await forbidden.json()) as { details: { permission: string } }).details.permission, "admin.plugins.enable");
  });
});


test("AGENT_PLUGIN_INSTALL_ZIP: replace=true upgrades the same plugin id and reports the new disabled row", async t => {
  await withTempPluginsDir(async () => {
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    const old = await buildZipFixture([{ path: "plugin.json", content: manifest("1.0.0") }]);
    const next = await buildZipFixture([{ path: "plugin.json", content: manifest("2.0.0") }]);
    assert.equal((await upload(baseUrl, cookie, old)).status, 201);
    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/install/zip?expectedSha256=${sha(next)}&replace=true`, {
      method: "POST", headers: { cookie, "content-type": "application/zip" }, body: Uint8Array.from(next),
    });
    assert.equal(response.status, 201);
    const body = await response.json() as { agentPlugin: { version: string; enabled: boolean } };
    assert.equal(body.agentPlugin.version, "2.0.0");
    assert.equal(body.agentPlugin.enabled, false);
  });
});


test("AGENT_PLUGIN_INSTALL_ZIP: compressed HTTP bodies are refused by the raw parser", async (t) => {
  await withTempPluginsDir(async () => {
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    const archive = await buildZipFixture([{ path: "plugin.json", content: manifest("1.0.0") }]);
    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/install/zip?expectedSha256=${sha(archive)}`, {
      method: "POST", headers: { cookie, "content-type": "application/zip", "content-encoding": "gzip" }, body: Uint8Array.from(archive),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: "AGENT_PLUGIN_ARCHIVE_UNREADABLE", error: "The upload could not be read." });
    const root = resolveAgentPluginLayout().forWorkspace(WORKSPACE).root;
    await assert.rejects(readFile(path.join(root, "activations.json")), { code: "ENOENT" });
  });
});

test("AGENT_PLUGIN_INSTALL_ZIP: body size limit returns the actionable 413 before installation", async (t) => {
  await withTempPluginsDir(async () => {
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    const response = await upload(baseUrl, cookie, Buffer.alloc(32 * 1024 * 1024 + 1));
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { code: "AGENT_PLUGIN_ARCHIVE_TOO_LARGE", error: "The .zip is larger than the 32 MiB limit." });
    const root = resolveAgentPluginLayout().forWorkspace(WORKSPACE).root;
    await assert.rejects(readFile(path.join(root, "activations.json")), { code: "ENOENT" });
  });
});


test("AGENT_PLUGIN_INSTALL_ZIP: an enabled plugin cannot be replaced", async (t) => {
  await withTempPluginsDir(async () => {
    const { agentPluginActivations } = await import("#src/features/agent-plugins/activation-effects");
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    const old = await buildZipFixture([{ path: "plugin.json", content: manifest("1.0.0") }]);
    const next = await buildZipFixture([{ path: "plugin.json", content: manifest("2.0.0") }]);
    assert.equal((await upload(baseUrl, cookie, old)).status, 201);
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE).root;
    await agentPluginActivations.setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: true, actor: "test" });
    const before = await readFile(path.join(workspaceRoot, "activations.json"), "utf8");
    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/install/zip?expectedSha256=${sha(next)}&replace=true`, {
      method: "POST", headers: { cookie, "content-type": "application/zip" }, body: Uint8Array.from(next),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { code: "AGENT_PLUGIN_PLUGIN_ENABLED", error: "Switch off the installed plugin before replacing its version." });
    assert.equal(await readFile(path.join(workspaceRoot, "activations.json"), "utf8"), before);
  });
});

test("AGENT_PLUGIN_INSTALL_ZIP: an unreadable activation record refuses installation without rewriting it", async (t) => {
  await withTempPluginsDir(async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE).root;
    await mkdir(workspaceRoot, { recursive: true });
    const activations = path.join(workspaceRoot, "activations.json");
    await writeFile(activations, "{malformed");
    const warn = t.mock.method(console, "warn", () => undefined);
    const archive = await buildZipFixture([{ path: "plugin.json", content: manifest("1.0.0") }]);
    const response = await upload(baseUrl, cookie, archive);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { code: "AGENT_PLUGIN_ACTIVATIONS_BUSY", error: "Could not install the plugin. Try again." });
    assert.equal(await readFile(activations, "utf8"), "{malformed");
    const warned = warn.mock.calls.map((call) => String(call.arguments[0]));
    assert.equal(warned.some((line) => line.startsWith("[agent-plugins] upload refused — agent-plugin activation: ")), true);
  });
});

test("AGENT_PLUGIN_INSTALL_ZIP: a host layout failure returns a redacted internal error", async (t) => {
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(deps), t);
  const fault = t.mock.method(deps.agentPluginLayout, "forWorkspace", () => { throw new Error("private /secret/layout"); });
  const archive = await buildZipFixture([{ path: "plugin.json", content: manifest("1.0.0") }]);
  const response = await upload(baseUrl, cookie, archive);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { code: "INTERNAL_ERROR", error: "internal error" });
  assert.equal(fault.mock.callCount(), 1);
});

for (const oversized of ["file", "entries"] as const) {
  test(`AGENT_PLUGIN_INSTALL_ZIP: expanded ${oversized} limit has an actionable refusal`, async (t) => {
    await withTempPluginsDir(async () => {
      const { listInstalledPlugins } = await import("#src/features/agent-plugins/lifecycle");
      const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
      const archive = await buildZipFixture([
        { path: "plugin.json", content: manifest("1.0.0") },
        ...(oversized === "file"
          ? [{ path: "huge.bin", content: Buffer.alloc(16 * 1024 * 1024 + 1) }]
          : Array.from({ length: 4096 }, (_, index) => ({ path: `files/${index}.txt`, content: "small" }))),
      ]);
      const response = await upload(baseUrl, cookie, archive);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        code: oversized === "file" ? "AGENT_PLUGIN_FILE_TOO_LARGE" : "AGENT_PLUGIN_TOO_MANY_ENTRIES",
        error: "The .zip is too big once unpacked: at most 4096 files, 16 MiB per file, 64 MiB in all.",
      });
      assert.deepEqual(await listInstalledPlugins(resolveAgentPluginLayout().forWorkspace(WORKSPACE).root), []);
    });
  });
}

test("AGENT_PLUGIN_INSTALL_ZIP: a blocked publish destination is an internal install failure with no path leak", async (t) => {
  await withTempPluginsDir(async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { listInstalledPlugins } = await import("#src/features/agent-plugins/lifecycle");
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    const archive = await buildZipFixture([{ path: "plugin.json", content: manifest("1.0.0") }]);
    const workspace = resolveAgentPluginLayout().forWorkspace(WORKSPACE);
    const packages = workspace.pluginPackagesDir({ pluginId: PLUGIN_ID });
    await mkdir(packages, { recursive: true });
    const blocker = path.join(packages, sha(archive));
    await writeFile(blocker, "not a package directory");
    const response = await upload(baseUrl, cookie, archive);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      code: "AGENT_PLUGIN_PUBLISH_FAILED", error: "This .zip contains files or links that plugins may not include.",
    });
    assert.equal(await readFile(blocker, "utf8"), "not a package directory");
    assert.deepEqual(await listInstalledPlugins(workspace.root), []);
  });
});

const DIGEST_MESSAGE = { code: "VALIDATION_ERROR", error: "expectedSha256 must be the file's lowercase hex SHA-256." };

function post(baseUrl: string, cookie: string, query: string, init: { contentType?: string; body?: Buffer } = {}) {
  return fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/install/zip${query}`, {
    method: "POST",
    headers: { cookie, "content-type": init.contentType ?? "application/zip" },
    body: Uint8Array.from(init.body ?? Buffer.from("zip")),
  });
}

test("AGENT_PLUGIN_INSTALL_ZIP: a missing expectedSha256 is a validation error", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
  const response = await post(baseUrl, cookie, "");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), DIGEST_MESSAGE);
});

test("AGENT_PLUGIN_INSTALL_ZIP: a repeated expectedSha256 is a validation error", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
  const digest = "a".repeat(64);
  const response = await post(baseUrl, cookie, `?expectedSha256=${digest}&expectedSha256=${digest}`);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), DIGEST_MESSAGE);
});

test("AGENT_PLUGIN_INSTALL_ZIP: an uppercase expectedSha256 is a validation error", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
  const response = await post(baseUrl, cookie, `?expectedSha256=${"A".repeat(64)}`);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), DIGEST_MESSAGE);
});

test("AGENT_PLUGIN_INSTALL_ZIP: permission is checked before any input validation", async (t) => {
  const deps = createRouteDeps();
  const { baseUrl } = await bootAuthenticated(buildTestApp(deps), t);
  const bare = await loginAsBarePrincipal(deps, baseUrl);
  const response = await post(baseUrl, bare, "?expectedSha256=bad&replace=yes", { contentType: "text/plain" });
  assert.equal(response.status, 403);
  assert.equal(((await response.json()) as { details: { permission: string } }).details.permission, "admin.plugins.enable");
});

test("AGENT_PLUGIN_INSTALL_ZIP: the digest is checked before the content type", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
  const response = await post(baseUrl, cookie, "?expectedSha256=bad", { contentType: "text/plain" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), DIGEST_MESSAGE);
});

test("AGENT_PLUGIN_INSTALL_ZIP: the content type is checked before replace", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
  const response = await post(baseUrl, cookie, `?expectedSha256=${"a".repeat(64)}&replace=yes`, { contentType: "text/plain" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: "VALIDATION_ERROR", error: "An application/zip upload is required." });
});

test("AGENT_PLUGIN_INSTALL_ZIP: the body is parsed before replace is checked", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/install/zip?expectedSha256=${"a".repeat(64)}&replace=yes`, {
    method: "POST", headers: { cookie, "content-type": "application/zip", "content-encoding": "gzip" }, body: Uint8Array.from(Buffer.from("zip")),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: "AGENT_PLUGIN_ARCHIVE_UNREADABLE", error: "The upload could not be read." });
});

test("AGENT_PLUGIN_INSTALL_ZIP: replace=false keeps refusing a different package under an installed name", async (t) => {
  await withTempPluginsDir(async () => {
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    const v1 = await buildZipFixture([{ path: "plugin.json", content: manifest("1.0.0") }]);
    const v2 = await buildZipFixture([{ path: "plugin.json", content: manifest("2.0.0") }]);
    assert.equal((await upload(baseUrl, cookie, v1)).status, 201);
    const clash = await post(baseUrl, cookie, `?expectedSha256=${sha(v2)}&replace=false`, { body: v2 });
    assert.equal(clash.status, 409);
    assert.deepEqual(await clash.json(), { code: "AGENT_PLUGIN_PLUGIN_ID_TAKEN", error: "This plugin ID is already installed. Choose Replace existing version to upgrade it." });
  });
});

test("AGENT_PLUGIN_INSTALL_ZIP: the install runs under the plugin host's identity admission", async (t) => {
  await withTempPluginsDir(async () => {
    const deps = createRouteDeps();
    const host = deps.pluginHost;
    assert.ok(host);
    const admission = t.mock.method(host, "withInstallIdentity");
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(deps), t);
    const archive = await buildZipFixture([{ path: "plugin.json", content: manifest("1.0.0") }]);
    assert.equal((await upload(baseUrl, cookie, archive)).status, 201);
    assert.equal(admission.mock.callCount(), 1);
    const [{ candidate }] = admission.mock.calls[0]!.arguments;
    assert.deepEqual({ localId: candidate.localId, family: candidate.family }, { localId: PLUGIN_ID, family: "agent-plugin" });
  });
});

test("AGENT_PLUGIN_INSTALL_ZIP: without a plugin host the upload still installs switched off", async (t) => {
  await withTempPluginsDir(async () => {
    const deps = createRouteDeps();
    const { pluginHost: _host, ...hostless } = deps;
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app, deps);
    app.use("/api/admin", requireAdminSession(deps));
    registerAgentPluginInstallRoute(app, hostless);
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const archive = await buildZipFixture([{ path: "plugin.json", content: manifest("1.0.0") }]);
    const response = await upload(baseUrl, cookie, archive);
    assert.equal(response.status, 201);
    const body = (await response.json()) as { alreadyInstalled: boolean; agentPlugin: { pluginId: string; enabled: boolean } };
    assert.deepEqual({ alreadyInstalled: body.alreadyInstalled, pluginId: body.agentPlugin.pluginId, enabled: body.agentPlugin.enabled }, { alreadyInstalled: false, pluginId: PLUGIN_ID, enabled: false });
  });
});
