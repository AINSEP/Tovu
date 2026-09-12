/**
 * @file Coverage for `add-site-pointer.js` — the one implementation behind "Add Tovu Website" on
 * all three surfaces (header button, `tovu-desktop add-site`, the `add_site_pointer` MCP tool).
 *
 * **The load-bearing tests here are the NEGATIVE ones.** The function under test exists because
 * `adoptSiteDir` was the wrong thing to reuse: it runs `tovu init` into an empty folder, and a
 * pointer-add must not create, move, copy, or write anything anywhere. So every refusal test asserts
 * three things, not one — the right error CODE, that no registry row was written, and that the
 * operator's folder is byte-for-byte as it was found. Asserting only the code would still pass if
 * this function initialized a site and then threw.
 *
 * Real directories and the real `classifySiteDir` throughout, not an injected fake. A fake
 * classifier would make the "did it write into the folder" assertions vacuous — there would be
 * nothing on disk for an accidental `tovu init` to land in.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AddSitePointerError, addSitePointer, normalizeSiteDirPath } from "./add-site-pointer.js";
import { SITE_ORIGIN, sitesFilePath, readTrackedSites, trackSite, untrackSite } from "./tracked-sites.js";
import { STATE_FILE_NAME, classifySiteDir } from "./site-dir-store.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-add-site-"));
}

/** A folder that is a complete Tovu site: both marker files `classifySiteDir` requires. */
function siteFixture(name = "site") {
  const dir = path.join(tempDir(), name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: `id-${name}` }));
  return dir;
}

/**
 * Every entry in `dir`, sorted — the "was anything written here" probe. `null` for a path that is
 * not a readable directory (absent, or a plain file), since there is then nothing an accidental
 * `tovu init` could have left behind for this probe to find.
 */
function snapshot(dir) {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return null;
  }
}

/**
 * The error `fn` threw, or a failure naming what it did instead.
 *
 * `assert.throws` returns `undefined`, so asserting on the thrown error's own fields needs the
 * error itself — and a bare try/catch that forgets the "did not throw" case would turn every
 * refusal test into a silent pass the moment the refusal stopped happening.
 */
function captureThrow(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return assert.fail("expected a throw, but the call returned normally");
}

/**
 * Assert `addSitePointer` refused `siteDir` with `code`, wrote no registry row, and left the folder
 * exactly as it was.
 *
 * The three assertions are bundled so no refusal case can be added later with only the cheap one.
 */
