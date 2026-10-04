import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPluginMemory, migratePluginLayout } from "@jini-ai/agent-plugins/persistent-state";
import { withFileLock } from "@jini-ai/platform/fs/file-lock";
import { installAgentPlugin, indexInstalledRoot, type AgentPluginArchiveReaderPort } from "../../install.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { pluginMemory, appendPluginNotes, migrateAgentPluginLayout, migrateSiteAgentPluginLayouts } from "../../memory.js";
import { listInstalledPlugins, resolveAgentPluginRefs } from "../../resolve-agent-plugin-refs.js";
import { previewAgentPluginUninstall, uninstallAgentPlugin } from "../../uninstall.js";
import { assertContainedOnDisk } from "../../package-paths.js";
import { buildPluginMemoryRegistrations } from "../../memory-tools.js";
import { forceRemove } from "../fixtures/force-remove.js";
import { seedBundledAgentPlugins } from "../../seed-bundled.js";
import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";

const workspaceId = "workspace-local";
async function fixture() {
  const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "plugin-layout-b-")));
  const layout = resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: temporary } });
  const workspace = layout.forWorkspace(workspaceId);
  const memory = (pluginId = "example") => pluginMemory({ workspaceId, pluginId }, { layout });
  const install = async (pluginId = "example", version = "1.0.0", seedText?: string) => {
    const archive = Buffer.from(`${pluginId}:${version}:${seedText ?? ""}`);
    const files: Record<string, string> = { "plugin.json": JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version,
      extensions: { "dev.tovu.memory": { usesMemory: true } } }),
      [`skills/${pluginId}/SKILL.md`]: `# ${pluginId}\nInstructions.`,
      "dev.tovu.memory/README.md": "Author guidance belongs in package docs, not learned facts.",
      ...(seedText ? { "dev.tovu.memory/notes-seed/unwanted.md": seedText,
        "dev.tovu.memory/learned-seed/unwanted.md": seedText } : {}),
    };
    const reader: AgentPluginArchiveReaderPort = { async *entries() {
      for (const [entryPath, text] of Object.entries(files)) yield { kind: "file", entryPath,
        async *openReadStream() { yield Buffer.from(text); } };
    } };
    return installAgentPlugin({ layout, workspaceId, archive, expectedSha256: createHash("sha256").update(archive).digest("hex"), archiveReader: reader });
  };
  return { temporary, layout, workspace, memory, install };
}

// The installer already had no seed-copy mechanism at HEAD; these lock down that existing
// behavior against the now-decided spec, including old packages carrying obsolete seed paths.
test("approved dev.tovu.memory namespace retains package guidance while each site's learned memory starts empty", async () => {
  const firstSite = await fixture();
  const secondSite = await fixture();
  try {
    const installed = await firstSite.install("example", "1.0.0", "Vendor account claim");
    const parsed = parseAgentPluginManifest({ value: JSON.parse(await fs.readFile(path.join(installed.packageRoot, "plugin.json"), "utf8")) });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) assert.fail(parsed.errors.join("; "));
    assert.deepEqual(parsed.manifest.extensions?.["dev.tovu.memory"], { usesMemory: true });
    assert.deepEqual(parsed.warnings, []);
    assert.match(await fs.readFile(path.join(installed.packageRoot, "dev.tovu.memory", "README.md"), "utf8"), /Author guidance/);
    assert.deepEqual(await firstSite.memory().list({ kind: "learned" }), []);
    assert.deepEqual(await firstSite.memory().list({ kind: "notes" }), []);
    await firstSite.memory().learned.write({ entryPath: "account.md", text: "Observed on first site" });
    await firstSite.install("example", "2.0.0", "Changed vendor account claim");
    await secondSite.install("example", "1.0.0", "Vendor account claim");
    assert.deepEqual(await secondSite.memory().list({ kind: "learned" }), []);
    assert.equal(await firstSite.memory().learned.read({ entryPath: "account.md" }), "Observed on first site");
    assert.deepEqual((await firstSite.memory().list({ kind: "learned" })).map(entry => entry.relativePath), ["account.md"]);
    await uninstallAgentPlugin({ layout: firstSite.layout, workspaceId, pluginId: "example" });
    await firstSite.install("example", "1.0.0", "Vendor account claim");
    assert.equal(await firstSite.memory().learned.read({ entryPath: "account.md" }), "Observed on first site");
    assert.deepEqual(await firstSite.memory().list({ kind: "notes" }), []);
  } finally { await forceRemove(firstSite.temporary); await forceRemove(secondSite.temporary); }
});

