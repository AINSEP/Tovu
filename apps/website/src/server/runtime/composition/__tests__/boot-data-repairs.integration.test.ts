import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { UNREADABLE_OWNER_ENTRIES_REPAIR_SETTING_ID } from "#src/features/entries/unreadable-owner-entries-repair";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { contentKernel } from "#src/platform/db/content-kernel";
import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { runBootDataRepairs } from "../boot-data-repairs.js";
import { openSiteContentDb } from "../open-site-content-db.js";
import { openSiteStore } from "../open-site-store.js";

/**
 * @file `runBootDataRepairs`: its per-repair failure policy (with fakes), and that BOTH store
 * openers run it for real — SQLite (`openSiteContentDb`) and PGlite (`openSiteStore` ->
 * `preparePgStore`, the same function Postgres boots through).
 */

const kernel = {} as ContentKernel;

test("runs the footer repair, then the unreadable-owner repair, on the same kernel", async () => {
  const calls: Array<[string, ContentKernel]> = [];
  await runBootDataRepairs({ kernel }, {
    migrateFooterPageLinks: async (required) => calls.push(["footer", required.kernel]),
    removeUnreadableOwnerEntries: async (required) => calls.push(["unreadable", required.kernel]),
    logError: () => assert.fail("nothing failed"),
  });
  assert.deepEqual(calls, [["footer", kernel], ["unreadable", kernel]]);
});

test("an unreadable-owner repair failure is logged, not thrown: the site still boots and the next boot retries", async () => {
  const lines: string[] = [];
  await runBootDataRepairs({ kernel }, {
    migrateFooterPageLinks: async () => undefined,
    removeUnreadableOwnerEntries: async () => {
      throw new Error("db went away");
    },
    logError: (line) => lines.push(line),
  });
  assert.deepEqual(lines, ["[boot-repair] removing unreadable owner entries failed; the next boot retries: db went away"]);
});

test("a footer repair failure still rejects the boot, and the later repair does not run", async () => {
  await assert.rejects(
    runBootDataRepairs({ kernel }, {
      migrateFooterPageLinks: async () => {
        throw new Error("footer broke");
      },
      removeUnreadableOwnerEntries: async () => assert.fail("not reached"),
    }),
    { message: "footer broke" }
  );
});

async function markerPresent(content: ContentKernel): Promise<boolean> {
  const row = await content.run((db) =>
    db.selectFrom("setting_values_global").select("setting_id").where("setting_id", "=", UNREADABLE_OWNER_ENTRIES_REPAIR_SETTING_ID).executeTakeFirst()
  );
  return row !== undefined;
}

test("sqlite: openSiteContentDb runs the repair (its marker is written on a fresh site)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-boot-data-repairs-sqlite-"));
  try {
    const db = await openSiteContentDb(path.join(dir, "content.db"));
    try {
      assert.equal(await markerPresent(contentKernel(db)), true);
    } finally {
      closeSqliteConnection(db);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pglite: openSiteStore's Postgres-family preparation runs the repair (its marker is written on a fresh site)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-boot-data-repairs-pglite-"));
  try {
    const store = await openSiteStore({ storage: { kind: "pglite" }, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "owner" });
    try {
      assert.equal(await markerPresent(store.content), true);
    } finally {
      await store.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
