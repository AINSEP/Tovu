/**
 * @file Static-analysis tests for `../main.ts`'s shared-key wiring. Source text, not behaviour, for
 * the reason `main-project-wiring.test.ts` documents: `main.ts` requires `"electron"` at module scope.
 * The settle and import logic is behaviourally covered in `owner-store-ipc.test.ts`; only this file
 * can check that a site start no longer calls the owner-store CLI (which used to open, and so
 * create, owner.db) and that the one start-up check runs after the IPC registration.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAIN = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "main.ts"), "utf8");

test("a site start never calls the owner-store CLI: the sync-on-start path is gone", () => {
  for (const removed of ["syncOnStart", "finishStartedSite", "listSites"]) assert.equal(MAIN.includes(removed), false, removed);
});

test("the one start-up check runs once, after the shared-key IPC is registered", () => {
  const calls = MAIN.match(/settleLegacyOwnerStoreOnStart\(\);/g) ?? [];
  assert.equal(calls.length, 1);
  assert.ok(MAIN.indexOf("registerOwnerStoreIpc({") < MAIN.indexOf("settleLegacyOwnerStoreOnStart();"));
});

test("only an empty store is removed, and only its four files", () => {
  assert.match(MAIN, /for \(const file of \["owner\.db", "owner\.db-wal", "owner\.db-shm", "owner\.key"\]\) fs\.rmSync\(path\.join\(userData, file\), \{ force: true \}\);/);
  assert.equal(MAIN.match(/"owner\.db"/g)?.length, 1, "no other main-process path names owner.db");
});