test("Layout B isolates two packages and keeps mutable state outside the indexed/frozen package on update", async () => {
  const f = await fixture();
  try {
    const first = await f.install();
    assert.equal(first.packageRoot, path.join(f.workspace.root, "example", "package", "sha256", first.archiveDigest));
    await f.memory().learned.write({ entryPath: "account.json", text: '{"model":"observed"}' });
    await f.memory().writeNote({ entryPath: "project.md", text: "User’s brand rule" });
    await fs.writeFile(path.join(f.workspace.pluginDataDir("example"), "cache.bin"), Buffer.from([0, 1, 2]));
    const duplicate = await f.install();
    assert.deepEqual(duplicate, first);
    const mode = (await fs.stat(first.packageRoot)).mode & 0o777;
    assert.equal(mode, 0o555);
    const updated = await f.install("example", "2.0.0");
    await f.install("second");
    assert.notEqual(updated.packageRoot, first.packageRoot);
    assert.equal(await f.memory().read({ kind: "notes", entryPath: "project.md" }), "User’s brand rule");
    assert.equal(await f.memory().learned.read({ entryPath: "account.json" }), '{"model":"observed"}');
    assert.deepEqual(await fs.readFile(path.join(f.workspace.pluginDataDir("example"), "cache.bin")), Buffer.from([0, 1, 2]));
    assert.deepEqual((await listInstalledPlugins(f.workspace.root)).map(p => p.pluginId).sort(), ["example", "example", "second"]);
    const indexed = await indexInstalledRoot(updated.packageRoot, updated.archiveDigest);
    // The approved dev.tovu.memory namespace contains immutable package guidance; only
    // actual memory/ or data/ path components represent mutable state excluded from this index.
    assert.equal(indexed.files.some(file => /(?:^|\/)(?:memory|data)(?:\/|$)/.test(file)), false);
    assert.deepEqual(indexed.files, ["dev.tovu.memory/README.md", "plugin.json", "skills/example/SKILL.md"]);
    assert.equal((await fs.stat(path.dirname(f.workspace.pluginMemoryDir({ pluginId: "example", kind: "notes" })))).mode & 0o700, 0o700);
  } finally { await forceRemove(f.temporary); }
});

test("uninstall keeps memory/data by default; reinstall resumes it; explicit preview-bound deletion removes the plugin folder", async () => {
  const f = await fixture();
  try {
    await f.install();
    await f.memory().writeNote({ entryPath: "project.md", text: "Keep my note" });
    await f.memory().learned.write({ entryPath: "account.txt", text: "Keep learned facts" });
    await assert.rejects(uninstallAgentPlugin({ layout: f.layout, workspaceId, pluginId: "example" }, { deleteMemory: true }), /confirmed preview/);
    await uninstallAgentPlugin({ layout: f.layout, workspaceId, pluginId: "example" });
    await assert.rejects(fs.stat(path.join(f.workspace.root, "example", "package")), { code: "ENOENT" });
    assert.equal(await f.memory().read({ kind: "notes", entryPath: "project.md" }), "Keep my note");
    assert.equal(await f.memory().learned.read({ entryPath: "account.txt" }), "Keep learned facts");
    assert.deepEqual(await listInstalledPlugins(f.workspace.root), []);
    await f.install();
    assert.equal(await f.memory().read({ kind: "notes", entryPath: "project.md" }), "Keep my note");
    const request = { layout: f.layout, workspaceId, pluginId: "example" };
    const preview = await previewAgentPluginUninstall(request);
    await uninstallAgentPlugin(request, { confirmedPreview: preview, deleteMemory: true });
    await assert.rejects(fs.stat(f.workspace.pluginRootDir({ pluginId: "example" })), { code: "ENOENT" });
  } finally { await forceRemove(f.temporary); }
});

