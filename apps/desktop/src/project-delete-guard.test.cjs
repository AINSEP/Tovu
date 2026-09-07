/**
 * @file Direct tests for `project-delete-guard.cjs` — the rule that decides whether a project delete
 * may recursively erase a directory.
 *
 * Real directories and real symlinks on disk throughout, never string fixtures: the guard's whole
 * job is to survive path shapes (`..`, a trailing slash, a symlinked site dir, a sibling whose name
 * merely starts with the repo root's) that a string comparison gets wrong, and only the filesystem
 * can produce them honestly.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { resolveRealPath, isInsideDirectory, mayEraseProjectDirectory } = require("./project-delete-guard.cjs");
const { PROJECT_ORIGIN } = require("./project-registry.cjs");

function tempDir() {
  // Resolved on creation: `os.tmpdir()` is `/var/folders/...` on macOS, itself a symlink to
  // `/private/var/folders/...`. Comparing an unresolved fixture path against the guard's resolved
  // answer would fail for a reason that has nothing to do with the rule under test.
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-delete-guard-")));
}

/** A row in `readTrackedProjects`'s shape. */
function row(siteDir, origin) {
  return { siteDir, createdAt: "2026-01-01T00:00:00.000Z", origin };
}

test("resolveRealPath follows a symlink to its target", () => {
  const base = tempDir();
  const real = path.join(base, "real");
  const link = path.join(base, "link");
  fs.mkdirSync(real);
  fs.symlinkSync(real, link);
  assert.equal(resolveRealPath(link), real);
});

test("resolveRealPath still normalizes a path that does not exist", () => {
  const base = tempDir();
  const messy = path.join(base, "a", "..", "b") + path.sep;
  assert.equal(resolveRealPath(messy), path.join(base, "b"));
});

test("isInsideDirectory is true for the container itself and for anything under it", () => {
  const repoRoot = tempDir();
  const nested = path.join(repoRoot, "sites", "tovu-com");
  fs.mkdirSync(nested, { recursive: true });
  assert.equal(isInsideDirectory(repoRoot, repoRoot), true);
  assert.equal(isInsideDirectory(nested, repoRoot), true);
  assert.equal(isInsideDirectory(`${nested}${path.sep}`, repoRoot), true);
});

test("isInsideDirectory is false for a sibling whose name merely starts with the container's", () => {
  // The exact false positive a `startsWith` prefix test produces, which would refuse a legitimate
  // delete of a folder that has nothing to do with the checkout.
  const base = tempDir();
  const repoRoot = path.join(base, "Tovu");
  const sibling = path.join(base, "Tovu-backup");
  fs.mkdirSync(repoRoot);
  fs.mkdirSync(sibling);
  assert.equal(isInsideDirectory(sibling, repoRoot), false);
});

test("isInsideDirectory is not defeated by a `..` segment that climbs back into the container", () => {
  const repoRoot = tempDir();
  const nested = path.join(repoRoot, "sites", "tovu-com");
  fs.mkdirSync(nested, { recursive: true });
  const roundabout = path.join(repoRoot, "sites", "elsewhere", "..", "tovu-com");
  assert.equal(isInsideDirectory(roundabout, repoRoot), true);
});

test("isInsideDirectory is not defeated by a symlink pointing into the container", () => {
  const base = tempDir();
  const repoRoot = path.join(base, "repo");
  const inside = path.join(repoRoot, "sites", "tovu-com");
  fs.mkdirSync(inside, { recursive: true });
  const decoy = path.join(base, "innocent-looking-site");
  fs.symlinkSync(inside, decoy);
  assert.equal(isInsideDirectory(decoy, repoRoot), true);
});

test("isInsideDirectory is not defeated by a symlinked container", () => {
  const base = tempDir();
  const realRepo = path.join(base, "repo");
  const inside = path.join(realRepo, "sites", "tovu-com");
  fs.mkdirSync(inside, { recursive: true });
  const repoLink = path.join(base, "repo-link");
  fs.symlinkSync(realRepo, repoLink);
  assert.equal(isInsideDirectory(inside, repoLink), true);
});

test("mayEraseProjectDirectory allows only a created row that lives outside the repo root", () => {
  const base = tempDir();
  const repoRoot = path.join(base, "repo");
  const outside = path.join(base, "my-site");
  fs.mkdirSync(repoRoot);
  fs.mkdirSync(outside);
  assert.equal(mayEraseProjectDirectory(row(outside, PROJECT_ORIGIN.created), { repoRoot }), true);
});

test("mayEraseProjectDirectory refuses an adopted row even when it lives outside the repo root", () => {
  const base = tempDir();
  const repoRoot = path.join(base, "repo");
  const outside = path.join(base, "someone-elses-site");
  fs.mkdirSync(repoRoot);
  fs.mkdirSync(outside);
  assert.equal(mayEraseProjectDirectory(row(outside, PROJECT_ORIGIN.adopted), { repoRoot }), false);
});

test("mayEraseProjectDirectory refuses a repo-root directory whatever the row claims", () => {
  // The backstop: this is the arm that saves `<repo>/sites/tovu-com` from a row whose provenance is
  // wrong — a hand-edited projects file, or a future seeding path that forgets to say `adopted`.
  const repoRoot = tempDir();
  const inside = path.join(repoRoot, "sites", "tovu-com");
  fs.mkdirSync(inside, { recursive: true });
  assert.equal(mayEraseProjectDirectory(row(inside, PROJECT_ORIGIN.created), { repoRoot }), false);
  assert.equal(mayEraseProjectDirectory(row(repoRoot, PROJECT_ORIGIN.created), { repoRoot }), false);
});

test("mayEraseProjectDirectory refuses everything when it cannot be told where the repo root is", () => {
  const base = tempDir();
  const outside = path.join(base, "my-site");
  fs.mkdirSync(outside);
  for (const options of [undefined, {}, { repoRoot: "" }, { repoRoot: null }, { repoRoot: 42 }]) {
    assert.equal(mayEraseProjectDirectory(row(outside, PROJECT_ORIGIN.created), options), false, `${JSON.stringify(options)} must refuse`);
  }
});

test("mayEraseProjectDirectory refuses a row with no origin at all", () => {
  const base = tempDir();
  const repoRoot = path.join(base, "repo");
  const outside = path.join(base, "legacy-site");
  fs.mkdirSync(repoRoot);
  fs.mkdirSync(outside);
  assert.equal(mayEraseProjectDirectory({ siteDir: outside, createdAt: "2026-01-01" }, { repoRoot }), false);
  assert.equal(mayEraseProjectDirectory(undefined, { repoRoot }), false);
});

test("isInsideDirectory still catches a directory that no longer exists under a symlinked repo root", () => {
  // The dangerous asymmetry this guards: one side of the comparison follows the symlink and the
  // other does not, so a moved-or-deleted site dir reads as OUTSIDE the repo it plainly sits in.
  const base = tempDir();
  const realRepo = path.join(base, "real-repo");
  fs.mkdirSync(realRepo);
  const repoLink = path.join(base, "repo");
  fs.symlinkSync(realRepo, repoLink);

  const goneButInside = path.join(repoLink, "sites", "tovu-com");
  assert.equal(fs.existsSync(goneButInside), false);
  assert.equal(isInsideDirectory(goneButInside, realRepo), true);
});
