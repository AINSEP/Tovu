import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { lstat, readdir } from "node:fs/promises";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { DbOpsPort, RestoreCapability } from "#src/contracts/core/gated-mutations/ports";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";
import {
  buildSiteBackupManifest,
  captureDatabaseSnapshot,
  checkSiteBackupLimits,
  collectSiteBackupFiles,
  formatByteSize,
  readPlannedFile,
  SITE_BACKUP_LIMITS,
  skipOversizedFiles,
  type SiteBackupInclude,
  type SiteBackupSources,
} from "../sources.js";

/**
 * @file `sources.ts`'s proof: which bytes on disk a site backup picks up for each scope switch, what
 * it never picks up (chat history, journals, secrets-bearing files, symlinks), how the database is
 * captured (through `DbOpsPort.captureRestorePoint`, never by reading `content.db`), GitHub's 100 MiB
 * per-file limit, and the manifest a future restore reads first.
 */

const ALL: SiteBackupInclude = { database: true, media: true, themes: true, plugins: true, settings: true };
const NONE: SiteBackupInclude = { database: false, media: false, themes: false, plugins: false, settings: false };

function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** A throwaway site folder shaped like `sites/tovu-com`: every scope's real subtree, plus the files a
 *  backup must never include. */
function makeSite(): { root: string; sources: SiteBackupSources; cleanup: () => void } {
  const root = mkdtempSync(path.join(tmpdir(), "site-backup-sources-"));
  write(path.join(root, "config.json"), JSON.stringify({ name: "Demo", domain: null, port: null }));
  write(path.join(root, ".site-meta.json"), JSON.stringify({ siteId: "s1", schemaVersion: 7, schemaTag: "0007_x" }));
  write(path.join(root, ".mcp.jini-abc.json"), "{\"env\":{\"TOKEN\":\"secret\"}}");
  write(path.join(root, ".fs-custom-root.json"), "{}");
  write(path.join(root, "content.db"), "LIVE-DB-BYTES");
  write(path.join(root, "chat.db"), "CHAT");
  write(path.join(root, "ops", "database-journal.db"), "J");
  write(path.join(root, "uploads", "ws", "workspace-local", "blobs", "ab", "abcdef"), "IMG");
  write(path.join(root, "uploads", "chat-attachments", "x.png"), "CHATIMG");
  write(path.join(root, "themes", "static", "demo", "index.html"), "<html>");
  write(path.join(root, "themes", ".DS_Store"), "junk");
  write(path.join(root, "themes", "static", "demo", ".git", "HEAD"), "ref: x");
  write(path.join(root, "agent-plugins", "ws", "workspace-local", "activations.json"), "{}");
  write(path.join(root, "agent-plugins", "ws", "workspace-local", "bundled-digests.json"), "{}");
  write(path.join(root, "agent-plugins", "ws", "workspace-local", "packages", "sha256", "d1", "plugin.json"), "{}");
  write(path.join(root, "agent-plugins", "ws", "workspace-local", "packages", "superseded-2026-09-10", "d0", "plugin.json"), "{}");
  write(path.join(root, "agent-plugins", "ws", "workspace-local", "data", "higgsfield", "oauth.json"), "{\"token\":\"t\"}");
  write(path.join(root, "agent-plugins", "ws", "workspace-local", "staging", "tmp"), "t");
  // Layout B: each installed plugin owns `<ws>/<pluginId>/{package/sha256,memory,data}`.
  write(path.join(root, "agent-plugins", "ws", "workspace-local", "composio", "package", "sha256", "d2", "plugin.json"), "{}");
  write(path.join(root, "agent-plugins", "ws", "workspace-local", "composio", "package", "sha256", "d2", "skills", "composio", "SKILL.md"), "# s");
  write(path.join(root, "agent-plugins", "ws", "workspace-local", "composio", "memory", "learned", "facts.md"), "fact");
  write(path.join(root, "agent-plugins", "ws", "workspace-local", "composio", "memory", "notes", "notes.md"), "note");
  write(path.join(root, "agent-plugins", "ws", "workspace-local", "composio", "data", "oauth.json"), "{\"token\":\"t\"}");
  write(path.join(root, "skills", "ws", "workspace-local", "incident-response", "SKILL.md"), "# skill");
  const sources: SiteBackupSources = {
    siteDir: root,
    mediaUploadsDir: path.join(root, "uploads"),
    themesDir: path.join(root, "themes"),
    agentPlugins: resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, "agent-plugins") } }),
    skillsDir: path.join(root, "skills"),
    tovuVersion: "0.1.0",
  };
  return { root, sources, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function paths(files: readonly { path: string }[]): string[] {
  return files.map((f) => f.path).sort();
}

test("every scope switched on: exactly the scope subtrees, never the live database, chat history, journals, or secrets-bearing files", async () => {
  const site = makeSite();
  try {
    const result = await collectSiteBackupFiles({ sources: site.sources, include: ALL });
    assert.deepEqual(paths(result.files), [
      "agent-plugins/ws/workspace-local/activations.json",
      "agent-plugins/ws/workspace-local/bundled-digests.json",
      "agent-plugins/ws/workspace-local/composio/memory/learned/facts.md",
      "agent-plugins/ws/workspace-local/composio/memory/notes/notes.md",
      "agent-plugins/ws/workspace-local/composio/package/sha256/d2/plugin.json",
      "agent-plugins/ws/workspace-local/composio/package/sha256/d2/skills/composio/SKILL.md",
      "agent-plugins/ws/workspace-local/packages/sha256/d1/plugin.json",
      "settings/.site-meta.json",
      "settings/config.json",
      "skills/ws/workspace-local/incident-response/SKILL.md",
      "themes/static/demo/index.html",
      "uploads/ws/workspace-local/blobs/ab/abcdef",
    ]);
    // The database scope is never a disk walk: it arrives through captureDatabaseSnapshot alone.
    for (const file of result.files) {
      assert.doesNotMatch(file.path, /content\.db|chat\.db|journal|\.mcp\.|fs-custom-root|oauth|staging|superseded|chat-attachments|\.DS_Store|\.git\//);
    }
  } finally {
    site.cleanup();
  }
});

// RED (live 2026-10-18): Finder's themes/.DS_Store refused the whole share as a suspicious path.
test("share profile drops Finder's .DS_Store instead of refusing the share", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "site-share-dsstore-"));
  try {
    write(path.join(root, "themes", ".DS_Store"), "junk");
    write(path.join(root, "themes", "static", "demo", ".DS_Store"), "junk");
    write(path.join(root, "themes", "static", "demo", "index.html"), "<html>");
    const sources = { siteDir: root, mediaUploadsDir: null, themesDir: path.join(root, "themes"), agentPlugins: resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, "agent-plugins") } }), skillsDir: path.join(root, "skills"), tovuVersion: "0.1.0" };
    const collected = await collectSiteBackupFiles({ sources, include: { database: false, media: false, themes: true, plugins: false, settings: false } }, { profile: "share" });
    assert.deepEqual(paths(collected.files), ["themes/static/demo/index.html"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("plugins scope: each installed plugin's package and memory, found where the installer's own layout puts them; never its data/", async () => {
  const site = makeSite();
  try {
    const result = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, plugins: true } });
    assert.deepEqual(paths(result.files), [
      "agent-plugins/ws/workspace-local/activations.json",
      "agent-plugins/ws/workspace-local/bundled-digests.json",
      "agent-plugins/ws/workspace-local/composio/memory/learned/facts.md",
      "agent-plugins/ws/workspace-local/composio/memory/notes/notes.md",
      "agent-plugins/ws/workspace-local/composio/package/sha256/d2/plugin.json",
      "agent-plugins/ws/workspace-local/composio/package/sha256/d2/skills/composio/SKILL.md",
      "agent-plugins/ws/workspace-local/packages/sha256/d1/plugin.json",
      "skills/ws/workspace-local/incident-response/SKILL.md",
    ]);
    assert.ok(result.files.every((f) => f.scope === "plugins"));
  } finally {
    site.cleanup();
  }
});