test("notes autoload in pinned skill guidance; learned knowledge does not; package notes-seed is ignored", async () => {
  const f = await fixture();
  try {
    await f.install("example", "1.0.0", "Vendor must not write user notes");
    assert.deepEqual(await f.memory().list({ kind: "notes" }), []);
    await f.memory().writeNote({ entryPath: "project.md", text: "USER-NOTE-CONTEXT" });
    await f.memory().learned.write({ entryPath: "account.md", text: "LEARNED-ON-DEMAND" });
    const result = await resolveAgentPluginRefs(["example"], f.workspace, "inject");
    assert.equal(result.ok, true);
    if (!result.ok) assert.fail(result.reason);
    assert.match(result.promptPrefix, /USER-NOTE-CONTEXT/);
    assert.doesNotMatch(result.promptPrefix, /LEARNED-ON-DEMAND/);
    await f.memory().writeNote({ entryPath: "project.md", text: "FRESH-NOTE" });
    assert.match(await appendPluginNotes({ workspaceRoot: f.workspace.root, pluginId: "example", guidance: "Skill" }), /FRESH-NOTE/);
  } finally { await forceRemove(f.temporary); }
});

test("learned capability refuses traversal, sibling plugin aliases, notes writes, invalid UTF-8 and size overflows", async () => {
  const f = await fixture();
  try {
    await f.install(); await f.install("second");
    const memory = f.memory();
    for (const entryPath of ["../notes/hijack.md", "../../../second/memory/notes/hijack.md", "/tmp/hijack.md", "C:\\hijack.md", "..\\notes\\hijack.md"]) {
      await assert.rejects(memory.learned.write({ entryPath, text: "escape" }));
    }
    const learned = f.workspace.pluginMemoryDir({ pluginId: "example", kind: "learned" });
    await fs.symlink(f.workspace.pluginMemoryDir({ pluginId: "second", kind: "notes" }), path.join(learned, "escape"));
    await assert.rejects(memory.learned.write({ entryPath: "escape/hijack.md", text: "escape" }));
    await fs.unlink(path.join(learned, "escape"));
    await assert.rejects(memory.writeNote({ entryPath: "big.md", text: "é".repeat(8193) }), /cap/);
    await fs.writeFile(path.join(learned, "binary"), Buffer.from([0xff]));
    await assert.rejects(memory.learned.read({ entryPath: "binary" }));
    await fs.unlink(path.join(learned, "binary"));
    await fs.rmdir(learned);
    await fs.symlink(f.workspace.pluginMemoryDir({ pluginId: "second", kind: "learned" }), learned);
    await assert.rejects(memory.learned.write({ entryPath: "other.md", text: "escape" }), /symlink/);
    assert.deepEqual(await f.memory("second").list({ kind: "learned" }), []);
    for (const pluginId of ["../escape", "bad--id", "UPPER", "staging"]) await assert.rejects(f.install(pluginId));
    await assert.rejects(fs.stat(path.join(f.workspace.root, "bad--id")), { code: "ENOENT" });
  } finally { await forceRemove(f.temporary); }
});

test("memory tools cannot select a different plugin/kind and obey the per-call revocation gate", async () => {
  let active = true;
  const registrations = buildPluginMemoryRegistrations({ workspaceId,
    sources: [{ id: "agent_plugin_example", pluginId: "example", archiveDigest: "a".repeat(64) }],
    gate: { isCallable: async () => active },
  });
  assert.equal(registrations.length, 2);
  for (const registration of registrations) {
    const authorization = {} as Parameters<typeof registration.policy.authorize>[0];
    assert.equal(await registration.policy.authorize(authorization), "allow");
    active = false; assert.equal(await registration.policy.authorize(authorization), "deny"); active = true;
    await assert.rejects(registration.handler({ input: { entryPath: "account.txt", text: "bad", pluginId: "second", kind: "notes" } } as never), /no plugin id/);
  }
});