function assertRefused(siteDir, code) {
  const userData = tempDir();
  const projectsPath = sitesFilePath(userData);
  const before = snapshot(siteDir);

  const err = captureThrow(() => addSitePointer({ siteDir, projectsPath }));
  assert.ok(err instanceof AddSitePointerError, `threw ${err?.name}: ${err?.message}`);
  assert.equal(err.code, code);
  // The path is IN the message: all three callers render this string straight to a human or a model.
  assert.match(err.message, new RegExp(siteDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  // No row, and no registry FILE at all — a refusal must not even create the store.
  assert.equal(fs.existsSync(projectsPath), false, "a refusal wrote a registry file");
  assert.deepEqual(readTrackedSites(projectsPath), []);
  // Nor the MRU, which is what `adoptSiteDir` writes and this function deliberately does not.
  assert.equal(fs.existsSync(path.join(userData, STATE_FILE_NAME)), false, "a refusal wrote the MRU");

  if (before !== null) {
    assert.deepEqual(snapshot(siteDir), before, "a refusal wrote into the operator's folder");
  }
}

test("the fixtures really are the folder states these tests claim to exercise", () => {
  // Asked for directly rather than inferred, because a refusal test can pass for the WRONG reason:
  // if `siteFixture` quietly failed to write a marker file, "REFUSES an incomplete site" would
  // still go green while actually testing something else entirely, and every negative assertion
  // below it would be measuring a state nobody designed. So each fixture shape is pinned to the
  // verdict `classifySiteDir` — the real one, not an injected fake — gives it.
  const empty = path.join(tempDir(), "empty");
  fs.mkdirSync(empty);
  const incomplete = path.join(tempDir(), "incomplete");
  fs.mkdirSync(incomplete);
  fs.writeFileSync(path.join(incomplete, "config.json"), "{}");
  const occupied = path.join(tempDir(), "occupied");
  fs.mkdirSync(occupied);
  fs.writeFileSync(path.join(occupied, "taxes.pdf"), "x");

  assert.equal(classifySiteDir(siteFixture()), "site");
  assert.equal(classifySiteDir(empty), "empty");
  assert.equal(classifySiteDir(path.join(tempDir(), "absent")), "empty");
  assert.equal(classifySiteDir(incomplete), "incomplete");
  assert.equal(classifySiteDir(occupied), "occupied");
});

test("addSitePointer tracks a real site as `adopted`, so a later delete can never erase it", () => {
  const siteDir = siteFixture();
  const projectsPath = sitesFilePath(tempDir());

  const result = addSitePointer({ siteDir, projectsPath });

  assert.deepEqual(result, { siteDir, alreadyTracked: false, alreadyDismissed: false });
  const rows = readTrackedSites(projectsPath);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].siteDir, siteDir);
  // The single most consequential assertion in this file. `project-delete-guard.js` reads `origin`
  // to decide whether a delete reaches `fs.rm` on this directory; `created` would authorize erasing
  // a site this app did not make. Asserted as an exact value, not `!== "created"`, so a third
  // origin value added later has to be considered here rather than passing by default.
  assert.equal(rows[0].origin, SITE_ORIGIN.adopted);
  // And no `siteId` stamp: `trackSite` records one only alongside `created`, and a stamp on an
  // adopted row is a fact nothing reads that a future rule could misread as permission.
  assert.equal("siteId" in rows[0], false);
});

test("addSitePointer never writes into the site folder it points at", () => {
  const siteDir = siteFixture();
  const before = snapshot(siteDir);

  addSitePointer({ siteDir, projectsPath: sitesFilePath(tempDir()) });

  assert.deepEqual(snapshot(siteDir), before);
});

test("addSitePointer REFUSES an empty folder and initializes nothing in it", () => {
  const siteDir = path.join(tempDir(), "fresh");
  fs.mkdirSync(siteDir);

  assertRefused(siteDir, "SITE_DIR_EMPTY");

  // Stated separately from `assertRefused`'s snapshot check because this is the exact defect the
  // function exists to avoid: `adoptSiteDir` would have run `tovu init` here and left both marker
  // files behind. An empty list is the only passing state.
  assert.deepEqual(snapshot(siteDir), []);
});

test("addSitePointer REFUSES a path that does not exist", () => {
  assertRefused(path.join(tempDir(), "nope"), "SITE_DIR_EMPTY");
});

test("addSitePointer REFUSES a half-initialized site missing .site-meta.json", () => {
  const siteDir = path.join(tempDir(), "half");
  fs.mkdirSync(siteDir);
  fs.writeFileSync(path.join(siteDir, "config.json"), "{}");

  assertRefused(siteDir, "SITE_DIR_INCOMPLETE");
});

test("addSitePointer REFUSES a half-initialized site missing config.json", () => {
  const siteDir = path.join(tempDir(), "half2");
  fs.mkdirSync(siteDir);
  fs.writeFileSync(path.join(siteDir, ".site-meta.json"), "{}");

  assertRefused(siteDir, "SITE_DIR_INCOMPLETE");
});

test("addSitePointer REFUSES a folder of unrelated files", () => {
  const siteDir = path.join(tempDir(), "documents");
  fs.mkdirSync(siteDir);
  fs.writeFileSync(path.join(siteDir, "taxes.pdf"), "x");
  fs.writeFileSync(path.join(siteDir, "notes.txt"), "y");

  assertRefused(siteDir, "SITE_DIR_OCCUPIED");
});

