/** Approved round17 B negative matrix. Baseline RED: safe import verifier/rollback do not exist.
 * Malicious ZIPs deliberately bypass A's safe encoder using the installed yazl fixture library.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createSite } from "../../../platform/site-dir/site-registry.js";
import { initSite } from "../../../platform/site-dir/init-site.js";
import { resolveSiteDatabasePaths } from "../../../platform/site-dir/site-databases.js";
import { createSiteImportBackend } from "../import-backend.js";
import { SHARE_LIMITS } from "../share-policy.js";
import { importFixture, OWNER_PASSWORD } from "./import.fixture.js";

const { ZipFile } = createRequire(import.meta.url)("yazl");
type ZipItem = { name: string; bytes: Buffer; mode?: number };

async function pack(items: ZipItem[]): Promise<Buffer> {
  const zip = new ZipFile();
  const substitutions: { from: Buffer; to: Buffer }[] = [];
  for (const [index, item] of items.entries()) {
    // Equal byte counts let tests express unsafe paths that yazl correctly refuses to produce.
    const to = Buffer.from(item.name);
    const from = Buffer.from(("q" + index.toString(36) + "z").padEnd(to.length, "q").slice(0, to.length));
    zip.addBuffer(item.bytes, from.toString(), { compress: true, mode: item.mode ?? 0o100644 });
    substitutions.push({ from, to });
  }
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  // Replacement is header-only: compressed data is never used to locate test filenames.
  for (const entry of centralEntries(bytes)) {
    const swap = substitutions.shift()!;
    swap.to.copy(bytes, entry.central + 46);
    swap.to.copy(bytes, entry.local + 30);
    bytes.writeUInt16LE(bytes.readUInt16LE(entry.central + 8) | 0x800, entry.central + 8);
    bytes.writeUInt16LE(bytes.readUInt16LE(entry.local + 6) | 0x800, entry.local + 6);
  }
  return bytes;
}
function centralEntries(bytes: Buffer) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let offset = bytes.readUInt32LE(end + 16);
  const entries: { central: number; local: number }[] = [];
  for (let count = bytes.readUInt16LE(end + 10); count > 0; count--) {
    entries.push({ central: offset, local: bytes.readUInt32LE(offset + 42) });
    offset += 46 + bytes.readUInt16LE(offset + 28) + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  return entries;
}
async function archiveItems(archive: Buffer): Promise<ZipItem[]> {
  const { reader } = await import("./import.fixture.js");
  const result: ZipItem[] = [];
  for await (const entry of reader.entries({ archive })) {
    if (entry.kind !== "file") continue;
    const chunks: Buffer[] = [];
    for await (const chunk of entry.openReadStream({})) chunks.push(Buffer.from(chunk));
    result.push({ name: entry.entryPath, bytes: Buffer.concat(chunks) });
  }
  return result;
}
function mutateManifest(items: ZipItem[], change: (manifest: any) => void): ZipItem[] {
  return items.map(item => {
    if (item.name !== "manifest.json") return item;
    const manifest = JSON.parse(item.bytes.toString()); change(manifest);
    return { ...item, bytes: Buffer.from(JSON.stringify(manifest)) };
  });
}
function appendListed(items: ZipItem[], additions: ZipItem[]): ZipItem[] {
  return [...mutateManifest(items, manifest => {
    for (const item of additions) manifest.files.push({ path: item.name, bytes: item.bytes.length, sha256: createHash("sha256").update(item.bytes).digest("hex") });
  }), ...additions];
}
type PackageRecord = { kind: "agent" | "site"; id: string; digest?: string };
/** A v2 package root needs its own manifest record, or plugin coverage refuses before the file policy runs. */
function appendPackageFile(items: ZipItem[], addition: ZipItem, plugin?: PackageRecord): ZipItem[] {
  const listed = appendListed(items, [addition]);
  if (!plugin) return listed;
  return mutateManifest(listed, manifest => {
    manifest.plugins.push({ kind: plugin.kind, id: plugin.id, version: "1.0.0", digest: plugin.digest ?? "a".repeat(64), enabled: false, shipped: true });
  });
}
async function importRefusal(h: Awaited<ReturnType<typeof importFixture>>, required: { archive: string; bytes: Buffer; plugin?: PackageRecord; code: string }): Promise<void> {
  const archive = await pack(appendPackageFile(await archiveItems(h.archive), { name: required.archive, bytes: required.bytes }, required.plugin));
  const upload = await h.backend.upload({ principalId: "recipient", archive });
  await assert.rejects(h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } }), { code: required.code });
  assert.deepEqual(h.workspace.registry({}).list({}), []);
}

