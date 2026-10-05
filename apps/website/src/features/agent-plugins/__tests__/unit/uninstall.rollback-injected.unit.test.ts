import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { mock } from "node:test";

import type { AgentPluginArchiveEntry, AgentPluginArchiveReaderPort } from "../../install.js";

/**
 * @file F0807 — `uninstallAgentPlugin()`'s rollback, proven with a deterministic activation-write
 * failure. `uninstall.unit.test.ts` forces the same failure with a 0o555 workspace root, which root
 * ignores, so that test skips as root (a CI container) and the rollback goes unchecked there. Here
 * the host activation binding's `deleteAgentPluginActivation` — the step that runs after every
 * package tree is staged aside — rejects on purpose; staging, restore and the disk stay real.
 *
 * Same `mock.module()` idiom as `activation-lock-busy.unit.test.ts`: the real binding is spread
 * through the mock, registered before `uninstall.js` is ever imported, which is imported once,
 * dynamically.
 */

const real = await import("../../activation-effects.js");
const injected = new Error("injected: activations.json could not be rewritten");
let failDelete = true;

mock.module("../../activation-effects.js", {
  namedExports: {
    ...real,
    agentPluginActivations: {
      ...real.agentPluginActivations,
      deleteAgentPluginActivation: async (input: Parameters<typeof real.agentPluginActivations.deleteAgentPluginActivation>[0]) => {
        if (failDelete) throw injected;
        return real.agentPluginActivations.deleteAgentPluginActivation(input);
      },
    },
  },
});

const { uninstallAgentPlugin } = await import("../../uninstall.js");
const { installAgentPlugin } = await import("../../install.js");
const { resolveAgentPluginLayout } = await import("../../layout.js");
const { forceRemove } = await import("../fixtures/force-remove.js");
const { readAgentPluginActivations, setAgentPluginActivation } = real.agentPluginActivations;

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

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

function reader(entries: readonly AgentPluginArchiveEntry[]): AgentPluginArchiveReaderPort {
  return {
    async *entries() {
      yield* entries;
    },
  };
}

async function installTestPackage(layout: ReturnType<typeof resolveAgentPluginLayout>, pluginId: string, archiveLabel: string) {
  const manifest = JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0" });
  const archive = new Uint8Array(Buffer.from(archiveLabel));
  return installAgentPlugin({
    archive,
    expectedSha256: createHash("sha256").update(archive).digest("hex"),
    archiveReader: reader([fileEntry("plugin.json", manifest), fileEntry(`skills/${pluginId}/SKILL.md`, `# ${pluginId}\n`)]),
    layout,
    workspaceId: WORKSPACE_ID,
  });
}

test("an activation-write failure after staging restores every package tree, frozen, and keeps the record (any uid)", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-uninstall-rollback-"));
  try {
    const layout = resolveAgentPluginLayout({ cwd, env: {} });
    const workspace = layout.forWorkspace(WORKSPACE_ID);
    const first = await installTestPackage(layout, "multi-digest", "archive-rollback-a");
    const second = await installTestPackage(layout, "multi-digest", "archive-rollback-b");
    await setAgentPluginActivation({ workspaceRoot: workspace.root, pluginId: "multi-digest", enabled: true, actor: "op-1" });

    failDelete = true;
    await assert.rejects(
      uninstallAgentPlugin({ layout, workspaceId: WORKSPACE_ID, pluginId: "multi-digest" }),
      (error: unknown) => error === injected,
    );

    for (const installed of [first, second]) {
      const info = await stat(installed.packageRoot);
      assert.equal(info.isDirectory(), true, `${installed.archiveDigest} must be back under its own name`);
      assert.equal(info.mode & 0o777, 0o555, "a restored tree must be frozen again, not left writable");
    }
    // Restored names only: no `.uninstalling-*` staging directory left behind.
    assert.deepEqual(
      (await readdir(workspace.pluginPackagesDir({ pluginId: "multi-digest" }))).sort(),
      [first.archiveDigest, second.archiveDigest].sort(),
    );
    const activations = await readAgentPluginActivations({ workspaceRoot: workspace.root });
    assert.equal(activations.plugins["multi-digest"]?.enabled, true);

    // The restored state is a real install: with the write working again, uninstall removes both.
    failDelete = false;
    const result = await uninstallAgentPlugin({ layout, workspaceId: WORKSPACE_ID, pluginId: "multi-digest" });
    assert.deepEqual([...result.removedDigests].sort(), [first.archiveDigest, second.archiveDigest].sort());
    await assert.rejects(stat(first.packageRoot), { code: "ENOENT" });
    await assert.rejects(stat(second.packageRoot), { code: "ENOENT" });
  } finally {
    failDelete = true;
    await forceRemove(cwd);
  }
});
