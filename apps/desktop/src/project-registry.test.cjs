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
  PROJECT_ORIGIN,
  normalizeOrigin,
  projectsFilePath,
  readTrackedProjects,
  writeTrackedProjects,
  trackProject,
  untrackProject,
  seedDevFallbackProject,
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
  // `origin` is added by the read itself: a row written before provenance existed reads as
  // `adopted`, the value that forbids erasing its directory. See `normalizeOrigin`.
  assert.deepEqual(readTrackedProjects(file), [{ siteDir: "/b", createdAt: "2026-01-01", origin: "adopted" }]);
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
  assert.deepEqual(readTrackedProjects(file), [{ siteDir: "/x", createdAt: "2026-01-01", origin: "adopted" }]);
});

test("seedDevFallbackProject tracks the fallback dir on a truly fresh install", () => {
  const file = projectsFilePath(tempDir());
  const classifySiteDir = () => "site";
  const seeded = seedDevFallbackProject(file, "/repo/sites/tovu-com", classifySiteDir);
  assert.equal(seeded, true);
  assert.deepEqual(
    readTrackedProjects(file).map((r) => r.siteDir),
    ["/repo/sites/tovu-com"],
  );
});

test("seedDevFallbackProject does nothing when the fallback dir does not classify as a site", () => {
  const file = projectsFilePath(tempDir());
  const classifySiteDir = () => "occupied";
  const seeded = seedDevFallbackProject(file, "/repo/sites/tovu-com", classifySiteDir);
  assert.equal(seeded, false);
  assert.deepEqual(readTrackedProjects(file), []);
});

test("seedDevFallbackProject never runs once the projects file exists, even if it holds zero rows", () => {
  // The exact "operator removed every project" shape: `untrackProject` always calls
  // `writeTrackedProjects`, so the file is present with an empty list, not absent.
  const file = projectsFilePath(tempDir());
  writeTrackedProjects(file, []);
  const classifySiteDir = () => "site";
  const seeded = seedDevFallbackProject(file, "/repo/sites/tovu-com", classifySiteDir);
  assert.equal(seeded, false);
  assert.deepEqual(readTrackedProjects(file), []);
});

test("seedDevFallbackProject does not run a second time once something is already tracked", () => {
  const file = projectsFilePath(tempDir());
  trackProject(file, "/sites/other");
  const classifySiteDir = () => "site";
  const seeded = seedDevFallbackProject(file, "/repo/sites/tovu-com", classifySiteDir);
  assert.equal(seeded, false);
  assert.deepEqual(
    readTrackedProjects(file).map((r) => r.siteDir),
    ["/sites/other"],
  );
});

// --- provenance (2026-09-06) ---------------------------------------------------------------
//
// A row's `origin` is what `project-delete-guard.cjs` consults before `handleDelete` is allowed to
// recursively erase a directory. Every rule below therefore fails toward NOT deleting.

test("normalizeOrigin only ever accepts the literal 'created' — everything else reads as adopted", () => {
  assert.equal(normalizeOrigin("created"), PROJECT_ORIGIN.created);
  for (const rejected of [undefined, null, "", "Created", "adopted", "seeded", 1, true, {}, ["created"]]) {
    assert.equal(normalizeOrigin(rejected), PROJECT_ORIGIN.adopted, `${JSON.stringify(rejected)} must not read as created`);
  }
});

test("trackProject defaults to adopted when no provenance is stated", () => {
  const file = projectsFilePath(tempDir());
  const rows = trackProject(file, "/sites/a");
  assert.equal(rows[0].origin, PROJECT_ORIGIN.adopted);
});

test("trackProject records 'created' only when the caller says so", () => {
  const file = projectsFilePath(tempDir());
  trackProject(file, "/sites/a", PROJECT_ORIGIN.created);
  assert.equal(readTrackedProjects(file)[0].origin, PROJECT_ORIGIN.created);
});

test("trackProject never upgrades an existing adopted row to created", () => {
  const file = projectsFilePath(tempDir());
  trackProject(file, "/sites/a", PROJECT_ORIGIN.adopted);
  trackProject(file, "/sites/a", PROJECT_ORIGIN.created);
  assert.deepEqual(readTrackedProjects(file).map((r) => r.origin), [PROJECT_ORIGIN.adopted]);
});

test("seedDevFallbackProject marks its seeded row adopted — it never created that folder", () => {
  const file = projectsFilePath(tempDir());
  seedDevFallbackProject(file, "/repo/sites/tovu-com", () => "site");
  assert.deepEqual(readTrackedProjects(file), [
    { siteDir: "/repo/sites/tovu-com", createdAt: readTrackedProjects(file)[0].createdAt, origin: PROJECT_ORIGIN.adopted },
  ]);
});
