import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertContentDbFileName,
  builtInContentSeedDbPath,
  defaultChatDbPath,
  builtInSeedUploadsDir,
  mediaUploadsDir,
  pluginsInstallDir,
  resolveExportOutputRootDir,
  resolvePublishOutputRootDir,
  resolveShareDirectory,
  resolveSiteStoragePaths,
  resolveSourceControlExportRootDir,
  siteDir,
  siteThemesDir,
} from "../site-paths.js";
import { resolveChatAttachmentUploadDirectory } from "../../../inbound/assistant/chat-attachment-directory.js";

/**
 * @file The `<site>/...` path resolvers the composition roots call: each roots its default at the
 * site dir it is GIVEN (the booted `siteBinding.dir`), and its own `TOVU_*_DIR` env var still wins.
 * `env` is the injected port, so no case here touches `process.env`.
 */

const SITE = path.join(path.sep, "srv", "site-a");
const NO_ENV: NodeJS.ProcessEnv = {};

const ROOTED_RESOLVERS = [
  { name: "resolveExportOutputRootDir", resolve: resolveExportOutputRootDir, envVar: "TOVU_EXPORT_DIR", subpath: ["out", "export"] },
  { name: "resolvePublishOutputRootDir", resolve: resolvePublishOutputRootDir, envVar: "TOVU_PUBLISH_DIR", subpath: ["out", "publish"] },
  { name: "resolveSourceControlExportRootDir", resolve: resolveSourceControlExportRootDir, envVar: "TOVU_SOURCE_CONTROL_EXPORT_DIR", subpath: ["out", "source-control-export"] },
  { name: "pluginsInstallDir", resolve: pluginsInstallDir, envVar: "TOVU_PLUGINS_DIR", subpath: ["plugins"] },
] as const;

for (const { name, resolve, envVar, subpath } of ROOTED_RESOLVERS) {
  test(`${name}: defaults under the given site dir, not siteDir()`, () => {
    assert.equal(resolve({ siteDir: SITE }, { env: NO_ENV }), path.join(SITE, ...subpath));
  });

  test(`${name}: ${envVar} wins over the site dir, resolved to an absolute path`, () => {
    assert.equal(resolve({ siteDir: SITE }, { env: { [envVar]: "relative/override" } }), path.resolve("relative/override"));
  });

  test(`${name}: env defaults to process.env`, () => {
    const expected = process.env[envVar] !== undefined ? path.resolve(process.env[envVar]) : path.join(SITE, ...subpath);
    assert.equal(resolve({ siteDir: SITE }), expected);
  });
}

const DEFAULTED_RESOLVERS = [
  { name: "mediaUploadsDir", resolve: mediaUploadsDir, envVar: "TOVU_MEDIA_UPLOADS_DIR", subpath: "uploads" },
  { name: "siteThemesDir", resolve: siteThemesDir, envVar: "TOVU_THEMES_DIR", subpath: "themes" },
] as const;

for (const { name, resolve, envVar, subpath } of DEFAULTED_RESOLVERS) {
  test(`${name}: a given site dir roots the default`, () => {
    assert.equal(resolve({ siteDir: SITE, env: NO_ENV }), path.join(SITE, subpath));
  });

  test(`${name}: with no site dir it falls back to this process's siteDir()`, () => {
    assert.equal(resolve({ env: NO_ENV }), path.join(siteDir(), subpath));
  });

  test(`${name}: ${envVar} wins verbatim over the site dir`, () => {
    assert.equal(resolve({ siteDir: SITE, env: { [envVar]: "/elsewhere" } }), "/elsewhere");
  });

  test(`${name}: zero-arg call reads process.env and siteDir()`, () => {
    assert.equal(resolve(), process.env[envVar] ?? path.join(siteDir(), subpath));
  });
}

test("builtInContentSeedDbPath / builtInSeedUploadsDir: keyed by the site name they are given", () => {
  assert.equal(path.basename(path.dirname(builtInContentSeedDbPath({ siteName: "site-a" }))), "site-a");
  assert.equal(path.basename(builtInContentSeedDbPath({ siteName: "site-a" })), "content.seed.db");
  assert.equal(path.basename(path.dirname(builtInSeedUploadsDir({ siteName: "site-a" }))), "site-a");
  assert.equal(path.basename(builtInSeedUploadsDir({ siteName: "site-a" })), "uploads");
});

// Hardwiring audit #19: the chat-attachment directory used to be derived from
// `defaultContentDbPath()` (`TOVU_CONTENT_DB ?? siteDir()`) inside the resolver itself, so it named
// the env/cwd site whatever content DB the caller had actually booted. Each case below hands it a
// booted path no env resolution produces, under an EMPTY env.
test("resolveChatAttachmentUploadDirectory: anchored to the GIVEN content DB's directory, not siteDir()", () => {
  assert.equal(
    resolveChatAttachmentUploadDirectory({ contentDbPath: path.join(SITE, "content.db") }, { env: NO_ENV }),
    path.join(SITE, "uploads", "chat-attachments"),
  );
});