test("package filename exceptions require the exact content-addressed root on export and import", async t => {
  const root = `agent-plugins/ws/ws/portable/package/sha256/${"a".repeat(64)}`;
  const agent: PackageRecord = { kind: "agent", id: "portable" };
  // `runtime` is what export collects; `archive` is the same file in the v2 ZIP layout (no workspace,
  // no digest folder: the digest is the manifest record's field). Each import refusal code is exact.
  const cases: { runtime: string; archive: string; plugin?: PackageRecord; code: string }[] = [
    { runtime: "themes/site/mcp.json", archive: "themes/site/mcp.json", code: "UNSAFE_FILE" },
    { runtime: "plugins/portable/package/mcp.json", archive: "plugins/portable/package/mcp.json", plugin: { kind: "site", id: "portable" }, code: "UNSAFE_FILE" },
    { runtime: "themes/site/tovu-credential-schemes.json", archive: "themes/site/tovu-credential-schemes.json", code: "UNSAFE_FILE" },
    ...["a".repeat(63), "a".repeat(65), "g".repeat(64)].map(digest => ({
      runtime: `agent-plugins/ws/ws/portable/package/sha256/${digest}/mcp.json`, archive: "agent-plugins/portable/package/mcp.json",
      plugin: { ...agent, digest }, code: "INVALID_ARCHIVE",
    })),
    { runtime: `themes/${root}/mcp.json`, archive: `themes/${root}/mcp.json`, code: "UNSAFE_FILE" },
    { runtime: `agent-plugins/ws/mcp.json/portable/package/sha256/${"a".repeat(64)}/plugin.json`, archive: "agent-plugins/mcp.json/package/plugin.json", plugin: { kind: "agent", id: "mcp.json" }, code: "UNSAFE_FILE" },
    // B's tree-path gate refuses credential filenames (.npmrc, *.pem) before the file policy runs.
    { runtime: `${root}/.npmrc`, archive: "agent-plugins/portable/package/.npmrc", plugin: agent, code: "UNSAFE_PATH" },
    { runtime: `${root}/nested/private-key.pem`, archive: "agent-plugins/portable/package/nested/private-key.pem", plugin: agent, code: "UNSAFE_PATH" },
    { runtime: `${root}/vendor-credentials.json`, archive: "agent-plugins/portable/package/vendor-credentials.json", plugin: agent, code: "UNSAFE_FILE" },
  ];
  for (const item of cases) await t.test(item.runtime, async t => {
    const h = await importFixture(t);
    const bytes = Buffer.from("{}");
    h.files.set(item.runtime, bytes);
    await assert.rejects(h.prepareProductionShare(), { code: "UNSAFE_FILE" });
    // B must independently reject a listed, correctly hashed file that bypassed A's collector.
    await importRefusal(h, { archive: item.archive, bytes, plugin: item.plugin, code: item.code });
  });
});

test("import refuses exactly what export refuses inside a site plugin package", async t => {
  // Only an AGENT package's content-addressed root may ship MCP declarations and credential-named files;
  // a site plugin package gets the ordinary name rules on both sides, with the same refusal code.
  for (const filename of ["mcp.json", "tovu-credential-schemes.json", "vendor-credentials.json"]) await t.test(filename, async t => {
    const h = await importFixture(t);
    const name = `plugins/portable/package/${filename}`;
    const bytes = Buffer.from("{}");
    h.files.set(name, bytes);
    const exported = await h.prepareProductionShare().then(() => "accepted", (error: { code?: string }) => error.code);
    assert.equal(exported, "UNSAFE_FILE");
    // Baseline RED: import mapped site plugins into the agent package root and accepted mcp.json.
    await importRefusal(h, { archive: name, bytes, plugin: { kind: "site", id: "portable" }, code: exported });
  });
});

