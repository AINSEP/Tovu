/**
 * @file Static-analysis tests for `../main.ts`'s shared-key wiring. Source text, not behaviour, for
 * the reason `main-project-wiring.test.ts` documents: `main.ts` requires `"electron"` at module scope.
 * The settle and import logic is behaviourally covered in `owner-store-ipc.test.ts`; only this file
 * can check that a site start no longer calls the owner-store CLI (which used to open, and so
 * create, owner.db). That the one start-up check runs once, after the IPC registration, is
 * behaviour now, in `main/boot/boot-sequence.test.ts`; that it removes only an empty store's four
 * files (original test 3) is in `main/boot/boot-steps.test.ts` (`settleLegacyOwnerStoreOnStart`).
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
