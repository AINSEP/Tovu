/** ZIP assembly reuses Jini's picker encoder; assertions inspect bytes actually handed to it. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import type { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { buildShareZip } from "../share-zip.js";
import { SHARE_LIMITS } from "../share-policy.js";
import type { SiteSharePlanContent } from "../plan-store.js";
import { collectSiteBackupFiles, type PlannedDiskFile } from "../sources.js";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";
import { createBundledExportFilePolicy } from "../bundled-export-file-policy.js";
type ZipArgs = Parameters<typeof zipFolderFiles>[0];
function plan(overrides: Partial<SiteSharePlanContent> = {}): SiteSharePlanContent {
  return { target: { kind: "zip" }, profile: "share", include: { database: true, media: true, themes: true, plugins: true, settings: true }, database: { bytes: Buffer.from("db"), watermarkAtCapture: 4 }, files: [], bufferedFiles: [{ path: "settings.json", content: Buffer.from("{}") }], media: [], plugins: [], skipped: [], scopeNotes: {}, totalBytes: 4, site: { name: "Site", folderName: "site" }, schema: { index: 1, tag: "test" }, tovuVersion: "test", createdAt: "2026-10-26", ...overrides };
}
function encoder(error?: Error) {
  const calls: ZipArgs[] = [];
  const zip: typeof zipFolderFiles = async args => { calls.push(args); if (error) throw error; return new File(["encoded"], "share.zip"); };
  return { zip, calls };
}

test("export retains every file, skips identical bundled bytes, and scans changed/custom files", async t => {
  const key = ["sk", "proj", ""].join("-") + "Ab3".repeat(12);
  const bundled = Buffer.from(`token=${key}`);
  const installed = new Map([['SKILL.md', bundled], ['__tests__/example.ts', bundled], ['fixtures/example.json', bundled], ['fixtures/modified.json', bundled], ['src/example.test.ts', bundled]]);
  const bundledFilePolicy = createBundledExportFilePolicy({}, {
    selection: new Map([['sample', '@jini-ai/agent-plugins/sample']]),
    resolve: () => '/installed/sample/plugin.json',
    readFile: async filename => installed.get(filename.slice('/installed/sample/'.length)) ?? Buffer.from('{}'),
  });
  const runtime = `agent-plugins/ws/ws/sample/package/sha256/${'a'.repeat(64)}`;
  const changed = Buffer.from(`token=${key}\n// changed`);
  const content = plan({
    files: [disk(t, `${runtime}/src/example.test.ts`, bundled.toString())],
    bufferedFiles: [
      { path: 'settings.json', content: Buffer.from('{}') },
      { path: 'agent-plugins/sample/package/plugin.json', content: Buffer.from('{}') },
      ...['SKILL.md', '__tests__/example.ts', 'fixtures/example.json'].map(name => ({ path: `agent-plugins/sample/package/${name}`, content: bundled })),
      { path: 'agent-plugins/sample/package/fixtures/modified.json', content: changed },
      { path: 'agent-plugins/custom/package/fixtures/example.json', content: bundled },
    ],
    plugins: [{ kind: 'agent', id: 'sample', version: '1', digest: 'a'.repeat(64), enabled: true, shipped: true },
      { kind: 'agent', id: 'custom', version: '1', digest: 'b'.repeat(64), enabled: false, shipped: true }],
  });
  const { zip, calls } = encoder();
  const credentialWarnings: { path: string; kind: string }[] = [];
  const progress = { filesDone: 0, bytesDone: 0, filesTotal: 0, bytesTotal: 0 };
  await buildShareZip({ plan: content, zip }, { bundledFilePolicy, credentialWarnings, progress });
  const picked = calls[0]!.files;
  const manifest = JSON.parse(await picked.at(-1)!.text());
  const paths = manifest.files.map((file: { path: string }) => file.path);
  assert.equal(manifest.formatVersion, 2);
  assert.deepEqual(paths, ['settings.json', 'agent-plugins/sample/package/plugin.json', 'agent-plugins/sample/package/SKILL.md',
    'agent-plugins/sample/package/__tests__/example.ts', 'agent-plugins/sample/package/fixtures/example.json',
    'agent-plugins/sample/package/fixtures/modified.json', 'agent-plugins/custom/package/fixtures/example.json',
    'content.db', 'agent-plugins/sample/package/src/example.test.ts']);
  assert.equal(picked.length, paths.length + 1);
  assert.deepEqual([progress.filesDone, progress.filesTotal], [paths.length, paths.length]);
  const retainedBytes = manifest.files.reduce((sum: number, file: { bytes: number }) => sum + file.bytes, 0);
  assert.deepEqual([progress.bytesDone, progress.bytesTotal], [retainedBytes, retainedBytes]);
  assert.deepEqual([...new Set(credentialWarnings.map(warning => warning.path))].sort(), [
    'agent-plugins/custom/package/fixtures/example.json', 'agent-plugins/sample/package/fixtures/modified.json',
  ]);
  assert.equal(JSON.stringify(credentialWarnings).includes(key), false);
  assert.equal((await picked[5]!.text()), changed.toString());
  assert.equal((await picked[6]!.text()), bundled.toString());
  for (let index = 0; index < manifest.files.length; index++) {
    const bytes = Buffer.from(await picked[index]!.arrayBuffer());
    assert.equal(manifest.files[index].sha256, createHash('sha256').update(bytes).digest('hex'));
  }
});

function disk(t: TestContext, relative: string, text: string): PlannedDiskFile {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "v2-zip-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const absPath = path.join(root, "file"); fs.writeFileSync(absPath, text);
  const ids = fs.statSync(absPath, { bigint: true });
  return { root: path.dirname(absPath), identity: ids.ino === 0n ? null : `${ids.dev}:${ids.ino}`, nlink: Number(ids.nlink), path: relative, bytes: Buffer.byteLength(text), scope: "themes", absPath, mtimeMs: fs.statSync(absPath).mtimeMs };
}

/** Uses the real share collector so these tests require planning to pin theme and override bytes. */
async function plannedTheme(required: { t: TestContext; relative: string }): Promise<PlannedDiskFile> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "v2-theme-plan-"));
  required.t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, required.relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "page");
  fs.utimesSync(target, 1_700_000_000, 1_700_000_000);
  const sources = { siteDir: root, themesDir: path.join(root, "themes"), mediaUploadsDir: null,
    skillsDir: path.join(root, "skills"), tovuVersion: "test",
    agentPlugins: resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, "agent-plugins") } }) };
  const collected = await collectSiteBackupFiles({ sources, include: { database: false, media: false, themes: true, plugins: false, settings: false } }, { profile: "share" });
  assert.equal(collected.files.length, 1);
  return collected.files[0]!;
}

