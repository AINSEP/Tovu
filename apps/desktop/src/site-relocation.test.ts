/**
 * @file Coverage for `site-relocation.ts` — a tracked project whose folder was renamed or moved
 * (`sites/tovu-com` → `sites/tovu-dev`, commit bc015d6c5) heals itself instead of leaving a card
 * for a folder that no longer exists. Temp dirs only; nothing here touches the real userData files.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createRelocationGate, readRelocationId, relocateMovedSites, repointTrackedSite } from "./site-relocation.ts";
import { sitesFilePath, readTrackedSites, readDismissedSites, writeTrackedSites } from "./tracked-sites.ts";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-site-relocation-"));
}

/** A folder carrying the `.site-meta.json` `tovu init` writes, with whichever ids it is given. */
function makeSite(dir: string, meta: Record<string, unknown>): string {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(meta));
  return dir;
}

/** A projects file in its own temp userData dir, holding `rows` and `dismissed`. */
function projectsFile(rows: Array<Record<string, unknown>>, dismissed: string[] = []): string {
  const file = sitesFilePath(tempDir());
  fs.writeFileSync(file, JSON.stringify({ projects: rows, dismissed }));
  return file;
}

const CREATED = "2026-01-01T00:00:00.000Z";

test("readRelocationId reads siteId, falls back to siteKeyId, and is null when neither is usable", () => {
  const root = tempDir();
  assert.equal(readRelocationId(makeSite(path.join(root, "a"), { siteId: "id-a", siteKeyId: "key-a" })), "id-a");
  // Older sites (tovu-dev itself) carry only `siteKeyId`.
  assert.equal(readRelocationId(makeSite(path.join(root, "b"), { siteKeyId: "key-b" })), "key-b");
  assert.equal(readRelocationId(makeSite(path.join(root, "c"), { siteId: "", siteKeyId: 7 })), null);
  assert.equal(readRelocationId(path.join(root, "missing")), null);
  fs.mkdirSync(path.join(root, "garbled"));
  fs.writeFileSync(path.join(root, "garbled", ".site-meta.json"), "{not json");
  assert.equal(readRelocationId(path.join(root, "garbled")), null);
});

test("relocateMovedSites records the folder's id on a row whose folder exists, going forward", () => {
  const root = tempDir();
  const site = makeSite(path.join(root, "tovu-com"), { siteKeyId: "key-1" });
  const file = projectsFile([{ siteDir: site, createdAt: CREATED, origin: "adopted" }]);

  const report = relocateMovedSites(file);

  assert.deepEqual(report, { moved: [], merged: [] });
  assert.deepEqual(readTrackedSites(file), [{ siteDir: site, createdAt: CREATED, origin: "adopted", relocationId: "key-1" }]);
});

test("relocateMovedSites repoints a renamed folder to the one sibling carrying the same id", () => {
  const root = tempDir();
  const oldDir = path.join(root, "tovu-com");
  const file = projectsFile([{ siteDir: oldDir, createdAt: CREATED, origin: "adopted", relocationId: "key-1" }]);
  // The rename, done on disk behind the app's back.
  const newDir = makeSite(path.join(root, "tovu-dev"), { siteKeyId: "key-1" });
  makeSite(path.join(root, "other"), { siteKeyId: "key-2" });

  const report = relocateMovedSites(file);

  assert.deepEqual(report, { moved: [{ from: oldDir, to: newDir }], merged: [] });
  // Same card: its original `createdAt` survives, so the grid order does not jump.
  assert.deepEqual(readTrackedSites(file), [{ siteDir: newDir, createdAt: CREATED, origin: "adopted", relocationId: "key-1" }]);
});

test("relocateMovedSites merges into the new location when it is already tracked, dropping the stale row", () => {
  const root = tempDir();
  const oldDir = path.join(root, "tovu-com");
  const newDir = makeSite(path.join(root, "tovu-dev"), { siteKeyId: "key-1" });
  const file = projectsFile([
    { siteDir: oldDir, createdAt: CREATED, origin: "adopted", relocationId: "key-1" },
    { siteDir: newDir, createdAt: "2026-02-02T00:00:00.000Z", origin: "adopted" },
  ]);

  const report = relocateMovedSites(file);

  assert.deepEqual(report, { moved: [], merged: [oldDir] });
  assert.deepEqual(readTrackedSites(file).map((row) => row.siteDir), [newDir]);
  // A merge is not a removal the operator made: it records no tombstone.
  assert.deepEqual(readDismissedSites(file), []);
});

