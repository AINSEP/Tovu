import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { defaultPgliteSocketDir, PGLITE_SOCKET_FILE } from "#src/platform/db/kernel/drivers/pglite-owner";
import { openSiteStore, PG_SOCKET_ENV, PGLITE_DATA_DIR_NAME, StorageNotAvailableError } from "../open-site-store.js";

for (const scenario of [
  { name: "default 60 seconds", waitMs: undefined, duration: 60_000, socketEnv: "custom" },
  { name: "explicit wait", waitMs: 400, duration: 400, socketEnv: "custom" },
  { name: "zero wait and derived socket", waitMs: 0, duration: 0, socketEnv: "blank" },
  { name: "absent socket override", waitMs: 0, duration: 0, socketEnv: "absent" },
]) {
  test(`L245: pglite client waits ${scenario.name} before reporting its socket`, async t => {
    const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "l245-pglite-"));
    t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
    const customSocket = path.join(siteDir, "custom-socket");
    const socketPath = scenario.socketEnv === "custom" ? customSocket :
      path.join(defaultPgliteSocketDir(path.join(siteDir, PGLITE_DATA_DIR_NAME)), PGLITE_SOCKET_FILE);
    const env = scenario.socketEnv === "absent" ? {} : { [PG_SOCKET_ENV]: scenario.socketEnv === "blank" ? "   " : ` ${customSocket} ` };
    let settled = false;
    const opening = openSiteStore({ storage: { kind: "pglite" }, dbPath: path.join(siteDir, "content.db"),
      chatDbPath: path.join(siteDir, "chat.db"), role: "client" }, { env, pgliteClientWaitMs: scenario.waitMs });
    const rejected = assert.rejects(opening, new StorageNotAvailableError(
      `this site is stored on pglite and its owner (the site's API process) is not serving ${socketPath}; start the site, then retry`
    ));
    void opening.catch(() => { settled = true; });
    // Advance one poll at a time: the next poll is scheduled after the await resumes.
    for (let elapsed = 0; elapsed < scenario.duration; elapsed += 200) {
      await Promise.resolve();
      assert.equal(settled, false, `must still wait at ${elapsed}ms`);
      t.mock.timers.tick(200);
    }
    await rejected;
    assert.equal(settled, true);
    assert.deepEqual(fs.readdirSync(siteDir), [], "client never opens or creates a data directory");
  });
}
