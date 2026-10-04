
// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import { agentPluginActivations } from "../../../agent-plugins/activation-effects.js";
const { setAgentPluginActivation } = agentPluginActivations;
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";
import { ACTIVATIONS_FILENAME } from "@jini-ai/agent-plugins/lifecycle";
import { recordBundledAgentPluginDigests } from "#src/features/agent-plugins/bundled-digests";
import { installAgentPlugin, type AgentPluginArchiveEntry } from "#src/features/agent-plugins/install";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";

import { DEPLOY_TARGETS_FILENAME, loadDeployTargetRegistry } from "../registry.js";

/**
 * @file `registry.ts` — the generic seam that lets an Agent Plugin add a deploy host.
 *
 * Loading a plugin's module runs its code in-process, so the trust rule is the point of these
 * tests: only an ENABLED plugin whose installed digest is the one Tovu's own seed recorded
 * (`bundled-digests.json`) is loaded, a module path must stay inside the plugin, and every refusal
 * says exactly why. Every case installs a REAL package through `installAgentPlugin`, so the module
 * is imported from the same frozen `packages/sha256/<digest>/` directory production reads.
 */

const WORKSPACE_ID = "workspace-local";

const FIXTURE_MODULE = `export default {
  validateConfig(config) { return config.region === "bad" ? "region is bad" : null; },
  create({ credential }) {
    return {
      id: "fixture-host",
      async publish() { return { targetId: "fixture-host", url: "https://fixture.test/" + credential.token, status: "ready" }; },
      async checkReachability() { return { reachable: true }; },
    };
  },
};
`;

function fileEntry(entryPath: string, content: string): AgentPluginArchiveEntry {
  const bytes = Buffer.from(content, "utf8");
  return {
    kind: "file",
    entryPath,
    declaredSize: bytes.byteLength,
    executable: false,
    async *openReadStream() {
      yield bytes;
    },
  };
}

function descriptorJson(targets: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ schemaVersion: 1, targets });
}

/** Installs one real package carrying `files` (plus a manifest) and returns its digest. */
async function installPackage(pluginId: string, files: Readonly<Record<string, string>>): Promise<string> {
  const entries = [
    fileEntry("plugin.json", JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0" })),
    ...Object.entries(files).map(([entryPath, content]) => fileEntry(entryPath, content)),
  ];
  const archive = new Uint8Array(Buffer.from(`${pluginId}:${JSON.stringify(files)}`));
  const installed = await installAgentPlugin({
    archive,
    expectedSha256: createHash("sha256").update(archive).digest("hex"),
    archiveReader: {
      async *entries() {
        yield* entries;
      },
    },
    layout: resolveAgentPluginLayout(),
    workspaceId: WORKSPACE_ID,
  });
  return installed.archiveDigest;
}

async function withWorkspace<T>(fn: (workspaceRoot: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-deploy-targets-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn(resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID).root);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

async function markBundled(workspaceRoot: string, pluginId: string, archiveDigest: string, enabled = true): Promise<void> {
  await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId, archiveDigest }] });
  await setAgentPluginActivation({ workspaceRoot, pluginId, enabled, actor: "test" }, { origin: "bundled" });
}

const FIXTURE_FILES = {
  [DEPLOY_TARGETS_FILENAME]: descriptorJson([{ id: "fixture-host", label: "Fixture Host", module: "targets/fixture.mjs" }]),
  "targets/fixture.mjs": FIXTURE_MODULE,
};

test("lists a target from an enabled, Tovu-bundled plugin and builds a working DeployTarget from its module", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-deploy", FIXTURE_FILES);
    await markBundled(workspaceRoot, "fixture-deploy", digest);

    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.refusals, []);
    assert.deepEqual(
      registry.list().map((target) => [target.descriptor.id, target.descriptor.label, target.pluginId]),
      [["fixture-host", "Fixture Host", "fixture-deploy"]],
    );
    const loaded = registry.get("fixture-host");
    assert.ok(loaded);
    assert.equal(loaded.module.validateConfig?.({ region: "bad" }), "region is bad");
    const target = loaded.module.create({ credential: { token: "tok" }, config: {}, kit: {} as never });
    assert.equal((await target.publish({ files: [], projectName: "p" })).url, "https://fixture.test/tok");
    assert.equal(registry.get("netlify"), undefined);
  });
});

test("refuses a plugin whose installed digest is not the one Tovu shipped", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-deploy", FIXTURE_FILES);
    await setAgentPluginActivation({ workspaceRoot, pluginId: "fixture-deploy", enabled: true, actor: "test" }, { origin: "operator-installed" });

    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID });

    assert.equal(registry.get("fixture-host"), undefined);
    assert.deepEqual(registry.refusals, [
      `deploy targets from 'fixture-deploy' were not loaded: only plugins shipped with Tovu may add deploy targets (installed digest ${digest.slice(0, 12)} is not the one this build shipped)`,
    ]);
  });
});