test("addSitePointer REFUSES a path that is a file rather than a directory", () => {
  const file = path.join(tempDir(), "config.json");
  fs.writeFileSync(file, "{}");

  // `classifySiteDirSafely` reports `"unreadable"` here: the path exists, so it is not `"empty"`,
  // both marker lookups miss, and `readdirSync` on a file raises ENOTDIR.
  assertRefused(file, "SITE_DIR_UNREADABLE");
});

test("addSitePointer refuses an unmapped classification rather than admitting it", () => {
  const projectsPath = sitesFilePath(tempDir());

  const err = captureThrow(() =>
    addSitePointer({ siteDir: "/somewhere", projectsPath, classifySiteDir: () => "a-verdict-nobody-mapped" }),
  );
  assert.ok(err instanceof AddSitePointerError, `threw ${err?.name}: ${err?.message}`);

  // The fail-closed direction: a fifth classification added to `site-dir-store.js` later must be
  // REFUSED by this function until someone maps it, never silently tracked.
  assert.equal(err.code, "SITE_DIR_UNUSABLE");
  assert.deepEqual(readTrackedSites(projectsPath), []);
});

test("addSitePointer is idempotent and reports the second call as already tracked", () => {
  const siteDir = siteFixture();
  const projectsPath = sitesFilePath(tempDir());

  addSitePointer({ siteDir, projectsPath });
  const first = readTrackedSites(projectsPath);
  const result = addSitePointer({ siteDir, projectsPath });

  assert.equal(result.alreadyTracked, true);
  // Unchanged, not merely deduped: `createdAt` must not be bumped either, so a retry cannot reorder
  // the operator's Projects grid.
  assert.deepEqual(readTrackedSites(projectsPath), first);
});

test("addSitePointer restores a project the operator had removed, and says so", () => {
  const siteDir = siteFixture();
  const projectsPath = sitesFilePath(tempDir());
  trackSite(projectsPath, siteDir, SITE_ORIGIN.adopted);
  untrackSite(projectsPath, siteDir);

  const result = addSitePointer({ siteDir, projectsPath });

  // Adding back is correct — this is the explicit adder, reached because the operator named the
  // folder themselves — but the caller has to be able to TELL the operator that, which is the only
  // reason this flag exists.
  assert.equal(result.alreadyDismissed, true);
  assert.equal(result.alreadyTracked, false);
  assert.deepEqual(
    readTrackedSites(projectsPath).map((row) => row.siteDir),
    [siteDir],
  );
});

test("addSitePointer resolves a relative path against cwd and records the absolute form", () => {
  const siteDir = siteFixture("relative-site");
  const projectsPath = sitesFilePath(tempDir());

  const result = addSitePointer({ siteDir: "relative-site", cwd: path.dirname(siteDir), projectsPath });

  assert.equal(result.siteDir, siteDir);
  assert.equal(readTrackedSites(projectsPath)[0].siteDir, siteDir);
});

test("addSitePointer normalizes a trailing slash so one site cannot become two rows", () => {
  const siteDir = siteFixture();
  const projectsPath = sitesFilePath(tempDir());

  addSitePointer({ siteDir, projectsPath });
  addSitePointer({ siteDir: `${siteDir}${path.sep}`, projectsPath });

  assert.equal(readTrackedSites(projectsPath).length, 1);
});

test("addSitePointer does not touch the recently-opened list", () => {
  const siteDir = siteFixture();
  const userData = tempDir();

  addSitePointer({ siteDir, projectsPath: sitesFilePath(userData) });

  // Deliberate, and pinned so it cannot be "fixed" into `adoptSiteDir`'s behaviour: the MRU is what
  // `resolveSiteDir` step 2 consults to decide which site own-server mode opens at LAUNCH. Adding a
  // pointer must not hijack the next launch's site.
  assert.equal(fs.existsSync(path.join(userData, STATE_FILE_NAME)), false);
});

test("normalizeSiteDirPath leaves an absolute path absolute and ignores cwd", () => {
  assert.equal(normalizeSiteDirPath("/sites/a", "/elsewhere"), path.resolve("/sites/a"));
});