test("scope switches are independent: themes + settings alone picks up nothing else", async () => {
  const site = makeSite();
  try {
    const result = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true, settings: true } });
    assert.deepEqual(paths(result.files), ["settings/.site-meta.json", "settings/config.json", "themes/static/demo/index.html"]);
    assert.ok(result.files.every((f) => f.scope === "themes" || f.scope === "settings"));
  } finally {
    site.cleanup();
  }
});

test("publish's own scratch folders under themes/ (.publish-staging, .publish-previous) are never backed up", async () => {
  const site = makeSite();
  try {
    write(path.join(site.root, "themes", ".publish-staging", "k1", "theme.json"), "{}");
    write(path.join(site.root, "themes", ".publish-previous", "k0", "static", "demo", "index.html"), "<old>");
    const result = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true } });
    assert.deepEqual(paths(result.files), ["themes/static/demo/index.html"]);
  } finally {
    site.cleanup();
  }
});

test("every file carries its size, and each scope is tagged", async () => {
  const site = makeSite();
  try {
    const result = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, media: true } });
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0]!.bytes, 3);
    assert.equal(result.files[0]!.scope, "media");
  } finally {
    site.cleanup();
  }
});

test("a symlink is never followed — it is skipped and reported, so a link to ~/.ssh cannot ride along", async () => {
  const site = makeSite();
  const outside = mkdtempSync(path.join(tmpdir(), "site-backup-outside-"));
  try {
    write(path.join(outside, "id_rsa"), "PRIVATE KEY");
    symlinkSync(path.join(outside, "id_rsa"), path.join(site.root, "themes", "static", "demo", "key"));
    symlinkSync(outside, path.join(site.root, "uploads", "ws", "linked-dir"));
    const result = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true, media: true } });
    assert.ok(!paths(result.files).some((p) => p.endsWith("/key") || p.includes("linked-dir")));
    assert.deepEqual(
      result.skipped.map((s) => s.path).sort(),
      ["themes/static/demo/key", "uploads/ws/linked-dir"]
    );
    assert.ok(result.skipped.every((s) => /symbolic link/.test(s.reason)));
  } finally {
    site.cleanup();
    rmSync(outside, { recursive: true, force: true });
  }
});