test("relocateMovedSites also finds a moved site under the extra search roots", () => {
  const root = tempDir();
  const oldDir = path.join(root, "old-home", "shop");
  const scanRoot = path.join(root, "Documents", "Tovu");
  const newDir = makeSite(path.join(scanRoot, "shop"), { siteId: "site-9" });
  const file = projectsFile([{ siteDir: oldDir, createdAt: CREATED, origin: "adopted", relocationId: "site-9" }]);

  assert.deepEqual(relocateMovedSites(file, { searchRoots: [scanRoot] }).moved, [{ from: oldDir, to: newDir }]);
});

test("relocateMovedSites leaves a missing folder alone when no sibling, or more than one, matches", () => {
  const root = tempDir();
  const lost = path.join(root, "lost");
  const twin = path.join(root, "twin");
  makeSite(path.join(root, "copy-a"), { siteKeyId: "key-twin" });
  makeSite(path.join(root, "copy-b"), { siteKeyId: "key-twin" });
  const rows = [
    { siteDir: lost, createdAt: CREATED, origin: "adopted", relocationId: "key-nowhere" },
    { siteDir: twin, createdAt: CREATED, origin: "adopted", relocationId: "key-twin" },
  ];
  const file = projectsFile(rows);

  assert.deepEqual(relocateMovedSites(file), { moved: [], merged: [] });
  // Never silently dropped: both rows are still there for the card to show as missing.
  assert.deepEqual(readTrackedSites(file), rows);
});

test("relocateMovedSites leaves a missing row with no recorded id alone (nothing to match on)", () => {
  const root = tempDir();
  makeSite(path.join(root, "tovu-dev"), { siteKeyId: "key-1" });
  const rows = [{ siteDir: path.join(root, "tovu-com"), createdAt: CREATED, origin: "adopted" }];
  const file = projectsFile(rows);

  assert.deepEqual(relocateMovedSites(file), { moved: [], merged: [] });
  assert.deepEqual(readTrackedSites(file), rows);
});

test("relocateMovedSites never repoints onto a folder the operator removed on purpose", () => {
  const root = tempDir();
  const oldDir = path.join(root, "tovu-com");
  const newDir = makeSite(path.join(root, "tovu-dev"), { siteKeyId: "key-1" });
  const rows = [{ siteDir: oldDir, createdAt: CREATED, origin: "adopted", relocationId: "key-1" }];
  const file = projectsFile(rows, [newDir]);

  assert.deepEqual(relocateMovedSites(file).moved, []);
  assert.deepEqual(readTrackedSites(file), rows);
});

test("relocateMovedSites downgrades a moved `created` row to `adopted` and drops its erase proof", () => {
  const root = tempDir();
  const oldDir = path.join(root, "made-here");
  const newDir = makeSite(path.join(root, "moved-by-hand"), { siteId: "site-1" });
  const file = projectsFile([{ siteDir: oldDir, createdAt: CREATED, origin: "created", siteId: "site-1", relocationId: "site-1" }]);

  relocateMovedSites(file);

  // The app created the folder at the OLD path; the operator moved it. Delete must not erase it now.
  assert.deepEqual(readTrackedSites(file), [{ siteDir: newDir, createdAt: CREATED, origin: "adopted", relocationId: "site-1" }]);
});

test("relocateMovedSites does not write the file when nothing changed", () => {
  const root = tempDir();
  const site = makeSite(path.join(root, "a"), { siteKeyId: "key-1" });
  const file = projectsFile([{ siteDir: site, createdAt: CREATED, origin: "adopted", relocationId: "key-1" }]);
  const before = fs.statSync(file).mtimeMs;
  fs.utimesSync(file, new Date(0), new Date(0));

  relocateMovedSites(file);

  assert.equal(fs.statSync(file).mtimeMs, 0, `unchanged file was rewritten (was ${before})`);
});

test("relocateMovedSites is a no-op on a missing projects file", () => {
  const file = sitesFilePath(tempDir());
  assert.deepEqual(relocateMovedSites(file), { moved: [], merged: [] });
  assert.equal(fs.existsSync(file), false);
});

