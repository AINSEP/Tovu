import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "../fixtures/force-remove.js";
import { readAgentPluginActivations, recordBundledAgentPluginIfAbsent, setAgentPluginActivation } from "../../activation.js";
import { installAgentPlugin, type AgentPluginArchiveEntry, type AgentPluginArchiveReaderPort } from "../../install.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import {
  AgentPluginNotFoundError,
  AgentPluginNotUninstallableError,
  previewAgentPluginUninstall,
  uninstallAgentPlugin,
} from "../../uninstall.js";

/**
 * @file `uninstallAgentPlugin()` — the RED/GREEN proof this domain's uninstall was missing entirely
 * before this dispatch. No `origin: "operator-installed"` Agent Plugin can exist through any real
 * flow yet (there is no install-from-marketplace surface, only `install-from-url.ts`'s dev/admin
 * path) — every test below that needs one CONSTRUCTS it directly via `installAgentPlugin` plus
 * `setAgentPluginActivation`, exactly the way a real operator install would leave the workspace.
 */

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

function reader(entries: readonly AgentPluginArchiveEntry[]): AgentPluginArchiveReaderPort {
  return {
    async *entries() {
      yield* entries;
    },
  };
}

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
  } as AgentPluginArchiveEntry;
}

async function freshLayout() {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-uninstall-test-"));
  const instanceLayout = resolveAgentPluginLayout({ cwd, env: {} });
  return { cwd, instanceLayout, workspaceLayout: instanceLayout.forWorkspace(WORKSPACE_ID) };
}

/** Installs a real package via `installAgentPlugin` — the same mechanism a real install-from-url
 *  flow uses — so every "operator-installed" test below exercises the real on-disk shape, not a
 *  hand-rolled fixture. */
async function installTestPackage(instanceLayout: ReturnType<typeof resolveAgentPluginLayout>, pluginId: string, archiveLabel: string) {
  const manifest = JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0" });
  const archive = new Uint8Array(Buffer.from(archiveLabel));
  const digest = createHash("sha256").update(archive).digest("hex");
  return installAgentPlugin({
    archive,
    expectedSha256: digest,
    archiveReader: reader([fileEntry("plugin.json", manifest), fileEntry(`skills/${pluginId}/SKILL.md`, `# ${pluginId}\n`)]),
    layout: instanceLayout,
    workspaceId: WORKSPACE_ID,
  });
}

test("refuses an unknown plugin id with AgentPluginNotFoundError", async () => {
  const { cwd, instanceLayout } = await freshLayout();
  try {
    await assert.rejects(
      () => uninstallAgentPlugin({ layout: instanceLayout, workspaceId: WORKSPACE_ID, pluginId: "does-not-exist" }),
      (error: unknown) => error instanceof AgentPluginNotFoundError && /not installed/.test(error.message),
    );
  } finally {
    await forceRemove(cwd);
  }
});

test("refuses a bundled plugin with AgentPluginNotUninstallableError, naming the disable alternative — and removes nothing", async () => {
  const { cwd, instanceLayout, workspaceLayout } = await freshLayout();
  try {
    const installed = await installTestPackage(instanceLayout, "site-compliance", "archive-bundled");
    await recordBundledAgentPluginIfAbsent({ workspaceRoot: workspaceLayout.root, pluginId: "site-compliance" });

    await assert.rejects(
      () => uninstallAgentPlugin({ layout: instanceLayout, workspaceId: WORKSPACE_ID, pluginId: "site-compliance" }),
      (error: unknown) =>
        error instanceof AgentPluginNotUninstallableError &&
        /bundled/i.test(error.message) &&
        // Since a1abe2bb the assistant CAN disable one itself — the refusal must say how, not send
        // the model to a human for something it can do.
        /plugins_set_enabled with family 'agent-plugin'/.test(error.message) &&
        !/no assistant tool wraps/.test(error.message),
    );

    const stillPublished = await stat(installed.packageRoot);
    assert.equal(stillPublished.isDirectory(), true, "a refused uninstall must not touch the on-disk package");

    const activations = await readAgentPluginActivations(workspaceLayout.root);
    assert.equal(activations.plugins["site-compliance"]?.origin, "bundled", "the bundled activation record must survive a refusal");
  } finally {
    await forceRemove(cwd);
  }
});

test("uninstalls an operator-installed plugin: removes the package root and deletes (not tombstones) its activation record", async () => {
  const { cwd, instanceLayout, workspaceLayout } = await freshLayout();
  try {
    const installed = await installTestPackage(instanceLayout, "my-custom-plugin", "archive-operator-installed");
    // A real operator install leaves NO activation record until explicitly toggled — but this test
    // also proves the delete-not-tombstone decision, so it toggles first (mirroring
    // AGENT_PLUGIN_SET_ENABLED) to prove an EXISTING operator-installed record is fully removed, not
    // merely flipped.
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: "my-custom-plugin", enabled: false, actor: "op-1" });

    const result = await uninstallAgentPlugin({ layout: instanceLayout, workspaceId: WORKSPACE_ID, pluginId: "my-custom-plugin" });

    assert.equal(result.pluginId, "my-custom-plugin");
    assert.deepEqual(result.removedDigests, [installed.archiveDigest]);

    await assert.rejects(() => stat(installed.packageRoot), "the package root must actually be gone from disk");
    assert.deepEqual(await readdir(workspaceLayout.packages).catch(() => []), [], "no digest directory for this plugin may remain");

    const activations = await readAgentPluginActivations(workspaceLayout.root);
    assert.equal(
      "my-custom-plugin" in activations.plugins,
      false,
      "the activation record must be DELETED, not left behind as a disabled tombstone — a future " +
        "reinstall of the same id must start fresh (active by default), not inherit a stale disable",
    );
  } finally {
    await forceRemove(cwd);
  }
});