test("plugins scope: a symlinked plugin folder or package store is reported and never followed", async () => {
  const site = makeSite();
  const outside = mkdtempSync(path.join(tmpdir(), "site-backup-outside-"));
  try {
    write(path.join(outside, "sha256", "d9", "plugin.json"), "{}");
    const ws = path.join(site.root, "agent-plugins", "ws", "workspace-local");
    mkdirSync(path.join(ws, "resend"));
    symlinkSync(outside, path.join(ws, "resend", "package"));
    symlinkSync(outside, path.join(ws, "linked-plugin"));
    const result = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, plugins: true } });
    assert.ok(!paths(result.files).some((p) => p.includes("d9")));
    const reason = "a symbolic link — never followed, so nothing outside the site can ride along";
    assert.deepEqual([...result.skipped].sort((a, b) => (a.path < b.path ? -1 : 1)), [
      { path: "agent-plugins/ws/workspace-local/linked-plugin", reason },
      { path: "agent-plugins/ws/workspace-local/resend/package", reason },
    ]);
  } finally {
    site.cleanup();
    rmSync(outside, { recursive: true, force: true });
  }
});

test("media stored in object storage (no uploads folder on disk) is reported as not included, never silently dropped", async () => {
  const site = makeSite();
  try {
    const result = await collectSiteBackupFiles({ sources: { ...site.sources, mediaUploadsDir: null }, include: { ...NONE, media: true } });
    assert.deepEqual(result.files, []);
    assert.match(result.scopeNotes.media ?? "", /object storage/);
  } finally {
    site.cleanup();
  }
});

test("media remote by the site setting (isMediaRemote answers true): the unused uploads folder is not walked and the note is written", async () => {
  const site = makeSite();
  try {
    let asked = 0;
    const isMediaRemote = async () => { asked += 1; return true; };
    const result = await collectSiteBackupFiles({ sources: { ...site.sources, isMediaRemote }, include: { ...NONE, media: true } });
    assert.deepEqual(result.files, []);
    assert.match(result.scopeNotes.media ?? "", /object storage/);
    assert.equal(asked, 1);
  } finally {
    site.cleanup();
  }
});