test("an installed site plugin's data/ folder stays out of the export, which then imports cleanly", async t => {
  // `plugins/custom/1.0.0/data/` is the plugin's runtime data (OAuth tokens, never content) beside its
  // package; export ships only the files Jini lists for the package. One policy on both sides.
  const h = await importFixture(t);
  h.files.set("plugins/custom/data/state.json", Buffer.from('{"state":"plugin-runtime"}'));
  const { archive } = await h.prepareProductionShare();
  const names = (await archiveItems(archive)).map(item => item.name);
  assert.ok(names.includes("plugins/custom/package/jini.plugin.json"), "the plugin itself is exported");
  // Baseline RED: export shipped `plugins/custom/package/data/state.json` and import refused the
  // archive as private runtime data (INVALID_ARCHIVE).
  assert.deepEqual(names.filter(name => name.startsWith("plugins/custom/") && name.includes("/data/")), []);
  const upload = await h.backend.upload({ principalId: "recipient", archive });
  const pending = await h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } });
  assert.equal(typeof pending.importId, "string");
});

test("package manifest filename exceptions preserve secret scanning on export and import", async t => {
  for (const filename of ["mcp.json", "tovu-credential-schemes.json"]) await t.test(filename, async t => {
    const h = await importFixture(t);
    const name = `agent-plugins/ws/ws/portable/package/sha256/${"a".repeat(64)}/${filename}`;
    const bytes = Buffer.from(JSON.stringify({ token: "ghp_" + "x".repeat(36) }));
    h.files.set(name, bytes);
    // Baseline RED: UNSAFE_FILE masks the required byte-level SECRET_IN_CONTENT refusal.
    await assert.rejects(h.prepareProductionShare(), { code: "SECRET_IN_CONTENT" });
    assert.deepEqual(fs.readFileSync(path.join(h.root, "source", name)), bytes, "refusal must not damage package bytes");
    await importRefusal(h, { archive: `agent-plugins/portable/package/${filename}`, bytes, plugin: { kind: "agent", id: "portable" }, code: "SECRET_IN_CONTENT" });
  });
});