test("uninstalls an operator-installed plugin that was NEVER explicitly toggled (no activation record at all)", async () => {
  const { cwd, instanceLayout, workspaceLayout } = await freshLayout();
  try {
    const installed = await installTestPackage(instanceLayout, "never-toggled", "archive-never-toggled");

    const activationsBefore = await readAgentPluginActivations(workspaceLayout.root);
    assert.equal("never-toggled" in activationsBefore.plugins, false, "sanity: a fresh install has no activation record yet");

    const result = await uninstallAgentPlugin({ layout: instanceLayout, workspaceId: WORKSPACE_ID, pluginId: "never-toggled" });
    assert.deepEqual(result.removedDigests, [installed.archiveDigest]);
    await assert.rejects(() => stat(installed.packageRoot));
  } finally {
    await forceRemove(cwd);
  }
});

test("removing a frozen (read-only, 0o555) published package root does not throw EACCES", async () => {
  const { cwd, instanceLayout, workspaceLayout } = await freshLayout();
  try {
    const installed = await installTestPackage(instanceLayout, "frozen-check", "archive-frozen-check");
    const rootMode = (await stat(installed.packageRoot)).mode & 0o777;
    assert.equal(rootMode, 0o555, "sanity: install.ts really does freeze the package root read-only");

    await uninstallAgentPlugin({ layout: instanceLayout, workspaceId: WORKSPACE_ID, pluginId: "frozen-check" });
    await assert.rejects(() => stat(installed.packageRoot));
  } finally {
    await forceRemove(cwd);
  }
});

test("TENANT ISOLATION: uninstalling in one workspace never touches another workspace's own copy of the same plugin id", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-uninstall-test-"));
  try {
    const instanceLayout = resolveAgentPluginLayout({ cwd, env: {} });
    const otherWorkspaceId = "22222222-2222-4222-8222-222222222222";

    const manifest = JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "shared-name", version: "1.0.0" });
    const archive = new Uint8Array(Buffer.from("archive-shared-across-two-workspaces"));
    const digest = createHash("sha256").update(archive).digest("hex");
    const archiveReader = reader([fileEntry("plugin.json", manifest), fileEntry("skills/shared-name/SKILL.md", "# Shared\n")]);

    const installedMine = await installAgentPlugin({ archive, expectedSha256: digest, archiveReader, layout: instanceLayout, workspaceId: WORKSPACE_ID });
    const installedOther = await installAgentPlugin({ archive, expectedSha256: digest, archiveReader, layout: instanceLayout, workspaceId: otherWorkspaceId });

    await uninstallAgentPlugin({ layout: instanceLayout, workspaceId: WORKSPACE_ID, pluginId: "shared-name" });

    await assert.rejects(() => stat(installedMine.packageRoot));
    const otherStillThere = await stat(installedOther.packageRoot);
    assert.equal(otherStillThere.isDirectory(), true, "the other workspace's own copy must survive untouched");
  } finally {
    await forceRemove(cwd);
  }
});

test("previewAgentPluginUninstall names what would be removed — id, versions, digests — without removing anything or carrying a host path", async () => {
  const { cwd, instanceLayout, workspaceLayout } = await freshLayout();
  try {
    const installed = await installTestPackage(instanceLayout, "preview-me", "archive-preview");
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: "preview-me", enabled: true, actor: "op-1" });

    const preview = await previewAgentPluginUninstall({ layout: instanceLayout, workspaceId: WORKSPACE_ID, pluginId: "preview-me" });

    assert.deepEqual(preview, { pluginId: "preview-me", versions: ["1.0.0"], archiveDigests: [installed.archiveDigest] });
    assert.equal(JSON.stringify(preview).includes(cwd), false, "the preview feeds a confirmation dialog; it must carry no host path");
    assert.equal((await stat(installed.packageRoot)).isDirectory(), true, "a preview must not remove the package");
    const activations = await readAgentPluginActivations(workspaceLayout.root);
    assert.equal(activations.plugins["preview-me"]?.enabled, true, "a preview must not touch the activation record");
  } finally {
    await forceRemove(cwd);
  }
});

test("previewAgentPluginUninstall refuses exactly what uninstallAgentPlugin refuses — an unknown id and a bundled plugin", async () => {
  const { cwd, instanceLayout, workspaceLayout } = await freshLayout();
  try {
    await installTestPackage(instanceLayout, "site-compliance", "archive-preview-bundled");
    await recordBundledAgentPluginIfAbsent({ workspaceRoot: workspaceLayout.root, pluginId: "site-compliance" });

    await assert.rejects(
      () => previewAgentPluginUninstall({ layout: instanceLayout, workspaceId: WORKSPACE_ID, pluginId: "does-not-exist" }),
      AgentPluginNotFoundError,
    );
    await assert.rejects(
      () => previewAgentPluginUninstall({ layout: instanceLayout, workspaceId: WORKSPACE_ID, pluginId: "site-compliance" }),
      AgentPluginNotUninstallableError,
    );
  } finally {
    await forceRemove(cwd);
  }
});