test("migration moves legacy packages, Layout A memory and PLUGIN_DATA once, preserving frozen modes and activations", async () => {
  const f = await fixture();
  try {
    const plugin = await f.install();
    await f.memory().writeNote({ entryPath: "project.md", text: "Legacy note" });
    await fs.writeFile(path.join(f.workspace.pluginDataDir("example"), "cache"), "Legacy data");
    await fs.writeFile(path.join(f.workspace.root, "activations.json"), '{"plugins":{}}');
    await fs.mkdir(f.workspace.packages, { recursive: true });
    await fs.chmod(plugin.packageRoot, 0o700);
    await fs.rename(plugin.packageRoot, path.join(f.workspace.packages, plugin.archiveDigest));
    await fs.chmod(path.join(f.workspace.packages, plugin.archiveDigest), 0o555);
    for (const bucket of ["memory", "data"]) {
      await fs.mkdir(path.join(f.workspace.root, bucket), { recursive: true });
      await fs.rename(path.join(f.workspace.root, "example", bucket), path.join(f.workspace.root, bucket, "example"));
    }
    // Containment canonicalizes paths; a trusted workspace alias must not turn a move into traversal.
    const workspaceAlias = path.join(f.temporary, "workspace-alias");
    await fs.symlink(f.workspace.root, workspaceAlias, "dir");
    const aliasedLayout = { ...f.layout, forWorkspace: (id: string) => ({ ...f.layout.forWorkspace(id), root: workspaceAlias }) };
    assert.equal((await migrateAgentPluginLayout({ layout: aliasedLayout, workspaceId })).complete, true);
    assert.equal(await f.memory().read({ kind: "notes", entryPath: "project.md" }), "Legacy note");
    assert.equal(await fs.readFile(path.join(f.workspace.pluginDataDir("example"), "cache"), "utf8"), "Legacy data");
    assert.equal((await fs.stat(plugin.packageRoot)).mode & 0o777, 0o555);
    assert.equal(await fs.readFile(path.join(f.workspace.root, "activations.json"), "utf8"), '{"plugins":{}}');
    assert.deepEqual(await migrateAgentPluginLayout({ layout: f.layout, workspaceId }), { complete: true, moved: 0 });
  } finally { await forceRemove(f.temporary); }
});

// Crash and concurrent-boot tests exercise actual filesystem moves and the real lock, not a fake migration.
test("migration resumes after interruption, isolates malformed manifests, and serializes concurrent boots", async () => {
  const f = await fixture();
  try {
    await fs.mkdir(f.workspace.packages, { recursive: true });
    for (const [digest, name] of [["a".repeat(64), "first"], ["b".repeat(64), "second"]]) {
      const root = path.join(f.workspace.packages, digest!); await fs.mkdir(root);
      await fs.writeFile(path.join(root, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name }));
    }
    const broken = path.join(f.workspace.packages, "c".repeat(64)); await fs.mkdir(broken); await fs.writeFile(path.join(broken, "plugin.json"), "bad json");
    let interrupted = false;
    const filesystem = { ...fs, rename: (async (from, to) => {
      if (!interrupted && String(from).includes("b".repeat(64))) { interrupted = true; throw new Error("simulated process interruption"); }
      return fs.rename(from, to);
    }) as typeof fs.rename };
    const input = { filesystem, workspaceRoot: f.workspace.root,
      contain: ({ root, entryPath }: { root: string; entryPath: string }) => assertContainedOnDisk(root, entryPath),
      parsePluginId: ({ value }: { value: unknown }) => (value as { name: string }).name,
      withLock: <T>({ lockPath, run }: { lockPath: string; run(): Promise<T> }) => withFileLock({ lockPath, run }, { staleMs: Infinity, createParent: true }),
    };
    const partial = await migratePluginLayout(input);
    assert.equal(partial.complete, false); assert.equal(partial.moved, 1);
    await assert.rejects(fs.stat(path.join(f.workspace.root, ".agent-plugin-layout-migrated")), { code: "ENOENT" });
    await assert.rejects(fs.stat(broken), { code: "ENOENT" });
    const quarantine = path.join(f.workspace.staging, "legacy-quarantine");
    const [run] = await fs.readdir(quarantine);
    assert.equal(await fs.readFile(path.join(quarantine, run!, "packages", "sha256", "c".repeat(64), "plugin.json"), "utf8"), "bad json");
    const results = await Promise.all([migratePluginLayout({ ...input, filesystem: fs }), migratePluginLayout({ ...input, filesystem: fs })]);
    assert.equal(results.every(result => result.complete), true);
    assert.deepEqual(results.map(result => result.moved).sort(), [0, 1]);
    assert.deepEqual((await listInstalledPlugins(f.workspace.root)).map(plugin => plugin.pluginId).sort(), ["first", "second"]);
  } finally { await forceRemove(f.temporary); }
});

