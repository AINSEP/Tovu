import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openSqliteContentConnection } from "#src/platform/db/sqlite/content-db";
import { closeSiteDirBoot, type SqliteSiteDirBoot } from "../../boot-site-dir.js";

/**
 * @file `closeSiteDirBoot` on SQLite closes the composition (which stops and awaits its submission-IP
 * and guest-chat sweeps) BEFORE the borrowed `content.db` handle. It used to close `content.db`
 * first, synchronously, so a sweep batch still running reached a closed connection.
 */

function sqliteBoot(): { boot: SqliteSiteDirBoot; open: () => boolean; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "close-site-dir-boot-"));
  const db = openSqliteContentConnection(path.join(dir, "content.db"));
  const boot = { storage: { kind: "sqlite" }, db, workspaceId: "ws", config: {} } as unknown as SqliteSiteDirBoot;
  return { boot, open: () => db.$client.open, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("SQLite: content.db is still open while the composition's close runs, and closed after it", async () => {
  const { boot, open, cleanup } = sqliteBoot();
  try {
    let openDuringComposedClose: boolean | undefined;
    await closeSiteDirBoot(boot, {
      close: async () => {
        await new Promise((resolve) => setImmediate(resolve));
        openDuringComposedClose = open();
      },
    });
    assert.equal(openDuringComposedClose, true);
    assert.equal(open(), false);
  } finally {
    cleanup();
  }
});

test("SQLite: a composition close that rejects still releases content.db and surfaces its error", async () => {
  const { boot, open, cleanup } = sqliteBoot();
  try {
    await assert.rejects(closeSiteDirBoot(boot, { close: async () => { throw new Error("sweep failed"); } }), /^Error: sweep failed$/);
    assert.equal(open(), false);
  } finally {
    cleanup();
  }
});
