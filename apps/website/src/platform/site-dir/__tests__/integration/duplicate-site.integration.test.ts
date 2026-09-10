import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { openChatDb } from "../../../db/sqlite/chat-db.js";
import { duplicateSite } from "../../duplicate-site.js";
import { InitDirNotEmptyError, InternalError, SiteDirInvalidError, ValidationError } from "../../errors.js";
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
  // `initSite` opens content.db through `openContentDb`, which now drops the ai_chats/
  // ai_chat_messages/assistant_agent_sessions tables the moment they're empty (the two-db split's
  // forward migration, `drop-empty-legacy-chat-tables.ts`), so by the time this fixture runs they
  // no longer exist. Reopen via `openChatDb` first to recreate them (byte-identical DDL to
  // migrations 0023/0051), modeling a PRE-split install whose content.db still holds real rows.
  const raw = openChatDb(dbPath);
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

/**
 * The top-level artifacts a REAL site directory accumulates beside `content.db` — every one of
 * them observed in `sites/tovu-com/` — none of which a duplicate may carry. The `.db`/`.bak`
 * entries are FULL database copies: the restore points are written beside `content.db` by design
 * (Jini `infra/src/db/sqlite/db-ops.ts`), and the backups predate the chat/session split, so they
 * still hold the very `ai_chats` rows a duplicate is supposed to leave behind. Byte contents here
 * are stand-ins — this test asserts on presence, not on SQLite validity.
 */
const NON_PORTABLE_FIXTURE_FILES = [
  "chat.db",
  "chat.db-wal",
  "chat.db-shm",
  "chat.db.bak",
  "content.db.bak",
  "content.db.predelete.bak",
  "content.db.bak-20260812-205241",
  "content.seed.db",
  "restore-point-backfill-execution-credential-aad-wm11-1788380197031.db",
  "restore-point-backfill-execution-credential-aad-wm11-1788380197031.db-wal",
] as const;

/** Derived/operational directories, likewise observed in `sites/tovu-com/`. */
const NON_PORTABLE_FIXTURE_DIRS = ["ops", "out"] as const;

function plantNonPortableArtifacts(siteDir: string): void {
  for (const name of NON_PORTABLE_FIXTURE_FILES) {
    fs.writeFileSync(path.join(siteDir, name), `PRIVATE SOURCE BYTES: ${name}`);
  }
  for (const name of NON_PORTABLE_FIXTURE_DIRS) {
    fs.mkdirSync(path.join(siteDir, name));
    fs.writeFileSync(path.join(siteDir, name, "inner.db"), `PRIVATE SOURCE BYTES: ${name}/inner.db`);
  }
}

