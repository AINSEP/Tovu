/** Review B-4: the previous successful fixtures removed private rows before B saw the ZIP.
 * These cases bypass A's projection: assertions first prove hostile rows reached the archive.
 * Behavioral regression guards for B's existing sanitizer and one-workspace refusal.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { resolveSiteDatabasePaths } from "../../../platform/site-dir/site-databases.js";
import { ARCHIVE_DATABASE_PATH } from "../archive-manifest.js";
import { importFixture, OWNER_PASSWORD, reader, stamp } from "./import.fixture.js";

const privateTables = ["principals", "identity_users", "sessions", "secrets_vault"];

test("B successfully strips hostile schema-valid accounts, sessions and secrets before and after owner setup", async t => {
  const h = await importFixture(t, "appData");
  const raw = h.db.$client.serialize();
  const archive = await h.archiveWithDatabase(raw);
  let checkedArchive = false;
  for await (const entry of reader.entries({ archive })) {
    if (entry.kind !== "file" || entry.entryPath !== ARCHIVE_DATABASE_PATH) continue;
    const chunks: Buffer[] = [];
    for await (const chunk of entry.openReadStream({})) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    assert.deepEqual(bytes, raw, "the ZIP must contain the hostile input, never A's projection");
    const hostile = new Database(bytes);
    try {
      for (const table of privateTables) assert.equal((hostile.prepare('SELECT count(*) AS n FROM "' + table + '"').get() as { n: number }).n, 1, "hostile archive contains " + table);
    } finally { hostile.close(); }
    checkedArchive = true;
  }
  assert.equal(checkedArchive, true);
  const upload = await h.backend.upload({ principalId: "recipient", archive });
  const pending = await h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } });
  assert.equal(pending.state, "needs-owner");
  assert.deepEqual(h.workspace.registry({}).list({}), []);
  const staged = new Database(path.join(h.registry.stagePath(pending), "database/content.db"), { readonly: true });
  try {
    for (const table of privateTables) assert.equal((staged.prepare('SELECT count(*) AS n FROM "' + table + '"').get() as { n: number }).n, 0, "before owner: " + table);
    for (const sentinel of ["source-owner", "source-session", "source-secret"]) {
      // Attribution strings are portable; private session/vault bytes are never retained.
      if (sentinel !== "source-owner") assert.equal(staged.serialize().includes(Buffer.from(sentinel)), false);
    }
  } finally { staged.close(); }
  await h.backend.completeOwner({ principalId: "recipient", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  const site = h.workspace.registry({}).list({})[0]!;
  const imported = new Database(resolveSiteDatabasePaths({ dir: site.path }, { workspace: h.workspace }).contentDbPath, { readonly: true });
  try {
    assert.equal(imported.prepare("SELECT 1 FROM principals WHERE id='source-owner'").get(), undefined);
    assert.equal(imported.prepare("SELECT 1 FROM identity_users WHERE principal_id='source-owner'").get(), undefined);
    assert.equal((imported.prepare("SELECT count(*) AS n FROM identity_users").get() as { n: number }).n, 1);
    for (const table of ["sessions", "secrets_vault"]) assert.equal((imported.prepare('SELECT count(*) AS n FROM "' + table + '"').get() as { n: number }).n, 0, "after owner: " + table);
    for (const sentinel of ["source-session", "source-secret"]) assert.equal(imported.serialize().includes(Buffer.from(sentinel)), false);
  } finally { imported.close(); }
  await h.assertOwnerLogin({ dir: site.path, rejectedPassword: "source-password" });
});

test("B refuses a schema-valid archive with multiple workspaces without staging or creating a site", async t => {
  const h = await importFixture(t);
  h.db.$client.prepare("INSERT INTO workspaces (id,slug,name,created_at) VALUES ('second','second','Second',?)").run(stamp);
  const raw = h.db.$client.serialize();
  const archive = await h.archiveWithDatabase(raw);
  const hostile = new Database(raw);
  try { assert.equal((hostile.prepare("SELECT count(*) AS n FROM workspaces").get() as { n: number }).n, 2); } finally { hostile.close(); }
  const upload = await h.backend.upload({ principalId: "recipient", archive });
  await assert.rejects(h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } }), /database|workspace/i);
  assert.deepEqual(h.workspace.registry({}).list({}), []);
  assert.deepEqual(h.started, []);
  assert.deepEqual(fs.readdirSync(path.join(h.root, "sites")), []);
  assert.equal(fs.readdirSync(h.registry.directory).some(name => name.endsWith(".stage") || name.endsWith(".upload.zip")), false);
});
