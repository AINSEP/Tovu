import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { AgentPluginInstallError } from "../../install.js";
import { AgentPluginUploadError, installUploadedAgentPlugin } from "../../install-upload.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { buildZipFixture } from "../fixtures/build-zip.js";
import { forceRemove } from "../fixtures/force-remove.js";

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