test("media local by the site setting (isMediaRemote answers false): the uploads folder is backed up with no note", async () => {
  const site = makeSite();
  try {
    const result = await collectSiteBackupFiles({ sources: { ...site.sources, isMediaRemote: async () => false }, include: { ...NONE, media: true } });
    assert.deepEqual(paths(result.files), ["uploads/ws/workspace-local/blobs/ab/abcdef"]);
    assert.equal(result.scopeNotes.media, undefined);
  } finally {
    site.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Database snapshot — through DbOpsPort, never a live read of content.db
// ---------------------------------------------------------------------------

class FakeDbOps implements DbOpsPort {
  captureCalls: { scopeId: string }[] = [];
  artifactPath: string | null = null;
  constructor(
    private readonly dir: string,
    private readonly capability: RestoreCapability = { costClass: "cheap", kind: "file-snapshot" }
  ) {}
  async getCapabilities(): Promise<{ restorePoint: RestoreCapability }> {
    return { restorePoint: this.capability };
  }
  async captureRestorePoint(required: { scopeId: string }): Promise<{ artifactRef: string; watermarkAtCapture: number }> {
    this.captureCalls.push(required);
    this.artifactPath = path.join(this.dir, `restore-point-${required.scopeId}.db`);
    writeFileSync(this.artifactPath, Buffer.from([0x53, 0x51, 0x4c, 0x00, 0xff, 0x01]));
    return { artifactRef: this.artifactPath, watermarkAtCapture: 42 };
  }
  async restoreFromArtifact(): Promise<{ restartRequired: boolean }> {
    throw new Error("a backup must never restore");
  }
}

test("the database snapshot comes from captureRestorePoint's artifact (byte-exact, binary-safe), and the artifact is deleted afterwards", async () => {
  const site = makeSite();
  try {
    const dbOps = new FakeDbOps(site.root);
    const result = await captureDatabaseSnapshot({ dbOps, scopeId: "ws-1" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(dbOps.captureCalls, [{ scopeId: "ws-1" }]);
    assert.deepEqual([...result.bytes], [0x53, 0x51, 0x4c, 0x00, 0xff, 0x01]);
    assert.notEqual(result.bytes.toString("utf8"), "LIVE-DB-BYTES", "the live content.db file must never be the source");
    assert.equal(result.watermarkAtCapture, 42);
    assert.equal(existsSync(dbOps.artifactPath!), false, "the transient restore-point file must not be left beside content.db");
  } finally {
    site.cleanup();
  }
});

test("a database whose restore mechanism is not a cheap file snapshot is refused with the reason, and nothing is captured", async () => {
  const site = makeSite();
  try {
    const dbOps = new FakeDbOps(site.root, { costClass: "expensive", kind: "logical-dump" });
    const result = await captureDatabaseSnapshot({ dbOps, scopeId: "ws-1" });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /SQLite/);
    assert.deepEqual(dbOps.captureCalls, []);
  } finally {
    site.cleanup();
  }
});

test("a snapshot capture failure returns a safe message and a separate diagnostic code", async () => {
  const site = makeSite();
  try {
    const dbOps = new FakeDbOps(site.root);
    dbOps.captureRestorePoint = async () => { throw Object.assign(new Error("private path /secret/content.db: disk failure"), { code: "EIO" }); };
    const result = await captureDatabaseSnapshot({ dbOps, scopeId: "ws-1" });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("capture must fail");
    assert.equal(result.message, "the database snapshot failed; nothing was backed up");
    assert.equal(result.logDetail, "Error(EIO)");
    assert.doesNotMatch(JSON.stringify(result), /\/secret\/content\.db/);
  } finally { site.cleanup(); }
});

test("an unreadable snapshot artifact is removed even on failure; failed cleanup stays caller-safe", async () => {
  const site = makeSite();
  try {
    const dbOps = new FakeDbOps(site.root);
    const artifact = path.join(site.root, "snapshot-link.db");
    symlinkSync(path.join(site.root, "missing-private.db"), artifact);
    assert.equal(lstatSync(artifact).isSymbolicLink(), true);
    dbOps.captureRestorePoint = async () => ({ artifactRef: artifact, watermarkAtCapture: 42 });
    const result = await captureDatabaseSnapshot({ dbOps, scopeId: "ws-1" });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("artifact read must fail");
    assert.equal(result.message, "the database snapshot could not be read back; nothing was backed up");
    assert.match(result.logDetail ?? "", /ENOENT/);
    assert.throws(() => lstatSync(artifact), { code: "ENOENT" }, "read failure must still unlink the artifact");

    const directoryArtifact = path.join(site.root, "directory-artifact");
    mkdirSync(directoryArtifact);
    dbOps.captureRestorePoint = async () => ({ artifactRef: directoryArtifact, watermarkAtCapture: 42 });
    const cleanupFailure = await captureDatabaseSnapshot({ dbOps, scopeId: "ws-1" });
    assert.equal(cleanupFailure.ok, false);
    if (cleanupFailure.ok) assert.fail("directory read must fail");
    assert.equal(cleanupFailure.message, "the database snapshot could not be read back; nothing was backed up");
    assert.match(cleanupFailure.logDetail ?? "", /EISDIR/);
    assert.equal(lstatSync(directoryArtifact).isDirectory(), true);
  } finally { site.cleanup(); }
});

// ---------------------------------------------------------------------------
// Limits — the host's declared per-file ceiling (GitHub: 100 MiB), plus count/total bounds
// ---------------------------------------------------------------------------

/** What the bundled github plugin declares in tovu-source-control.json. */
const GITHUB_HOST = { label: "GitHub", maxFileBytes: 100 * 1024 * 1024 };

test("a file over GitHub's 100 MiB limit is refused, naming the host, the file and its size — never truncated", () => {
  const result = checkSiteBackupLimits(
    [
      { path: "database/content.db", bytes: GITHUB_HOST.maxFileBytes + 1 },
      { path: "uploads/small.png", bytes: 10 },
    ],
    GITHUB_HOST,
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /database\/content\.db/);
  assert.match(result.message, /GitHub's 100 MiB per-file limit/);
  assert.doesNotMatch(result.message, /small\.png/);
});

test("exactly 100 MiB is allowed; the total is summed", () => {
  const result = checkSiteBackupLimits(
    [
      { path: "a", bytes: GITHUB_HOST.maxFileBytes },
      { path: "b", bytes: 5 },
    ],
    GITHUB_HOST,
  );
  assert.deepEqual(result, { ok: true, totalBytes: GITHUB_HOST.maxFileBytes + 5 });
});

test("a host that declares no per-file limit gets no per-file check, only this tool's own caps", () => {
  const result = checkSiteBackupLimits([{ path: "big", bytes: 200 * 1024 * 1024 }], { label: "Other Host" });
  assert.deepEqual(result, { ok: true, totalBytes: 200 * 1024 * 1024 });
});

test("a disk file over the host's per-file limit is left out and named in skipped with its size; exactly the limit stays", () => {
  const file = (filePath: string, bytes: number) => ({ path: filePath, absPath: `/site/${filePath}`, bytes, mtimeMs: 1, scope: "media" as const });
  const result = skipOversizedFiles([file("uploads/a.png", 10), file("uploads/movie.mp4", GITHUB_HOST.maxFileBytes + 1), file("uploads/b.png", GITHUB_HOST.maxFileBytes)], GITHUB_HOST);
  assert.deepEqual(result.files.map((f) => f.path), ["uploads/a.png", "uploads/b.png"]);
  assert.deepEqual(result.skipped, [{ path: "uploads/movie.mp4", reason: "100 MiB, over GitHub's 100 MiB per-file limit" }]);
  assert.deepEqual(skipOversizedFiles([file("big", 200 * 1024 * 1024)], { label: "Other Host" }).skipped, [], "no declared limit, nothing skipped");
});

test("too many files, or too many bytes in total, is refused with the cap named", () => {
  const many = Array.from({ length: 4 }, (_, i) => ({ path: `f${i}`, bytes: 1 }));
  const countResult = checkSiteBackupLimits(many, GITHUB_HOST, { ...SITE_BACKUP_LIMITS, maxFiles: 3 });
  assert.equal(countResult.ok, false);
  if (!countResult.ok) assert.match(countResult.message, /4 files/);
  const totalResult = checkSiteBackupLimits(many, GITHUB_HOST, { ...SITE_BACKUP_LIMITS, maxTotalBytes: 3 });
  assert.equal(totalResult.ok, false);
});

// ---------------------------------------------------------------------------
// Reading a planned file at push time
// ---------------------------------------------------------------------------

test("a planned file that changed after the plan is refused as stale; an unchanged one reads byte-exact", async () => {
  const site = makeSite();
  try {
    const { files } = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true } });
    const planned = files[0]!;
    const fresh = await readPlannedFile(planned);
    assert.equal(fresh.ok, true);
    if (fresh.ok) assert.equal(fresh.bytes.toString("utf8"), "<html>");

    writeFileSync(planned.absPath, "<html>changed");
    utimesSync(planned.absPath, new Date(), new Date(Date.now() + 5000));
    const stale = await readPlannedFile(planned);
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.match(stale.message, /changed since the plan/);
  } finally {
    site.cleanup();
  }
});

test("a same-size edit after planning is refused on its modification time", async () => {
  const site = makeSite();
  try {
    const { files } = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true } });
    const planned = files.find((file) => file.path === "themes/static/demo/index.html");
    assert.ok(planned);
    writeFileSync(planned.absPath, "SECRET");
    utimesSync(planned.absPath, new Date("2026-09-21T12:00:00Z"), new Date("2026-09-21T12:00:00Z"));
    assert.equal(lstatSync(planned.absPath).size, planned.bytes);
    assert.notEqual(lstatSync(planned.absPath).mtimeMs, planned.mtimeMs);
    assert.deepEqual(await readPlannedFile(planned), { ok: false, message: `'${planned.path}' changed since the plan was made. Call site_backup_plan again.` });
  } finally { site.cleanup(); }
});

