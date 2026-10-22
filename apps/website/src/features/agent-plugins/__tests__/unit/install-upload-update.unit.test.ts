import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { AgentPluginHostIncompatibleError, AgentPluginUpdateError, isAgentPluginName, type AgentPluginMcpProvisioningPort } from "@jini-ai/agent-plugins/lifecycle";
import { installUploadedAgentPlugin, previewUploadedAgentPlugin } from "../../install-upload.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { createTovuAgentPluginLifecycle } from "../../lifecycle.js";
import { buildZipFixture } from "../fixtures/build-zip.js";
import { forceRemove } from "../fixtures/force-remove.js";
import { agentPluginActivations } from "../../activation-effects.js";

/**
 * @file `installUploadedAgentPlugin({ update })` — the explicit Agent Plugin update — against real
 * zips and a temp agent-plugins root: the candidate replaces the installed revision and keeps its
 * enabled state and memory; the settings snapshot owner and MCP effects are the host's; a changed,
 * bundled, downgraded or different package is refused before anything moves; the boot recovery the
 * lifecycle owner exposes is reachable through Tovu's binding.
 */

const WORKSPACE = "workspace-local";
const PLUGIN = "notes";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
type Layout = ReturnType<typeof resolveAgentPluginLayout>;

function manifest(name: string, version: string, tovu: Record<string, unknown> = {}): string {
  return JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name, version, extensions: { tovu } });
}

function packageZip(version: string, options: { name?: string; tovu?: Record<string, unknown> } = {}): Promise<Buffer> {
  const name = options.name ?? PLUGIN;
  return buildZipFixture([
    { path: "plugin.json", content: manifest(name, version, options.tovu) },
    { path: `skills/${name}/SKILL.md`, content: `---\nname: ${name}\ndescription: Notes ${version}.\n---\nBody ${version}` },
  ]);
}

async function withLayout<T>(fn: (layout: Layout) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-install-update-test-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn(resolveAgentPluginLayout());
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

async function installFirst(layout: Layout, archive: Buffer) {
  return (await installUploadedAgentPlugin({ archive, expectedSha256: sha(archive), workspaceId: WORKSPACE, actor: "owner" }, { layout })).plugin;
}

async function setEnabled(layout: Layout, enabled: boolean, origin?: "bundled" | "operator-installed") {
  await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: layout.forWorkspace(WORKSPACE).root, pluginId: PLUGIN, enabled, actor: "owner" }, origin ? { origin } : {});
}

function recordingMcp() {
  const calls: string[] = [];
  const port: AgentPluginMcpProvisioningPort = {
    provision: async ({ installed }) => void calls.push(`provision:${installed.pluginId}:${installed.version}`),
    notifyRosterChanged: async () => void calls.push("notify"),
    setEnabled: async () => { throw new Error("unused"); },
    remove: async () => { throw new Error("unused"); },
  };
  return { calls, port };
}

function recordingSnapshot() {
  const calls: { workspaceId: string; pluginId: string }[] = [];
  const snapshotSettings = async (scope: { workspaceId: string; pluginId: string }) => {
    calls.push(scope);
    return { keys: [{ key: "products", revision: 3 }] };
  };
  return { calls, snapshotSettings };
}

function update(layout: Layout, archive: Buffer, expectedOldDigest: string, optional: { snapshotSettings?: ReturnType<typeof recordingSnapshot>["snapshotSettings"]; mcp?: AgentPluginMcpProvisioningPort; pluginId?: string } = {}) {
  return installUploadedAgentPlugin(
    { archive, expectedSha256: sha(archive), workspaceId: WORKSPACE, actor: "owner", update: { pluginId: optional.pluginId ?? PLUGIN, expectedOldDigest } },
    { layout, ...(optional.snapshotSettings ? { snapshotSettings: optional.snapshotSettings } : {}), mcpProvisioning: optional.mcp ?? recordingMcp().port },
  );
}

async function liveDigests(layout: Layout): Promise<string[]> {
  return (await readdir(layout.forWorkspace(WORKSPACE).pluginPackagesDir({ pluginId: PLUGIN }))).filter((name) => /^[a-f0-9]{64}$/.test(name));
}

