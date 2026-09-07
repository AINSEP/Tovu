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
  readDismissedProjects,
  isProjectDirKnown,
  migrateLegacyDismissals,
  discoverSiteDirs,
  adoptDiscoveredProjects,
} = require("./project-registry.cjs");
const { classifySiteDir } = require("./site-dir-store.cjs");

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

// CHANGED BEHAVIOUR, recorded rather than quietly dropped. Both assertions below used to read the
// other way, because the seed's guard was `fs.existsSync(projectsPath)`: any registry file at all,
// however it got there, blocked the seed forever. That over-blocked — an install that had tracked
// one unrelated folder could never be shown the dev fallback — and it is half of why a site created
// outside the shell was invisible. The guard is now per-directory (`isProjectDirKnown`), and the
// property the old check bought is carried by a recorded dismissal instead; the two tests that pin
// THAT down are "never re-seeds a dev fallback the operator removed" and the
// `migrateLegacyDismissals` pair below.
test("seedDevFallbackProject seeds into an empty current-format file — an empty list is not a removal", () => {
  const file = projectsFilePath(tempDir());
  writeTrackedProjects(file, []);
  const seeded = seedDevFallbackProject(file, "/repo/sites/tovu-com", () => "site");
  assert.equal(seeded, true);
  assert.deepEqual(readTrackedProjects(file).map((r) => r.siteDir), ["/repo/sites/tovu-com"]);
  // ...and the shape that IS a removal still blocks it, which is the distinction the old
  // file-existence check could not draw.
  untrackProject(file, "/repo/sites/tovu-com");
  assert.equal(seedDevFallbackProject(file, "/repo/sites/tovu-com", () => "site"), false);
});

