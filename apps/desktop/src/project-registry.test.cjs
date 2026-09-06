/**
 * @file Coverage for `project-registry.cjs` — the tracked-project JSON store the Projects screen's
 * list is built from.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  projectsFilePath,
  readTrackedProjects,
  writeTrackedProjects,
  trackProject,
  untrackProject,
} = require("./project-registry.cjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-project-registry-"));
}

test("projectsFilePath joins the fixed file name onto the given userData dir", () => {
  assert.equal(projectsFilePath("/a/b"), path.join("/a/b", "desktop-projects.json"));
});

test("readTrackedProjects returns an empty list when the file does not exist yet", () => {
  const dir = tempDir();
  assert.deepEqual(readTrackedProjects(projectsFilePath(dir)), []);
});

test("readTrackedProjects treats malformed JSON as empty rather than throwing", () => {
  const dir = tempDir();
  const file = projectsFilePath(dir);
  fs.writeFileSync(file, "not json");
  assert.deepEqual(readTrackedProjects(file), []);
});

test("readTrackedProjects drops rows missing a siteDir or createdAt string", () => {
  const dir = tempDir();
  const file = projectsFilePath(dir);
  fs.writeFileSync(
    file,
    JSON.stringify({ projects: [{ siteDir: "/a" }, { createdAt: "x" }, { siteDir: "/b", createdAt: "2026-01-01" }, "garbage"] }),
  );
  assert.deepEqual(readTrackedProjects(file), [{ siteDir: "/b", createdAt: "2026-01-01" }]);
});

test("trackProject adds a new row and persists it", () => {
  const dir = tempDir();
  const file = projectsFilePath(dir);
  const rows = trackProject(file, "/sites/a");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].siteDir, "/sites/a");
  assert.equal(typeof rows[0].createdAt, "string");
  assert.deepEqual(readTrackedProjects(file), rows);
});

test("trackProject is idempotent — re-tracking the same dir does not duplicate or bump it", () => {
  const dir = tempDir();
  const file = projectsFilePath(dir);
  trackProject(file, "/sites/a");
  const first = readTrackedProjects(file)[0];
  const rows = trackProject(file, "/sites/a");
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], first);
});

test("untrackProject removes only the named row", () => {
  const dir = tempDir();
  const file = projectsFilePath(dir);
  trackProject(file, "/sites/a");
  trackProject(file, "/sites/b");
  const rows = untrackProject(file, "/sites/a");
  assert.deepEqual(rows.map((r) => r.siteDir), ["/sites/b"]);
});

test("untrackProject is a no-op, not an error, on a dir that was never tracked", () => {
  const dir = tempDir();
  const file = projectsFilePath(dir);
  trackProject(file, "/sites/a");
  const rows = untrackProject(file, "/sites/never-tracked");
  assert.deepEqual(rows.map((r) => r.siteDir), ["/sites/a"]);
});

test("writeTrackedProjects creates the parent directory if it does not exist", () => {
  const dir = tempDir();
  const nested = path.join(dir, "nested", "deeper");
  const file = projectsFilePath(nested);
  writeTrackedProjects(file, [{ siteDir: "/x", createdAt: "2026-01-01" }]);
  assert.deepEqual(readTrackedProjects(file), [{ siteDir: "/x", createdAt: "2026-01-01" }]);
});
