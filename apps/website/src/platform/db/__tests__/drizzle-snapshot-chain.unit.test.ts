import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

type Journal = {
  entries: Array<{ idx: number }>;
};

type Snapshot = {
  id: string;
  prevId: string;
};

const META_DIR = path.resolve(import.meta.dirname, "../drizzle/meta");
const ROOT_PREV_ID = "00000000-0000-0000-0000-000000000000";

test("every journal entry has a snapshot in one unbroken prevId chain from 0000", () => {
  const journal = JSON.parse(fs.readFileSync(path.join(META_DIR, "_journal.json"), "utf8")) as Journal;
  let expectedPrevId = ROOT_PREV_ID;

  for (const [position, entry] of journal.entries.entries()) {
    assert.equal(entry.idx, position, `journal entry ${position} must have idx ${position}`);

    const snapshotName = `${String(entry.idx).padStart(4, "0")}_snapshot.json`;
    const snapshotPath = path.join(META_DIR, snapshotName);
    assert.ok(fs.existsSync(snapshotPath), `journal entry ${entry.idx} is missing ${snapshotName}`);

    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as Snapshot;
    assert.equal(snapshot.prevId, expectedPrevId, `${snapshotName} must point to the preceding snapshot`);
    expectedPrevId = snapshot.id;
  }
});
