import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";

import { DEPLOY_CONFIGS_FILENAME, loadDeployConfigGeneratorsFromSource, parseDeployConfigsFile, readDeployConfigTargetIdsFromSource } from "../deploy-config-registry.js";

/**
 * @file `deploy-config-registry.ts` — the generators behind `tovu deploy config --target <id>`, read
 * from a plugin's source. The bundled `deploy` plugin must yield fly, render, railway in that order
 * (the CLI's `--target must be one of: ...` text is built from it); a bad module or manifest is a
 * reported refusal, never a throw.
 */

const BUNDLED_DEPLOY_PLUGIN_ROOT = path.resolve(import.meta.dirname, "../../../../../../content/agent-plugins/deploy");

test("the bundled deploy plugin declares fly, render, railway, in that order, each with a render()", async () => {
  const registry = await loadDeployConfigGeneratorsFromSource({ pluginId: "deploy", packageRoot: BUNDLED_DEPLOY_PLUGIN_ROOT });

  assert.deepEqual(registry.refusals, []);
  assert.deepEqual(
    registry.list().map((generator) => generator.descriptor.id),
    ["fly", "render", "railway"]
  );
  for (const generator of registry.list()) assert.equal(typeof generator.module.render, "function");
  assert.equal(registry.get("fly")?.descriptor.module, "deploy-configs/fly.mjs");
  assert.equal(registry.get("heroku"), undefined);
});

async function withPlugin<T>(files: Readonly<Record<string, string>>, fn: (packageRoot: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-deploy-configs-"));
  try {
    for (const [relPath, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(dir, relPath)), { recursive: true });
      await writeFile(path.join(dir, relPath), content);
    }
    return await fn(dir);
  } finally {
    await forceRemove(dir);
  }
}

function manifest(generators: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ schemaVersion: 1, generators });
}

test("a module without render() is refused and its siblings still load", async () => {
  await withPlugin(
    {
      [DEPLOY_CONFIGS_FILENAME]: manifest([
        { id: "good", label: "Good", module: "g/good.mjs" },
        { id: "bad", label: "Bad", module: "g/bad.mjs" },
      ]),
      "g/good.mjs": "export default { render() { return { filename: 'x', contents: '', notes: [] }; } };\n",
      "g/bad.mjs": "export default {};\n",
    },
    async (packageRoot) => {
      const registry = await loadDeployConfigGeneratorsFromSource({ pluginId: "fixture", packageRoot });
      assert.deepEqual(registry.list().map((generator) => generator.descriptor.id), ["good"]);
      assert.deepEqual(registry.refusals, ["deploy config 'bad' from 'fixture' was not loaded: its module has no render() function"]);
    }
  );
});

test("a module path that escapes the plugin root is refused", async () => {
  await withPlugin({ [DEPLOY_CONFIGS_FILENAME]: manifest([{ id: "x", label: "X", module: "../x.mjs" }]) }, async (packageRoot) => {
    const registry = await loadDeployConfigGeneratorsFromSource({ pluginId: "fixture", packageRoot });
    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, ["deploy config 'x' from 'fixture' was not loaded: module path '../x.mjs' escapes the plugin root"]);
  });
});

test("a malformed manifest drops the plugin with the parse reason", async () => {
  await withPlugin({ [DEPLOY_CONFIGS_FILENAME]: JSON.stringify({ schemaVersion: 2, generators: [] }) }, async (packageRoot) => {
    const registry = await loadDeployConfigGeneratorsFromSource({ pluginId: "fixture", packageRoot });
    assert.deepEqual(registry.refusals, [`deploy configs from 'fixture' were not loaded: ${DEPLOY_CONFIGS_FILENAME} is invalid: schemaVersion must be 1`]);
  });
});

test("a directory without the manifest contributes nothing and is not an error", async () => {
  await withPlugin({}, async (packageRoot) => {
    const registry = await loadDeployConfigGeneratorsFromSource({ pluginId: "fixture", packageRoot });
    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, []);
  });
});

test("parseDeployConfigsFile: rejects each malformed shape with its exact reason", () => {
  const cases: [string, string][] = [
    ["{", "not valid JSON"],
    [JSON.stringify({ schemaVersion: 1 }), "generators must be an array"],
    [manifest(["x" as unknown as Record<string, unknown>]), "generators[0] must be an object"],
    [manifest([{ id: "Bad", label: "B", module: "b.mjs" }]), "generators[0].id must be a lowercase hyphenated id"],
    [manifest([{ id: "b", label: " ", module: "b.mjs" }]), "generators[0].label must be a non-empty string"],
    [manifest([{ id: "b", label: "B", module: "b.js" }]), "generators[0].module must be a relative path ending in .mjs"],
    [manifest([{ id: "b", label: "B", module: "/abs/b.mjs" }]), "generators[0].module must be a relative path ending in .mjs"],
    [manifest([{ id: "b", label: "B", module: "b.mjs" }, { id: "b", label: "B2", module: "c.mjs" }]), "generators[1].id 'b' is declared twice"],
  ];
  for (const [raw, reason] of cases) assert.deepEqual(parseDeployConfigsFile(raw), { ok: false, reason }, raw);
});

test("readDeployConfigTargetIdsFromSource: the bundled plugin's ids in declared order, without importing modules", () => {
  assert.deepEqual(readDeployConfigTargetIdsFromSource({ pluginId: "deploy", packageRoot: BUNDLED_DEPLOY_PLUGIN_ROOT }), ["fly", "render", "railway"]);
});

test("readDeployConfigTargetIdsFromSource: a missing or invalid manifest yields no ids", async () => {
  await withPlugin({}, async (packageRoot) => {
    assert.deepEqual(readDeployConfigTargetIdsFromSource({ pluginId: "fixture", packageRoot }), []);
  });
  await withPlugin({ [DEPLOY_CONFIGS_FILENAME]: "{" }, async (packageRoot) => {
    assert.deepEqual(readDeployConfigTargetIdsFromSource({ pluginId: "fixture", packageRoot }), []);
  });
});
