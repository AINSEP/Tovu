import assert from "node:assert/strict";
import test from "node:test";

import { deployConfigTargetOptionHelp, formatTargetOptionHelp } from "../../commands/deploy-config.js";
import { createProgram } from "../../program.js";

/**
 * @file `tovu deploy config --target` help text is built from the ids the bundled hosting plugins
 * declare; with exactly fly, railway, render it lists them in plugin-id order.
 */

test("with the split bundled plugins, --target help follows plugin-id order", () => {
  assert.equal(deployConfigTargetOptionHelp(), "deploy platform: fly, railway, or render");
  const config = createProgram().commands.find((c) => c.name() === "deploy")?.commands.find((c) => c.name() === "config");
  assert.equal(config?.options.find((o) => o.long === "--target")?.description, "deploy platform: fly, railway, or render");
});

test("formatTargetOptionHelp: joins one, two, and many ids", () => {
  assert.equal(formatTargetOptionHelp([]), "deploy platform id declared by bundled plugins");
  assert.equal(formatTargetOptionHelp(["fly"]), "deploy platform: fly");
  assert.equal(formatTargetOptionHelp(["fly", "render"]), "deploy platform: fly or render");
  assert.equal(formatTargetOptionHelp(["a", "b", "c", "d"]), "deploy platform: a, b, c, or d");
});

test("CLI help discovers all contributing packages through the same bundled source selector", async t => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { default: path } = await import("node:path");
  const sourceRoot = await mkdtemp(path.join(tmpdir(), "tovu-cli-help-split-"));
  const previous = process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR;
  t.after(async () => {
    if (previous === undefined) delete process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR;
    else process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR = previous;
    await rm(sourceRoot, { recursive: true, force: true });
  });
  for (const [pluginId, id] of [["zeta", "last"], ["alpha", "first"], ["tovu-deploy-fly", "retired"]]) {
    await mkdir(path.join(sourceRoot, pluginId!));
    await writeFile(path.join(sourceRoot, pluginId!, "plugin.json"), JSON.stringify({ name: pluginId, version: "1.0.0" }));
    await writeFile(path.join(sourceRoot, pluginId!, "tovu-deploy-configs.json"), JSON.stringify({ schemaVersion: 1, generators: [{ id, label: id, module: "missing.mjs" }] }));
  }
  process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR = sourceRoot;
  assert.equal(deployConfigTargetOptionHelp(), "deploy platform: first or last");
});
