/**
 * @file Direct tests for `site-dir-store.cjs`.
 *
 * The `tovu init` path is exercised against a real CLI in one test and a fake `spawnFn` everywhere
 * else, so the decision logic in `resolveSiteDir` is asserted without paying for a site creation per
 * case. Nothing here touches the repo's own `sites/`.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");

const {
  MAX_RECENT_SITE_DIRS,
  SiteDirSelectionCancelled,
  stateFilePath,
  readDesktopState,
  rememberSiteDir,
  existingRecentSiteDirs,
  classifySiteDir,
  initSiteDir,
  adoptSiteDir,
  resolveSiteDir,
} = require("./site-dir-store.cjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-sitedir-"));
}

/** A directory that looks like a booted Tovu site to `classifySiteDir` — both marker files present. */
function fakeSiteDir() {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "fixture" }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: "fixture", schemaVersion: 1 }));
  return dir;
}

function tempStatePath() {
  return stateFilePath(tempDir());
}

/** A `tovu init` child that exits with `code`, having written `output` to stderr. */
function fakeInitChild(code, output = "") {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  queueMicrotask(() => {
    if (output) child.stderr.write(output);
    child.emit("exit", code, null);
  });
  return child;
}

/** A repo root just complete enough for `resolveCliEntry` to succeed. */
function fakeRepoRoot() {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ bin: { tovu: "dist/src/cli/main.js" } }));
  fs.mkdirSync(path.join(root, "dist", "src", "cli"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist", "src", "cli", "main.js"), "");
  return root;
}

test("classifySiteDir calls a folder with a config.json a site", () => {
  assert.equal(classifySiteDir(fakeSiteDir()), "site");
});

test("classifySiteDir calls an absent or empty folder empty", () => {
  assert.equal(classifySiteDir(path.join(tempDir(), "does-not-exist")), "empty");
  assert.equal(classifySiteDir(tempDir()), "empty");
});

test("classifySiteDir calls a folder of unrelated files occupied", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "taxes.pdf"), "");
  assert.equal(classifySiteDir(dir), "occupied");
});

test("classifySiteDir calls a folder with only config.json incomplete, not a site", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "fixture" }));
  // Real, populated data (like `sites/tovu-com`) — non-empty, but still missing `.site-meta.json`.
  fs.writeFileSync(path.join(dir, "content.db"), "");
  assert.equal(classifySiteDir(dir), "incomplete");
});

test("classifySiteDir calls a folder with only .site-meta.json incomplete too", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: "fixture" }));
  assert.equal(classifySiteDir(dir), "incomplete");
});

test("readDesktopState treats a missing or corrupt state file as empty rather than failing", () => {
  assert.deepEqual(readDesktopState(tempStatePath()), { recentSiteDirs: [] });
  const corrupt = tempStatePath();
  fs.mkdirSync(path.dirname(corrupt), { recursive: true });
  fs.writeFileSync(corrupt, "{ truncated");
  assert.deepEqual(readDesktopState(corrupt), { recentSiteDirs: [] });
});

test("rememberSiteDir puts the newest folder first and de-duplicates", () => {
  const statePath = tempStatePath();
  rememberSiteDir(statePath, "/a");
  rememberSiteDir(statePath, "/b");
  rememberSiteDir(statePath, "/a");
  assert.deepEqual(readDesktopState(statePath).recentSiteDirs, ["/a", "/b"]);
});

test("rememberSiteDir caps the list", () => {
  const statePath = tempStatePath();
  for (let i = 0; i < MAX_RECENT_SITE_DIRS + 5; i += 1) rememberSiteDir(statePath, `/site-${i}`);
  const recent = readDesktopState(statePath).recentSiteDirs;
  assert.equal(recent.length, MAX_RECENT_SITE_DIRS);
  assert.equal(recent[0], `/site-${MAX_RECENT_SITE_DIRS + 4}`);
});

