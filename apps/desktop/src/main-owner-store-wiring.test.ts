/**
 * @file Static-analysis tests for `../main.ts`'s shared-key wiring. Source text, not behaviour, for
 * the reason `main-project-wiring.test.ts` documents: `main.ts` requires `"electron"` at module scope.
 * The settle and import logic is behaviourally covered in `owner-store-ipc.test.ts`; only this file
 * can check that a site start no longer calls the owner-store CLI (which used to open, and so
 * create, owner.db). That the one start-up check runs once, after the IPC registration, is
 * behaviour now, in `main/boot/boot-sequence.test.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAIN = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "main", "index.ts"), "utf8");

test("a site start never calls the owner-store CLI: the sync-on-start path is gone", () => {
  for (const removed of ["syncOnStart", "finishStartedSite", "listSites"]) assert.equal(MAIN.includes(removed), false, removed);
});

test("only an empty store is removed, and only its four files", () => {
  assert.match(MAIN, /for \(const file of \["owner\.db", "owner\.db-wal", "owner\.db-shm", "owner\.key"\]\) fs\.rmSync\(path\.join\(userData, file\), \{ force: true \}\);/);
  assert.equal(MAIN.match(/"owner\.db"/g)?.length, 1, "no other main-process path names owner.db");
});
