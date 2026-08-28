import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ACTIVATIONS_FILENAME,
  filterActiveAgentPlugins,
  isAgentPluginActive,
  normalizeActivations,
  readAgentPluginActivations,
  recordBundledAgentPluginIfAbsent,
  setAgentPluginActivation,
  type AgentPluginActivations,
} from "../../activation.js";

/**
 * @file `activation.ts` — the record that makes "bundled but inactive" enforceable.
 *
 * The default direction is the thing worth testing hardest. `isAgentPluginActive` treats an ABSENT
 * record as active (so an operator's own installs keep working across the upgrade that introduces
 * this file), and the seeder is what keeps that from becoming a loophole for bundled packages. Both
 * halves are asserted below; either one alone would be wrong.
 */

async function freshWorkspaceRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "tovu-activation-"));
}

test("a plugin with NO record is active — an operator's own install keeps working", () => {
  const activations: AgentPluginActivations = { schemaVersion: 1, plugins: {} };
  assert.equal(isAgentPluginActive(activations, "ui-ux-design"), true);
});

test("an explicit enabled:false record makes a plugin inactive", () => {
  const activations: AgentPluginActivations = {
    schemaVersion: 1,
    plugins: { "site-compliance": { enabled: false, origin: "bundled", updatedAt: "2026-08-26T00:00:00.000Z", updatedBy: "system:seed" } },
  };
  assert.equal(isAgentPluginActive(activations, "site-compliance"), false);
});

test("filterActiveAgentPlugins drops exactly the disabled ones, keeping order", () => {
  const activations: AgentPluginActivations = {
    schemaVersion: 1,
    plugins: {
      "site-compliance": { enabled: false, origin: "bundled", updatedAt: "t", updatedBy: "system:seed" },
      "turned-off": { enabled: false, origin: "operator-installed", updatedAt: "t", updatedBy: "op" },
    },
  };
  const items = [{ id: "a-plugin" }, { id: "site-compliance" }, { id: "turned-off" }, { id: "z-plugin" }];
  assert.deepEqual(
    filterActiveAgentPlugins(activations, items, (item) => item.id).map((item) => item.id),
    ["a-plugin", "z-plugin"],
  );
});

test("a workspace with no activations file reads as empty, not as an error", async () => {
  const root = await freshWorkspaceRoot();
  try {
    assert.deepEqual(await readAgentPluginActivations(root), { schemaVersion: 1, plugins: {} });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a corrupt activations file reads as empty rather than throwing — and re-seeding is what stops that being a loophole", async () => {
  const root = await freshWorkspaceRoot();
  try {
    await writeFile(path.join(root, ACTIVATIONS_FILENAME), "{ not json at all", "utf8");
    assert.deepEqual(await readAgentPluginActivations(root), { schemaVersion: 1, plugins: {} });

    const { recorded } = await recordBundledAgentPluginIfAbsent({ workspaceRoot: root, pluginId: "site-compliance" });
    assert.equal(recorded, true);
    assert.equal(isAgentPluginActive(await readAgentPluginActivations(root), "site-compliance"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("normalizeActivations drops malformed entries WITHOUT discarding the operator's good ones", () => {
  const normalized = normalizeActivations({
    schemaVersion: 1,
    plugins: {
      good: { enabled: true, origin: "operator-installed", updatedAt: "2026-01-01T00:00:00.000Z", updatedBy: "op" },
      "enabled-not-a-boolean": { enabled: "yes" },
      "not-an-object": 7,
      "Bad Id": { enabled: false },
      "another-good": { enabled: false },
    },
  });

  assert.deepEqual(Object.keys(normalized.plugins).sort(), ["another-good", "good"]);
  assert.equal(normalized.plugins.good?.enabled, true);
  // A record missing its optional fields still normalizes rather than being dropped — losing an
  // operator's disable decision because it lacked a timestamp would be the worst possible failure.
  assert.equal(normalized.plugins["another-good"]?.enabled, false);
  assert.equal(normalized.plugins["another-good"]?.origin, "operator-installed");
});

test("a wrong schemaVersion reads as empty rather than being interpreted under this version's rules", () => {
  assert.deepEqual(normalizeActivations({ schemaVersion: 2, plugins: { x: { enabled: false } } }), { schemaVersion: 1, plugins: {} });
});

test("setAgentPluginActivation round-trips and leaves no temp file behind", async () => {
  const root = await freshWorkspaceRoot();
  try {
    await setAgentPluginActivation({ workspaceRoot: root, pluginId: "site-compliance", enabled: true, actor: "cli:alice" });

    const activations = await readAgentPluginActivations(root);
    assert.equal(activations.plugins["site-compliance"]?.enabled, true);
    assert.equal(activations.plugins["site-compliance"]?.updatedBy, "cli:alice");

    assert.deepEqual(await readdir(root), [ACTIVATIONS_FILENAME]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("toggling preserves provenance — enabling a bundled plugin does not make it look operator-installed", async () => {
  const root = await freshWorkspaceRoot();
  try {
    await recordBundledAgentPluginIfAbsent({ workspaceRoot: root, pluginId: "site-compliance" });
    await setAgentPluginActivation({ workspaceRoot: root, pluginId: "site-compliance", enabled: true, actor: "cli:alice" });

    const activations = await readAgentPluginActivations(root);
    assert.equal(activations.plugins["site-compliance"]?.enabled, true);
    assert.equal(activations.plugins["site-compliance"]?.origin, "bundled");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recordBundledAgentPluginIfAbsent NEVER overwrites an existing decision — it runs on every boot", async () => {
  const root = await freshWorkspaceRoot();
  try {
    await recordBundledAgentPluginIfAbsent({ workspaceRoot: root, pluginId: "site-compliance" });
    await setAgentPluginActivation({ workspaceRoot: root, pluginId: "site-compliance", enabled: true, actor: "cli:alice" });

    for (let i = 0; i < 3; i += 1) {
      const { recorded } = await recordBundledAgentPluginIfAbsent({ workspaceRoot: root, pluginId: "site-compliance" });
      assert.equal(recorded, false);
    }

    const activations = await readAgentPluginActivations(root);
    assert.equal(activations.plugins["site-compliance"]?.enabled, true, "re-seeding must not re-disable what the operator enabled");
    assert.equal(activations.plugins["site-compliance"]?.updatedBy, "cli:alice");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a plugin id that is not valid Agent Plugins grammar is refused with an exact message", async () => {
  const root = await freshWorkspaceRoot();
  try {
    await assert.rejects(
      () => setAgentPluginActivation({ workspaceRoot: root, pluginId: "../escape", enabled: true, actor: "cli:mallory" }),
      { message: "agent-plugin activation: '../escape' is not a valid Agent Plugin id" },
    );
    await assert.rejects(
      () => recordBundledAgentPluginIfAbsent({ workspaceRoot: root, pluginId: "Not-Lowercase" }),
      { message: "agent-plugin activation: 'Not-Lowercase' is not a valid Agent Plugin id" },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the written file is human-readable JSON an operator can inspect", async () => {
  const root = await freshWorkspaceRoot();
  try {
    await recordBundledAgentPluginIfAbsent({ workspaceRoot: root, pluginId: "site-compliance" });
    const raw = await readFile(path.join(root, ACTIVATIONS_FILENAME), "utf8");
    assert.match(raw, /"schemaVersion": 1/);
    assert.match(raw, /"origin": "bundled"/);
    assert.match(raw, /"updatedBy": "system:seed"/);
    assert.ok(raw.endsWith("\n"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
