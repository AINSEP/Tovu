import assert from "node:assert/strict";
import { chmod, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readAgentPluginActivations, setAgentPluginActivation } from "../../activation.js";
import { createAgentPluginSkillsCapabilitySource } from "../../capability-source.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { resolveAgentPluginRefs, listInstalledPlugins } from "../../resolve-agent-plugin-refs.js";
import { seedBundledAgentPlugins } from "../../seed-bundled.js";
import { loadInstalledAgentPluginToolSources } from "../../tool-registrations.js";

/**
 * @file The end-to-end proof that "bundled but inactive" is a real, enforced condition — not a
 * comment.
 *
 * Seeds the REAL `src/agent-plugins/site-compliance/` package (the bytes that ship with the
 * product, not a fixture) into a temp workspace, then asserts it is simultaneously:
 *
 * - **installed** — present on disk, indexable, so an operator can inspect and enable it; and
 * - **absent from all three consumption surfaces** — `capability_search` discovery, tool
 *   registration, and run-start prompt injection.
 *
 * Then flips one activation record and asserts all three surfaces change together. If any single
 * surface were left ungated, this test would still pass on the other two — which is precisely why
 * all three are asserted here, in one place, rather than as three unrelated unit tests.
 */

const WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
const BUNDLED_SOURCE_ROOT = path.resolve(import.meta.dirname, "../../../../agent-plugins");
const PLUGIN_ID = "site-compliance";

/** `install.ts` freezes published trees to 0o555, so a plain `rm -rf` of a temp install root fails
 *  EACCES. Restores write permission on the way down first — the same wrinkle every other test in
 *  this feature that installs a real package has to handle. */
async function forceRemove(target: string): Promise<void> {
  try {
    const info = await stat(target);
    await chmod(target, 0o700);
    if (info.isDirectory()) {
      for (const entry of await readdir(target)) await forceRemove(path.join(target, entry));
    }
  } catch {
    return;
  }
  await rm(target, { recursive: true, force: true });
}

async function withSeededWorkspace<T>(
  fn: (context: { readonly agentPluginsDir: string; readonly workspaceRoot: string }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-bundled-inactive-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    const layout = resolveAgentPluginLayout();
    const result = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: BUNDLED_SOURCE_ROOT });

    const failures = result.outcomes.filter((outcome) => outcome.status === "failed");
    assert.deepEqual(failures, [], `bundled plugins must seed cleanly, got: ${JSON.stringify(failures)}`);

    return await fn({ agentPluginsDir: dir, workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root });
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

test("seeding installs the real bundled package and records it INACTIVE", async () => {
  await withSeededWorkspace(async ({ workspaceRoot }) => {
    const layout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID);
    const installed = await listInstalledPlugins(layout.packages);

    const seeded = installed.find((plugin) => plugin.pluginId === PLUGIN_ID);
    assert.ok(seeded, "the bundled site-compliance package must actually be on disk after seeding");
    assert.ok(
      seeded.skills.some((skill) => skill.name === PLUGIN_ID),
      "the package must carry its own eponymous skill folder — run-start injection resolves skills/<pluginId>/SKILL.md",
    );

    const activations = await readAgentPluginActivations(workspaceRoot);
    assert.equal(activations.plugins[PLUGIN_ID]?.enabled, false);
    assert.equal(activations.plugins[PLUGIN_ID]?.origin, "bundled");
    assert.equal(activations.plugins[PLUGIN_ID]?.updatedBy, "system:seed");
  });
});

test("GATE 1 (discovery): an inactive bundled plugin produces no capability card", async () => {
  await withSeededWorkspace(async () => {
    const cards = await createAgentPluginSkillsCapabilitySource().list({ workspaceId: WORKSPACE_ID });
    assert.deepEqual(
      cards.filter((card) => card.pluginId === PLUGIN_ID),
      [],
      "capability_search must not be able to find a plugin nobody has enabled",
    );
  });
});

test("GATE 2 (tool registration): an inactive bundled plugin gets no agent_plugin_* tool", async () => {
  await withSeededWorkspace(async () => {
    const sources = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_ID });
    assert.deepEqual(sources.filter((source) => source.pluginId === PLUGIN_ID), []);
  });
});

test("GATE 3 (run-start injection): pinning an inactive plugin fails with 'not enabled', NOT 'not installed'", async () => {
  await withSeededWorkspace(async () => {
    const layout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID);
    const result = await resolveAgentPluginRefs([PLUGIN_ID], layout);

    assert.equal(result.ok, false);
    assert.ok(result.ok === false && result.reason.includes("is not enabled"));
    assert.ok(
      result.ok === false && !result.reason.includes("not installed"),
      "the bytes ARE installed — telling an operator to install something already present sends them the wrong way",
    );
  });
});

test("enabling the plugin opens all three gates together", async () => {
  await withSeededWorkspace(async ({ workspaceRoot }) => {
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: true, actor: "test:operator" });

    const cards = await createAgentPluginSkillsCapabilitySource().list({ workspaceId: WORKSPACE_ID });
    assert.ok(cards.some((card) => card.pluginId === PLUGIN_ID && card.skillName === PLUGIN_ID), "GATE 1 must open");

    const sources = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_ID });
    assert.ok(sources.some((source) => source.pluginId === PLUGIN_ID), "GATE 2 must open");

    const layout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID);
    const injected = await resolveAgentPluginRefs([PLUGIN_ID], layout);
    assert.equal(injected.ok, true, "GATE 3 must open");
    assert.ok(injected.ok && injected.promptPrefix.includes("Site Compliance"));
    assert.ok(
      injected.ok && injected.promptPrefix.includes("Output Contract"),
      "what reaches the agent must be the real SKILL.md, including its non-negotiable output contract",
    );
  });
});

test("disabling it again closes them", async () => {
  await withSeededWorkspace(async ({ workspaceRoot }) => {
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: true, actor: "test:operator" });
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: false, actor: "test:operator" });

    const cards = await createAgentPluginSkillsCapabilitySource().list({ workspaceId: WORKSPACE_ID });
    assert.deepEqual(cards.filter((card) => card.pluginId === PLUGIN_ID), []);

    const sources = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_ID });
    assert.deepEqual(sources.filter((source) => source.pluginId === PLUGIN_ID), []);
  });
});

test("re-seeding is idempotent — same digest, no duplicate install, decision preserved", async () => {
  await withSeededWorkspace(async ({ workspaceRoot }) => {
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: true, actor: "test:operator" });

    const layout = resolveAgentPluginLayout();
    const second = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: BUNDLED_SOURCE_ROOT });

    const outcome = second.outcomes.find((entry) => entry.pluginId === PLUGIN_ID);
    assert.ok(outcome && outcome.status === "seeded");
    assert.equal(outcome.activationRecorded, false, "a boot after the operator enabled it must not rewrite their decision");

    const digests = await readdir(layout.forWorkspace(WORKSPACE_ID).packages);
    assert.equal(digests.length, 1, "content addressing must dedup a re-seed rather than publishing a second digest");

    const activations = await readAgentPluginActivations(workspaceRoot);
    assert.equal(activations.plugins[PLUGIN_ID]?.enabled, true);
  });
});
