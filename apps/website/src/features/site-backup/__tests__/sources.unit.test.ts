import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { DbOpsPort, RestoreCapability } from "#src/contracts/core/gated-mutations/ports";
import {
  buildSiteBackupManifest,
  captureDatabaseSnapshot,
  checkSiteBackupLimits,
  collectSiteBackupFiles,
  readPlannedFile,
  SITE_BACKUP_LIMITS,
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
  write(path.join(root, "skills", "ws", "workspace-local", "incident-response", "SKILL.md"), "# skill");
  const sources: SiteBackupSources = {
    siteDir: root,
    mediaUploadsDir: path.join(root, "uploads"),
    themesDir: path.join(root, "themes"),
    agentPluginsDir: path.join(root, "agent-plugins"),
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

// ---------------------------------------------------------------------------
// Limits — GitHub's 100 MiB per-file ceiling, plus count/total bounds
// ---------------------------------------------------------------------------

test("a file over GitHub's 100 MiB limit is refused, naming the file and its size — never truncated", () => {
  const result = checkSiteBackupLimits([
    { path: "database/content.db", bytes: SITE_BACKUP_LIMITS.maxFileBytes + 1 },
    { path: "uploads/small.png", bytes: 10 },
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /database\/content\.db/);
  assert.match(result.message, /100 MiB/);
  assert.doesNotMatch(result.message, /small\.png/);
});

test("exactly 100 MiB is allowed; the total is summed", () => {
  const result = checkSiteBackupLimits([
    { path: "a", bytes: SITE_BACKUP_LIMITS.maxFileBytes },
    { path: "b", bytes: 5 },
  ]);
  assert.deepEqual(result, { ok: true, totalBytes: SITE_BACKUP_LIMITS.maxFileBytes + 5 });
});

test("too many files, or too many bytes in total, is refused with the cap named", () => {
  const many = Array.from({ length: 4 }, (_, i) => ({ path: `f${i}`, bytes: 1 }));
  const countResult = checkSiteBackupLimits(many, { ...SITE_BACKUP_LIMITS, maxFiles: 3 });
  assert.equal(countResult.ok, false);
  if (!countResult.ok) assert.match(countResult.message, /4 files/);
  const totalResult = checkSiteBackupLimits(many, { ...SITE_BACKUP_LIMITS, maxTotalBytes: 3 });
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