test("seedDevFallbackProject is not blocked by an unrelated tracked project", () => {
  const file = projectsFilePath(tempDir());
  trackProject(file, "/sites/other");
  const seeded = seedDevFallbackProject(file, "/repo/sites/tovu-com", () => "site");
  assert.equal(seeded, true);
  assert.deepEqual(
    readTrackedProjects(file).map((r) => r.siteDir),
    ["/sites/other", "/repo/sites/tovu-com"],
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

// ---------------------------------------------------------------------------------------------
// Dismissals, the legacy-format migration, and on-disk discovery.
//
// The property under test throughout: **a project the operator removed on purpose must never be
// re-added by anything automatic** — not the dev-fallback seed, not the boot scan, not a rescan.
// Before dismissals were recorded, the seed enforced that with `fs.existsSync(projectsPath)`,
// which also blocked every legitimate case (a registry file exists, so nothing is ever seeded or
// discovered again). These cover the replacement.
// ---------------------------------------------------------------------------------------------

/** A directory `classifySiteDir` will call a real site: both marker files present. */
function siteFolder(parent, name) {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), "{}");
  fs.writeFileSync(path.join(dir, ".site-meta.json"), "{}");
  return dir;
}

test("untrackProject records the removal, so the operator's 'no' outlives the row", () => {
  const file = projectsFilePath(tempDir());
  trackProject(file, "/sites/a");
  untrackProject(file, "/sites/a");
  assert.deepEqual(readDismissedProjects(file), ["/sites/a"]);
  assert.deepEqual(readTrackedProjects(file), []);
});

test("untrackProject does not duplicate a dismissal when the same dir is removed twice", () => {
  const file = projectsFilePath(tempDir());
  trackProject(file, "/sites/a");
  untrackProject(file, "/sites/a");
  untrackProject(file, "/sites/a");
  assert.deepEqual(readDismissedProjects(file), ["/sites/a"]);
});

test("trackProject clears a dismissal — explicitly adding a folder back is the operator asking for it", () => {
  const file = projectsFilePath(tempDir());
  trackProject(file, "/sites/a");
  untrackProject(file, "/sites/a");
  trackProject(file, "/sites/a");
  assert.deepEqual(readDismissedProjects(file), []);
  assert.deepEqual(readTrackedProjects(file).map((r) => r.siteDir), ["/sites/a"]);
});

test("a plain row write preserves the dismissal list rather than dropping it", () => {
  const file = projectsFilePath(tempDir());
  trackProject(file, "/sites/a");
  untrackProject(file, "/sites/a");
  writeTrackedProjects(file, [{ siteDir: "/sites/b", createdAt: "2026-01-01", origin: "adopted" }]);
  assert.deepEqual(readDismissedProjects(file), ["/sites/a"]);
});

test("isProjectDirKnown is true for a tracked dir, true for a dismissed one, false otherwise", () => {
  const file = projectsFilePath(tempDir());
  trackProject(file, "/sites/tracked");
  trackProject(file, "/sites/removed");
  untrackProject(file, "/sites/removed");
  assert.equal(isProjectDirKnown(file, "/sites/tracked"), true);
  assert.equal(isProjectDirKnown(file, "/sites/removed"), true);
  assert.equal(isProjectDirKnown(file, "/sites/never-seen"), false);
});

test("seedDevFallbackProject now seeds into an EXISTING registry file that has never tracked the dir", () => {
  const file = projectsFilePath(tempDir());
  trackProject(file, "/sites/something-else");
  assert.equal(seedDevFallbackProject(file, "/repo/sites/tovu-com", () => "site"), true);
  assert.ok(readTrackedProjects(file).some((r) => r.siteDir === "/repo/sites/tovu-com"));
});

test("seedDevFallbackProject never re-seeds a dev fallback the operator removed", () => {
  const file = projectsFilePath(tempDir());
  seedDevFallbackProject(file, "/repo/sites/tovu-com", () => "site");
  untrackProject(file, "/repo/sites/tovu-com");
  assert.equal(seedDevFallbackProject(file, "/repo/sites/tovu-com", () => "site"), false);
  assert.deepEqual(readTrackedProjects(file), []);
});

test("seedDevFallbackProject does not re-seed a dir it already tracks", () => {
  const file = projectsFilePath(tempDir());
  seedDevFallbackProject(file, "/repo/sites/tovu-com", () => "site");
  assert.equal(seedDevFallbackProject(file, "/repo/sites/tovu-com", () => "site"), false);
  assert.equal(readTrackedProjects(file).length, 1);
});

test("migrateLegacyDismissals reads a pre-dismissals file that dropped the seed as a deliberate removal", () => {
  const file = projectsFilePath(tempDir());
  // Exactly what the old `untrackProject` left behind: rows, no `dismissed` key at all.
  fs.writeFileSync(file, JSON.stringify({ projects: [] }));
  assert.deepEqual(migrateLegacyDismissals(file, "/repo/sites/tovu-com"), ["/repo/sites/tovu-com"]);
  // The property the old `fs.existsSync` guard bought, now bought by a recorded fact instead.
  assert.equal(seedDevFallbackProject(file, "/repo/sites/tovu-com", () => "site"), false);
});

test("migrateLegacyDismissals leaves a legacy file that DOES track the dev fallback alone", () => {
  const file = projectsFilePath(tempDir());
  fs.writeFileSync(
    file,
    JSON.stringify({ projects: [{ siteDir: "/repo/sites/tovu-com", createdAt: "2026-01-01", origin: "adopted" }] }),
  );
  assert.deepEqual(migrateLegacyDismissals(file, "/repo/sites/tovu-com"), []);
  assert.deepEqual(readDismissedProjects(file), []);
});

test("migrateLegacyDismissals is a no-op with no registry file — a fresh install has removed nothing", () => {
  const file = projectsFilePath(tempDir());
  assert.deepEqual(migrateLegacyDismissals(file, "/repo/sites/tovu-com"), []);
  assert.equal(fs.existsSync(file), false);
  assert.equal(seedDevFallbackProject(file, "/repo/sites/tovu-com", () => "site"), true);
});

test("migrateLegacyDismissals does not re-fire on an already-migrated file", () => {
  const file = projectsFilePath(tempDir());
  fs.writeFileSync(file, JSON.stringify({ projects: [], dismissed: [] }));
  assert.deepEqual(migrateLegacyDismissals(file, "/repo/sites/tovu-com"), []);
  assert.deepEqual(readDismissedProjects(file), []);
  // A second run must not manufacture a tombstone for a dir the operator has simply never seen.
  assert.equal(seedDevFallbackProject(file, "/repo/sites/tovu-com", () => "site"), true);
});

test("discoverSiteDirs finds a real site one level under a scan root", () => {
  const root = path.join(tempDir(), "sites");
  const alpha = siteFolder(root, "alpha");
  assert.deepEqual(discoverSiteDirs({ scanRoots: [root], knownDirs: [], classifySiteDir }), [alpha]);
});

test("discoverSiteDirs ignores an empty folder, a half-initialized site, and a plain file", () => {
  const root = path.join(tempDir(), "sites");
  fs.mkdirSync(path.join(root, "empty"), { recursive: true });
  fs.mkdirSync(path.join(root, "half"), { recursive: true });
  fs.writeFileSync(path.join(root, "half", "config.json"), "{}");
  fs.writeFileSync(path.join(root, "loose-file.txt"), "hi");
  assert.deepEqual(discoverSiteDirs({ scanRoots: [root], knownDirs: [], classifySiteDir }), []);
});

test("discoverSiteDirs does not descend past one level", () => {
  const root = path.join(tempDir(), "sites");
  const buried = siteFolder(path.join(root, "nested"), "deep");
  assert.equal(discoverSiteDirs({ scanRoots: [root], knownDirs: [], classifySiteDir }).includes(buried), false);
});

test("discoverSiteDirs tolerates a scan root that does not exist", () => {
  const root = path.join(tempDir(), "sites");
  const alpha = siteFolder(root, "alpha");
  assert.deepEqual(
    discoverSiteDirs({ scanRoots: ["/no/such/root", root], knownDirs: [], classifySiteDir }),
    [alpha],
  );
});

test("discoverSiteDirs merges knownDirs, filters non-sites out of them, and dedupes", () => {
  const root = path.join(tempDir(), "sites");
  const alpha = siteFolder(root, "alpha");
  const outside = siteFolder(tempDir(), "elsewhere");
  assert.deepEqual(
    discoverSiteDirs({ scanRoots: [root], knownDirs: [alpha, outside, "/gone"], classifySiteDir }),
    [alpha, outside].sort(),
  );
});

test("adoptDiscoveredProjects tracks an untracked site dir and reports it", () => {
  const file = projectsFilePath(tempDir());
  assert.deepEqual(adoptDiscoveredProjects(file, ["/sites/a", "/sites/b"]), ["/sites/a", "/sites/b"]);
  assert.deepEqual(readTrackedProjects(file).map((r) => r.siteDir), ["/sites/a", "/sites/b"]);
});

test("adoptDiscoveredProjects records every discovery as ADOPTED — it created none of them", () => {
  const file = projectsFilePath(tempDir());
  adoptDiscoveredProjects(file, ["/sites/a"]);
  assert.equal(readTrackedProjects(file)[0].origin, PROJECT_ORIGIN.adopted);
});

test("adoptDiscoveredProjects skips a dir the operator removed, and leaves the dismissal in place", () => {
  const file = projectsFilePath(tempDir());
  trackProject(file, "/sites/a");
  untrackProject(file, "/sites/a");
  assert.deepEqual(adoptDiscoveredProjects(file, ["/sites/a"]), []);
  assert.deepEqual(readTrackedProjects(file), []);
  assert.deepEqual(readDismissedProjects(file), ["/sites/a"]);
});

test("adoptDiscoveredProjects does not duplicate or re-date an already-tracked dir", () => {
  const file = projectsFilePath(tempDir());
  trackProject(file, "/sites/a");
  const before = readTrackedProjects(file);
  assert.deepEqual(adoptDiscoveredProjects(file, ["/sites/a"]), []);
  assert.deepEqual(readTrackedProjects(file), before);
});
