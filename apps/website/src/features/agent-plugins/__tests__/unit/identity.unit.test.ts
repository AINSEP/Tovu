import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { readInstalledAgentPluginIdentity } from "../../identity.js";

const plugin = { pluginId: "github", packageRoot: path.join("/plugins", "github") };

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
