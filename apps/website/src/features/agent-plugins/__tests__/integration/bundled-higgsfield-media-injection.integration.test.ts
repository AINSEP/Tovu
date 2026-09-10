import assert from "node:assert/strict";
import { chmod, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readAgentPluginActivations, setAgentPluginActivation } from "../../activation.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { resolveAgentPluginRefs, listInstalledPlugins } from "../../resolve-agent-plugin-refs.js";
import { seedBundledAgentPlugins } from "../../seed-bundled.js";

/**
 * @file The `higgsfield-media` bundled plugin seeds like the other two AND its content actually
 * reaches the model when an operator enables it.
 *
 * Deliberately NOT a third copy of `bundled-inactive-gating.integration.test.ts`. That file already
 * proves the GATING MECHANISM — inactive-by-default, both consumption surfaces closed, idempotent
 * re-seed — against `site-compliance`, and the mechanism is plugin-agnostic; re-asserting it per
 * package would be the "bare digest count" mistake that file's own comment warns about, one level
 * up.
 *
 * What is NOT covered there, and is the whole reason this file exists: that THIS package's specific,
 * hard-won claims survive the trip from `content/agent-plugins/higgsfield-media/skills/.../SKILL.md`
 * through packing, content-addressed install, and run-start injection into the actual prompt prefix.
 * `bundled-higgsfield-media-package.unit.test.ts` asserts those claims are IN the file on disk; this
 * asserts they are in what the model is handed. Those are different failures: a packer that filtered
 * markdown, a resolver that injected only the frontmatter, or an install that truncated would each
 * leave the on-disk assertions green while the agent received nothing usable.
 *
 * The claims chosen are the ones an agent cannot infer and gets wrong by default — see the package
 * test's header for why each one is load-bearing.
 */

const WORKSPACE_ID = "44444444-4444-4444-8444-444444444444";
const PLUGIN_ID = "higgsfield-media";
const BUNDLED_SOURCE_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");

/** `install.ts` freezes published trees to 0o555, so a plain `rm -rf` of a temp install root fails
 *  EACCES. Same wrinkle, same remedy as `bundled-inactive-gating.integration.test.ts`. */
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

async function withSeededWorkspace<T>(fn: (context: { readonly workspaceRoot: string }) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-higgsfield-media-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    const layout = resolveAgentPluginLayout();
    const result = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: BUNDLED_SOURCE_ROOT });

    const failures = result.outcomes.filter((outcome) => outcome.status === "failed");
    assert.deepEqual(failures, [], `bundled plugins must seed cleanly, got: ${JSON.stringify(failures)}`);

    return await fn({ workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root });
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

test("higgsfield-media seeds from the real bundled tree and is recorded INACTIVE, like every bundled plugin", async () => {
  await withSeededWorkspace(async ({ workspaceRoot }) => {
    const layout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID);
    const installed = await listInstalledPlugins(layout.packages);

    const seeded = installed.find((plugin) => plugin.pluginId === PLUGIN_ID);
    assert.ok(seeded, "the bundled higgsfield-media package must be on disk after seeding");
    assert.ok(
      seeded.skills.some((skill) => skill.name === PLUGIN_ID),
      "run-start injection resolves skills/<pluginId>/SKILL.md, so the skill folder must match the manifest name exactly",
    );

    const activations = await readAgentPluginActivations(workspaceRoot);
    assert.equal(activations.plugins[PLUGIN_ID]?.enabled, false, "a bundled plugin must ship OFF — enabling it is the operator's decision");
    assert.equal(activations.plugins[PLUGIN_ID]?.origin, "bundled");
    assert.equal(activations.plugins[PLUGIN_ID]?.updatedBy, "system:seed");
  });
});

test("enabling it injects the REAL SKILL.md, carrying every claim an agent cannot infer", async () => {
  await withSeededWorkspace(async ({ workspaceRoot }) => {
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: true, actor: "test:operator" });

    const layout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID);
    const injected = await resolveAgentPluginRefs([PLUGIN_ID], layout);
    assert.equal(injected.ok, true, "an enabled plugin must resolve for run-start injection");
    assert.ok(injected.ok);

    const prefix = injected.promptPrefix;

    // Each of these was established by driving the live integration on 2026-09-09. An injection path
    // that delivered only the frontmatter, or truncated the body, would still "work" without them —
    // and would hand the agent back exactly the ignorance this plugin was built to remove.
    const mustReachTheModel: readonly [string, string][] = [
      ["does not return an image", "the async trap — reporting success after generate_image is the headline failure"],
      ["job id", "what generate_image actually returns"],
      ["media_import_from_url", "the only call that lands the asset in Media"],
      ["remote-declares-not-read-only", "the exact refusal string, so the agent can recognise it rather than guess"],
      ["writeAllowedToolNames", "the second allowlist a federated write tool needs"],
      ["Requires basic plan or higher", "the plan gate's exact wording"],
      ["z_image", "the model verified to work when the defaults are gated"],
      ["Restart the assistant", "config is read at daemon start; a saved grant needs the restart"],
    ];

    for (const [claim, why] of mustReachTheModel) {
      assert.ok(prefix.includes(claim), `the injected prompt must carry ${JSON.stringify(claim)} — ${why}`);
    }
  });
});

test("disabling it again withholds the SKILL.md entirely", async () => {
  await withSeededWorkspace(async ({ workspaceRoot }) => {
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: true, actor: "test:operator" });
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: false, actor: "test:operator" });

    const layout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID);
    const injected = await resolveAgentPluginRefs([PLUGIN_ID], layout);

    assert.equal(injected.ok, false, "a disabled plugin must not inject");
    assert.ok(
      injected.ok === false && injected.reason.includes("is not enabled"),
      "the bytes ARE installed — the refusal must say 'not enabled', never 'not installed'",
    );
  });
});
