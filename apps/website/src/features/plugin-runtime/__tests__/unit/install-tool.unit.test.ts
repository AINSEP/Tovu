import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ToolInputError, type SurfaceEmitter, type ToolRegistration } from "@jini-ai/core";

import { PluginInstallError, type PluginInstallInput, type PluginInstallerPort, type PluginInstallPreview } from "../../install.js";
import { buildRegistrations, catalog, type PluginsInstallToolDeps } from "../../install-tool.js";

const PRINCIPAL = "principal-1";
const PREVIEW: PluginInstallPreview = {
  id: "faq-blocks", name: "FAQ Blocks", version: "1.2.0", tier: "tier-3", capabilities: ["content.read"], hooks: ["content.entry.beforeSave"],
  hasCode: true, digest: `sha256-${"a".repeat(64)}`, contentTypes: [], conflicts: [],
};

/** In-memory installer: records every call, enforces the digest like `installSitePlugin`. */
function fakeInstaller(options: { previewError?: PluginInstallError; installError?: PluginInstallError } = {}) {
  const previews: PluginInstallInput[] = [];
  const installs: Array<PluginInstallInput & { expectedDigest: string }> = [];
  const port: PluginInstallerPort = {
    preview: async (input) => { previews.push(input); if (options.previewError) throw options.previewError; return PREVIEW; },
    install: async (input) => {
      installs.push(input);
      if (options.installError) throw options.installError;
      if (input.expectedDigest !== PREVIEW.digest) throw new PluginInstallError("PLUGIN_CHANGED_SINCE_PREVIEW", "changed");
      return PREVIEW;
    },
  };
  return { port, previews, installs };
}

function deps(overrides: Partial<PluginsInstallToolDeps> = {}): PluginsInstallToolDeps {
  return {
    workspaceId: "ws-1",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    env: { TOVU_PLUGIN_LOCAL_INSTALL: "1" },
    ...overrides,
  };
}

function tool(d: PluginsInstallToolDeps): ToolRegistration {
  const [registration] = buildRegistrations(d);
  assert.ok(registration);
  return registration;
}

const ctx = (input: unknown) => ({ executionId: "e1", principal: { id: PRINCIPAL }, run: { id: "r1" }, input, signal: new AbortController().signal });

/** Runs the tool with a dialog channel available and records anything it tries to show on it.
 *  Owner rule 2026-10-05: only permanent deletes ask first, so an install must never raise a card. */
async function run(d: PluginsInstallToolDeps, input: unknown) {
  const surfaces: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (surface) => { surfaces.push(surface); throw new Error("plugins_install must not raise a confirmation card"); };
  const result = await tool(d).handler(ctx(input), { emitSurface });
  assert.deepEqual(surfaces, [], "no confirmation card");
  return result;
}

const FOLDER = { source: { kind: "folder", path: "/tmp/faq-blocks" } };

test("installs with no confirmation card, through the same installer with the previewed digest, and leaves the plugin off", async () => {
  const installer = fakeInstaller();
  const result = await run(deps({ pluginInstaller: installer.port }), FOLDER);
  assert.deepEqual(installer.previews, [{ sourceDir: "/tmp/faq-blocks", replace: false }]);
  assert.deepEqual(installer.installs, [{ sourceDir: "/tmp/faq-blocks", replace: false, expectedDigest: PREVIEW.digest }]);
  assert.deepEqual(result, {
    installed: true, enabled: false,
    plugin: { id: "faq-blocks", name: "FAQ Blocks", version: "1.2.0", tier: "tier-3" },
    warning: "This plugin runs code with full access to this computer and every site on it.",
    note: "Installed FAQ Blocks 1.2.0. It is OFF in every workspace; turn it on with plugins_set_enabled (family 'site-runtime') if the user wants it on.",
  });
});