test("B malicious ZIP matrix: no registered/partial site and no mutation to an existing site", async t => {
  const h = await importFixture(t);
  const existing = await createSite({ name: "existing", adminPassword: OWNER_PASSWORD }, { ...h.backendPorts.creationOptions, workspace: h.workspace });
  const beforeCatalog = JSON.stringify(h.workspace.registry({}).list({}));
  const existingDbPath = resolveSiteDatabasePaths({ dir: existing.dir }, { workspace: h.workspace }).contentDbPath;
  const existingDb = fs.readFileSync(existingDbPath);
  const items = await archiveItems(h.archive);
  const cases: { name: string; make: () => Promise<Buffer> }[] = [];
  for (const name of ["../outside", "/absolute", "C:/drive", "//server/share", "uploads/a\\b", "uploads/a\0b", "uploads/%2e%2e/a", "uploads/a.", "uploads/CON.txt", "uploads/e\u0301.txt", "uploads/Ｆ.txt"]) {
    cases.push({ name: "path " + JSON.stringify(name), make: () => pack(appendListed(items, [{ name, bytes: Buffer.from("bad") }])) });
  }
  for (const [label, names] of [
    ["duplicate", ["uploads/dup", "uploads/dup"]], ["case alias", ["uploads/A", "uploads/a"]],
    ["ancestor alias", ["uploads/Dir/a", "uploads/dir/b"]], ["file-directory collision", ["uploads/x", "uploads/x/y"]],
    ["Unicode case expansion alias", ["uploads/SS/a", "uploads/ß/b"]],
    // Review B-3: both orders, so a policy cannot depend on which spelling was encountered first.
    ["reverse ancestor alias", ["themes/dir/b", "themes/Dir/a"]],
    ["reverse Unicode expansion", ["themes/ß/b", "themes/SS/a"]],
    ["Unicode final sigma ancestor", ["themes/Σ/a", "themes/ς/b"]],
    ["compatibility ancestor", ["themes/Ｆ/a"]],
  ] as const) cases.push({ name: label, make: () => pack(appendListed(items, names.map(name => ({ name, bytes: Buffer.from("bad") })))) });
  for (const [label, mode] of [["symlink", 0o120777], ["fifo", 0o010644], ["device", 0o020644]] as const) cases.push({
    name: label, make: async () => {
      const bytes = await pack(appendListed(items, [{ name: "uploads/link", bytes: Buffer.from("../existing"), mode }]));
      const central = centralEntries(bytes).at(-1)!.central;
      bytes.writeUInt16LE((3 << 8) | 20, central + 4); bytes.writeUInt32LE((mode << 16) >>> 0, central + 38);
      return bytes;
    },
  });
  cases.push({ name: "encrypted", make: async () => {
    const bytes = await pack(items), entry = centralEntries(bytes)[0]!;
    bytes.writeUInt16LE(bytes.readUInt16LE(entry.central + 8) | 1, entry.central + 8);
    bytes.writeUInt16LE(bytes.readUInt16LE(entry.local + 6) | 1, entry.local + 6); return bytes;
  } });
  cases.push({ name: "hardlink extra field", make: async () => {
    const bytes = await pack(items), entry = centralEntries(bytes)[0]!;
    const extra = entry.central + 46 + bytes.readUInt16LE(entry.central + 28);
    assert.ok(bytes.readUInt16LE(entry.central + 30) >= 4, "yazl supplies timestamp extra metadata");
    bytes.writeUInt16LE(0x756e, extra); return bytes;
  } });
  for (const [label, change] of [
    ["scopes", (m: any) => { m.scopes.database = false; }], ["version", (m: any) => { m.formatVersion = 3; }],
    ["profile", (m: any) => { m.profile = "backup"; }], ["format version", (m: any) => { m.formatVersion = 1; }],
    ["schema", (m: any) => { m.schema.tag = "forged"; }], ["media hash", (m: any) => { m.media[0].sha256 = "0".repeat(64); }],
    ["hash", (m: any) => { m.files[0].sha256 = "0".repeat(64); }], ["size", (m: any) => { m.files[0].bytes++; }],
    ["missing inventory", (m: any) => { m.files.pop(); }],
  ] as const) cases.push({ name: label, make: () => pack(mutateManifest(items, change)) });
  cases.push({ name: "unlisted file", make: () => pack([...items, { name: "uploads/unlisted", bytes: Buffer.from("bad") }]) });
  cases.push({ name: "unreferenced upload", make: () => pack(appendListed(items, [{ name: "uploads/stranded-chat", bytes: Buffer.from("private-chat") }])) });
  cases.push({ name: "unlisted directory", make: () => pack([...items, { name: "unused/", bytes: Buffer.alloc(0), mode: 0o040755 }]) });
  cases.push({ name: "missing file", make: () => pack(items.filter(item => item.name !== "themes/site/index.html")) });
  cases.push({ name: "private file", make: () => pack(appendListed(items, [{ name: "themes/site/.env.local", bytes: Buffer.from("PRIVATE") }])) });
  cases.push({ name: "media hash differs from database", make: () => {
    const media = items.find(item => item.name.startsWith("media/"))!;
    const wrong = Buffer.from("changed-media");
    const changed = items.map(item => item === media ? { ...item, bytes: wrong } : item);
    return pack(mutateManifest(changed, m => {
      const record = m.files.find((file: any) => file.path === media.name); record.bytes = wrong.length; record.sha256 = createHash("sha256").update(wrong).digest("hex");
    }));
  } });
  cases.push({ name: "2 MiB manifest cap", make: () => pack(items.map(item => item.name === "manifest.json" ? { ...item, bytes: Buffer.alloc(SHARE_LIMITS.maxManifestBytes + 1, 32) } : item)) });
  cases.push({ name: "2,000 entry cap", make: () => pack(Array.from({ length: 2001 }, (_, i) => ({ name: "uploads/file-" + i, bytes: Buffer.alloc(0) }))) });
  cases.push({ name: "declared ZIP bomb", make: async () => {
    const bytes = await pack(items), entry = centralEntries(bytes)[0]!;
    bytes.writeUInt32LE(SHARE_LIMITS.maxExpandedBytes + 1, entry.central + 24); return bytes;
  } });
  cases.push({ name: "aggregate expanded cap", make: async () => {
    const additions = Array.from({ length: 6 }, (_, i) => ({ name: "uploads/large-" + i, bytes: Buffer.from("x") }));
    const changed = mutateManifest(appendListed(items, additions), m => {
      for (const file of m.files) if (file.path.startsWith("uploads/large-")) file.bytes = SHARE_LIMITS.maxFileBytes;
    });
    const bytes = await pack(changed);
    for (const entry of centralEntries(bytes)) {
      const name = bytes.subarray(entry.central + 46, entry.central + 46 + bytes.readUInt16LE(entry.central + 28)).toString();
      if (name.startsWith("uploads/large-")) bytes.writeUInt32LE(SHARE_LIMITS.maxFileBytes, entry.central + 24);
    }
    return bytes;
  } });
  cases.push({ name: "actual expanded ZIP bomb", make: async () => {
    const changed = mutateManifest(appendListed(items, [{ name: "uploads/bomb", bytes: Buffer.alloc(1024 * 1024) }]), m => {
      m.files.find((file: any) => file.path === "uploads/bomb").bytes = 1;
    });
    const bytes = await pack(changed);
    const entry = centralEntries(bytes).at(-1)!; bytes.writeUInt32LE(1, entry.central + 24); return bytes;
  } });
  for (const item of cases) await t.test(item.name, async () => {
    const upload = await h.backend.upload({ principalId: "recipient", archive: await item.make() });
    await assert.rejects(h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } }));
    assert.equal(JSON.stringify(h.workspace.registry({}).list({})), beforeCatalog);
    assert.deepEqual(fs.readFileSync(existingDbPath), existingDb);
    assert.deepEqual(fs.readdirSync(path.join(h.root, "sites")).filter(name => !name.startsWith(".")), ["existing"]);
    assert.equal(fs.readdirSync(h.registry.directory).some(name => name.endsWith(".stage") || name.endsWith(".upload.zip")), false);
  });
});

