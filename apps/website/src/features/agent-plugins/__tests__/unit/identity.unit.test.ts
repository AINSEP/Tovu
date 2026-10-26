import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { readInstalledAgentPluginIdentity, readPluginMaturity, readProviderPluginLink } from "../../identity.js";

const plugin = { pluginId: "github", packageRoot: path.join("/plugins", "github") };

test("host maturity accepts both flags and leaves absent metadata normal", async () => {
  for (const maturity of ['untested', 'soon'] as const) {
    const identity = await readInstalledAgentPluginIdentity({ plugin }, {
      readText: async () => JSON.stringify({ name: 'github', extensions: { tovu: { id: 'tovu/github', maturity } } }),
    });
    assert.equal(identity.maturity, maturity);
  }
  for (const manifest of [null, [], {}, { extensions: null }, { extensions: [] }, { extensions: { tovu: null } }, { extensions: { tovu: [] } }, { extensions: { tovu: {} } }]) {
    assert.equal(readPluginMaturity({ manifest }, { warn: () => assert.fail('absent maturity must not warn') }), undefined);
  }
});

test("unknown host maturity is ignored with a warning, without reflecting arbitrary manifest values", () => {
  for (const maturity of ['beta', '', null, 42, {}, ['untested']]) {
    const warnings: string[] = [];
    assert.equal(readPluginMaturity({ manifest: { extensions: { tovu: { maturity } } } }, { warn: message => warnings.push(message) }), undefined);
    assert.deepEqual(warnings, ['[agent-plugins] Unknown extensions.tovu.maturity ignored; expected "untested" or "soon".']);
  }
});

test("the provider plugin link is read from Tovu's extension; a malformed one warns and links nothing", async () => {
  const identity = await readInstalledAgentPluginIdentity({ plugin }, {
    readText: async () => JSON.stringify({ name: 'github', extensions: { tovu: { id: 'tovu/github', providerPlugin: 'analytics-github' } } }),
  });
  assert.equal(identity.providerPlugin, 'analytics-github');
  assert.equal(readProviderPluginLink({ manifest: { extensions: { tovu: {} } } }, { warn: () => assert.fail('absent link must not warn') }), undefined);
  for (const providerPlugin of ['', 'Bad Id', '../x', 7, ['a']]) {
    const warnings: string[] = [];
    assert.equal(readProviderPluginLink({ manifest: { extensions: { tovu: { providerPlugin } } } }, { warn: message => warnings.push(message) }), undefined);
    assert.equal(warnings.length, 1);
  }
});

test("reads plugin.json from the package root and projects its publisher identity", async () => {
  const reads: string[] = [];
  const manifest = { name: "github", version: "1.0.0", keywords: ["repository"], extensions: { tovu: { id: "tovu/github", provides: ["source-control"] } } };
  const identity = await readInstalledAgentPluginIdentity({ plugin }, {
    readText: async (filePath) => { reads.push(filePath); return JSON.stringify(manifest); },
  });
  assert.deepEqual(reads, [path.join("/plugins", "github", "plugin.json")]);
  assert.deepEqual(identity, { id: "tovu/github", keywords: ["repository"], provides: ["source-control"], warnings: [] });
});

test("a legacy manifest without a publisher id falls back to the lifecycle plugin id with a warning", async () => {
  const identity = await readInstalledAgentPluginIdentity({ plugin }, { readText: async () => JSON.stringify({ name: "Display title" }) });
  assert.equal(identity.id, "unknown/github");
  assert.equal(identity.warnings.length, 1);
});

test("an unreadable manifest is reported as one stable error, not the raw fs failure", async () => {
  await assert.rejects(
    readInstalledAgentPluginIdentity({ plugin }, { readText: async () => { throw Object.assign(new Error("ENOENT: /plugins/github/plugin.json"), { code: "ENOENT" }); } }),
    { message: "The installed plugin identity manifest could not be read." },
  );
});

test("malformed JSON is reported the same way as a missing file", async () => {
  await assert.rejects(
    readInstalledAgentPluginIdentity({ plugin }, { readText: async () => "{ not json" }),
    { message: "The installed plugin identity manifest could not be read." },
  );
});

test("the default reader reads the real file from disk", async (t) => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(path.join(tmpdir(), "identity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "plugin.json"), JSON.stringify({ name: "github", extensions: { tovu: { id: "tovu/github" } } }));
  const identity = await readInstalledAgentPluginIdentity({ plugin: { pluginId: "github", packageRoot: root } });
  assert.equal(identity.id, "tovu/github");
});
