/**
 * @file Coverage for `project-registry.js` — the tracked-project JSON store the Projects screen's
 * list is built from.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SITE_ORIGIN, normalizeOrigin, sitesFilePath, readTrackedSites, writeTrackedSites, trackSite, untrackSite, seedDevFallbackSite, readDismissedSites, isSiteDirKnown, migrateLegacyDismissals, discoverSiteDirs, adoptDiscoveredSites } from "./project-registry.js";
import { classifySiteDir } from "./site-dir-store.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-project-registry-"));
}

test("sitesFilePath joins the fixed file name onto the given userData dir", () => {
  assert.equal(sitesFilePath("/a/b"), path.join("/a/b", "desktop-projects.json"));
});

test("readTrackedSites returns an empty list when the file does not exist yet", () => {
  const dir = tempDir();
  assert.deepEqual(readTrackedSites(sitesFilePath(dir)), []);
});

test("readTrackedSites treats malformed JSON as empty rather than throwing", () => {
  const dir = tempDir();
  const file = sitesFilePath(dir);
  fs.writeFileSync(file, "not json");
  assert.deepEqual(readTrackedSites(file), []);
});

test("readTrackedSites drops rows missing a siteDir or createdAt string", () => {
  const dir = tempDir();
  const file = sitesFilePath(dir);
  fs.writeFileSync(
    file,
    JSON.stringify({ projects: [{ siteDir: "/a" }, { createdAt: "x" }, { siteDir: "/b", createdAt: "2026-01-01" }, "garbage"] }),
  );
  // `origin` is added by the read itself: a row written before provenance existed reads as
  // `adopted`, the value that forbids erasing its directory. See `normalizeOrigin`.
  assert.deepEqual(readTrackedSites(file), [{ siteDir: "/b", createdAt: "2026-01-01", origin: "adopted" }]);
});

test("trackSite adds a new row and persists it", () => {
  const dir = tempDir();
  const file = sitesFilePath(dir);
  const rows = trackSite(file, "/sites/a");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].siteDir, "/sites/a");
  assert.equal(typeof rows[0].createdAt, "string");
  assert.deepEqual(readTrackedSites(file), rows);
});

test("trackSite is idempotent — re-tracking the same dir does not duplicate or bump it", () => {
  const dir = tempDir();
  const file = sitesFilePath(dir);
  trackSite(file, "/sites/a");
  const first = readTrackedSites(file)[0];
  const rows = trackSite(file, "/sites/a");
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], first);
});

test("untrackSite removes only the named row", () => {
  const dir = tempDir();
  const file = sitesFilePath(dir);
  trackSite(file, "/sites/a");
  trackSite(file, "/sites/b");
  const rows = untrackSite(file, "/sites/a");
  assert.deepEqual(rows.map((r) => r.siteDir), ["/sites/b"]);
});

test("untrackSite is a no-op, not an error, on a dir that was never tracked", () => {
  const dir = tempDir();
  const file = sitesFilePath(dir);
  trackSite(file, "/sites/a");
  const rows = untrackSite(file, "/sites/never-tracked");
  assert.deepEqual(rows.map((r) => r.siteDir), ["/sites/a"]);
});

test("writeTrackedSites creates the parent directory if it does not exist", () => {
  const dir = tempDir();
  const nested = path.join(dir, "nested", "deeper");
  const file = sitesFilePath(nested);
  writeTrackedSites(file, [{ siteDir: "/x", createdAt: "2026-01-01" }]);
  assert.deepEqual(readTrackedSites(file), [{ siteDir: "/x", createdAt: "2026-01-01", origin: "adopted" }]);
});

test("seedDevFallbackSite tracks the fallback dir on a truly fresh install", () => {
  const file = sitesFilePath(tempDir());
  const classifySiteDir = () => "site";
  const seeded = seedDevFallbackSite(file, "/repo/sites/tovu-com", classifySiteDir);
  assert.equal(seeded, true);
  assert.deepEqual(
    readTrackedSites(file).map((r) => r.siteDir),
    ["/repo/sites/tovu-com"],
  );
});

test("seedDevFallbackSite does nothing when the fallback dir does not classify as a site", () => {
  const file = sitesFilePath(tempDir());
  const classifySiteDir = () => "occupied";
  const seeded = seedDevFallbackSite(file, "/repo/sites/tovu-com", classifySiteDir);
  assert.equal(seeded, false);
  assert.deepEqual(readTrackedSites(file), []);
});

// CHANGED BEHAVIOUR, recorded rather than quietly dropped. Both assertions below used to read the
// other way, because the seed's guard was `fs.existsSync(projectsPath)`: any registry file at all,
// however it got there, blocked the seed forever. That over-blocked — an install that had tracked
// one unrelated folder could never be shown the dev fallback — and it is half of why a site created
// outside the shell was invisible. The guard is now per-directory (`isSiteDirKnown`), and the
// property the old check bought is carried by a recorded dismissal instead; the two tests that pin
// THAT down are "never re-seeds a dev fallback the operator removed" and the
// `migrateLegacyDismissals` pair below.
test("seedDevFallbackSite seeds into an empty current-format file — an empty list is not a removal", () => {
  const file = sitesFilePath(tempDir());
  writeTrackedSites(file, []);
  const seeded = seedDevFallbackSite(file, "/repo/sites/tovu-com", () => "site");
  assert.equal(seeded, true);
  assert.deepEqual(readTrackedSites(file).map((r) => r.siteDir), ["/repo/sites/tovu-com"]);
  // ...and the shape that IS a removal still blocks it, which is the distinction the old
  // file-existence check could not draw.
  untrackSite(file, "/repo/sites/tovu-com");
  assert.equal(seedDevFallbackSite(file, "/repo/sites/tovu-com", () => "site"), false);
});

test("seedDevFallbackSite is not blocked by an unrelated tracked project", () => {
  const file = sitesFilePath(tempDir());
  trackSite(file, "/sites/other");
  const seeded = seedDevFallbackSite(file, "/repo/sites/tovu-com", () => "site");
  assert.equal(seeded, true);
  assert.deepEqual(
    readTrackedSites(file).map((r) => r.siteDir),
    ["/sites/other", "/repo/sites/tovu-com"],
  );
});

// --- provenance (2026-09-06) ---------------------------------------------------------------
//
// A row's `origin` is what `project-delete-guard.js` consults before `handleDelete` is allowed to
// recursively erase a directory. Every rule below therefore fails toward NOT deleting.

test("normalizeOrigin only ever accepts the literal 'created' — everything else reads as adopted", () => {
  assert.equal(normalizeOrigin("created"), SITE_ORIGIN.created);
  for (const rejected of [undefined, null, "", "Created", "adopted", "seeded", 1, true, {}, ["created"]]) {
    assert.equal(normalizeOrigin(rejected), SITE_ORIGIN.adopted, `${JSON.stringify(rejected)} must not read as created`);
  }
});

test("trackSite defaults to adopted when no provenance is stated", () => {
  const file = sitesFilePath(tempDir());
  const rows = trackSite(file, "/sites/a");
  assert.equal(rows[0].origin, SITE_ORIGIN.adopted);
});

test("trackSite records 'created' only when the caller says so", () => {
  const file = sitesFilePath(tempDir());
  trackSite(file, "/sites/a", SITE_ORIGIN.created);
  assert.equal(readTrackedSites(file)[0].origin, SITE_ORIGIN.created);
});

test("trackSite never upgrades an existing adopted row to created", () => {
  const file = sitesFilePath(tempDir());
  trackSite(file, "/sites/a", SITE_ORIGIN.adopted);
  trackSite(file, "/sites/a", SITE_ORIGIN.created);
  assert.deepEqual(readTrackedSites(file).map((r) => r.origin), [SITE_ORIGIN.adopted]);
});

test("seedDevFallbackSite marks its seeded row adopted — it never created that folder", () => {
  const file = sitesFilePath(tempDir());
  seedDevFallbackSite(file, "/repo/sites/tovu-com", () => "site");
  assert.deepEqual(readTrackedSites(file), [
    { siteDir: "/repo/sites/tovu-com", createdAt: readTrackedSites(file)[0].createdAt, origin: SITE_ORIGIN.adopted },
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

test("untrackSite records the removal, so the operator's 'no' outlives the row", () => {
  const file = sitesFilePath(tempDir());
  trackSite(file, "/sites/a");
  untrackSite(file, "/sites/a");
  assert.deepEqual(readDismissedSites(file), ["/sites/a"]);
  assert.deepEqual(readTrackedSites(file), []);
});

test("untrackSite does not duplicate a dismissal when the same dir is removed twice", () => {
  const file = sitesFilePath(tempDir());
  trackSite(file, "/sites/a");
  untrackSite(file, "/sites/a");
  untrackSite(file, "/sites/a");
  assert.deepEqual(readDismissedSites(file), ["/sites/a"]);
});

test("trackSite clears a dismissal — explicitly adding a folder back is the operator asking for it", () => {
  const file = sitesFilePath(tempDir());
  trackSite(file, "/sites/a");
  untrackSite(file, "/sites/a");
  trackSite(file, "/sites/a");
  assert.deepEqual(readDismissedSites(file), []);
  assert.deepEqual(readTrackedSites(file).map((r) => r.siteDir), ["/sites/a"]);
});

test("a plain row write preserves the dismissal list rather than dropping it", () => {
  const file = sitesFilePath(tempDir());
  trackSite(file, "/sites/a");
  untrackSite(file, "/sites/a");
  writeTrackedSites(file, [{ siteDir: "/sites/b", createdAt: "2026-01-01", origin: "adopted" }]);
  assert.deepEqual(readDismissedSites(file), ["/sites/a"]);
});

test("isSiteDirKnown is true for a tracked dir, true for a dismissed one, false otherwise", () => {
  const file = sitesFilePath(tempDir());
  trackSite(file, "/sites/tracked");
  trackSite(file, "/sites/removed");
  untrackSite(file, "/sites/removed");
  assert.equal(isSiteDirKnown(file, "/sites/tracked"), true);
  assert.equal(isSiteDirKnown(file, "/sites/removed"), true);
  assert.equal(isSiteDirKnown(file, "/sites/never-seen"), false);
});

test("seedDevFallbackSite now seeds into an EXISTING registry file that has never tracked the dir", () => {
  const file = sitesFilePath(tempDir());
  trackSite(file, "/sites/something-else");
  assert.equal(seedDevFallbackSite(file, "/repo/sites/tovu-com", () => "site"), true);
  assert.ok(readTrackedSites(file).some((r) => r.siteDir === "/repo/sites/tovu-com"));
});

test("seedDevFallbackSite never re-seeds a dev fallback the operator removed", () => {
  const file = sitesFilePath(tempDir());
  seedDevFallbackSite(file, "/repo/sites/tovu-com", () => "site");
  untrackSite(file, "/repo/sites/tovu-com");
  assert.equal(seedDevFallbackSite(file, "/repo/sites/tovu-com", () => "site"), false);
  assert.deepEqual(readTrackedSites(file), []);
});

test("seedDevFallbackSite does not re-seed a dir it already tracks", () => {
  const file = sitesFilePath(tempDir());
  seedDevFallbackSite(file, "/repo/sites/tovu-com", () => "site");
  assert.equal(seedDevFallbackSite(file, "/repo/sites/tovu-com", () => "site"), false);
  assert.equal(readTrackedSites(file).length, 1);
});

test("migrateLegacyDismissals reads a pre-dismissals file that dropped the seed as a deliberate removal", () => {
  const file = sitesFilePath(tempDir());
  // Exactly what the old `untrackSite` left behind: rows, no `dismissed` key at all.
  fs.writeFileSync(file, JSON.stringify({ projects: [] }));
  assert.deepEqual(migrateLegacyDismissals(file, "/repo/sites/tovu-com"), ["/repo/sites/tovu-com"]);
  // The property the old `fs.existsSync` guard bought, now bought by a recorded fact instead.
  assert.equal(seedDevFallbackSite(file, "/repo/sites/tovu-com", () => "site"), false);
});

test("migrateLegacyDismissals leaves a legacy file that DOES track the dev fallback alone", () => {
  const file = sitesFilePath(tempDir());
  fs.writeFileSync(
    file,
    JSON.stringify({ projects: [{ siteDir: "/repo/sites/tovu-com", createdAt: "2026-01-01", origin: "adopted" }] }),
  );
  assert.deepEqual(migrateLegacyDismissals(file, "/repo/sites/tovu-com"), []);
  assert.deepEqual(readDismissedSites(file), []);
});

test("migrateLegacyDismissals is a no-op with no registry file — a fresh install has removed nothing", () => {
  const file = sitesFilePath(tempDir());
  assert.deepEqual(migrateLegacyDismissals(file, "/repo/sites/tovu-com"), []);
  assert.equal(fs.existsSync(file), false);
  assert.equal(seedDevFallbackSite(file, "/repo/sites/tovu-com", () => "site"), true);
});

test("migrateLegacyDismissals does not re-fire on an already-migrated file", () => {
  const file = sitesFilePath(tempDir());
  fs.writeFileSync(file, JSON.stringify({ projects: [], dismissed: [] }));
  assert.deepEqual(migrateLegacyDismissals(file, "/repo/sites/tovu-com"), []);
  assert.deepEqual(readDismissedSites(file), []);
  // A second run must not manufacture a tombstone for a dir the operator has simply never seen.
  assert.equal(seedDevFallbackSite(file, "/repo/sites/tovu-com", () => "site"), true);
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

test("adoptDiscoveredSites tracks an untracked site dir and reports it", () => {
  const file = sitesFilePath(tempDir());
  assert.deepEqual(adoptDiscoveredSites(file, ["/sites/a", "/sites/b"]), ["/sites/a", "/sites/b"]);
  assert.deepEqual(readTrackedSites(file).map((r) => r.siteDir), ["/sites/a", "/sites/b"]);
});

test("adoptDiscoveredSites records every discovery as ADOPTED — it created none of them", () => {
  const file = sitesFilePath(tempDir());
  adoptDiscoveredSites(file, ["/sites/a"]);
  assert.equal(readTrackedSites(file)[0].origin, SITE_ORIGIN.adopted);
});

test("adoptDiscoveredSites skips a dir the operator removed, and leaves the dismissal in place", () => {
  const file = sitesFilePath(tempDir());
  trackSite(file, "/sites/a");
  untrackSite(file, "/sites/a");
  assert.deepEqual(adoptDiscoveredSites(file, ["/sites/a"]), []);
  assert.deepEqual(readTrackedSites(file), []);
  assert.deepEqual(readDismissedSites(file), ["/sites/a"]);
});

test("adoptDiscoveredSites does not duplicate or re-date an already-tracked dir", () => {
  const file = sitesFilePath(tempDir());
  trackSite(file, "/sites/a");
  const before = readTrackedSites(file);
  assert.deepEqual(adoptDiscoveredSites(file, ["/sites/a"]), []);
  assert.deepEqual(readTrackedSites(file), before);
});

test("discoverSiteDirs skips a scan-root child it cannot even stat, and still returns the real sites", () => {
  // D-01, arm 2. The existing guard is `statSync(dir, {throwIfNoEntry: false})` — and
  // `throwIfNoEntry` suppresses ENOENT ALONE. A symlink cycle raises ELOOP out of `statSync`
  // itself, before `classifySiteDir` is ever consulted, so the guard's own line throws and takes
  // the whole boot scan with it.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-discover-"));
  const good = path.join(root, "a-real-site");
  fs.mkdirSync(good);
  fs.writeFileSync(path.join(good, "config.json"), "{}");
  fs.writeFileSync(path.join(good, ".site-meta.json"), "{}");
  const loopA = path.join(root, "loop-a");
  const loopB = path.join(root, "loop-b");
  fs.symlinkSync(loopB, loopA);
  fs.symlinkSync(loopA, loopB);

  const found = discoverSiteDirs({ scanRoots: [root], knownDirs: [], classifySiteDir });

  assert.deepEqual(found, [good]);
});

test("discoverSiteDirs skips a candidate whose classifier throws, rather than aborting the scan", () => {
  // The same blast radius one level in: `classifySiteDir` is INJECTED here, so a scan that trusts
  // it not to throw is a scan whose robustness depends on a caller it does not control.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-discover-"));
  const good = path.join(root, "fine");
  const bad = path.join(root, "explodes");
  fs.mkdirSync(good);
  fs.mkdirSync(bad);

  const found = discoverSiteDirs({
    scanRoots: [root],
    knownDirs: [],
    classifySiteDir: (dir) => {
      if (dir === bad) throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      return "site";
    },
  });

  assert.deepEqual(found, [good]);
});

test("seedDevFallbackSite declines an unreadable fallback instead of aborting boot", () => {
  // D-01, arm 4: this runs one line before `projectDeps` is built, in the same `whenReady()` chain.
  const projectsPath = sitesFilePath(tempDir());
  const notADirectory = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-seed-")), "not-a-dir");
  fs.writeFileSync(notADirectory, "x");

  const seeded = seedDevFallbackSite(projectsPath, notADirectory, (dir) => {
    throw Object.assign(new Error(`ENOTDIR: not a directory, scandir '${dir}'`), { code: "ENOTDIR" });
  });

  assert.equal(seeded, false);
  assert.deepEqual(readTrackedSites(projectsPath), []);
});