test("existingRecentSiteDirs drops folders that were moved or deleted since they were remembered", () => {
  const statePath = tempStatePath();
  const alive = fakeSiteDir();
  rememberSiteDir(statePath, "/gone/for/good");
  rememberSiteDir(statePath, alive);
  assert.deepEqual(existingRecentSiteDirs(statePath), [alive]);
});

test("resolveSiteDir lets TOVU_DESKTOP_SITE_DIR win over everything, without asking", async () => {
  let asked = false;
  const dir = await resolveSiteDir({
    envDir: "/explicit/override",
    statePath: tempStatePath(),
    devFallbackDir: fakeSiteDir(),
    repoRoot: fakeRepoRoot(),
    pickDir: () => {
      asked = true;
      return null;
    },
  });
  assert.equal(dir, "/explicit/override");
  assert.equal(asked, false);
});

test("resolveSiteDir reuses the most recent remembered site, so the user is asked exactly once", async () => {
  const statePath = tempStatePath();
  const first = fakeSiteDir();
  const second = fakeSiteDir();
  rememberSiteDir(statePath, first);
  rememberSiteDir(statePath, second);

  const dir = await resolveSiteDir({
    statePath,
    repoRoot: fakeRepoRoot(),
    pickDir: () => assert.fail("should not have prompted"),
  });
  assert.equal(dir, second);
});

test("resolveSiteDir falls back to the repo's own sites/ dir in a checkout", async () => {
  const fallback = fakeSiteDir();
  const dir = await resolveSiteDir({
    statePath: tempStatePath(),
    devFallbackDir: fallback,
    repoRoot: fakeRepoRoot(),
    pickDir: () => assert.fail("should not have prompted"),
  });
  assert.equal(dir, fallback);
});

test("resolveSiteDir ignores a dev fallback that is not actually a site — the packaged case", async () => {
  const picked = fakeSiteDir();
  const dir = await resolveSiteDir({
    statePath: tempStatePath(),
    devFallbackDir: path.join(tempDir(), "no-such-sites-dir"),
    repoRoot: fakeRepoRoot(),
    pickDir: () => picked,
  });
  assert.equal(dir, picked);
});

test("resolveSiteDir tells pickDir which dev fallback it rejected and why — absent dir", async () => {
  const fallback = path.join(tempDir(), "no-such-sites-dir");
  let received;
  await assert.rejects(
    resolveSiteDir({
      statePath: tempStatePath(),
      devFallbackDir: fallback,
      repoRoot: fakeRepoRoot(),
      pickDir: (rejectedDefault) => {
        received = rejectedDefault;
        return null;
      },
    }),
    SiteDirSelectionCancelled,
  );
  assert.deepEqual(received, { dir: fallback, kind: "empty" });
});

test("resolveSiteDir tells pickDir which dev fallback it rejected and why — real folder, no marker files at all (sites/tovu-com's actual shape)", async () => {
  const fallback = tempDir();
  fs.writeFileSync(path.join(fallback, "content.db"), "");
  let received;
  await assert.rejects(
    resolveSiteDir({
      statePath: tempStatePath(),
      devFallbackDir: fallback,
      repoRoot: fakeRepoRoot(),
      pickDir: (rejectedDefault) => {
        received = rejectedDefault;
        return null;
      },
    }),
    SiteDirSelectionCancelled,
  );
  assert.deepEqual(received, { dir: fallback, kind: "occupied", missing: ["config.json", ".site-meta.json"] });
});

test("resolveSiteDir tells pickDir which single marker file is missing — the half-initialized case", async () => {
  const fallback = tempDir();
  fs.writeFileSync(path.join(fallback, "config.json"), JSON.stringify({ name: "fixture" }));
  fs.writeFileSync(path.join(fallback, "content.db"), "");
  let received;
  await assert.rejects(
    resolveSiteDir({
      statePath: tempStatePath(),
      devFallbackDir: fallback,
      repoRoot: fakeRepoRoot(),
      pickDir: (rejectedDefault) => {
        received = rejectedDefault;
        return null;
      },
    }),
    SiteDirSelectionCancelled,
  );
  assert.deepEqual(received, { dir: fallback, kind: "incomplete", missing: [".site-meta.json"] });
});

