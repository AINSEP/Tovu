import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { duplicateSite } from "../../duplicate-site.js";
import { InitDirNotEmptyError, SiteDirInvalidError, ValidationError } from "../../errors.js";
import { initSite } from "../../init-site.js";
import { readSiteDir } from "../../read-site-dir.js";

/**
 * @file `duplicateSite` — TDD certification, integration tier.
 *
 * Every fixture here is built under `os.tmpdir()` via `initSite` (never against `sites/**`, and
 * never a filesystem copy of a real site) — hermetic, and mirrors `init-site.integration.test.ts`'s
 * own fixture discipline. Assertions read real files and real database rows; none of them checks a
 * log line, and each is written to fail under the specific bug it targets (e.g. "no error thrown"
 * alone would pass a duplicate that copied nothing, so every positive claim also asserts a count or
 * a value, not just an absence of a throw).
 */

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-duplicate-site-"));
}

/** Seeds one fake chat-history row directly (raw SQL — these tables have no Drizzle declaration)
 *  into an already-`initSite`'d site's `content.db`, and drops one known upload file into
 *  `uploads/`. Mirrors `duplicate-content-db.integration.test.ts`'s own fixture-building approach. */
function seedSourceExtras(siteDir: string): void {
  const dbPath = path.join(siteDir, "content.db");
  const raw = new Database(dbPath);
  try {
    const now = Date.now();
    raw
      .prepare(
        `INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, title, title_source, created_at, updated_at)
         VALUES ('chat-1', 'ws-1', 'user', 'user-1', 'A real conversation', 'fallback', ?, ?)`
      )
      .run(now, now);
  } finally {
    raw.close();
  }
  fs.writeFileSync(path.join(siteDir, "uploads", "hello.txt"), "known upload bytes");
}

