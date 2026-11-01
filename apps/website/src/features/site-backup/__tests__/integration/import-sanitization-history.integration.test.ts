/** k1: real worker → real site creation; omission notices survive stage cleanup/history refresh. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { importFixture, OWNER_PASSWORD } from "../import.fixture.js";
import { openContentDb } from "../../../../platform/db/sqlite/content-db.js";
import { closeSqliteConnection } from "../../../../platform/db/kernel/drivers/sqlite.js";
import { resolveSiteDatabasePaths } from "../../../../platform/site-dir/site-databases.js";
import { createSiteImportBackend } from "../../import-backend.js";

test("import omission warnings persist after real creation and backend reload", { timeout: 120000 }, async t => {
  const h = await importFixture(t);
  h.db.$client.prepare("UPDATE posts SET body_json=? WHERE id='post-0'").run(JSON.stringify({ text: "Authorization: Bearer " + "historyCredentialValue987654321" }));
  // The fixture writes an original, correctly checksummed database without export projection.
  const archive = await h.archiveWithDatabase(h.db.$client.serialize());
  const { uploadId } = await h.backend.upload({ principalId: "owner", archive });
  const pending = await h.backend.importBackup({ principalId: "owner", source: { uploadId } });
  assert.match(pending.warnings!.join(), /posts\.body_json.*post-0/);
  const ready = await h.backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(ready.status, "ready"); assert.equal(fs.existsSync(h.registry.stagePath({ importId: pending.importId })), false);
  const reloaded = createSiteImportBackend(h.backendPorts);
  const history = await reloaded.list({ principalId: "owner" });
  assert.deepEqual(history[0]!.warnings, ready.warnings);
  assert.equal(JSON.stringify(history).includes("historyCredentialValue"), false);
  const site = path.join(h.workspace.home({}), ready.newSiteName!);
  const imported = openContentDb({ filePath: resolveSiteDatabasePaths({ dir: site }, { workspace: h.workspace }).contentDbPath });
  t.after(() => closeSqliteConnection(imported));
  assert.equal(imported.$client.serialize().includes(Buffer.from("historyCredentialValue987654321")), false);
  await h.assertOwnerLogin({ dir: site, rejectedPassword: "source-password" });
});


test("real import preserves an explicitly disabled active theme", { timeout: 120000 }, async t => {
  const h = await importFixture(t);
  h.db.$client.prepare("UPDATE presentation_settings SET active_theme_id='none'").run();
  const { archive } = await h.prepareProductionShare();
  const { uploadId } = await h.backend.upload({ principalId: "owner", archive });
  const pending = await h.backend.importBackup({ principalId: "owner", source: { uploadId } });
  const ready = await h.backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(ready.status, "ready");
  const dir = path.join(h.workspace.home({}), ready.newSiteName!);
  const imported = openContentDb({ filePath: resolveSiteDatabasePaths({ dir }, { workspace: h.workspace }).contentDbPath });
  t.after(() => closeSqliteConnection(imported));
  assert.deepEqual(imported.$client.prepare("SELECT DISTINCT active_theme_id FROM presentation_settings").all(), [{ active_theme_id: "none" }]);
});
