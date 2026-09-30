import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { setAgentPluginActivation } from "../../activation.js";
import { recordBundledAgentPluginDigests } from "../../bundled-digests.js";
import { installAgentPlugin, type AgentPluginArchiveEntry } from "../../install.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { findTrustedPluginPackages, type TrustedPluginPackage } from "../../trusted-plugin-files.js";
import { forceRemove } from "../fixtures/force-remove.js";

/**
 * @file `trusted-plugin-files.ts` — the options the mail-adapter and source-control seams need from
 * the shared gate: plugin-id order, and hearing a switched-off plugin without trusting it. The gates
 * themselves are covered through each seam's own registry suite. Every case installs a REAL package.
 */

const WORKSPACE_ID = "workspace-local";
const SEAM_FILE = "tovu-fixture-seam.json";

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

async function installBundled(workspaceRoot: string, pluginId: string, enabled = true): Promise<void> {
  const entries = [
    fileEntry("plugin.json", JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0" })),
    fileEntry(SEAM_FILE, "{}"),
  ];
  const archive = new Uint8Array(Buffer.from(`${pluginId}:seam`));
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
  await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId, archiveDigest: installed.archiveDigest }] });
  await setAgentPluginActivation({ workspaceRoot, pluginId, enabled, actor: "test" }, { origin: "bundled" });
}

async function withWorkspace<T>(fn: (workspaceRoot: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-trusted-plugin-files-"));
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

function trustedIds(verdicts: Awaited<ReturnType<typeof findTrustedPluginPackages>>): string[] {
  return verdicts.map((verdict) => ("trusted" in verdict ? verdict.trusted.pluginId : verdict.refusal));
}

test("orderByPluginId returns trusted packages sorted by plugin id", async () => {
  await withWorkspace(async (workspaceRoot) => {
    for (const pluginId of ["zeta-seam", "alpha-seam", "mid-seam"]) await installBundled(workspaceRoot, pluginId);

    const verdicts = await findTrustedPluginPackages({ workspaceId: WORKSPACE_ID, filename: SEAM_FILE, contribution: "fixtures", requireActive: true, orderByPluginId: true });

    assert.deepEqual(trustedIds(verdicts), ["alpha-seam", "mid-seam", "zeta-seam"]);
  });
});

test("onInactive hears a switched-off plugin, which is neither trusted nor refused", async () => {
  await withWorkspace(async (workspaceRoot) => {
    await installBundled(workspaceRoot, "on-seam");
    await installBundled(workspaceRoot, "off-seam", false);
    const heard: TrustedPluginPackage[] = [];

    const verdicts = await findTrustedPluginPackages({
      workspaceId: WORKSPACE_ID,
      filename: SEAM_FILE,
      contribution: "fixtures",
      requireActive: true,
      onInactive: async (plugin) => {
        heard.push(plugin);
      },
    });

    assert.deepEqual(trustedIds(verdicts), ["on-seam"]);
    assert.deepEqual(heard.map((plugin) => plugin.pluginId), ["off-seam"]);
    assert.ok(heard[0]!.packageRoot.length > 0);
  });
});

test("without requireActive a switched-off plugin is trusted and onInactive is never called", async () => {
  await withWorkspace(async (workspaceRoot) => {
    await installBundled(workspaceRoot, "off-seam", false);
    let calls = 0;

    const verdicts = await findTrustedPluginPackages({
      workspaceId: WORKSPACE_ID,
      filename: SEAM_FILE,
      contribution: "fixtures",
      requireActive: false,
      onInactive: async () => {
        calls += 1;
      },
    });

    assert.deepEqual(trustedIds(verdicts), ["off-seam"]);
    assert.equal(calls, 0);
  });
});