test("a duplicate carries content, uploads, and themes, but never chat history, and gets a fresh identity", () => {
  const parent = mkTempParent();
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Original Client Site" });
    seedSourceExtras(source.dir);

    const targetDir = path.join(parent, "client-b");
    const result = duplicateSite({ sourceDir: source.dir, targetDir, name: "Client B Copy" });

    // Fresh identity — the one field that must NEVER be copied.
    assert.notEqual(result.siteId, source.siteId, "duplicateSite must mint a NEW siteId");
    assert.match(result.siteId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.equal(result.dir, targetDir);

    // config.json — new display name; domain/port reset rather than inherited.
    const config = JSON.parse(fs.readFileSync(path.join(targetDir, "config.json"), "utf8"));
    assert.equal(config.name, "Client B Copy");
    assert.equal(config.domain, null, "a duplicate must not silently inherit the source's custom domain");
    assert.equal(config.port, null, "a duplicate must not silently inherit the source's fixed port");

    // The known upload really made it across, with its real bytes.
    assert.equal(
      fs.readFileSync(path.join(targetDir, "uploads", "hello.txt"), "utf8"),
      "known upload bytes",
      "an uploaded file must survive the duplicate byte-for-byte"
    );

    // themes/ was actually copied, not left an empty placeholder.
    const sourceThemes = fs.readdirSync(path.join(source.dir, "themes")).sort();
    const targetThemes = fs.readdirSync(path.join(targetDir, "themes")).sort();
    assert.ok(sourceThemes.length > 0, "test precondition: the starter template seeds themes/");
    assert.deepEqual(targetThemes, sourceThemes, "themes/ must be a full copy, not left empty");

    // The content database: real content present, chat history NOT present.
    const copyDb = new Database(path.join(targetDir, "content.db"), { readonly: true });
    try {
      const postCount = (copyDb.prepare(`SELECT COUNT(*) AS c FROM posts`).get() as { c: number }).c;
      const sourceDb = new Database(path.join(source.dir, "content.db"), { readonly: true });
      const sourcePostCount = (sourceDb.prepare(`SELECT COUNT(*) AS c FROM posts`).get() as { c: number }).c;
      sourceDb.close();
      assert.ok(sourcePostCount > 0, "test precondition: the starter template seeds posts");
      assert.equal(postCount, sourcePostCount, "post rows must be copied");

      const chatCount = (copyDb.prepare(`SELECT COUNT(*) AS c FROM ai_chats`).get() as { c: number }).c;
      assert.equal(chatCount, 0, "the duplicate must NEVER carry the source's chat history");
    } finally {
      copyDb.close();
    }

    // The SOURCE must be completely untouched by duplicating it.
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(source.dir, ".site-meta.json"), "utf8")).siteId,
      source.siteId,
      "duplicating a site must never rewrite the source's own siteId"
    );
    const sourceDbAfter = new Database(path.join(source.dir, "content.db"), { readonly: true });
    try {
      const stillHasChat = (sourceDbAfter.prepare(`SELECT COUNT(*) AS c FROM ai_chats`).get() as { c: number }).c;
      assert.equal(stillHasChat, 1, "the source's own chat row must be untouched by duplicating it");
    } finally {
      sourceDbAfter.close();
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("the schema stamp is carried from the SOURCE verbatim, never re-derived from the runtime", () => {
  const parent = mkTempParent();
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Stale Client Site" });

    // Simulate a site that has not been migrated to the current runtime — an arbitrary, plainly
    // different stamp from whatever `runtimeSchemaVersion()` reports right now. duplicateSite
    // performs no migration of its own, so honesty here means carrying THIS value forward, not
    // silently upgrading it to the runtime's.
    const metaPath = path.join(source.dir, ".site-meta.json");
    const staleMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    staleMeta.schemaVersion = 1;
    staleMeta.schemaTag = "stale-fake-tag-for-test";
    fs.writeFileSync(metaPath, JSON.stringify(staleMeta, null, 2));

    const targetDir = path.join(parent, "target");
    duplicateSite({ sourceDir: source.dir, targetDir });

    const targetMeta = JSON.parse(fs.readFileSync(path.join(targetDir, ".site-meta.json"), "utf8"));
    assert.equal(targetMeta.schemaVersion, 1, "the duplicate must carry the SOURCE's own schemaVersion, not the runtime's");
    assert.equal(targetMeta.schemaTag, "stale-fake-tag-for-test", "the duplicate must carry the SOURCE's own schemaTag, not the runtime's");
    assert.equal(targetMeta.templateId, staleMeta.templateId, "templateId is an honest fact about this db's lineage, carried forward");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("omitting name defaults the duplicate's display name to the target directory's basename", () => {
  const parent = mkTempParent();
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Original" });
    const targetDir = path.join(parent, "my-new-client-site");

    duplicateSite({ sourceDir: source.dir, targetDir });

    const config = JSON.parse(fs.readFileSync(path.join(targetDir, "config.json"), "utf8"));
    assert.equal(config.name, "my-new-client-site");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("refuses a non-empty target directory, and creates nothing new there", () => {
  const parent = mkTempParent();
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Original" });
    const targetDir = path.join(parent, "occupied");
    fs.mkdirSync(targetDir);
    fs.writeFileSync(path.join(targetDir, "pre-existing.txt"), "do not touch");

    assert.throws(() => duplicateSite({ sourceDir: source.dir, targetDir }), InitDirNotEmptyError);

    // The pre-existing directory must be left exactly as it was — no partial write, no cleanup of
    // an operator-owned directory this call did not itself create.
    assert.deepEqual(fs.readdirSync(targetDir), ["pre-existing.txt"]);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("refuses a source that is not a valid site directory", () => {
  const parent = mkTempParent();
  try {
    const notASite = path.join(parent, "not-a-site");
    fs.mkdirSync(notASite);
    fs.writeFileSync(path.join(notASite, "readme.txt"), "just a folder, not a site");

    assert.throws(() => duplicateSite({ sourceDir: notASite, targetDir: path.join(parent, "target") }), SiteDirInvalidError);

    // Nothing must be created for a refused source.
    assert.equal(fs.existsSync(path.join(parent, "target")), false);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("refuses an invalid target display name without creating anything", () => {
  const parent = mkTempParent();
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Original" });
    const targetDir = path.join(parent, "target");

    assert.throws(() => duplicateSite({ sourceDir: source.dir, targetDir, name: "  " }), ValidationError);
    assert.equal(fs.existsSync(targetDir), false, "an invalid name must create nothing at all");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("the duplicate is independently readable via readSiteDir (both marker files are valid)", () => {
  const parent = mkTempParent();
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Original" });
    const targetDir = path.join(parent, "target");

    duplicateSite({ sourceDir: source.dir, targetDir, name: "Target Site" });

    const { config, meta } = readSiteDir({ dir: targetDir });
    assert.equal(config.name, "Target Site");
    assert.match(meta.siteId, /^[0-9a-f-]{36}$/i);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