async function readActivation(layout: Layout) {
  return JSON.parse(await readFile(path.join(layout.forWorkspace(WORKSPACE).root, "activations.json"), "utf8")).plugins[PLUGIN];
}

test("update: an enabled plugin moves to the newer package, stays enabled, keeps memory, re-provisions MCP and snapshots settings", async () => {
  await withLayout(async (layout) => {
    const old = await installFirst(layout, await packageZip("1.0.0"));
    await setEnabled(layout, true);
    const notes = layout.forWorkspace(WORKSPACE).pluginMemoryDir({ pluginId: PLUGIN, kind: "notes" });
    await mkdir(notes, { recursive: true });
    await writeFile(path.join(notes, "kept.md"), "remember me");
    const mcp = recordingMcp();
    const snapshot = recordingSnapshot();

    const result = await update(layout, await packageZip("1.1.0"), old.archiveDigest, { snapshotSettings: snapshot.snapshotSettings, mcp: mcp.port });

    assert.equal(result.alreadyInstalled, false);
    assert.equal(result.enabled, true);
    assert.equal(result.plugin.version, "1.1.0");
    assert.notEqual(result.plugin.archiveDigest, old.archiveDigest);
    assert.deepEqual(await liveDigests(layout), [result.plugin.archiveDigest]);
    assert.equal((await readActivation(layout)).enabled, true);
    assert.equal(await readFile(path.join(notes, "kept.md"), "utf8"), "remember me");
    assert.deepEqual(snapshot.calls, [{ workspaceId: WORKSPACE, pluginId: PLUGIN }]);
    assert.deepEqual(mcp.calls, ["provision:notes:1.1.0", "notify"]);
  });
});

test("update: a disabled plugin stays disabled after its update", async () => {
  await withLayout(async (layout) => {
    const old = await installFirst(layout, await packageZip("1.0.0"));
    const result = await update(layout, await packageZip("2.0.0"), old.archiveDigest, { snapshotSettings: recordingSnapshot().snapshotSettings });
    assert.equal(result.enabled, false);
    assert.equal((await readActivation(layout)).enabled, false);
  });
});

test("update: the same bytes are a no-op that changes nothing", async () => {
  await withLayout(async (layout) => {
    const archive = await packageZip("1.0.0");
    const old = await installFirst(layout, archive);
    const snapshot = recordingSnapshot();
    const result = await update(layout, archive, old.archiveDigest, { snapshotSettings: snapshot.snapshotSettings });
    assert.equal(result.alreadyInstalled, true);
    assert.equal(result.plugin.archiveDigest, old.archiveDigest);
    assert.deepEqual(snapshot.calls, []);
  });
});

test("update: a stale expectedOldDigest is PLUGIN_CHANGED and the installed revision stays", async () => {
  await withLayout(async (layout) => {
    const old = await installFirst(layout, await packageZip("1.0.0"));
    await assert.rejects(update(layout, await packageZip("1.1.0"), "f".repeat(64), { snapshotSettings: recordingSnapshot().snapshotSettings }),
      (error: unknown) => error instanceof AgentPluginUpdateError && error.code === "PLUGIN_CHANGED");
    assert.deepEqual(await liveDigests(layout), [old.archiveDigest]);
  });
});

test("update: a downgrade is refused and the installed revision stays", async () => {
  await withLayout(async (layout) => {
    const old = await installFirst(layout, await packageZip("2.0.0"));
    await assert.rejects(update(layout, await packageZip("1.0.0"), old.archiveDigest, { snapshotSettings: recordingSnapshot().snapshotSettings }),
      (error: unknown) => error instanceof AgentPluginUpdateError && error.code === "PLUGIN_DOWNGRADE_REFUSED");
    assert.deepEqual(await liveDigests(layout), [old.archiveDigest]);
  });
});

test("update: a bundled plugin is refused (PLUGIN_BUNDLED) and its state is untouched", async () => {
  await withLayout(async (layout) => {
    const old = await installFirst(layout, await packageZip("1.0.0"));
    await setEnabled(layout, true, "bundled");
    const before = await readActivation(layout);
    await assert.rejects(update(layout, await packageZip("1.1.0"), old.archiveDigest, { snapshotSettings: recordingSnapshot().snapshotSettings }),
      (error: unknown) => error instanceof AgentPluginUpdateError && error.code === "PLUGIN_BUNDLED");
    assert.deepEqual(await readActivation(layout), before);
    assert.deepEqual(await liveDigests(layout), [old.archiveDigest]);
  });
});