test("a file replaced after planning by a symlink with matching size and mtime is refused", async () => {
  const site = makeSite();
  const outside = mkdtempSync(path.join(tmpdir(), "backup-swapped-symlink-"));
  try {
    const at = new Date("2026-09-21T12:00:00Z");
    const file = path.join(site.root, "themes", "static", "demo", "index.html");
    utimesSync(file, at, at);
    const { files } = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true } });
    const planned = files.find((file) => file.path === "themes/static/demo/index.html");
    assert.ok(planned);
    const secret = path.join(outside, "private.txt");
    writeFileSync(secret, "SECRET");
    utimesSync(secret, at, at);
    assert.equal(lstatSync(secret).size, planned.bytes);
    assert.equal(lstatSync(secret).mtimeMs, planned.mtimeMs);
    unlinkSync(planned.absPath);
    symlinkSync(secret, planned.absPath);
    assert.deepEqual(await readPlannedFile(planned), { ok: false, message: `'${planned.path}' changed since the plan was made. Call site_backup_plan again.` });
  } finally {
    site.cleanup();
    rmSync(outside, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

test("the manifest names the format, Tovu version, schema, timestamp, scopes, database watermark and every file with its sha256", () => {
  const text = buildSiteBackupManifest({
    createdAt: "2026-09-21T12:00:00.000Z",
    tovuVersion: "0.1.0",
    schema: { index: 57, tag: "0057_example" },
    site: { name: "Demo", folderName: "tovu-com" },
    database: { watermarkAtCapture: 42 },
    include: { ...ALL, plugins: false },
    scopeNotes: { media: "media lives in object storage" },
    files: [{ path: "database/content.db", bytes: 6, sha256: "a".repeat(64) }],
  });
  const manifest = JSON.parse(text) as Record<string, unknown>;
  assert.equal(manifest.format, "tovu-site-backup");
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.createdAt, "2026-09-21T12:00:00.000Z");
  assert.deepEqual(manifest.tovu, { version: "0.1.0" });
  assert.deepEqual(manifest.schema, { index: 57, tag: "0057_example" });
  assert.deepEqual(manifest.database, { path: "database/content.db", engine: "sqlite", watermarkAtCapture: 42 });
  assert.deepEqual(manifest.scopes, {
    database: { included: true },
    media: { included: true, note: "media lives in object storage" },
    themes: { included: true },
    plugins: { included: false },
    settings: { included: true },
  });
  assert.deepEqual(manifest.files, [{ path: "database/content.db", bytes: 6, sha256: "a".repeat(64) }]);
});

const walkFileSystem = { lstat, readdir: (dir: string) => readdir(dir, { withFileTypes: true }) };

test("absent scope folders and settings files produce an empty backup", async (t) => {
  const site = makeSite();
  t.after(site.cleanup);
  for (const name of ["themes", "uploads", "skills", "agent-plugins", "config.json", ".site-meta.json"]) {
    rmSync(path.join(site.root, name), { recursive: true, force: true });
  }
  assert.deepEqual(await collectSiteBackupFiles({ sources: site.sources, include: ALL }, {}), { files: [], skipped: [], scopeNotes: {} });
});

test("settings links and directories are reported instead of read as regular files", async (t) => {
  const site = makeSite();
  t.after(site.cleanup);
  const config = path.join(site.root, "config.json");
  const meta = path.join(site.root, ".site-meta.json");
  unlinkSync(config);
  unlinkSync(meta);
  symlinkSync(path.join(site.root, "content.db"), config);
  mkdirSync(meta);
  assert.deepEqual(await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, settings: true } }), {
    files: [], scopeNotes: {}, skipped: [
      { path: "settings/config.json", reason: "a symbolic link — never followed, so nothing outside the site can ride along" },
      { path: "settings/.site-meta.json", reason: "not a regular file" },
    ],
  });
});