test("B untrusted schema objects and partial restore errors leave no site, including app-data DBs", async t => {
  const h = await importFixture(t, "appData");
  const items = await archiveItems(h.archive);
  h.db.$client.exec("CREATE VIEW hostile AS SELECT load_extension('/tmp/never')");
  const payload = h.db.$client.serialize();
  const hostile = mutateManifest(items.map(item => item.name === "content.db" ? { ...item, bytes: payload } : item), m => {
    const db = m.files.find((f: any) => f.path === "content.db"); db.bytes = payload.length; db.sha256 = createHash("sha256").update(payload).digest("hex");
  });
  const upload = await h.backend.upload({ principalId: "recipient", archive: await pack(hostile) });
  await assert.rejects(h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } }), /schema|database/i);
  h.db.$client.exec("DROP VIEW hostile");
  for (const [create, drop] of [
    ["CREATE TRIGGER hostile AFTER INSERT ON posts BEGIN SELECT 1; END", "DROP TRIGGER hostile"],
    ["CREATE TABLE unknown_business(payload TEXT); INSERT INTO unknown_business VALUES ('required-data')", "DROP TABLE unknown_business"],
    ["UPDATE posts SET featured_media_id='missing' WHERE id='post-0'", "UPDATE posts SET featured_media_id=NULL WHERE id='post-0'"],
    ["ALTER TABLE posts ADD COLUMN hostile TEXT GENERATED ALWAYS AS ('unsafe') VIRTUAL", "ALTER TABLE posts DROP COLUMN hostile"],
  ]) {
    h.db.$client.exec(create!);
    const snapshot = h.db.$client.serialize();
    const changed = mutateManifest(items.map(item => item.name === "content.db" ? { ...item, bytes: snapshot } : item), m => {
      const db = m.files.find((f: any) => f.path === "content.db"); db.bytes = snapshot.length; db.sha256 = createHash("sha256").update(snapshot).digest("hex");
    });
    const bad = await h.backend.upload({ principalId: "recipient", archive: await pack(changed) });
    await assert.rejects(h.backend.importBackup({ principalId: "recipient", source: { uploadId: bad.uploadId } }), /schema|database/i);
    h.db.$client.exec(drop!);
  }
  const broken = createSiteImportBackend(h.backendPorts, { createSite: (input, options) => createSite(input, { ...options, initSite: (input, initOptions) => initSite(input, {
    ...initOptions, verifiedRestore: { restore: async args => { await initOptions?.verifiedRestore?.restore(args); throw new Error("injected mid-restore crash"); } },
  }) }) });
  const good = await broken.upload({ principalId: "recipient", archive: h.archive });
  const pending = await broken.importBackup({ principalId: "recipient", source: { uploadId: good.uploadId } });
  await assert.rejects(broken.completeOwner({ principalId: "recipient", importId: pending.importId, adminPassword: OWNER_PASSWORD }), /crash/);
  assert.deepEqual(h.workspace.registry({}).list({}), []);
  assert.deepEqual(fs.readdirSync(path.join(h.root, "sites")), []);
  const databases = path.join(h.workspace.config({}).appData, "databases");
  assert.deepEqual(fs.existsSync(databases) ? fs.readdirSync(databases) : [], []);
});

