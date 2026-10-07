import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { AgentPluginInstallError } from "../../install.js";
import { AgentPluginUploadError, installUploadedAgentPlugin, previewUploadedAgentPlugin } from "../../install-upload.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { buildZipFixture } from "../fixtures/build-zip.js";
import { forceRemove } from "../fixtures/force-remove.js";
import { agentPluginActivations } from "../../activation-effects.js";

/**
 * @file `installUploadedAgentPlugin()` against real zips (yazl) and the real yauzl reader, in a temp
 * agent-plugins root: wrapping-folder zips, the switched-off record, same-bytes no-op, id clash,
 * and refusals that leave nothing published.
 */

const WORKSPACE = "workspace-local";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const manifest = (name: string, version = "1.0.0") =>
  JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name, version });

async function withLayout<T>(fn: (layout: ReturnType<typeof resolveAgentPluginLayout>) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-install-upload-test-"));
  // The activation reader's filesystem effects resolve the plugins root from the process env, so
  // the env must point at the temp root too, not only the layout passed in.
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

function install(layout: ReturnType<typeof resolveAgentPluginLayout>, archive: Buffer, expectedSha256 = sha(archive)) {
  return installUploadedAgentPlugin({ archive, expectedSha256, workspaceId: WORKSPACE, actor: "owner" }, { layout });
}

test("a macOS-style folder zip installs from inside its one folder, switched off", async () => {
  await withLayout(async (layout) => {
    const archive = await buildZipFixture([
      { path: "notes/", content: "" },
      { path: "notes/plugin.json", content: manifest("notes") },
      { path: "notes/skills/notes/SKILL.md", content: "---\nname: notes\ndescription: Notes.\n---\nBody" },
      { path: "__MACOSX/notes/._plugin.json", content: "fork" },
    ]);

    const { plugin, alreadyInstalled } = await install(layout, archive);
    assert.equal(alreadyInstalled, false);
    assert.equal(plugin.pluginId, "notes");
    assert.deepEqual(plugin.files, ["plugin.json", "skills/notes/SKILL.md"]);
    const record = JSON.parse(await readFile(path.join(layout.forWorkspace(WORKSPACE).root, "activations.json"), "utf8")).plugins.notes;
    assert.equal(record?.enabled, false);
    assert.equal(record?.origin, "operator-installed");
    assert.equal(record?.updatedBy, "owner");

    const again = await install(layout, archive);
    assert.equal(again.alreadyInstalled, true);
    assert.equal(again.plugin.archiveDigest, plugin.archiveDigest);
  });
});

test("a different package under an installed id is refused, and the first stays the only one", async () => {
  await withLayout(async (layout) => {
    await install(layout, await buildZipFixture([{ path: "plugin.json", content: manifest("notes", "1.0.0") }]));
    await assert.rejects(
      install(layout, await buildZipFixture([{ path: "plugin.json", content: manifest("notes", "2.0.0") }])),
      (error: unknown) => error instanceof AgentPluginUploadError && error.code === "PLUGIN_ID_TAKEN",
    );
    const packagesDir = layout.forWorkspace(WORKSPACE).pluginPackagesDir({ pluginId: "notes" });
    assert.equal((await readdir(packagesDir)).length, 1);
  });
});

test("refusals: digest, missing or ambiguous manifest, unreadable bytes, symlinks", async () => {
  await withLayout(async (layout) => {
    const ok = await buildZipFixture([{ path: "plugin.json", content: manifest("notes") }]);
    const cases: Array<[Buffer, string | undefined, string]> = [
      [ok, "f".repeat(64), "DIGEST_MISMATCH"],
      [await buildZipFixture([{ path: "readme.md", content: "x" }]), undefined, "MANIFEST_MISSING"],
      [await buildZipFixture([{ path: "a/plugin.json", content: manifest("a") }, { path: "b/plugin.json", content: manifest("b") }]), undefined, "MANIFEST_MISSING"],
      [await buildZipFixture([{ path: "plugin.json", content: "{" }]), undefined, "MANIFEST_INVALID"],
      [await buildZipFixture([{ path: "plugin.json", content: manifest("Bad Name") }]), undefined, "MANIFEST_INVALID"],
      [Buffer.from("not a zip"), undefined, "ARCHIVE_UNREADABLE"],
      [await buildZipFixture([{ path: "plugin.json", content: manifest("linky") }, { path: "l", content: "/etc", mode: 0o120777 }]), undefined, "SYMLINK_ENTRY_REJECTED"],
    ];
    for (const [archive, digest, code] of cases) {
      await assert.rejects(install(layout, archive, digest), (error: unknown) =>
        (error instanceof AgentPluginInstallError || error instanceof AgentPluginUploadError) && error.code === code, code);
    }
    // Nothing was published by any refusal.
    const root = layout.forWorkspace(WORKSPACE).root;
    const entries = await readdir(root).catch(() => [] as string[]);
    assert.equal(entries.includes("linky") ? (await readdir(path.join(root, "linky"))).includes("package") : false, false);
  });
});


test("explicit replacement upgrades the same id, leaves one disabled version and preserves memory", async () => {
  await withLayout(async layout => {
    const old = await buildZipFixture([{ path: "plugin.json", content: manifest("notes", "1.0.0") }]);
    const next = await buildZipFixture([{ path: "plugin.json", content: manifest("notes", "2.0.0") }]);
    await install(layout, old);
    const memory = layout.forWorkspace(WORKSPACE).pluginMemoryDir({ pluginId: "notes", kind: "notes" });
    await mkdir(memory, { recursive: true });
    await writeFile(path.join(memory, "saved.md"), "keep this");
    const preview = await previewUploadedAgentPlugin({ archive: next, expectedSha256: sha(next), workspaceId: WORKSPACE, actor: "owner", replace: true }, { layout });
    assert.equal(preview.version, "2.0.0");
    assert.deepEqual(preview.upgradeFrom, ["1.0.0"]);
    assert.equal((await readdir(layout.forWorkspace(WORKSPACE).pluginPackagesDir({ pluginId: "notes" }))).length, 1, "preview never publishes");
    const result = await installUploadedAgentPlugin({ archive: next, expectedSha256: sha(next), workspaceId: WORKSPACE, actor: "owner", replace: true }, { layout });
    assert.equal(result.plugin.version, "2.0.0");
    assert.equal((await readdir(layout.forWorkspace(WORKSPACE).pluginPackagesDir({ pluginId: "notes" }))).length, 1);
    assert.equal(await readFile(path.join(memory, "saved.md"), "utf8"), "keep this");
    const record = JSON.parse(await readFile(path.join(layout.forWorkspace(WORKSPACE).root, "activations.json"), "utf8")).plugins.notes;
    assert.equal(record.enabled, false);
  });
});

test("invalid replacement archive leaves the old version and activation untouched", async () => {
  await withLayout(async layout => {
    const old = await buildZipFixture([{ path: "plugin.json", content: manifest("notes") }]);
    await install(layout, old);
    const root = layout.forWorkspace(WORKSPACE).root;
    const before = await readFile(path.join(root, "activations.json"), "utf8");
    const bad = await buildZipFixture([{ path: "plugin.json", content: manifest("notes", "2.0.0") }, { path: "link", content: "/etc", mode: 0o120777 }]);
    await assert.rejects(() => installUploadedAgentPlugin({ archive: bad, expectedSha256: sha(bad), workspaceId: WORKSPACE, actor: "owner", replace: true }, { layout }));
    assert.equal(await readFile(path.join(root, "activations.json"), "utf8"), before);
    assert.deepEqual(await readdir(layout.forWorkspace(WORKSPACE).pluginPackagesDir({ pluginId: "notes" })), [sha(old)]);
  });
});

test("preview refuses oversized or unverified bytes before opening the archive", async () => {
  let opened = 0;
  const archiveReader = { async *entries() { opened++; } };
  const base = { workspaceId: WORKSPACE, actor: "owner", expectedSha256: "f".repeat(64) };
  await assert.rejects(() => previewUploadedAgentPlugin({ ...base, archive: Buffer.from("bad digest") }, { archiveReader }), (e: unknown) => e instanceof AgentPluginInstallError && e.code === "DIGEST_MISMATCH");
  await assert.rejects(() => previewUploadedAgentPlugin({ ...base, archive: new Uint8Array(32 * 1024 * 1024 + 1) }, { archiveReader }), (e: unknown) => e instanceof AgentPluginInstallError && e.code === "ARCHIVE_TOO_LARGE");
  assert.equal(opened, 0);
});

test("replacement refuses enabled, bundled and undetermined activation without touching the old package", async () => {
  await withLayout(async layout => {
    const old = await buildZipFixture([{ path: "plugin.json", content: manifest("notes") }]);
    const next = await buildZipFixture([{ path: "plugin.json", content: manifest("notes", "2.0.0") }]);
    await install(layout, old);
    const workspaceRoot = layout.forWorkspace(WORKSPACE).root;
    const required = { archive: next, expectedSha256: sha(next), workspaceId: WORKSPACE, actor: "owner", replace: true };
    for (const [enabled, origin, code] of [[true, "operator-installed", "PLUGIN_ENABLED"], [false, "bundled", "PLUGIN_BUNDLED"]] as const) {
      await agentPluginActivations.setAgentPluginActivation({ workspaceRoot, pluginId: "notes", enabled, actor: "owner" }, { origin });
      const before = await readFile(path.join(workspaceRoot, "activations.json"), "utf8");
      await assert.rejects(() => installUploadedAgentPlugin(required, { layout }), (e: unknown) => e instanceof AgentPluginUploadError && e.code === code);
      assert.equal(await readFile(path.join(workspaceRoot, "activations.json"), "utf8"), before);
    }
    const activationPath = path.join(workspaceRoot, "activations.json");
    const malformed = JSON.parse(await readFile(activationPath, "utf8"));
    malformed.plugins.notes = { enabled: "unknown" };
    await writeFile(activationPath, JSON.stringify(malformed));
    await assert.rejects(() => installUploadedAgentPlugin(required, { layout }));
    assert.deepEqual(await readdir(layout.forWorkspace(WORKSPACE).pluginPackagesDir({ pluginId: "notes" })), [sha(old)]);
  });
});

test("publication failure restores the old digest and its exact disabled activation record", async () => {
  await withLayout(async layout => {
    const old = await buildZipFixture([{ path: "plugin.json", content: manifest("notes") }]);
    const next = await buildZipFixture([{ path: "plugin.json", content: manifest("notes", "2.0.0") }]);
    await install(layout, old);
    const workspace = layout.forWorkspace(WORKSPACE);
    const before = await readFile(path.join(workspace.root, "activations.json"), "utf8");
    // Publication consults the memory layout only after the old package has been staged aside.
    const failingLayout = { ...layout, forWorkspace: () => ({ ...workspace, pluginDataDir: () => { throw new Error("publication unavailable"); } }) };
    await assert.rejects(() => installUploadedAgentPlugin({ archive: next, expectedSha256: sha(next), workspaceId: WORKSPACE, actor: "other-owner", replace: true }, { layout: failingLayout }), /publication unavailable/);
    assert.deepEqual(await readdir(workspace.pluginPackagesDir({ pluginId: "notes" })), [sha(old)]);
    assert.equal(await readFile(path.join(workspace.root, "activations.json"), "utf8"), before);
  });
});