for (const fault of [Object.assign(new Error("disk unavailable"), { code: "EIO" }), null, "disk unavailable"]) {
  test(`directory read propagates unexpected ${String(fault)} failures`, async (t) => {
    const site = makeSite();
    t.after(site.cleanup);
    await assert.rejects(collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true } }, {
      fileSystem: { ...walkFileSystem, readdir: async () => { throw fault; } },
    }), error => error === fault);
  });
}

test("a file disappearing between listing and lstat is omitted without losing stable siblings", async (t) => {
  const site = makeSite();
  t.after(site.cleanup);
  const target = path.join(site.root, "config.json");
  const result = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, settings: true } }, {
    fileSystem: { ...walkFileSystem, lstat: async file => {
      if (file === target) throw Object.assign(new Error("removed"), { code: "ENOENT" });
      return lstat(file);
    } },
  });
  assert.deepEqual(paths(result.files), ["settings/.site-meta.json"]);
  assert.deepEqual(result.skipped, []);
});

test("an unexpected lstat failure aborts collection rather than silently omitting a file", async (t) => {
  const site = makeSite();
  t.after(site.cleanup);
  const failure = Object.assign(new Error("metadata unavailable"), { code: "EIO" });
  await assert.rejects(collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, settings: true } }, {
    fileSystem: { ...walkFileSystem, lstat: async () => { throw failure; } },
  }), error => error === failure);
});

test("plugin workspace links, invalid ids and stray files are not traversed", async (t) => {
  const site = makeSite();
  t.after(site.cleanup);
  const root = site.sources.agentPlugins.workspacesDir;
  symlinkSync(path.join(root, "workspace-local"), path.join(root, "workspace-link"));
  write(path.join(root, "stray.txt"), "not a workspace");
  mkdirSync(path.join(root, "bad_id"));
  // The installer folds ids to lowercase. A directory that only matches after folding is not owned.
  mkdirSync(path.join(root, "WORKSPACE-UPPER"));
  const result = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, plugins: true } });
  assert.deepEqual(result.skipped.map(item => [item.path, item.reason]).sort(), [
    ["agent-plugins/ws/WORKSPACE-UPPER", "not a workspace folder the plugin installer writes"],
    ["agent-plugins/ws/bad_id", "not a workspace folder the plugin installer writes"],
    ["agent-plugins/ws/workspace-link", "a symbolic link — never followed, so nothing outside the site can ride along"],
  ].sort());
  assert.ok(paths(result.files).includes("agent-plugins/ws/workspace-local/activations.json"));
});

test("plugin paths that are missing or regular files are empty, and invalid plugin ids are ignored", async (t) => {
  const site = makeSite();
  t.after(site.cleanup);
  const ws = site.sources.agentPlugins.forWorkspace("workspace-local");
  write(path.join(ws.root, "invalid_id", "package", "sha256", "secret"), "excluded");
  write(path.join(ws.root, "empty-plugin", "package"), "not a directory");
  write(path.join(ws.root, "other-plugin", "memory"), "not a directory");
  const result = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, plugins: true } });
  assert.deepEqual(result.skipped, []);
  assert.ok(result.files.some(file => file.path.endsWith("composio/memory/notes/notes.md")));
  assert.ok(result.files.every(file => !/invalid_id|empty-plugin|other-plugin/.test(file.path)));
});

