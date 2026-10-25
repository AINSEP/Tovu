import { anonymousMemberAccess } from "#src/assistant/site/__tests__/member-access.fixture";
import { testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";

// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import { agentPluginActivations } from "../../activation-effects.js";
const { readAgentPluginActivations, setAgentPluginActivation } = agentPluginActivations;
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";


import { currentToolIdFor } from "#src/assistant/content-read-tool";
import { realToolCatalog } from "#src/assistant/__tests__/real-tool-catalog.fixture";
import { TOVU_CAPABILITY_CARDS, resolveSiteGuideEngine } from "#src/server/runtime/composition/site-guide";
import { createSiteCapabilityRegistry } from "#src/assistant/site/capability-registry";
import { InMemoryPostRepo, listPublishedPosts } from "#src/features/post/index";
import { publicCapabilityCard } from "#src/assistant/site/capability-card";
import { resolveAgentPluginLayout } from "../../layout.js";
import { resolveAgentPluginRefs, listInstalledPlugins } from "../../lifecycle.js";
import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED, seedBundledAgentPlugins } from "../../lifecycle.js";
import { loadAgentPluginSearchCandidates, loadInstalledAgentPluginToolSources, registerInstalledAgentPluginTools } from "../../tool-registrations.js";

/**
 * @file The end-to-end proof that "bundled but inactive" is a real, enforced condition — not a
 * comment.
 *
 * Seeds the REAL `content/agent-plugins/site-compliance/` package (the bytes that ship with the
 * product, not a fixture) into a temp workspace, then asserts it is simultaneously:
 *
 * - **installed** — present on disk, indexable, so an operator can inspect and enable it; and
 * - **absent from both consumption surfaces** — tool registration and run-start prompt injection.
 *   (A third surface, `capability_search` discovery, was gated here too until that tool pair was
 *   removed 2026-08-26 — see `ADS-memory/knowledge/2026-08-26-removed-capability-search.md`.)
 *
 * Then flips one activation record and asserts both surfaces change together. If either surface
 * were left ungated, this test would still pass on the other one — which is precisely why both are
 * asserted here, in one place, rather than as two unrelated unit tests.
 */

const WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
const BUNDLED_SOURCE_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
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
  fn: (context: { readonly agentPluginsDir: string; readonly workspaceRoot: string; readonly seededIds: readonly string[] }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-bundled-inactive-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    const layout = resolveAgentPluginLayout();
    const result = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: BUNDLED_SOURCE_ROOT });

    const failures = result.outcomes.filter((outcome) => outcome.status === "failed");
    assert.deepEqual(failures, [], `bundled plugins must seed cleanly, got: ${JSON.stringify(failures)}`);

    return await fn({ agentPluginsDir: dir, workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root,
      seededIds: result.outcomes.filter(outcome => outcome.status === "seeded").map(outcome => outcome.pluginId) });
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

test("seeding installs the real bundled package and records it INACTIVE", async () => {
  await withSeededWorkspace(async ({ workspaceRoot }) => {
    const layout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID);
    const installed = await listInstalledPlugins(layout.root);

    const seeded = installed.find((plugin) => plugin.pluginId === PLUGIN_ID);
    assert.ok(seeded, "the bundled site-compliance package must actually be on disk after seeding");
    assert.ok(
      seeded.skills.some((skill) => skill.name === PLUGIN_ID),
      "the package must carry its own eponymous skill folder — run-start injection resolves skills/<pluginId>/SKILL.md",
    );

    const activations = await readAgentPluginActivations({ workspaceRoot: workspaceRoot });
    assert.equal(activations.plugins[PLUGIN_ID]?.enabled, false);
    assert.equal(activations.plugins[PLUGIN_ID]?.origin, "bundled");
    assert.equal(activations.plugins[PLUGIN_ID]?.updatedBy, "system:seed");
  });
});

/** Seeded enabled, sorted; hosting plugins are opt-in (owner, 2026-10-22). */
const SEEDED_ENABLED = ["github", "how-tovu-works", "site-import", "tovu-theme", "ui-ux-design"];