for (const relative of ["themes/static/site/index.html", "overrides/site/index.html"]) {
  test(`a same-size, same-mtime swap of ${relative} after planning refuses before encoding`, { timeout: 120000 }, async t => {
    const file = await plannedTheme({ t, relative });
    const { zip, calls } = encoder();
    // Prove the unchanged plan can ship before isolating the digest check from metadata checks.
    await buildShareZip({ plan: plan({ files: [file] }), zip }, { packageFiles: new Map() });
    assert.equal(await calls[0]!.files[2]!.text(), "page");
    calls.length = 0;
    fs.writeFileSync(file.absPath, "swap");
    fs.utimesSync(file.absPath, 1_700_000_000, 1_700_000_000);
    const after = fs.statSync(file.absPath);
    assert.deepEqual([after.size, after.mtimeMs], [file.bytes, file.mtimeMs]);
    await assert.rejects(buildShareZip({ plan: plan({ files: [file] }), zip }, { packageFiles: new Map() }), { code: "PLAN_STALE" });
    assert.equal(calls.length, 0);
  });

  test(`a linked directory for ${relative} after planning refuses even with matching bytes`, { timeout: 120000, skip: process.platform === "win32" }, async t => {
    const file = await plannedTheme({ t, relative });
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "v2-theme-outside-"));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const replacement = path.join(outside, "index.html");
    fs.writeFileSync(replacement, "page");
    fs.utimesSync(replacement, 1_700_000_000, 1_700_000_000);
    fs.rmSync(path.dirname(file.absPath), { recursive: true });
    fs.symlinkSync(outside, path.dirname(file.absPath));
    // Matching content defeats the digest alone; only the verified path rejects this substitution.
    assert.equal(fs.readFileSync(file.absPath, "utf8"), "page");
    const after = fs.statSync(file.absPath);
    assert.deepEqual([after.size, after.mtimeMs], [file.bytes, file.mtimeMs]);
    const { zip, calls } = encoder();
    await assert.rejects(buildShareZip({ plan: plan({ files: [file] }), zip }, { packageFiles: new Map() }), { code: "PLAN_STALE" });
    assert.equal(calls.length, 0);
  });
}