test("update: an enabled plugin cannot move to a package this host cannot run", async () => {
  await withLayout(async (layout) => {
    const old = await installFirst(layout, await packageZip("1.0.0"));
    await setEnabled(layout, true);
    await assert.rejects(update(layout, await packageZip("1.1.0", { tovu: { hostRange: ">=99" } }), old.archiveDigest, { snapshotSettings: recordingSnapshot().snapshotSettings }),
      (error: unknown) => error instanceof AgentPluginHostIncompatibleError && error.code === "PLUGIN_HOST_INCOMPATIBLE");
    assert.deepEqual(await liveDigests(layout), [old.archiveDigest]);
  });
});

test("update: another plugin's package is PLUGIN_ID_MISMATCH before any settings are snapshotted", async () => {
  await withLayout(async (layout) => {
    const old = await installFirst(layout, await packageZip("1.0.0"));
    const snapshot = recordingSnapshot();
    await assert.rejects(update(layout, await packageZip("1.1.0", { name: "other" }), old.archiveDigest, { snapshotSettings: snapshot.snapshotSettings }),
      (error: unknown) => error instanceof AgentPluginUpdateError && error.code === "PLUGIN_ID_MISMATCH");
    assert.deepEqual(snapshot.calls, []);
    assert.deepEqual(await liveDigests(layout), [old.archiveDigest]);
  });
});

test("update: a host that did not bind the settings snapshot owner refuses with a wiring error, changing nothing", async () => {
  await withLayout(async (layout) => {
    const old = await installFirst(layout, await packageZip("1.0.0"));
    await assert.rejects(update(layout, await packageZip("1.1.0"), old.archiveDigest),
      (error: unknown) => !(error instanceof AgentPluginUpdateError) && /did not bind the plugin settings snapshot owner/.test((error as Error).message));
    assert.deepEqual(await liveDigests(layout), [old.archiveDigest]);
  });
});

test("update: runs under the plugin host's identity admission when one is bound", async () => {
  await withLayout(async (layout) => {
    const old = await installFirst(layout, await packageZip("1.0.0"));
    const admitted: { id: string; localId: string; family: string }[] = [];
    const archive = await packageZip("1.1.0");
    const result = await installUploadedAgentPlugin(
      { archive, expectedSha256: sha(archive), workspaceId: WORKSPACE, actor: "owner", update: { pluginId: PLUGIN, expectedOldDigest: old.archiveDigest } },
      { layout, snapshotSettings: recordingSnapshot().snapshotSettings, mcpProvisioning: recordingMcp().port,
        pluginHost: { withInstallIdentity: async ({ candidate, run }: { candidate: { id: string; localId: string; family: string }; run: () => Promise<unknown> }) => { admitted.push(candidate); return run(); } } as never },
    );
    assert.equal(result.plugin.version, "1.1.0");
    assert.equal(admitted.length, 1);
    assert.equal(admitted[0]!.localId, PLUGIN);
    assert.equal(admitted[0]!.family, "agent-plugin");
  });
});

test("replace (install path): a downgrade is refused too, and the installed revision stays", async () => {
  await withLayout(async (layout) => {
    const old = await installFirst(layout, await packageZip("2.0.0"));
    const archive = await packageZip("1.0.0");
    await assert.rejects(installUploadedAgentPlugin({ archive, expectedSha256: sha(archive), workspaceId: WORKSPACE, actor: "owner", replace: true }, { layout }),
      (error: unknown) => error instanceof AgentPluginUpdateError && error.code === "PLUGIN_DOWNGRADE_REFUSED");
    assert.deepEqual(await liveDigests(layout), [old.archiveDigest]);
  });
});