test("resolveSiteDir passes null to pickDir when there is nothing to reject (no devFallbackDir)", async () => {
  let received = "not called";
  await assert.rejects(
    resolveSiteDir({
      statePath: tempStatePath(),
      repoRoot: fakeRepoRoot(),
      pickDir: (rejectedDefault) => {
        received = rejectedDefault;
        return null;
      },
    }),
    SiteDirSelectionCancelled,
  );
  assert.equal(received, null);
});

test("resolveSiteDir remembers what the user picked, so the next launch does not ask", async () => {
  const statePath = tempStatePath();
  const picked = fakeSiteDir();
  await resolveSiteDir({ statePath, repoRoot: fakeRepoRoot(), pickDir: () => picked });
  assert.deepEqual(readDesktopState(statePath).recentSiteDirs, [picked]);
});

test("resolveSiteDir reports a cancelled picker as a cancellation, not a failure", async () => {
  await assert.rejects(
    resolveSiteDir({ statePath: tempStatePath(), repoRoot: fakeRepoRoot(), pickDir: () => null }),
    SiteDirSelectionCancelled,
  );
});

test("adoptSiteDir refuses a folder of unrelated files instead of writing a database into it", async () => {
  const occupied = tempDir();
  fs.writeFileSync(path.join(occupied, "taxes.pdf"), "");
  await assert.rejects(
    adoptSiteDir({ dir: occupied, statePath: tempStatePath(), repoRoot: fakeRepoRoot() }),
    /is not a Tovu site and is not empty/,
  );
});

test("adoptSiteDir refuses a half-initialized folder instead of silently accepting it", async () => {
  const incomplete = tempDir();
  fs.writeFileSync(path.join(incomplete, "config.json"), JSON.stringify({ name: "fixture" }));
  fs.writeFileSync(path.join(incomplete, "content.db"), "");
  await assert.rejects(
    adoptSiteDir({ dir: incomplete, statePath: tempStatePath(), repoRoot: fakeRepoRoot() }),
    /is missing \.site-meta\.json — it looks like a half-initialized site/,
  );
});

test("adoptSiteDir runs `tovu init` for an empty folder", async () => {
  const empty = tempDir();
  let args;
  await adoptSiteDir({
    dir: empty,
    statePath: tempStatePath(),
    repoRoot: fakeRepoRoot(),
    name: "My Site",
    baseEnv: {},
    spawnFn: (_command, spawnArgs) => {
      args = spawnArgs;
      return fakeInitChild(0);
    },
  });
  assert.deepEqual(args.slice(1), ["init", empty, "--name", "My Site"]);
});

test("adoptSiteDir does NOT re-init a folder that is already a site", async () => {
  const site = fakeSiteDir();
  await adoptSiteDir({
    dir: site,
    statePath: tempStatePath(),
    repoRoot: fakeRepoRoot(),
    spawnFn: () => assert.fail("should not have run `tovu init` over an existing site"),
  });
});

test("initSiteDir surfaces Tovu's own error code when init fails", async () => {
  await assert.rejects(
    initSiteDir({
      repoRoot: fakeRepoRoot(),
      dir: "/somewhere",
      baseEnv: {},
      spawnFn: () => fakeInitChild(3, "tovu: INIT_DIR_NOT_EMPTY: dir is not empty\n"),
    }),
    /tovu init failed for \/somewhere: INIT_DIR_NOT_EMPTY: dir is not empty/,
  );
});

test("initSiteDir creates a real, servable site through Tovu's actual CLI", async () => {
  const repoRoot = "/Users/la/Programming/Tovu";
  const target = path.join(tempDir(), "created-site");
  await initSiteDir({ repoRoot, dir: target, name: "Created By Test" });

  assert.equal(classifySiteDir(target), "site");
  assert.equal(fs.existsSync(path.join(target, "content.db")), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(target, "config.json"), "utf8")).name, "Created By Test");
});