test("resolveChatAttachmentUploadDirectory: TOVU_CHAT_ATTACHMENTS_DIR wins over the content DB anchor", () => {
  assert.equal(
    resolveChatAttachmentUploadDirectory({ contentDbPath: path.join(SITE, "content.db") }, { env: { TOVU_CHAT_ATTACHMENTS_DIR: "/staging" } }),
    "/staging",
  );
});

// 1cffdf3cf decouples database placement from the served site: uploads stay in the site.
test("resolveSiteStoragePaths: reports the booted content DB and uploads root, and anchors chat attachments to that DB", () => {
  const dbPath = path.join(path.sep, "elsewhere", "site-a.db");
  assert.deepEqual(resolveSiteStoragePaths({ contentDbPath: dbPath, siteDir: SITE, uploadsDir: path.join(SITE, "media") }, { env: NO_ENV }), {
    contentDbPath: dbPath,
    mediaUploadsDir: path.join(SITE, "media"),
    chatAttachmentsDir: path.join(SITE, "uploads", "chat-attachments"),
  });
});

test("resolveSiteStoragePaths: an in-memory content DB anchors chat attachments to the served site dir, never the cwd", () => {
  assert.equal(
    resolveSiteStoragePaths({ contentDbPath: ":memory:", siteDir: SITE, uploadsDir: path.join(SITE, "uploads") }, { env: NO_ENV }).chatAttachmentsDir,
    path.join(SITE, "uploads", "chat-attachments"),
  );
});

test("assertContentDbFileName: both driver in-memory names pass through untouched", () => {
  assert.equal(assertContentDbFileName({ dbPath: ":memory:" }), ":memory:");
  assert.equal(assertContentDbFileName({ dbPath: "" }), "");
});

test("assertContentDbFileName: a disk path must be a file named content.db, and a file: URI is never exempt", () => {
  assert.equal(assertContentDbFileName({ dbPath: path.join(SITE, "content.db") }), path.join(SITE, "content.db"));
  assert.throws(() => assertContentDbFileName({ dbPath: path.join(SITE, "site.db") }), {
    message: `Give each database its own folder, named content.db: move ${path.join(SITE, "site.db")} to <its own folder>/content.db and point TOVU_CONTENT_DB at that file.`,
  });
  assert.throws(() => assertContentDbFileName({ dbPath: "file:content.db" }), /move file:content\.db to <its own folder>\/content\.db/);
});

/** Run `body` with TOVU_CHAT_DB set to `value` (or removed), restoring the runner's own value after. */
function withChatDbEnv<T>(value: string | undefined, body: () => T): T {
  const saved = process.env.TOVU_CHAT_DB;
  if (value === undefined) delete process.env.TOVU_CHAT_DB; else process.env.TOVU_CHAT_DB = value;
  try { return body(); } finally {
    if (saved === undefined) delete process.env.TOVU_CHAT_DB; else process.env.TOVU_CHAT_DB = saved;
  }
}

test("defaultChatDbPath: TOVU_CHAT_DB wins verbatim over the content DB it is given", () => {
  assert.equal(withChatDbEnv("/chat/override.db", () => defaultChatDbPath({}, { contentDbPath: path.join(SITE, "content.db") })), "/chat/override.db");
});

test("defaultChatDbPath: an in-memory content DB keeps chat.db beside its own (relative) name, never a site lookup", t => {
  // The working directory holds unreadable site metadata: a site lookup for `:memory:` would read it and throw.
  const cwd = mkdtempSync(path.join(tmpdir(), "chat-db-cwd-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(path.join(cwd, ".site-meta.json"), "{ not json");
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    assert.equal(withChatDbEnv(undefined, () => defaultChatDbPath({}, { contentDbPath: ":memory:" })), "chat.db");
  } finally { process.chdir(previous); }
  assert.equal(withChatDbEnv(undefined, () => defaultChatDbPath({}, { contentDbPath: "file:/srv/mem/content.db?mode=memory" })), path.join("file:/srv/mem", "chat.db"));
});

test("resolveShareDirectory: an in-memory database puts ops/shares under the served site dir, created private", t => {
  const site = mkdtempSync(path.join(tmpdir(), "share-dir-"));
  t.after(() => rmSync(site, { recursive: true, force: true }));
  const shares = resolveShareDirectory({ siteDir: site, dbPath: ":memory:", contentRoots: [path.join(site, "public")] });
  assert.equal(shares, path.join(realpathSync(site), "ops", "shares"));
  assert.equal(statSync(shares).mode & 0o777, 0o700);
});

test("resolveShareDirectory: refuses a share folder inside a served content root before creating it", t => {
  const site = mkdtempSync(path.join(tmpdir(), "share-dir-"));
  t.after(() => rmSync(site, { recursive: true, force: true }));
  assert.throws(() => resolveShareDirectory({ siteDir: site, dbPath: ":memory:", contentRoots: [site] }), {
    message: "A site's ops/shares must not be inside a served content folder; give its database its own folder.",
  });
  assert.equal(existsSync(path.join(site, "ops")), false);
});