test("a duplicate carries none of the source's sidecar databases, restore points, backups, or derived output", () => {
  const parent = mkTempParent();
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Original Client Site" });
    seedSourceExtras(source.dir);
    plantNonPortableArtifacts(source.dir);

    const targetDir = path.join(parent, "client-b");
    duplicateSite({ sourceDir: source.dir, targetDir, name: "Client B Copy" });

    for (const name of [...NON_PORTABLE_FIXTURE_FILES, ...NON_PORTABLE_FIXTURE_DIRS]) {
      assert.equal(
        fs.existsSync(path.join(targetDir, name)),
        false,
        `${name} holds the SOURCE site's own private data and must never reach a duplicate`
      );
    }

    // Not a vacuous pass: the copy really happened, it just left the above behind.
    assert.equal(fs.readFileSync(path.join(targetDir, "uploads", "hello.txt"), "utf8"), "known upload bytes");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("an unclassified new top-level artifact is excluded from a duplicate by default (fail safe)", () => {
  const parent = mkTempParent();
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Original" });
    seedSourceExtras(source.dir);

    // Nothing in this repo has ever heard of these two names. That is exactly the point: the
    // next sidecar/backup/journal someone adds to a site directory must be excluded until a human
    // deliberately classifies it as portable, not carried along because nobody remembered to name it.
    fs.writeFileSync(path.join(source.dir, "some-future-sidecar.db"), "unclassified bytes");
    fs.mkdirSync(path.join(source.dir, "future-cache"));
    fs.writeFileSync(path.join(source.dir, "future-cache", "blob"), "unclassified bytes");

    const targetDir = path.join(parent, "target");
    duplicateSite({ sourceDir: source.dir, targetDir });

    assert.equal(fs.existsSync(path.join(targetDir, "some-future-sidecar.db")), false);
    assert.equal(fs.existsSync(path.join(targetDir, "future-cache")), false);
    assert.equal(fs.readFileSync(path.join(targetDir, "uploads", "hello.txt"), "utf8"), "known upload bytes");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("every directory the site layout calls portable is carried across, not just the ones initSite creates", () => {
  const parent = mkTempParent();
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Original" });

    // `skills/` and `agent-plugins/` are part of the site-folder model (`site-root.ts`'s own doc)
    // but are created lazily by their own features, never by `initSite` — so only a source that
    // actually grew them proves the allowlist is not too narrow.
    for (const name of ["skills", "agent-plugins"]) {
      fs.mkdirSync(path.join(source.dir, name));
      fs.writeFileSync(path.join(source.dir, name, "marker.txt"), `real ${name} content`);
    }

    const targetDir = path.join(parent, "target");
    duplicateSite({ sourceDir: source.dir, targetDir });

    for (const name of ["uploads", "themes", "plugins", "overrides", "skills", "agent-plugins"]) {
      assert.equal(fs.existsSync(path.join(targetDir, name)), true, `${name}/ is portable and must be copied`);
    }
    assert.equal(fs.readFileSync(path.join(targetDir, "skills", "marker.txt"), "utf8"), "real skills content");
    assert.equal(
      fs.readFileSync(path.join(targetDir, "agent-plugins", "marker.txt"), "utf8"),
      "real agent-plugins content"
    );
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("a mid-copy failure leaves no half-populated directory behind, even in a pre-existing empty target", () => {
  const parent = mkTempParent();
  // Restored before the tree is torn down — `fs.rmSync` cannot remove what it cannot read either.
  const unreadable = path.join(parent, "source", "uploads", "locked.bin");
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Original" });
    fs.writeFileSync(path.join(source.dir, "uploads", "hello.txt"), "known upload bytes");

    // One portable entry that cannot be copied: `fs.cpSync` raises EACCES on this file, so the
    // copy loop throws PART WAY THROUGH — after the target directory itself, and after whichever
    // portable entries `readdirSync` happened to yield first, have already landed there.
    fs.writeFileSync(unreadable, "unreadable bytes");
    fs.chmodSync(unreadable, 0o000);

    // The operator's OWN pre-existing empty directory — the case `init-site.ts`'s cleanup contract
    // singles out, and the one where a surviving partial copy is hardest to notice.
    const targetDir = path.join(parent, "operator-made-this");
    fs.mkdirSync(targetDir);

    assert.throws(() => duplicateSite({ sourceDir: source.dir, targetDir }), InternalError);
    assert.equal(
      fs.existsSync(targetDir),
      false,
      "a failed duplicate must leave nothing behind — INV-02 admits no partial install dir"
    );
  } finally {
    if (fs.existsSync(unreadable)) fs.chmodSync(unreadable, 0o644);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

/**
 * C03 (2026-09-07). The test above asserts exactly the property this one does, and passed
 * throughout the bug — because its source has portable entries, so `copyPortableEntries` fires its
 * `onBeforeFirstWrite` callback and `wroteAnything` is true by the time anything fails. It is the
 * shape of green test that tolerates a defect: right assertion, one arm.
 *
 * The arm it does not reach: `validateInitTarget` ACCEPTS a pre-existing empty directory, so
 * `duplicateSite`'s `mkdirSync` (and the `wroteAnything = true` beside it) is skipped; a source with
 * no portable entries never fires the copy callback either; and `config.json` and `content.db` are
 * then both written without raising the flag at all. `cleanupAndRethrow` only removes the target
 * `if (wroteAnything)`, so a failure after that point left `config.json` behind — and the operator's
 * retry hit `InitDirNotEmptyError` about a directory they had created empty themselves.
 *
 * A valid source really can have zero portable entries: `readSiteDir` requires only `config.json`
 * and `.site-meta.json`, and every name on `layout.ts`'s portable allowlist is a DIRECTORY, which
 * archive/restore round-trips routinely drop when empty.
 */
function stripPortableEntries(siteDir: string): void {
  for (const name of ["uploads", "themes", "plugins", "overrides", "skills", "agent-plugins"]) {
    fs.rmSync(path.join(siteDir, name), { recursive: true, force: true });
  }
}

test("a source with no portable entries: a content.db failure into a pre-existing empty target leaves nothing behind", () => {
  const parent = mkTempParent();
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Original" });
    stripPortableEntries(source.dir);
    // Still a valid site by `readSiteDir`'s contract — both marker files are intact — so the write
    // phase is entered and the failure lands where the finding says it does.
    assert.doesNotThrow(() => readSiteDir({ dir: source.dir }));
    // The failure itself: `duplicateContentDb` cannot read a database that is not there.
    fs.rmSync(path.join(source.dir, "content.db"), { force: true });

    const targetDir = path.join(parent, "operator-made-this");
    fs.mkdirSync(targetDir);

    assert.throws(() => duplicateSite({ sourceDir: source.dir, targetDir }));
    assert.equal(
      fs.existsSync(targetDir),
      false,
      `a failed duplicate must leave nothing behind — INV-02 admits no partial install dir. Survivors: ${
        fs.existsSync(targetDir) ? fs.readdirSync(targetDir).join(", ") : "(none)"
      }`
    );
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("after such a failure the operator's retry is not refused as 'not an empty directory'", () => {
  // The symptom the operator actually meets. Asserting the directory is clean is not the same claim
  // as asserting the next attempt works: a leftover `config.json` turns a transient failure into a
  // permanent one whose message blames the operator for a directory they created empty.
  const parent = mkTempParent();
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Original" });
    stripPortableEntries(source.dir);
    const dbPath = path.join(source.dir, "content.db");
    const savedDb = fs.readFileSync(dbPath);
    fs.rmSync(dbPath, { force: true });

    const targetDir = path.join(parent, "operator-made-this");
    fs.mkdirSync(targetDir);
    assert.throws(() => duplicateSite({ sourceDir: source.dir, targetDir }));

    // The operator puts the database back and tries again.
    fs.writeFileSync(dbPath, savedDb);
    fs.mkdirSync(targetDir, { recursive: true });
    const result = duplicateSite({ sourceDir: source.dir, targetDir, name: "Copy" });

    // Both sides realpath'd: on macOS `/var` is a symlink to `/private/var`, and the two spellings
    // name the same directory. The claim is "the retry landed in the operator's target", not which
    // spelling of it `resolveInstallDirTarget` happened to return.
    assert.equal(fs.realpathSync(result.dir), fs.realpathSync(targetDir));
    assert.equal(readSiteDir({ dir: targetDir }).config.name, "Copy");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("a successful duplicate into a pre-existing empty target still succeeds — the flag fix must not make cleanup fire on the happy path", () => {
  // The negative control. Setting `wroteAnything` unconditionally at the top of the try would also
  // make both tests above pass, and would be wrong: `cleanupAndRethrow` must still not run when
  // nothing failed, and a pre-existing target must still be usable.
  const parent = mkTempParent();
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Original" });
    fs.writeFileSync(path.join(source.dir, "uploads", "hello.txt"), "known upload bytes");

    const targetDir = path.join(parent, "operator-made-this");
    fs.mkdirSync(targetDir);

    const result = duplicateSite({ sourceDir: source.dir, targetDir, name: "Copy" });

    assert.equal(readSiteDir({ dir: targetDir }).config.name, "Copy");
    assert.notEqual(result.siteId, readSiteDir({ dir: source.dir }).meta.siteId);
    assert.equal(fs.readFileSync(path.join(targetDir, "uploads", "hello.txt"), "utf8"), "known upload bytes");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2026-09-07 audit claim #4 — private chat attachments follow a duplicate.
//
// `chat.db` (the conversation rows) is deliberately left behind: this file's own header and
// `layout.ts`'s `PORTABLE_ENTRY_NAMES` doc both call conversation history the thing a duplicate
// handed to a different client must not carry. But the BYTES those conversations attached live at
// `<site>/uploads/chat-attachments` (`chat-attachment-directory.ts`), inside the one directory the
// copy takes wholesale — so the history was withheld while its attachments were handed over.
// ---------------------------------------------------------------------------

test("a duplicate carries the site's media uploads but NOT the staged chat attachments under uploads/", () => {
  const parent = mkTempParent();
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Original Client Site" });

    fs.writeFileSync(path.join(source.dir, "uploads", "public-media.txt"), "media library bytes");
    const attachments = path.join(source.dir, "uploads", "chat-attachments");
    fs.mkdirSync(path.join(attachments, "batch-1"), { recursive: true });
    fs.writeFileSync(path.join(attachments, "batch-1", "private-contract.pdf"), "confidential");
    fs.writeFileSync(path.join(attachments, "batch-1", "private-contract.pdf.json"), '{"owner":"user-1"}');

    const targetDir = path.join(parent, "client-b");
    duplicateSite({ sourceDir: source.dir, targetDir, name: "Client B Copy" });

    assert.equal(
      fs.readFileSync(path.join(targetDir, "uploads", "public-media.txt"), "utf8"),
      "media library bytes",
      "the media library must still be carried — this is uploads/'s whole purpose"
    );
    assert.equal(
      fs.existsSync(path.join(targetDir, "uploads", "chat-attachments")),
      false,
      "staged chat attachments are private to the source site's conversations, which are themselves not copied"
    );
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("excluding chat-attachments is name-scoped to the uploads root — an unrelated nested directory of that name is still carried", () => {
  const parent = mkTempParent();
  try {
    const source = initSite({ dir: path.join(parent, "source"), name: "Original Client Site" });
    const nested = path.join(source.dir, "uploads", "media", "chat-attachments");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "screenshot.png"), "a real media asset in a folder named that");

    const targetDir = path.join(parent, "client-b");
    duplicateSite({ sourceDir: source.dir, targetDir, name: "Client B Copy" });

    assert.equal(
      fs.readFileSync(path.join(targetDir, "uploads", "media", "chat-attachments", "screenshot.png"), "utf8"),
      "a real media asset in a folder named that",
      "only the staging directory the daemon actually writes is excluded, not every path segment spelled that way"
    );
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