test("verifier refuses malformed manifest contracts before invoking the database owner", async t => {
  const { verifySiteImport } = await import("../import-verifier.js");
  const { reader } = await import("./import.fixture.js");
  const h = await importFixture(t), items = await archiveItems(h.archive);
  const mutations: [string, (m: any) => void][] = [
    ["missing schema", m => { delete m.schema; }], ["wrong schema index", m => { m.schema.index++; }],
    ["missing database", m => { m.files = m.files.filter((file: any) => file.path !== "content.db"); }], ["wrong database path", m => { m.files.find((file: any) => file.path === "content.db").path = "other.db"; }],
    ["non-array files", m => { m.files = {}; }], ["empty name", m => { m.site.name = " "; }],
    ["non-string name", m => { m.site.name = 42; }], ["long name", m => { m.site.name = "x".repeat(201); }],
    ["null file", m => { m.files[0] = null; }], ["non-string path", m => { m.files[0].path = 4; }],
    ["fractional size", m => { m.files[0].bytes = 0.5; }], ["negative size", m => { m.files[0].bytes = -1; }],
    ["bad hash", m => { m.files[0].sha256 = "not sha256"; }],
    ["manifest lists itself", m => { m.files[0].path = "manifest.json"; }],
    ["unrecognized scope", m => { m.files[0].path = "unknown/content.txt"; }],
    ["missing settings inventory", m => { m.files = m.files.filter((f: any) => f.path !== "settings.json"); }],
    ["oversized manifest inventory", m => { m.files = Array(2000).fill(m.files[0]); }],
  ];
  for (const [label, change] of mutations) await t.test(label, async () => {
    await assert.rejects(verifySiteImport({ archive: await pack(mutateManifest(items, change)), reader, schema: h.plan.schema, sanitize: async () => assert.fail("invalid manifest must not invoke database owner") }), { code: "INVALID_ARCHIVE" });
  });
  // A path listed twice refuses as the same path collision export guards against (import-verifier-refusals pins the message).
  await assert.rejects(verifySiteImport({ archive: await pack(mutateManifest(items, m => { m.files.push(m.files[0]); })), reader, schema: h.plan.schema, sanitize: async () => assert.fail("duplicate path must not invoke database owner") }), { code: "UNSAFE_PATH", message: "Duplicate file or file/directory collision." });
  for (const bytes of [Buffer.from("{"), Buffer.from("null")]) await assert.rejects(verifySiteImport({ archive: await pack(items.map(item => item.name === "manifest.json" ? { ...item, bytes } : item)), reader, schema: h.plan.schema, sanitize: async () => assert.fail("invalid JSON must not sanitize") }), { code: "INVALID_ARCHIVE" });
  await assert.rejects(verifySiteImport({ archive: await pack(items.filter(item => item.name !== "manifest.json")), reader, schema: h.plan.schema, sanitize: async () => assert.fail() }), { code: "INVALID_ARCHIVE", message: /manifest/ });
});

test("share preflight independently rejects disagreeing local headers and ambiguous directory metadata", async t => {
  const { reader } = await import("./import.fixture.js");
  const consume = async (archive: Buffer) => { for await (const _entry of reader.entries({ archive })) { /* metadata-only preflight */ } };
  for (const [label, change] of [
    ["local signature", (b: Buffer, o: number) => b.writeUInt32LE(0, o)],
    ["local flags", (b: Buffer, o: number) => b.writeUInt16LE(b.readUInt16LE(o + 6) ^ 1, o + 6)],
    ["local compression", (b: Buffer, o: number) => b.writeUInt16LE(b.readUInt16LE(o + 8) ^ 1, o + 8)],
    ["local filename", (b: Buffer, o: number) => b.writeUInt8(120, o + 30)],
    ["truncated extra fields", (b: Buffer, o: number) => b.writeUInt16LE(65535, o + 28)],
  ] as const) await t.test(label, async () => {
    const bytes = await pack([{ name: "themes/a.txt", bytes: Buffer.from("x") }]); change(bytes, centralEntries(bytes)[0]!.local);
    await assert.rejects(consume(bytes), { code: "UNSAFE_ARCHIVE" });
  });
  for (const [label, name, content, mode] of [["nonempty directory", "themes/dir/", "x", 0o040755], ["regular file named directory", "themes/dir/", "", 0o100644], ["directory named file", "themes/dir", "", 0o040755]] as const) await t.test(label, async () => {
    await assert.rejects(consume(await pack([{ name, bytes: Buffer.from(content), mode }])), { code: "UNSAFE_ARCHIVE" });
  });
});