test("refuses a module path that escapes the plugin root", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-deploy", {
      [DEPLOY_TARGETS_FILENAME]: descriptorJson([{ id: "fixture-host", label: "Fixture Host", module: "../x.mjs" }]),
    });
    await markBundled(workspaceRoot, "fixture-deploy", digest);

    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID });

    assert.equal(registry.get("fixture-host"), undefined);
    assert.deepEqual(registry.refusals, [
      "deploy target 'fixture-host' from 'fixture-deploy' was not loaded: module path '../x.mjs' escapes the plugin root",
    ]);
  });
});

test("refuses a module that is not an .mjs file, so no host package.json can turn it into CommonJS", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-deploy", {
      [DEPLOY_TARGETS_FILENAME]: descriptorJson([{ id: "fixture-host", label: "Fixture Host", module: "targets/fixture.js" }]),
      "targets/fixture.js": FIXTURE_MODULE,
    });
    await markBundled(workspaceRoot, "fixture-deploy", digest);

    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.refusals, [
      `deploy targets from 'fixture-deploy' were not loaded: ${DEPLOY_TARGETS_FILENAME} is invalid: targets[0].module must be a relative path ending in .mjs`,
    ]);
  });
});

test("a disabled bundled plugin contributes nothing and is not an error", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-deploy", FIXTURE_FILES);
    await markBundled(workspaceRoot, "fixture-deploy", digest, false);

    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, []);
  });
});

test("an unreadable activation record fails CLOSED with its reason", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-deploy", FIXTURE_FILES);
    await markBundled(workspaceRoot, "fixture-deploy", digest);
    await writeFile(path.join(workspaceRoot, ACTIVATIONS_FILENAME), "{ not json");

    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.list(), []);
    assert.equal(registry.refusals.length, 1);
    assert.match(registry.refusals[0]!, /^deploy targets from 'fixture-deploy' were not loaded: its activation could not be read \(/);
  });
});

test("plugins without a deploy-targets file are ignored entirely", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("plain-skill", { "skills/plain-skill/SKILL.md": "---\nname: plain-skill\ndescription: x\n---\n" });
    await markBundled(workspaceRoot, "plain-skill", digest);

    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, []);
  });
});

test("a malformed descriptor drops that plugin with the parse reason", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-deploy", { [DEPLOY_TARGETS_FILENAME]: JSON.stringify({ schemaVersion: 2, targets: [] }) });
    await markBundled(workspaceRoot, "fixture-deploy", digest);

    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.refusals, [
      `deploy targets from 'fixture-deploy' were not loaded: ${DEPLOY_TARGETS_FILENAME} is invalid: schemaVersion must be 1`,
    ]);
  });
});

test("a module without create() is refused and its siblings still load", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-deploy", {
      [DEPLOY_TARGETS_FILENAME]: descriptorJson([
        { id: "broken-host", label: "Broken", module: "targets/broken.mjs" },
        { id: "fixture-host", label: "Fixture Host", module: "targets/fixture.mjs" },
      ]),
      "targets/broken.mjs": "export default { validateConfig() { return null; } };\n",
      "targets/fixture.mjs": FIXTURE_MODULE,
    });
    await markBundled(workspaceRoot, "fixture-deploy", digest);

    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.list().map((target) => target.descriptor.id), ["fixture-host"]);
    assert.deepEqual(registry.refusals, ["deploy target 'broken-host' from 'fixture-deploy' was not loaded: its module has no create() function"]);
  });
});

test("a module that throws on import is refused with the error message", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-deploy", {
      [DEPLOY_TARGETS_FILENAME]: descriptorJson([{ id: "fixture-host", label: "Fixture Host", module: "targets/fixture.mjs" }]),
      "targets/fixture.mjs": 'throw new Error("boom at import");\n',
    });
    await markBundled(workspaceRoot, "fixture-deploy", digest);

    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.refusals, ["deploy target 'fixture-host' from 'fixture-deploy' was not loaded: boom at import"]);
  });
});

test("two bundled plugins declaring the same target id: neither is used", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const first = await installPackage("fixture-deploy", FIXTURE_FILES);
    const second = await installPackage("other-deploy", FIXTURE_FILES);
    await markBundled(workspaceRoot, "fixture-deploy", first);
    await markBundled(workspaceRoot, "other-deploy", second);

    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID });

    assert.equal(registry.get("fixture-host"), undefined);
    assert.deepEqual(registry.refusals, ["deploy target 'fixture-host' was not loaded: more than one plugin declares it ('fixture-deploy', 'other-deploy')"]);
  });
});