test("repointTrackedSite (Locate) moves the card to the picked folder and clears its tombstone", () => {
  const root = tempDir();
  const oldDir = path.join(root, "tovu-com");
  const picked = makeSite(path.join(root, "anywhere"), { siteKeyId: "key-5" });
  const file = projectsFile([{ siteDir: oldDir, createdAt: CREATED, origin: "created", siteId: "s" }], [picked]);

  const rows = repointTrackedSite(file, oldDir, picked);

  assert.deepEqual(rows, [{ siteDir: picked, createdAt: CREATED, origin: "adopted", relocationId: "key-5" }]);
  assert.deepEqual(readTrackedSites(file), rows);
  assert.deepEqual(readDismissedSites(file), []);
});

test("repointTrackedSite onto an already-tracked folder drops the stale card instead of duplicating", () => {
  const root = tempDir();
  const oldDir = path.join(root, "tovu-com");
  const picked = makeSite(path.join(root, "tovu-dev"), { siteKeyId: "key-1" });
  const file = sitesFilePath(tempDir());
  writeTrackedSites(file, [
    { siteDir: oldDir, createdAt: CREATED },
    { siteDir: picked, createdAt: "2026-02-02T00:00:00.000Z" },
  ]);

  assert.deepEqual(repointTrackedSite(file, oldDir, picked).map((row) => row.siteDir), [picked]);
});

test("repointTrackedSite refuses an id this app is not tracking", () => {
  const file = projectsFile([]);
  assert.throws(() => repointTrackedSite(file, "/nope", "/elsewhere"), {
    message: "This app is not tracking a site at /nope, so there is nothing to locate.",
  });
});

test("relocateMovedSites leaves a damaged projects file alone — a list poll must not move it aside", () => {
  const root = tempDir();
  makeSite(path.join(root, "tovu-dev"), { siteKeyId: "key-1" });
  const file = sitesFilePath(tempDir());
  const damaged = `{"projects":[{"siteDir":${JSON.stringify(path.join(root, "tovu-com"))},"createdAt":"x","relocationId":"key-1"}],"dism`;
  fs.writeFileSync(file, damaged);

  assert.deepEqual(relocateMovedSites(file), { moved: [], merged: [] });
  assert.equal(fs.readFileSync(file, "utf8"), damaged);
});

// Idle CPU (2026-09-29): the 4 s list poll no longer re-scans a missing folder's siblings every time.
test("createRelocationGate runs on the first poll, then only when the rows, their folders' existence or the removals change", () => {
  const root = tempDir();
  const here = makeSite(path.join(root, "here"), { siteId: "id-here" });
  const gone = path.join(root, "gone");
  let clock = 0;
  const gate = createRelocationGate({ maxIdleMs: 60_000, now: () => clock });
  const file = { rows: [{ siteDir: here }, { siteDir: gone }], dismissed: [] as string[] } as never;

  assert.equal(gate.shouldRun(file), true, "the first poll always runs");
  clock += 4_000;
  assert.equal(gate.shouldRun(file), false, "same rows, same folders: nothing could have moved");

  fs.renameSync(here, path.join(root, "renamed"));
  clock += 4_000;
  assert.equal(gate.shouldRun(file), true, "a folder that disappeared is noticed on the very next poll");
  clock += 4_000;
  assert.equal(gate.shouldRun(file), false);

  clock += 4_000;
  assert.equal(gate.shouldRun({ rows: [{ siteDir: gone }], dismissed: [] } as never), true, "a row removed");
  clock += 4_000;
  assert.equal(gate.shouldRun({ rows: [{ siteDir: gone }], dismissed: [here] } as never), true, "the removals changed");
});

test("createRelocationGate still runs at the slow cadence while nothing changes, so a folder that turns up elsewhere is found", () => {
  let clock = 0;
  const gate = createRelocationGate({ maxIdleMs: 60_000, now: () => clock });
  const file = { rows: [{ siteDir: path.join(tempDir(), "missing") }], dismissed: [] } as never;

  assert.equal(gate.shouldRun(file), true);
  clock += 59_999;
  assert.equal(gate.shouldRun(file), false);
  clock += 1;
  assert.equal(gate.shouldRun(file), true, "one full idle interval later");
  clock += 1;
  assert.equal(gate.shouldRun(file), false, "and the interval restarts from that pass");
});