test("plugin-owned-directory lstat failures other than ENOENT abort collection", async (t) => {
  const site = makeSite();
  t.after(site.cleanup);
  const failure = Object.assign(new Error("package metadata unavailable"), { code: "EIO" });
  const packagePath = path.join(site.sources.agentPlugins.forWorkspace("workspace-local").root, "packages");
  await assert.rejects(collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, plugins: true } }, {
    fileSystem: { ...walkFileSystem, lstat: async file => {
      if (file === packagePath) throw failure;
      return lstat(file);
    } },
  }), error => error === failure);
});

for (const [bytes, formatted] of [[0, "0 B"], [1023, "1023 B"], [1024, "1 KiB"], [1536, "1.5 KiB"], [1048576, "1 MiB"], [1073741824, "1 GiB"], [1610612736, "1.5 GiB"]] as const) {
  test(`${bytes} bytes formats as ${formatted}`, () => assert.equal(formatByteSize(bytes), formatted));
}

test("a planned file replaced by a directory is stale", async (t) => {
  const site = makeSite();
  t.after(site.cleanup);
  const collected = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true } });
  const file = collected.files[0]!;
  unlinkSync(file.absPath);
  mkdirSync(file.absPath);
  assert.deepEqual(await readPlannedFile(file), { ok: false, message: `'${file.path}' changed since the plan was made. Call site_backup_plan again.` });
});

test("a file truncated after fstat is refused and its handle is closed", async () => {
  const file = { path: "themes/index.html", absPath: "/fixture/index.html", scope: "themes" as const, bytes: 6, mtimeMs: 12 };
  let closed = false;
  assert.deepEqual(await readPlannedFile(file, { openFile: async () => ({
    stat: async () => ({ isFile: () => true, size: 6, mtimeMs: 12 }),
    readFile: async () => Buffer.from("short"),
    close: async () => { closed = true; },
  }) }), { ok: false, message: "'themes/index.html' changed since the plan was made. Call site_backup_plan again." });
  assert.equal(closed, true);
});

for (const failingOperation of ["stat", "readFile"] as const) {
  test(`a handle ${failingOperation} failure propagates after closing the handle`, async () => {
    const failure = new Error(`${failingOperation} failed`);
    let closed = false;
    const file = { path: "themes/index.html", absPath: "/fixture/index.html", scope: "themes" as const, bytes: 6, mtimeMs: 12 };
    await assert.rejects(readPlannedFile(file, { openFile: async () => ({
      stat: async () => { if (failingOperation === "stat") throw failure; return { isFile: () => true, size: 6, mtimeMs: 12 }; },
      readFile: async () => { throw failure; },
      close: async () => { closed = true; },
    }) }), error => error === failure);
    assert.equal(closed, true);
  });
}

test("a manifest with no database scope records null and preserves an explicitly empty scope note", () => {
  const manifest = JSON.parse(buildSiteBackupManifest({ createdAt: "2026-10-16T00:00:00Z", tovuVersion: "1", schema: { index: 1, tag: "one" },
    site: { name: "Empty", folderName: "empty" }, database: null, include: NONE, scopeNotes: { settings: "" }, files: [] }));
  assert.equal(manifest.database, null);
  assert.deepEqual(manifest.scopes.settings, { included: false, note: "" });
  assert.deepEqual(manifest.files, []);
});

test("share collection rejects hardlinks and linked scope roots instead of following outside content", async t => {
  const { linkSync } = await import("node:fs");
  const site = makeSite(); t.after(site.cleanup);
  rmSync(path.join(site.sources.themesDir, "static/demo/.git"), { recursive: true, force: true });
  linkSync(path.join(site.sources.themesDir, "static/demo/index.html"), path.join(site.sources.themesDir, "static/demo/alias.html"));
  await assert.rejects(collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true } }, { profile: "share" }), { code: "UNSAFE_FILE", message: /hardlinked/ });
  rmSync(site.sources.themesDir, { recursive: true }); symlinkSync(site.sources.skillsDir, site.sources.themesDir);
  await assert.rejects(collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true } }, { profile: "share" }), { code: "UNSAFE_FILE", message: /linked or special directory/ });
});
for (const root of ["root", "workspacesDir"] as const) test(`share collection rejects linked plugin ${root} before traversal`, async t => {
  const site = makeSite(); t.after(site.cleanup);
  const target = site.sources.agentPlugins[root]; rmSync(target, { recursive: true }); symlinkSync(site.sources.skillsDir, target);
  await assert.rejects(collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, plugins: true } }, { profile: "share" }), { code: "UNSAFE_FILE", message: /linked plugin root/ });
});
test("share directory lstat failures propagate while a directory removed during discovery is empty", async t => {
  const site = makeSite(); t.after(site.cleanup);
  const failure = Object.assign(new Error("cannot inspect directory"), { code: "EIO" });
  await assert.rejects(collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true } }, { profile: "share", fileSystem: { ...walkFileSystem, lstat: async () => { throw failure; } } }), error => error === failure);
  const result = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true } }, { profile: "share", fileSystem: { ...walkFileSystem, lstat: async () => { throw Object.assign(new Error("gone"), { code: "ENOENT" }); } } });
  assert.deepEqual(result, { files: [], skipped: [], scopeNotes: {} });
});
test("share plugin root lstat failures are never hidden as missing installations", async t => {
  const site = makeSite(); t.after(site.cleanup);
  const failure = Object.assign(new Error("cannot inspect plugins"), { code: "EIO" });
  await assert.rejects(collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, plugins: true } }, { profile: "share", fileSystem: { ...walkFileSystem, lstat: async () => { throw failure; } } }), error => error === failure);
});
test("share collection omits only private runtime files and includes overrides and plugin source", async t => {
  const site = makeSite(); t.after(site.cleanup);
  rmSync(path.join(site.sources.themesDir, "static/demo/.git"), { recursive: true, force: true });
  write(path.join(site.root, "plugins/custom/1/src/data/default.json"), "{}");
  write(path.join(site.root, "plugins/custom/1/data/private.json"), "private");
  write(path.join(site.root, "overrides/header.html"), "override");
  write(path.join(site.root, "themes/static/demo/.env.local"), "private");
  const result = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true, plugins: true } }, { profile: "share" });
  assert.ok(paths(result.files).includes("overrides/header.html"));
  assert.ok(paths(result.files).includes("plugins/custom/1/src/data/default.json"));
  assert.equal(paths(result.files).includes("plugins/custom/1/data/private.json"), false);
  assert.equal(paths(result.files).includes("themes/static/demo/.env.local"), false);
  assert.equal(result.files.some(file => /\/memory\//.test(file.path)), false);
});