test("malformed legacy entries are quarantined once and bundled seeding proceeds on this boot and the next", async () => {
  const f = await fixture();
  try {
    const sourceRoot = path.join(f.temporary, "bundled-source");
    const pluginSource = path.join(sourceRoot, "example");
    await fs.mkdir(path.join(pluginSource, "skills", "example"), { recursive: true });
    await fs.writeFile(path.join(pluginSource, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "example", version: "1.0.0" }));
    await fs.writeFile(path.join(pluginSource, "skills", "example", "SKILL.md"), "# Example\nGuidance.");
    const broken = path.join(f.workspace.packages, "f".repeat(64));
    await fs.mkdir(broken, { recursive: true });
    await fs.writeFile(path.join(broken, "plugin.json"), "bad json");
    const request = { layout: f.layout, workspaceId, sourceRoot };
    const first = await seedBundledAgentPlugins(request);
    assert.equal(first.outcomes.length, 1);
    assert.equal(first.outcomes[0]?.status, "seeded");
    assert.equal(first.ledgerFailure, undefined);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.workspace.root, ".agent-plugin-layout-migrated"), "utf8")), { layoutVersion: 2 });
    await assert.rejects(fs.stat(broken), { code: "ENOENT" });
    const quarantine = path.join(f.workspace.staging, "legacy-quarantine");
    const runs = await fs.readdir(quarantine);
    assert.equal(runs.length, 1);
    const savedManifest = path.join(quarantine, runs[0]!, "packages", "sha256", "f".repeat(64), "plugin.json");
    assert.equal(await fs.readFile(savedManifest, "utf8"), "bad json");
    assert.deepEqual(await migrateAgentPluginLayout({ layout: f.layout, workspaceId }), { complete: true, moved: 0 });
    const second = await seedBundledAgentPlugins(request);
    assert.equal(second.outcomes.length, 1);
    assert.equal(second.outcomes[0]?.status, "seeded");
    assert.equal(second.ledgerFailure, undefined);
    assert.deepEqual(await fs.readdir(quarantine), runs);
    assert.equal(await fs.readFile(savedManifest, "utf8"), "bad json");
    assert.deepEqual((await listInstalledPlugins(f.workspace.root)).map(plugin => plugin.pluginId), ["example"]);
  } finally { await forceRemove(f.temporary); }
});

test("site boot migrates every existing workspace before seeding the active one", async () => {
  const f = await fixture();
  try {
    for (const workspaceId of ["workspace-local", "ws-second"]) {
      const workspace = f.layout.forWorkspace(workspaceId);
      const legacy = path.join(workspace.packages, "d".repeat(64));
      await fs.mkdir(legacy, { recursive: true });
      await fs.writeFile(path.join(legacy, "plugin.json"), '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"example"}');
    }
    assert.equal((await migrateSiteAgentPluginLayouts({ layout: f.layout, workspaceId })).complete, true);
    for (const workspaceId of ["workspace-local", "ws-second"]) {
      const workspace = f.layout.forWorkspace(workspaceId);
      assert.equal((await listInstalledPlugins(workspace.root))[0]?.pluginId, "example");
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(workspace.root, ".agent-plugin-layout-migrated"), "utf8")), { layoutVersion: 2 });
    }
  } finally { await forceRemove(f.temporary); }
});

test("a crash after rename but before permission restoration never leaves the migrated package writable", async () => {
  const f = await fixture();
  try {
    const digest = "e".repeat(64);
    const legacy = path.join(f.workspace.packages, digest);
    await fs.mkdir(legacy, { recursive: true });
    await fs.writeFile(path.join(legacy, "plugin.json"), '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"example"}');
    await fs.chmod(legacy, 0o555);
    let interrupted = false;
    const filesystem = { ...fs, rename: (async (from, to) => {
      await fs.rename(from, to);
      if (!interrupted && String(from) === legacy) { interrupted = true; throw new Error("crash after atomic rename"); }
    }) as typeof fs.rename };
    const input = { filesystem, workspaceRoot: f.workspace.root,
      contain: ({ root, entryPath }: { root: string; entryPath: string }) => assertContainedOnDisk(root, entryPath),
      parsePluginId: ({ value }: { value: unknown }) => (value as { name: string }).name,
      withLock: <T>({ lockPath, run }: { lockPath: string; run(): Promise<T> }) => withFileLock({ lockPath, run }, { staleMs: Infinity, createParent: true }),
    };
    assert.equal((await migratePluginLayout(input)).complete, false);
    const packageRoot = path.join(f.workspace.pluginPackagesDir({ pluginId: "example" }), digest);
    assert.equal((await fs.stat(packageRoot)).mode & 0o777, 0o555);
    assert.equal((await migratePluginLayout({ ...input, filesystem: fs })).complete, true);
    assert.deepEqual((await listInstalledPlugins(f.workspace.root)).map(plugin => plugin.archiveDigest), [digest]);
  } finally { await forceRemove(f.temporary); }
});