test("installs with no dialog channel at all — nothing to approve, so nothing fails closed", async () => {
  const installer = fakeInstaller();
  const result = await tool(deps({ pluginInstaller: installer.port })).handler(ctx({ ...FOLDER, replace: true }), {});
  assert.deepEqual(installer.installs, [{ sourceDir: "/tmp/faq-blocks", replace: true, expectedDigest: PREVIEW.digest }]);
  assert.equal((result as { installed: boolean }).installed, true);
});

test("the TOVU_PLUGIN_LOCAL_INSTALL opt-in gates it exactly like the admin route; nothing is inspected", async () => {
  const installer = fakeInstaller();
  const result = await tool(deps({ pluginInstaller: installer.port, env: {} })).handler(ctx(FOLDER), {});
  assert.equal(installer.previews.length, 0);
  assert.deepEqual(result, { installed: false, reason: "PLUGIN_LOCAL_INSTALL_DISABLED", note: "Nothing was installed: local plugin installs are off on this server. The owner has to start Tovu with TOVU_PLUGIN_LOCAL_INSTALL=1 first." });
});

test("a missing permission refuses before any package is inspected", async () => {
  const installer = fakeInstaller();
  await assert.rejects(() => tool(deps({ pluginInstaller: installer.port, authorize: async () => ({ allowed: false, reason: "insufficient_permission" }) })).handler(ctx(FOLDER), {}));
  assert.equal(installer.previews.length, 0);
});

test("a relative path is refused as caller input", async () => {
  const installer = fakeInstaller();
  await assert.rejects(() => tool(deps({ pluginInstaller: installer.port })).handler(ctx({ source: { kind: "folder", path: "plugins/x" } }), {}),
    (error: unknown) => error instanceof ToolInputError && /absolute path/.test(error.message));
  assert.equal(installer.previews.length, 0);
});

test("an invalid package is refused at preview, before anything is written", async () => {
  const installer = fakeInstaller({ previewError: new PluginInstallError("PLUGIN_MANIFEST_INVALID", "tovu.plugin.json is missing.") });
  await assert.rejects(() => run(deps({ pluginInstaller: installer.port }), FOLDER),
    (error: unknown) => error instanceof ToolInputError && error.message === "PLUGIN_MANIFEST_INVALID: tovu.plugin.json is missing.");
  assert.equal(installer.installs.length, 0);
});

test("an installer refusal after the preview (package changed in between, busy lock) is a relayable result", async () => {
  const installer = fakeInstaller({ installError: new PluginInstallError("PLUGIN_CHANGED_SINCE_PREVIEW", "Package changed since preview. Review it again.") });
  const result = await run(deps({ pluginInstaller: installer.port }), FOLDER);
  assert.deepEqual(result, { installed: false, pluginId: "faq-blocks", reason: "PLUGIN_CHANGED_SINCE_PREVIEW", note: "Nothing was installed: Package changed since preview. Review it again. Call plugins_install again to install what is there now." });
});

test("a zip source passes the file's bytes as the archive, the admin ZIP route's input shape", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "plugins-install-tool-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const zip = path.join(dir, "faq.zip");
  await writeFile(zip, Buffer.from("PK\u0003\u0004fake"));
  const installer = fakeInstaller();
  await run(deps({ pluginInstaller: installer.port }), { source: { kind: "zip", path: zip } });
  assert.equal(Buffer.from(installer.installs[0]!.archive!).toString("latin1"), "PK\u0003\u0004fake");
  assert.equal(installer.installs[0]!.expectedDigest, PREVIEW.digest);
});

test("description matches the schema: folder and zip sources, replace flag, required source", () => {
  const entry = catalog[0]!;
  const schema = entry.inputSchema as { required: string[]; properties: { source: { properties: { kind: { enum: string[] } } }; replace: unknown } };
  assert.deepEqual(schema.required, ["source"]);
  assert.deepEqual(schema.properties.source.properties.kind.enum, ["folder", "zip"]);
  assert.ok(schema.properties.replace);
  assert.match(entry.description, /local folder or \.zip/);
  assert.match(entry.description, /replace:true/);
  assert.doesNotMatch(entry.description, /confirm|ASKS THE HUMAN/i);
});