test("share collection silently omits a plugin workspace whose own name is a private path", async t => {
  const site = makeSite(); t.after(site.cleanup);
  write(path.join(site.root, "agent-plugins/ws/chat.db/activations.json"), "{}");
  write(path.join(site.root, "agent-plugins/ws/chat.db/packages/sha256/d9/plugin.json"), "{}");
  const result = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, plugins: true } }, { profile: "share" });
  assert.equal(result.files.some(file => file.path.includes("chat.db")), false);
  assert.ok(paths(result.files).includes("agent-plugins/ws/workspace-local/activations.json"));
});
test("share collection with no agent-plugins folder at all collects only skills", async t => {
  const site = makeSite(); t.after(site.cleanup);
  rmSync(path.join(site.root, "agent-plugins"), { recursive: true });
  const result = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, plugins: true } }, { profile: "share" });
  assert.deepEqual(paths(result.files), ["skills/ws/workspace-local/incident-response/SKILL.md"]);
});
test("a snapshot larger than the caller's byte cap is refused and its artifact removed", async t => {
  const site = makeSite(); t.after(site.cleanup);
  const dbOps = new FakeDbOps(site.root);
  assert.deepEqual(await captureDatabaseSnapshot({ dbOps, scopeId: "ws-1" }, { maxBytes: 5 }), { ok: false, message: "Database snapshot exceeds the v1 300 MiB share cap." });
  assert.equal(existsSync(dbOps.artifactPath!), false);
});
test("a snapshot within the caller's byte cap is read back", async t => {
  const site = makeSite(); t.after(site.cleanup);
  const result = await captureDatabaseSnapshot({ dbOps: new FakeDbOps(site.root), scopeId: "ws-1" }, { maxBytes: 6 });
  assert.deepEqual(result.ok && [...result.bytes], [0x53, 0x51, 0x4c, 0x00, 0xff, 0x01]);
});
test("a share manifest names the share profile and its sanitization version", () => {
  const manifest = JSON.parse(buildSiteBackupManifest({ profile: "share", createdAt: "2026-10-16T00:00:00Z", tovuVersion: "1", schema: { index: 1, tag: "one" },
    site: { name: "Shared", folderName: "shared" }, database: { watermarkAtCapture: 3 }, include: ALL, scopeNotes: {}, files: [] }));
  assert.deepEqual([manifest.profile, manifest.sanitizationVersion, manifest.database], ["share", 1, { path: "database/content.db", engine: "sqlite", watermarkAtCapture: 3 }]);
});
test("collected files come back sorted by path in code-unit order", async t => {
  const site = makeSite(); t.after(site.cleanup);
  write(path.join(site.root, "themes/static/demo/B.html"), "b");
  const result = await collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true, settings: true } });
  assert.deepEqual(result.files.map(file => file.path), ["settings/.site-meta.json", "settings/config.json", "themes/static/demo/B.html", "themes/static/demo/index.html"]);
});
test("share collection refuses a regular file standing where a scope folder belongs", async t => {
  const site = makeSite(); t.after(site.cleanup);
  rmSync(site.sources.themesDir, { recursive: true }); write(site.sources.themesDir, "not a folder");
  await assert.rejects(collectSiteBackupFiles({ sources: site.sources, include: { ...NONE, themes: true } }, { profile: "share" }), { code: "UNSAFE_FILE", message: "Share refuses linked or special directory 'themes'." });
});