// Owner decision 2026-09-13: the admin lists every installed plugin, switched off or not. That
// listing (`AGENT_PLUGINS_LIST` reads `loadAgentPluginSearchCandidates`) must not open either gate.
test("every bundled plugin not seeded enabled is listed as switched off yet gets no tool and no prompt injection", async () => {
  await withSeededWorkspace(async ({ seededIds }) => {
    const layout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID);
    const bundledIds = [...new Set((await listInstalledPlugins(layout.root)).map((plugin) => plugin.pluginId))].filter(
      (pluginId) => !BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has(pluginId),
    );
    assert.deepEqual([...BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED].sort(), SEEDED_ENABLED);
    // The lifecycle owns bundle discovery; every seeded opt-in package must be installed and gated.
    // Keep provider inventory out of this generic seam, including when the shipped bundle grows.
    const expectedInactive = seededIds.filter(pluginId => !BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has(pluginId));
    assert.ok(expectedInactive.length > 0, "the real bundle must exercise inactive gating");
    assert.deepEqual([...bundledIds].sort(), expectedInactive.sort());

    const listed = await loadAgentPluginSearchCandidates(testSiteLayoutContext({ workspaceId: WORKSPACE_ID }));
    const sources = await loadInstalledAgentPluginToolSources(testSiteLayoutContext({ workspaceId: WORKSPACE_ID }));
    // tovu-theme (2026-10-08): site-import delegates its theme step to it, so both seed enabled.
    for (const pluginId of SEEDED_ENABLED) {
      assert.equal(listed.find(candidate => candidate.pluginId === pluginId)?.enabled, true, `${pluginId}: seeded enabled`);
      assert.ok(sources.some(source => source.pluginId === pluginId), `${pluginId}: tool gate open`);
      const injected = await resolveAgentPluginRefs([pluginId], layout);
      assert.ok(injected.ok && injected.promptPrefix.length > 0, `${pluginId}: prompt gate open`);
    }
    for (const pluginId of bundledIds) {
      assert.equal(listed.find((candidate) => candidate.pluginId === pluginId)?.enabled, false, `${pluginId}: listed, switched off`);
      assert.deepEqual(sources.filter((source) => source.pluginId === pluginId), [], `${pluginId}: no agent_plugin_* tool`);
      const injected = await resolveAgentPluginRefs([pluginId], layout);
      assert.ok(injected.ok === false && injected.reason.includes("is not enabled"), `${pluginId}: never reaches the prompt`);
    }
  });
});

test("GATE 1 (tool registration): an inactive bundled plugin gets no agent_plugin_* tool", async () => {
  await withSeededWorkspace(async () => {
    const sources = await loadInstalledAgentPluginToolSources(testSiteLayoutContext({ workspaceId: WORKSPACE_ID }));
    assert.deepEqual(sources.filter((source) => source.pluginId === PLUGIN_ID), []);
  });
});

test("GATE 2 (run-start injection): pinning an inactive plugin fails with 'not enabled', NOT 'not installed'", async () => {
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

test("enabling the plugin opens both gates together", async () => {
  await withSeededWorkspace(async ({ workspaceRoot }) => {
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: true, actor: "test:operator" });

    const sources = await loadInstalledAgentPluginToolSources(testSiteLayoutContext({ workspaceId: WORKSPACE_ID }));
    assert.ok(sources.some((source) => source.pluginId === PLUGIN_ID), "GATE 1 must open");

    const layout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID);
    const injected = await resolveAgentPluginRefs([PLUGIN_ID], layout);
    assert.equal(injected.ok, true, "GATE 2 must open");
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

    const sources = await loadInstalledAgentPluginToolSources(testSiteLayoutContext({ workspaceId: WORKSPACE_ID }));
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

    // Scoped to PLUGIN_ID, not a raw count of `packages/sha256/*`: that directory is shared by
    // EVERY bundled plugin in this workspace (everything under `content/agent-plugins/`), so a bare
    // digest count grows with the bundle and
    // re-breaks this assertion on the next addition. `listInstalledPlugins` already does the
    // digest -> pluginId walk (same one `test 1` above uses) — filtering its result to PLUGIN_ID is
    // what actually answers "did THIS plugin get a second digest published for it".
    const installedAfterReseed = await listInstalledPlugins(layout.forWorkspace(WORKSPACE_ID).root);
    const ownDigests = installedAfterReseed.filter((plugin) => plugin.pluginId === PLUGIN_ID);
    assert.equal(
      ownDigests.length,
      1,
      "content addressing must dedup a re-seed rather than publishing a second digest for this plugin",
    );

    const activations = await readAgentPluginActivations({ workspaceRoot: workspaceRoot });
    assert.equal(activations.plugins[PLUGIN_ID]?.enabled, true);
  });
});

test("every core, public and bundled guide tool pointer resolves to a currently registered tool", async () => {
  await withSeededWorkspace(async () => {
    const { registry } = await realToolCatalog();
    await registerInstalledAgentPluginTools(registry, { workspaceId: WORKSPACE_ID, agentPluginLayout: resolveAgentPluginLayout() });
    const ids = new Set(registry.list({}).map(tool => tool.id));
    const parsed = resolveSiteGuideEngine({}).parseGuideTopics({ raw: await readFile(path.join(BUNDLED_SOURCE_ROOT, "how-tovu-works", "tovu-site-guide.json"), "utf8") });
    if (!parsed.ok) throw new Error(parsed.reason);
    const cards = [...TOVU_CAPABILITY_CARDS, ...parsed.descriptors];
    const visitor = createSiteCapabilityRegistry({ workspaceId: WORKSPACE_ID, postRepo: new InMemoryPostRepo(), listPublishedPosts, memberAccess: anonymousMemberAccess() });
    const publicIds = new Set(visitor.schemas.map(tool => tool.name));
    let checked = 0;
    for (const [topics, registeredIds] of [[cards, ids], [[publicCapabilityCard], publicIds]] as const) {
      for (const card of topics) for (const pointer of card.pointers) {
        if (!("tool" in pointer) || !pointer.tool) continue;
        const currentId = currentToolIdFor(pointer.tool);
        assert.equal(pointer.tool, currentId, `${card.id}: author the current tool id`);
        assert.ok(registeredIds.has(currentId), `${card.id}: ${pointer.tool} must resolve to a registered tool`);
        checked++;
      }
    }
    assert.ok(checked >= 30, "all cards must be inspected, including bundled workflows");
  });
});
