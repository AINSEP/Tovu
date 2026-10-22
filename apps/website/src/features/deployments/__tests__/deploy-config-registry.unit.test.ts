import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";

import { DEPLOY_CONFIGS_FILENAME, loadDeployWorkflowFiles, loadDeployConfigGeneratorsFromSource, loadBundledDeployConfigGenerators, parseDeployConfigsFile, readDeployConfigTargetIdsFromSource, readBundledDeployConfigTargetIds } from "../deploy-config-registry.js";

/**
 * @file `deploy-config-registry.ts` — the generators behind `tovu deploy config --target <id>`, read
 * from bundled source. The union yields fly, railway, render in deterministic plugin-id order
 * (the CLI's `--target must be one of: ...` text is built from it); a bad module or manifest is a
 * reported refusal, never a throw.
 */

const BUNDLED_SOURCE_ROOT = path.resolve(import.meta.dirname, "../../../../../../content/agent-plugins");

test("the bundled plugin union declares fly, railway, render in plugin-id order, each with a render()", async () => {
  const registry = await loadBundledDeployConfigGenerators({ sourceRoot: BUNDLED_SOURCE_ROOT });

  assert.deepEqual(registry.refusals, []);
  assert.deepEqual(
    registry.list().map((generator) => generator.descriptor.id),
    ["fly", "railway", "render"]
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

test("readBundledDeployConfigTargetIds: all bundled ids in plugin-id order, without importing modules", () => {
  assert.deepEqual(readBundledDeployConfigTargetIds({ sourceRoot: BUNDLED_SOURCE_ROOT }), ["fly", "railway", "render"]);
});

test("readDeployConfigTargetIdsFromSource: a missing or invalid manifest yields no ids", async () => {
  await withPlugin({}, async (packageRoot) => {
    assert.deepEqual(readDeployConfigTargetIdsFromSource({ pluginId: "fixture", packageRoot }), []);
  });
  await withPlugin({ [DEPLOY_CONFIGS_FILENAME]: "{" }, async (packageRoot) => {
    assert.deepEqual(readDeployConfigTargetIdsFromSource({ pluginId: "fixture", packageRoot }), []);
  });
});

test("bundled config discovery skips missing categories, non-packages and retired ids; refuses cross-package duplicates", async () => {
  const files: Record<string, string> = {};
  for (const [pluginId, id] of [["zeta", "last"], ["alpha", "first"], ["one", "shared"], ["two", "shared"], ["tovu-deploy-fly", "retired"], ["scratch", "scratch"]]) {
    if (pluginId !== "scratch") files[`${pluginId}/plugin.json`] = JSON.stringify({ name: pluginId, version: "1.0.0" });
    files[`${pluginId}/${DEPLOY_CONFIGS_FILENAME}`] = manifest([{ id, label: id, module: "config.mjs" }]);
    files[`${pluginId}/config.mjs`] = "export default { render() { return { filename: 'x', contents: '', notes: [] }; } };\n";
  }
  files["no-category/plugin.json"] = '{"name":"no-category","version":"1.0.0"}';
  files["bad/plugin.json"] = '{"name":"bad","version":"1.0.0"}';
  files[`bad/${DEPLOY_CONFIGS_FILENAME}`] = "{";
  await withPlugin(files, async sourceRoot => {
    const registry = await loadBundledDeployConfigGenerators({ sourceRoot });
    assert.deepEqual(registry.list().map(item => item.descriptor.id), ["first", "last"]);
    assert.equal(registry.get("shared"), undefined);
    assert.deepEqual(registry.refusals, [
      "deploy configs from 'bad' were not loaded: tovu-deploy-configs.json is invalid: not valid JSON",
      "deploy config 'shared' was not loaded: declared more than once",
    ]);
    assert.deepEqual(readBundledDeployConfigTargetIds({ sourceRoot }), ["first", "last"]);
  });
});

test("L210 descriptor validation preserves boundaries, error precedence and original strings", () => {
  const base = { id: "host", label: " Host ", module: "./host.mjs" };
  for (const label of [null, 42, "", " ", "x".repeat(101)]) {
    assert.deepEqual(parseDeployConfigsFile(manifest([{ ...base, label }])), {
      ok: false, reason: "generators[0].label must be a non-empty string",
    });
  }
  const boundary = { ...base, label: "x".repeat(100) };
  assert.deepEqual(parseDeployConfigsFile(manifest([boundary])), { ok: true, descriptors: [boundary] });
  for (const module of [null, 42, "host.js", "/host.mjs"]) {
    assert.deepEqual(parseDeployConfigsFile(manifest([{ ...base, module }])), {
      ok: false, reason: "generators[0].module must be a relative path ending in .mjs",
    });
  }
  for (const module of ["./host.mjs", "../host.mjs", "host.mjs"]) {
    const descriptor = { ...base, module };
    assert.deepEqual(parseDeployConfigsFile(manifest([descriptor])), { ok: true, descriptors: [descriptor] });
  }
  assert.deepEqual(parseDeployConfigsFile(manifest([{ ...base, id: "BAD", label: "", module: null }])), {
    ok: false, reason: "generators[0].id must be a lowercase hyphenated id",
  });
  assert.deepEqual(parseDeployConfigsFile(manifest([{ ...base, label: "", module: null }])), {
    ok: false, reason: "generators[0].label must be a non-empty string",
  });
});

test('workflow declarations use the installed active contribution gate and preserve all choices', async () => {
  let calls = 0;
  const files = await loadDeployWorkflowFiles({ workspaceId: 'ws', loadContributions: async (input, options) => {
    calls++;
    assert.equal(input.workspaceId, 'ws');
    assert.equal(input.definition.filename, DEPLOY_CONFIGS_FILENAME);
    assert.equal(input.definition.kind, 'data');
    assert.deepEqual(options, { requireActive: true, orderByPluginId: true });
    const parsed = input.definition.parse({ raw: JSON.stringify({ schemaVersion: 1, generators: [
      { id: 'one', label: 'One', module: 'one.mjs', workflowFile: 'one.yml' },
      { id: 'two', label: 'Two', module: 'two.mjs', workflowFile: 'two.yml' },
    ] }) });
    assert.ok(parsed.ok);
    return { items: parsed.descriptors as never, refusals: [] };
  } });
  assert.deepEqual(files, ['one.yml', 'two.yml']);
  assert.equal(calls, 1);
  assert.deepEqual(await loadDeployWorkflowFiles({ workspaceId: 'ws', loadContributions: async () => ({ items: [], refusals: [] }) }), []);
});