test("root v2 inventory matches every actual entry and its mapped path", { timeout: 120000 }, async t => {
  const { zip, calls } = encoder();
  const progress = { filesDone: 0, bytesDone: 0, filesTotal: 3, bytesTotal: 8 };
  await buildShareZip({ plan: plan({ files: [disk(t, "themes/static/site/index.html", "page")] }), zip }, { packageFiles: new Map(), progress });
  const picked = calls[0]!.files;
  const names = picked.map(file => (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? file.name);
  assert.deepEqual(names, ["share/settings.json", "share/content.db", "share/themes/site/index.html", "manifest.json"]);
  const manifest = JSON.parse(await picked.at(-1)!.text());
  assert.equal(manifest.formatVersion, 2);
  assert.deepEqual(manifest.files.map((file: { path: string }) => file.path), ["settings.json", "content.db", "themes/site/index.html"]);
  assert.deepEqual(await Promise.all(picked.slice(0, 3).map(file => file.text())), ["{}", "db", "page"]);
  assert.equal(progress.filesDone, 3); assert.equal(progress.bytesDone, 8);
  assert.equal(calls[0]!.maxBytes, SHARE_LIMITS.maxArchiveBytes);
});
test("stale disk files and unsafe aliases refuse before encoding", { timeout: 120000 }, async t => {
  const file = disk(t, "themes/static/site/index.html", "page"), { zip, calls } = encoder();
  fs.writeFileSync(file.absPath, "changed");
  await assert.rejects(buildShareZip({ plan: plan({ files: [file] }), zip }), { code: "PLAN_STALE" });
  for (const paths of [["themes/A.txt", "themes/a.txt"], ["themes/Dir/a", "themes/dir/b"], ["themes/x", "themes/x/y"], ["manifest.json"]]) {
    await assert.rejects(buildShareZip({ plan: plan({ bufferedFiles: paths.map(path => ({ path, content: Buffer.from("x") })) }), zip }), { code: "UNSAFE_PATH" });
  }
  assert.equal(calls.length, 0);
});
test("limits refuse and credential-looking files stay included before encoding", { timeout: 120000 }, async () => {
  const { zip, calls } = encoder();
  await assert.rejects(buildShareZip({ plan: plan({ totalBytes: SHARE_LIMITS.maxExpandedBytes + 1 }), zip }), { code: "LIMIT_EXCEEDED" });
  assert.equal(calls.length, 0);
  const credentialWarnings: import("../credential-warnings.js").CredentialWarning[] = [];
  await buildShareZip({ plan: plan({ bufferedFiles: [SETTINGS, { path: "themes/site/script.js", content: Buffer.from('const key="gh' + 'p_' + "x".repeat(36) + '"') }] }), zip }, { credentialWarnings });
  assert.equal(calls.length, 1);
  assert.match(JSON.stringify(credentialWarnings), /themes\/site\/script.js/);
  assert.equal(calls[0]!.files.some(file => (file.webkitRelativePath ?? file.name).endsWith("script.js")), true);
});
test("v2 requires the database and portable settings", { timeout: 120000 }, async () => {
  const { zip } = encoder();
  await assert.rejects(buildShareZip({ plan: plan({ database: null }), zip }), { code: "INVALID_ARCHIVE" });
  await assert.rejects(buildShareZip({ plan: plan({ bufferedFiles: [] }), zip }), { code: "INVALID_ARCHIVE" });
});
test("cancellation and encoder failures preserve their error", { timeout: 120000 }, async () => {
  const stopped = new Error("stopped");
  await assert.rejects(buildShareZip({ plan: plan(), zip: encoder().zip }, { signal: AbortSignal.abort(stopped) }), stopped);
  await assert.rejects(buildShareZip({ plan: plan(), zip: encoder(new Error("too large")).zip }), { code: "LIMIT_EXCEEDED" });
  const failure = new Error("encoder broke");
  await assert.rejects(buildShareZip({ plan: plan(), zip: encoder(failure).zip }), failure);
});

// Restored 2026-10-27 (owner rule: never merge, drop or loosen tests). The v2 rewrite folded these 22
// parameter-expanded cases into the five tests above; each is back, ported to the v2 layout
// (`content.db` and `manifest.json` at the root, required `settings.json`).
const ZIP_BYTES = Buffer.from("encoded");
const LIMIT = (message: string) => ({ code: "LIMIT_EXCEEDED", message });
const DUPLICATE = { code: "UNSAFE_PATH", message: "Duplicate file or file/directory collision." };
const SETTINGS = { path: "settings.json", content: Buffer.from("{}") };
const credentialShaped = (): Buffer => Buffer.from(["gh", "p_"].join("") + "x".repeat(36));
const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const relativePaths = (args: ZipArgs): string[] => args.files.map(file => (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? `(none) ${file.name}`);
/** An encoder fake that throws any value, Error or not. */
function throwingEncoder(error: unknown): typeof zipFolderFiles { return async () => { throw error; }; }

test("buffered files, then the database, then disk files, then the manifest reach the encoder once", { timeout: 120000 }, async t => {
  const { zip, calls } = encoder();
  const bytes = await buildShareZip({ plan: plan({ bufferedFiles: [SETTINGS, { path: "skills/help/SKILL.md", content: Buffer.from("media") }], files: [disk(t, "themes/page.html", "page")] }), zip });
  assert.deepEqual(bytes, ZIP_BYTES);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.maxBytes, SHARE_LIMITS.maxArchiveBytes);
  assert.deepEqual(relativePaths(calls[0]!), ["share/settings.json", "share/skills/help/SKILL.md", "share/content.db", "share/themes/page.html", "(none) manifest.json"]);
  assert.deepEqual(calls[0]!.files.map(file => file.name), ["settings.json", "SKILL.md", "content.db", "page.html", "manifest.json"]);
});

test("each archived entry keeps its exact bytes", { timeout: 120000 }, async t => {
  const { zip, calls } = encoder();
  await buildShareZip({ plan: plan({ bufferedFiles: [SETTINGS, { path: "skills/help/SKILL.md", content: Buffer.from("media") }], files: [disk(t, "themes/page.html", "page")] }), zip });
  const contents = await Promise.all(calls[0]!.files.slice(0, 4).map(async file => Buffer.from(await file.arrayBuffer()).toString()));
  assert.deepEqual(contents, ["{}", "media", "db", "page"]);
});

test("the manifest inventories every entry with its size and sha256, in archive order", { timeout: 120000 }, async t => {
  const { zip, calls } = encoder();
  await buildShareZip({ plan: plan({ bufferedFiles: [SETTINGS, { path: "skills/help/SKILL.md", content: Buffer.from("media") }], files: [disk(t, "themes/page.html", "page")] }), zip });
  const manifest = JSON.parse(Buffer.from(await calls[0]!.files.at(-1)!.arrayBuffer()).toString());
  assert.deepEqual(manifest.files, [
    { path: "settings.json", bytes: 2, sha256: sha(Buffer.from("{}")) },
    { path: "skills/help/SKILL.md", bytes: 5, sha256: sha(Buffer.from("media")) },
    { path: "content.db", bytes: 2, sha256: sha(Buffer.from("db")) },
    { path: "themes/page.html", bytes: 4, sha256: sha(Buffer.from("page")) },
  ]);
});

test("a plan without a database is refused with the exact v2 message before encoding", { timeout: 120000 }, async t => {
  const { zip, calls } = encoder();
  await assert.rejects(buildShareZip({ plan: plan({ database: null, files: [disk(t, "themes/page.html", "page")] }), zip }),
    { code: "INVALID_ARCHIVE", message: "Invalid v2 share manifest, inventory or schema identity." });
  assert.equal(calls.length, 0);
});

test("progress counts every archived entry and its bytes, not the manifest", { timeout: 120000 }, async t => {
  const progress = { filesDone: 0, filesTotal: 4, bytesDone: 0, bytesTotal: 13 };
  await buildShareZip({ plan: plan({ bufferedFiles: [SETTINGS, { path: "skills/help/SKILL.md", content: Buffer.from("media") }], files: [disk(t, "themes/page.html", "page")] }), zip: encoder().zip }, { progress });
  assert.deepEqual(progress, { filesDone: 4, filesTotal: 4, bytesDone: 13, bytesTotal: 13 });
});

test("the plan's expanded caps are checked before any path claim or read", { timeout: 120000 }, async () => {
  const { zip, calls } = encoder();
  await assert.rejects(buildShareZip({ plan: plan({ totalBytes: SHARE_LIMITS.maxExpandedBytes + 1, bufferedFiles: [SETTINGS, { path: "bad\\path", content: Buffer.from("x") }] }), zip }),
    LIMIT("Share exceeds the 300 MiB expanded cap. Reduce the site or wait for streaming exports."));
  assert.equal(calls.length, 0);
});

test("an unsafe path is refused before any entry is scanned", { timeout: 120000 }, async () => {
  await assert.rejects(buildShareZip({ plan: plan({ bufferedFiles: [SETTINGS, { path: "skills/ok", content: credentialShaped() }, { path: "themes/a?.txt", content: Buffer.from("x") }] }), zip: encoder().zip }),
    { code: "UNSAFE_PATH", message: "Share path 'themes/a?.txt' is unsafe." });
});

test("a file at the manifest path is refused as a duplicate", { timeout: 120000 }, async () => {
  await assert.rejects(buildShareZip({ plan: plan({ bufferedFiles: [SETTINGS, { path: "manifest.json", content: Buffer.from("{}") }] }), zip: encoder().zip }), DUPLICATE);
});

test("a buffered file and the database at the same path are refused as a duplicate", { timeout: 120000 }, async () => {
  await assert.rejects(buildShareZip({ plan: plan({ bufferedFiles: [SETTINGS, { path: "content.db", content: Buffer.from("x") }] }), zip: encoder().zip }), DUPLICATE);
});

test("credential-shaped bytes stay included with a warning", { timeout: 120000 }, async () => {
  const { zip, calls } = encoder();
  const credentialWarnings: import("../credential-warnings.js").CredentialWarning[] = [];
  await buildShareZip({ plan: plan({ bufferedFiles: [SETTINGS, { path: "themes/leak.txt", content: credentialShaped() }] }), zip }, { credentialWarnings });
  assert.equal(calls.length, 1);
  assert.match(JSON.stringify(credentialWarnings), /themes\/leak.txt/);
  assert.equal(calls[0]!.files.some(file => (file.webkitRelativePath ?? file.name).endsWith("leak.txt")), true);
});

test("a disk file that changed since the plan is refused as stale", { timeout: 120000 }, async t => {
  const file = disk(t, "themes/page.html", "page");
  fs.writeFileSync(file.absPath, "changed");
  await assert.rejects(buildShareZip({ plan: plan({ files: [file] }), zip: encoder().zip }),
    { code: "PLAN_STALE", message: "'themes/page.html' changed since the plan was made. Call site_backup_plan again." });
});

test("an already-aborted signal stops at the first entry", { timeout: 120000 }, async () => {
  const controller = new AbortController(); const reason = new Error("stop now"); controller.abort(reason);
  const progress = { filesDone: 0, filesTotal: 2, bytesDone: 0, bytesTotal: 4 };
  await assert.rejects(buildShareZip({ plan: plan(), zip: encoder().zip }, { signal: controller.signal, progress }), reason);
  assert.equal(progress.filesDone, 0);
});

// v1 also covered a plan with no entries at all; v2 always carries settings.json and content.db.
test("an aborted signal stops before encoding even when the plan has no disk files", { timeout: 120000 }, async () => {
  const controller = new AbortController(); const reason = new Error("stop now"); controller.abort(reason);
  const { zip, calls } = encoder();
  await assert.rejects(buildShareZip({ plan: plan({ files: [] }), zip }, { signal: controller.signal }), reason);
  assert.equal(calls.length, 0);
});

test("a live signal lets the share encode", { timeout: 120000 }, async () => {
  assert.deepEqual(await buildShareZip({ plan: plan(), zip: encoder().zip }, { signal: new AbortController().signal }), ZIP_BYTES);
});

// The schema tag is the one free-text manifest field with no length rule (it is matched against
// this runtime's own tag), so it pads the manifest; the site name is capped at 200 characters.
test("a manifest over 2 MiB is refused before encoding", { timeout: 120000 }, async () => {
  const { zip, calls } = encoder();
  await assert.rejects(buildShareZip({ plan: plan({ schema: { index: 1, tag: "t".repeat(SHARE_LIMITS.maxManifestBytes) } }), zip }), LIMIT("Share manifest exceeds 2 MiB."));
  assert.equal(calls.length, 0);
});

test("a manifest of exactly 2 MiB is accepted", { timeout: 120000 }, async () => {
  const { zip, calls } = encoder();
  await buildShareZip({ plan: plan(), zip });
  const baseSize = calls[0]!.files.at(-1)!.size;
  await buildShareZip({ plan: plan({ schema: { index: 1, tag: "test" + "t".repeat(SHARE_LIMITS.maxManifestBytes - baseSize) } }), zip });
  assert.equal(calls[1]!.files.at(-1)!.size, SHARE_LIMITS.maxManifestBytes);
});

test("the file cap counts the manifest itself after every entry is scanned", { timeout: 120000 }, async () => {
  // settings.json + these + content.db = exactly maxFiles entries; the manifest is one more.
  const bufferedFiles = [SETTINGS, ...Array.from({ length: SHARE_LIMITS.maxFiles - 2 }, (_, index) => ({ path: `themes/f${index}`, content: Buffer.from("x") }))];
  const progress = { filesDone: 0, filesTotal: SHARE_LIMITS.maxFiles, bytesDone: 0, bytesTotal: 0 };
  const { zip, calls } = encoder();
  await assert.rejects(buildShareZip({ plan: plan({ bufferedFiles }), zip }, { progress }), LIMIT("Share exceeds the 2,000-file cap. Reduce the site or wait for streaming exports."));
  assert.deepEqual({ scanned: progress.filesDone, encoded: calls.length }, { scanned: SHARE_LIMITS.maxFiles, encoded: 0 });
});

for (const message of ["Folder is over the upload limit.", "Too many entries.", "Archive too LARGE"]) {
  test(`an encoder size failure ('${message}') is reported as the archive cap`, { timeout: 120000 }, async () => {
    await assert.rejects(buildShareZip({ plan: plan(), zip: encoder(new Error(message)).zip }), LIMIT("Share exceeds the 300 MiB ZIP archive cap."));
  });
}

test("any other encoder Error propagates unchanged", { timeout: 120000 }, async () => {
  const error = new Error("disk on fire");
  await assert.rejects(buildShareZip({ plan: plan(), zip: encoder(error).zip }), error);
});

test("a non-Error encoder failure propagates unchanged, even if it mentions a limit", { timeout: 120000 }, async () => {
  await assert.rejects(buildShareZip({ plan: plan(), zip: throwingEncoder("limit") }), (thrown: unknown) => thrown === "limit");
});

for (const linkedBundle of [false, true]) {
  test(`a packaged theme outside the site shares its reviewed bytes (linked bundle: ${linkedBundle})`, { skip: linkedBundle && process.platform === "win32" }, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "packaged-theme-share-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const siteDir = path.join(root, "site");
    const bundle = path.join(root, "bundle");
    fs.mkdirSync(siteDir);
    fs.mkdirSync(path.join(bundle, "themes/static/site"), { recursive: true });
    fs.writeFileSync(path.join(bundle, "themes/static/site/index.html"), "packaged page");
    const bundlePath = linkedBundle ? path.join(root, "bundle-link") : bundle;
    if (linkedBundle) fs.symlinkSync(bundle, bundlePath);
    const themesDir = path.join(bundlePath, "themes");
    const sources = { siteDir, themesDir, mediaUploadsDir: null, skillsDir: path.join(siteDir, "skills"), tovuVersion: "test",
      agentPlugins: resolveAgentPluginLayout({ siteDir }, { env: { TOVU_AGENT_PLUGINS_DIR: path.join(siteDir, "agent-plugins") } }) };
    const collected = await collectSiteBackupFiles({ sources, include: { database: false, media: false, themes: true, plugins: false, settings: false } }, { profile: "share" });
    assert.equal(collected.files.length, 1);
    assert.equal(collected.files[0]!.root, fs.realpathSync(themesDir));
    const { zip, calls } = encoder();
    await buildShareZip({ plan: plan({ files: collected.files }), zip }, { packageFiles: new Map() });
    assert.equal(await calls[0]!.files[2]!.text(), "packaged page");
    assert.equal(calls[0]!.files[2]!.webkitRelativePath, "share/themes/site/index.html");
  });
}