test("replace (preview): a downgrade is refused before the operator is offered the install", async () => {
  await withLayout(async (layout) => {
    const old = await installFirst(layout, await packageZip("2.0.0"));
    const archive = await packageZip("1.0.0");
    await assert.rejects(previewUploadedAgentPlugin({ archive, expectedSha256: sha(archive), workspaceId: WORKSPACE, actor: "owner", replace: true }, { layout }),
      (error: unknown) => error instanceof AgentPluginUpdateError && error.code === "PLUGIN_DOWNGRADE_REFUSED");
    assert.deepEqual(await liveDigests(layout), [old.archiveDigest]);
  });
});

test("replace (preview): a newer version previews with the version it upgrades from", async () => {
  await withLayout(async (layout) => {
    await installFirst(layout, await packageZip("1.0.0"));
    const archive = await packageZip("1.1.0");
    const preview = await previewUploadedAgentPlugin({ archive, expectedSha256: sha(archive), workspaceId: WORKSPACE, actor: "owner", replace: true }, { layout });
    assert.equal(preview.version, "1.1.0");
    assert.deepEqual(preview.upgradeFrom, ["1.0.0"]);
    assert.equal(preview.warning, "Trust: local / unverified publisher. Uploaded Agent Plugin code is not trusted to run. Skills can guide the assistant. It stays OFF until you enable it.");
  });
});

test("boot recovery: Tovu's lifecycle binding exposes the owner's update reconciliation, a no-op with nothing to recover", async () => {
  await withLayout(async (layout) => {
    await installFirst(layout, await packageZip("1.0.0"));
    const lifecycle = createTovuAgentPluginLifecycle({ layout });
    await lifecycle.reconcileAgentPluginUpdates({ workspaceId: WORKSPACE });
    assert.equal((await liveDigests(layout)).length, 1);
  });
});

test("isAgentPluginName (Jini's grammar, which the update route and tool check ids against): capped at 64 characters", () => {
  for (const id of ["notes", "acme-office", "a.b-c", "x1"]) assert.equal(isAgentPluginName({ value: id }), true, id);
  for (const id of ["", "Notes", "-notes", "notes-", "a..b", "../etc", "a/b", "a".repeat(65), 7, undefined]) assert.equal(isAgentPluginName({ value: id }), false, String(id));
});

test("install: an ordinary install or replacement is refused while an update journal is unfinished, so boot recovery never restores beside it", async () => {
  await withLayout(async (layout) => {
    const old = await installFirst(layout, await packageZip("1.0.0"));
    // What an incomplete rollback leaves: an unfinished journal naming the installed revision.
    const journal = { schemaVersion: 1, state: "published", transactionId: "tx-1", pluginId: PLUGIN, actor: "owner", enabled: false,
      fromDigest: old.archiveDigest, toDigest: "f".repeat(64), settingsSnapshot: { keys: [] }, startedAt: new Date(0).toISOString() };
    await writeFile(path.join(layout.forWorkspace(WORKSPACE).pluginRootDir({ pluginId: PLUGIN }), "update-journal.json"), JSON.stringify(journal));
    const replacement = await packageZip("1.1.0");
    await assert.rejects(installUploadedAgentPlugin({ archive: replacement, expectedSha256: sha(replacement), workspaceId: WORKSPACE, actor: "owner", replace: true }, { layout }),
      (error: unknown) => error instanceof AgentPluginUpdateError && error.code === "PLUGIN_UPDATE_PENDING");
    assert.deepEqual(await liveDigests(layout), [old.archiveDigest]);
  });
});

test("update: a host without MCP effects is refused as a wiring fault and the old package stays live and OFF", async () => {
  await withLayout(async (layout) => {
    const old = await installFirst(layout, await packageZip("1.0.0"));
    const next = await packageZip("1.1.0");
    await assert.rejects(() => installUploadedAgentPlugin(
      { archive: next, expectedSha256: sha(next), workspaceId: WORKSPACE, actor: "owner", update: { pluginId: PLUGIN, expectedOldDigest: old.archiveDigest } },
      { layout, snapshotSettings: recordingSnapshot().snapshotSettings },
    ), /does not provide network installation or MCP provisioning/);
    assert.deepEqual(await liveDigests(layout), [old.archiveDigest]);
    assert.equal((await readActivation(layout)).enabled, false, "a disabled plugin stays disabled");
  });
});
